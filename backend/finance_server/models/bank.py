from __future__ import annotations

from pydantic import BaseModel, Field


class BankCredentials(BaseModel):
    bank_key: str = Field(min_length=1)
    account_name: str | None = None
    username: str = Field(min_length=1)
    pin: str = Field(min_length=1)
    accounts: list[dict[str, str | float | None]] | None = None


class AccountBalanceAdjustmentRequest(BaseModel):
    note: str | None = None
