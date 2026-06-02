from __future__ import annotations

import re
from typing import Any
from pathlib import Path as FilePath
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Body, HTTPException, Path as ApiPath, Request, File, UploadFile
from fastapi.responses import FileResponse

from finance_server.db import (
    create_empfaengerkonto_record,
    create_kontoinhaber_record,
    delete_empfaengerkonto_record,
    delete_kontoinhaber_record,
    list_empfaengerkonten_records,
    get_kontoinhaber_record,
    list_iban_kontoinhaber_references,
    list_kontoinhaber_iban_mappings,
    list_kontoinhaber_records,
    update_empfaengerkonto_record,
    update_kontoinhaber_iban_mapping,
    update_kontoinhaber_record,
)

router = APIRouter()

PAYMENT_PARTNER_LOGO_DIR = (
    FilePath(__file__).resolve().parents[1]
    / "assets"
    / "images"
    / "payment-partner-logos"
)


def _safe_logo_name(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized or "kontoinhaber"


def _resolve_assets_logo_path(logo_path: str | None) -> FilePath | None:
    candidate = (logo_path or "").strip()
    if not candidate.startswith("/assets/images/payment-partner-logos/"):
        return None

    file_name = FilePath(candidate).name
    if not file_name:
        return None

    path = (PAYMENT_PARTNER_LOGO_DIR / file_name).resolve()
    if PAYMENT_PARTNER_LOGO_DIR.resolve() not in path.parents:
        return None

    return path


def _resolve_kontoinhaber_logo_file(logo_url: str) -> FilePath | None:
    candidate = (logo_url or "").strip()
    if not candidate:
        return None

    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https", "data"}:
        return None

    if parsed.scheme == "file":
        path = FilePath(unquote(parsed.path or ""))
    else:
        path = FilePath(candidate).expanduser()

    if not path.is_absolute():
        path = (FilePath.cwd() / path).resolve()

    if not path.exists() or not path.is_file():
        return None

    return path


@router.get("/db/reference-data/ibans")
def get_iban_reference_data(request: Request) -> dict[str, Any]:
    references = list_iban_kontoinhaber_references()
    base_url = str(request.base_url).rstrip("/")

    for reference in references:
        resolved_logo_url = reference.get("resolved_logo_url")
        if isinstance(resolved_logo_url, str) and resolved_logo_url.startswith("/"):
            reference["resolved_logo_url"] = f"{base_url}{resolved_logo_url}"

    return {
        "count": len(references),
        "references": references,
    }


@router.get("/db/reference-data/kontoinhaber/{kontoinhaber_id}/logo")
def get_kontoinhaber_logo(kontoinhaber_id: int = ApiPath(..., ge=1)) -> FileResponse:
    record = get_kontoinhaber_record(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    logo_url = (record.get("logo_url") or "").strip()
    local_logo = _resolve_kontoinhaber_logo_file(logo_url)
    if local_logo is None:
        raise HTTPException(status_code=404, detail="Lokales Logo nicht gefunden")

    return FileResponse(local_logo)


@router.get("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def get_single_kontoinhaber_reference_data(kontoinhaber_id: int = ApiPath(..., ge=1)) -> dict[str, Any]:
    record = get_kontoinhaber_record(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")
    return record


@router.get("/db/reference-data/kontoinhaber")
def get_kontoinhaber_reference_data() -> dict[str, Any]:
    kontoinhaber = list_kontoinhaber_records()
    mappings = list_kontoinhaber_iban_mappings()
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
    record = get_kontoinhaber_record(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    if file.content_type != "image/png":
        raise HTTPException(status_code=400, detail="Bitte eine PNG-Datei hochladen")

    image_bytes = file.file.read()

    if not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Bitte eine PNG-Datei hochladen")

    PAYMENT_PARTNER_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"{_safe_logo_name(record.get('name') or '')}.png"
    target_path = PAYMENT_PARTNER_LOGO_DIR / file_name
    target_path.write_bytes(image_bytes)

    local_logo_path = f"/assets/images/payment-partner-logos/{file_name}"
    updated = update_kontoinhaber_record(
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
    record = get_kontoinhaber_record(kontoinhaber_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    logo_path = _resolve_assets_logo_path(record.get("local_logo_path"))
    if logo_path is not None and logo_path.exists():
        logo_path.unlink()

    updated = update_kontoinhaber_record(kontoinhaber_id, {"local_logo_path": None})
    if updated is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    return updated


@router.get("/db/reference-data/recipient-accounts")
def get_recipient_accounts_reference_data() -> dict[str, Any]:
    recipient_accounts = list_empfaengerkonten_records()
    return {
        "count": len(recipient_accounts),
        "recipient_accounts": recipient_accounts,
    }


@router.post("/db/reference-data/recipient-accounts")
def create_recipient_account(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return create_empfaengerkonto_record(payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.patch("/db/reference-data/recipient-accounts/{recipient_account_id}")
def patch_recipient_account(
    recipient_account_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    try:
        updated = update_empfaengerkonto_record(recipient_account_id, payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if updated is None:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    return updated


@router.delete("/db/reference-data/recipient-accounts/{recipient_account_id}")
def delete_recipient_account(
    recipient_account_id: int = ApiPath(..., ge=1),
) -> dict[str, Any]:
    deleted = delete_empfaengerkonto_record(recipient_account_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Empfängerkonto nicht gefunden")

    return {"deleted": True}


@router.post("/db/reference-data/kontoinhaber")
def create_kontoinhaber(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return create_kontoinhaber_record(payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.patch("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def patch_kontoinhaber(
    kontoinhaber_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    try:
        updated = update_kontoinhaber_record(kontoinhaber_id, payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if updated is None:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    return updated


@router.delete("/db/reference-data/kontoinhaber/{kontoinhaber_id}")
def delete_kontoinhaber(
    kontoinhaber_id: int = ApiPath(..., ge=1),
) -> dict[str, Any]:
    deleted = delete_kontoinhaber_record(kontoinhaber_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Kontoinhaber nicht gefunden")

    return {"deleted": True}


@router.patch("/db/reference-data/ibans/{iban}")
def patch_iban_mapping(
    iban: str = ApiPath(...),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    kontoinhaber_id = payload.get("kontoinhaber_id")
    if not isinstance(kontoinhaber_id, int) or kontoinhaber_id < 1:
        raise HTTPException(status_code=400, detail="Kontoinhaber fehlt oder ist ungültig")

    updated = update_kontoinhaber_iban_mapping(iban, kontoinhaber_id)
    if not updated:
        raise HTTPException(status_code=404, detail="IBAN-Mapping nicht gefunden")

    record = get_kontoinhaber_record(kontoinhaber_id)
    return {
        "updated": True,
        "kontoinhaber": record,
    }
