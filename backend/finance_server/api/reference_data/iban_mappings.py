from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath, Request

from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.api.deps import get_reference_data_service

router = APIRouter()


@router.get("/db/reference-data/ibans")
def get_iban_reference_data(
    request: Request,
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    references = service.get_iban_references()
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
    service: ReferenceDataService = Depends(get_reference_data_service),
) -> dict[str, Any]:
    zahlungspartner_id = payload.get("zahlungspartner_id")
    if not isinstance(zahlungspartner_id, int) or zahlungspartner_id < 1:
        raise HTTPException(status_code=400, detail="Zahlungspartner fehlt oder ist ungültig")

    updated = service.update_iban_mapping(iban, zahlungspartner_id)
    if not updated:
        raise HTTPException(status_code=404, detail="IBAN-Mapping nicht gefunden")

    record = service.get_zahlungspartner(zahlungspartner_id)
    return {
        "updated": True,
        "zahlungspartner": record,
    }
