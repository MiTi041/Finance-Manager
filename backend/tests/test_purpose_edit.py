from __future__ import annotations

import sqlite3
from unittest.mock import patch

from finance_server.db.savings import get_saved_breakdown
from finance_server.db.transactions import row_to_dict, update_transaction_purpose
from finance_server.db.utils import build_transaction_hash


def _tx_payload(applicant_iban: str = "-") -> dict:
    payload = {
        "account_iban": "DE02120300000000202051",
        "account_bic": "BYLADEM1001",
        "account_accountnumber": "",
        "account_subaccount": "",
        "account_blz": "12345678",
        "date": "2026-07-01",
        "entry_date": "2026-07-02",
        "transaction_id": "",
        "customer_reference": "CREF",
        "bank_reference": "BREF",
        "transaction_reference": "",
        "end_to_end_reference": "EREF",
        "prima_nota": "",
        "applicant_iban": applicant_iban,
        "applicant_bic": "",
        "applicant_name": "Firma GmbH",
        "recipient_name": "Michael",
        "purpose": "Abschlag",
        "additional_purpose": "",
        "posting_text": "Lastschrift",
        "transaction_code": "",
        "purpose_code": "",
        "amount": -42.0,
        "original_amount": -42.0,
        "currency": "EUR",
        "dummy_entry": False,
        "created_at": "2026-07-02T10:00:00+00:00",
        "updated_at": "2026-07-02T10:00:00+00:00",
    }
    payload["transaction_hash"] = build_transaction_hash(payload)
    return payload


def _insert_local_tx(conn: sqlite3.Connection, tx_id: int = 10, purpose: str = "Abschlag") -> dict:
    p = _tx_payload("-")
    conn.execute(
        """
        INSERT INTO umsaetze (
            id, account_iban, amount, purpose, note, transaction_hash, created_at, updated_at
        )
        VALUES (
            :id, :account_iban, :amount, :purpose, :note,
            :transaction_hash, :created_at, :updated_at
        )
        """,
        {
            "id": tx_id,
            "account_iban": p["account_iban"],
            "amount": p["amount"],
            "purpose": purpose,
            "note": None,
            "transaction_hash": p["transaction_hash"],
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
        },
    )
    return p


class TestPurposeEditDb:
    def _update_purpose(
        self, conn: sqlite3.Connection, tx_id: int, purpose_edit: str | None
    ) -> bool:
        with patch("finance_server.db.transactions.get_connection", return_value=conn):
            return update_transaction_purpose(tx_id, purpose_edit)

    def test_update_stores_override_and_keeps_purpose_and_hash(self, test_db):
        payload = _insert_local_tx(test_db)
        original_hash = test_db.execute(
            "SELECT transaction_hash FROM umsaetze WHERE id = 10"
        ).fetchone()["transaction_hash"]

        assert self._update_purpose(test_db, 10, "Miete Juli") is True

        row = test_db.execute("SELECT * FROM umsaetze WHERE id = 10").fetchone()
        assert row["purpose"] == "Abschlag"
        assert row["purpose_edit"] == "Miete Juli"
        assert row["transaction_hash"] == original_hash == payload["transaction_hash"]

    def test_update_clears_override_when_empty_or_equal_to_original(self, test_db):
        _insert_local_tx(test_db)
        assert self._update_purpose(test_db, 10, "Miete Juli") is True

        assert self._update_purpose(test_db, 10, "Abschlag") is True
        row = test_db.execute("SELECT purpose_edit FROM umsaetze WHERE id = 10").fetchone()
        assert row["purpose_edit"] is None

        assert self._update_purpose(test_db, 10, "Miete Juli") is True
        assert self._update_purpose(test_db, 10, "") is True
        row = test_db.execute("SELECT purpose_edit FROM umsaetze WHERE id = 10").fetchone()
        assert row["purpose_edit"] is None

    def test_row_to_dict_exposes_effective_purpose(self, test_db):
        _insert_local_tx(test_db)
        self._update_purpose(test_db, 10, "Miete Juli")

        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            row = test_db.execute("SELECT * FROM umsaetze WHERE id = 10").fetchone()
            payload = row_to_dict(row)

        assert payload["purpose"] == "Miete Juli"
        assert payload["original_purpose"] == "Abschlag"
        assert payload["purpose_edit"] == "Miete Juli"

        assert self._update_purpose(test_db, 10, None) is True
        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            row = test_db.execute("SELECT * FROM umsaetze WHERE id = 10").fetchone()
            payload = row_to_dict(row)
        assert payload["purpose"] == "Abschlag"
        assert payload["purpose_edit"] is None

    def test_matching_uses_effective_purpose(self, test_db):
        p = _tx_payload("-")
        test_db.execute(
            """
            INSERT INTO umsaetze (
                id, account_iban, amount, purpose, purpose_edit,
                transaction_hash, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                10,
                p["account_iban"],
                -100.0,
                "Miete",
                "Sparplan tag.notfallfonds",
                p["transaction_hash"],
                p["created_at"],
                p["updated_at"],
            ),
        )
        with patch("finance_server.db.savings.get_connection", return_value=test_db):
            breakdown = get_saved_breakdown("notfallfonds")
        assert breakdown["einzahlungen"] == 100.0
        assert breakdown["saldo"] == 100.0
