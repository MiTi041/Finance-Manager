from __future__ import annotations

from pydantic import BaseModel


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


class ApplyPredictionRequest(BaseModel):
    transaction_id: int
    category_id: int | None
