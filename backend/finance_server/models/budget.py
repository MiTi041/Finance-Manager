from __future__ import annotations

from pydantic import BaseModel


class BudgetCreateRequest(BaseModel):
    name: str
    category_ids: list[int]
    monthly_amount: float


class BudgetUpdateRequest(BaseModel):
    name: str | None = None
    category_ids: list[int] | None = None
    monthly_amount: float | None = None
