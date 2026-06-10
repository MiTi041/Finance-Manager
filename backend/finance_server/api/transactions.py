from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from finance_server.models.transaction import TransactionImportRequest, TransactionNoteUpdateRequest, TransactionSplitUpdateRequest, BatchIdsRequest
from finance_server.services.transaction_service import TransactionService
from finance_server.api._crud import crud_delete
from finance_server.api.deps import get_transaction_service

router = APIRouter()


@router.get("/db/transactions")
def get_transactions(
    days: int = Query(default=36500, ge=1),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    iban: str | None = None,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    rows = service.get_transactions(
        days=days,
        iban=iban,
        from_date=from_date,
        to_date=to_date,
    )
    return {
        "count": len(rows),
        "transactions": rows,
    }


@router.get("/db/transactions/latest")
def get_latest_transaction(
    iban: str | None = None,
    blz: str | None = None,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    transaction = service.get_latest_transaction(iban=iban, blz=blz)
    return {"transaction": transaction}


@router.post("/db/transactions/import")
def import_transactions(
    request: TransactionImportRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    try:
        return service.import_transactions(request.rows)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/db/transactions/batch-delete")
def remove_transactions_batch(
    request: BatchIdsRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    try:
        deleted = service.delete_transactions_batch(request.transaction_ids)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"deleted": deleted}


@router.delete("/db/transactions/{transaction_id}")
def remove_transaction(
    transaction_id: int,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    return crud_delete(service.delete_transaction, transaction_id, "Transaktion")


@router.patch("/db/transactions/{transaction_id}/note")
def set_transaction_note(
    transaction_id: int,
    request: TransactionNoteUpdateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    updated = service.update_note(transaction_id, request.note)
    if not updated:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")

    return {"transaction_id": transaction_id, "note": request.note}


@router.patch("/db/transactions/{transaction_id}/splits")
def set_transaction_splits(
    transaction_id: int,
    request: TransactionSplitUpdateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    updated = service.update_splits(transaction_id, request.splits)
    if not updated:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")

    return {"transaction_id": transaction_id, "splits": request.splits}
