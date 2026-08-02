from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from finance_server.db.budgets import (
    create_budget,
    delete_budget,
    list_budgets,
    update_budget,
)


def _make_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE kategorien (
            id INTEGER PRIMARY KEY,
            name TEXT,
            typ TEXT,
            parent_id INTEGER,
            icon TEXT
        );
        CREATE TABLE budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            category_ids TEXT NOT NULL,
            monthly_amount REAL NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE umsaetze (
            id INTEGER PRIMARY KEY,
            kategorie INTEGER,
            amount REAL,
            entry_date TEXT,
            date TEXT,
            created_at TEXT,
            refund_total REAL
        );
    """)
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (1, "Freizeit", "Ausgabe", None, "🎉"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (2, "Gaming", "Ausgabe", 1, "🎮"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (3, "Kino", "Ausgabe", 1, "🎬"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (5, "Essen", "Ausgabe", None, "🍽️"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (4, "Einnahmen", "Einnahme", None, "💰"),
    )
    return conn


def _tx(
    conn: sqlite3.Connection,
    month: str,
    amount: float,
    cat: int | None,
    refund_total: float = 0,
) -> None:
    conn.execute(
        "INSERT INTO umsaetze (kategorie, amount, entry_date, date, created_at, refund_total) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (cat, amount, f"{month}-15", f"{month}-15", f"{month}-15T10:00:00", refund_total),
    )


def _run(conn: sqlite3.Connection, fn):
    with patch("finance_server.db.budgets.get_connection", return_value=conn), \
         patch("finance_server.db.budgets.log_crud_event"):
        return fn()


class TestListBudgets:
    def test_spent_includes_children_and_ignores_other_months_income_refunds(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1], 100.0))
        _tx(conn, "2026-07", -20.0, 2)            # child, counts
        _tx(conn, "2026-07", -10.0, 3)            # child, counts
        _tx(conn, "2026-08", -50.0, 2)            # other month, not counted
        _tx(conn, "2026-07", 500.0, 1)            # income, not counted
        _tx(conn, "2026-07", -30.0, 1, refund_total=10.0)  # net -20

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert len(result) == 1
        assert result[0]["category_ids"] == [1]
        assert result[0]["name"] == "Test"
        assert result[0]["categories"] == [{"name": "Freizeit", "icon": "🎉"}]
        assert result[0]["spent"] == 50.0
        assert result[0]["remaining"] == 50.0
        assert result[0]["is_over"] is False

    def test_multiple_categories_sum_spend_and_join_names(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2, 5], 100.0))
        _tx(conn, "2026-07", -20.0, 2)
        _tx(conn, "2026-07", -30.0, 5)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["name"] == "Test"
        assert result[0]["categories"] == [
            {"name": "Essen", "icon": "🍽️"},
            {"name": "Gaming", "icon": "🎮"},
        ]
        assert result[0]["spent"] == 50.0

    def test_parent_and_child_in_same_budget_not_double_counted(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1, 2], 100.0))
        _tx(conn, "2026-07", -20.0, 2)            # both via parent and explicit

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 20.0

    def test_is_over_when_spent_exceeds_budget(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 50.0))
        _tx(conn, "2026-07", -60.0, 2)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 60.0
        assert result[0]["remaining"] == -10.0
        assert result[0]["is_over"] is True

    def test_uncategorized_transactions_not_counted(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 50.0))
        _tx(conn, "2026-07", -30.0, None)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 0.0

    def test_fully_refunded_transaction_counts_as_zero_spend(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 50.0))
        _tx(conn, "2026-07", -30.0, 2, refund_total=30.0)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 0.0
        assert result[0]["remaining"] == 50.0
        assert result[0]["is_over"] is False


class TestCreateBudget:
    def test_duplicate_category_raises(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1], 100.0))

        with pytest.raises(ValueError, match="bereits in einem anderen Budget"):
            _run(conn, lambda: create_budget("Test", [1], 50.0))

    def test_overlapping_categories_across_budgets_raise(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1, 5], 100.0))

        with pytest.raises(ValueError, match="bereits in einem anderen Budget"):
            _run(conn, lambda: create_budget("Test", [5, 2], 50.0))

    def test_rejects_income_category(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Ausgabe-Kategorie"):
            _run(conn, lambda: create_budget("Test", [4], 100.0))

    def test_rejects_unknown_category(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Ausgabe-Kategorie"):
            _run(conn, lambda: create_budget("Test", [999], 100.0))

    def test_rejects_empty_selection(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Mindestens eine Kategorie"):
            _run(conn, lambda: create_budget("Test", [], 100.0))

    def test_rejects_empty_name(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Namen"):
            _run(conn, lambda: create_budget("", [1], 100.0))

    def test_rejects_negative_amount(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="negativ"):
            _run(conn, lambda: create_budget("Test", [1], -5.0))

    def test_create_then_list(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2, 5], 40.0))

        rows = conn.execute("SELECT * FROM budgets").fetchall()
        assert len(rows) == 1
        assert rows[0]["name"] == "Test"
        assert rows[0]["category_ids"] == "[2, 5]"
        assert rows[0]["monthly_amount"] == 40.0


class TestUpdateBudget:
    def test_updates_amount(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 40.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        result = _run(conn, lambda: update_budget(bid, monthly_amount=60.0))

        assert result is not None
        assert result["monthly_amount"] == 60.0

    def test_updates_name_and_categories(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 40.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        result = _run(conn, lambda: update_budget(bid, name="Neu", category_ids=[3, 5]))

        assert result["name"] == "Neu"
        assert result["category_ids"] == [3, 5]

    def test_rejects_overlap_when_moving_categories(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("A", [1], 100.0))
        _run(conn, lambda: create_budget("B", [2], 100.0))
        bid = conn.execute("SELECT id FROM budgets WHERE name = 'B'").fetchone()["id"]

        with pytest.raises(ValueError, match="bereits in einem anderen Budget"):
            _run(conn, lambda: update_budget(bid, category_ids=[1, 2]))

    def test_missing_budget_returns_none(self):
        conn = _make_db()

        assert _run(conn, lambda: update_budget(123, monthly_amount=60.0)) is None


class TestDeleteBudget:
    def test_deletes(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 40.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        assert _run(conn, lambda: delete_budget(bid)) is True
        assert conn.execute("SELECT COUNT(*) FROM budgets").fetchone()[0] == 0

    def test_missing_returns_false(self):
        conn = _make_db()

        assert _run(conn, lambda: delete_budget(123)) is False
