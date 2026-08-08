from typing import Any

from fastapi import APIRouter, Body

from finance_server.services.api_keys import (
    EXTERNAL_KEYS,
    get_external_key,
    update_external_key,
)

router = APIRouter()


@router.get("/keys")
def get_keys() -> dict[str, Any]:
    return {key: get_external_key(key) for key in EXTERNAL_KEYS}


@router.put("/keys")
def update_keys(payload: dict[str, str] = Body(...)) -> dict[str, Any]:
    for key in EXTERNAL_KEYS:
        if key in payload:
            update_external_key(key, payload[key] or "")
    return {key: get_external_key(key) for key in EXTERNAL_KEYS}