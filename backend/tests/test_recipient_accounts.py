from __future__ import annotations

import sqlite3

import pytest

import finance_server.db.references as references


def _payload(**overrides):
    payload = {
        "account_name": "Trade Republic",
        "iban": "DE02120300000000202051",
        "bic": None,
        "recipient_name": "Max Mustermann",
        "is_donation_account": False,
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


def test_update_toggles_logo_path(conn):
    record = references.create_empfaengerkonto_record(
        _payload(iban="DE02500105170137075030")
    )

    updated = references.update_empfaengerkonto_record(
        record["id"],
        {
            "local_logo_path": "/assets/images/payment-partner-logos/trade-republic.png",
        },
    )
    assert (
        updated["local_logo_path"]
        == "/assets/images/payment-partner-logos/trade-republic.png"
    )

    cleared = references.update_empfaengerkonto_record(
        record["id"], {"local_logo_path": None}
    )
    assert cleared["local_logo_path"] is None
