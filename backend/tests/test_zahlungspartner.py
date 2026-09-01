from __future__ import annotations

import sqlite3

import pytest

import finance_server.db.references as references


def _payload(**overrides):
    payload = {
        "name": "Trade Republic",
        "is_company": True,
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def conn(test_db: sqlite3.Connection, monkeypatch):
    monkeypatch.setattr(references, "get_connection", lambda: test_db)
    monkeypatch.setattr(
        "finance_server.services.sync_logger.log_crud_event",
        lambda *args, **kwargs: None,
    )
    return test_db


def test_own_account_roundtrips_for_company(conn):
    record = references.create_zahlungspartner_record(_payload(is_own_account=True))
    assert record["is_own_account"] is True

    fetched = references.get_zahlungspartner_record(record["id"])
    assert fetched["is_own_account"] is True


def test_own_account_defaults_false(conn):
    record = references.create_zahlungspartner_record(_payload())
    assert record["is_own_account"] is False


def test_company_update_toggles_own_account(conn):
    record = references.create_zahlungspartner_record(_payload())
    assert record["is_own_account"] is False

    updated = references.update_zahlungspartner_record(record["id"], {"is_own_account": True})
    assert updated["is_own_account"] is True


def test_person_cannot_be_own_account(conn):
    record = references.create_zahlungspartner_record(
        _payload(is_company=False, is_own_account=True)
    )
    assert record["is_company"] is False
    assert record["is_own_account"] is False
