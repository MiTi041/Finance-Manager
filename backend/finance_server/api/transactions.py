from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from finance_server.models.transaction import BatchIdsRequest, ManualTransactionCreateRequest, RefundLinkCreateRequest, TransactionNoteUpdateRequest, TransactionPurposeUpdateRequest, TransactionSplitUpdateRequest
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
    pending = service.get_pending_transactions(iban=iban)
    return {
        "count": len(rows),
        "transactions": rows,
        "pending_count": len(pending),
        "pending": pending,
    }


@router.get("/db/transactions/latest")
def get_latest_transaction(
    iban: str | None = None,
    blz: str | None = None,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    transaction = service.get_latest_transaction(iban=iban, blz=blz)
    return {"transaction": transaction}


@router.post("/db/transactions")
def create_manual_transaction(
    request: ManualTransactionCreateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    try:
        return service.create_manual_transaction(
            account_iban=request.account_iban,
            date=request.date,
            amount=request.amount,
            recipient_name=request.recipient_name,
            recipient_iban=request.recipient_iban,
            purpose=request.purpose,
            category=request.category,
            note=request.note,
        )
    except ValueError as err:
        if str(err) == "MANUAL_ACCOUNT_REQUIRED":
            raise HTTPException(
                status_code=400,
                detail="Transaktionen können nur für manuelle Konten angelegt werden.",
            ) from err
        if str(err) == "INVALID_AMOUNT":
            raise HTTPException(status_code=400, detail="Der Betrag darf nicht 0 sein.") from err
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


@router.patch("/db/transactions/{transaction_id}/purpose")
def set_transaction_purpose(
    transaction_id: int,
    request: TransactionPurposeUpdateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    updated = service.update_purpose(transaction_id, request.purpose_edit)
    if not updated:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")

    return {"transaction_id": transaction_id, "purpose_edit": request.purpose_edit}


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


@router.post("/db/transactions/{transaction_id}/refund-links")
def create_refund_link(
    transaction_id: int,
    request: RefundLinkCreateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    try:
        link = service.add_refund_link(transaction_id, request.expense_transaction_id, request.amount)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if link is None:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")
    return {"link": link}


@router.delete("/db/transactions/{transaction_id}/refund-links/{link_id}")
def remove_refund_link(
    transaction_id: int,
    link_id: int,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    deleted = service.delete_refund_link(link_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rückerstattung nicht gefunden")
    return {"deleted": link_id}
