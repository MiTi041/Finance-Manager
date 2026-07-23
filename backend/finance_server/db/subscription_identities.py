from __future__ import annotations

from typing import Any, cast

from finance_server.core.database import get_connection


def _log(table_name: str, row_id: int | None, op_type: str, data: Any = None) -> None:
    from finance_server.services.sync_logger import log_crud_event
    _log(table_name, row_id, op_type, data)


def _serialize_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "counterpartyName": row["counterparty_name"],
        "amount": row["amount"],
        "displayName": row["display_name"],
        "zahlungspartnerId": row["f_zahlungspartner_id"],
        "dismissed": bool(row["dismissed"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_subscription_identities() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed, created_at, updated_at
            FROM subscription_identities
            ORDER BY counterparty_name COLLATE NOCASE ASC, amount ASC
            """
        ).fetchall()

    return [_serialize_row(row) for row in rows]


def get_subscription_identity(identity_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed, created_at, updated_at
            FROM subscription_identities
            WHERE id = ?
            """,
            (identity_id,),
        ).fetchone()

    if row is None:
        return None

    return _serialize_row(row)


def find_subscription_identity(
    counterparty_name: str, amount: float
) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed, created_at, updated_at
            FROM subscription_identities
            WHERE counterparty_name = ? AND amount = ?
            """,
            (counterparty_name, amount),
        ).fetchone()

    if row is None:
        return None

    return _serialize_row(row)


def create_subscription_identity(payload: dict[str, Any]) -> dict[str, Any]:
    counterparty_name = (payload.get("counterpartyName") or "").strip()
    if not counterparty_name:
        raise ValueError("counterpartyName ist erforderlich.")

    amount = payload.get("amount")
    if amount is None:
        raise ValueError("amount ist erforderlich.")

    display_name = (payload.get("displayName") or "").strip() or counterparty_name
    zahlungspartner_id = payload.get("zahlungspartnerId")
    dismissed = bool(payload.get("dismissed", False))

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO subscription_identities (counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(counterparty_name, amount) DO UPDATE SET
                display_name = COALESCE(excluded.display_name, subscription_identities.display_name),
                f_zahlungspartner_id = excluded.f_zahlungspartner_id,
                dismissed = excluded.dismissed,
                updated_at = CURRENT_TIMESTAMP
            """,
            (counterparty_name, amount, display_name, zahlungspartner_id, 1 if dismissed else 0),
        )

    record = find_subscription_identity(counterparty_name, amount)
    if record is None:
        raise RuntimeError("Fehler beim Erstellen der Subscription-Identität.")

    _log("subscription_identities", record["id"], "INSERT", record)
    return record


def update_subscription_identity(
    identity_id: int, payload: dict[str, Any]
) -> dict[str, Any] | None:
    current = get_subscription_identity(identity_id)
    if current is None:
        return None

    fields: list[str] = []
    params: list[Any] = []

    if "displayName" in payload:
        display_name = (payload.get("displayName") or "").strip() or current["counterpartyName"]
        fields.append("display_name = ?")
        params.append(display_name)

    if "zahlungspartnerId" in payload:
        fields.append("f_zahlungspartner_id = ?")
        params.append(payload["zahlungspartnerId"])

    if "dismissed" in payload:
        fields.append("dismissed = ?")
        params.append(1 if payload["dismissed"] else 0)

    if not fields:
        return current

    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.append(identity_id)

    with get_connection() as connection:
        cursor = connection.execute(
            f"UPDATE subscription_identities SET {', '.join(fields)} WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None

    updated = get_subscription_identity(identity_id)
    _log("subscription_identities", identity_id, "UPDATE", updated)
    return updated


def delete_subscription_identity(identity_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM subscription_identities WHERE id = ?",
            (identity_id,),
        )

    result = cursor.rowcount > 0
    _log("subscription_identities", identity_id, "DELETE")
    return result
