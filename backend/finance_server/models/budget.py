from __future__ import annotations

from pydantic import BaseModel


class BudgetCreateRequest(BaseModel):
    name: str
    category_ids: list[int]
    amount: float
    period: str = "monthly"


class BudgetUpdateRequest(BaseModel):
    name: str | None = None
    category_ids: list[int] | None = None
    amount: float | None = None
    period: str | None = None
