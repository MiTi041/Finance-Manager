from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection


def get_or_create_device_id(connection: sqlite3.Connection | None = None) -> str:
    device_id = get_sync_state("local_device_id", connection)
    if device_id:
        return device_id
    device_id = str(uuid.uuid4())
    set_sync_state("local_device_id", device_id, connection)
    return device_id


def get_next_seq(connection: sqlite3.Connection | None = None) -> int:
    val = get_sync_state("last_seq", connection)
    if val is None:
        set_sync_state("last_seq", "1", connection)
        return 1
    next_seq = int(val) + 1
    set_sync_state("last_seq", str(next_seq), connection)
    return next_seq


def log_sync_op(
    table_name: str,
    row_id: int | None,
    op_type: str,
    data: dict[str, Any] | None,
    connection: sqlite3.Connection | None = None,
) -> int:
    device_id = get_or_create_device_id(connection)
    seq = get_next_seq(connection)
    data_json = json.dumps(data, ensure_ascii=False, default=str) if data else None
    checksum = None
    if data_json:
        checksum = hashlib.sha256(data_json.encode("utf-8")).hexdigest()

    if connection:
        cursor = connection.execute(
            "INSERT INTO sync_ops (device_id, seq, table_name, row_id, op_type, data, checksum) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (device_id, seq, table_name, row_id, op_type, data_json, checksum),
        )
        return int(cursor.lastrowid)

    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO sync_ops (device_id, seq, table_name, row_id, op_type, data, checksum) VALUES (?, ?, ?, ?, ?, ?, ?)",
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


VALID_SYNC_TABLES = {
    "kategorien", "umsaetze", "zahlungspartner", "empfaengerkonten",
    "subscription_identities", "ibans",
    "allocation_buckets", "allocation_bafoeg_config", "savings_plans", "budgets",
}

VALID_SYNC_COLUMNS: dict[str, set[str]] = {
    "kategorien": {"id", "name", "typ", "parent_id", "personal_expense", "icon", "updated_at"},
    "umsaetze": {
        "id",
        "account_iban", "account_bic", "account_accountnumber", "account_subaccount", "account_blz",
        "status", "funds_code", "transaction_id", "customer_reference", "bank_reference",
        "extra_details",
        "date", "entry_date", "guessed_entry_date",
        "transaction_reference", "transaction_code", "posting_text", "prima_nota", "purpose",
        "additional_purpose", "end_to_end_reference", "additional_position_reference",
        "additional_position_date",
        "applicant_bic", "applicant_iban", "applicant_name", "recipient_name",
        "deviate_applicant", "deviate_recipient",
        "gvc_applicant_iban", "gvc_applicant_bic",
        "applicant_creditor_id", "debitor_identifier", "return_debit_notes",
        "purpose_code", "FRST_ONE_OFF_RECC", "old_SEPA_CI",
        "old_SEPA_additional_position_reference",
        "settlement_tag",
        "original_amount", "amount", "currency",
        "dummy_entry", "transaction_hash",
        "kategorie", "note", "splits", "refund_ref_transaction_id",
        "created_at", "updated_at",
    },
    "zahlungspartner": {"id", "name", "website", "logo_url", "local_logo_path", "is_company", "logo_white_background", "logo_padding", "updated_at"},
    "empfaengerkonten": {"id", "account_name", "iban", "bic", "recipient_name", "is_donation_account", "updated_at"},
    "subscription_identities": {"id", "counterparty_name", "amount", "display_name", "f_zahlungspartner_id", "dismissed", "updated_at"},
    "ibans": {"iban", "f_zahlungspartner_id"},
    "allocation_buckets": {"id", "bucket_type", "percentage", "recipient_account_id", "sender_iban", "is_active", "sort_order", "created_at", "updated_at"},
    "allocation_bafoeg_config": {"id", "total_debt", "monthly_rate", "interest_rate", "payout_date", "created_at", "updated_at"},
    "savings_plans": {"id", "name", "tag", "target_amount", "target_date", "target_recipient_name", "target_recipient_iban", "target_recipient_bic", "is_visible", "sender_iban", "created_at", "updated_at"},
    "budgets": {"id", "category_id", "monthly_amount", "created_at", "updated_at"},
}


def _resolve_lookup(
    table: str, row_id: int | None, data: dict[str, Any] | None
) -> tuple[str, Any, int | None]:
    if table == "allocation_buckets" and data and data.get("bucket_type"):
        return "bucket_type", data["bucket_type"], row_id
    if table == "allocation_bafoeg_config":
        return "id", 1, 1
    if table == "umsaetze" and data and data.get("transaction_hash"):
        return "transaction_hash", data["transaction_hash"], row_id
    if table == "ibans":
        return "iban", row_id, row_id
    return "id", row_id, row_id


def apply_sync_op(op: dict[str, Any]) -> bool:
    table = op["table_name"]
    row_id = op["row_id"]
    op_type = op["op_type"]
    data = json.loads(op["data"]) if op["data"] else None
    if table not in VALID_SYNC_TABLES:
        return False

    with get_connection() as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        pk, pk_value, use_id = _resolve_lookup(table, row_id, data)

        if op_type == "DELETE":
            if table == "allocation_buckets":
                cursor = connection.execute(
                    "DELETE FROM allocation_buckets WHERE bucket_type = ?", (pk_value,)
                )
            else:
                cursor = connection.execute(f"DELETE FROM {table} WHERE {pk} = ?", (pk_value,))
            return cursor.rowcount > 0

        if not data:
            return False

        valid_cols = VALID_SYNC_COLUMNS.get(table, set())
        filtered_data = {k: v for k, v in data.items() if k in valid_cols}
        if not filtered_data:
            return False

        if pk == "id" and "id" not in filtered_data:
            return False

        if table == "umsaetze" and "splits" in filtered_data and isinstance(filtered_data["splits"], (dict, list)):
            filtered_data["splits"] = json.dumps(filtered_data["splits"], ensure_ascii=False) if filtered_data["splits"] else None

        columns = [k for k in filtered_data.keys() if k != pk]
        placeholders = [f"{k} = ?" for k in columns]
        values = [filtered_data[k] for k in columns]

        existing = connection.execute(
            f"SELECT 1 FROM {table} WHERE {pk} = ?", (pk_value,)
        ).fetchone()
        if table == "allocation_buckets" and existing:
            use_id = existing["id"] if existing else row_id

        if existing and "updated_at" in valid_cols and op_type != "INSERT":
            current_updated = connection.execute(
                f"SELECT updated_at FROM {table} WHERE {pk} = ?", (pk_value,)
            ).fetchone()["updated_at"]
            if data.get("updated_at") and current_updated and current_updated >= data["updated_at"]:
                return False

        if existing:
            where_pk = "id" if table == "allocation_buckets" else pk
            where_val = use_id if table == "allocation_buckets" else pk_value
            sql = f"UPDATE {table} SET {', '.join(placeholders)} WHERE {where_pk} = ?"
            values.append(where_val)
            cursor = connection.execute(sql, values)
        else:
            if table == "allocation_buckets":
                all_columns = ["id"] + columns + ["bucket_type"]
                all_values = [use_id or row_id] + values + [filtered_data.get("bucket_type", "")]
            else:
                all_columns = [pk] + columns
                all_values = [pk_value] + values
            all_placeholders = ["?"] * len(all_columns)
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
    return ops_count


def count_pending_ops(last_pushed_id: int = 0) -> int:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS cnt FROM sync_ops WHERE id > ?", (last_pushed_id,)
        ).fetchone()
    return row["cnt"] if row else 0


def get_sync_state(key: str, connection: sqlite3.Connection | None = None) -> str | None:
    if connection:
        row = connection.execute(
            "SELECT value FROM sync_state WHERE key = ?", (key,)
        ).fetchone()
    else:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT value FROM sync_state WHERE key = ?", (key,)
            ).fetchone()
    return row["value"] if row else None


def get_all_remote_seqs() -> dict[str, int]:
    seqs: dict[str, int] = {}
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT key, value FROM sync_state WHERE key LIKE 'remote_%_seq'"
        ).fetchall()
    for row in rows:
        remote_id = row["key"].replace("remote_", "").replace("_seq", "")
        try:
            seqs[remote_id] = int(row["value"])
        except (ValueError, TypeError):
            continue
    return seqs


def set_sync_state(key: str, value: str, connection: sqlite3.Connection | None = None) -> None:
    if connection:
        connection.execute(
            "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
    else:
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
