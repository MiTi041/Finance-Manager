import datetime
import logging
import threading
import time
from typing import Any

from finance_server.models.bank import BankCredentials

from finance_server.db import (
    compute_and_store_balance_corrections,
    list_bank_credentials,
)

from .transactions import fetch_transactions, store_transactions_in_local_db, resolve_auto_sync_days

_sync_status_lock = threading.Lock()
_sync_state: dict[str, Any] = {"current": None, "progress": [], "last_run": None}


def update_sync_state(scope: str, status: str, message: str | None = None) -> None:
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
        _sync_state["current"] = next(
            (e["scope"] for e in _sync_state["progress"] if e["status"] == "running"), None
        )


def get_sync_state() -> dict[str, Any]:
    with _sync_status_lock:
        return {
            "current": _sync_state["current"],
            "progress": list(_sync_state["progress"]),
            "last_run": _sync_state["last_run"],
        }


def is_sync_running() -> bool:
    with _sync_status_lock:
        return _sync_state["current"] is not None


def set_sync_started() -> None:
    with _sync_status_lock:
        _sync_state["current"] = "__initiating__"


def sync_all_worker(days: int | None = None) -> None:
    creds_list = list_bank_credentials()
    with _sync_status_lock:
        _sync_state["progress"] = []
        _sync_state["current"] = None
        _sync_state["last_run"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for idx, stored in enumerate(creds_list):
        if idx > 0:
            time.sleep(5)
        scope = stored.get("scope") or "unknown"
        try:
            update_sync_state(scope, "queued", None)
            creds = BankCredentials.model_validate(stored)
            update_sync_state(scope, "running", None)
            try:
                payload = fetch_transactions(
                    creds, days=days if days is not None else resolve_auto_sync_days(None), tan=None, iban=None
                )
                try:
                    store_transactions_in_local_db(payload.get("transactions", []))
                except Exception:
                    logging.exception("Lokale DB Sync failed for %s", scope)
                try:
                    compute_and_store_balance_corrections(scope, payload.get("balances", []))
                except Exception:
                    logging.exception("Saldo-Korrektur failed for %s", scope)
                update_sync_state(scope, "done", None)
            except Exception as err:
                logging.exception("Sync failed for %s", scope)
                update_sync_state(scope, "error", str(err))
        except Exception:
            logging.exception("Preparing sync failed for %s", scope)
            update_sync_state(scope, "error", "preparation failed")

    with _sync_status_lock:
        _sync_state["current"] = None
