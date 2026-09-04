from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.api.fints.accounts import get_accounts
from finance_server.fints.client import bootstrap_client
from finance_server.fints.common import BankLoginRejected
from finance_server.models.bank import BankCredentials
from finance_server.models.fints import AccountsRequest


def test_bootstrap_client_translates_missing_system_id():
    client = MagicMock()
    with patch(
        "finance_server.fints.client.minimal_interactive_cli_bootstrap",
        side_effect=ValueError("Could not find system_id"),
    ):
        with pytest.raises(BankLoginRejected):
            bootstrap_client(client)


def test_bootstrap_client_reports_product_not_registered():
    from types import SimpleNamespace

    response = SimpleNamespace(code="9078", text="Dialog abgebrochen - FinTS-Produkt ist nicht registriert")
    segment = SimpleNamespace(responses=[response])
    message = SimpleNamespace()
    message.find_segments = lambda query: [segment]
    connection = SimpleNamespace(_finance_responses=[message])
    client = SimpleNamespace(connection=connection, product_name="3FD7ECC1CC14CE8B31C59DD07")

    with patch(
        "finance_server.fints.client.minimal_interactive_cli_bootstrap",
        side_effect=ValueError("Could not find system_id"),
    ):
        with pytest.raises(BankLoginRejected, match="nicht registriert"):
            bootstrap_client(client)


def test_bootstrap_client_keeps_other_value_errors():
    client = MagicMock()
    with patch(
        "finance_server.fints.client.minimal_interactive_cli_bootstrap",
        side_effect=ValueError("something else"),
    ):
        with pytest.raises(ValueError, match="something else"):
            bootstrap_client(client)


def test_accounts_endpoint_maps_login_rejection_to_401():
    creds = BankCredentials(bank_key="norisbank", username="u", pin="p")
    with (
        patch("finance_server.api.fints.accounts.enforce_rate_limit"),
        patch(
            "finance_server.api.fints.accounts.fetch_accounts",
            side_effect=BankLoginRejected("Anmeldung bei der Bank fehlgeschlagen. Bitte prüfen."),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            get_accounts(AccountsRequest(credentials=creds))
    detail = exc.value.detail
    assert exc.value.status_code == 401
    assert detail["code"] == "FINTS_LOGIN_FAILED"
    assert "Anmeldung bei der Bank fehlgeschlagen" in detail["message"]
