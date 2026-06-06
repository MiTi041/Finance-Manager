from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Path as ApiPath, File, UploadFile
from fastapi.responses import FileResponse

from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.api._crud import crud_create, crud_delete, crud_update
from .common import (
    IMAGE_FORMATS,
    PAYMENT_PARTNER_LOGO_DIR,
    _resolve_assets_logo_path,
    _resolve_kontoinhaber_logo_file,
    _safe_logo_name,
)

_service = ReferenceDataService()

router = APIRouter()


@router.get("/db/reference-data/kontoinhaber/{kontoinhaber_id}/logo")
def get_kontoinhaber_logo(kontoinhaber_id: int = ApiPath(..., ge=1)) -> FileResponse:
    record = _service.get_kontoinhaber(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    logo_url = (record.get("logo_url") or "").strip()
    local_logo = _resolve_kontoinhaber_logo_file(logo_url)
    if local_logo is None:
        raise HTTPException(status_code=404, detail="Lokales Logo nicht gefunden")

    return FileResponse(local_logo)


@router.get("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def get_single_kontoinhaber_reference_data(kontoinhaber_id: int = ApiPath(..., ge=1)) -> dict[str, Any]:
    record = _service.get_kontoinhaber(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")
    return record


@router.get("/db/reference-data/kontoinhaber")
def get_kontoinhaber_reference_data() -> dict[str, Any]:
    kontoinhaber = _service.list_kontoinhaber()
    mappings = _service.list_kontoinhaber_mappings()
    return {
        "count": len(kontoinhaber),
        "kontoinhaber": kontoinhaber,
        "iban_mappings": mappings,
    }


@router.post("/db/reference-data/kontoinhaber/{kontoinhaber_id}/logo")
def upload_kontoinhaber_local_logo(
    kontoinhaber_id: int = ApiPath(..., ge=1),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    record = _service.get_kontoinhaber(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

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
    updated = _service.update_kontoinhaber(
        kontoinhaber_id,
        {"local_logo_path": local_logo_path},
    )

    if updated is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    return updated


@router.delete("/db/reference-data/kontoinhaber/{kontoinhaber_id}/logo")
def delete_kontoinhaber_local_logo(
    kontoinhaber_id: int = ApiPath(..., ge=1),
) -> dict[str, Any]:
    record = _service.get_kontoinhaber(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    logo_path = _resolve_assets_logo_path(record.get("local_logo_path"))
    if logo_path is not None and logo_path.exists():
        logo_path.unlink()

    updated = _service.update_kontoinhaber(kontoinhaber_id, {"local_logo_path": None})
    if updated is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    return updated


@router.post("/db/reference-data/kontoinhaber")
def create_kontoinhaber(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return crud_create(_service.create_kontoinhaber, payload)


@router.patch("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def patch_kontoinhaber(
    kontoinhaber_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    return crud_update(
        _service.update_kontoinhaber,
        kontoinhaber_id,
        payload,
        "Kontoinhaber",
    )


@router.delete("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def delete_kontoinhaber(
    kontoinhaber_id: int = ApiPath(..., ge=1),
) -> dict[str, Any]:
    return crud_delete(_service.delete_kontoinhaber, kontoinhaber_id, "Kontoinhaber")
