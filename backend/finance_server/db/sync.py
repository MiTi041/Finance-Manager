from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection


def get_or_create_device_id() -> str:
    device_id = get_sync_state("local_device_id")
    if device_id:
        return device_id
    device_id = str(uuid.uuid4())
    set_sync_state("local_device_id", device_id)
    return device_id


def get_next_seq() -> int:
    val = get_sync_state("last_seq")
    if val is None:
        set_sync_state("last_seq", "1")
        return 1
    next_seq = int(val) + 1
    set_sync_state("last_seq", str(next_seq))
    return next_seq


def log_sync_op(
    table_name: str,
    row_id: int | None,
    op_type: str,
    data: dict[str, Any] | None,
) -> int:
    device_id = get_or_create_device_id()
    seq = get_next_seq()
    data_json = json.dumps(data, ensure_ascii=False, default=str) if data else None
    checksum = None
    if data_json:
        checksum = hashlib.sha256(data_json.encode("utf-8")).hexdigest()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO sync_ops (device_id, seq, table_name, row_id, op_type, data, checksum)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, seq, table_name, row_id, op_type, data_json, checksum),
        )
        return int(cursor.lastrowid)


def get_pending_ops(last_pushed_id: int = 0, limit: int = 100) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, device_id, seq, table_name, row_id, op_type, data, checksum, created_at
            FROM sync_ops
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (last_pushed_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


VALID_SYNC_TABLES = {"kategorien", "umsaetze", "zahlungspartner", "empfaengerkonten", "subscription_identities", "ibans"}

VALID_SYNC_COLUMNS: dict[str, set[str]] = {
    "kategorien": {"id", "name", "typ", "parent_id", "personal_expense", "icon", "updated_at"},
    "umsaetze": {"id", "kategorie", "note", "splits", "refund_ref_transaction_id", "updated_at"},
    "zahlungspartner": {"id", "name", "website", "logo_url", "local_logo_path", "is_company", "logo_white_background", "logo_padding", "updated_at"},
    "empfaengerkonten": {"id", "account_name", "iban", "bic", "recipient_name", "is_donation_account", "updated_at"},
    "subscription_identities": {"id", "counterparty_name", "amount", "display_name", "f_zahlungspartner_id", "dismissed", "updated_at"},
    "ibans": {"iban", "f_zahlungspartner_id"},
}


def apply_sync_op(op: dict[str, Any]) -> bool:
    table = op["table_name"]
    row_id = op["row_id"]
    op_type = op["op_type"]
    data = json.loads(op["data"]) if op["data"] else None
    if table not in VALID_SYNC_TABLES:
        return False

    with get_connection() as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        pk = "iban" if table == "ibans" else "id"

        if op_type == "DELETE":
            cursor = connection.execute(f"DELETE FROM {table} WHERE {pk} = ?", (row_id,))
            return cursor.rowcount > 0

        if not data:
            return False

        valid_cols = VALID_SYNC_COLUMNS.get(table, set())
        filtered_data = {k: v for k, v in data.items() if k in valid_cols}
        if not filtered_data:
            return False

        if pk == "id" and pk not in filtered_data:
                return False

        columns = [k for k in filtered_data.keys() if k != pk]
        placeholders = [f"{k} = ?" for k in columns]
        values = [filtered_data[k] for k in columns]

        existing = connection.execute(
            f"SELECT updated_at FROM {table} WHERE {pk} = ?", (row_id,)
        ).fetchone()

        if existing and data.get("updated_at"):
            if existing["updated_at"] and existing["updated_at"] >= data["updated_at"]:
                return False

        if existing:
            sql = f"UPDATE {table} SET {', '.join(placeholders)} WHERE {pk} = ?"
            values.append(row_id)
            cursor = connection.execute(sql, values)
        else:
            all_columns = [pk] + columns
            all_placeholders = ["?"] * len(all_columns)
            all_values = [row_id] + values
            sql = f"INSERT OR IGNORE INTO {table} ({', '.join(all_columns)}) VALUES ({', '.join(all_placeholders)})"
            cursor = connection.execute(sql, all_values)
        return cursor.rowcount > 0


def bootstrap_sync_ops() -> int:
    ops_count = 0
    with get_connection() as connection:
        for table in sorted(VALID_SYNC_TABLES):
            pk = "iban" if table == "ibans" else "id"
            cols = [c for c in sorted(VALID_SYNC_COLUMNS.get(table, set())) if c != pk]
            all_cols = [pk] + cols
            col_list = ", ".join(all_cols)
            rows = connection.execute(f"SELECT {col_list} FROM {table} ORDER BY {pk}").fetchall()
            for row in rows:
                row_dict = dict(row)
                log_sync_op(table, row_dict[pk], "INSERT", row_dict)
                ops_count += 1
        last = connection.execute(
            "SELECT COALESCE(MAX(id), 0) FROM sync_ops"
        ).fetchone()[0]
        if last:
            set_sync_state("last_pushed_id", str(last))
    return ops_count


def get_sync_state(key: str) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT value FROM sync_state WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def set_sync_state(key: str, value: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
