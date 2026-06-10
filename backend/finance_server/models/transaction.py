from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TransactionImportRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class TransactionNoteUpdateRequest(BaseModel):
    note: str | None = None


class TransactionSplitUpdateRequest(BaseModel):
    splits: list[dict[str, Any]] | None = None


class BatchIdsRequest(BaseModel):
    transaction_ids: list[int]
