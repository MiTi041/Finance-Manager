from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TransactionNoteUpdateRequest(BaseModel):
    note: str | None = None


class TransactionPurposeUpdateRequest(BaseModel):
    purpose_edit: str | None = None


class TransactionSplitUpdateRequest(BaseModel):
    splits: list[dict[str, Any]] | None = None


class BatchIdsRequest(BaseModel):
    transaction_ids: list[int]


class RefundLinkCreateRequest(BaseModel):
    expense_transaction_id: int
    amount: float


class ManualTransactionCreateRequest(BaseModel):
    account_iban: str = Field(min_length=1)
    date: str = Field(min_length=1)
    amount: float
    recipient_name: str | None = None
    recipient_iban: str | None = None
    purpose: str | None = None
    category: int | None = None
    note: str | None = None
