from __future__ import annotations

import re
from calendar import monthrange
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.core.feiertage import letzter_arbeitstag
from finance_server.db.settings import get_holiday_state


def list_plans() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM savings_plans ORDER BY created_at"
        ).fetchall()
    return [dict(r) for r in rows]


def get_plan(plan_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM savings_plans WHERE id = ?", (plan_id,)
        ).fetchone()
    return dict(row) if row else None


def create_plan(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    payload["created_at"] = now
    payload["updated_at"] = now
    keys = ", ".join(payload)
    placeholders = ", ".join("?" for _ in payload)
    with get_connection() as connection:
        cursor = connection.execute(
            f"INSERT INTO savings_plans ({keys}) VALUES ({placeholders})",
            list(payload.values()),
        )
        row = dict(connection.execute(
            "SELECT * FROM savings_plans WHERE id = ?", (cursor.lastrowid,)
        ).fetchone())
    from finance_server.services.sync_logger import log_crud_event
    log_crud_event("savings_plans", row["id"], "INSERT", row)
    return row


def update_plan(plan_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    fields = {k: v for k, v in payload.items() if v is not None}
    if not fields:
        return get_plan(plan_id)
    fields["updated_at"] = now
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [plan_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE savings_plans SET {set_clause} WHERE id = ?",
            values,
        )
    result = get_plan(plan_id)
    if result:
        from finance_server.services.sync_logger import log_crud_event
        log_crud_event("savings_plans", plan_id, "UPDATE", result)
    return result


def delete_plan(plan_id: int) -> bool:
    plan = get_plan(plan_id)
    if plan:
        from finance_server.services.sync_logger import log_crud_event
        log_crud_event("savings_plans", plan_id, "DELETE", plan)
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM savings_plans WHERE id = ?", (plan_id,)
        )
        return cursor.rowcount > 0


def _tag_breakdown(tag: str, rows: list[dict[str, Any]]) -> dict[str, float]:
    result = {"einzahlungen": 0.0, "entnahmen": 0.0}
    for row in rows:
        amount = row["amount"]
        if amount < 0:
            result["einzahlungen"] += abs(amount)
        else:
            result["entnahmen"] += amount
    result["saldo"] = result["einzahlungen"] - result["entnahmen"]
    return result


def _tag_balance(tag: str, rows: list[dict[str, Any]]) -> float:
    return _tag_breakdown(tag, rows)["saldo"]


def get_saved_amount(tag: str) -> float:
    return get_saved_breakdown(tag)["saldo"]


def get_month_amount(tag: str, month: str) -> float:
    return get_month_breakdown(tag, month)["saldo"]


def get_bafoeg_breakdown() -> dict[str, float]:
    with get_connection() as connection:
        ein_rows = connection.execute(
            """SELECT amount, purpose, note FROM umsaetze
               WHERE ((' ' || COALESCE(purpose, '') || ' ') LIKE '% tag.bafoegschulden %'
                  OR (' ' || COALESCE(note, '') || ' ') LIKE '% tag.bafoegschulden %')
                 AND amount < 0""",
        ).fetchall()
        ent_rows = connection.execute(
            """SELECT amount, purpose, note FROM umsaetze
               WHERE ((' ' || COALESCE(purpose, '') || ' ') LIKE '% tag.bafoegschulden.entnahme %'
                  OR (' ' || COALESCE(note, '') || ' ') LIKE '% tag.bafoegschulden.entnahme %')
                 AND amount > 0""",
        ).fetchall()
        tilg_rows = connection.execute(
            """SELECT amount, purpose, note FROM umsaetze
               WHERE ((' ' || COALESCE(purpose, '') || ' ') LIKE '% tag.bafoegschulden.entnahme %'
                  OR (' ' || COALESCE(note, '') || ' ') LIKE '% tag.bafoegschulden.entnahme %')
                 AND amount < 0""",
        ).fetchall()
    breakdown = _tag_breakdown("tag.bafoegschulden", ein_rows)
    entnahmen = sum(r["amount"] for r in ent_rows) if ent_rows else 0.0
    tilgungen = sum(abs(r["amount"]) for r in tilg_rows) if tilg_rows else 0.0
    breakdown["entnahmen"] = round(entnahmen, 2)
    breakdown["tilgungen"] = round(tilgungen, 2)
    breakdown["saldo"] = round(breakdown["einzahlungen"] - entnahmen + tilgungen, 2)
    return breakdown


def get_saved_breakdown(tag: str) -> dict[str, float]:
    tag_pattern = tag if tag.startswith("tag.") else f"tag.{tag}"
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT amount, purpose FROM umsaetze WHERE purpose LIKE ? OR note LIKE ?",
            (f"%{tag_pattern}%", f"%{tag_pattern}%"),
        ).fetchall()
    return _tag_breakdown(tag, rows)


def get_month_breakdown(tag: str, month: str) -> dict[str, float]:
    tag_pattern = tag if tag.startswith("tag.") else f"tag.{tag}"
    month_start = f"{month}-01"
    month_end = f"{month}-31"
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT amount, purpose FROM umsaetze WHERE (purpose LIKE ? OR note LIKE ?) AND date >= ? AND date <= ?",
            (f"%{tag_pattern}%", f"%{tag_pattern}%", month_start, month_end),
        ).fetchall()
    return _tag_breakdown(tag, rows)


def _tag_with_space(tag: str) -> str:
    return tag if tag.startswith("tag.") else f"tag.{tag}"


def _savings_breakdown(tag: str, month: str | None = None) -> dict[str, float]:
    tag_pattern = _tag_with_space(tag)
    base_like = f"%{tag_pattern}%"
    entnahme_like = f"%{tag_pattern}.entnahme%"
    where = "(COALESCE(purpose, '') LIKE ? OR COALESCE(note, '') LIKE ?) AND COALESCE(purpose, '') NOT LIKE ? AND COALESCE(note, '') NOT LIKE ?"
    params: list[Any] = [base_like, base_like, entnahme_like, entnahme_like]
    if month:
        where += " AND date >= ? AND date <= ?"
        params += [f"{month}-01", f"{month}-31"]
    with get_connection() as connection:
        base_rows = connection.execute(f"SELECT amount FROM umsaetze WHERE {where}", params).fetchall()
        ent_rows = connection.execute(
            "SELECT amount FROM umsaetze WHERE (COALESCE(purpose, '') LIKE ? OR COALESCE(note, '') LIKE ?)"
            + (f" AND date >= ? AND date <= ?" if month else ""),
            [entnahme_like, entnahme_like] + ([f"{month}-01", f"{month}-31"] if month else []),
        ).fetchall()
    einzahlungen = sum(abs(r["amount"]) for r in base_rows if r["amount"] < 0)
    verschuldung = sum(r["amount"] for r in base_rows if r["amount"] > 0)
    entnahmen = sum(r["amount"] for r in ent_rows if r["amount"] > 0)
    return {
        "einzahlungen": round(einzahlungen, 2),
        "verschuldung": round(verschuldung, 2),
        "entnahmen": round(entnahmen, 2),
        "saldo": round(einzahlungen - verschuldung - entnahmen, 2),
    }


def get_savings_breakdown(tag: str) -> dict[str, float]:
    return _savings_breakdown(tag)


def get_savings_month_breakdown(tag: str, month: str) -> dict[str, float]:
    return _savings_breakdown(tag, month)


def get_income_payout_days(month: str) -> list[int]:
    parts = month.split("-")
    m = int(parts[1]) - 3
    y = int(parts[0])
    if m <= 0:
        m += 12
        y -= 1
    lookback_start = f"{y}-{m:02d}-01"
    month_end = f"{month}-31"

    with get_connection() as connection:
        rows = connection.execute(
            """SELECT applicant_name, purpose, date
               FROM umsaetze
               WHERE amount > 0
                 AND date >= ? AND date <= ?
                 AND (COALESCE(purpose, '') NOT LIKE '%tag.%' AND COALESCE(note, '') NOT LIKE '%tag.%')
               ORDER BY applicant_name, purpose, date""",
            (lookback_start, month_end),
        ).fetchall()

    groups: dict[str, list[str]] = {}
    for row in rows:
        name = (row["applicant_name"] or "").strip().lower()
        purpose = (row["purpose"] or "").strip().lower()
        purpose_clean = re.sub(r"[^a-zäöüß]", "", purpose)
        if not name or not purpose_clean:
            continue
        groups.setdefault(f"{name} | {purpose_clean}", []).append(row["date"])

    state = get_holiday_state()
    days: set[int] = set()
    for dates in groups.values():
        classified = _classify_group(dates, state)
        if classified is not None:
            days.add(classified)

    return sorted(days) if days else [1]


def _classify_group(dates: list[str], state: str) -> int | None:
    """-1 for last-working-day payouts, else fixed day-of-month; None if not recurring."""
    if len(dates) < 3:
        return None
    parsed = [datetime.strptime(d, "%Y-%m-%d").date() for d in sorted(dates)]
    for i in range(1, len(parsed)):
        if abs((parsed[i] - parsed[i - 1]).days - 30) > 5:
            return None
    last3 = parsed[-3:]
    if all(d == letzter_arbeitstag(state, d.year, d.month) for d in last3):
        return -1
    return min(last3[-1].day, 28)


def count_income_events_until(
    target_date: str, payout_days: list[int], from_date: str | None = None, min_result: int = 1
) -> int:
    now = datetime.strptime(from_date, "%Y-%m-%d").date() if from_date else datetime.now().date()
    td = datetime.strptime(target_date, "%Y-%m-%d").date()
    if td <= now:
        return min_result
    state = get_holiday_state()
    result = 0
    cursor = now.replace(day=1)
    end = td.replace(day=1)
    while cursor <= end:
        candidates = [
            letzter_arbeitstag(state, cursor.year, cursor.month)
            if day < 0
            else cursor.replace(day=min(day, monthrange(cursor.year, cursor.month)[1]))
            for day in payout_days
        ]
        pd = max(candidates)
        if now <= pd <= td:
            result += 1
        y = cursor.year + (cursor.month // 12)
        m = cursor.month % 12 + 1
        cursor = cursor.replace(year=y, month=m)
    return max(min_result, result)
