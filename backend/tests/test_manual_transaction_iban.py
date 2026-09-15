from __future__ import annotations

from unittest.mock import patch

from finance_server.services.transaction_service import TransactionService


def test_create_manual_transaction_maps_recipient_iban_to_applicant_iban():
    captured: dict = {}

    def fake_insert(rows):
        captured["rows"] = list(rows)
        return {"received": 1, "inserted": 1, "ignored": 0}

    with patch(
        "finance_server.services.transaction_service.load_bank_credentials_by_iban",
        return_value={"bank_key": "manual"},
    ), patch(
        "finance_server.services.transaction_service.insert_transactions",
        side_effect=fake_insert,
    ):
        TransactionService().create_manual_transaction(
            account_iban="DE02120300000000202051",
            date="2026-07-01",
            amount=-12.5,
            recipient_name="Firma GmbH",
            recipient_iban="DE89370400440532013000",
        )

    data = captured["rows"][0]["data"]
    assert data["applicant_iban"] == "DE89370400440532013000"
    assert data["recipient_name"] == "Firma GmbH"


def test_create_manual_transaction_iban_optional():
    captured: dict = {}

    def fake_insert(rows):
        captured["rows"] = list(rows)
        return {"received": 1, "inserted": 1, "ignored": 0}

    with patch(
        "finance_server.services.transaction_service.load_bank_credentials_by_iban",
        return_value={"bank_key": "manual"},
    ), patch(
        "finance_server.services.transaction_service.insert_transactions",
        side_effect=fake_insert,
    ):
        TransactionService().create_manual_transaction(
            account_iban="DE02120300000000202051",
            date="2026-07-01",
            amount=-12.5,
        )

    assert captured["rows"][0]["data"]["applicant_iban"] is None
