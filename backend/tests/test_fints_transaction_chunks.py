from __future__ import annotations

import datetime
from types import SimpleNamespace
from unittest.mock import patch

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transactions import (
    _account_storage_days,
    _fetch_account_transactions,
    _is_out_of_range_error,
    _storage_days_from_segment,
    _widen_start_for_pending,
)
from finance_server.fints import sync
from finance_server.fints.sync import _archived_ibans


class FakeAccount:
    pass


class FakeClient:
    def __init__(self, earliest_supported, error_message=None):
        self.earliest_supported = earliest_supported
        self.calls = []
        self.error_message = error_message or (
            "Error response: 9210 Abrufzeitraum außerhalb des unterstützten Bereichs."
        )

    def get_transactions(self, account, start_date, end_date, include_pending):
        self.calls.append((start_date, end_date))
        if start_date < self.earliest_supported:
            raise Exception(self.error_message)
        return [end_date]


class FakeBpd:
    def __init__(self, segments):
        self._segments = segments

    def find_segment_highest_version(self, name):
        return self._segments.get(name)


def test_archived_ibans_are_normalized_for_sync_exclusion():
    assert _archived_ibans(
        {
            "accounts": [
                {"iban": "DE12 3456", "archived": True},
                {"iban": "DE98 7654", "archived": False},
            ]
        }
    ) == {"DE123456"}


def test_chunked_fetch_returns_newer_data_when_oldest_block_out_of_range():
    start = datetime.date(2020, 1, 1)
    end = datetime.date(2020, 5, 1)
    client = FakeClient(earliest_supported=datetime.date(2020, 3, 1))

    result, tan_value = _fetch_account_transactions(client, FakeAccount(), start, end, None)

    # Erster Versuch war der komplette Zeitraum
    assert client.calls[0] == (start, end)
    # Danach wurde in Blöcken abgefragt (rückwärts)
    assert len(client.calls) > 1
    # Ergebnis enthält nur die unterstützten (neueren) Blöcke
    assert result, "es sollten neuere Blöcke geliefert werden"
    assert all(item >= client.earliest_supported for item in result)
    assert tan_value is None


def test_chunked_fetch_not_used_when_full_range_works():
    start = datetime.date(2020, 1, 1)
    end = datetime.date(2020, 1, 10)
    client = FakeClient(earliest_supported=datetime.date(2019, 1, 1))

    result, _ = _fetch_account_transactions(client, FakeAccount(), start, end, None)

    assert len(client.calls) == 1
    assert result == [end]


def test_is_out_of_range_error_detects_bank_codes():
    assert _is_out_of_range_error(
        Exception("Error response: 9210 Abrufzeitraum außerhalb des unterstützten Bereichs.")
    )
    assert _is_out_of_range_error(Exception("Error response: 9010 Verarbeitung nicht möglich."))
    assert _is_out_of_range_error(Exception("Error response: 9050 Nachricht teilweise fehlerhaft."))
    assert not _is_out_of_range_error(Exception("Error response: 9040 Anmeldung fehlgeschlagen."))


def test_chunked_fetch_triggered_by_9010():
    start = datetime.date(2020, 1, 1)
    end = datetime.date(2020, 5, 1)
    client = FakeClient(
        earliest_supported=datetime.date(2020, 3, 1),
        error_message="Error response: 9010 Verarbeitung nicht möglich.",
    )

    result, _ = _fetch_account_transactions(client, FakeAccount(), start, end, None)

    assert client.calls[0] == (start, end)
    assert len(client.calls) > 1
    assert result


def test_storage_days_from_additional_data():
    segment = SimpleNamespace(
        parameter=None,
        _additional_data=["1", "1", "0", ["90", "J", "N"]],
    )
    assert _storage_days_from_segment(segment) == 90


def test_storage_days_from_typed_parameter():
    segment = SimpleNamespace(
        parameter=SimpleNamespace(storage_duration=450),
        _additional_data=[],
    )
    assert _storage_days_from_segment(segment) == 450


def test_account_storage_days_prefers_mt940_over_camt():
    client = SimpleNamespace(
        bpd=FakeBpd(
            {
                "HIKAZS": SimpleNamespace(
                    parameter=None,
                    _additional_data=["1", "1", "0", ["360", "N", "N"]],
                ),
                "HICAZS": SimpleNamespace(
                    parameter=SimpleNamespace(storage_duration=450),
                    _additional_data=[],
                ),
            }
        )
    )
    assert _account_storage_days(client, FakeAccount()) == 360


def test_account_storage_days_falls_back_to_camt():
    client = SimpleNamespace(
        bpd=FakeBpd(
            {
                "HICAZS": SimpleNamespace(
                    parameter=SimpleNamespace(storage_duration=450),
                    _additional_data=[],
                ),
            }
        )
    )
    assert _account_storage_days(client, FakeAccount()) == 450


def test_account_storage_days_returns_none_without_bpd():
    assert _account_storage_days(SimpleNamespace(bpd=None), FakeAccount()) is None


def test_sync_all_worker_stores_pending_transactions():
    stored = {"bank_key": "norisbank", "scope": "norisbank"}
    payload = {
        "transactions": [{"id": "booked"}],
        "pending": [{"id": "pending"}],
        "balances": [],
    }
    stored_transactions = []
    stored_pending = []

    with (
        patch.object(sync, "list_bank_credentials", return_value=[stored]),
        patch.object(sync.BankCredentials, "model_validate", return_value=SimpleNamespace(scope="norisbank")),
        patch.object(sync, "fetch_transactions", return_value=payload),
        patch.object(
            sync,
            "store_transactions_in_local_db",
            side_effect=lambda rows: stored_transactions.extend(rows),
        ),
        patch.object(
            sync,
            "store_pending_in_local_db",
            side_effect=lambda rows, *args: stored_pending.extend(rows),
        ),
        patch.object(sync, "compute_and_store_balance_corrections"),
    ):
        sync.sync_all_worker(days=7)

    assert stored_transactions == payload["transactions"]
    assert stored_pending == payload["pending"]


def test_pending_lookback_widens_short_fetch_window():
    end = datetime.date(2026, 9, 21)
    # 1-Tage-Fenster (Tage seit letzter Buchung) wird auf den Pending-Horizont geöffnet,
    # sonst würden ältere vorgemerkte Umsätze beim Replace gelöscht.
    assert _widen_start_for_pending(end, end) == end - datetime.timedelta(days=30)
    assert _widen_start_for_pending(end - datetime.timedelta(days=1), end) == (
        end - datetime.timedelta(days=30)
    )
    # Ein bereits weiteres Fenster wird nicht verkleinert.
    wide = end - datetime.timedelta(days=365)
    assert _widen_start_for_pending(wide, end) == wide
    assert _widen_start_for_pending(None, end) == end - datetime.timedelta(days=30)
