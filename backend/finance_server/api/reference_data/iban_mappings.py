from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Path as ApiPath, Request

from finance_server.services.reference_data_service import ReferenceDataService

_service = ReferenceDataService()

router = APIRouter()


@router.get("/db/reference-data/ibans")
def get_iban_reference_data(request: Request) -> dict[str, Any]:
    references = _service.get_iban_references()
    base_url = str(request.base_url).rstrip("/")

    for reference in references:
        resolved_logo_url = reference.get("resolved_logo_url")
        if isinstance(resolved_logo_url, str) and resolved_logo_url.startswith("/"):
            reference["resolved_logo_url"] = f"{base_url}{resolved_logo_url}"

    return {
        "count": len(references),
        "references": references,
    }


@router.patch("/db/reference-data/ibans/{iban}")
def patch_iban_mapping(
    iban: str = ApiPath(...),
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    kontoinhaber_id = payload.get("kontoinhaber_id")
    if not isinstance(kontoinhaber_id, int) or kontoinhaber_id < 1:
        raise HTTPException(status_code=400, detail="Kontoinhaber fehlt oder ist ungültig")

    updated = _service.update_iban_mapping(iban, kontoinhaber_id)
    if not updated:
        raise HTTPException(status_code=404, detail="IBAN-Mapping nicht gefunden")

    record = _service.get_kontoinhaber(kontoinhaber_id)
    return {
        "updated": True,
        "kontoinhaber": record,
    }
