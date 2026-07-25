from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from finance_server.core.database import get_connection
from finance_server.db import allocation as db
from finance_server.db.settings import get_setting, set_setting


BUCKET_TAGS: dict[str, str] = {
    "bafoeg": "tag.bafoegrueckzahlung",
    "emergency": "tag.notfallfonds",
    "invest": "tag.investieren",
    "donation": "tag.spenden",
}


class AllocationService:
    def get_buckets(self) -> list[dict[str, Any]]:
        return db.list_buckets()

    def update_bucket(self, bucket_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        if "percentage" in payload:
            buckets = db.list_buckets()
            other_sum = sum(
                b["percentage"] for b in buckets
                if b["id"] != bucket_id and b["is_active"] and b["bucket_type"] != "spending"
            )
            if other_sum + payload["percentage"] > 100:
                raise HTTPException(status_code=400, detail="Prozentsätze dürfen 100% nicht überschreiten")
        return db.update_bucket(bucket_id, payload)

    def get_bafoeg_config(self) -> dict[str, Any] | None:
        return db.get_bafoeg_config()

    def update_bafoeg_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        return db.upsert_bafoeg_config(payload)

    def get_settings(self) -> dict[str, Any]:
        return {
            "bafoeg_enabled": get_setting("bafoeg_enabled") == "true",
        }

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "bafoeg_enabled" in payload:
            set_setting("bafoeg_enabled", "true" if payload["bafoeg_enabled"] else "false")
        return self.get_settings()

    def get_or_create_run(self, month: str) -> dict[str, Any]:
        existing = db.get_run_for_month(month)
        if existing:
            return self._build_run_response(existing)

        net_income = self._detect_income(month)
        buckets = [b for b in db.list_buckets() if b["is_active"]]
        active_percentage_sum = db.get_active_buckets_sum_percentage()

        run_id = db.create_run(month, net_income, net_income)

        for bucket in buckets:
            btype = bucket["bucket_type"]
            if btype == "spending":
                pct = max(0, 100 - active_percentage_sum)
            else:
                pct = bucket["percentage"]
            target = round(net_income * pct / 100, 2)
            db.create_run_bucket(run_id, bucket["id"], target)

        run = db.get_run_for_month(month)
        return self._build_run_response(run)

    def _build_run_response(self, run: dict[str, Any]) -> dict[str, Any]:
        buckets = db.get_run_buckets(run["id"])
        config_buckets = db.list_buckets()
        start = f"{run['month']}-01"
        end = f"{run['month']}-31"
        for bucket in buckets:
            tag = BUCKET_TAGS.get(bucket["bucket_type"])
            if tag:
                with get_connection() as conn:
                    row = conn.execute(
                        "SELECT COALESCE(SUM(ABS(amount)), 0) FROM umsaetze WHERE purpose LIKE ? AND date >= ? AND date <= ?",
                        (f"%{tag}%", start, end),
                    ).fetchone()
                bucket["transferred"] = round(bucket["transferred"] + row[0], 2)
        return {
            "month": run["month"],
            "net_income": run["net_income"],
            "total_allocated": run["total_allocated"],
            "remaining": round(run["net_income"] - sum(b["target_amount"] for b in buckets), 2),
            "status": run["status"],
            "buckets": buckets,
            "config": config_buckets,
        }

    def _detect_income(self, month: str) -> float:
        start = f"{month}-01"
        end = f"{month}-31"
        income_category_id = get_setting("income_category_id")
        with get_connection() as connection:
            if income_category_id:
                row = connection.execute(
                    """SELECT COALESCE(SUM(amount), 0)
                       FROM umsaetze
                       WHERE amount > 0 AND kategorie = ?
                         AND date >= ? AND date <= ?""",
                    (int(income_category_id), start, end),
                ).fetchone()
            else:
                row = connection.execute(
                    """SELECT COALESCE(SUM(amount), 0)
                       FROM umsaetze
                       WHERE amount > 0
                         AND date >= ? AND date <= ?
                         AND (purpose LIKE '%Gehalt%' OR purpose LIKE '%Lohn%' OR purpose LIKE '%Auszahlung%')""",
                    (start, end),
                ).fetchone()
        return round(row[0], 2) if row else 0.0

    def transfer_run_bucket(self, run_bucket_id: int) -> dict[str, Any]:
        with get_connection() as connection:
            row = connection.execute(
                """SELECT arb.*, ab.bucket_type, ab.recipient_account_id, ab.sender_iban
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

        recipient_account_id = rb.get("recipient_account_id")
        if not recipient_account_id:
            raise HTTPException(status_code=400, detail="Kein Empfängerkonto konfiguriert")

        with get_connection() as connection:
            recipient = connection.execute(
                "SELECT * FROM empfaengerkonten WHERE id = ?",
                (recipient_account_id,),
            ).fetchone()
        if not recipient:
            raise HTTPException(status_code=400, detail="Empfängerkonto nicht gefunden")

        return {
            "run_bucket_id": run_bucket_id,
            "amount": rb["target_amount"] - rb["transferred"],
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
