from __future__ import annotations

from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.api.fints.transfer import create_transfer
from finance_server.fints.transfer import send_transfer
from finance_server.fints.vop_store import consume_pending_vop, save_pending_vop
from finance_server.models.fints import TransferRequest
from fints.client import NeedVOPResponse


def _client():
    client = MagicMock()
    client.init_tan_response = None
    client.get_sepa_accounts.return_value = [
        MagicMock(iban="DE10000000000000000000", __str__=lambda s: "Sender")
    ]
    client.simple_sepa_transfer.return_value = MagicMock()
    return client


def _patches(client):
    creds = SimpleNamespace(bank_key="norisbank", username="user")
    return [
        patch("finance_server.fints.transfer.resolve_bank_credentials", return_value=creds),
        patch("finance_server.fints.transfer.load_state", return_value=None),
        patch("finance_server.fints.transfer.make_client", return_value=client),
        patch("finance_server.fints.transfer.bootstrap_client"),
        patch("finance_server.fints.transfer.save_state"),
        patch("finance_server.fints.transfer.validate_transfer_result"),
    ]


def _stack(client):
    stack = ExitStack()
    for p in _patches(client):
        stack.enter_context(p)
    return stack


def _request(**overrides) -> TransferRequest:
    defaults = dict(
        recipient_iban="DE10000000000000000000",
        recipient_name="Hauptkonto",
        amount="0.01",
        reason="Test",
    )
    defaults.update(overrides)
    return TransferRequest(**defaults)


def _run(client, req: TransferRequest):
    with _stack(client):
        send_transfer(req)


def _fake_vop(result_code: str):
    vop = NeedVOPResponse(
        vop_result=SimpleNamespace(
            vop_single_result=SimpleNamespace(
                result=result_code,
                close_match_name=None,
                other_identification=None,
            ),
            manual_authorization_notice="Kontrollieren Sie das VOP-Prüfergebnis.",
        ),
        command_seg=MagicMock(),
    )
    vop.get_data = lambda: b"pending-blob"
    return vop


def test_mismatch_raises_vop_confirmation_with_token():
    client = _client()
    client.simple_sepa_transfer.return_value = _fake_vop("RVNM")
    from finance_server.fints.common import VopConfirmationRequired

    with (
        _stack(client),
        patch(
            "finance_server.fints.transfer.save_pending_vop",
            return_value="token123",
        ) as save_mock,
        patch("finance_server.fints.transfer.find_bank_account_by_iban", return_value=None),
    ):
        with pytest.raises(VopConfirmationRequired) as exc_info:
            send_transfer(_request())
    err = exc_info.value
    assert err.vop_token == "token123"
    assert err.result == "RVNM"
    assert err.recipient_name == "Hauptkonto"
    assert "Kontrollieren" in (err.notice or "")
    save_mock.assert_called_once()


def test_rcvc_is_auto_approved():
    client = _client()
    vop = _fake_vop("RCVC")
    client.simple_sepa_transfer.return_value = vop
    client.approve_vop_response.return_value = MagicMock()
    with (
        _stack(client),
        patch("finance_server.fints.transfer.find_bank_account_by_iban", return_value=None),
    ):
        send_transfer(_request())
    client.approve_vop_response.assert_called_once_with(vop)


def test_confirm_request_approves_stored_vop():
    client = _client()
    challenge = _fake_vop("RVNM")
    client.approve_vop_response.return_value = MagicMock()
    record = {
        "blob_b64": "cGVuZGluZy1ibG9i",
        "scope_key": "norisbank:user",
        "sender_iban": "DE10000000000000000000",
    }
    with (
        _stack(client),
        patch("finance_server.fints.transfer.load_pending_vop", return_value=record),
        patch(
            "fints.client.NeedRetryResponse.from_data",
            new=classmethod(lambda cls, blob: challenge),
        ),
        patch("finance_server.fints.transfer.find_bank_account_by_iban", return_value=None),
    ):
        send_transfer(_request(vop_token="token123"))
    client.approve_vop_response.assert_called_once()


def test_recipient_name_prefers_holder_for_own_account():
    client = _client()

    def _resolve(iban):
        if iban == "DE10000000000000000000":
            return {"holder_name": "Michael Tissen", "account_name": "Hauptkonto"}
        return {"holder_name": None, "account_name": "Top-Girokonto"}

    with (
        _stack(client),
        patch("finance_server.fints.transfer.find_bank_account_by_iban", side_effect=_resolve),
    ):
        send_transfer(_request())
    assert client.simple_sepa_transfer.call_args.kwargs["recipient_name"] == "Michael Tissen"


def test_recipient_name_keeps_manual_name_without_holder():
    client = _client()
    with (
        _stack(client),
        patch("finance_server.fints.transfer.find_bank_account_by_iban", return_value=None),
    ):
        send_transfer(_request(recipient_name="Max Mustermann"))
    assert client.simple_sepa_transfer.call_args.kwargs["recipient_name"] == "Max Mustermann"


def test_api_maps_vop_confirmation_to_409():
    from finance_server.fints.common import VopConfirmationRequired

    with patch(
        "finance_server.api.fints.transfer.send_transfer",
        side_effect=VopConfirmationRequired(
            vop_token="abc",
            result="RVNM",
            recipient_iban="DE10000000000000000000",
            recipient_name="Hauptkonto",
            notice="Kontrollieren Sie das VOP-Prüfergebnis.",
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            create_transfer(_request())
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "VOP_REQUIRED"
    assert exc.value.detail["vop_token"] == "abc"
    assert exc.value.detail["result"] == "RVNM"


def test_vop_store_roundtrip():
    token = save_pending_vop(b"my-blob")
    record = consume_pending_vop(token)
    assert record is not None
    import base64

    assert base64.b64decode(record["blob_b64"]) == b"my-blob"
    assert consume_pending_vop(token) is None
