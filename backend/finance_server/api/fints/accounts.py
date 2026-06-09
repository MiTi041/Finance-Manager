from typing import Any

from fastapi import APIRouter, HTTPException
from fints.exceptions import FinTSClientError

from finance_server.models.fints import AccountsRequest
from finance_server.fints.accounts import fetch_accounts
from finance_server.fints.client import (
    resolve_bank_credentials, resolve_bank_connection_details,
)
from finance_server.fints.common import TanRequired
from finance_server.services.rate_limiter import enforce_rate_limit

router = APIRouter()


@router.post("/accounts")
def get_accounts(request: AccountsRequest) -> dict[str, Any]:
    try:
        enforce_rate_limit("fetch_accounts")
        if request.credentials is not None:
            credentials = resolve_bank_connection_details(request.credentials)
        else:
            credentials = resolve_bank_credentials(None)
        return fetch_accounts(credentials)
    except TanRequired as err:
        raise HTTPException(status_code=409, detail={
            "code": "TAN_REQUIRED",
            "challenge": err.challenge,
            "decoupled": err.decoupled,
        })
    except FinTSClientError as err:
        raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")
