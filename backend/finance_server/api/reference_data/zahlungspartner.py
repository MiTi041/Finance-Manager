from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath, File, UploadFile
from fastapi.responses import FileResponse

from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.api._crud import crud_create, crud_delete, crud_update
from finance_server.api.deps import get_reference_data_service
from .common import (
    IMAGE_FORMATS,
    PAYMENT_PARTNER_LOGO_DIR,
    _resolve_assets_logo_path,
    _resolve_zahlungspartner_logo_file,
    _safe_logo_name,
)

router = APIRouter()


@router.get("/db/reference-data/zahlungspartner/{zahlungspartner_id}/logo")
def get_zahlungspartner_logo(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> FileResponse:
    record = service.get_zahlungspartner(zahlungspartner_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")

    local_logo = _resolve_assets_logo_path(record.get("local_logo_path"))
    if local_logo is None:
        logo_url = (record.get("logo_url") or "").strip()
        local_logo = _resolve_zahlungspartner_logo_file(logo_url)
    if local_logo is None:
        raise HTTPException(status_code=404, detail="Lokales Logo nicht gefunden")

    return FileResponse(local_logo)


@router.get("/db/reference-data/zahlungspartner/{zahlungspartner_id}")
def get_single_zahlungspartner_reference_data(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    record = service.get_zahlungspartner(zahlungspartner_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")
    return record


@router.get("/db/reference-data/zahlungspartner")
def get_zahlungspartner_reference_data(
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    zahlungspartner = service.list_zahlungspartner()
    mappings = service.list_zahlungspartner_mappings()
    return {
        "count": len(zahlungspartner),
        "zahlungspartner": zahlungspartner,
        "iban_mappings": mappings,
    }


@router.post("/db/reference-data/zahlungspartner/{zahlungspartner_id}/logo")
def upload_zahlungspartner_local_logo(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    file: UploadFile = File(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    record = service.get_zahlungspartner(zahlungspartner_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")

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
    file_name = f"{_safe_logo_name(record.get('name') or '')}{extension}"
    target_path = PAYMENT_PARTNER_LOGO_DIR / file_name
    target_path.write_bytes(image_bytes)

    local_logo_path = f"/assets/images/payment-partner-logos/{file_name}"
    updated = service.update_zahlungspartner(
        zahlungspartner_id,
        {"local_logo_path": local_logo_path},
    )

    if updated is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")

    return updated


@router.delete("/db/reference-data/zahlungspartner/{zahlungspartner_id}/logo")
def delete_zahlungspartner_local_logo(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    record = service.get_zahlungspartner(zahlungspartner_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")

    logo_path = _resolve_assets_logo_path(record.get("local_logo_path"))
    if logo_path is not None and logo_path.exists():
        logo_path.unlink()

    updated = service.update_zahlungspartner(zahlungspartner_id, {"local_logo_path": None})
    if updated is None:
        raise HTTPException(status_code=404, detail="Zahlungspartner nicht gefunden")

    return updated


@router.post("/db/reference-data/zahlungspartner")
def create_zahlungspartner(
    payload: dict[str, Any] = Body(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_create(service.create_zahlungspartner, payload)


@router.patch("/db/reference-data/zahlungspartner/{zahlungspartner_id}")
def patch_zahlungspartner(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_update(
        service.update_zahlungspartner,
        zahlungspartner_id,
        payload,
        "Zahlungspartner",
    )


@router.delete("/db/reference-data/zahlungspartner/{zahlungspartner_id}")
def delete_zahlungspartner(
    zahlungspartner_id: int = ApiPath(..., ge=1),
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    return crud_delete(service.delete_zahlungspartner, zahlungspartner_id, "Zahlungspartner")
