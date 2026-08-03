from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from finance_server.db.budgets import (
    create_budget,
    delete_budget,
    list_budgets,
    update_budget,
)
from finance_server.models.budget import BudgetCreateRequest, BudgetUpdateRequest

router = APIRouter()


@router.get("/db/budgets")
def get_budgets(month: str = Query(...)) -> dict[str, Any]:
    return {"budgets": list_budgets(month)}


@router.post("/db/budgets")
def create_budget_endpoint(request: BudgetCreateRequest) -> dict[str, Any]:
    try:
        return create_budget(request.name, request.category_ids, request.amount, request.period)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/db/budgets/{budget_id}")
def update_budget_endpoint(budget_id: int, request: BudgetUpdateRequest) -> dict[str, Any]:
    result = update_budget(
        budget_id,
        name=request.name,
        category_ids=request.category_ids,
        amount=request.amount,
        period=request.period,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Budget nicht gefunden")
    return result


@router.delete("/db/budgets/{budget_id}")
def delete_budget_endpoint(budget_id: int) -> dict[str, Any]:
    if not delete_budget(budget_id):
        raise HTTPException(status_code=404, detail="Budget nicht gefunden")
    return {"deleted": True}
