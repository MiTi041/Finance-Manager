from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.services.sync_logger import log_crud_event


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _validate_period(period: str) -> str:
    if period not in {"monthly", "yearly"}:
        raise ValueError("Ungültiger Zeitraum. Nur 'monthly' oder 'yearly' erlaubt.")
    return period


def _validate_amount(amount: float) -> None:
    if amount is None or amount < 0:
        raise ValueError("Budget darf nicht negativ sein.")


def _validate_name(name: str) -> str:
    name = (name or "").strip()
    if not name:
        raise ValueError("Budget braucht einen Namen.")
    return name


def _parse_category_ids(raw: Any) -> list[int]:
    try:
        ids = json.loads(raw)
        return [int(i) for i in ids]
    except (ValueError, TypeError):
        return []


def _fetch_spent(conn: Any, category_ids: list[int], month: str, period: str) -> float:
    date_expr = "COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10))"
    if period == "yearly":
        where = (
            f"strftime('%Y', {date_expr}) = ? "
            f"AND CAST(strftime('%m', {date_expr}) AS INTEGER) <= ?"
        )
        params: tuple[Any, ...] = (json.dumps(category_ids), month[:4], int(month[5:]))
    else:
        where = f"strftime('%Y-%m', {date_expr}) = ?"
        params = (json.dumps(category_ids), month)
    row = conn.execute(
        f"""
        WITH RECURSIVE cat_tree(cat_id) AS (
            SELECT value FROM json_each(?)
            UNION
            SELECT c.id FROM kategorien c JOIN cat_tree t ON c.parent_id = t.cat_id
        )
        SELECT COALESCE(SUM(-(u.amount + COALESCE(u.refund_total, 0))), 0) AS spent
        FROM umsaetze u
        WHERE u.kategorie IN (SELECT cat_id FROM cat_tree)
          AND u.amount < 0
          AND {where}
        """,
        params,
    ).fetchone()
    return float(row["spent"])


def _serialize_budget(row: Any, spent: float, cats: list[dict[str, Any]]) -> dict[str, Any]:
    amount = float(row["amount"])
    spent_r = round(spent, 2)
    amount_r = round(amount, 2)
    return {
        "id": row["id"],
        "name": row["name"] or " + ".join(c["name"] for c in cats),
        "category_ids": _parse_category_ids(row["category_ids"]),
        "categories": [{"name": c["name"], "icon": c["icon"]} for c in cats],
        "amount": amount_r,
        "period": row["period"],
        "spent": spent_r,
        "remaining": round(amount_r - spent_r, 2),
        "is_over": spent_r >= amount_r,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_budget(budget_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, category_ids, amount, period, created_at, updated_at FROM budgets WHERE id = ?",
            (budget_id,),
        ).fetchone()
        if row is None:
            return None
        category_ids = _parse_category_ids(row["category_ids"])
        placeholders = ",".join("?" * len(category_ids))
        cats = conn.execute(
            f"SELECT name, icon FROM kategorien WHERE id IN ({placeholders}) ORDER BY name ASC",
            category_ids,
        ).fetchall()
        return _serialize_budget(
            row, _fetch_spent(conn, category_ids, _current_month(), row["period"]), cats
        )


def list_budgets(month: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, category_ids, amount, period, created_at, updated_at FROM budgets ORDER BY id ASC",
        ).fetchall()
        budgets: list[dict[str, Any]] = []
        for row in rows:
            category_ids = _parse_category_ids(row["category_ids"])
            if not category_ids:
                continue
            placeholders = ",".join("?" * len(category_ids))
            cats = conn.execute(
                f"SELECT name, icon FROM kategorien WHERE id IN ({placeholders}) ORDER BY name ASC",
                category_ids,
            ).fetchall()
            budgets.append(
                _serialize_budget(row, _fetch_spent(conn, category_ids, month, row["period"]), cats)
            )
        return budgets


def _validate_categories(
    conn: Any, category_ids: list[int], exclude_budget_id: int | None = None, period: str = "monthly"
) -> list[int]:
    category_ids = sorted(set(int(i) for i in category_ids))
    if not category_ids:
        raise ValueError("Mindestens eine Kategorie auswählen.")
    placeholders = ",".join("?" * len(category_ids))
    cats = conn.execute(
        f"SELECT id FROM kategorien WHERE id IN ({placeholders}) AND typ = 'Ausgabe'",
        category_ids,
    ).fetchall()
    if {c["id"] for c in cats} != set(category_ids):
        raise ValueError("Kategorie nicht gefunden oder keine Ausgabe-Kategorie.")
    used: set[int] = set()
    for r in conn.execute("SELECT id, category_ids, period FROM budgets").fetchall():
        if r["id"] == exclude_budget_id or r["period"] != period:
            continue
        used.update(_parse_category_ids(r["category_ids"]))
    if used & set(category_ids):
        raise ValueError("Kategorie ist bereits in einem anderen Budget.")
    return category_ids


def create_budget(name: str, category_ids: list[int], amount: float, period: str = "monthly") -> dict[str, Any]:
    name = _validate_name(name)
    _validate_amount(amount)
    period = _validate_period(period)
    with get_connection() as conn:
        category_ids = _validate_categories(conn, category_ids, period=period)
        cursor = conn.execute(
            "INSERT INTO budgets (name, category_ids, amount, period) VALUES (?, ?, ?, ?)",
            (name, json.dumps(category_ids), amount, period),
        )
        budget_id = int(cursor.lastrowid)
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "INSERT", result)
    return result


def update_budget(
    budget_id: int,
    name: str | None = None,
    category_ids: list[int] | None = None,
    amount: float | None = None,
    period: str | None = None,
) -> dict[str, Any] | None:
    sets: list[str] = []
    params: list[Any] = []
    with get_connection() as conn:
        if name is not None:
            sets.append("name = ?")
            params.append(_validate_name(name))
        if amount is not None:
            _validate_amount(amount)
            sets.append("amount = ?")
            params.append(amount)
        if period is not None:
            sets.append("period = ?")
            params.append(_validate_period(period))
        if category_ids is not None:
            current = conn.execute("SELECT period FROM budgets WHERE id = ?", (budget_id,)).fetchone()
            period_for_check = period if period is not None else (current["period"] if current else "monthly")
            sets.append("category_ids = ?")
            params.append(json.dumps(_validate_categories(conn, category_ids, budget_id, period_for_check)))
        if not sets:
            return _get_budget(budget_id)
        params.extend([_now(), budget_id])
        cursor = conn.execute(
            f"UPDATE budgets SET {', '.join(sets)}, updated_at = ? WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "UPDATE", result)
    return result


def delete_budget(budget_id: int) -> bool:
    budget = _get_budget(budget_id)
    if budget:
        log_crud_event("budgets", budget_id, "DELETE", budget)
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    return cursor.rowcount > 0
