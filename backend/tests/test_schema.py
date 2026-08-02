import sqlite3

from finance_server.core.schema import initialize_database


def test_initialize_database_creates_budgets_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(budgets)")}
    assert {"id", "category_ids", "monthly_amount", "created_at", "updated_at"} <= cols
    conn.close()


def test_initialize_database_migrates_legacy_budgets():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id    INTEGER NOT NULL UNIQUE,
            monthly_amount REAL NOT NULL,
            created_at     TEXT,
            updated_at     TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO budgets (category_id, monthly_amount) VALUES (?, ?)", (7, 50.0)
    )
    initialize_database(conn)
    row = conn.execute("SELECT category_ids, monthly_amount FROM budgets").fetchone()
    assert row["category_ids"] == "[7]"
    assert row["monthly_amount"] == 50.0
    conn.close()


def test_initialize_database_migrates_legacy_refund_links():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE umsaetze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_iban TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT,
            entry_date TEXT,
            created_at TEXT,
            transaction_hash TEXT NOT NULL UNIQUE,
            refund_ref_transaction_id INTEGER,
            refund_total REAL NOT NULL DEFAULT 0
        );
        """
    )
    conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash, refund_ref_transaction_id) "
        "VALUES ('DE1', 50.0, '2026-07-01', '2026-07-01', '2026-07-01T10:00:00', 'h-ref', 2)"
    )
    conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash, refund_ref_transaction_id) "
        "VALUES ('DE1', -30.0, '2026-07-02', '2026-07-02', '2026-07-02T10:00:00', 'h-exp', NULL)"
    )
    initialize_database(conn)

    cols = {row[1] for row in conn.execute("PRAGMA table_info(umsaetze)")}
    assert "refund_ref_transaction_id" not in cols
    link = conn.execute("SELECT * FROM refund_links").fetchone()
    assert link["refund_transaction_id"] == 1
    assert link["expense_transaction_id"] == 2
    assert link["amount"] == 50.0
    exp_total = conn.execute("SELECT refund_total FROM umsaetze WHERE id = 2").fetchone()["refund_total"]
    assert exp_total == 50.0
    conn.close()


def test_initialize_database_creates_refund_links_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(refund_links)")}
    assert {"id", "refund_transaction_id", "expense_transaction_id", "amount", "created_at"} <= cols
    assert "refund_ref_transaction_id" not in {row[1] for row in conn.execute("PRAGMA table_info(umsaetze)")}
    conn.close()
