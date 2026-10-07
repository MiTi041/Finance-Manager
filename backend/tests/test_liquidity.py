from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from finance_server.core.schema import create_liquidity_entries_table
from finance_server.db.liquidity import (
    create_entry,
    delete_entry,
    list_entries,
    update_entry,
)


def _make_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    create_liquidity_entries_table(conn)
    return conn


def _run(conn: sqlite3.Connection, fn):
    with patch("finance_server.db.liquidity.get_connection", return_value=conn), \
         patch("finance_server.db.liquidity.log_crud_event"):
        return fn()


class TestCreateEntry:
    def test_create_then_list(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Geschenke", 100.0, "expense", "certain"))

        assert created["label"] == "Geschenke"
        assert created["amount"] == 100.0
        assert created["kind"] == "expense"
        assert created["certainty"] == "certain"

        rows = _run(conn, list_entries)
        assert len(rows) == 1
        assert rows[0]["label"] == "Geschenke"

    def test_rejects_empty_label(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Bezeichnung"):
            _run(conn, lambda: create_entry("  ", 100.0, "expense", "certain"))

    def test_rejects_negative_amount(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="negativ"):
            _run(conn, lambda: create_entry("Test", -5.0, "expense", "certain"))

    def test_rejects_invalid_kind(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Art"):
            _run(conn, lambda: create_entry("Test", 5.0, "transfer", "certain"))

    def test_rejects_invalid_certainty(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Sicherheit"):
            _run(conn, lambda: create_entry("Test", 5.0, "expense", "maybe"))


class TestUpdateEntry:
    def test_updates_amount_and_kind(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Test", 40.0, "expense", "certain"))
        updated = _run(conn, lambda: update_entry(created["id"], amount=60.0, kind="income"))

        assert updated["amount"] == 60.0
        assert updated["kind"] == "income"
        assert updated["certainty"] == "certain"

    def test_missing_returns_none(self):
        conn = _make_db()
        assert _run(conn, lambda: update_entry(123, amount=60.0)) is None


class TestDeleteEntry:
    def test_deletes(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Test", 40.0, "expense", "certain"))

        assert _run(conn, lambda: delete_entry(created["id"])) is True
        assert _run(conn, list_entries) == []

    def test_missing_returns_false(self):
        conn = _make_db()
        assert _run(conn, lambda: delete_entry(123)) is False
