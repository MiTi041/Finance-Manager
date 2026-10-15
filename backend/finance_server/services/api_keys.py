from __future__ import annotations

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
    set_setting(key, value)