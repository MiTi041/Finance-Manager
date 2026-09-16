from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transfer import _record_manual_recipient_income
from finance_server.models.fints import TransferRequest


def _req() -> TransferRequest:
    return TransferRequest(
        recipient_iban="DE02120300000000202051",
        recipient_name="Sparkonto",
        amount=Decimal("50.00"),
        reason="Sparen",
        sender_iban="DE89370400440532013000",
        sender_name="Finance-Manager",
    )


def test_records_income_on_manual_recipient():
    service = MagicMock()
    with patch(
        "finance_server.fints.transfer.load_bank_credentials_by_iban",
        return_value={"bank_key": "manual"},
    ), patch(
        "finance_server.services.transaction_service.TransactionService",
        return_value=service,
    ):
        _record_manual_recipient_income(
            _req(), "DE89370400440532013000", "Max Mustermann"
        )

    service.create_manual_transaction.assert_called_once()
    kwargs = service.create_manual_transaction.call_args.kwargs
    assert kwargs["account_iban"] == "DE02120300000000202051"
    assert kwargs["amount"] == 50.0
    assert kwargs["recipient_name"] == "Max Mustermann"
    assert kwargs["recipient_iban"] == "DE89370400440532013000"
    assert kwargs["purpose"] == "Sparen"


def test_skips_non_manual_recipient():
    service = MagicMock()
    with patch(
        "finance_server.fints.transfer.load_bank_credentials_by_iban",
        return_value={"bank_key": "comdirect"},
    ), patch(
        "finance_server.services.transaction_service.TransactionService",
        return_value=service,
    ):
        _record_manual_recipient_income(
            _req(), "DE89370400440532013000", "Max Mustermann"
        )

    service.create_manual_transaction.assert_not_called()
