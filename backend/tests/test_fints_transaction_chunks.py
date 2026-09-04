from __future__ import annotations

import datetime

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transactions import _fetch_account_transactions


class FakeAccount:
    pass


class FakeClient:
    def __init__(self, earliest_supported):
        self.earliest_supported = earliest_supported
        self.calls = []

    def get_transactions(self, account, start_date, end_date, include_pending):
        self.calls.append((start_date, end_date))
        if start_date < self.earliest_supported:
            raise Exception(
                "Error response: 9210 Abrufzeitraum außerhalb des unterstützten Bereichs."
            )
        return [end_date]


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
