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


def _validate_amount(monthly_amount: float) -> None:
    if monthly_amount is None or monthly_amount < 0:
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


def _fetch_spent(conn: Any, category_ids: list[int], month: str) -> float:
    row = conn.execute(
        """
        WITH RECURSIVE cat_tree(cat_id) AS (
            SELECT value FROM json_each(?)
            UNION
            SELECT c.id FROM kategorien c JOIN cat_tree t ON c.parent_id = t.cat_id
        )
        SELECT COALESCE(SUM(-(u.amount + COALESCE(u.refund_total, 0))), 0) AS spent
        FROM umsaetze u
        WHERE u.kategorie IN (SELECT cat_id FROM cat_tree)
          AND u.amount < 0
          AND strftime('%Y-%m', COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10))) = ?
        """,
        (json.dumps(category_ids), month),
    ).fetchone()
    return float(row["spent"])


def _serialize_budget(row: Any, spent: float, cats: list[dict[str, Any]]) -> dict[str, Any]:
    monthly = float(row["monthly_amount"])
    spent_r = round(spent, 2)
    monthly_r = round(monthly, 2)
    return {
        "id": row["id"],
        "name": row["name"] or " + ".join(c["name"] for c in cats),
        "category_ids": _parse_category_ids(row["category_ids"]),
        "categories": [{"name": c["name"], "icon": c["icon"]} for c in cats],
        "monthly_amount": monthly_r,
        "spent": spent_r,
        "remaining": round(monthly_r - spent_r, 2),
        "is_over": spent_r > monthly_r,
    }


def _get_budget(budget_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, category_ids, monthly_amount FROM budgets WHERE id = ?",
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
        return _serialize_budget(row, _fetch_spent(conn, category_ids, _current_month()), cats)


def list_budgets(month: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, category_ids, monthly_amount FROM budgets ORDER BY id ASC",
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
            budgets.append(_serialize_budget(row, _fetch_spent(conn, category_ids, month), cats))
        return budgets


def _validate_categories(
    conn: Any, category_ids: list[int], exclude_budget_id: int | None = None
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
    for r in conn.execute("SELECT id, category_ids FROM budgets").fetchall():
        if r["id"] == exclude_budget_id:
            continue
        used.update(_parse_category_ids(r["category_ids"]))
    if used & set(category_ids):
        raise ValueError("Kategorie ist bereits in einem anderen Budget.")
    return category_ids


def create_budget(name: str, category_ids: list[int], monthly_amount: float) -> dict[str, Any]:
    name = _validate_name(name)
    _validate_amount(monthly_amount)
    with get_connection() as conn:
        category_ids = _validate_categories(conn, category_ids)
        cursor = conn.execute(
            "INSERT INTO budgets (name, category_ids, monthly_amount) VALUES (?, ?, ?)",
            (name, json.dumps(category_ids), monthly_amount),
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
    monthly_amount: float | None = None,
) -> dict[str, Any] | None:
    sets: list[str] = []
    params: list[Any] = []
    with get_connection() as conn:
        if name is not None:
            sets.append("name = ?")
            params.append(_validate_name(name))
        if monthly_amount is not None:
            _validate_amount(monthly_amount)
            sets.append("monthly_amount = ?")
            params.append(monthly_amount)
        if category_ids is not None:
            sets.append("category_ids = ?")
            params.append(json.dumps(_validate_categories(conn, category_ids, budget_id)))
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
