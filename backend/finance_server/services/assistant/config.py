from __future__ import annotations

from typing import Any

from finance_server.db.credentials import get_credentials_fernet
from finance_server.db.settings import get_setting, set_setting

AI_ENABLED_KEY = "ai_enabled"
AI_BASE_URL_KEY = "ai_base_url"
AI_MODEL_KEY = "ai_model"
AI_API_KEY_KEY = "ai_api_key_enc"

DEFAULT_BASE_URL = "http://localhost:11434/v1"


def _decrypt(value: str | None) -> str:
    if not value:
        return ""
    try:
        return get_credentials_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


def _encrypt(value: str) -> str:
    if not value:
        return ""
    return get_credentials_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def load_ai_config() -> dict[str, Any]:
    """Vollständige Konfiguration inkl. entschlüsseltem API-Key (nur intern)."""
    return {
        "enabled": get_setting(AI_ENABLED_KEY) == "true",
        "base_url": get_setting(AI_BASE_URL_KEY) or DEFAULT_BASE_URL,
        "model": get_setting(AI_MODEL_KEY) or "",
        "api_key": _decrypt(get_setting(AI_API_KEY_KEY)),
    }


def is_configured(config: dict[str, Any]) -> bool:
    return bool(
        config["enabled"] and config["base_url"].strip() and config["model"].strip()
    )


def public_ai_config() -> dict[str, Any]:
    config = load_ai_config()
    return {
        "enabled": config["enabled"],
        "base_url": config["base_url"],
        "model": config["model"],
        "has_api_key": bool(config["api_key"]),
        "configured": is_configured(config),
    }


def save_ai_config(
    *,
    enabled: bool | None = None,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> None:
    if enabled is not None:
        set_setting(AI_ENABLED_KEY, "true" if enabled else "false")
    if base_url is not None:
        set_setting(AI_BASE_URL_KEY, base_url.strip())
    if model is not None:
        set_setting(AI_MODEL_KEY, model.strip())
    if api_key is not None:
        set_setting(AI_API_KEY_KEY, _encrypt(api_key.strip()))
