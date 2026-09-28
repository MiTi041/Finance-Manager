from __future__ import annotations

import asyncio

import httpx
import pytest
from cryptography.fernet import Fernet

from finance_server.services.assistant import config as ai_config


@pytest.fixture
def mem_settings(monkeypatch):
    store: dict[str, str] = {}
    fernet = Fernet(Fernet.generate_key())
    monkeypatch.setattr(ai_config, "get_setting", lambda key: store.get(key))
    monkeypatch.setattr(
        ai_config, "set_setting", lambda key, value: store.__setitem__(key, value)
    )
    monkeypatch.setattr(ai_config, "get_credentials_fernet", lambda: fernet)
    return store


def test_public_config_masks_api_key(mem_settings):
    ai_config.save_ai_config(enabled=True, base_url="http://x/v1", model="m", api_key="secret")
    public = ai_config.public_ai_config()
    assert public == {
        "enabled": True,
        "base_url": "http://x/v1",
        "model": "m",
        "has_api_key": True,
        "configured": True,
    }
    assert "api_key" not in public


def test_api_key_is_encrypted_at_rest(mem_settings):
    ai_config.save_ai_config(api_key="secret")
    assert mem_settings["ai_api_key_enc"] != "secret"
    assert ai_config.load_ai_config()["api_key"] == "secret"


def test_is_configured_requires_enabled_url_and_model(mem_settings):
    ai_config.save_ai_config(enabled=True, base_url="http://x/v1", model="")
    assert ai_config.public_ai_config()["configured"] is False
    ai_config.save_ai_config(model="llama3")
    assert ai_config.public_ai_config()["configured"] is True


def test_default_base_url_when_unset(mem_settings):
    assert ai_config.load_ai_config()["base_url"] == "http://localhost:11434/v1"
