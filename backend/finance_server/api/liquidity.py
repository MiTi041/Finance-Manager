from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from finance_server.db.liquidity import (
    create_entry,
    delete_entry,
    list_entries,
    update_entry,
)
from finance_server.models.liquidity import (
    LiquidityEntryCreateRequest,
    LiquidityEntryUpdateRequest,
)

router = APIRouter()


@router.get("/db/liquidity-entries")
def get_liquidity_entries() -> dict[str, Any]:
    return {"entries": list_entries()}


@router.post("/db/liquidity-entries")
def create_liquidity_entry_endpoint(request: LiquidityEntryCreateRequest) -> dict[str, Any]:
    try:
        return create_entry(request.label, request.amount, request.kind, request.certainty)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/db/liquidity-entries/{entry_id}")
def update_liquidity_entry_endpoint(
    entry_id: int, request: LiquidityEntryUpdateRequest
) -> dict[str, Any]:
    try:
        result = update_entry(
            entry_id,
            label=request.label,
            amount=request.amount,
            kind=request.kind,
            certainty=request.certainty,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if result is None:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return result


@router.delete("/db/liquidity-entries/{entry_id}")
def delete_liquidity_entry_endpoint(entry_id: int) -> dict[str, Any]:
    if not delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return {"deleted": True}
