from __future__ import annotations

import asyncio
from contextlib import ExitStack, contextmanager
from datetime import date
from unittest.mock import patch

import httpx
import pytest
from cryptography.fernet import Fernet

from finance_server.services.assistant import config as ai_config
from finance_server.services.assistant.context import (
    MAX_CONTEXT_TRANSACTIONS,
    build_context,
    build_system_prompt,
    resolve_date_range,
)


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


def test_resolve_date_range_defaults_to_last_year():
    start, end = resolve_date_range(None, None)
    assert (date.fromisoformat(end) - date.fromisoformat(start)).days == 365


def test_resolve_date_range_honours_explicit_values():
    assert resolve_date_range("2025-01-01", "2025-03-31") == ("2025-01-01", "2025-03-31")


def test_build_system_prompt_contains_sections():
    context = {
        "date_from": "2025-01-01",
        "date_to": "2025-01-31",
        "summary": {"incomes": 2000.0, "expenses": 1500.0, "balance": 500.0},
        "categories": [{"name": "Lebensmittel", "total_amount": 320.5}],
        "balances": [{"account_iban": "DE12", "balance": 1000.0}],
        "budgets": [{"name": "Freizeit", "spent": 50.0, "amount": 200.0}],
        "transactions": [
            {
                "date": "2025-01-05",
                "amount": -12.5,
                "recipient": "REWE",
                "purpose": "Einkauf",
                "category": "Lebensmittel",
            }
        ],
        "transaction_count": 1,
        "transactions_truncated": False,
    }
    prompt = build_system_prompt(context)
    assert "Lebensmittel" in prompt
    assert "REWE" in prompt
    assert "Freizeit" in prompt
    assert "2025-01-01 bis 2025-01-31" in prompt


def test_build_system_prompt_notes_truncation():
    context = {
        "date_from": "2025-01-01",
        "date_to": "2025-01-31",
        "summary": {"incomes": 0.0, "expenses": 0.0, "balance": 0.0},
        "categories": [],
        "balances": [],
        "budgets": [],
        "transactions": [],
        "transaction_count": 500,
        "transactions_truncated": True,
    }
    assert f"nur die ersten {MAX_CONTEXT_TRANSACTIONS}" in build_system_prompt(context)


def _seed_transactions(connection, count: int, kategorie_id: int | None) -> None:
    connection.executemany(
        """
        INSERT INTO umsaetze
            (account_iban, transaction_hash, date, amount, recipient_name, purpose, kategorie)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                "DE00ASSISTANT",
                f"HASH{index}",
                "2025-01-05",
                -float(index),
                f"SHOP{index}",
                "Einkauf",
                kategorie_id,
            )
            for index in range(count)
        ],
    )
    connection.commit()


_CONTEXT_DB_MODULES = ("analytics", "budgets", "categories", "transactions")


@contextmanager
def _patched_context_db(db):
    """Point every db module build_context touches at the test connection.

    Each db module does `from finance_server.core.database import get_connection`,
    so the name is bound per module — patching db.settings (or core.database)
    would not redirect them.
    """
    with ExitStack() as stack:
        for module in _CONTEXT_DB_MODULES:
            stack.enter_context(
                patch(f"finance_server.db.{module}.get_connection", return_value=db)
            )
        yield


def test_build_context_caps_transactions(test_db):
    with _patched_context_db(test_db):
        _seed_transactions(test_db, MAX_CONTEXT_TRANSACTIONS + 50, None)
        context = build_context("2025-01-01", "2025-12-31")

    assert len(context["transactions"]) == MAX_CONTEXT_TRANSACTIONS
    assert context["transaction_count"] == MAX_CONTEXT_TRANSACTIONS + 50
    assert context["transactions_truncated"] is True


def test_build_context_resolves_category_id_to_name(test_db):
    with _patched_context_db(test_db):
        cursor = test_db.execute(
            "INSERT INTO kategorien (name, typ) VALUES ('Lebensmittel', 'ausgabe')"
        )
        kategorie_id = cursor.lastrowid
        test_db.commit()
        _seed_transactions(test_db, 1, kategorie_id)
        context = build_context("2025-01-01", "2025-12-31")

    assert context["transactions"][0]["category"] == "Lebensmittel"
