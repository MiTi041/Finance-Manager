from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from finance_server.db import (
    delete_transaction,
    delete_transactions_batch,
    fetch_latest_transaction,
    fetch_transactions,
    insert_transactions,
    update_transaction_note,
)

router = APIRouter()


class TransactionImportRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class TransactionNoteUpdateRequest(BaseModel):
    note: str | None = None


class BatchIdsRequest(BaseModel):
    transaction_ids: list[int]


@router.get("/db/transactions")
def get_transactions(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
) -> dict[str, Any]:
    rows = fetch_transactions(
        days=days,
        account_iban=iban,
        from_date=from_date,
        to_date=to_date,
    )
    return {
        "count": len(rows),
        "transactions": rows,
    }


@router.get("/db/transactions/latest")
def get_latest_transaction(iban: str | None = None, blz: str | None = None) -> dict[str, Any]:
    transaction = fetch_latest_transaction(iban=iban, account_blz=blz)
    return {"transaction": transaction}


@router.post("/db/transactions/import")
def import_transactions(request: TransactionImportRequest) -> dict[str, Any]:
    return insert_transactions(request.rows)


@router.post("/db/transactions/batch-delete")
def remove_transactions_batch(request: BatchIdsRequest) -> dict[str, Any]:
    deleted = delete_transactions_batch(request.transaction_ids)
    return {"deleted": deleted}


@router.delete("/db/transactions/{transaction_id}")
def remove_transaction(transaction_id: int) -> dict[str, Any]:
    deleted = delete_transaction(transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")

    return {"deleted": True}


@router.patch("/db/transactions/{transaction_id}/note")
def set_transaction_note(
    transaction_id: int,
    request: TransactionNoteUpdateRequest,
) -> dict[str, Any]:
    updated = update_transaction_note(transaction_id, request.note)
    if not updated:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")

    return {"transaction_id": transaction_id, "note": request.note}
