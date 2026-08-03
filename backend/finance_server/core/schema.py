from __future__ import annotations

import sqlite3
from typing import Any

from datetime import datetime, timezone

from finance_server.core.seed_data import SEED_CATEGORIES_SQL, SEED_ZAHLUNGSPARTNER_SQL, SEED_IBANS_SQL


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


def create_refund_links_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS refund_links (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            refund_transaction_id INTEGER NOT NULL,
            expense_transaction_id INTEGER NOT NULL,
            amount                REAL NOT NULL CHECK (amount > 0),
            created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_refund_links_refund ON refund_links(refund_transaction_id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_refund_links_expense ON refund_links(expense_transaction_id)"
    )


def migrate_refund_links(connection: sqlite3.Connection) -> None:
    cols = {row[1] for row in connection.execute("PRAGMA table_info(umsaetze)").fetchall()}
    if "refund_ref_transaction_id" in cols:
        connection.execute(
            """
            INSERT INTO refund_links (refund_transaction_id, expense_transaction_id, amount, created_at)
            SELECT id, refund_ref_transaction_id, amount, created_at
            FROM umsaetze
            WHERE refund_ref_transaction_id IS NOT NULL AND amount > 0
            """
        )
        connection.execute("ALTER TABLE umsaetze DROP COLUMN refund_ref_transaction_id")
    connection.execute(
        """
        UPDATE umsaetze SET refund_total = (
            SELECT COALESCE(SUM(amount), 0)
            FROM refund_links
            WHERE expense_transaction_id = umsaetze.id
        ) WHERE amount < 0
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
        CREATE TABLE IF NOT EXISTS zahlungspartner (
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
            f_zahlungspartner_id INTEGER NOT NULL,
            FOREIGN KEY (f_zahlungspartner_id) REFERENCES zahlungspartner (id)
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ibans_f_zahlungspartner_id
        ON ibans (f_zahlungspartner_id)
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
        "zahlungspartner",
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
            icon TEXT,
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


def create_belege_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS belege (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            umsatz_id INTEGER NOT NULL,
            image_filename TEXT NOT NULL,
            image_path TEXT NOT NULL,
            extracted_data TEXT,
            store_name TEXT,
            total_amount REAL,
            receipt_date TEXT,
            confidence REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (umsatz_id) REFERENCES umsaetze (id) ON DELETE CASCADE
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_belege_umsatz_id
        ON belege (umsatz_id)
        """
    )


def create_app_settings_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def create_subscription_identities_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS subscription_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            counterparty_name TEXT NOT NULL,
            amount REAL NOT NULL,
            display_name TEXT,
            f_zahlungspartner_id INTEGER,
            dismissed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (f_zahlungspartner_id) REFERENCES zahlungspartner (id) ON DELETE SET NULL,
            UNIQUE(counterparty_name, amount)
        )
        """
    )


def create_allocation_buckets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_buckets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket_type TEXT NOT NULL CHECK(bucket_type IN (
                'bafoeg', 'emergency', 'invest', 'donation', 'spending'
            )),
            percentage           REAL NOT NULL DEFAULT 0 CHECK(percentage >= 0 AND percentage <= 100),
            recipient_account_id INTEGER,
            sender_iban          TEXT,
            is_active            INTEGER NOT NULL DEFAULT 1,
            sort_order           INTEGER NOT NULL DEFAULT 0,
            created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipient_account_id) REFERENCES empfaengerkonten(id) ON DELETE SET NULL,
            UNIQUE(bucket_type)
        )
    """)


def create_allocation_bafoeg_config_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_bafoeg_config (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            total_debt      REAL NOT NULL DEFAULT 7600,
            monthly_rate    REAL NOT NULL DEFAULT 267,
            interest_rate   REAL NOT NULL DEFAULT 2.0,
            payout_date     TEXT,
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)


def create_savings_plans_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS savings_plans (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            tag             TEXT,
            target_amount   REAL,
            target_date     TEXT,
            target_recipient_name   TEXT,
            target_recipient_iban   TEXT,
            target_recipient_bic    TEXT,
            is_visible      INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

def create_budgets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL DEFAULT '',
            category_ids   TEXT NOT NULL,
            amount         REAL NOT NULL CHECK(amount >= 0),
            period         TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
            created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    _ensure_table_columns(
        connection,
        "budgets",
        {"name": "TEXT NOT NULL DEFAULT ''", "period": "TEXT NOT NULL DEFAULT 'monthly'"},
    )
    existing = {row[1] for row in connection.execute("PRAGMA table_info(budgets)")}
    if "category_id" in existing or "monthly_amount" in existing:
        connection.execute("ALTER TABLE budgets RENAME TO budgets_old")
        connection.execute("""
            CREATE TABLE budgets (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                name           TEXT NOT NULL DEFAULT '',
                category_ids   TEXT NOT NULL,
                amount         REAL NOT NULL CHECK(amount >= 0),
                period         TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
                created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        old_cols = {row[1] for row in connection.execute("PRAGMA table_info(budgets_old)")}
        cat_expr = "'[' || category_id || ']'" if "category_id" in old_cols else "category_ids"
        connection.execute(
            f"""
            INSERT INTO budgets (id, category_ids, amount, period, created_at, updated_at)
            SELECT id, {cat_expr}, monthly_amount, 'monthly',
                   COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
            FROM budgets_old
            """
        )
        connection.execute("DROP TABLE budgets_old")


def create_allocation_runs_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_runs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            month           TEXT NOT NULL,
            net_income      REAL NOT NULL,
            total_allocated REAL NOT NULL,
            status          TEXT NOT NULL DEFAULT 'calculated'
                CHECK(status IN ('calculated', 'partial', 'completed')),
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)


def create_allocation_run_buckets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_run_buckets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id          INTEGER NOT NULL,
            bucket_id       INTEGER NOT NULL,
            target_amount   REAL NOT NULL,
            transferred     REAL NOT NULL DEFAULT 0,
            transferred_at  TEXT,
            is_completed    INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (run_id) REFERENCES allocation_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (bucket_id) REFERENCES allocation_buckets(id) ON DELETE CASCADE
        )
    """)


def migrate_subscription_identities(connection: sqlite3.Connection) -> None:
    _ensure_table_columns(
        connection,
        "subscription_identities",
        {
            "dismissed": "INTEGER NOT NULL DEFAULT 0",
        },
    )


def create_sync_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_ops (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL,
            seq         INTEGER NOT NULL,
            table_name  TEXT NOT NULL,
            row_id      INTEGER,
            op_type     TEXT NOT NULL CHECK(op_type IN ('INSERT', 'UPDATE', 'DELETE')),
            data        TEXT,
            checksum    TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_ops_device_seq ON sync_ops(device_id, seq)"
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_sync_ops_id ON sync_ops(id)")

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            key   TEXT PRIMARY KEY,
            value TEXT
        )
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
            "splits": "TEXT",
        },
    )
    create_reference_tables(connection)
    migrate_reference_tables(connection)
    create_categories_table(connection)

    for table, sql in [
        ("kategorien", SEED_CATEGORIES_SQL),
        ("zahlungspartner", SEED_ZAHLUNGSPARTNER_SQL),
        ("ibans", SEED_IBANS_SQL),
    ]:
        row_count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if row_count == 0:
            connection.executescript(sql)

    _ensure_table_columns(
        connection,
        "bank_accounts",
        {
            "balance": "REAL",
        },
    )

    _ensure_table_columns(
        connection,
        "umsaetze",
        {
            "refund_total": "REAL NOT NULL DEFAULT 0",
        },
    )

    create_refund_links_table(connection)
    migrate_refund_links(connection)

    create_belege_table(connection)
    create_subscription_identities_table(connection)
    migrate_subscription_identities(connection)
    create_app_settings_table(connection)
    create_allocation_buckets_table(connection)
    create_allocation_bafoeg_config_table(connection)
    _ensure_table_columns(
        connection,
        "allocation_bafoeg_config",
        {
            "current_balance": "REAL NOT NULL DEFAULT 0",
            "anlagezinsen": "REAL NOT NULL DEFAULT 0",
        },
    )
    _ensure_table_columns(
        connection,
        "allocation_buckets",
        {
            "target_amount": "REAL",
            "target_months": "REAL",
            "recipient_iban": "TEXT",
        },
    )
    create_savings_plans_table(connection)
    _ensure_table_columns(
        connection,
        "savings_plans",
        {
            "tag": "TEXT",
            "target_recipient_name": "TEXT",
            "target_recipient_iban": "TEXT",
            "target_recipient_bic": "TEXT",
            "sender_iban": "TEXT",
            "auto_hidden": "INTEGER NOT NULL DEFAULT 0",
        },
    )
    create_allocation_runs_table(connection)
    create_allocation_run_buckets_table(connection)
    create_budgets_table(connection)

    row_count = connection.execute("SELECT COUNT(*) FROM allocation_buckets").fetchone()[0]
    if row_count == 0:
        default_buckets = [
            ("bafoeg", 0.0, None, None, 0, 0),
            ("emergency", 30.0, None, None, 1, 1),
            ("invest", 30.0, None, None, 1, 2),
            ("donation", 10.0, None, None, 1, 3),
            ("spending", 30.0, None, None, 1, 4),
        ]
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        for bt, pct, ra_id, s_iban, active, order in default_buckets:
            connection.execute(
                """INSERT INTO allocation_buckets
                   (bucket_type, percentage, recipient_account_id, sender_iban, is_active, sort_order, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (bt, pct, ra_id, s_iban, active, order, now, now),
            )

    create_sync_tables(connection)

    _ensure_table_columns(
        connection,
        "kategorien",
        {
            "updated_at": "TEXT",
        },
    )

    _ensure_table_columns(
        connection,
        "zahlungspartner",
        {
            "updated_at": "TEXT",
        },
    )

    _ensure_table_columns(
        connection,
        "umsaetze",
        {
            "updated_at": "TEXT",
        },
    )
    connection.execute(
        "UPDATE umsaetze SET updated_at = created_at WHERE updated_at IS NULL"
    )
