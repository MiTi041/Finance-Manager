from __future__ import annotations

from typing import Any
from unittest.mock import Mock, patch

from finance_server.services.allocation_service import AllocationService


def _row(applicant_name: str, purpose: str, amount: float, date: str) -> dict[str, Any]:
    return {"applicant_name": applicant_name, "purpose": purpose, "amount": amount, "date": date}

class TestDetectIncome:
    def test_returns_zero_when_no_transactions(self):
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchall.return_value = []
            cursor.fetchone.return_value = [0.0]
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            result = service._detect_income("2026-07")
        assert result == 0.0

    def test_detects_recurring_income(self):
        service = AllocationService()
        rows = [
            _row("Employer GmbH", "Gehalt Januar", 3400.0, "2026-04-01"),
            _row("Employer GmbH", "Gehalt Januar", 3400.0, "2026-05-01"),
            _row("Employer GmbH", "Gehalt Januar", 3500.0, "2026-06-01"),
        ]
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchall.return_value = rows
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            result = service._detect_income("2026-07")
        assert result == 3500.0

    def test_falls_back_when_no_recurring_pattern(self):
        service = AllocationService()
        with (
            patch("finance_server.services.allocation_service.get_connection") as mock_conn,
            patch("finance_server.services.allocation_service.get_setting") as mock_setting,
        ):
            # First call fetchall → no recurring rows
            # Second call fetchone → fallback returns 2100.0
            cursor = Mock()
            cursor.fetchall.return_value = []
            cursor.fetchone.return_value = [2100.0]
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            mock_setting.return_value = None
            result = service._detect_income("2026-07")
        assert result == 2100.0


class TestBuildRunResponse:
    def _make_conn_mock(self):
        cursor = Mock()
        cursor.fetchone.return_value = [0.0]
        conn = Mock()
        conn.execute.return_value = cursor
        return conn

    def test_includes_spending_as_remainder(self):
        service = AllocationService()
        buckets = [
            {"bucket_type": "invest", "percentage": 30, "id": 1, "is_active": True, "sort_order": 0, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "donation", "percentage": 10, "id": 2, "is_active": True, "sort_order": 1, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "spending", "percentage": 60, "id": 3, "is_active": True, "sort_order": 2, "recipient_account_id": None, "sender_iban": None},
        ]
        run_buckets = [
            {"id": 1, "run_id": 1, "bucket_id": 1, "bucket_type": "invest", "target_amount": 900.0, "transferred": 0.0, "is_completed": False},
            {"id": 2, "run_id": 1, "bucket_id": 2, "bucket_type": "donation", "target_amount": 300.0, "transferred": 0.0, "is_completed": False},
            {"id": 3, "run_id": 1, "bucket_id": 3, "bucket_type": "spending", "target_amount": 1800.0, "transferred": 0.0, "is_completed": False},
        ]
        run_data = {"id": 1, "month": "2026-07", "net_income": 3000.0, "total_allocated": 3000.0, "status": "pending"}
        with (
            patch("finance_server.services.allocation_service.db.list_buckets") as mock_list,
            patch("finance_server.services.allocation_service.db.get_run_for_month") as mock_run,
            patch("finance_server.services.allocation_service.db.create_run") as mock_create_run,
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_run_buckets") as mock_run_buckets,
            patch("finance_server.services.allocation_service.db.get_active_buckets_sum_percentage", return_value=40.0),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=3000.0),
            patch("finance_server.services.allocation_service.get_connection") as mock_conn,
        ):
            mock_conn.return_value.__enter__.return_value = self._make_conn_mock()
            mock_list.return_value = buckets
            mock_run.side_effect = [None, run_data]
            mock_create_run.return_value = 1
            mock_create_bucket.return_value = 1
            mock_run_buckets.return_value = run_buckets

            result = service.get_or_create_run("2026-07")

        assert result["net_income"] == 3000.0
        assert len(result["buckets"]) == 3

    def test_active_percentage_determines_spending_remainder(self):
        service = AllocationService()
        buckets = [
            {"bucket_type": "emergency", "percentage": 30, "id": 1, "is_active": True, "sort_order": 0, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "invest", "percentage": 40, "id": 2, "is_active": True, "sort_order": 1, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "spending", "percentage": 30, "id": 3, "is_active": True, "sort_order": 2, "recipient_account_id": None, "sender_iban": None},
        ]
        run_buckets = [
            {"id": 1, "run_id": 1, "bucket_id": 1, "bucket_type": "emergency", "target_amount": 600.0, "transferred": 0.0, "is_completed": False},
            {"id": 2, "run_id": 1, "bucket_id": 2, "bucket_type": "invest", "target_amount": 800.0, "transferred": 0.0, "is_completed": False},
            {"id": 3, "run_id": 1, "bucket_id": 3, "bucket_type": "spending", "target_amount": 600.0, "transferred": 0.0, "is_completed": False},
        ]
        run_data = {"id": 1, "month": "2026-07", "net_income": 2000.0, "total_allocated": 2000.0, "status": "pending"}
        with (
            patch("finance_server.services.allocation_service.db.list_buckets") as mock_list,
            patch("finance_server.services.allocation_service.db.get_run_for_month") as mock_run,
            patch("finance_server.services.allocation_service.db.create_run") as mock_create_run,
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_run_buckets") as mock_run_buckets,
            patch("finance_server.services.allocation_service.db.get_active_buckets_sum_percentage", return_value=70.0),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=2000.0),
            patch("finance_server.services.allocation_service.get_connection") as mock_conn,
        ):
            mock_conn.return_value.__enter__.return_value = self._make_conn_mock()
            mock_list.return_value = buckets
            mock_run.side_effect = [None, run_data]
            mock_create_run.return_value = 1
            mock_create_bucket.return_value = 1
            mock_run_buckets.return_value = run_buckets

            result = service.get_or_create_run("2026-07")

        assert result["net_income"] == 2000.0
