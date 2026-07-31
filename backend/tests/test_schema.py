import sqlite3

from finance_server.core.schema import initialize_database


def test_initialize_database_creates_budgets_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(budgets)")}
    assert {"id", "category_id", "monthly_amount", "created_at", "updated_at"} <= cols
    conn.close()
