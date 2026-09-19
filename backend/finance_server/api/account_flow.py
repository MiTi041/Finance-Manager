from __future__ import annotations

import json

from fastapi import APIRouter, Body
from pydantic import BaseModel, Field

from finance_server.db.settings import get_setting, set_setting

router = APIRouter()
_ACCOUNT_FLOW_LAYOUT_KEY = "account_flow_layout"


class AccountFlowPoint(BaseModel):
    x: float
    y: float


class AccountFlowZone(BaseModel):
    id: str
    title: str
    x: float
    y: float
    width: float
    height: float


class AccountFlowLayout(BaseModel):
    positions: dict[str, AccountFlowPoint] = Field(default_factory=dict)
    zones: list[AccountFlowZone] = Field(default_factory=list)
    notes: dict[str, str] = Field(default_factory=dict)


@router.get("/account-flow/layout", response_model=AccountFlowLayout)
def get_account_flow_layout() -> AccountFlowLayout:
    raw_layout = get_setting(_ACCOUNT_FLOW_LAYOUT_KEY)
    if not raw_layout:
        return AccountFlowLayout()

    try:
        return AccountFlowLayout.model_validate(json.loads(raw_layout))
    except (json.JSONDecodeError, ValueError):
        return AccountFlowLayout()


@router.patch("/account-flow/layout", response_model=AccountFlowLayout)
def update_account_flow_layout(
    payload: AccountFlowLayout = Body(...),
) -> AccountFlowLayout:
    set_setting(_ACCOUNT_FLOW_LAYOUT_KEY, payload.model_dump_json())
    return payload
