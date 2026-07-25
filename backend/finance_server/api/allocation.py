from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath

from finance_server.fints.common import TanRequired, TanTimeout
from finance_server.fints.transfer import send_transfer
from finance_server.models.allocation import (
    AllocationBucketUpdate,
    BafoegConfig,
    AllocationSettingsUpdate,
)
from finance_server.models.fints import TransferRequest
from finance_server.services.allocation_service import AllocationService
from finance_server.api.deps import get_allocation_service

router = APIRouter()


@router.get("/allocation/status")
def get_allocation_status(
    month: str | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    target_month = month or datetime.now().strftime("%Y-%m")
    return service.get_or_create_run(target_month)


@router.get("/allocation/buckets")
def get_allocation_buckets(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    buckets = service.get_buckets()
    return {"buckets": buckets}


@router.put("/allocation/buckets/{bucket_id}")
def update_allocation_bucket(
    bucket_id: int = ApiPath(..., ge=1),
    payload: AllocationBucketUpdate = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    updated = service.update_bucket(bucket_id, payload.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Bucket nicht gefunden")
    return updated


@router.get("/allocation/bafoeg-config")
def get_bafoeg_config(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    config = service.get_bafoeg_config()
    if not config:
        return BafoegConfig().model_dump()
    return config


@router.put("/allocation/bafoeg-config")
def update_bafoeg_config(
    payload: BafoegConfig = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.update_bafoeg_config(payload.model_dump(exclude_none=True))


@router.get("/allocation/settings")
def get_allocation_settings(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.get_settings()


@router.patch("/allocation/settings")
def update_allocation_settings(
    payload: AllocationSettingsUpdate = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.update_settings(payload.model_dump())


@router.post("/allocation/run")
def calculate_run(
    month: str | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    from datetime import datetime
    target_month = month or datetime.now().strftime("%Y-%m")
    return service.get_or_create_run(target_month)


@router.post("/allocation/transfer/{run_bucket_id}")
def execute_transfer(
    run_bucket_id: int = ApiPath(..., ge=1),
    body: dict[str, Any] | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    tan = (body or {}).get("tan")
    transfer_data = service.transfer_run_bucket(run_bucket_id)

    req = TransferRequest(
        recipient_iban=transfer_data["recipient_iban"],
        recipient_name=transfer_data["recipient_name"],
        amount=transfer_data["amount"],
        reason=transfer_data["purpose"],
        recipient_bic=transfer_data.get("recipient_bic"),
        sender_iban=transfer_data.get("sender_iban") or "",
        sender_name="Finance-Manager",
        tan=tan,
    )
    try:
        result = send_transfer(req)
    except Exception as e:
        if isinstance(e, TanRequired):
            raise HTTPException(
                status_code=409,
                detail={"code": "TAN_REQUIRED", "challenge": e.challenge, "decoupled": e.decoupled},
            )
        if isinstance(e, TanTimeout):
            raise HTTPException(status_code=408, detail=str(e))
        raise HTTPException(status_code=502, detail=f"Überweisung fehlgeschlagen: {e}")

    service.mark_transferred(run_bucket_id, transfer_data["amount"])
    return {"status": "ok", "transfer": result}


@router.get("/allocation/history")
def get_allocation_history(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    history = service.get_history()
    return {"history": history}
