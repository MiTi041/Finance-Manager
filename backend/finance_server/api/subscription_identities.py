from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath

from finance_server.api._crud import crud_create, crud_delete, crud_update
from finance_server.services.subscription_identity_service import SubscriptionIdentityService
from finance_server.api.deps import get_subscription_identity_service

router = APIRouter()


@router.get("/db/subscriptions/identities")
def get_identities(
    service: SubscriptionIdentityService = Depends(get_subscription_identity_service),
) -> dict[str, Any]:
    identities = service.list_all()
    return {"count": len(identities), "identities": identities}


@router.get("/db/subscriptions/identities/{identity_id}")
def get_single_identity(
    identity_id: int = ApiPath(..., ge=1),
    service: SubscriptionIdentityService = Depends(get_subscription_identity_service),
) -> dict[str, Any]:
    record = service.get(identity_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Subscription-Identität nicht gefunden")
    return record


@router.post("/db/subscriptions/identities")
def create_identity(
    payload: dict[str, Any] = Body(...),
    service: SubscriptionIdentityService = Depends(get_subscription_identity_service),
) -> dict[str, Any]:
    return crud_create(service.create, payload)


@router.patch("/db/subscriptions/identities/{identity_id}")
def patch_identity(
    identity_id: int = ApiPath(..., ge=1),
    payload: dict[str, Any] = Body(...),
    service: SubscriptionIdentityService = Depends(get_subscription_identity_service),
) -> dict[str, Any]:
    return crud_update(service.update, identity_id, payload, "Subscription-Identität")


@router.delete("/db/subscriptions/identities/{identity_id}")
def delete_identity(
    identity_id: int = ApiPath(..., ge=1),
    service: SubscriptionIdentityService = Depends(get_subscription_identity_service),
) -> dict[str, Any]:
    return crud_delete(service.delete, identity_id, "Subscription-Identität")
