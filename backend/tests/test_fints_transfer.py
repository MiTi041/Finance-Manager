from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fints.client import TransactionResponse

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transfer import send_transfer
from finance_server.fints.client import validate_transfer_result
from finance_server.models.fints import TransferRequest


def _client():
    client = MagicMock()
    client.init_tan_response = None
    client.get_sepa_accounts.return_value = [
        MagicMock(iban="DE10000000000000000000", __str__=lambda s: "Sender")
    ]
    client.simple_sepa_transfer.return_value = MagicMock()
    return client


def _run(instant_payment: bool):
    client = _client()
    with (
        patch("finance_server.fints.transfer.resolve_bank_credentials", return_value=("creds", None)),
        patch("finance_server.fints.transfer.load_state", return_value=None),
        patch("finance_server.fints.transfer.make_client", return_value=client),
        patch("finance_server.fints.transfer.minimal_interactive_cli_bootstrap"),
        patch("finance_server.fints.transfer.save_state"),
        patch("finance_server.fints.transfer.validate_transfer_result"),
    ):
        req = TransferRequest(
            recipient_iban="DE10000000000000000000",
            recipient_name="Empfänger",
            amount="12.34",
            reason="Test",
            instant_payment=instant_payment,
        )
        send_transfer(req)
    return client.simple_sepa_transfer.call_args.kwargs["instant_payment"]


def test_send_transfer_passes_instant_payment_true():
    assert _run(True) is True


def test_send_transfer_passes_instant_payment_false():
    assert _run(False) is False


def test_validate_transfer_result_includes_bank_texts():
    result = TransactionResponse.__new__(TransactionResponse)
    result.responses = [
        SimpleNamespace(code="9010", text="Der Auftrag wurde nicht ausgeführt."),
        SimpleNamespace(code="3968", text="Ausführung in Echtzeit nicht möglich. (MDC123)"),
        SimpleNamespace(code="0020", text="Order accepted"),
    ]
    with pytest.raises(HTTPException) as exc:
        validate_transfer_result(result)
    detail = exc.value.detail
    assert detail["code"] == "FINTS_TRANSFER_FAILED"
    assert detail["message"] == (
        "Die Überweisung wurde von der Bank abgelehnt: Der Auftrag wurde nicht ausgeführt.; "
        "Ausführung in Echtzeit nicht möglich. (MDC123)"
    )
    assert [r["code"] for r in detail["responses"]] == ["9010", "3968", "0020"]
