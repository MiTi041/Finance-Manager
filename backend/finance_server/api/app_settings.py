from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, HTTPException

from finance_server.db.settings import get_setting, set_setting
from finance_server.services.sync_logger import log_crud_event

router = APIRouter()

BOOL_SETTINGS = {"hide_pending_transactions"}


def _read() -> dict[str, bool]:
    return {key: get_setting(key) == "true" for key in BOOL_SETTINGS}


@router.get("/db/settings")
def get_app_settings() -> dict[str, bool]:
    return _read()


@router.patch("/db/settings")
def update_app_settings(payload: dict[str, bool] = Body(...)) -> dict[str, bool]:
    unknown = set(payload) - BOOL_SETTINGS
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unbekannte Einstellung: {', '.join(sorted(unknown))}",
        )
    for key, value in payload.items():
        previous = get_setting(key)
        value_str = "true" if value else "false"
        set_setting(key, value_str)
        log_crud_event(
            "app_settings",
            None,
            "INSERT" if previous is None else "UPDATE",
            {
                "key": key,
                "value": value_str,
                "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            },
        )
    return _read()
