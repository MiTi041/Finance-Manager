from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Path, Query
from pydantic import BaseModel, Field

from finance_server.banks import list_bank_definitions, get_bank_definition
from finance_server.api.fints import fetch_account_balance
from finance_server.db import (
    delete_bank_credentials,
    delete_bank_account as delete_bank_account_row,
    insert_balance_adjustment,
    list_bank_credentials,
    list_bank_accounts,
    load_bank_credentials,
    update_bank_account as update_bank_account_row,
    upsert_bank_accounts,
    save_bank_credentials,
)
from finance_server.models import BankCredentials
from finance_server.db.utils import normalize_text

router = APIRouter()


class AccountBalanceAdjustmentRequest(BaseModel):
    note: str | None = None


def _public_status(credentials: dict[str, Any] | None) -> dict[str, Any]:
    if not credentials:
        return {"configured": False}

    bank_key = credentials.get("bank_key", "")
    bank = None
    if bank_key:
        try:
            bank = get_bank_definition(bank_key)
        except KeyError:
            bank = None

    return {
        "configured": True,
        "account_name": credentials.get("account_name", ""),
        "bank_key": bank.key if bank else bank_key,
        "bank_name": bank.name if bank else bank_key,
        "blz": bank.blz if bank else "",
        "bank_logo": bank.bank_logo if bank else "",
        "username": credentials.get("username", ""),
        "fints_url": bank.fints_url if bank else "",
        "scope": credentials.get("scope", ""),
        "account_iban": credentials.get("account_iban", ""),
        "accounts": credentials.get("accounts", []),
    }


@router.get("/bank-credentials/status")
def get_bank_credentials_status() -> dict[str, Any]:
    return _public_status(load_bank_credentials())


@router.post("/bank-credentials")
def upsert_bank_credentials(credentials: BankCredentials) -> dict[str, Any]:
    normalized_bank_key = normalize_text(credentials.bank_key).lower()
    normalized_username = normalize_text(credentials.username).lower()

    for existing in list_bank_credentials():
        if (
            normalize_text(existing.get("bank_key")).lower() == normalized_bank_key
            and normalize_text(existing.get("username")).lower() == normalized_username
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "BANK_CREDENTIALS_ALREADY_STORED",
                    "message": "Diese Anmeldedaten sind bereits hinterlegt.",
                },
            )

    scope = save_bank_credentials(credentials.model_dump())
    return _public_status(load_bank_credentials(scope))


@router.delete("/bank-credentials")
def remove_bank_credentials(scope: str | None = Query(default=None)) -> dict[str, Any]:
    delete_bank_credentials(scope)
    return {"configured": False}


@router.patch("/bank-credentials/{scope}")
def update_bank_credentials(
    scope: str = Path(...),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    credentials = load_bank_credentials(scope)
    if not credentials:
        return {"error": "credentials_not_found"}

    for key in ("account_name", "account_iban", "username", "bank_key"):
                if key in payload:
                        credentials[key] = payload[key]

    if "accounts" in payload:
        upsert_bank_accounts(scope, payload["accounts"])
        credentials["accounts"] = list_bank_accounts(scope)

    save_bank_credentials(credentials, scope=scope)
    return _public_status(load_bank_credentials(scope))


@router.patch("/bank-credentials/{scope}/accounts/{iban}")
def update_bank_account(
    scope: str = Path(...),
    iban: str = Path(...),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    credentials = load_bank_credentials(scope)
    if not credentials:
        return {"error": "credentials_not_found"}

    updated = update_bank_account_row(
        scope,
        iban,
        account_name=payload.get("account_name"),
        account_iban=payload.get("account_iban"),
    )
    if not updated:
        return {"error": "account_not_found"}

    return _public_status(load_bank_credentials(scope))


@router.delete("/bank-credentials/{scope}/accounts/{iban}")
def remove_bank_account(
    scope: str = Path(...),
    iban: str = Path(...),
) -> dict[str, Any]:
    credentials = load_bank_credentials(scope)
    if not credentials:
        return {"error": "credentials_not_found"}

    deleted = delete_bank_account_row(scope, iban)
    return {"deleted": deleted}


@router.post("/bank-credentials/{scope}/accounts/{iban}/balance")
def adjust_bank_account_balance(
    scope: str = Path(...),
    iban: str = Path(...),
    payload: AccountBalanceAdjustmentRequest | None = Body(default=None),
) -> dict[str, Any]:
    credentials = load_bank_credentials(scope)
    if not credentials:
        return {"error": "credentials_not_found"}

    account = next(
        (
            item
            for item in list_bank_accounts(scope)
            if normalize_text(item.get("iban")).lower() == normalize_text(iban).lower()
        ),
        None,
    )
    if account is None:
        return {"error": "account_not_found"}

    balance = fetch_account_balance(BankCredentials.model_validate(credentials), iban)

    return insert_balance_adjustment(
        account_iban=iban,
        target_balance=balance["amount"],
        note=(payload.note if payload else None) or "Saldoabgleich per FinTS",
    )


@router.get("/bank-credentials")
def get_bank_credentials() -> dict[str, Any]:
    credentials = list_bank_credentials()
    return {
        "count": len(credentials),
        "credentials": [_public_status(item) for item in credentials],
    }


@router.get("/bank-credentials/banks")
def get_available_banks() -> dict[str, Any]:
    return {
        "banks": [
            {
                "key": bank.key,
                "name": bank.name,
                "blz": bank.blz,
                "fints_url": bank.fints_url,
                "bank_logo": bank.bank_logo,
            }
            for bank in list_bank_definitions()
        ]
    }
