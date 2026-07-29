from __future__ import annotations

import re
from calendar import monthrange
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection


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
        return dict(connection.execute(
            "SELECT * FROM savings_plans WHERE id = ?", (cursor.lastrowid,)
        ).fetchone())


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
    return get_plan(plan_id)


def delete_plan(plan_id: int) -> bool:
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
            "SELECT amount, purpose FROM umsaetze WHERE purpose LIKE ?",
            (f"%{tag_pattern}%",),
        ).fetchall()
    return _tag_breakdown(tag, rows)


def get_month_breakdown(tag: str, month: str) -> dict[str, float]:
    tag_pattern = tag if tag.startswith("tag.") else f"tag.{tag}"
    month_start = f"{month}-01"
    month_end = f"{month}-31"
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT amount, purpose FROM umsaetze WHERE purpose LIKE ? AND date >= ? AND date <= ?",
            (f"%{tag_pattern}%", month_start, month_end),
        ).fetchall()
    return _tag_breakdown(tag, rows)


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
                 AND (purpose IS NULL OR purpose NOT LIKE '%tag.%')
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

    days: set[int] = set()
    for dates in groups.values():
        if len(dates) < 3:
            continue
        dates_sorted = sorted(dates)
        recurring = True
        for i in range(1, len(dates_sorted)):
            d1 = datetime.strptime(dates_sorted[i - 1], "%Y-%m-%d").date()
            d2 = datetime.strptime(dates_sorted[i], "%Y-%m-%d").date()
            if abs((d2 - d1).days - 30) > 5:
                recurring = False
                break
        if recurring:
            for d in dates_sorted[-3:]:
                day = datetime.strptime(d, "%Y-%m-%d").date().day
                if day >= 1 and day <= 28:
                    days.add(day)
                else:
                    days.add(28)

    return sorted(days) if days else [1]


def count_income_events_until(target_date: str, payout_days: list[int], from_date: str | None = None) -> int:
    now = datetime.strptime(from_date, "%Y-%m-%d").date() if from_date else datetime.now().date()
    td = datetime.strptime(target_date, "%Y-%m-%d").date()
    if td <= now:
        return 1
    result = 0
    cursor = now.replace(day=1)
    end = td.replace(day=1)
    while cursor <= end:
        for day in payout_days:
            last = monthrange(cursor.year, cursor.month)[1]
            pd = cursor.replace(day=min(day, last))
            if now <= pd <= td:
                result += 1
        y = cursor.year + (cursor.month // 12)
        m = cursor.month % 12 + 1
        cursor = cursor.replace(year=y, month=m)
    return max(1, result)
