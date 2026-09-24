from __future__ import annotations

import pytest
from unittest.mock import patch

from finance_server.db.transactions import update_manual_transaction


def _insert(conn, *, dummy_entry: int) -> int:
    cursor = conn.execute(
        "INSERT INTO umsaetze "
        "(account_iban, amount, date, entry_date, created_at, transaction_hash, dummy_entry) "
        "VALUES ('DE1', -10.0, '2026-07-01', '2026-07-01', '2026-07-01T10:00:00', ?, ?)",
        (f"h-{dummy_entry}", dummy_entry),
    )
    return cursor.lastrowid


def _run(conn, fn):
    with patch("finance_server.db.transactions.get_connection", return_value=conn), patch(
        "finance_server.db.transactions._log"
    ):
        return fn()


def test_updates_fields_of_manual_transaction(test_db):
    tx_id = _insert(test_db, dummy_entry=1)

    _run(
        test_db,
        lambda: update_manual_transaction(
            tx_id,
            date="2026-08-02",
            amount=-42.5,
            recipient_name="Neuer Empfänger",
            recipient_iban="DE89370400440532013000",
            purpose="Neuer Zweck",
            category=7,
            note="Notiz",
        ),
    )

    row = test_db.execute(
        "SELECT date, entry_date, amount, recipient_name, applicant_iban, purpose, "
        "purpose_edit, kategorie, note FROM umsaetze WHERE id = ?",
        (tx_id,),
    ).fetchone()
    assert row["date"] == "2026-08-02"
    assert row["entry_date"] == "2026-08-02"
    assert row["amount"] == -42.5
    assert row["recipient_name"] == "Neuer Empfänger"
    assert row["applicant_iban"] == "DE89370400440532013000"
    assert row["purpose"] == "Neuer Zweck"
    assert row["purpose_edit"] is None
    assert row["kategorie"] == 7
    assert row["note"] == "Notiz"


def test_rejects_non_manual_transaction(test_db):
    tx_id = _insert(test_db, dummy_entry=0)

    with pytest.raises(ValueError, match="MANUAL_TRANSACTION_REQUIRED"):
        _run(
            test_db,
            lambda: update_manual_transaction(tx_id, date="2026-08-02", amount=-1.0),
        )


def test_rejects_missing_transaction(test_db):
    with pytest.raises(ValueError, match="MANUAL_TRANSACTION_REQUIRED"):
        _run(
            test_db,
            lambda: update_manual_transaction(99999, date="2026-08-02", amount=-1.0),
        )
