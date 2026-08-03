from __future__ import annotations

import json
import sqlite3
from unittest.mock import patch

from finance_server.db.sync import apply_sync_op


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
