from typing import Any

from fastapi import APIRouter, Body

from finance_server.db import get_setting, set_setting

router = APIRouter()

NOTIFY_EMAIL_KEY = "notify_email"


@router.get("/notifications")
def get_notifications() -> dict[str, Any]:
    return {"email": get_setting(NOTIFY_EMAIL_KEY) or ""}


@router.put("/notifications")
def update_notifications(email: str = Body(..., embed=True)) -> dict[str, Any]:
    set_setting(NOTIFY_EMAIL_KEY, (email or "").strip())
    return {"email": get_setting(NOTIFY_EMAIL_KEY) or ""}