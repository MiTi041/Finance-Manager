from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from finance_server.core.database import get_connection
from finance_server.core.feiertage import BUNDESLAENDER, holiday_dates
from finance_server.db import allocation as db
from finance_server.db.references import get_zahlungspartner_by_iban
from finance_server.db.savings import (
    list_plans, create_plan, update_plan, delete_plan, get_plan,
    get_saved_amount, get_month_amount,
    get_saved_breakdown, get_month_breakdown,
    get_income_payout_days, count_income_events_until,
    get_bafoeg_breakdown,
)
from finance_server.db.settings import get_setting, set_setting, get_holiday_state
from finance_server.services.sync_logger import log_crud_event


BUCKET_TAGS: dict[str, str] = {
    "bafoeg": "tag.bafoegschulden",
    "emergency": "tag.notfallfonds",
    "invest": "tag.investieren",
    "donation": "tag.spenden",
}


class AllocationService:
    def get_buckets(self) -> list[dict[str, Any]]:
        return db.list_buckets()

    def update_bucket(self, bucket_id: int, payload: dict[str, Any], set_null: list[str] | None = None) -> dict[str, Any] | None:
        if "percentage" in payload:
            buckets = db.list_buckets()
            other_sum = sum(
                b["percentage"] for b in buckets
                if b["id"] != bucket_id and b["is_active"] and b["bucket_type"] != "spending"
            )
            if other_sum + payload["percentage"] > 100:
                raise HTTPException(status_code=400, detail="Prozentsätze dürfen 100% nicht überschreiten")
        if set_null:
            for k in set_null:
                payload.pop(k, None)
        return db.update_bucket(bucket_id, payload, set_null)

    def get_bafoeg_config(self) -> dict[str, Any] | None:
        return db.get_bafoeg_config()

    def update_bafoeg_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        return db.upsert_bafoeg_config(payload)

    def get_settings(self) -> dict[str, Any]:
        return {
            "bafoeg_enabled": get_setting("bafoeg_enabled") == "true",
            "holiday_state": get_holiday_state(),
            "holiday_states": [{"code": code, "name": name} for code, name in BUNDESLAENDER.items()],
        }

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "bafoeg_enabled" in payload:
            was_enabled = get_setting("bafoeg_enabled") == "true"
            if was_enabled != payload["bafoeg_enabled"]:
                previous = get_setting("bafoeg_enabled")
                value = "true" if payload["bafoeg_enabled"] else "false"
                set_setting("bafoeg_enabled", value)
                db.set_bucket_active_by_type("bafoeg", payload["bafoeg_enabled"])
                # ponytail: runs aren't synced, so dropping the current month's run
                # just makes the next /status fetch recreate it with the new setting
                db.delete_run(datetime.now().strftime("%Y-%m"))
                log_crud_event(
                    "app_settings",
                    None,
                    "INSERT" if previous is None else "UPDATE",
                    {
                        "key": "bafoeg_enabled",
                        "value": value,
                        "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                    },
                )
        if "holiday_state" in payload:
            state = payload["holiday_state"]
            if state not in BUNDESLAENDER:
                raise HTTPException(status_code=400, detail=f"Unbekanntes Bundesland: {state}")
            set_setting("holiday_state", state)
            # payout-day detection depends on the holiday calendar → drop current run
            db.delete_run(datetime.now().strftime("%Y-%m"))
        return self.get_settings()

    def get_or_create_run(self, month: str, force: bool = False) -> dict[str, Any]:
        # ponytail: legacy clean-up — savings plans are never auto-hidden anymore,
        # so re-show any that still carry the old flag.
        for plan in list_plans():
            if plan.get("auto_hidden"):
                update_plan(plan["id"], {"is_visible": True, "auto_hidden": False})

        existing = db.get_run_for_month(month)
        if existing:
            if force:
                db.delete_run(month)
            else:
                return self._build_run_response(existing)

        net_income = self._detect_income(month)
        run_id = db.create_run(month, net_income, net_income)
        all_buckets = db.list_buckets()

        # Pinned: BAföG bucket (fixed monthly rate, not percentage-based)
        bafoeg_amount = 0.0
        if get_setting("bafoeg_enabled") == "true":
            bafoeg_config = db.get_bafoeg_config()
            if bafoeg_config:
                bafoeg_amount = bafoeg_config["monthly_rate"]
                bafoeg_bucket = next((b for b in all_buckets if b["bucket_type"] == "bafoeg"), None)
                if bafoeg_bucket:
                    db.create_run_bucket(run_id, bafoeg_bucket["id"], bafoeg_amount)

        # Effective income = net_income minus pinned fixed amounts
        effective = net_income - bafoeg_amount
        active = [b for b in all_buckets if b["is_active"] and b["bucket_type"] != "bafoeg"]

        # Donation from effective (before savings plans)
        donation_config = next((b for b in active if b["bucket_type"] == "donation"), None)
        donation_target = 0.0
        if donation_config:
            donation_target = round(effective * donation_config["percentage"] / 100, 2)
            db.create_run_bucket(run_id, donation_config["id"], donation_target)

        # Savings plans are always counted, never auto-hidden: the user may
        # fund them from existing balance. If their total exceeds the budget,
        # the remaining buckets simply get nothing that month.
        available_for_savings = effective - donation_target
        all_plans = sorted(list_plans(), key=lambda p: p["created_at"])
        savings_total = sum(self._enrich_savings_plan(p, month)["monthly_rate"] for p in all_plans)

        # Remaining after donation and savings plans → invest, emergency.
        # Clamp so buckets never receive negative targets.
        remaining = max(0.0, effective - donation_target - savings_total)
        bucket_sum = 0.0
        for bucket in active:
            if bucket["bucket_type"] in ("donation", "spending"):
                continue
            target = round(remaining * bucket["percentage"] / 100, 2)
            bucket_sum += target
            db.create_run_bucket(run_id, bucket["id"], target)

        # Spending = what's left of remaining
        spending_config = next((b for b in active if b["bucket_type"] == "spending"), None)
        if spending_config:
            db.create_run_bucket(run_id, spending_config["id"], round(remaining - bucket_sum, 2))

        run = db.get_run_for_month(month)
        return self._build_run_response(run)

    def _build_run_response(self, run: dict[str, Any], auto_hidden: list[int] | None = None) -> dict[str, Any]:
        buckets = db.get_run_buckets(run["id"])
        config_buckets = db.list_buckets()
        start = f"{run['month']}-01"
        end = f"{run['month']}-31"
        for bucket in buckets:
            tag = BUCKET_TAGS.get(bucket["bucket_type"])
            if tag:
                with get_connection() as conn:
                    row = conn.execute(
                        """SELECT COALESCE(SUM(
                            CASE
                                WHEN amount > 0 AND refund_ref_transaction_id IS NOT NULL THEN 0
                                WHEN amount < 0 THEN ABS(amount) - COALESCE(refund_total, 0)
                                ELSE ABS(amount)
                            END
                        ), 0) FROM umsaetze WHERE purpose LIKE ? AND date >= ? AND date <= ?""",
                        (f"%{tag}%", start, end),
                    ).fetchone()
                bucket["transferred"] = round(bucket["transferred"] + row[0], 2)
                if bucket["bucket_type"] == "emergency":
                    breakdown = get_saved_breakdown(tag)
                    month_breakdown = get_month_breakdown(tag, run["month"])
                    bucket["saved_total"] = round(breakdown["saldo"], 2)
                    bucket["saved_einzahlungen"] = round(breakdown["einzahlungen"], 2)
                    bucket["saved_entnahmen"] = round(breakdown["entnahmen"], 2)
                    bucket["month_einzahlungen"] = round(month_breakdown["einzahlungen"], 2)
                    cfg = next((c for c in config_buckets if c["id"] == bucket["bucket_id"]), None)
                    if cfg:
                        monthly_rate = bucket["target_amount"]
                        if cfg.get("target_months") and cfg["target_months"] > 0:
                            bucket["goal_amount"] = round(run["net_income"] * cfg["target_months"], 2)
                        elif cfg.get("target_amount") and cfg["target_amount"] > 0:
                            bucket["goal_amount"] = cfg["target_amount"]
                        if bucket.get("goal_amount") and monthly_rate > 0:
                            remaining = max(0, bucket["goal_amount"] - bucket["saved_total"])
                            bucket["months_left"] = math.ceil(remaining / monthly_rate)
                if bucket["bucket_type"] == "bafoeg":
                    from datetime import date
                    from finance_server.services.zins_service import berechne_monatsrate
                    breakdown = get_bafoeg_breakdown()
                    with get_connection() as conn:
                        month_rows = conn.execute(
                            """SELECT amount FROM umsaetze
                               WHERE ((' ' || COALESCE(purpose, '') || ' ') LIKE '% tag.bafoegschulden %'
                                  OR (' ' || COALESCE(note, '') || ' ') LIKE '% tag.bafoegschulden %')
                                 AND amount < 0 AND date >= ? AND date <= ?""",
                            (f"{run['month']}-01", f"{run['month']}-31"),
                        ).fetchall()
                    month_einz = sum(abs(r["amount"]) for r in month_rows)
                    bafoeg_cfg = db.get_bafoeg_config()
                    seed = bafoeg_cfg.get("current_balance", 0) if bafoeg_cfg else 0
                    bucket["saved_total"] = round(seed + breakdown["einzahlungen"], 2)
                    bucket["saved_einzahlungen"] = round(breakdown["einzahlungen"], 2)
                    bucket["saved_entnahmen"] = round(breakdown["entnahmen"], 2)
                    bucket["saved_tilgungen"] = round(breakdown.get("tilgungen", 0), 2)
                    bucket["month_einzahlungen"] = round(month_einz, 2)
                    if bafoeg_cfg:
                        total_debt = bafoeg_cfg.get("total_debt", 7600)
                        bucket["goal_amount"] = total_debt
                        bucket["interest_rate"] = bafoeg_cfg.get("interest_rate", 2.0)
                        payout = bafoeg_cfg.get("payout_date")
                        bucket["payout_date"] = payout
                        if payout:
                            payout_date = datetime.strptime(payout, "%Y-%m-%d").date()
                            start_date = datetime.strptime(f"{run['month']}-01", "%Y-%m-%d").date()
                            # ponytail: +1 income event (last month's salary already funds the
                            # current rate) → amortize over one extra payout, starting a month earlier
                            y, m = int(run["month"].split("-")[0]), int(run["month"].split("-")[1]) - 1
                            if m <= 0:
                                m += 12
                                y -= 1
                            rate_start = date(y, m, 1)
                            zinsverlauf = [
                                {"datum": date(2025, 7, 6), "zinssatz": 0.02},
                                {"datum": date(2026, 4, 29), "zinssatz": 0.02},
                                {"datum": date(2027, 1, 1), "zinssatz": 0.025},
                            ]
                            zinsverlauf.append({"datum": rate_start, "zinssatz": bafoeg_cfg.get("interest_rate", 2.0) / 100})
                            payout_days = get_income_payout_days(run["month"])
                            future = count_income_events_until(payout, payout_days, f"{run['month']}-01", min_result=0)
                            bucket["future_income_events"] = future
                            bucket["income_events_left"] = max(1, future + 1)
                            outstanding = max(0, (breakdown["entnahmen"] or 0) - (breakdown.get("tilgungen", 0) or 0))
                            req_rate = berechne_monatsrate(bucket["saved_total"] + outstanding, total_debt, zinsverlauf, rate_start, payout_date, payout_days=payout_days)
                            bucket["required_monthly_rate"] = round(req_rate, 2)
                            bucket["months_left"] = bucket["income_events_left"]
                if bucket["bucket_type"] == "invest":
                    breakdown = get_saved_breakdown(tag)
                    bucket["saved_einzahlungen"] = round(breakdown["einzahlungen"], 2)
                    bucket["saved_entnahmen"] = round(breakdown["entnahmen"], 2)
                    net = round(breakdown["saldo"], 2)
                    if net < 0:
                        bucket["saved_total"] = 0.0
                        bucket["saved_profit"] = round(abs(net), 2)
                    else:
                        bucket["saved_total"] = net
                        bucket["saved_profit"] = 0.0
            if bucket["bucket_type"] == "spending":
                exclude_tags = [
                    "tag.bafoegrueckzahlung",
                    "tag.bafoegruecklagenschulden",
                    "tag.notfallfonds",
                    "tag.investieren",
                    "tag.spenden",
                    "tag.bafoegschulden",
                ]
                for plan in list_plans():
                    t = plan.get("tag")
                    if t:
                        tag = t if t.startswith("tag.") else f"tag.{t}"
                        if tag not in exclude_tags:
                            exclude_tags.append(tag)
                conditions = " AND ".join("purpose NOT LIKE ?" for _ in exclude_tags)
                params = [start, end] + [f"%{t}%" for t in exclude_tags]
                with get_connection() as conn:
                    row = conn.execute(
                        f"""SELECT COALESCE(SUM(ABS(amount) - COALESCE(refund_total, 0)), 0) FROM umsaetze
                           WHERE amount < 0 AND date >= ? AND date <= ?
                           AND (purpose IS NULL OR ({conditions}))""",
                        params,
                    ).fetchone()
                bucket["spent"] = round(row[0], 2) if row else 0.0
                bucket["available"] = round(max(0.0, bucket["target_amount"] - bucket["spent"]), 2)
        plans = list_plans()
        savings_plans = [self._enrich_savings_plan(p, run["month"]) for p in plans]
        savings_total = sum(p["monthly_rate"] for p in savings_plans if p["is_visible"])
        total_bucket_sum = round(sum(b["target_amount"] for b in buckets if b["bucket_type"] != "spending"), 2)
        allocated = round(total_bucket_sum + savings_total, 2)

        bafoeg_amount = 0.0
        bafoeg_bucket = next((b for b in buckets if b["bucket_type"] == "bafoeg"), None)
        if bafoeg_bucket:
            bafoeg_amount = bafoeg_bucket["target_amount"]
        donation_bucket = next((b for b in buckets if b["bucket_type"] == "donation"), None)
        donation_target = donation_bucket["target_amount"] if donation_bucket else 0.0
        available_for_savings = round(run["net_income"] - bafoeg_amount - donation_target, 2)

        return {
            "month": run["month"],
            "net_income": run["net_income"],
            "income_sources": self._detect_income_breakdown(run["month"])["sources"],
            "total_allocated": allocated,
            "remaining": round(run["net_income"] - allocated, 2),
            "status": run["status"],
            "buckets": buckets,
            "config": config_buckets,
            "savings_total": savings_total,
            "savings_plans": savings_plans,
            "auto_hidden_plan_ids": [],
            "available_for_savings": available_for_savings,
            "payout_days": get_income_payout_days(run["month"]),
            "holidays": holiday_dates(get_holiday_state(), datetime.now().year - 1, datetime.now().year + 20),
        }

    def _detect_income(self, month: str) -> float:
        return self._detect_income_breakdown(month)["total"]

    def _detect_income_breakdown(self, month: str) -> dict[str, Any]:
        """Recurring income detection matching finance_local (3-month lookback, group by counterparty+purpose, 3+ occurrences, ~30d cadence)."""
        start_parts = month.split("-")
        m = int(start_parts[1]) - 3
        y = int(start_parts[0])
        if m <= 0:
            m += 12
            y -= 1
        lookback_start = f"{y}-{m:02d}-01"
        month_end = f"{month}-31"

        with get_connection() as conn:
            rows = conn.execute(
                """SELECT applicant_name, purpose, amount, date
                   FROM umsaetze
                   WHERE amount > 0
                     AND refund_ref_transaction_id IS NULL
                     AND date >= ? AND date <= ?
                     AND (purpose IS NULL OR purpose NOT LIKE '%tag.%')
                   ORDER BY applicant_name, purpose, date""",
                (lookback_start, month_end),
            ).fetchall()

        groups: dict[str, list[tuple[float, str, str, str]]] = {}
        for row in rows:
            name = (row["applicant_name"] or "").strip()
            purpose = (row["purpose"] or "").strip()
            purpose_clean = re.sub(r"[^a-zäöüß]", "", purpose.lower())
            if not name or not purpose_clean:
                continue
            groups.setdefault(f"{name.lower()} | {purpose_clean}", []).append(
                (row["amount"], row["date"], name, purpose)
            )

        total = 0.0
        sources: list[dict[str, Any]] = []
        for txs in groups.values():
            if len(txs) < 3:
                continue
            txs.sort(key=lambda t: t[1])
            recurring = True
            for i in range(1, len(txs)):
                d1 = datetime.strptime(txs[i - 1][1], "%Y-%m-%d").date()
                d2 = datetime.strptime(txs[i][1], "%Y-%m-%d").date()
                if abs((d2 - d1).days - 30) > 5:
                    recurring = False
                    break
            if recurring:
                total += txs[-1][0]
                _, _, name, purpose = txs[-1]
                sources.append({
                    "name": name,
                    "purpose": purpose,
                    "amount": round(txs[-1][0], 2),
                    "count": len(txs),
                    "transactions": [
                        {"date": t[1], "amount": round(t[0], 2)} for t in txs
                    ],
                })

        return {"total": round(total, 2), "sources": sources}

    def _check_sender_balance(self, sender_iban: str | None, amount: float) -> None:
        if not sender_iban:
            return
        with get_connection() as conn:
            tx_row = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS balance FROM umsaetze WHERE UPPER(account_iban) = UPPER(?)",
                (sender_iban,),
            ).fetchone()
            corr_row = conn.execute(
                "SELECT balance FROM bank_accounts WHERE UPPER(iban) = UPPER(?) LIMIT 1",
                (sender_iban,),
            ).fetchone()
        balance = float(tx_row["balance"] or 0) + float(corr_row["balance"] if corr_row else 0)
        if balance < amount:
            raise HTTPException(
                status_code=400,
                detail=f"Kontostand ({balance:.2f} €) reicht nicht aus für Überweisung ({amount:.2f} €)",
            )

    def transfer_run_bucket(self, run_bucket_id: int, custom_amount: float | None = None) -> dict[str, Any]:
        with get_connection() as connection:
            row = connection.execute(
                """SELECT arb.*, ab.bucket_type, ab.recipient_account_id, ab.recipient_iban, ab.sender_iban
                   FROM allocation_run_buckets arb
                   JOIN allocation_buckets ab ON ab.id = arb.bucket_id
                   WHERE arb.id = ?""",
                (run_bucket_id,),
            ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Run-Bucket nicht gefunden")

        rb = dict(row)
        if rb["is_completed"]:
            raise HTTPException(status_code=400, detail="Dieser Bucket wurde bereits überwiesen")

        remaining = rb["target_amount"] - rb["transferred"]
        if custom_amount is not None:
            if custom_amount <= 0:
                raise HTTPException(status_code=400, detail="Betrag muss positiv sein")
            if rb["bucket_type"] != "bafoeg" and custom_amount > remaining:
                raise HTTPException(status_code=400, detail="Betrag überschreitet den offenen Betrag")
            amount = custom_amount
        else:
            amount = remaining
        self._check_sender_balance(rb.get("sender_iban"), amount)

        if rb["bucket_type"] == "donation":
            with get_connection() as connection:
                accounts = connection.execute(
                    "SELECT * FROM empfaengerkonten WHERE is_donation_account = 1"
                ).fetchall()
            if not accounts:
                raise HTTPException(status_code=400, detail="Kein Spendenkonto konfiguriert")
            recipient = dict(accounts[run_bucket_id % len(accounts)])
        else:
            recipient_iban = rb.get("recipient_iban")
            if recipient_iban:
                with get_connection() as connection:
                    bank_row = connection.execute(
                        "SELECT iban, account_name FROM bank_accounts WHERE UPPER(iban) = UPPER(?)",
                        (recipient_iban,),
                    ).fetchone()
                if not bank_row:
                    raise HTTPException(status_code=400, detail="Empfänger-Bankkonto nicht gefunden")
                recipient = {
                    "iban": bank_row["iban"],
                    "recipient_name": bank_row["account_name"] or bank_row["iban"],
                    "bic": None,
                }
            else:
                recipient_account_id = rb.get("recipient_account_id")
                if not recipient_account_id:
                    raise HTTPException(status_code=400, detail="Kein Empfängerkonto konfiguriert")

                with get_connection() as connection:
                    recipient_row = connection.execute(
                        "SELECT * FROM empfaengerkonten WHERE id = ?",
                        (recipient_account_id,),
                    ).fetchone()
                if not recipient_row:
                    raise HTTPException(status_code=400, detail="Empfängerkonto nicht gefunden")
                recipient = dict(recipient_row)

        return {
            "run_bucket_id": run_bucket_id,
            "amount": amount,
            "recipient_iban": recipient["iban"],
            "recipient_name": recipient["recipient_name"],
            "recipient_bic": recipient.get("bic"),
            "sender_iban": rb.get("sender_iban"),
            "purpose": f"Allokation {rb['bucket_type']} {BUCKET_TAGS.get(rb['bucket_type'], '')}".strip(),
        }

    def mark_transferred(self, run_bucket_id: int, amount: float) -> None:
        db.mark_run_bucket_transferred(run_bucket_id, amount)

    def get_history(self) -> list[dict[str, Any]]:
        runs = db.list_runs()
        result = []
        for run in runs:
            buckets = db.get_run_buckets(run["id"])
            result.append({
                "id": run["id"],
                "month": run["month"],
                "net_income": run["net_income"],
                "status": run["status"],
                "buckets": buckets,
            })
        return result

    def get_donation_analytics(self) -> dict[str, Any]:
        with get_connection() as conn:
            accounts = [
                dict(r) for r in conn.execute(
                    "SELECT * FROM empfaengerkonten WHERE is_donation_account = 1"
                ).fetchall()
            ]
            ibans = [a["iban"] for a in accounts]
            placeholders = ",".join("?" for _ in ibans) if ibans else "''"
            rows = conn.execute(
                f"""SELECT id, amount, applicant_iban, applicant_name, recipient_name, purpose, date
                    FROM umsaetze
                    WHERE amount < 0
                      AND (purpose LIKE '%tag.spenden%'
                           {'OR UPPER(applicant_iban) IN (' + placeholders + ')' if ibans else ''})
                    ORDER BY date DESC""",
                ibans if ibans else [],
            ).fetchall()

        matched: dict[int, dict[str, Any]] = {}
        other_total = 0.0
        other_count = 0
        for row in rows:
            t = dict(row)
            acc = None
            for a in accounts:
                if a["iban"].upper() == (t.get("applicant_iban") or "").upper():
                    acc = a
                    break
            if not acc:
                purpose = (t.get("purpose") or "").lower()
                rname = (t.get("recipient_name") or "").lower()
                aname = (t.get("applicant_name") or "").lower()
                for a in accounts:
                    rn = (a["recipient_name"] or "").lower()
                    if rn and (rn in purpose or rn in rname or rn in aname):
                        acc = a
                        break
            if acc:
                aid = acc["id"]
                if aid not in matched:
                    matched[aid] = {**acc, "total": 0.0, "count": 0}
                matched[aid]["total"] += abs(t["amount"])
                matched[aid]["count"] += 1
            else:
                other_total += abs(t["amount"])
                other_count += 1

        breakdown = []
        for entry in matched.values():
            partner = get_zahlungspartner_by_iban(entry["iban"])
            breakdown.append({
                "account_name": entry["account_name"],
                "recipient_name": entry["recipient_name"],
                "iban": entry["iban"],
                "total": round(entry["total"], 2),
                "count": entry["count"],
                "logo_url": partner["logo_url"] if partner else None,
                "logo_white_background": bool(partner["logo_white_background"]) if partner else False,
                "logo_padding": bool(partner["logo_padding"]) if partner else False,
            })
        breakdown.sort(key=lambda x: x["total"], reverse=True)

        total = round(sum(b["total"] for b in breakdown) + other_total, 2)
        return {
            "accounts": breakdown,
            "others": {"total": round(other_total, 2), "count": other_count} if other_count > 0 else None,
            "total": total,
        }

    def _enrich_savings_plan(self, plan: dict[str, Any], month: str | None = None) -> dict[str, Any]:
        tag = plan.get("tag")
        target_amount = plan.get("target_amount")
        target_date = plan.get("target_date")
        payout_days = get_income_payout_days(month) if month else [1]
        saved_breakdown = get_saved_breakdown(tag) if tag else {}
        month_breakdown = get_month_breakdown(tag, month) if tag and month else {}
        saved_amount = saved_breakdown.get("saldo", 0.0)
        this_month = month_breakdown.get("saldo", 0.0)
        target_amount_f = target_amount if target_amount else 0.0
        from_date = f"{month}-01" if month else None
        partner = (
            get_zahlungspartner_by_iban(plan.get("target_recipient_iban"))
            if plan.get("target_recipient_iban")
            else None
        )

        required_rate = None
        income_events_left = None
        if target_amount and target_date:
            saved_before_this = max(0.0, saved_amount - this_month)
            remaining = max(0.0, target_amount_f - saved_before_this)
            future = count_income_events_until(target_date, payout_days, from_date, min_result=0)
            # ponytail: +1 income event once the plan has been running for a month — the
            # salary that arrived last month already funds the current month's rate
            bonus = 0 if month and (plan.get("created_at") or "")[:7] == month else 1
            income_events_left = max(1, future + bonus)
            required_rate = 0.0 if remaining == 0.0 else round(remaining / income_events_left, 2)
        else:
            required_rate = None if not target_amount else 0.0

        return {
            **plan,
            "monthly_rate": required_rate if required_rate is not None else 0.0,
            "saved_amount": saved_amount,
            "this_month": this_month,
            "required_monthly_rate": required_rate,
            "income_events_left": income_events_left,
            "future_income_events": future,
            "recipient_logo_url": partner["logo_url"] if partner else None,
            "recipient_logo_white_background": bool(partner["logo_white_background"]) if partner else False,
            "recipient_logo_padding": bool(partner["logo_padding"]) if partner else False,
            "saved_einzahlungen": saved_breakdown.get("einzahlungen", 0.0),
            "saved_entnahmen": saved_breakdown.get("entnahmen", 0.0),
            "month_einzahlungen": month_breakdown.get("einzahlungen", 0.0),
            "month_entnahmen": month_breakdown.get("entnahmen", 0.0),
        }

    def list_savings_plans(self, month: str | None = None) -> list[dict[str, Any]]:
        plans = list_plans()
        return [self._enrich_savings_plan(p, month) for p in plans]

    def create_savings_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return create_plan(payload)

    def update_savings_plan(self, plan_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        return update_plan(plan_id, payload)

    def delete_savings_plan(self, plan_id: int) -> bool:
        return delete_plan(plan_id)

    def transfer_savings_plan(self, plan_id: int, month: str | None = None, amount: float | None = None) -> dict[str, Any]:
        target_month = month or datetime.now().strftime("%Y-%m")
        plan = get_plan(plan_id)

        if not plan:
            raise HTTPException(status_code=404, detail="Sparplan nicht gefunden")

        enriched = self._enrich_savings_plan(plan, target_month)

        if not enriched.get("target_recipient_iban") or not enriched.get("target_recipient_name"):
            raise HTTPException(status_code=400, detail="Zahlungsdaten des Sparplans unvollständig")

        target_amount = enriched.get("target_amount")
        saved_amount = enriched.get("saved_amount", 0)

        if amount is not None:
            if amount <= 0:
                raise HTTPException(status_code=400, detail="Betrag muss positiv sein")
            if target_amount and amount > max(0, target_amount - saved_amount):
                raise HTTPException(status_code=400, detail="Betrag überschreitet das Sparziel")
            use_amount = amount
        else:
            required_rate = enriched.get("required_monthly_rate")
            month_einzahlungen = enriched.get("month_einzahlungen", 0)
            if required_rate is None:
                raise HTTPException(status_code=400, detail="Keine fällige Rate für diesen Monat")
            use_amount = max(0, required_rate - month_einzahlungen)
            if use_amount <= 0:
                raise HTTPException(status_code=400, detail="Monatsziel bereits erreicht")

        self._check_sender_balance(plan.get("sender_iban"), use_amount)

        tag = enriched.get("tag", "")
        purpose = f"Sparplan {enriched['name']}"
        if tag:
            tag_clean = tag if tag.startswith("tag.") else f"tag.{tag}"
            purpose += f" {tag_clean}"

        return {
            "plan_id": plan_id,
            "amount": use_amount,
            "recipient_iban": enriched["target_recipient_iban"],
            "recipient_name": enriched["target_recipient_name"],
            "recipient_bic": enriched.get("target_recipient_bic"),
            "sender_iban": plan.get("sender_iban"),
            "sender_name": plan.get("sender_name"),
            "purpose": purpose,
        }
