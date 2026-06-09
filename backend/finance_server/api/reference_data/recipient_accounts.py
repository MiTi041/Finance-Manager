from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Path as ApiPath

from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.api._crud import crud_create, crud_delete, crud_update
from finance_server.api.deps import get_reference_data_service

router = APIRouter()


@router.get("/db/reference-data/recipient-accounts")
def get_recipient_accounts_reference_data(
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    recipient_accounts = service.get_recipient_accounts()
    return {
        "count": len(recipient_accounts),
        "recipient_accounts": recipient_accounts,
    }


@router.post("/db/reference-data/recipient-accounts")
def create_recipient_account(
    payload: dict[str, Any] = Body(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_create(service.create_recipient_account, payload)


@router.patch("/db/reference-data/recipient-accounts/{recipient_account_id}")
def patch_recipient_account(
    recipient_account_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_update(
        service.update_recipient_account,
        recipient_account_id,
        payload,
        "Empfängerkonto",
    )


@router.delete("/db/reference-data/recipient-accounts/{recipient_account_id}")
def delete_recipient_account(
    recipient_account_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_delete(service.delete_recipient_account, recipient_account_id, "Empfängerkonto")
