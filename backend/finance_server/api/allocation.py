from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath

from finance_server.fints.common import TanRequired, TanTimeout
from finance_server.fints.transfer import FinTSClientError, send_transfer
from finance_server.models.allocation import (
    AllocationBucketUpdate,
    BafoegConfig,
    BafoegRateRequest,
    AllocationSettingsUpdate,
    SavingsPlanCreate,
    SavingsPlanUpdate,
)
from finance_server.models.fints import TransferRequest
from finance_server.services.allocation_service import AllocationService
from finance_server.services.zins_service import aktuellen_taeglichen_zins, berechne_endguthaben, berechne_monatsrate
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
    dump = payload.model_dump(exclude_unset=True)
    remove_none = {k for k, v in dump.items() if v is None}
    for k in remove_none:
        del dump[k]
    updated = service.update_bucket(bucket_id, dump, set_null=list(remove_none))
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


@router.post("/allocation/bafoeg/berechne-rate")
def berechne_bafoeg_rate(
    payload: BafoegRateRequest = Body(...),
) -> dict[str, Any]:
    from datetime import date, datetime

    today = date.today()
    payout = datetime.strptime(payload.payout_date, "%Y-%m-%d").date()

    zinsverlauf = [
        {"datum": date(2025, 7, 6), "zinssatz": 0.02},
        {"datum": date(2026, 4, 29), "zinssatz": 0.02},
        {"datum": date(2027, 1, 1), "zinssatz": 0.025},
    ]
    zinsverlauf.append({"datum": today, "zinssatz": payload.interest_rate / 100})

    erforderliche_rate = berechne_monatsrate(
        payload.current_balance, payload.total_debt, zinsverlauf, today, payout
    )
    endguthaben = berechne_endguthaben(
        payload.current_balance, erforderliche_rate, zinsverlauf, today, payout, payload.offene_zinsen
    )[0]
    zinsgewinn = endguthaben - (payload.current_balance + erforderliche_rate * max(1, (payout.year - today.year) * 12 + payout.month - today.month))

    return {
        "required_monthly_rate": round(erforderliche_rate, 2),
        "projected_end_balance": round(endguthaben, 2),
        "interest_earned": round(zinsgewinn, 2),
    }


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
    force: bool = False,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    from datetime import datetime
    target_month = month or datetime.now().strftime("%Y-%m")
    return service.get_or_create_run(target_month, force=force)


@router.post("/allocation/transfer/{run_bucket_id}")
def execute_transfer(
    run_bucket_id: int = ApiPath(..., ge=1),
    body: dict[str, Any] | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    tan = (body or {}).get("tan")
    custom_amount = (body or {}).get("amount")
    transfer_data = service.transfer_run_bucket(run_bucket_id, custom_amount)

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


@router.get("/allocation/donation-analytics")
def get_donation_analytics(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.get_donation_analytics()


@router.get("/allocation/savings-plans")
def list_savings_plans(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return {"plans": service.list_savings_plans()}


@router.post("/allocation/savings-plans")
def create_savings_plan(
    payload: SavingsPlanCreate,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.create_savings_plan(payload.model_dump())


@router.put("/allocation/savings-plans/{plan_id}")
def update_savings_plan(
    plan_id: int,
    payload: SavingsPlanUpdate,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    updated = service.update_savings_plan(plan_id, payload.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    return updated


@router.delete("/allocation/savings-plans/{plan_id}")
def delete_savings_plan(
    plan_id: int,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    if not service.delete_savings_plan(plan_id):
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    return {"status": "ok"}


@router.post("/allocation/savings-plans/{plan_id}/transfer")
def execute_savings_plan_transfer(
    plan_id: int = ApiPath(..., ge=1),
    body: dict[str, Any] | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    tan = (body or {}).get("tan")
    month = (body or {}).get("month")
    custom_amount = (body or {}).get("amount")
    transfer_data = service.transfer_savings_plan(plan_id, month, custom_amount)

    req = TransferRequest(
        recipient_iban=transfer_data["recipient_iban"],
        recipient_name=transfer_data["recipient_name"],
        amount=transfer_data["amount"],
        reason=transfer_data["purpose"],
        recipient_bic=transfer_data.get("recipient_bic"),
        sender_iban=transfer_data.get("sender_iban") or "",
        sender_name=transfer_data.get("sender_name") or "Finance-Manager",
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
        if isinstance(e, FinTSClientError):
            raise HTTPException(
                status_code=502,
                detail=(
                    "FinTS-Initialisierung fehlgeschlagen. Bitte FINTS_URL/FINTS_BLZ pruefen "
                    "und ggf. gespeicherten FinTS-State zuruecksetzen. "
                    f"Originalfehler: {e}"
                ),
            ) from e
        raise HTTPException(status_code=502, detail=f"Überweisung fehlgeschlagen: {e}")

    return {"status": "ok", "transfer": result}