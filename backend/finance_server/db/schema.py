from __future__ import annotations

import csv
import io
import sqlite3
from typing import Any




def create_umsaetze_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS umsaetze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_iban TEXT NOT NULL,
            account_bic TEXT,
            account_accountnumber TEXT,
            account_subaccount TEXT,
            account_blz TEXT,
            status TEXT,
            funds_code TEXT,
            transaction_id TEXT,
            customer_reference TEXT,
            bank_reference TEXT,
            extra_details TEXT,
            date TEXT,
            entry_date TEXT,
            guessed_entry_date TEXT,
            transaction_reference TEXT,
            transaction_code TEXT,
            posting_text TEXT,
            prima_nota TEXT,
            purpose TEXT,
            additional_purpose TEXT,
            end_to_end_reference TEXT,
            additional_position_reference TEXT,
            additional_position_date TEXT,
            applicant_bic TEXT,
            applicant_iban TEXT,
            applicant_name TEXT,
            recipient_name TEXT,
            deviate_applicant TEXT,
            deviate_recipient TEXT,
            gvc_applicant_iban TEXT,
            gvc_applicant_bic TEXT,
            applicant_creditor_id TEXT,
            debitor_identifier TEXT,
            return_debit_notes TEXT,
            purpose_code TEXT,
            FRST_ONE_OFF_RECC TEXT,
            old_SEPA_CI TEXT,
            old_SEPA_additional_position_reference TEXT,
            settlement_tag TEXT,
            original_amount REAL,
            amount REAL NOT NULL,
            currency TEXT,
            dummy_entry INTEGER NOT NULL DEFAULT 0,
            transaction_hash TEXT NOT NULL UNIQUE,
            kategorie INTEGER,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_umsaetze_latest
        ON umsaetze (
            COALESCE(entry_date, date, created_at)
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_umsaetze_konto
        ON umsaetze (account_iban)
        """
    )


def create_bank_credentials_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS bank_credentials (
            scope TEXT PRIMARY KEY,
            payload BLOB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


def create_bank_accounts_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL,
            iban TEXT NOT NULL,
            account_name TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(scope, iban),
            FOREIGN KEY (scope) REFERENCES bank_credentials (scope) ON DELETE CASCADE
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bank_accounts_scope
        ON bank_accounts (scope)
        """
    )


def create_reference_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS kontoinhaber (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            website TEXT,
            logo_url TEXT,
            local_logo_path TEXT,
            logo_white_background INTEGER NOT NULL DEFAULT 0,
            logo_padding INTEGER NOT NULL DEFAULT 0,
            is_company INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS ibans (
            iban TEXT PRIMARY KEY,
            f_kontoinhaber_id INTEGER NOT NULL,
            FOREIGN KEY (f_kontoinhaber_id) REFERENCES kontoinhaber (id)
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ibans_f_kontoinhaber_id
        ON ibans (f_kontoinhaber_id)
        """
    )

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS empfaengerkonten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL,
            iban TEXT NOT NULL UNIQUE,
            bic TEXT,
            recipient_name TEXT NOT NULL,
            is_donation_account INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_empfaengerkonten_account_name
        ON empfaengerkonten (account_name)
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_empfaengerkonten_recipient_name
        ON empfaengerkonten (recipient_name)
        """
    )


def _ensure_table_columns(
    connection: sqlite3.Connection,
    table_name: str,
    columns: dict[str, str],
) -> None:
    existing_columns = {
        row[1] for row in connection.execute(f"PRAGMA table_info({table_name})")
    }

    for column_name, column_definition in columns.items():
        if column_name in existing_columns:
            continue

        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )


def migrate_reference_tables(connection: sqlite3.Connection) -> None:
    _ensure_table_columns(
        connection,
        "kontoinhaber",
        {
            "website": "TEXT",
            "logo_url": "TEXT",
            "local_logo_path": "TEXT",
            "logo_white_background": "INTEGER NOT NULL DEFAULT 0",
            "logo_padding": "INTEGER NOT NULL DEFAULT 0",
            "is_company": "INTEGER NOT NULL DEFAULT 1",
        },
    )

    _ensure_table_columns(
        connection,
        "empfaengerkonten",
        {
            "bic": "TEXT",
            "is_donation_account": "INTEGER NOT NULL DEFAULT 0",
        },
    )


def create_categories_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS kategorien (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            typ TEXT NOT NULL,
            parent_id INTEGER,
            personal_expense INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (parent_id) REFERENCES kategorien (id) ON DELETE SET NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_kategorien_parent_id
        ON kategorien (parent_id)
        """
    )
    

def initialize_database(connection: sqlite3.Connection) -> None:
    create_umsaetze_table(connection)
    create_bank_credentials_table(connection)
    create_bank_accounts_table(connection)
    _ensure_table_columns(
        connection,
        "umsaetze",
        {
            "dummy_entry": "INTEGER NOT NULL DEFAULT 0",
            "note": "TEXT",
        },
    )
    create_reference_tables(connection)
    migrate_reference_tables(connection)
    create_categories_table(connection)
