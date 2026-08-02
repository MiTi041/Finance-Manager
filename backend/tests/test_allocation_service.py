from __future__ import annotations

from contextlib import ExitStack
from datetime import datetime
from typing import Any
from unittest.mock import Mock, call, patch

import pytest

from finance_server.db.savings import _classify_group, _savings_breakdown, count_income_events_until
from finance_server.services.allocation_service import AllocationService


def _row(applicant_name: str, purpose: str, amount: float, date: str) -> dict[str, Any]:
    return {"applicant_name": applicant_name, "purpose": purpose, "amount": amount, "date": date}

class TestTransferRunBucketGuard:
    def _service(self, row: dict[str, Any]):
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchone.return_value = row
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            return service.transfer_run_bucket(row["id"])

    def test_rejects_zero_remaining(self):
        from fastapi import HTTPException
        row = {
            "id": 1,
            "target_amount": 100.0,
            "transferred": 100.0,
            "is_completed": 0,
            "bucket_type": "emergency",
            "recipient_account_id": 1,
        }
        with pytest.raises(HTTPException) as exc:
            self._service(row)
        assert exc.value.status_code == 400

    def test_rejects_negative_custom_amount(self):
        from fastapi import HTTPException
        row = {
            "id": 2,
            "target_amount": 100.0,
            "transferred": 0.0,
            "is_completed": 0,
            "bucket_type": "emergency",
            "recipient_account_id": 1,
        }
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchone.return_value = row
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            with pytest.raises(HTTPException) as exc:
                service.transfer_run_bucket(row["id"], custom_amount=-5)
        assert exc.value.status_code == 400


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

    def test_breakdown_returns_used_transactions(self):
        service = AllocationService()
        rows = [
            _row("Employer GmbH", "Gehalt Januar", 3400.0, "2026-04-01"),
            _row("Employer GmbH", "Gehalt Januar", 3400.0, "2026-05-01"),
            _row("Employer GmbH", "Gehalt Januar", 3500.0, "2026-06-01"),
            _row("Gewerbe", "Einzelzahlung", 100.0, "2026-04-10"),
        ]
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchall.return_value = rows
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            breakdown = service._detect_income_breakdown("2026-07")
        assert breakdown["total"] == 3500.0
        assert len(breakdown["sources"]) == 1
        source = breakdown["sources"][0]
        assert source["name"] == "Employer GmbH"
        assert source["amount"] == 3500.0
        assert source["count"] == 3
        assert [t["date"] for t in source["transactions"]] == [
            "2026-04-01",
            "2026-05-01",
            "2026-06-01",
        ]

    def test_returns_zero_when_no_recurring_pattern(self):
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            cursor = Mock()
            cursor.fetchall.return_value = []
            mock_conn.return_value.__enter__.return_value.execute.return_value = cursor
            result = service._detect_income("2026-07")
        assert result == 0.0


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
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": 3000.0, "sources": []}),
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
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": 2000.0, "sources": []}),
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


class TestUpdateSettings:
    def _service_with_store(self, initial: str = "false"):
        store = {"bafoeg_enabled": initial}
        service = AllocationService()
        return service, store

    def test_toggle_bafoeg_recomputes_current_run(self):
        service, store = self._service_with_store("false")

        def fake_get(key: str) -> str | None:
            return store.get(key)

        def fake_set(key: str, value: str) -> None:
            store[key] = value

        with (
            patch("finance_server.services.allocation_service.get_setting", side_effect=fake_get),
            patch("finance_server.services.allocation_service.set_setting", side_effect=fake_set),
            patch("finance_server.services.allocation_service.db.set_bucket_active_by_type") as mock_act,
            patch("finance_server.services.allocation_service.db.delete_run") as mock_del,
        ):
            result = service.update_settings({"bafoeg_enabled": True})

        assert result["bafoeg_enabled"] is True
        mock_act.assert_called_once_with("bafoeg", True)
        mock_del.assert_called_once_with(datetime.now().strftime("%Y-%m"))

    def test_unchanged_toggle_does_not_reset_run(self):
        service, store = self._service_with_store("true")

        def fake_get(key: str) -> str | None:
            return store.get(key)

        with (
            patch("finance_server.services.allocation_service.get_setting", side_effect=fake_get),
            patch("finance_server.services.allocation_service.set_setting") as mock_set,
            patch("finance_server.services.allocation_service.db.set_bucket_active_by_type") as mock_act,
            patch("finance_server.services.allocation_service.db.delete_run") as mock_del,
        ):
            service.update_settings({"bafoeg_enabled": True})

        mock_set.assert_not_called()
        mock_act.assert_not_called()
        mock_del.assert_not_called()

    def test_get_settings_returns_holiday_state_and_options(self):
        service, _ = self._service_with_store("false")
        with patch("finance_server.services.allocation_service.get_holiday_state", return_value="by"):
            result = service.get_settings()
        assert result["holiday_state"] == "by"
        assert len(result["holiday_states"]) == 16
        assert result["holiday_states"][0] == {"code": "bw", "name": "Baden-Württemberg"}

    def test_update_holiday_state_stores_setting(self):
        service, store = self._service_with_store("false")

        def fake_get_holiday_state() -> str:
            return store.get("holiday_state") or "nw"

        def fake_set(key: str, value: str) -> None:
            store[key] = value

        with (
            patch(
                "finance_server.services.allocation_service.get_holiday_state",
                side_effect=fake_get_holiday_state,
            ),
            patch("finance_server.services.allocation_service.set_setting", side_effect=fake_set),
            patch("finance_server.services.allocation_service.db.delete_run") as mock_del,
        ):
            result = service.update_settings({"holiday_state": "by"})

        assert store["holiday_state"] == "by"
        assert result["holiday_state"] == "by"
        mock_del.assert_called_once_with(datetime.now().strftime("%Y-%m"))

    def test_invalid_holiday_state_rejected(self):
        from fastapi import HTTPException

        service, _ = self._service_with_store("false")
        with (
            patch("finance_server.services.allocation_service.get_holiday_state", return_value="nw"),
            patch("finance_server.services.allocation_service.set_setting") as mock_set,
            patch("finance_server.services.allocation_service.db.delete_run") as mock_del,
        ):
            with pytest.raises(HTTPException):
                service.update_settings({"holiday_state": "zz"})

        mock_set.assert_not_called()
        mock_del.assert_not_called()


class TestSavingsPlanBudget:
    def _enrich(self, rates):
        def fake_enrich(plan, month):
            return {**plan, "monthly_rate": rates.get(plan["id"], 0.0), "is_completed": False}
        return fake_enrich

    def _run(self, month, net_income, plans, rates, buckets=None):
        service = AllocationService()
        run_data = {"id": 1, "month": month, "net_income": net_income, "total_allocated": 0.0, "status": "pending"}
        with (
            patch("finance_server.services.allocation_service.db.list_buckets", return_value=buckets or []),
            patch("finance_server.services.allocation_service.db.get_run_for_month", side_effect=[None, run_data]),
            patch("finance_server.services.allocation_service.db.create_run", return_value=1),
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_run_buckets", return_value=[]),
            patch("finance_server.services.allocation_service.get_setting", return_value="false"),
            patch("finance_server.services.allocation_service.list_plans", return_value=plans),
            patch("finance_server.services.allocation_service.update_plan") as mock_update,
            patch("finance_server.services.allocation_service.AllocationService._enrich_savings_plan", side_effect=self._enrich(rates)),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=net_income),
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": net_income, "sources": []}),
            patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]),
        ):
            return service.get_or_create_run(month), mock_update, mock_create_bucket

    def test_never_hides_when_budget_exceeded(self):
        plans = [
            {"id": 1, "name": "Alt", "tag": "alt", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
            {"id": 2, "name": "Neu", "tag": "neu", "created_at": "2026-06-01", "is_visible": True, "auto_hidden": False},
        ]
        result, mock_update, _ = self._run("2026-07", 1000.0, plans, {1: 800.0, 2: 500.0})

        assert result["auto_hidden_plan_ids"] == []
        mock_update.assert_not_called()

    def test_reshows_legacy_auto_hidden_plan(self):
        plans = [
            {"id": 1, "name": "Alt", "tag": "alt", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
            {"id": 2, "name": "Neu", "tag": "neu", "created_at": "2026-06-01", "is_visible": False, "auto_hidden": True},
        ]
        result, mock_update, _ = self._run("2026-07", 2000.0, plans, {1: 800.0, 2: 500.0})

        assert result["auto_hidden_plan_ids"] == []
        mock_update.assert_called_once_with(2, {"is_visible": True, "auto_hidden": False})

    def test_bucket_targets_clamped_when_savings_exceed_budget(self):
        plans = [
            {"id": 1, "name": "Alt", "tag": "alt", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
        ]
        buckets = [
            {"id": 10, "bucket_type": "invest", "percentage": 50.0, "is_active": True},
            {"id": 11, "bucket_type": "spending", "percentage": 0.0, "is_active": True},
        ]
        _, _, mock_create_bucket = self._run("2026-07", 1000.0, plans, {1: 1300.0}, buckets)

        calls = [call.args[2] for call in mock_create_bucket.call_args_list]
        assert calls == [0.0, 0.0]

    def _enrich_completed(self, completed_ids, rates=None):
        def fake_enrich(plan, month):
            enriched = {**plan, "monthly_rate": rates.get(plan["id"], 100.0) if rates else 100.0}
            enriched["is_completed"] = plan["id"] in completed_ids
            return enriched
        return fake_enrich

    def test_completed_plans_excluded_from_savings_total(self):
        plans = [
            {"id": 1, "name": "Aktiv", "tag": "a", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
            {"id": 2, "name": "Fertig", "tag": "b", "created_at": "2026-02-01", "is_visible": True, "auto_hidden": False},
        ]
        result, _, _ = self._run_with_enrich(
            "2026-07", 2000.0, plans, self._enrich_completed({2}, rates={1: 100.0, 2: 200.0})
        )
        assert result["savings_total"] == 100.0

    def test_completed_plans_do_not_deplete_bucket_budget(self):
        plans = [
            {"id": 1, "name": "Aktiv", "tag": "a", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
            {"id": 2, "name": "Fertig", "tag": "b", "created_at": "2026-02-01", "is_visible": True, "auto_hidden": False},
        ]
        buckets = [
            {"id": 10, "bucket_type": "invest", "percentage": 50.0, "is_active": True},
        ]
        _, _, mock_create_bucket = self._run_with_enrich(
            "2026-07", 2000.0, plans, self._enrich_completed({2}, rates={1: 100.0, 2: 200.0}), buckets
        )

        calls = [call.args[2] for call in mock_create_bucket.call_args_list]
        assert calls == [950.0]

    def _run_with_enrich(self, month, net_income, plans, enrich_side_effect, buckets=None):
        service = AllocationService()
        run_data = {"id": 1, "month": month, "net_income": net_income, "total_allocated": 0.0, "status": "pending"}
        with (
            patch("finance_server.services.allocation_service.db.list_buckets", return_value=buckets or []),
            patch("finance_server.services.allocation_service.db.get_run_for_month", side_effect=[None, run_data]),
            patch("finance_server.services.allocation_service.db.create_run", return_value=1),
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_run_buckets", return_value=[]),
            patch("finance_server.services.allocation_service.get_setting", return_value="false"),
            patch("finance_server.services.allocation_service.list_plans", return_value=plans),
            patch("finance_server.services.allocation_service.update_plan") as mock_update,
            patch("finance_server.services.allocation_service.AllocationService._enrich_savings_plan", side_effect=enrich_side_effect),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=net_income),
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": net_income, "sources": []}),
            patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]),
        ):
            return service.get_or_create_run(month), mock_update, mock_create_bucket


class TestForceRecalculate:
    def _make_conn_mock(self):
        cursor = Mock()
        cursor.fetchone.return_value = [0.0]
        conn = Mock()
        conn.execute.return_value = cursor
        return conn

    def test_force_recreate_preserves_transferred_state(self):
        service = AllocationService()
        buckets = [
            {"bucket_type": "spending", "percentage": 100, "id": 1, "is_active": True, "sort_order": 0,
             "recipient_account_id": None, "sender_iban": None},
        ]
        existing_run = {"id": 1, "month": "2026-07", "net_income": 2000.0, "total_allocated": 2000.0, "status": "calculated"}
        existing_buckets = [
            {"id": 10, "run_id": 1, "bucket_id": 1, "bucket_type": "spending", "target_amount": 2000.0,
             "transferred": 2000.0, "transferred_at": "2026-07-05T10:00:00", "is_completed": 1},
        ]
        new_run = {"id": 2, "month": "2026-07", "net_income": 2000.0, "total_allocated": 2000.0, "status": "calculated"}
        new_buckets = [
            {"id": 20, "run_id": 2, "bucket_id": 1, "bucket_type": "spending", "target_amount": 2000.0,
             "transferred": 0.0, "transferred_at": None, "is_completed": 0},
        ]
        with (
            patch("finance_server.services.allocation_service.db.list_buckets", return_value=buckets),
            patch("finance_server.services.allocation_service.db.get_run_for_month",
                  side_effect=[existing_run, new_run]),
            patch("finance_server.services.allocation_service.db.get_run_buckets",
                  side_effect=[existing_buckets, new_buckets, new_buckets]),
            patch("finance_server.services.allocation_service.db.create_run", return_value=2),
            patch("finance_server.services.allocation_service.db.create_run_bucket", return_value=1),
            patch("finance_server.services.allocation_service.db.delete_run") as mock_del,
            patch("finance_server.services.allocation_service.db.update_run_bucket_transferred") as mock_restore,
            patch("finance_server.services.allocation_service.get_setting", return_value="false"),
            patch("finance_server.services.allocation_service.list_plans", return_value=[]),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=2000.0),
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": 2000.0, "sources": []}),
            patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]),
            patch("finance_server.services.allocation_service.get_connection") as mock_conn,
        ):
            mock_conn.return_value.__enter__.return_value = self._make_conn_mock()

            result = service.get_or_create_run("2026-07", force=True)

        mock_del.assert_called_once_with("2026-07")
        mock_restore.assert_called_once_with(
            20,
            {"transferred": 2000.0, "transferred_at": "2026-07-05T10:00:00", "is_completed": 1},
        )
        assert result["month"] == "2026-07"


class TestEnrichSavingsPlan:
    def _plan(self, created_at: str) -> dict[str, Any]:
        return {
            "id": 1,
            "name": "Test",
            "tag": "tag.test",
            "target_amount": 1000.0,
            "target_date": "2026-09-30",
            "is_visible": True,
            "auto_hidden": False,
            "created_at": created_at,
        }

    def _enrich(
        self,
        created_at: str,
        month: str,
        count: int,
        saved: float = 0.0,
        einzahlungen: float | None = None,
        verschuldung: float = 0.0,
        entnahmen: float = 0.0,
    ) -> dict[str, Any]:
        service = AllocationService()
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_breakdown",
                return_value={
                    "einzahlungen": einzahlungen if einzahlungen is not None else saved,
                    "verschuldung": verschuldung,
                    "entnahmen": entnahmen,
                    "saldo": (einzahlungen if einzahlungen is not None else saved) - verschuldung - entnahmen,
                },
            ))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_month_breakdown",
                return_value={"einzahlungen": 0.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 0.0},
            ))
            stack.enter_context(patch("finance_server.services.allocation_service.count_income_events_until", return_value=count))
            return service._enrich_savings_plan(self._plan(created_at), month)

    def test_recipient_logo_fields_resolved(self):
        plan = self._plan("2026-08-05T10:00:00+00:00")
        plan["target_recipient_iban"] = "DE1234567890"
        service = AllocationService()
        partner = {
            "logo_url": "/assets/images/payment-partner-logos/sparkasse.png",
            "logo_white_background": True,
            "logo_padding": False,
        }
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_breakdown",
                return_value={"einzahlungen": 0.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 0.0},
            ))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_month_breakdown",
                return_value={"einzahlungen": 0.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 0.0},
            ))
            stack.enter_context(patch("finance_server.services.allocation_service.count_income_events_until", return_value=2))
            stack.enter_context(patch("finance_server.services.allocation_service.get_zahlungspartner_by_iban", return_value=partner))
            result = service._enrich_savings_plan(plan, "2026-08")
        assert result["recipient_logo_url"] == partner["logo_url"]
        assert result["recipient_logo_white_background"] is True
        assert result["recipient_logo_padding"] is False

    def test_first_month_no_bonus(self):
        result = self._enrich("2026-08-05T10:00:00+00:00", "2026-08", count=2)
        assert result["income_events_left"] == 2
        assert result["future_income_events"] == 2
        assert result["required_monthly_rate"] == 500.0

    def test_later_month_adds_bonus(self):
        result = self._enrich("2026-07-05T10:00:00+00:00", "2026-08", count=1)
        assert result["income_events_left"] == 2
        assert result["future_income_events"] == 1
        assert result["required_monthly_rate"] == 500.0

    def test_completed_when_target_reached(self):
        result = self._enrich("2026-07-05T10:00:00+00:00", "2026-08", count=1, saved=1000.0)
        assert result["is_completed"] is True
        assert result["required_monthly_rate"] == 0.0

    def test_not_completed_below_target(self):
        result = self._enrich("2026-07-05T10:00:00+00:00", "2026-08", count=1, saved=999.0)
        assert result["is_completed"] is False

    def test_never_completed_without_target(self):
        plan = self._plan("2026-07-05T10:00:00+00:00")
        plan["target_amount"] = None
        service = AllocationService()
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_breakdown",
                return_value={"einzahlungen": 1000.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 1000.0},
            ))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_month_breakdown",
                return_value={"einzahlungen": 0.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 0.0},
            ))
            result = service._enrich_savings_plan(plan, "2026-08")
        assert result["is_completed"] is False


class TestEnrichSavingsPlanEntnahme:
    def _plan(self) -> dict[str, Any]:
        return {
            "id": 1,
            "name": "Urlaub",
            "tag": "tag.griechenland",
            "target_amount": 1000.0,
            "target_date": "2026-09-30",
            "is_visible": True,
            "auto_hidden": False,
            "created_at": "2026-07-05T10:00:00+00:00",
        }

    def _enrich(self, breakdown: dict[str, float]) -> dict[str, Any]:
        service = AllocationService()
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch("finance_server.services.allocation_service.get_savings_breakdown", return_value=breakdown))
            stack.enter_context(patch(
                "finance_server.services.allocation_service.get_savings_month_breakdown",
                return_value={"einzahlungen": 0.0, "verschuldung": 0.0, "entnahmen": 0.0, "saldo": 0.0},
            ))
            stack.enter_context(patch("finance_server.services.allocation_service.count_income_events_until", return_value=0))
            return service._enrich_savings_plan(self._plan(), "2026-08")

    def test_entnahme_reduces_target_and_saved(self):
        result = self._enrich({"einzahlungen": 800.0, "verschuldung": 0.0, "entnahmen": 300.0, "saldo": 500.0})
        assert result["effective_target"] == 700.0
        assert result["saved_amount"] == 500.0
        assert result["saved_entnahmen"] == 300.0
        assert result["required_monthly_rate"] == 200.0
        assert result["is_completed"] is False

    def test_verschuldung_keeps_target_and_must_be_repaid(self):
        result = self._enrich({"einzahlungen": 800.0, "verschuldung": 300.0, "entnahmen": 0.0, "saldo": 500.0})
        assert result["effective_target"] == 1000.0
        assert result["saved_amount"] == 500.0
        assert result["saved_verschuldung"] == 300.0
        assert result["required_monthly_rate"] == 500.0

    def test_over_withdrawal_becomes_deficit(self):
        result = self._enrich({"einzahlungen": 800.0, "verschuldung": 0.0, "entnahmen": 1000.0, "saldo": -200.0})
        assert result["effective_target"] == 0.0
        assert result["saved_amount"] == -200.0
        assert result["required_monthly_rate"] == 200.0
        assert result["is_completed"] is False

    def test_completed_stays_completed_after_full_entnahme(self):
        result = self._enrich({"einzahlungen": 1000.0, "verschuldung": 0.0, "entnahmen": 1000.0, "saldo": 0.0})
        assert result["effective_target"] == 0.0
        assert result["saved_amount"] == 0.0
        assert result["is_completed"] is True


class TestCountIncomeEventsUntil:
    def test_target_before_next_payout_counts_zero(self):
        assert count_income_events_until("2026-08-16", [28], "2026-08-01", min_result=0) == 0

    def test_default_min_result_inflates_to_one(self):
        assert count_income_events_until("2026-08-16", [28], "2026-08-01") == 1

    def test_payout_within_window_counts(self):
        assert count_income_events_until("2026-08-31", [28], "2026-08-01", min_result=0) == 1


class TestClassifyGroup:
    def test_month_end_detected_as_last_working_day(self):
        dates = ["2024-03-28", "2024-04-30", "2024-05-31"]
        assert _classify_group(dates, "nw") == -1

    def test_holiday_pullback_detected(self):
        # Karfreitag 2024 fällt auf den 29.3. → letzter Arbeitstag ist der 28.3.
        dates = ["2024-02-29", "2024-03-28", "2024-04-30"]
        assert _classify_group(dates, "nw") == -1

    def test_fixed_day_not_month_end(self):
        dates = ["2026-04-15", "2026-05-15", "2026-06-15"]
        assert _classify_group(dates, "nw") == 15

    def test_too_few_dates_returns_none(self):
        assert _classify_group(["2026-05-29", "2026-06-30"], "nw") is None

    def test_irregular_cadence_returns_none(self):
        dates = ["2026-01-05", "2026-03-15", "2026-04-20"]
        assert _classify_group(dates, "nw") is None


class TestCountIncomeEventsUntilLastWorkingDay:
    def test_weekend_pullback_counts(self):
        # Mai 2026 endet am Sonntag → letzter Arbeitstag Freitag 29.5.
        assert count_income_events_until("2026-05-29", [-1], "2026-05-01", min_result=0) == 1
        assert count_income_events_until("2026-05-28", [-1], "2026-05-01", min_result=0) == 0

    def test_leap_year_counts(self):
        # Feb 2028 ist ein Schaltjahr, 29.2. ist ein Dienstag
        assert count_income_events_until("2028-02-29", [-1], "2028-02-01", min_result=0) == 1
        assert count_income_events_until("2028-02-28", [-1], "2028-02-01", min_result=0) == 0

    def test_holiday_pullback_counts(self):
        # Karfreitag 2024 am 29.3. → letzter Arbeitstag Donnerstag 28.3.
        assert count_income_events_until("2024-03-28", [-1], "2024-03-01", min_result=0) == 1
        assert count_income_events_until("2024-03-27", [-1], "2024-03-01", min_result=0) == 0

    def test_mixed_fixed_and_month_end_uses_later_value(self):
        # Aug 2026: letzter Arbeitstag ist der 31.8. → nur dieser zählt, nicht der 15.
        assert count_income_events_until("2026-08-31", [15, -1], "2026-08-01", min_result=0) == 1
        assert count_income_events_until("2026-08-30", [15, -1], "2026-08-01", min_result=0) == 0
        assert count_income_events_until("2026-08-15", [15, -1], "2026-08-01", min_result=0) == 0

    def test_multiple_fixed_days_use_later_value(self):
        assert count_income_events_until("2026-08-20", [15, 20], "2026-08-01", min_result=0) == 1
        assert count_income_events_until("2026-08-19", [15, 20], "2026-08-01", min_result=0) == 0


class TestSavingsBreakdown:
    def _insert(self, conn, amount: float, purpose: str, date: str = "2026-07-15"):
        conn.execute(
            "INSERT INTO umsaetze (amount, purpose, date, entry_date, account_iban, transaction_hash) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (amount, purpose, date, date, "iban", f"hash-{amount}-{purpose}"),
        )
        conn.commit()

    def test_substring_tag_match_without_space(self, test_db, monkeypatch):
        # Real bank purposes run the tag into adjacent text ("tag.spliturlaub2026DATUM",
        # "Urlaubtag.spliturlaub2026 ...") — matching must be substring, not space-bounded.
        monkeypatch.setattr("finance_server.db.savings.get_connection", lambda: test_db)
        self._insert(test_db, -300.0, "Sparplan Split Urlaubtag.spliturlaub2026 01.08.2026")
        self._insert(test_db, -450.0, "Sparplan GriechenlandUrlaub tag.griechenlandurlaub2026DATUM 27.07.2026")
        self._insert(test_db, 550.0, "tag.griechenlandurlaub2026.entnahme Entnahme fuer Flug")
        breakdown = _savings_breakdown("griechenlandurlaub2026")
        assert breakdown["einzahlungen"] == 450.0
        assert breakdown["verschuldung"] == 0.0
        assert breakdown["entnahmen"] == 550.0
        assert breakdown["saldo"] == -100.0
        split = _savings_breakdown("spliturlaub2026")
        assert split["einzahlungen"] == 300.0
        assert split["entnahmen"] == 0.0

    def test_plain_positive_tag_is_verschuldung(self, test_db, monkeypatch):
        monkeypatch.setattr("finance_server.db.savings.get_connection", lambda: test_db)
        self._insert(test_db, 200.0, "Geld zurueck tag.spliturlaub2026")
        breakdown = _savings_breakdown("spliturlaub2026")
        assert breakdown["verschuldung"] == 200.0
        assert breakdown["einzahlungen"] == 0.0
        assert breakdown["entnahmen"] == 0.0

    def test_other_plan_tag_does_not_leak(self, test_db, monkeypatch):
        monkeypatch.setattr("finance_server.db.savings.get_connection", lambda: test_db)
        self._insert(test_db, -500.0, "tag.griechenlandurlaub2026DATUM")
        self._insert(test_db, -100.0, "tag.spliturlaub2026")
        assert _savings_breakdown("griechenlandurlaub2026")["einzahlungen"] == 500.0
        assert _savings_breakdown("spliturlaub2026")["einzahlungen"] == 100.0
