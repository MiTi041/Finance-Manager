from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from finance_server.services.transaction_service import TransactionService
from finance_server.services.category_service import CategoryService
from finance_server.api._crud import crud_create, crud_delete, crud_update

_transaction_service = TransactionService()
_category_service = CategoryService()

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
    categories = _category_service.get_categories()
    return {"count": len(categories), "categories": categories}


@router.post("/db/categories")
def create_category(request: CategoryCreateRequest) -> dict[str, Any]:
    return crud_create(_category_service.create_category, request.model_dump())


@router.patch("/db/categories/{category_id}")
def patch_category(category_id: int, request: CategoryUpdateRequest) -> dict[str, Any]:
    return crud_update(
        _category_service.update_category,
        category_id,
        request.model_dump(exclude_unset=True),
        "Kategorie",
    )


@router.delete("/db/categories/{category_id}")
def delete_category(category_id: int) -> dict[str, Any]:
    return crud_delete(_category_service.delete_category, category_id, "Kategorie")


@router.patch("/db/transactions/{transaction_id}/category")
def set_transaction_category(
    transaction_id: int,
    request: TransactionCategoryUpdateRequest,
) -> dict[str, Any]:
    _transaction_service.update_category(transaction_id, request.category_id)
    return {"transaction_id": transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/batch-categorize")
def set_transactions_category_batch(request: BatchCategoryUpdateRequest) -> dict[str, Any]:
    updated = _transaction_service.update_categories_batch(request.transaction_ids, request.category_id)
    return {"updated": updated}


class ApplyPredictionRequest(BaseModel):
    transaction_id: int
    category_id: int | None


@router.post("/db/transactions/auto-categorize")
def get_predictions() -> dict[str, Any]:
    try:
        from finance_server.services.auto_categorize import build_combined_predictions
        predictions = build_combined_predictions()
        return {"count": len(predictions), "predictions": predictions}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err


@router.post("/db/transactions/auto-categorize/apply")
def apply_prediction(request: ApplyPredictionRequest) -> dict[str, Any]:
    from backend.finance_server.services.auto_categorize.auto_categorize import apply_prediction
    apply_prediction(request.transaction_id, request.category_id)
    return {"transaction_id": request.transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/auto-categorize/apply-all")
def apply_all_predictions(requests: list[ApplyPredictionRequest]) -> dict[str, Any]:
    from backend.finance_server.services.auto_categorize.auto_categorize import apply_prediction
    for r in requests:
        apply_prediction(r.transaction_id, r.category_id)
    return {"applied": len(requests)}
