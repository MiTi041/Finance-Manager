from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from starlette import status

from finance_server.models.sync_models import SyncSetupRequest, SyncStatusResponse
from finance_server.services.sync_service import (
    SyncService,
    save_sync_key,
    save_r2_config,
    load_r2_config,
)

router = APIRouter(tags=["sync"])


def get_sync_service() -> SyncService:
    from finance_server.main import sync_service
    return sync_service


@router.get("/sync/status", response_model=SyncStatusResponse)
def sync_status(service: SyncService = Depends(get_sync_service)) -> SyncStatusResponse:
    status_data = service.status()
    r2_config = load_r2_config() if status_data["configured"] else None
    return SyncStatusResponse(
        configured=status_data["configured"],
        running=status_data["running"],
        device_id=status_data["device_id"],
        key_id=service.key_id(),
        r2_bucket=r2_config["bucket"] if r2_config else None,
    )


@router.post("/sync/setup", status_code=status.HTTP_201_CREATED)
def sync_setup(
    request: SyncSetupRequest,
    service: SyncService = Depends(get_sync_service),
) -> dict[str, str]:
    if service.is_configured():
        raise HTTPException(status_code=409, detail="Sync bereits konfiguriert. Config löschen und erneut einrichten.")

    key_id = save_sync_key(request.password)
    save_r2_config(
        account_id=request.r2_account_id,
        access_key_id=request.r2_access_key_id,
        secret_access_key=request.r2_secret_access_key,
        bucket=request.r2_bucket,
    )

    service.stop()
    service.start()

    return {"status": "ok", "key_id": key_id}


@router.post("/sync/trigger")
def sync_trigger(service: SyncService = Depends(get_sync_service)) -> dict[str, str]:
    if not service.is_configured():
        raise HTTPException(status_code=400, detail="Sync nicht konfiguriert")
    service.stop()
    service.start()
    return {"status": "triggered"}


@router.delete("/sync/config")
def sync_clear_config(service: SyncService = Depends(get_sync_service)) -> dict[str, str]:
    from finance_server.core.database import get_connection
    from finance_server.db.settings import delete_setting

    service.stop()

    for key in [
        "sync_encrypted_key", "sync_key_id",
        "sync_r2_account_id", "sync_r2_access_key_id",
        "sync_r2_secret_access_key", "sync_r2_bucket",
    ]:
        delete_setting(key)

    with get_connection() as connection:
        connection.execute("DELETE FROM sync_state")
        connection.execute("DELETE FROM sync_ops")

    return {"status": "cleared"}
