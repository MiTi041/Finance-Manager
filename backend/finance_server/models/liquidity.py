from __future__ import annotations

from pydantic import BaseModel


class LiquidityEntryCreateRequest(BaseModel):
    label: str
    amount: float
    kind: str = "expense"
    certainty: str = "certain"


class LiquidityEntryUpdateRequest(BaseModel):
    label: str | None = None
    amount: float | None = None
    kind: str | None = None
    certainty: str | None = None
