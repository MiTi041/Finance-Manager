from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fints.exceptions import FinTSClientPINError, FinTSConnectionError

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.api.fints.accounts import get_accounts
from finance_server.api.fints.transactions import get_transactions
from finance_server.fints.client import bootstrap_client, with_state_retry
from finance_server.fints.common import BankLoginRejected
from finance_server.models.bank import BankCredentials
from finance_server.models.fints import AccountsRequest, TransactionsRequest


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


def test_accounts_endpoint_passes_tan_to_fetch_accounts():
    creds = BankCredentials(bank_key="consorsbank", username="u", pin="p")
    with (
        patch("finance_server.api.fints.accounts.enforce_rate_limit"),
        patch(
            "finance_server.api.fints.accounts.fetch_accounts",
            return_value={"count": 0, "accounts": []},
        ) as fetch_mock,
    ):
        get_accounts(AccountsRequest(credentials=creds, tan="123456"))
    assert fetch_mock.call_args.args[1] == "123456"


def test_accounts_endpoint_skips_rate_limit_when_tan_provided():
    creds = BankCredentials(bank_key="consorsbank", username="u", pin="p")
    with (
        patch("finance_server.api.fints.accounts.enforce_rate_limit") as rate_mock,
        patch(
            "finance_server.api.fints.accounts.fetch_accounts",
            return_value={"count": 0, "accounts": []},
        ),
    ):
        get_accounts(AccountsRequest(credentials=creds, tan="123456"))
    rate_mock.assert_not_called()


def test_accounts_endpoint_enforces_rate_limit_without_tan():
    creds = BankCredentials(bank_key="consorsbank", username="u", pin="p")
    with (
        patch("finance_server.api.fints.accounts.enforce_rate_limit") as rate_mock,
        patch(
            "finance_server.api.fints.accounts.fetch_accounts",
            return_value={"count": 0, "accounts": []},
        ),
    ):
        get_accounts(AccountsRequest(credentials=creds))
    rate_mock.assert_called_once_with("fetch_accounts", "consorsbank")


def test_with_state_retry_retries_once_on_connection_error():
    creds = BankCredentials(bank_key="consorsbank", username="u", pin="p")
    calls = []

    def run_fn(state):
        calls.append(state)
        if len(calls) == 1:
            raise FinTSConnectionError("Verbindung abgebrochen")
        return {"ok": True}

    with (
        patch("finance_server.fints.client.load_state", return_value=b"state"),
        patch("finance_server.fints.client.clear_state_files_for_creds") as clear_mock,
    ):
        result = with_state_retry(creds, run_fn)

    assert result == {"ok": True}
    assert calls == [b"state", None]
    clear_mock.assert_called_once_with(creds)


def test_transactions_endpoint_maps_pin_error_to_login_failed():
    creds = BankCredentials(bank_key="ing-diba", username="u", pin="p")
    with (
        patch("finance_server.api.fints.transactions.enforce_rate_limit"),
        patch(
            "finance_server.api.fints.transactions.resolve_bank_credentials",
            return_value=creds,
        ),
        patch(
            "finance_server.api.fints.transactions.fetch_and_store_transactions",
            side_effect=FinTSClientPINError(
                "Authentifizierung fehlgeschlagen (9942: Log-in fehlgeschlagen. "
                "3 Fehlversuche führen zur Sperrung. Entsperren auf ING.de). Bitte PIN pruefen."
            ),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            get_transactions(TransactionsRequest(scope="ing-diba:u", days=30))
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "FINTS_LOGIN_FAILED"
    assert "9942" in exc.value.detail["message"]
