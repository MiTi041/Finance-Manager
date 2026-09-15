from __future__ import annotations

from pydantic import BaseModel, Field


class BankCredentials(BaseModel):
    bank_key: str = Field(min_length=1)
    account_name: str | None = None
    username: str = ""
    pin: str = ""
    tan_medium: str | None = None
    auto_sync: bool = True
    accounts: list[dict[str, str | float | None]] | None = None


class AccountBalanceAdjustmentRequest(BaseModel):
    note: str | None = None
