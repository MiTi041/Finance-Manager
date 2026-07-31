from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.services.sync_logger import log_crud_event


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validate_amount(monthly_amount: float) -> None:
    if monthly_amount is None or monthly_amount < 0:
        raise ValueError("Budget darf nicht negativ sein.")


def _fetch_spent(conn: Any, category_id: int, month: str) -> float:
    row = conn.execute(
        """
        WITH RECURSIVE cat_tree(cat_id) AS (
            SELECT ?
            UNION ALL
            SELECT c.id FROM kategorien c JOIN cat_tree t ON c.parent_id = t.cat_id
        )
        SELECT COALESCE(SUM(-(u.amount + COALESCE(u.refund_total, 0))), 0) AS spent
        FROM umsaetze u
        WHERE u.kategorie IN (SELECT cat_id FROM cat_tree)
          AND u.amount < 0
          AND strftime('%Y-%m', COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10))) = ?
        """,
        (category_id, month),
    ).fetchone()
    return float(row["spent"])


def _serialize_budget(row: Any, spent: float) -> dict[str, Any]:
    monthly = float(row["monthly_amount"])
    return {
        "id": row["id"],
        "category_id": row["category_id"],
        "name": row["name"],
        "icon": row["icon"],
        "monthly_amount": round(monthly, 2),
        "spent": round(spent, 2),
        "remaining": round(monthly - spent, 2),
        "is_over": spent > monthly,
    }


def _get_budget(budget_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM budgets WHERE id = ?", (budget_id,)
        ).fetchone()
    return dict(row) if row else None


def list_budgets(month: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.id, b.category_id, b.monthly_amount, k.name, k.icon
            FROM budgets b
            JOIN kategorien k ON k.id = b.category_id
            ORDER BY k.name ASC
            """,
        ).fetchall()
        return [
            _serialize_budget(row, _fetch_spent(conn, row["category_id"], month))
            for row in rows
        ]


def create_budget(category_id: int, monthly_amount: float) -> dict[str, Any]:
    _validate_amount(monthly_amount)
    with get_connection() as conn:
        cat = conn.execute(
            "SELECT id FROM kategorien WHERE id = ? AND typ = 'Ausgabe'",
            (category_id,),
        ).fetchone()
        if cat is None:
            raise ValueError("Kategorie nicht gefunden oder keine Ausgabe-Kategorie.")
        try:
            cursor = conn.execute(
                "INSERT INTO budgets (category_id, monthly_amount) VALUES (?, ?)",
                (category_id, monthly_amount),
            )
        except sqlite3.IntegrityError as err:
            raise ValueError("Budget existiert bereits für diese Kategorie.") from err
        budget_id = int(cursor.lastrowid)
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "INSERT", result)
    return result


def update_budget(budget_id: int, monthly_amount: float) -> dict[str, Any] | None:
    _validate_amount(monthly_amount)
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE budgets SET monthly_amount = ?, updated_at = ? WHERE id = ?",
            (monthly_amount, _now(), budget_id),
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
