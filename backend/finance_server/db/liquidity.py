from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.services.sync_logger import log_crud_event

_KINDS = {"income", "expense"}
_CERTAINTIES = {"certain", "expected"}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validate_label(label: str) -> str:
    label = (label or "").strip()
    if not label:
        raise ValueError("Eintrag braucht eine Bezeichnung.")
    return label


def _validate_amount(amount: float) -> float:
    if amount is None or amount < 0:
        raise ValueError("Betrag darf nicht negativ sein.")
    return float(amount)


def _validate_enum(value: str, allowed: set[str], message: str) -> str:
    if value not in allowed:
        raise ValueError(message)
    return value


def _serialize(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "label": row["label"],
        "amount": round(float(row["amount"]), 2),
        "kind": row["kind"],
        "certainty": row["certainty"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_entries() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, label, amount, kind, certainty, created_at, updated_at "
            "FROM liquidity_entries ORDER BY id ASC"
        ).fetchall()
        return [_serialize(row) for row in rows]


def _get_entry(entry_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, label, amount, kind, certainty, created_at, updated_at "
            "FROM liquidity_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        return _serialize(row) if row else None


def create_entry(label: str, amount: float, kind: str, certainty: str) -> dict[str, Any]:
    label = _validate_label(label)
    amount = _validate_amount(amount)
    kind = _validate_enum(kind, _KINDS, "Ungültige Art. Nur 'income' oder 'expense' erlaubt.")
    certainty = _validate_enum(
        certainty, _CERTAINTIES, "Ungültige Sicherheit. Nur 'certain' oder 'expected' erlaubt."
    )
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO liquidity_entries (label, amount, kind, certainty) VALUES (?, ?, ?, ?)",
            (label, amount, kind, certainty),
        )
        entry_id = int(cursor.lastrowid)
    result = _get_entry(entry_id)
    if result:
        log_crud_event("liquidity_entries", entry_id, "INSERT", result)
    return result


def update_entry(
    entry_id: int,
    label: str | None = None,
    amount: float | None = None,
    kind: str | None = None,
    certainty: str | None = None,
) -> dict[str, Any] | None:
    sets: list[str] = []
    params: list[Any] = []
    if label is not None:
        sets.append("label = ?")
        params.append(_validate_label(label))
    if amount is not None:
        sets.append("amount = ?")
        params.append(_validate_amount(amount))
    if kind is not None:
        sets.append("kind = ?")
        params.append(_validate_enum(kind, _KINDS, "Ungültige Art. Nur 'income' oder 'expense' erlaubt."))
    if certainty is not None:
        sets.append("certainty = ?")
        params.append(
            _validate_enum(
                certainty, _CERTAINTIES, "Ungültige Sicherheit. Nur 'certain' oder 'expected' erlaubt."
            )
        )
    if not sets:
        return _get_entry(entry_id)
    params.extend([_now(), entry_id])
    with get_connection() as conn:
        cursor = conn.execute(
            f"UPDATE liquidity_entries SET {', '.join(sets)}, updated_at = ? WHERE id = ?", params
        )
        if cursor.rowcount <= 0:
            return None
    result = _get_entry(entry_id)
    if result:
        log_crud_event("liquidity_entries", entry_id, "UPDATE", result)
    return result


def delete_entry(entry_id: int) -> bool:
    entry = _get_entry(entry_id)
    if entry:
        log_crud_event("liquidity_entries", entry_id, "DELETE", entry)
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM liquidity_entries WHERE id = ?", (entry_id,))
    return cursor.rowcount > 0
