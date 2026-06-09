from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
import logging

logger = logging.getLogger(__name__)

from finance_server.models.bank import BankCredentials
from finance_server.services.credentials_service import CredentialsService
from finance_server.services.rate_limiter import enforce_rate_limit
from finance_server.api.deps import get_credentials_service

router = APIRouter()


@router.get("/bank-credentials/status")
def get_bank_credentials_status(
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.get_status()


@router.post("/bank-credentials")
def upsert_bank_credentials(
    credentials: BankCredentials,
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    try:
        return service.create(credentials.model_dump())
    except ValueError as e:
        if "ALREADY_STORED" in str(e):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "BANK_CREDENTIALS_ALREADY_STORED",
                    "message": "Diese Anmeldedaten sind bereits hinterlegt.",
                },
            )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Fehler beim Speichern der Bank-Credentials")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Ein unerwarteter Fehler ist aufgetreten.",
                "error": str(e),
            },
        )


@router.delete("/bank-credentials")
def remove_bank_credentials(
    scope: str | None = Query(default=None),
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.delete(scope)


@router.patch("/bank-credentials/{scope}")
def update_bank_credentials(
    scope: str = Path(...),
    payload: dict[str, Any] = Body(...),
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.update(scope, payload)


@router.patch("/bank-credentials/{scope}/accounts/{iban}")
def update_bank_account(
    scope: str = Path(...),
    iban: str = Path(...),
    payload: dict[str, Any] = Body(...),
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.update_account(scope, iban, payload)


@router.delete("/bank-credentials/{scope}/accounts/{iban}")
def remove_bank_account(
    scope: str = Path(...),
    iban: str = Path(...),
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.delete_account(scope, iban)


@router.post("/bank-credentials/{scope}/accounts/{iban}/balance")
def adjust_bank_account_balance(
    scope: str = Path(...),
    iban: str = Path(...),
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    enforce_rate_limit("fetch_balance", scope)
    result = service.adjust_balance(scope, iban)
    if "error" in result:
        status = 404 if result["error"] == "account_not_found" else 400
        raise HTTPException(status_code=status, detail=result["error"])
    return result


@router.get("/bank-credentials")
def get_bank_credentials(
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.list_all()


@router.get("/bank-credentials/banks")
def get_available_banks(
    service: CredentialsService = Depends(get_credentials_service),
) -> dict[str, Any]:
    return service.list_available_banks()
