from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, File, Path as ApiPath, UploadFile
from fastapi.responses import FileResponse
from fastapi import HTTPException

from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.api._crud import crud_create, crud_delete, crud_update
from finance_server.api.deps import get_reference_data_service
from .common import (
    IMAGE_FORMATS,
    PAYMENT_PARTNER_LOGO_DIR,
    _resolve_assets_logo_path,
    _safe_logo_name,
)

router = APIRouter()


@router.get("/db/reference-data/recipient-accounts/{recipient_account_id}/logo")
def get_recipient_account_logo(
    recipient_account_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> FileResponse:
    record = service.get_recipient_account(recipient_account_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    local_logo = _resolve_assets_logo_path(record.get("local_logo_path"))
    if local_logo is None:
        raise HTTPException(status_code=404, detail="Lokales Logo nicht gefunden")

    return FileResponse(local_logo)


@router.get("/db/reference-data/recipient-accounts")
def get_recipient_accounts_reference_data(
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    recipient_accounts = service.get_recipient_accounts()
    return {
        "count": len(recipient_accounts),
        "recipient_accounts": recipient_accounts,
    }


@router.post("/db/reference-data/recipient-accounts/{recipient_account_id}/logo")
def upload_recipient_account_local_logo(
    recipient_account_id: int = ApiPath(..., ge=1),
    file: UploadFile = File(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    record = service.get_recipient_account(recipient_account_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    content_type = (file.content_type or "").lower()
    if content_type not in IMAGE_FORMATS:
        raise HTTPException(
            status_code=400,
            detail="Nicht unterstütztes Bildformat. Bitte PNG, JPEG, WebP, GIF, AVIF oder BMP verwenden.",
        )

    image_bytes = file.file.read()
    expected_magic, extension = IMAGE_FORMATS[content_type]

    if not image_bytes.startswith(expected_magic):
        raise HTTPException(
            status_code=400,
            detail="Datei konnte nicht als Bild erkannt werden. Bitte eine gültige Bilddatei hochladen.",
        )

    PAYMENT_PARTNER_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"{_safe_logo_name(record.get('account_name') or '')}{extension}"
    target_path = PAYMENT_PARTNER_LOGO_DIR / file_name
    target_path.write_bytes(image_bytes)

    local_logo_path = f"/assets/images/payment-partner-logos/{file_name}"
    updated = service.update_recipient_account(
        recipient_account_id,
        {"local_logo_path": local_logo_path},
    )

    if updated is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    return updated


@router.delete("/db/reference-data/recipient-accounts/{recipient_account_id}/logo")
def delete_recipient_account_local_logo(
    recipient_account_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    record = service.get_recipient_account(recipient_account_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    logo_path = _resolve_assets_logo_path(record.get("local_logo_path"))
    if logo_path is not None and logo_path.exists():
        logo_path.unlink()

    updated = service.update_recipient_account(
        recipient_account_id,
        {"local_logo_path": None},
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    return updated


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