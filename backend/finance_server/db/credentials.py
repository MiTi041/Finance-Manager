from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from finance_server.core.database import get_connection
from finance_server.core.paths import get_credentials_key_path
from .utils import normalize_text


def get_credentials_fernet() -> Fernet:
    key_path = get_credentials_key_path()
    key_path.parent.mkdir(parents=True, exist_ok=True)

    if key_path.exists():
        key = key_path.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        try:
            key_path.chmod(0o600)
        except OSError:
            logging.warning("Could not set permissions on credentials key file: %s", key_path)

    return Fernet(key)


def build_credentials_scope(credentials: dict[str, Any]) -> str:
    bank_key = normalize_text(credentials.get("bank_key"))
    account_name = normalize_text(credentials.get("account_name"))
    username = normalize_text(credentials.get("username"))
    scope_parts = [part for part in (bank_key, account_name or username) if part]
    return ":".join(scope_parts) or username or bank_key or "default"


def _normalize_accounts(accounts: Any) -> list[dict[str, Any]]:
    normalized_accounts: list[dict[str, Any]] = []
    if not isinstance(accounts, list):
        return normalized_accounts

    for account in accounts:
        if not isinstance(account, dict):
            continue

        iban = normalize_text(account.get("iban"))
        if not iban:
            continue

        normalized_accounts.append(
            {
                "iban": iban,
                "account_name": normalize_text(account.get("account_name")) or None,
            }
        )

    return normalized_accounts


def _sync_bank_accounts(
    connection: sqlite3.Connection,
    scope: str,
    accounts: list[dict[str, Any]],
) -> None:
    connection.execute("DELETE FROM bank_accounts WHERE scope = ?", (scope,))

    if not accounts:
        return

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    connection.executemany(
        """
        INSERT INTO bank_accounts (scope, iban, account_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (
                scope,
                account["iban"],
                account.get("account_name"),
                now,
                now,
            )
            for account in accounts
        ],
    )


def _load_bank_accounts(connection: sqlite3.Connection, scope: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT iban, account_name, balance
        FROM bank_accounts
        WHERE scope = ?
        ORDER BY created_at ASC, id ASC
        """,
        (scope,),
    ).fetchall()

    return [
        {
            "iban": row["iban"],
            "account_name": row["account_name"],
            "balance": row["balance"],
        }
        for row in rows
    ]


def save_bank_credentials(credentials: dict[str, Any], scope: str | None = None) -> str:
    resolved_scope = normalize_text(scope) or build_credentials_scope(credentials)
    payload_data = dict(credentials)
    accounts = _normalize_accounts(payload_data.pop("accounts", None))
    payload = json.dumps(payload_data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encrypted = get_credentials_fernet().encrypt(payload)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT created_at FROM bank_credentials WHERE scope = ?",
            (resolved_scope,),
        ).fetchone()

        created_at = existing[0] if existing else now
        connection.execute(
            """
            INSERT INTO bank_credentials (scope, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(scope) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (resolved_scope, encrypted, created_at, now),
        )

        if accounts:
            _sync_bank_accounts(connection, resolved_scope, accounts)

    return resolved_scope


def _decrypt_bank_credentials_row(row: sqlite3.Row) -> dict[str, Any] | None:
    try:
        decrypted = get_credentials_fernet().decrypt(row["payload"])
        payload = json.loads(decrypted.decode("utf-8"))
        if not isinstance(payload, dict):
            return None
        payload["scope"] = row["scope"]
        payload["created_at"] = row["created_at"]
        payload["updated_at"] = row["updated_at"]
        return payload
    except (InvalidToken, json.JSONDecodeError, UnicodeDecodeError):
        return None


def load_bank_credentials(scope: str | None = None) -> dict[str, Any] | None:
    with get_connection() as connection:
        if scope:
            row = connection.execute(
                "SELECT scope, payload, created_at, updated_at FROM bank_credentials WHERE scope = ?",
                (scope,),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT scope, payload, created_at, updated_at FROM bank_credentials ORDER BY created_at DESC, updated_at DESC LIMIT 1",
            ).fetchone()

    if row is None:
        return None

    payload = _decrypt_bank_credentials_row(row)
    if payload is None:
        return None

    with get_connection() as connection:
        accounts = _load_bank_accounts(connection, payload["scope"])

    if accounts:
        payload["accounts"] = accounts
        if not payload.get("account_iban"):
            payload["account_iban"] = accounts[0]["iban"]
        if not payload.get("account_name"):
            payload["account_name"] = accounts[0].get("account_name")
    elif isinstance(payload.get("accounts"), list):
        payload["accounts"] = _normalize_accounts(payload.get("accounts"))

    return payload


def list_bank_credentials() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT scope, payload, created_at, updated_at FROM bank_credentials ORDER BY created_at DESC, updated_at DESC",
        ).fetchall()

    credentials: list[dict[str, Any]] = []
    for row in rows:
        payload = _decrypt_bank_credentials_row(row)
        if payload is not None:
            with get_connection() as connection:
                accounts = _load_bank_accounts(connection, payload["scope"])
            if accounts:
                payload["accounts"] = accounts
                if not payload.get("account_iban"):
                    payload["account_iban"] = accounts[0]["iban"]
                if not payload.get("account_name"):
                    payload["account_name"] = accounts[0].get("account_name")
            credentials.append(payload)

    return credentials


def bank_credentials_configured(scope: str | None = None) -> bool:
    return load_bank_credentials(scope) is not None


def delete_bank_credentials(scope: str | None = None) -> None:
    if scope:
        creds = load_bank_credentials(scope)
    else:
        all_creds = list_bank_credentials()
    
    with get_connection() as connection:
        if scope:
            connection.execute("DELETE FROM bank_credentials WHERE scope = ?", (scope,))
        else:
            connection.execute("DELETE FROM bank_credentials")
    
    try:
        from finance_server.fints.client import clear_state_files_for_creds
        from finance_server.models.bank import BankCredentials

        if scope:
            if creds:
                clear_state_files_for_creds(BankCredentials(
                    bank_key=creds.get("bank_key", ""),
                    username=creds.get("username", ""),
                    pin="x",
                ))
        else:
            for c in all_creds:
                clear_state_files_for_creds(BankCredentials(
                    bank_key=c.get("bank_key", ""),
                    username=c.get("username", ""),
                    pin="x",
                ))
    except Exception:
        logging.warning("FinTS state file could not be cleared", exc_info=True)


def list_bank_accounts(scope: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        return _load_bank_accounts(connection, scope)


def upsert_bank_accounts(scope: str, accounts: list[dict[str, Any]]) -> None:
    normalized_accounts = _normalize_accounts(accounts)
    with get_connection() as connection:
        _sync_bank_accounts(connection, scope, normalized_accounts)


def update_bank_account(scope: str, iban: str, account_name: str | None = None, account_iban: str | None = None) -> bool:
    normalized_iban = normalize_text(iban)
    if not normalized_iban:
        return False

    with get_connection() as connection:
        row = connection.execute(
            "SELECT iban FROM bank_accounts WHERE scope = ? AND UPPER(iban) = UPPER(?)",
            (scope, normalized_iban),
        ).fetchone()

        if row is None:
            return False

        new_iban = normalize_text(account_iban) or row["iban"]
        new_name = normalize_text(account_name) or None
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        connection.execute(
            """
            UPDATE bank_accounts
            SET iban = ?, account_name = ?, updated_at = ?
            WHERE scope = ? AND UPPER(iban) = UPPER(?)
            """,
            (new_iban, new_name, now, scope, normalized_iban),
        )
        return True


def compute_and_store_balance_corrections(
    scope: str, balances: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Berechnet und speichert die Saldo-Korrektur für alle übergebenen Kontosalden.
    correction = bank_balance - SUM(lokale_transaktionen)
    """
    from .transactions import fetch_transaction_balance

    results: list[dict[str, Any]] = []
    for entry in balances:
        iban = entry.get("iban")
        bank_balance = entry.get("amount")
        if iban and bank_balance is not None:
            try:
                transaction_sum = fetch_transaction_balance(iban)
                correction = float(bank_balance) - transaction_sum
                update_account_balance(scope, iban, correction)
                results.append({
                    "iban": iban,
                    "correction": correction,
                    "bank_balance": float(bank_balance),
                })
            except Exception:
                logging.exception("Saldo-Korrektur fehlgeschlagen für IBAN=%s", iban)
    return results


def update_account_balance(scope: str, iban: str, balance: float) -> bool:
    normalized_iban = normalize_text(iban)
    if not normalized_iban:
        return False

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE bank_accounts
            SET balance = ?, updated_at = ?
            WHERE scope = ? AND UPPER(iban) = UPPER(?)
            """,
            (balance, now, scope, normalized_iban),
        )
        return cursor.rowcount > 0


def delete_bank_account(scope: str, iban: str) -> bool:
    normalized_iban = normalize_text(iban)
    if not normalized_iban:
        return False

    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM bank_accounts WHERE scope = ? AND UPPER(iban) = UPPER(?)",
            (scope, normalized_iban),
        )
        return cursor.rowcount > 0
