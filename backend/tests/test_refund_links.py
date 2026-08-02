from __future__ import annotations

import pytest
from unittest.mock import patch

from finance_server.db.transactions import add_refund_link, delete_refund_link


def _ins(conn, amount: float, hash_suffix: str) -> int:
    cursor = conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash) "
        "VALUES ('DE1', ?, '2026-07-15', '2026-07-15', '2026-07-15T10:00:00', ?)",
        (amount, f"h-{hash_suffix}"),
    )
    return cursor.lastrowid


def _run(conn, fn):
    with patch("finance_server.db.transactions.get_connection", return_value=conn), \
         patch("finance_server.db.transactions._log"):
        return fn()


class TestAddRefundLink:
    def test_add_link_sets_refund_total(self, test_db):
        income = _ins(test_db, 90.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -40.0, "exp2")
        exp3 = _ins(test_db, -10.0, "exp3")

        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))
        _run(test_db, lambda: add_refund_link(income, exp2, 40.0))
        _run(test_db, lambda: add_refund_link(income, exp3, 10.0))

        totals = {
            row["id"]: row["refund_total"]
            for row in test_db.execute("SELECT id, refund_total FROM umsaetze").fetchall()
        }
        assert totals[exp1] == 30.0
        assert totals[exp2] == 40.0
        assert totals[exp3] == 10.0
        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 3

    def test_rejects_over_attribution_of_income(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -30.0, "exp2")
        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))

        with pytest.raises(ValueError, match="nicht über 0"):
            _run(test_db, lambda: add_refund_link(income, exp2, 25.0))

    def test_rejects_over_refund_of_expense(self, test_db):
        income1 = _ins(test_db, 20.0, "inc1")
        income2 = _ins(test_db, 20.0, "inc2")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income1, expense, 20.0))

        with pytest.raises(ValueError, match="nicht unter 0"):
            _run(test_db, lambda: add_refund_link(income2, expense, 15.0))

    def test_rejects_non_positive_amount(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        with pytest.raises(ValueError, match="positiv"):
            _run(test_db, lambda: add_refund_link(income, expense, 0.0))

    def test_rejects_duplicate_pair(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))
        with pytest.raises(ValueError, match="bereits verknüpft"):
            _run(test_db, lambda: add_refund_link(income, expense, 10.0))

    def test_missing_transaction_returns_none(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        assert _run(test_db, lambda: add_refund_link(999, expense, 10.0)) is None
        assert _run(test_db, lambda: add_refund_link(income, 999, 10.0)) is None


class TestDeleteRefundLink:
    def test_delete_recalculates_refund_total(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        link = _run(test_db, lambda: add_refund_link(income, expense, 20.0))
        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 20.0

        assert _run(test_db, lambda: delete_refund_link(link["id"])) is True

        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 0.0
        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0

    def test_delete_missing_returns_false(self, test_db):
        assert _run(test_db, lambda: delete_refund_link(999)) is False


from finance_server.db.transactions import delete_transaction, fetch_latest_transaction, fetch_transactions


class TestDeleteCleanup:
    def test_delete_income_removes_links_and_recalcs(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        assert _run(test_db, lambda: delete_transaction(income)) is True

        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0
        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 0.0

    def test_delete_expense_removes_its_links(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        assert _run(test_db, lambda: delete_transaction(expense)) is True

        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0


class TestDto:
    def test_fetch_transactions_includes_links_and_attributed(self, test_db):
        income = _ins(test_db, 90.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -40.0, "exp2")
        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))
        _run(test_db, lambda: add_refund_link(income, exp2, 40.0))

        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            rows = fetch_transactions(days=36500)
        income_dto = next(r for r in rows if r["id"] == income)

        assert income_dto["refund_links"] == [
            {"id": 1, "refund_transaction_id": income, "expense_transaction_id": exp1, "amount": 30.0},
            {"id": 2, "refund_transaction_id": income, "expense_transaction_id": exp2, "amount": 40.0},
        ]
        assert income_dto["refund_attributed"] == 70.0
        assert income_dto["is_refund"] is True
        assert next(r for r in rows if r["id"] == exp1)["is_refund"] is False

    def test_fetch_latest_transaction_includes_links(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            latest = fetch_latest_transaction(iban="DE1")
        assert latest["id"] == expense
        assert latest["refund_links"] == []
