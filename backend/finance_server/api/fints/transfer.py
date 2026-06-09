from typing import Any

from fastapi import APIRouter, HTTPException
from fints.exceptions import FinTSClientError

from finance_server.models.fints import TransferRequest
from finance_server.fints.transfer import send_transfer
from finance_server.fints.common import TanRequired, TanTimeout

router = APIRouter()


@router.post("/transfer")
def create_transfer(request: TransferRequest) -> dict[str, Any]:
    try:
        return send_transfer(request)
    except TanRequired as err:
        raise HTTPException(status_code=409, detail={"code": "TAN_REQUIRED", "challenge": err.challenge, "decoupled": err.decoupled})
    except TanTimeout as err:
        raise HTTPException(status_code=408, detail=str(err))
    except FinTSClientError as err:
        raise HTTPException(status_code=502, detail=f"FinTS-Initialisierung fehlgeschlagen. Originalfehler: {err}")
