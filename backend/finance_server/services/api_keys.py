from __future__ import annotations

from datetime import datetime, timezone

from finance_server.core.config import settings
from finance_server.db.settings import get_setting, set_setting

EXTERNAL_KEYS = ("resend_api_key", "resend_from", "hunter_logo_key")


def get_external_key(key: str) -> str:
    """DB-Wert gewinnt, sonst Env-Fallback (Electron hat keine bearbeitbaren Envs)."""
    if key not in EXTERNAL_KEYS:
        raise ValueError(f"Unknown external key: {key}")
    return (get_setting(key) or "").strip() or getattr(settings, key, "").strip()


def update_external_key(key: str, value: str) -> None:
    if key not in EXTERNAL_KEYS:
        raise ValueError(f"Unknown external key: {key}")
    value = (value or "").strip()
    previous = get_setting(key)
    set_setting(key, value)
    from finance_server.services.sync_logger import log_crud_event

    log_crud_event(
        "app_settings",
        None,
        "INSERT" if previous is None else "UPDATE",
        {
            "key": key,
            "value": value,
            "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        },
    )