from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from finance_server.db import (
    create_category_record,
    delete_category_record,
    list_categories,
    update_category_record,
    update_transaction_category,
    update_transactions_category_batch,
)

router = APIRouter()


class TransactionCategoryUpdateRequest(BaseModel):
    category_id: int | None = None


class BatchCategoryUpdateRequest(BaseModel):
    transaction_ids: list[int]
    category_id: int | None = None


class CategoryCreateRequest(BaseModel):
    name: str
    typ: str
    parent_id: int | None = None
    personal_expense: bool = False
    icon: str | None = None


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    typ: str | None = None
    parent_id: int | None = None
    personal_expense: bool | None = None
    icon: str | None = None


@router.get("/db/categories")
def get_categories() -> dict[str, Any]:
    categories = list_categories()
    return {"count": len(categories), "categories": categories}


@router.post("/db/categories")
def create_category(request: CategoryCreateRequest) -> dict[str, Any]:
    try:
        return create_category_record(request.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.patch("/db/categories/{category_id}")
def patch_category(category_id: int, request: CategoryUpdateRequest) -> dict[str, Any]:
    try:
        updated = update_category_record(category_id, request.model_dump(exclude_unset=True))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if updated is None:
        raise HTTPException(status_code=404, detail="Kategorie nicht gefunden")

    return updated


@router.delete("/db/categories/{category_id}")
def delete_category(category_id: int) -> dict[str, Any]:
    deleted = delete_category_record(category_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Kategorie nicht gefunden")

    return {"deleted": True}


@router.patch("/db/transactions/{transaction_id}/category")
def set_transaction_category(
    transaction_id: int,
    request: TransactionCategoryUpdateRequest,
) -> dict[str, Any]:
    update_transaction_category(transaction_id, request.category_id)
    return {"transaction_id": transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/batch-categorize")
def set_transactions_category_batch(request: BatchCategoryUpdateRequest) -> dict[str, Any]:
    updated = update_transactions_category_batch(request.transaction_ids, request.category_id)
    return {"updated": updated}


class ApplyPredictionRequest(BaseModel):
    transaction_id: int
    category_id: int | None


@router.post("/db/transactions/auto-categorize")
def get_predictions() -> dict[str, Any]:
    try:
        from finance_server.services.auto_categorize import build_predictions
        predictions = build_predictions()
        return {"count": len(predictions), "predictions": predictions}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err


@router.post("/db/transactions/auto-categorize/apply")
def apply_prediction(request: ApplyPredictionRequest) -> dict[str, Any]:
    from finance_server.services.auto_categorize import apply_prediction
    apply_prediction(request.transaction_id, request.category_id)
    return {"transaction_id": request.transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/auto-categorize/apply-all")
def apply_all_predictions(requests: list[ApplyPredictionRequest]) -> dict[str, Any]:
    from finance_server.services.auto_categorize import apply_prediction
    for r in requests:
        apply_prediction(r.transaction_id, r.category_id)
    return {"applied": len(requests)}