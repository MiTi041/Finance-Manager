from __future__ import annotations

from pydantic import BaseModel, Field


class SyncSetupRequest(BaseModel):
    password: str = Field(..., min_length=8, description="Sync-Passwort für die clientseitige Verschlüsselung")
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket: str = "finance-sync"


class SyncStatusResponse(BaseModel):
    configured: bool
    running: bool
    device_id: str
    key_id: str | None = None
    r2_bucket: str | None = None
