from __future__ import annotations

from pydantic import BaseModel


class BudgetCreateRequest(BaseModel):
    category_id: int
    monthly_amount: float


class BudgetUpdateRequest(BaseModel):
    monthly_amount: float
