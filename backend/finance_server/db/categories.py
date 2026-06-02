from __future__ import annotations

from typing import Any

from .connection import get_connection
from .utils import normalize_text


def _serialize_category_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "typ": row["typ"],
        "parent_id": row["parent_id"],
        "parent_name": row["parent_name"],
        "personal_expense": bool(row["personal_expense"]),
    }


def _normalize_category_name(value: Any) -> str:
    return normalize_text(value)


def _normalize_category_type(value: Any) -> str:
    return normalize_text(value)


def _validate_parent_category(
    connection,
    category_id: int | None,
    parent_id: int | None,
) -> None:
    if parent_id is None:
        return

    if parent_id < 1:
        raise ValueError("Parent-Kategorie ist ungültig.")

    if category_id is not None and parent_id == category_id:
        raise ValueError("Eine Kategorie kann nicht ihre eigene Parent-Kategorie sein.")

    parent_row = connection.execute(
        "SELECT id, parent_id FROM kategorien WHERE id = ?",
        (parent_id,),
    ).fetchone()
    if parent_row is None:
        raise ValueError("Parent-Kategorie wurde nicht gefunden.")

    if category_id is None:
        return

    current_parent_id = parent_row["parent_id"]
    visited = {parent_id}

    while current_parent_id is not None:
        if current_parent_id == category_id:
            raise ValueError("Die Parent-Kategorie darf kein Unterelement der Kategorie sein.")
        if current_parent_id in visited:
            raise ValueError("Die Parent-Kategorie enthält einen zyklischen Bezug.")
        visited.add(current_parent_id)
        next_parent = connection.execute(
            "SELECT parent_id FROM kategorien WHERE id = ?",
            (current_parent_id,),
        ).fetchone()
        if next_parent is None:
            break
        current_parent_id = next_parent["parent_id"]


def list_categories() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                c.id,
                c.name,
                c.typ,
                c.parent_id,
                parent.name AS parent_name,
                c.personal_expense
            FROM kategorien c
            LEFT JOIN kategorien parent ON parent.id = c.parent_id
            ORDER BY c.typ ASC, c.parent_id IS NOT NULL ASC, c.parent_id ASC, c.name ASC, c.id ASC
            """,
        ).fetchall()

    return [_serialize_category_row(row) for row in rows]


def get_category_record(category_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                c.id,
                c.name,
                c.typ,
                c.parent_id,
                parent.name AS parent_name,
                c.personal_expense
            FROM kategorien c
            LEFT JOIN kategorien parent ON parent.id = c.parent_id
            WHERE c.id = ?
            """,
            (category_id,),
        ).fetchone()

    if row is None:
        return None

    return _serialize_category_row(row)


def create_category_record(payload: dict[str, Any]) -> dict[str, Any]:
    name = _normalize_category_name(payload.get("name"))
    typ = _normalize_category_type(payload.get("typ"))
    parent_id_raw = payload.get("parent_id")
    personal_expense = 1 if bool(payload.get("personal_expense")) else 0

    if not name:
        raise ValueError("Kategoriename fehlt.")
    if not typ:
        raise ValueError("Kategorientyp fehlt.")

    parent_id = None
    if parent_id_raw not in {None, "", 0, "0"}:
        try:
            parent_id = int(parent_id_raw)
        except (TypeError, ValueError) as error:
            raise ValueError("Parent-Kategorie ist ungültig.") from error

    with get_connection() as connection:
        _validate_parent_category(connection, None, parent_id)

        cursor = connection.execute(
            """
            INSERT INTO kategorien (name, typ, parent_id, personal_expense)
            VALUES (?, ?, ?, ?)
            """,
            (name, typ, parent_id, personal_expense),
        )
        category_id = int(cursor.lastrowid)

    record = get_category_record(category_id)
    if record is None:
        return {
            "id": category_id,
            "name": name,
            "typ": typ,
            "parent_id": parent_id,
            "parent_name": None,
            "personal_expense": bool(personal_expense),
        }

    return record


def update_category_record(
    category_id: int,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    current = get_category_record(category_id)
    if current is None:
        return None

    fields: list[str] = []
    params: list[Any] = []

    if "name" in payload:
        name = _normalize_category_name(payload.get("name"))
        if not name:
            raise ValueError("Kategoriename fehlt.")
        fields.append("name = ?")
        params.append(name)

    if "typ" in payload:
        typ = _normalize_category_type(payload.get("typ"))
        if not typ:
            raise ValueError("Kategorientyp fehlt.")
        fields.append("typ = ?")
        params.append(typ)

    if "parent_id" in payload:
        parent_id_raw = payload.get("parent_id")
        parent_id = None
        if parent_id_raw not in {None, "", 0, "0"}:
            try:
                parent_id = int(parent_id_raw)
            except (TypeError, ValueError) as error:
                raise ValueError("Parent-Kategorie ist ungültig.") from error

        with get_connection() as connection:
            _validate_parent_category(connection, category_id, parent_id)

        fields.append("parent_id = ?")
        params.append(parent_id)

    if "personal_expense" in payload:
        fields.append("personal_expense = ?")
        params.append(1 if bool(payload.get("personal_expense")) else 0)

    if not fields:
        return current

    params.append(category_id)

    with get_connection() as connection:
        cursor = connection.execute(
            f"UPDATE kategorien SET {', '.join(fields)} WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None

    return get_category_record(category_id)


def delete_category_record(category_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM kategorien WHERE id = ?",
            (category_id,),
        )

    return cursor.rowcount > 0


def update_transaction_category(transaction_id: int, category_id: int | None) -> None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE umsaetze SET kategorie = ? WHERE id = ?",
            (category_id, transaction_id),
        )