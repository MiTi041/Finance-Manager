from __future__ import annotations

import datetime
from types import SimpleNamespace

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transactions import (
    _account_storage_days,
    _fetch_account_transactions,
    _is_out_of_range_error,
    _storage_days_from_segment,
)


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
