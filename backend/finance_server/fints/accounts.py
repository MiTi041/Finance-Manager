from typing import Any

from fints.client import NeedTANResponse
from fints.exceptions import FinTSClientError

from finance_server.models.bank import BankCredentials

from .common import TanRequired
from .client import (
    with_state_retry, make_client, bootstrap_client, save_state,
    resolve_tan_until_done,
)


def fetch_accounts(creds: BankCredentials) -> dict[str, Any]:
    def _run(from_data: bytes | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        accounts = []
        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, None)
            save_state(client, creds)
            for acc in client.get_sepa_accounts():
                accounts.append({
                    "iban": acc.iban, "bic": acc.bic, "accountnumber": acc.accountnumber,
                    "blz": acc.blz, "currency": getattr(acc, "currency", "EUR"),
                })
        return {"count": len(accounts), "accounts": accounts}

    return with_state_retry(creds, _run)
