from typing import Any

from fastapi import APIRouter, HTTPException
from fints.exceptions import FinTSClientError

from finance_server.models.fints import TransactionsRequest
from finance_server.fints.client import resolve_bank_credentials
from finance_server.fints.common import TanRequired, TanTimeout
from finance_server.fints.transactions import fetch_and_store_transactions, resolve_auto_sync_days
from finance_server.services.rate_limiter import enforce_rate_limit

router = APIRouter()


@router.post("/transactions")
def get_transactions(request: TransactionsRequest) -> dict[str, Any]:
    try:
        scope = request.scope or (request.credentials.scope if request.credentials else None)
        enforce_rate_limit("fetch_transactions", scope)
        credentials = resolve_bank_credentials(request.credentials, request.scope)
        effective_days = (
            request.days
            if request.days is not None
            else resolve_auto_sync_days(request.iban)
        )
        return fetch_and_store_transactions(
            credentials, effective_days, request.tan, request.iban, request.scope
        )
    except TanRequired as err:
        raise HTTPException(status_code=409, detail={"code": "TAN_REQUIRED", "challenge": err.challenge, "decoupled": err.decoupled})
    except TanTimeout as err:
        raise HTTPException(status_code=408, detail=str(err))
    except FinTSClientError as err:
        raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")
