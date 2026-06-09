import logging
import threading
from typing import Any

from fastapi import APIRouter, HTTPException

from finance_server.models.fints import TransactionsRequest
from finance_server.fints.sync import sync_all_worker, get_sync_state, is_sync_running, set_sync_started
from finance_server.services.rate_limiter import enforce_rate_limit

router = APIRouter()


@router.post("/transactions/sync_all")
def start_sync_all(request: TransactionsRequest) -> dict[str, Any]:
    enforce_rate_limit("sync_all")
    if is_sync_running():
        raise HTTPException(status_code=409, detail="Ein Sync läuft bereits.")
    try:
        days = request.days
        set_sync_started()
        thread = threading.Thread(target=sync_all_worker, args=(days,), daemon=True)
        thread.start()
        return {"status": "started", "queued": True}
    except Exception as err:
        logging.exception("Failed to start sync_all")
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/transactions/sync_status")
def get_sync_status() -> dict[str, Any]:
    return get_sync_state()
