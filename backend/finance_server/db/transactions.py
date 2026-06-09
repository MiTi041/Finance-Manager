from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable
import sqlite3

from finance_server.core.database import get_connection
from .utils import build_transaction_hash, normalize_local_amount, normalize_text


def to_row_payload(tx: dict[str, Any]) -> dict[str, Any]:
    data = tx.get("data", {}) if isinstance(tx.get("data"), dict) else {}
    account = tx.get("account", {}) if isinstance(tx.get("account"), dict) else {}

    payload = {
        "account_iban": normalize_text(account.get("iban")),
        "account_bic": normalize_text(account.get("bic")),
        "account_accountnumber": normalize_text(account.get("accountnumber")),
        "account_subaccount": normalize_text(account.get("subaccount")),
        "account_blz": normalize_text(account.get("blz")),
        "status": normalize_text(data.get("status")),
        "funds_code": normalize_text(data.get("funds_code")),
        "transaction_id": normalize_text(data.get("id")),
        "customer_reference": normalize_text(data.get("customer_reference")),
        "bank_reference": normalize_text(data.get("bank_reference")),
        "extra_details": normalize_text(data.get("extra_details")),
        "date": normalize_text(data.get("date")),
        "entry_date": normalize_text(data.get("entry_date")),
        "guessed_entry_date": normalize_text(data.get("guessed_entry_date")),
        "transaction_reference": normalize_text(data.get("transaction_reference")),
        "transaction_code": normalize_text(data.get("transaction_code")),
        "posting_text": normalize_text(data.get("posting_text")),
        "prima_nota": normalize_text(data.get("prima_nota")),
        "purpose": normalize_text(data.get("purpose")),
        "applicant_bic": normalize_text(data.get("applicant_bic")),
        "applicant_iban": normalize_text(data.get("applicant_iban")),
        "applicant_name": normalize_text(data.get("applicant_name")),
        "return_debit_notes": normalize_text(data.get("return_debit_notes")),
        "recipient_name": normalize_text(data.get("recipient_name")),
        "additional_purpose": normalize_text(data.get("additional_purpose")),
        "gvc_applicant_iban": normalize_text(data.get("gvc_applicant_iban")),
        "gvc_applicant_bic": normalize_text(data.get("gvc_applicant_bic")),
        "end_to_end_reference": normalize_text(data.get("end_to_end_reference")),
        "additional_position_reference": normalize_text(data.get("additional_position_reference")),
        "applicant_creditor_id": normalize_text(data.get("applicant_creditor_id")),
        "purpose_code": normalize_text(data.get("purpose_code")),
        "additional_position_date": normalize_text(data.get("additional_position_date")),
        "deviate_applicant": normalize_text(data.get("deviate_applicant")),
        "deviate_recipient": normalize_text(data.get("deviate_recipient")),
        "FRST_ONE_OFF_RECC": normalize_text(data.get("FRST_ONE_OFF_RECC")),
        "old_SEPA_CI": normalize_text(data.get("old_SEPA_CI")),
        "old_SEPA_additional_position_reference": normalize_text(data.get("old_SEPA_additional_position_reference")),
        "settlement_tag": normalize_text(data.get("settlement_tag")),
        "debitor_identifier": normalize_text(data.get("debitor_identifier")),
        "original_amount": normalize_local_amount(data.get("original_amount")),
        "amount": normalize_local_amount(data.get("amount")),
        "currency": normalize_text(data.get("currency")),
        "dummy_entry": 1 if data.get("dummy_entry") else 0,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }

    payload["transaction_hash"] = build_transaction_hash(payload)
    return payload


def insert_transactions(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    normalized_rows = [to_row_payload(row) for row in rows]
    normalized_rows = [row for row in normalized_rows if abs(row["amount"]) > 0.0001]

    if not normalized_rows:
        return {"received": 0, "inserted": 0, "ignored": 0}

    with get_connection() as connection:
        cursor = connection.executemany(
            """
            INSERT OR IGNORE INTO umsaetze (
                account_iban, account_bic, account_accountnumber, account_subaccount, account_blz,
                status, funds_code, transaction_id, customer_reference, bank_reference, extra_details,
                date, entry_date, guessed_entry_date,
                transaction_reference, transaction_code, posting_text, prima_nota, purpose,
                applicant_bic, applicant_iban, applicant_name, return_debit_notes, recipient_name,
                additional_purpose, gvc_applicant_iban, gvc_applicant_bic, end_to_end_reference,
                additional_position_reference, applicant_creditor_id, purpose_code,
                additional_position_date, deviate_applicant, deviate_recipient,
                FRST_ONE_OFF_RECC, old_SEPA_CI, old_SEPA_additional_position_reference,
                settlement_tag, debitor_identifier, original_amount, amount, currency,
                dummy_entry,
                transaction_hash, created_at
            )
            VALUES (
                :account_iban, :account_bic, :account_accountnumber, :account_subaccount, :account_blz,
                :status, :funds_code, :transaction_id, :customer_reference, :bank_reference, :extra_details,
                :date, :entry_date, :guessed_entry_date,
                :transaction_reference, :transaction_code, :posting_text, :prima_nota, :purpose,
                :applicant_bic, :applicant_iban, :applicant_name, :return_debit_notes, :recipient_name,
                :additional_purpose, :gvc_applicant_iban, :gvc_applicant_bic, :end_to_end_reference,
                :additional_position_reference, :applicant_creditor_id, :purpose_code,
                :additional_position_date, :deviate_applicant, :deviate_recipient,
                :FRST_ONE_OFF_RECC, :old_SEPA_CI, :old_SEPA_additional_position_reference,
                :settlement_tag, :debitor_identifier, :original_amount, :amount, :currency,
                :dummy_entry,
                :transaction_hash, :created_at
            )
            """,
            normalized_rows,
        )
        inserted = cursor.rowcount if cursor.rowcount >= 0 else 0

    received = len(normalized_rows)
    return {
        "received": received,
        "inserted": inserted,
        "ignored": max(0, received - inserted),
    }


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "transaction_hash": row["transaction_hash"],
        "account_iban": row["account_iban"],
        "account_bic": row["account_bic"],
        "account_accountnumber": row["account_accountnumber"],
        "account_subaccount": row["account_subaccount"],
        "account_blz": row["account_blz"],
        "status": row["status"],
        "funds_code": row["funds_code"],
        "transaction_id": row["transaction_id"],
        "customer_reference": row["customer_reference"],
        "bank_reference": row["bank_reference"],
        "extra_details": row["extra_details"],
        "date": row["date"],
        "entry_date": row["entry_date"],
        "guessed_entry_date": row["guessed_entry_date"],
        "transaction_reference": row["transaction_reference"],
        "transaction_code": row["transaction_code"],
        "posting_text": row["posting_text"],
        "prima_nota": row["prima_nota"],
        "purpose": row["purpose"],
        "applicant_bic": row["applicant_bic"],
        "applicant_iban": row["applicant_iban"],
        "applicant_name": row["applicant_name"],
        "return_debit_notes": row["return_debit_notes"],
        "recipient_name": row["recipient_name"],
        "additional_purpose": row["additional_purpose"],
        "gvc_applicant_iban": row["gvc_applicant_iban"],
        "gvc_applicant_bic": row["gvc_applicant_bic"],
        "end_to_end_reference": row["end_to_end_reference"],
        "additional_position_reference": row["additional_position_reference"],
        "applicant_creditor_id": row["applicant_creditor_id"],
        "purpose_code": row["purpose_code"],
        "additional_position_date": row["additional_position_date"],
        "deviate_applicant": row["deviate_applicant"],
        "deviate_recipient": row["deviate_recipient"],
        "FRST_ONE_OFF_RECC": row["FRST_ONE_OFF_RECC"],
        "old_SEPA_CI": row["old_SEPA_CI"],
        "old_SEPA_additional_position_reference": row["old_SEPA_additional_position_reference"],
        "settlement_tag": row["settlement_tag"],
        "debitor_identifier": row["debitor_identifier"],
        "original_amount": row["original_amount"],
        "amount": row["amount"],
        "currency": row["currency"],
        "dummy_entry": bool(row["dummy_entry"]),
        "kategorie": row["kategorie"],
        "note": row["note"],
        "created_at": row["created_at"],
        "bank_deleted": bool(dict(row).get("bank_deleted", False)),
    }


def fetch_transactions(
    days: int | None,
    account_iban: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict[str, Any]]:
    query_parts = [
        "SELECT u.*, "
        "CASE WHEN ba.iban IS NULL THEN 1 ELSE 0 END as bank_deleted "
        "FROM umsaetze u "
        "LEFT JOIN (SELECT DISTINCT iban FROM bank_accounts) ba ON u.account_iban = ba.iban"
    ]
    params: list[Any] = []

    if from_date or to_date:
        query_parts.append("WHERE 1=1")
        if from_date:
                query_parts.append(
                    "AND COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?"
                )
                params.append(from_date)
        if to_date:
                query_parts.append(
                    "AND COALESCE(entry_date, date, substr(created_at, 1, 10)) <= ?"
                )
                params.append(to_date)
    else:
        if days is None:
            days = 36500

        days = max(1, days)
        cutoff_date = (date.today() - timedelta(days=days - 1)).isoformat()
        query_parts.append(
            "WHERE COALESCE(entry_date, date, substr(created_at, 1, 10)) >= ?"
        )
        params.append(cutoff_date)

    if account_iban:
        query_parts.append("AND account_iban = ?")
        params.append(account_iban)

    query_parts.append(
        "ORDER BY COALESCE(entry_date, date, substr(created_at, 1, 10)) DESC, id DESC"
    )

    with get_connection() as connection:
        rows = connection.execute("\n".join(query_parts), params).fetchall()

    return [row_to_dict(row) for row in rows]

def fetch_latest_transaction(
    iban: str | None = None,
    account_blz: str | None = None,
) -> dict[str, Any] | None:
    query_parts = ["SELECT * FROM umsaetze"]
    params: list[Any] = []

    if iban:
        query_parts.append("WHERE account_iban = ?")
        params.append(iban)
    elif account_blz:
        query_parts.append("WHERE account_blz = ?")
        params.append(account_blz)

    query_parts.append(
        "ORDER BY COALESCE(entry_date, date, substr(created_at, 1, 10)) DESC, id DESC LIMIT 1"
    )

    with get_connection() as connection:
        row = connection.execute("\n".join(query_parts), params).fetchone()
    return row_to_dict(row) if row else None


def fetch_transaction_balance(account_iban: str) -> float:
    normalized_iban = normalize_text(account_iban)
    if not normalized_iban:
        return 0.0

    with get_connection() as connection:
        row = connection.execute(
            "SELECT COALESCE(SUM(amount), 0) AS balance FROM umsaetze WHERE UPPER(account_iban) = UPPER(?)",
            (normalized_iban,),
        ).fetchone()

    if row is None:
        return 0.0

    try:
        return float(row["balance"] or 0)
    except Exception:
        return 0.0


def delete_transaction(transaction_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM umsaetze WHERE id = ?", (transaction_id,))
        return cursor.rowcount > 0


def delete_transactions_batch(transaction_ids: list[int]) -> int:
    if not transaction_ids:
        return 0
    placeholders = ",".join("?" for _ in transaction_ids)
    with get_connection() as connection:
        cursor = connection.execute(
            f"DELETE FROM umsaetze WHERE id IN ({placeholders})",
            transaction_ids,
        )
        return cursor.rowcount


def update_transaction_note(transaction_id: int, note: str | None) -> bool:
    normalized_note = normalize_text(note)
    stored_note = normalized_note if normalized_note else None

    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE umsaetze SET note = ? WHERE id = ?",
            (stored_note, transaction_id),
        )
        return cursor.rowcount > 0
