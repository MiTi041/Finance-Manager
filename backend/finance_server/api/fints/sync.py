import datetime
import logging
import threading
from typing import Any

from fastapi import APIRouter, HTTPException

from finance_server.db import list_bank_credentials
from finance_server.models import BankCredentials

from .models import TransactionsRequest
from .transactions import fetch_transactions, store_transactions_in_local_db, resolve_auto_sync_days

router = APIRouter()

_sync_status_lock = threading.Lock()
_sync_state: dict[str, Any] = {"current": None, "progress": [], "last_run": None}

def _update_sync_state(scope: str, status: str, message: str | None = None) -> None:
    with _sync_status_lock:
        found = False
        for entry in _sync_state["progress"]:
            if entry.get("scope") == scope:
                entry["status"] = status
                entry["message"] = message
                found = True
                break
        if not found:
            _sync_state["progress"].append({"scope": scope, "status": status, "message": message})
        _sync_state["current"] = next((e["scope"] for e in _sync_state["progress"] if e["status"] == "running"), None)

def _sync_all_worker(days: int | None = None) -> None:
    creds_list = list_bank_credentials()
    with _sync_status_lock:
        _sync_state["progress"] = []
        _sync_state["current"] = None
        _sync_state["last_run"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for stored in creds_list:
        scope = stored.get("scope") or "unknown"
        try:
            _update_sync_state(scope, "queued", None)
            creds = BankCredentials.model_validate(stored)
            _update_sync_state(scope, "running", None)
            try:
                payload = fetch_transactions(creds, days=days if days is not None else resolve_auto_sync_days(None), tan=None, iban=None)
                try:
                    store_transactions_in_local_db(payload.get("transactions", []))
                except Exception:
                    logging.exception("Lokale DB Sync failed for %s", scope)
                _update_sync_state(scope, "done", None)
            except Exception as err:
                logging.exception("Sync failed for %s", scope)
                _update_sync_state(scope, "error", str(err))
        except Exception:
            logging.exception("Preparing sync failed for %s", scope)
            _update_sync_state(scope, "error", "preparation failed")

    with _sync_status_lock:
        _sync_state["current"] = None

@router.post("/transactions/sync_all")
def start_sync_all(request: TransactionsRequest) -> dict[str, Any]:
    try:
        days = request.days
        thread = threading.Thread(target=_sync_all_worker, args=(days,), daemon=True)
        thread.start()
        return {"status": "started", "queued": True}
    except Exception as err:
        logging.exception("Failed to start sync_all")
        raise HTTPException(status_code=500, detail=str(err))

@router.get("/transactions/sync_status")
def get_sync_status() -> dict[str, Any]:
    with _sync_status_lock:
        return dict(_sync_state)
