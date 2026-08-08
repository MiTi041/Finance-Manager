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
    "app_settings",
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
        "kategorie", "note", "splits",
        "created_at", "updated_at",
    },
    "zahlungspartner": {"id", "name", "website", "logo_url", "local_logo_path", "is_company", "logo_white_background", "logo_padding", "updated_at"},
    "empfaengerkonten": {"id", "account_name", "iban", "bic", "recipient_name", "is_donation_account", "created_at", "updated_at"},
    "subscription_identities": {"id", "counterparty_name", "amount", "display_name", "f_zahlungspartner_id", "dismissed", "updated_at"},
    "ibans": {"iban", "f_zahlungspartner_id"},
    "allocation_buckets": {"id", "bucket_type", "percentage", "recipient_account_id", "sender_iban", "is_active", "sort_order", "target_amount", "target_months", "recipient_iban", "created_at", "updated_at"},
    "allocation_bafoeg_config": {"id", "total_debt", "monthly_rate", "interest_rate", "payout_date", "current_balance", "anlagezinsen", "created_at", "updated_at"},
    "savings_plans": {"id", "name", "tag", "target_amount", "target_date", "target_recipient_name", "target_recipient_iban", "target_recipient_bic", "is_visible", "sender_iban", "created_at", "updated_at"},
    "budgets": {"id", "name", "category_ids", "amount", "period", "created_at", "updated_at"},
    "app_settings": {"key", "value", "updated_at"},
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
    if table == "empfaengerkonten" and data and data.get("iban"):
        return "iban", data["iban"], row_id
    if table == "app_settings" and data and data.get("key"):
        return "key", data["key"], None
    return "id", row_id, row_id


SYNCED_APP_SETTING_KEYS = {
    "bafoeg_enabled",
    "resend_api_key",
    "resend_from",
    "hunter_logo_key",
}


TRANSACTION_IDENTITY_COLUMNS = (
    "account_iban",
    "account_bic",
    "account_accountnumber",
    "account_subaccount",
    "account_blz",
    "date",
    "entry_date",
    "transaction_id",
    "customer_reference",
    "bank_reference",
    "transaction_reference",
    "end_to_end_reference",
    "prima_nota",
    "recipient_name",
    "purpose",
    "additional_purpose",
    "posting_text",
    "transaction_code",
    "purpose_code",
    "currency",
)


def _find_equivalent_transaction_id(
    connection: Any,
    data: dict[str, Any],
) -> int | None:
    if data.get("transaction_hash"):
        row = connection.execute(
            "SELECT id FROM umsaetze WHERE transaction_hash = ?",
            (data["transaction_hash"],),
        ).fetchone()
        if row:
            return int(row["id"])

    amount = data.get("amount")
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return None

    where = ["ABS(amount - ?) < 0.0001"]
    values: list[Any] = [amount]
    for col in TRANSACTION_IDENTITY_COLUMNS:
        if col in data:
            where.append(f"COALESCE({col}, '') = COALESCE(?, '')")
            values.append(data.get(col))

    if len(where) <= 1:
        return None

    row = connection.execute(
        f"SELECT id FROM umsaetze WHERE {' AND '.join(where)} ORDER BY id LIMIT 1",
        values,
    ).fetchone()
    return int(row["id"]) if row else None


def _is_default_allocation_bucket(row: Any) -> bool:
    defaults = {
        "bafoeg": {"percentage": 0.0, "recipient_account_id": None, "sender_iban": None, "is_active": 0, "sort_order": 0},
        "emergency": {"percentage": 30.0, "recipient_account_id": None, "sender_iban": None, "is_active": 1, "sort_order": 1},
        "invest": {"percentage": 30.0, "recipient_account_id": None, "sender_iban": None, "is_active": 1, "sort_order": 2},
        "donation": {"percentage": 10.0, "recipient_account_id": None, "sender_iban": None, "is_active": 1, "sort_order": 3},
        "spending": {"percentage": 30.0, "recipient_account_id": None, "sender_iban": None, "is_active": 1, "sort_order": 4},
    }
    expected = defaults.get(row["bucket_type"])
    if not expected:
        return False
    for key, value in expected.items():
        if row[key] != value:
            return False
    return row["target_amount"] is None and row["target_months"] is None and row["recipient_iban"] is None


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

        if table == "app_settings" and filtered_data.get("key") not in SYNCED_APP_SETTING_KEYS:
            return False

        if table == "umsaetze" and "splits" in filtered_data and isinstance(filtered_data["splits"], (dict, list)):
            filtered_data["splits"] = json.dumps(filtered_data["splits"], ensure_ascii=False) if filtered_data["splits"] else None

        if table == "budgets" and "category_ids" in filtered_data and isinstance(filtered_data["category_ids"], list):
            filtered_data["category_ids"] = json.dumps(filtered_data["category_ids"], ensure_ascii=False)

        columns = [k for k in filtered_data.keys() if k != pk]
        placeholders = [f"{k} = ?" for k in columns]
        values = [filtered_data[k] for k in columns]

        existing_transaction_id = None
        if table == "umsaetze":
            existing_transaction_id = _find_equivalent_transaction_id(connection, filtered_data)
            if existing_transaction_id is None and pk == "id" and pk_value is not None:
                row = connection.execute("SELECT id FROM umsaetze WHERE id = ?", (pk_value,)).fetchone()
                existing_transaction_id = int(row["id"]) if row else None
            existing = {"id": existing_transaction_id} if existing_transaction_id is not None else None
        elif table == "allocation_buckets":
            existing = connection.execute(
                "SELECT * FROM allocation_buckets WHERE bucket_type = ?", (pk_value,)
            ).fetchone()
        else:
            existing = connection.execute(
                f"SELECT 1 FROM {table} WHERE {pk} = ?", (pk_value,)
            ).fetchone()
        if table == "allocation_buckets" and existing:
            use_id = existing["id"]
        if table == "umsaetze" and existing and "transaction_hash" in filtered_data and "transaction_hash" not in columns:
            columns.append("transaction_hash")
            placeholders = [f"{k} = ?" for k in columns]
            values = [filtered_data[k] for k in columns]

        if table in {"empfaengerkonten", "umsaetze"} and existing and "id" in columns:
            columns = [c for c in columns if c != "id"]
            placeholders = [f"{k} = ?" for k in columns]
            values = [filtered_data[k] for k in columns]

        existing_is_default_bucket = table == "allocation_buckets" and existing and _is_default_allocation_bucket(existing)

        if existing and "updated_at" in valid_cols and op_type != "INSERT" and not existing_is_default_bucket:
            current_updated = connection.execute(
                f"SELECT updated_at FROM {table} WHERE {'id' if table == 'umsaetze' else pk} = ?",
                (existing_transaction_id if table == "umsaetze" else pk_value,),
            ).fetchone()["updated_at"]
            if data.get("updated_at") and current_updated and current_updated >= data["updated_at"]:
                return False

        if existing:
            where_pk = "id" if table in {"allocation_buckets", "umsaetze"} else pk
            where_val = use_id if table == "allocation_buckets" else existing_transaction_id if table == "umsaetze" else pk_value
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
            # Incoming id is already used locally; retry without it so the row can
            # still arrive with a local auto-increment id.
            if (
                cursor.rowcount == 0
                and table in {"empfaengerkonten", "umsaetze"}
                and "id" in all_columns
            ):
                retry_cols = [c for c in all_columns if c != "id"]
                retry_vals = [v for c, v in zip(all_columns, all_values) if c != "id"]
                retry_sql = f"INSERT OR IGNORE INTO {table} ({', '.join(retry_cols)}) VALUES ({', '.join('?' for _ in retry_cols)})"
                cursor = connection.execute(retry_sql, retry_vals)
        return cursor.rowcount > 0


def bootstrap_sync_ops() -> int:
    ops_count = 0
    with get_connection() as connection:
        for table in sorted(VALID_SYNC_TABLES):
            pk = {"ibans": "iban", "app_settings": "key"}.get(table, "id")
            cols = [c for c in sorted(VALID_SYNC_COLUMNS.get(table, set())) if c != pk]
            all_cols = [pk] + cols
            col_list = ", ".join(all_cols)
            where = " WHERE key = 'bafoeg_enabled'" if table == "app_settings" else ""
            rows = connection.execute(
                f"SELECT {col_list} FROM {table}{where} ORDER BY {pk}"
            ).fetchall()
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
