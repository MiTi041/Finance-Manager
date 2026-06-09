from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from finance_server.models.category import (
    CategoryCreateRequest,
    CategoryUpdateRequest,
    TransactionCategoryUpdateRequest,
    BatchCategoryUpdateRequest,
    ApplyPredictionRequest,
)
from finance_server.services.transaction_service import TransactionService
from finance_server.services.category_service import CategoryService
from finance_server.api._crud import crud_create, crud_delete, crud_update
from finance_server.api.deps import get_transaction_service, get_category_service

router = APIRouter()


@router.get("/db/categories")
def get_categories(
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    categories = service.get_categories()
    return {"count": len(categories), "categories": categories}


@router.post("/db/categories")
def create_category(
    request: CategoryCreateRequest,
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    return crud_create(service.create_category, request.model_dump())


@router.patch("/db/categories/{category_id}")
def patch_category(
    category_id: int,
    request: CategoryUpdateRequest,
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    return crud_update(
        service.update_category,
        category_id,
        request.model_dump(exclude_unset=True),
        "Kategorie",
    )


@router.delete("/db/categories/{category_id}")
def delete_category(
    category_id: int,
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    return crud_delete(service.delete_category, category_id, "Kategorie")


@router.patch("/db/transactions/{transaction_id}/category")
def set_transaction_category(
    transaction_id: int,
    request: TransactionCategoryUpdateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    service.update_category(transaction_id, request.category_id)
    return {"transaction_id": transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/batch-categorize")
def set_transactions_category_batch(
    request: BatchCategoryUpdateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    updated = service.update_categories_batch(request.transaction_ids, request.category_id)
    return {"updated": updated}


@router.post("/db/transactions/auto-categorize")
def get_predictions(
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    predictions = service.get_predictions()
    return {"count": len(predictions), "predictions": predictions}


@router.post("/db/transactions/auto-categorize/apply")
def apply_prediction(
    request: ApplyPredictionRequest,
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    service.apply_prediction(request.transaction_id, request.category_id)
    return {"transaction_id": request.transaction_id, "category_id": request.category_id}


@router.post("/db/transactions/auto-categorize/apply-all")
def apply_all_predictions(
    requests: list[ApplyPredictionRequest],
    service: CategoryService = Depends(get_category_service),
) -> dict[str, Any]:
    for r in requests:
        service.apply_prediction(r.transaction_id, r.category_id)
    return {"applied": len(requests)}
