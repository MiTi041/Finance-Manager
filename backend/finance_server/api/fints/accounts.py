from typing import Any

from fastapi import APIRouter, HTTPException
from fints.client import NeedTANResponse
from fints.exceptions import FinTSClientError

from finance_server.models import BankCredentials

from .common import TanRequired
from .client import (
    resolve_bank_credentials, resolve_bank_connection_details,
    with_state_retry, make_client, bootstrap_client, save_state,
    resolve_tan_until_done,
)
from .models import AccountsRequest

router = APIRouter()

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
                    "blz": acc.blz, "currency": getattr(acc, "currency", "EUR")
                })
        return {"count": len(accounts), "accounts": accounts}

    return with_state_retry(creds, _run)

@router.post("/accounts")
def get_accounts(request: AccountsRequest) -> dict[str, Any]:
    try:
        if request.credentials is not None:
            credentials = resolve_bank_connection_details(request.credentials)
        else:
            credentials = resolve_bank_credentials(None)
        return fetch_accounts(credentials)
    except TanRequired as err:
        raise HTTPException(status_code=409, detail={
            "code": "TAN_REQUIRED",
            "challenge": err.challenge,
            "decoupled": err.decoupled
        })
    except FinTSClientError as err: raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")
