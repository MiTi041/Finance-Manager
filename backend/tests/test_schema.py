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
