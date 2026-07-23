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


VALID_SYNC_TABLES = {"kategorien", "umsaetze", "zahlungspartner", "empfaengerkonten", "subscription_identities"}


def apply_sync_op(op: dict[str, Any]) -> bool:
    table = op["table_name"]
    row_id = op["row_id"]
    op_type = op["op_type"]
    data = json.loads(op["data"]) if op["data"] else None
    if table not in VALID_SYNC_TABLES:
        return False

    with get_connection() as connection:
        if op_type == "DELETE":
            cursor = connection.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
            return cursor.rowcount > 0

        if not data:
            return False

        columns = [k for k in data.keys() if k != "id"]
        placeholders = [f"{k} = ?" for k in columns]
        values = [data[k] for k in columns]

        existing = connection.execute(
            f"SELECT updated_at FROM {table} WHERE id = ?", (row_id,)
        ).fetchone()

        if existing and data.get("updated_at"):
            if existing["updated_at"] and existing["updated_at"] >= data["updated_at"]:
                return False

        if existing:
            sql = f"UPDATE {table} SET {', '.join(placeholders)} WHERE id = ?"
            values.append(row_id)
            cursor = connection.execute(sql, values)
        else:
            all_columns = ["id"] + columns
            all_placeholders = ["?"] * len(all_columns)
            all_values = [row_id] + values
            sql = f"INSERT OR IGNORE INTO {table} ({', '.join(all_columns)}) VALUES ({', '.join(all_placeholders)})"
            cursor = connection.execute(sql, all_values)
        return cursor.rowcount > 0


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
