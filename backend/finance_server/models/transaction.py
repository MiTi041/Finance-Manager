from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class TransactionNoteUpdateRequest(BaseModel):
    note: str | None = None


class TransactionSplitUpdateRequest(BaseModel):
    splits: list[dict[str, Any]] | None = None


class BatchIdsRequest(BaseModel):
    transaction_ids: list[int]


class TransactionRefundLinkUpdateRequest(BaseModel):
    refund_ref_transaction_id: int | None
