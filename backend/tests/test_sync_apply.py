from __future__ import annotations

import json
import sqlite3
from unittest.mock import patch

from finance_server.db.sync import apply_sync_op
from finance_server.db.utils import build_transaction_hash


def _op(table: str, row_id: int | None, op_type: str, data: dict | None) -> dict:
    return {
        "table_name": table,
        "row_id": row_id,
        "op_type": op_type,
        "data": json.dumps(data) if data else None,
    }


def _apply(conn: sqlite3.Connection, op: dict) -> bool:
    with patch("finance_server.db.sync.get_connection", return_value=conn):
        return apply_sync_op(op)


class TestBudgets:
    def test_insert_with_list_category_ids_applies(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "budgets",
                1,
                "INSERT",
                {
                    "id": 1,
                    "name": "Essen",
                    "category_ids": [2, 3],
                    "amount": 100.0,
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute("SELECT * FROM budgets WHERE id = 1").fetchone()
        assert row is not None
        assert row["category_ids"] == "[2, 3]"

    def test_update_with_list_category_ids_applies(self, test_db):
        _apply(
            test_db,
            _op(
                "budgets",
                1,
                "INSERT",
                {
                    "id": 1,
                    "name": "Essen",
                    "category_ids": [2, 3],
                    "amount": 100.0,
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            ),
        )
        ok = _apply(
            test_db,
            _op(
                "budgets",
                1,
                "UPDATE",
                {
                    "id": 1,
                    "name": "Essen",
                    "category_ids": [5],
                    "amount": 50.0,
                    "updated_at": "2026-02-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute("SELECT * FROM budgets WHERE id = 1").fetchone()
        assert row["category_ids"] == "[5]"
        assert row["amount"] == 50.0


class TestAllocationBuckets:
    def test_notgroschen_target_fields_apply(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "allocation_buckets",
                None,
                "UPDATE",
                {
                    "bucket_type": "emergency",
                    "target_amount": 5000.0,
                    "target_months": None,
                    "recipient_iban": "DE02120300000000202051",
                    "updated_at": "2030-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute(
            "SELECT * FROM allocation_buckets WHERE bucket_type = 'emergency'"
        ).fetchone()
        assert row is not None
        assert row["target_amount"] == 5000.0
        assert row["target_months"] is None
        assert row["recipient_iban"] == "DE02120300000000202051"

    def test_remote_bucket_config_replaces_fresh_default_bucket(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "allocation_buckets",
                2,
                "UPDATE",
                {
                    "id": 2,
                    "bucket_type": "emergency",
                    "percentage": 20.0,
                    "recipient_account_id": None,
                    "sender_iban": "DE02120300000000202051",
                    "is_active": True,
                    "sort_order": 1,
                    "target_amount": 6000.0,
                    "target_months": 4,
                    "recipient_iban": "DE02500105170137075030",
                    "updated_at": "2020-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute(
            "SELECT * FROM allocation_buckets WHERE bucket_type = 'emergency'"
        ).fetchone()
        assert row["percentage"] == 20.0
        assert row["sender_iban"] == "DE02120300000000202051"
        assert row["target_amount"] == 6000.0
        assert row["target_months"] == 4


class TestBafoegConfig:
    def test_current_balance_applies(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "allocation_bafoeg_config",
                None,
                "INSERT",
                {
                    "id": 1,
                    "total_debt": 7600.0,
                    "monthly_rate": 267.0,
                    "interest_rate": 2.0,
                    "payout_date": None,
                    "current_balance": 1234.5,
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute(
            "SELECT * FROM allocation_bafoeg_config WHERE id = 1"
        ).fetchone()
        assert row is not None
        assert row["current_balance"] == 1234.5


class TestTransactions:
    def _tx_payload(self, applicant_iban: str, applicant_name: str = "Stadtwerke") -> dict:
        payload = {
            "id": 10,
            "account_iban": "DE001",
            "account_bic": "BANKDEFF",
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
            "applicant_name": applicant_name,
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

    def test_hash_ignores_unstable_applicant_iban(self):
        placeholder = self._tx_payload("-")
        real = self._tx_payload("DE02120300000000202051")
        assert placeholder["transaction_hash"] == real["transaction_hash"]

    def test_apply_updates_equivalent_transaction_instead_of_inserting_duplicate(self, test_db):
        local = self._tx_payload("-")
        local["transaction_hash"] = "legacy-hash-with-placeholder-iban"
        test_db.execute(
            """
            INSERT INTO umsaetze (
                id, account_iban, account_bic, account_accountnumber, account_subaccount, account_blz,
                date, entry_date, transaction_id, customer_reference, bank_reference,
                transaction_reference, end_to_end_reference, prima_nota,
                applicant_iban, applicant_bic, applicant_name, recipient_name,
                purpose, additional_purpose, posting_text, transaction_code, purpose_code,
                amount, original_amount, currency, dummy_entry, transaction_hash, created_at, updated_at
            )
            VALUES (
                :id, :account_iban, :account_bic, :account_accountnumber, :account_subaccount, :account_blz,
                :date, :entry_date, :transaction_id, :customer_reference, :bank_reference,
                :transaction_reference, :end_to_end_reference, :prima_nota,
                :applicant_iban, :applicant_bic, :applicant_name, :recipient_name,
                :purpose, :additional_purpose, :posting_text, :transaction_code, :purpose_code,
                :amount, :original_amount, :currency, :dummy_entry, :transaction_hash, :created_at, :updated_at
            )
            """,
            local,
        )

        remote = self._tx_payload("DE02120300000000202051")
        remote["id"] = 99
        remote["updated_at"] = "2026-07-03T10:00:00+00:00"
        ok = _apply(test_db, _op("umsaetze", 99, "UPDATE", remote))

        assert ok
        assert test_db.execute("SELECT COUNT(*) FROM umsaetze").fetchone()[0] == 1
        row = test_db.execute("SELECT * FROM umsaetze WHERE id = 10").fetchone()
        assert row["applicant_iban"] == "DE02120300000000202051"
        assert row["transaction_hash"] == remote["transaction_hash"]

    def test_apply_partial_transaction_update_without_hash_uses_row_id(self, test_db):
        local = self._tx_payload("-")
        test_db.execute(
            """
            INSERT INTO umsaetze (
                id, account_iban, amount, transaction_hash, created_at, updated_at
            )
            VALUES (:id, :account_iban, :amount, :transaction_hash, :created_at, :updated_at)
            """,
            local,
        )

        ok = _apply(
            test_db,
            _op(
                "umsaetze",
                10,
                "UPDATE",
                {
                    "id": 10,
                    "note": "bezahlt",
                    "updated_at": "2026-07-03T10:00:00+00:00",
                },
            ),
        )

        assert ok
        row = test_db.execute("SELECT note FROM umsaetze WHERE id = 10").fetchone()
        assert row["note"] == "bezahlt"


class TestEmpfaengerkonten:
    IBAN_A = "DE02120300000000202051"
    IBAN_B = "DE02500105170137075030"

    def _insert(self, conn, row_id, iban, name):
        return _apply(
            conn,
            _op(
                "empfaengerkonten",
                row_id,
                "INSERT",
                {
                    "id": row_id,
                    "account_name": name,
                    "iban": iban,
                    "bic": None,
                    "recipient_name": name,
                    "is_donation_account": False,
                    "updated_at": "2026-01-01 10:00:00",
                },
            ),
        )

    def test_insert_resolved_by_iban(self, test_db):
        assert self._insert(test_db, 1, self.IBAN_A, "Vermieter") is True
        row = test_db.execute(
            "SELECT * FROM empfaengerkonten WHERE iban = ?", (self.IBAN_A,)
        ).fetchone()
        assert row is not None
        assert row["recipient_name"] == "Vermieter"
        assert row["id"] == 1

    def test_conflicting_id_falls_back_to_auto(self, test_db):
        self._insert(test_db, 1, self.IBAN_B, "Eigener Account")
        ok = self._insert(test_db, 1, self.IBAN_A, "Vermieter")
        assert ok
        count = test_db.execute("SELECT COUNT(*) FROM empfaengerkonten").fetchone()[0]
        assert count == 2
        row = test_db.execute(
            "SELECT * FROM empfaengerkonten WHERE iban = ?", (self.IBAN_A,)
        ).fetchone()
        assert row is not None
        assert row["id"] != 1

    def test_update_by_iban_does_not_move_id(self, test_db):
        self._insert(test_db, 5, self.IBAN_A, "Vermieter")
        ok = _apply(
            test_db,
            _op(
                "empfaengerkonten",
                1,
                "UPDATE",
                {
                    "id": 1,
                    "account_name": "Vermieter",
                    "iban": self.IBAN_A,
                    "bic": None,
                    "recipient_name": "Vermieter GmbH",
                    "is_donation_account": False,
                    "updated_at": "2026-02-01 10:00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute(
            "SELECT * FROM empfaengerkonten WHERE iban = ?", (self.IBAN_A,)
        ).fetchone()
        assert row["id"] == 5
        assert row["recipient_name"] == "Vermieter GmbH"

    def test_delete_resolved_by_iban(self, test_db):
        self._insert(test_db, 1, self.IBAN_A, "Vermieter")
        ok = _apply(
            test_db,
            _op(
                "empfaengerkonten",
                1,
                "DELETE",
                {"id": 1, "iban": self.IBAN_A, "recipient_name": "Vermieter"},
            ),
        )
        assert ok
        assert test_db.execute("SELECT COUNT(*) FROM empfaengerkonten").fetchone()[0] == 0


class TestAppSettings:
    def test_bafoeg_enabled_applies(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "app_settings",
                None,
                "INSERT",
                {
                    "key": "bafoeg_enabled",
                    "value": "true",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok
        row = test_db.execute(
            "SELECT * FROM app_settings WHERE key = 'bafoeg_enabled'"
        ).fetchone()
        assert row is not None
        assert row["value"] == "true"

    def test_other_settings_rejected(self, test_db):
        ok = _apply(
            test_db,
            _op(
                "app_settings",
                None,
                "INSERT",
                {
                    "key": "sync_enc_key",
                    "value": "secret",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            ),
        )
        assert ok is False
        assert (
            test_db.execute("SELECT COUNT(*) FROM app_settings WHERE key = 'sync_enc_key'").fetchone()[0]
            == 0
        )

    def test_external_keys_synced(self, test_db):
        for key, value in {
            "resend_api_key": "re_123",
            "resend_from": "no-reply@example.com",
            "hunter_logo_key": "abc",
        }.items():
            ok = _apply(
                test_db,
                _op(
                    "app_settings",
                    None,
                    "INSERT",
                    {"key": key, "value": value, "updated_at": "2026-01-01T00:00:00+00:00"},
                ),
            )
            assert ok
            row = test_db.execute(
                "SELECT value FROM app_settings WHERE key = ?", (key,)
            ).fetchone()
            assert row["value"] == value
