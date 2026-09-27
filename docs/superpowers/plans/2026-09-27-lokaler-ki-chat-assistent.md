# Lokaler KI-Chat-Assistent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Chat-Assistent über die eigenen Finanzen, der einen lokal betriebenen, OpenAI-kompatiblen Modell-Server nutzt (Ollama, LM Studio, llama.cpp).

**Architecture:** Backend-Proxy. Das Frontend ruft nur das Backend (`/api/assistant/*`); das Backend speichert die Konfiguration, baut pro Frage einen Kontext (Aggregate + gefilterte Transaktionen) und streamt die Modellantwort per SSE zurück.

**Tech Stack:** FastAPI, httpx, SQLite (`app_settings`), React 19, TypeScript, Vite, `node --test`.

## Global Constraints

- Keine Cloud-Anbieter, kein mitgeliefertes Modell, nur OpenAI-kompatible Endpoints.
- Kein Tool-/Function-Calling in v1.
- Kein Chat-Verlauf wird persistiert (nur In-Memory in der Sitzung).
- API-Key wird mit `get_credentials_fernet()` verschlüsselt gespeichert, niemals im Klartext an das Frontend geliefert.
- Sidebar-Item nur sichtbar, wenn `ai_enabled == true` **und** `ai_base_url` **und** `ai_model` gesetzt sind (Key nicht erforderlich).
- Kontext-Transaktionen gekappt bei `MAX_CONTEXT_TRANSACTIONS = 200`.
- Default Base-URL: `http://localhost:11434/v1`.
- Keine neue Frontend-Dependency (kein Markdown-Renderer, keine Textarea-Primitive).

## File Structure

Backend (neu):
- `backend/finance_server/services/assistant/__init__.py`
- `backend/finance_server/services/assistant/config.py` — Laden/Speichern/Maskieren der KI-Config
- `backend/finance_server/services/assistant/context.py` — Kontext + System-Prompt
- `backend/finance_server/services/assistant/client.py` — httpx-Streaming zum Modell
- `backend/finance_server/api/assistant.py` — Router
- `backend/finance_server/models/assistant.py` — Pydantic-Modelle
- `backend/tests/test_assistant.py`

Backend (geändert):
- `backend/requirements.txt`, `backend/finance_server_bin.spec`, `package.json` (Build)
- `backend/finance_server/main.py` (Router registrieren)

Frontend (neu):
- `frontend/src/lib/assistant-sse.ts` — Typen + `parseSseBuffer` (rein, testbar)
- `frontend/src/lib/assistant.ts` — Fetch-Funktionen
- `frontend/src/lib/assistant-sse.test.ts`
- `frontend/src/hooks/use-assistant-config.ts`
- `frontend/src/hooks/use-assistant.ts`
- `frontend/src/pages/settings/tabs/assistant-tab.tsx`
- `frontend/src/pages/assistant/assistant-page.tsx`

Frontend (geändert):
- `frontend/src/pages/settings/settings-page.tsx`, `frontend/src/layouts/sidebar/app-sidebar.tsx`, `frontend/src/App.tsx`

---

### Task 1: httpx-Dependency + Build-Konfiguration

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `package.json` (Script `electron:build`)
- Modify: `backend/finance_server_bin.spec`

**Interfaces:**
- Consumes: nichts
- Produces: `httpx` zur Laufzeit und im PyInstaller-Bundle verfügbar.

- [ ] **Step 1: httpx in requirements aufnehmen**

In `backend/requirements.txt` nach `fastapi` eine Zeile einfügen:

```
httpx
```

- [ ] **Step 2: httpx installieren und Import prüfen**

Run (aus `backend/`): `.venv/bin/pip install -r requirements.txt && .venv/bin/python -c "import httpx; print(httpx.__version__)"`
Expected: Versionsnummer wird ausgegeben (z. B. `0.28.x`), kein `ModuleNotFoundError`.

- [ ] **Step 3: PyInstaller-Hidden-Imports ergänzen**

In `package.json` im `electron:build`-String die neuen Hidden-Imports direkt vor `--collect-data 'sepaxml'` einfügen:

```
--hidden-import 'httpx' --hidden-import 'httpcore' --hidden-import 'sniffio' --hidden-import 'anyio' --hidden-import 'h11' --hidden-import 'finance_server.api.assistant' --hidden-import 'finance_server.services.assistant' --hidden-import 'finance_server.services.assistant.config' --hidden-import 'finance_server.services.assistant.context' --hidden-import 'finance_server.services.assistant.client' --hidden-import 'finance_server.models.assistant' 
```

- [ ] **Step 4: Gleiche Namen in die spec-Datei aufnehmen**

In `backend/finance_server_bin.spec` die `hiddenimports=[...]`-Liste um folgende Einträge erweitern:

```python
'httpx', 'httpcore', 'sniffio', 'anyio', 'h11',
'finance_server.api.assistant',
'finance_server.services.assistant',
'finance_server.services.assistant.config',
'finance_server.services.assistant.context',
'finance_server.services.assistant.client',
'finance_server.models.assistant',
```

- [ ] **Step 5: Bestehende Backend-Tests laufen lassen (Regressionscheck)**

Run (aus `backend/`): `.venv/bin/pytest -q`
Expected: PASS (keine neuen Fehler durch die Dependency).

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt package.json backend/finance_server_bin.spec
git commit -m "chore: httpx für lokalen KI-Assistenten ergänzen"
```

---

### Task 2: KI-Konfiguration laden/speichern/maskieren

**Files:**
- Create: `backend/finance_server/services/assistant/__init__.py`
- Create: `backend/finance_server/services/assistant/config.py`
- Test: `backend/tests/test_assistant.py`

**Interfaces:**
- Consumes: `finance_server.db.settings.get_setting/set_setting`, `finance_server.db.credentials.get_credentials_fernet`
- Produces:
  - `load_ai_config() -> dict` mit Keys `enabled: bool`, `base_url: str`, `model: str`, `api_key: str` (entschlüsselt)
  - `public_ai_config() -> dict` mit Keys `enabled`, `base_url`, `model`, `has_api_key: bool`, `configured: bool`
  - `is_configured(cfg: dict) -> bool`
  - `save_ai_config(*, enabled=None, base_url=None, model=None, api_key=None) -> None`
  - Konstanten `DEFAULT_BASE_URL = "http://localhost:11434/v1"`

- [ ] **Step 1: Failing test schreiben**

`backend/tests/test_assistant.py`:

```python
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'finance_server.services.assistant'`.

- [ ] **Step 3: Paket und Config-Modul implementieren**

`backend/finance_server/services/assistant/__init__.py`:

```python
```

(leer)

`backend/finance_server/services/assistant/config.py`:

```python
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
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/services/assistant/__init__.py backend/finance_server/services/assistant/config.py backend/tests/test_assistant.py
git commit -m "feat: KI-Konfiguration speichern und maskieren"
```

---

### Task 3: Kontext-Builder + System-Prompt

**Files:**
- Create: `backend/finance_server/services/assistant/context.py`
- Test: `backend/tests/test_assistant.py` (erweitern)

**Interfaces:**
- Consumes: `finance_server.db.analytics.fetch_summary/fetch_category_analytics/fetch_account_balances`, `finance_server.db.budgets.list_budgets`, `finance_server.db.transactions.fetch_transactions`
- Produces:
  - `MAX_CONTEXT_TRANSACTIONS = 200`
  - `resolve_date_range(from_date: str | None, to_date: str | None) -> tuple[str, str]`
  - `build_context(from_date: str | None, to_date: str | None) -> dict[str, Any]`
  - `build_system_prompt(context: dict[str, Any]) -> str`

- [ ] **Step 1: Failing test ergänzen**

Ans Ende von `backend/tests/test_assistant.py`:

```python
from finance_server.services.assistant.context import (
    build_system_prompt,
    resolve_date_range,
)


def test_resolve_date_range_defaults_to_last_year():
    start, end = resolve_date_range(None, None)
    assert end >= start
    assert len(start) == 10 and len(end) == 10


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
    assert "nur die ersten 200" in build_system_prompt(context)
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'finance_server.services.assistant.context'`.

- [ ] **Step 3: context.py implementieren**

`backend/finance_server/services/assistant/context.py`:

```python
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from finance_server.db.analytics import (
    fetch_account_balances,
    fetch_category_analytics,
    fetch_summary,
)
from finance_server.db.budgets import list_budgets
from finance_server.db.transactions import fetch_transactions

MAX_CONTEXT_TRANSACTIONS = 200


def resolve_date_range(from_date: str | None, to_date: str | None) -> tuple[str, str]:
    today = date.today()
    end = to_date or today.isoformat()
    start = from_date or (today - timedelta(days=365)).isoformat()
    return start, end


def _compact_transaction(transaction: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": (
            transaction.get("entry_date")
            or transaction.get("date")
            or str(transaction.get("created_at", ""))[:10]
        ),
        "amount": transaction.get("amount"),
        "recipient": transaction.get("recipient_name")
        or transaction.get("applicant_name")
        or "",
        "purpose": transaction.get("purpose") or transaction.get("purpose_edit") or "",
        "category": transaction.get("kategorie") or "",
    }


def build_context(from_date: str | None, to_date: str | None) -> dict[str, Any]:
    start, end = resolve_date_range(from_date, to_date)
    transactions = fetch_transactions(None, from_date=start, to_date=end)
    compact = [
        _compact_transaction(transaction)
        for transaction in transactions[:MAX_CONTEXT_TRANSACTIONS]
    ]
    return {
        "date_from": start,
        "date_to": end,
        "summary": fetch_summary(from_date=start, to_date=end),
        "categories": fetch_category_analytics(from_date=start, to_date=end),
        "balances": fetch_account_balances(),
        "budgets": list_budgets(datetime.now().strftime("%Y-%m")),
        "transactions": compact,
        "transaction_count": len(transactions),
        "transactions_truncated": len(transactions) > MAX_CONTEXT_TRANSACTIONS,
    }


def build_system_prompt(context: dict[str, Any]) -> str:
    lines = [
        "Du bist ein Assistent für persönliche Finanzen in einer lokalen App.",
        "Antworte auf Deutsch, kurz und präzise.",
        "Nutze ausschließlich die unten gelieferten Daten. Erfinde keine Zahlen.",
        f"Zeitraum: {context['date_from']} bis {context['date_to']}.",
        "",
        "Zusammenfassung (EUR):",
        f"- Einnahmen: {context['summary'].get('incomes', 0):.2f}",
        f"- Ausgaben: {context['summary'].get('expenses', 0):.2f}",
        f"- Saldo: {context['summary'].get('balance', 0):.2f}",
    ]

    if context["categories"]:
        lines += ["", "Ausgaben je Kategorie (EUR):"]
        for category in context["categories"]:
            lines.append(
                f"- {category.get('name', '?')}: {category.get('total_amount', 0):.2f}"
            )

    if context["balances"]:
        lines += ["", "Kontostände (EUR):"]
        for balance in context["balances"]:
            lines.append(
                f"- {balance.get('account_iban', '?')}: {balance.get('balance', 0):.2f}"
            )

    if context["budgets"]:
        lines += ["", "Budgets (EUR):"]
        for budget in context["budgets"]:
            lines.append(
                f"- {budget.get('name', '?')}: {budget.get('spent', 0):.2f} "
                f"von {budget.get('amount', 0):.2f}"
            )

    lines += ["", f"Transaktionen ({len(context['transactions'])}):"]
    for transaction in context["transactions"]:
        lines.append(
            f"- {transaction['date']} | {transaction['amount']} EUR | "
            f"{transaction['recipient']} | {transaction['purpose']} | "
            f"{transaction['category']}"
        )

    if context["transactions_truncated"]:
        lines.append(
            f"(Hinweis: nur die ersten {MAX_CONTEXT_TRANSACTIONS} von "
            f"{context['transaction_count']} Transaktionen enthalten.)"
        )

    return "\n".join(lines)
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/services/assistant/context.py backend/tests/test_assistant.py
git commit -m "feat: Finanzkontext und System-Prompt für den KI-Chat"
```

---

### Task 4: Upstream-Client (httpx-Streaming)

**Files:**
- Create: `backend/finance_server/services/assistant/client.py`
- Test: `backend/tests/test_assistant.py` (erweitern)

**Interfaces:**
- Consumes: `httpx`
- Produces:
  - `class AssistantError(Exception)`
  - `async def stream_chat(*, base_url: str, api_key: str, model: str, messages: list[dict[str, str]], transport: httpx.AsyncBaseTransport | None = None) -> AsyncIterator[str]`
  - `async def list_models(*, base_url: str, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> list[str]`

- [ ] **Step 1: Failing tests ergänzen**

Ans Ende von `backend/tests/test_assistant.py`:

```python
from finance_server.services.assistant.client import (
    AssistantError,
    list_models,
    stream_chat,
)


def test_stream_chat_translates_sse():
    body = (
        'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":" Welt"}}]}\n\n'
        "data: [DONE]\n\n"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=body.encode(), headers={"content-type": "text/event-stream"}
        )

    async def collect() -> list[str]:
        tokens: list[str] = []
        async for token in stream_chat(
            base_url="http://x/v1",
            api_key="",
            model="m",
            messages=[],
            transport=httpx.MockTransport(handler),
        ):
            tokens.append(token)
        return tokens

    assert asyncio.run(collect()) == ["Hallo", " Welt"]


def test_stream_chat_raises_on_error_status():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"boom")

    async def consume() -> None:
        async for _ in stream_chat(
            base_url="http://x/v1",
            api_key="",
            model="m",
            messages=[],
            transport=httpx.MockTransport(handler),
        ):
            pass

    with pytest.raises(AssistantError):
        asyncio.run(consume())


def test_list_models_returns_ids():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "llama3"}, {"id": "qwen"}]})

    models = asyncio.run(
        list_models(base_url="http://x/v1", api_key="", transport=httpx.MockTransport(handler))
    )
    assert models == ["llama3", "qwen"]
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'finance_server.services.assistant.client'`.

- [ ] **Step 3: client.py implementieren**

`backend/finance_server/services/assistant/client.py`:

```python
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx


class AssistantError(Exception):
    """Fehler bei der Kommunikation mit dem lokalen Modell-Server."""


async def stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[str]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {"model": model, "messages": messages, "stream": True}
    timeout = httpx.Timeout(60.0, connect=10.0)

    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            async with client.stream(
                "POST", url, json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise AssistantError(
                        f"Modell-Server antwortete mit {response.status_code}: "
                        f"{body.decode('utf-8', 'ignore')[:200]}"
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    content = (choices[0].get("delta") or {}).get("content")
                    if content:
                        yield content
    except httpx.HTTPError as err:
        raise AssistantError(f"KI nicht erreichbar: {err}") from err


async def list_models(
    *,
    base_url: str,
    api_key: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as err:
        raise AssistantError(f"KI nicht erreichbar: {err}") from err

    if response.status_code != 200:
        raise AssistantError(f"Modell-Server antwortete mit {response.status_code}")

    payload = response.json()
    return [item.get("id", "") for item in payload.get("data", []) if item.get("id")]
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: PASS (11 Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/services/assistant/client.py backend/tests/test_assistant.py
git commit -m "feat: httpx-Streaming-Client für lokale Modelle"
```

---

### Task 5: API-Router + Modelle + Registrierung

**Files:**
- Create: `backend/finance_server/models/assistant.py`
- Create: `backend/finance_server/api/assistant.py`
- Modify: `backend/finance_server/main.py`
- Test: `backend/tests/test_assistant.py` (erweitern)

**Interfaces:**
- Consumes: `services.assistant.config`, `services.assistant.context`, `services.assistant.client`
- Produces (HTTP):
  - `GET /api/assistant/config` → `public_ai_config()`
  - `PATCH /api/assistant/config` → `public_ai_config()`
  - `POST /api/assistant/models` → `{"models": list[str]}`
  - `POST /api/assistant/chat` → `text/event-stream` mit Events `token` / `error` / `done`
  - `_sse(event: dict[str, Any]) -> str`

- [ ] **Step 1: Failing test ergänzen**

Ans Ende von `backend/tests/test_assistant.py`:

```python
from finance_server.api.assistant import _sse


def test_sse_format():
    frame = _sse({"type": "token", "text": "Hi"})
    assert frame == 'data: {"type": "token", "text": "Hi"}\n\n'
    assert frame.endswith("\n\n")
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'finance_server.api.assistant'`.

- [ ] **Step 3: Modelle implementieren**

`backend/finance_server/models/assistant.py`:

```python
from __future__ import annotations

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    date_from: str | None = None
    date_to: str | None = None


class AssistantConfigUpdate(BaseModel):
    enabled: bool | None = None
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None


class ModelsRequest(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
```

- [ ] **Step 4: Router implementieren**

`backend/finance_server/api/assistant.py`:

```python
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from finance_server.models.assistant import (
    AssistantConfigUpdate,
    ChatRequest,
    ModelsRequest,
)
from finance_server.services.assistant.client import (
    AssistantError,
    list_models,
    stream_chat,
)
from finance_server.services.assistant.config import (
    load_ai_config,
    public_ai_config,
    save_ai_config,
)
from finance_server.services.assistant.context import (
    build_context,
    build_system_prompt,
)

router = APIRouter()


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.get("/assistant/config")
def get_assistant_config() -> dict[str, Any]:
    return public_ai_config()


@router.patch("/assistant/config")
def update_assistant_config(payload: AssistantConfigUpdate) -> dict[str, Any]:
    save_ai_config(
        enabled=payload.enabled,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
    )
    return public_ai_config()


@router.post("/assistant/models")
async def get_assistant_models(payload: ModelsRequest) -> dict[str, Any]:
    config = load_ai_config()
    base_url = (payload.base_url or config["base_url"]).strip()
    api_key = payload.api_key if payload.api_key is not None else config["api_key"]
    if not base_url:
        raise HTTPException(status_code=400, detail="Keine Base-URL konfiguriert")
    try:
        models = await list_models(base_url=base_url, api_key=api_key)
    except AssistantError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err
    return {"models": models}


@router.post("/assistant/chat")
async def assistant_chat(payload: ChatRequest) -> StreamingResponse:
    config = load_ai_config()
    if not config["enabled"] or not config["base_url"].strip() or not config["model"].strip():
        raise HTTPException(status_code=400, detail="KI ist nicht konfiguriert")

    context = await run_in_threadpool(build_context, payload.date_from, payload.date_to)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": build_system_prompt(context)}
    ]
    messages += [{"role": message.role, "content": message.content} for message in payload.messages]

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for token in stream_chat(
                base_url=config["base_url"],
                api_key=config["api_key"],
                model=config["model"],
                messages=messages,
            ):
                yield _sse({"type": "token", "text": token})
        except AssistantError as err:
            yield _sse({"type": "error", "message": str(err)})
            return
        yield _sse({"type": "done"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 5: Router in main.py registrieren**

In `backend/finance_server/main.py` nach dem `app_settings_router`-Import ergänzen:

```python
from finance_server.api.assistant import router as assistant_router
```

Und nach `app.include_router(app_settings_router, prefix="/api")`:

```python
app.include_router(assistant_router, prefix="/api")
```

- [ ] **Step 6: Tests laufen lassen, Erfolg bestätigen**

Run (aus `backend/`): `.venv/bin/pytest tests/test_assistant.py -q`
Expected: PASS (12 Tests).

- [ ] **Step 7: Router-Import prüfen**

Run (aus `backend/`): `.venv/bin/python -c "from finance_server.main import app; print([r.path for r in app.routes if 'assistant' in r.path])"`
Expected: Liste mit `/api/assistant/config`, `/api/assistant/models`, `/api/assistant/chat`.

- [ ] **Step 8: Commit**

```bash
git add backend/finance_server/models/assistant.py backend/finance_server/api/assistant.py backend/finance_server/main.py backend/tests/test_assistant.py
git commit -m "feat: KI-Assistent-API mit SSE-Streaming"
```

---

### Task 6: Frontend SSE-Parser + API-Modul + Config-Hook

**Files:**
- Create: `frontend/src/lib/assistant-sse.ts`
- Create: `frontend/src/lib/assistant-sse.test.ts`
- Create: `frontend/src/lib/assistant.ts`
- Create: `frontend/src/hooks/use-assistant-config.ts`

**Interfaces:**
- Consumes: `frontend/src/lib/api.ts` (`getApiBaseUrl`, `parseJsonResponse`)
- Produces:
  - `type AssistantEvent = { type: "token"; text: string } | { type: "error"; message: string } | { type: "done" }`
  - `parseSseBuffer(buffer: string): { events: AssistantEvent[]; rest: string }`
  - `type AssistantConfig = { enabled: boolean; base_url: string; model: string; has_api_key: boolean; configured: boolean }`
  - `fetchAssistantConfig()`, `updateAssistantConfig(payload)`, `fetchAssistantModels({ base_url?, api_key? })`, `streamAssistantChat({ messages, dateFrom?, dateTo?, onEvent, signal? })`
  - `ASSISTANT_CONFIG_CHANGED_EVENT = "assistant-config-changed"`
  - `useAssistantConfig(): AssistantConfig | null`

- [ ] **Step 1: Failing test schreiben**

`frontend/src/lib/assistant-sse.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { parseSseBuffer } from "./assistant-sse.ts";

const first = parseSseBuffer('data: {"type":"token","text":"Hi"}\n\ndata: {"type":"done"}\n\n');
assert.deepEqual(first.events, [{ type: "token", text: "Hi" }, { type: "done" }]);
assert.equal(first.rest, "");

const partial = parseSseBuffer('data: {"type":"token","text":"Hal');
assert.deepEqual(partial.events, []);
assert.equal(partial.rest, 'data: {"type":"token","text":"Hal');

const continued = parseSseBuffer(partial.rest + 'lo"}\n\n');
assert.deepEqual(continued.events, [{ type: "token", text: "Hallo" }]);

const bad = parseSseBuffer("data: {nope}\n\n");
assert.deepEqual(bad.events, []);

console.log("assistant-sse.test.ts ok");
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run (aus `frontend/`): `node --test src/lib/assistant-sse.test.ts`
Expected: FAIL (Modul `assistant-sse.ts` existiert nicht).

- [ ] **Step 3: Parser implementieren**

`frontend/src/lib/assistant-sse.ts`:

```ts
export type AssistantEvent =
  | { type: "token"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function parseSseBuffer(buffer: string): {
  events: AssistantEvent[];
  rest: string;
} {
  const events: AssistantEvent[] = [];
  let rest = buffer;
  let index = rest.indexOf("\n\n");

  while (index !== -1) {
    const frame = rest.slice(0, index);
    rest = rest.slice(index + 2);
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as AssistantEvent);
      } catch {
        // unvollständiges JSON ignorieren
      }
    }
    index = rest.indexOf("\n\n");
  }

  return { events, rest };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run (aus `frontend/`): `node --test src/lib/assistant-sse.test.ts`
Expected: PASS, Ausgabe `assistant-sse.test.ts ok`.

- [ ] **Step 5: API-Modul implementieren**

`frontend/src/lib/assistant.ts`:

```ts
import { getApiBaseUrl, parseJsonResponse } from "./api";
import { parseSseBuffer, type AssistantEvent } from "./assistant-sse";

export type { AssistantEvent } from "./assistant-sse";

export type AssistantConfig = {
  enabled: boolean;
  base_url: string;
  model: string;
  has_api_key: boolean;
  configured: boolean;
};

export async function fetchAssistantConfig(): Promise<AssistantConfig> {
  const response = await fetch(`${getApiBaseUrl()}/assistant/config`);
  return parseJsonResponse(response);
}

export async function updateAssistantConfig(payload: {
  enabled?: boolean;
  base_url?: string;
  model?: string;
  api_key?: string;
}): Promise<AssistantConfig> {
  const response = await fetch(`${getApiBaseUrl()}/assistant/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function fetchAssistantModels(params: {
  base_url?: string;
  api_key?: string;
}): Promise<string[]> {
  const response = await fetch(`${getApiBaseUrl()}/assistant/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await parseJsonResponse(response);
  return payload.models ?? [];
}

export async function streamAssistantChat(params: {
  messages: { role: string; content: string }[];
  dateFrom?: string;
  dateTo?: string;
  onEvent: (event: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages,
      date_from: params.dateFrom ?? null,
      date_to: params.dateTo ?? null,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "KI-Anfrage fehlgeschlagen");
  }
  if (!response.body) throw new Error("Keine Antwort vom Server");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const event of events) params.onEvent(event);
  }
}
```

- [ ] **Step 6: Config-Hook implementieren**

`frontend/src/hooks/use-assistant-config.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { fetchAssistantConfig, type AssistantConfig } from "@/lib/assistant";

export const ASSISTANT_CONFIG_CHANGED_EVENT = "assistant-config-changed";

export function useAssistantConfig(): AssistantConfig | null {
  const [config, setConfig] = useState<AssistantConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig(await fetchAssistantConfig());
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(ASSISTANT_CONFIG_CHANGED_EVENT, load);
    return () => window.removeEventListener(ASSISTANT_CONFIG_CHANGED_EVENT, load);
  }, [load]);

  return config;
}
```

- [ ] **Step 7: Frontend-Build als Compile-Check**

Run (aus `frontend/`): `pnpm build`
Expected: Build erfolgreich, keine Importfehler.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/assistant-sse.ts frontend/src/lib/assistant-sse.test.ts frontend/src/lib/assistant.ts frontend/src/hooks/use-assistant-config.ts
git commit -m "feat: Frontend-API und SSE-Parser für den KI-Assistenten"
```

---

### Task 7: Einstellungen-Tab „KI"

**Files:**
- Create: `frontend/src/pages/settings/tabs/assistant-tab.tsx`
- Modify: `frontend/src/pages/settings/settings-page.tsx`

**Interfaces:**
- Consumes: `@/lib/assistant`, `@/hooks/use-assistant-config` (`ASSISTANT_CONFIG_CHANGED_EVENT`), `@/components/settings-tab-header`, UI-Primitives
- Produces: `AssistantTab`-Komponente, im Settings-Tab `?tab=assistant` erreichbar.

- [ ] **Step 1: Tab-Komponente implementieren**

`frontend/src/pages/settings/tabs/assistant-tab.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { SettingsTabHeader } from "@/components/settings-tab-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchAssistantConfig,
  fetchAssistantModels,
  updateAssistantConfig,
} from "@/lib/assistant";
import { ASSISTANT_CONFIG_CHANGED_EVENT } from "@/hooks/use-assistant-config";

export function AssistantTab() {
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434/v1");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = await fetchAssistantConfig();
      setEnabled(config.enabled);
      setBaseUrl(config.base_url);
      setModel(config.model);
      setHasApiKey(config.has_api_key);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Konfiguration konnte nicht geladen werden",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const result = await fetchAssistantModels({
        base_url: baseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setModels(result);
      toast.success(`${result.length} Modelle gefunden`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verbindung fehlgeschlagen");
    } finally {
      setTesting(false);
    }
  }, [baseUrl, apiKey]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const config = await updateAssistantConfig({
        enabled,
        base_url: baseUrl,
        model,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setHasApiKey(config.has_api_key);
      setApiKey("");
      window.dispatchEvent(new CustomEvent(ASSISTANT_CONFIG_CHANGED_EVENT));
      toast.success("KI-Einstellungen gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [enabled, baseUrl, model, apiKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <SettingsTabHeader
        title="KI-Assistent"
        description="Verbinde einen lokalen, OpenAI-kompatiblen Modell-Server (Ollama, LM Studio, llama.cpp)."
      />

      <div className="flex flex-col gap-4 rounded-lg border border-muted bg-muted/70 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Assistent aktiv</div>
            <div className="text-xs text-muted-foreground">
              Zeigt den KI-Chat in der Seitenleiste an.
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-base-url">Base-URL</Label>
          <Input
            id="ai-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://localhost:11434/v1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-api-key">API-Key (optional)</Label>
          <Input
            id="ai-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={hasApiKey ? "•••••••• (gespeichert)" : "nur falls der Server einen braucht"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-model">Modell</Label>
          <div className="flex gap-2">
            <Input
              id="ai-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="z. B. llama3.1:8b"
            />
            <Button variant="outline" onClick={() => void testConnection()} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : "Modelle laden"}
            </Button>
          </div>
          {models.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {models.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant={name === model ? "default" : "outline"}
                  size="sm"
                  onClick={() => setModel(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Speichern"}
          </Button>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Alle Anfragen gehen ausschließlich an deinen lokalen Server. Es werden keine Daten an
        Cloud-Anbieter gesendet.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Tab in settings-page.tsx verdrahten**

In `frontend/src/pages/settings/settings-page.tsx`:

1. Icon-Import ergänzen (bei den bestehenden `lucide-react`-Icons): `Sparkles`.
2. Import ergänzen (bei den Tab-Imports):

```tsx
import { AssistantTab } from "./tabs/assistant-tab";
```

3. `SETTINGS_TAB_VALUES` um `"assistant"` erweitern:

```ts
const SETTINGS_TAB_VALUES = [
  "banking",
  "zahlungspartner",
  "recipients",
  "categories",
  "allocation",
  "sync",
  "notifications",
  "keys",
  "assistant",
  "productId",
  "database",
] as const;
```

4. Eintrag im `tabs`-Array ergänzen:

```ts
  { value: "assistant", label: "KI", icon: Sparkles },
```

5. Eintrag in `tabComponents` ergänzen:

```ts
  assistant: () => <AssistantTab />,
```

- [ ] **Step 3: Build als Compile-Check**

Run (aus `frontend/`): `pnpm build`
Expected: Build erfolgreich.

- [ ] **Step 4: Manuell verifizieren**

Backend + Frontend starten (`pnpm run start`), Einstellungen → Tab „KI": Base-URL eintragen, „Modelle laden" klicken.
Expected: Bei laufendem Ollama/LM Studio erscheint eine Modell-Liste und der Toast „N Modelle gefunden"; bei falscher URL ein Fehler-Toast.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/settings/tabs/assistant-tab.tsx frontend/src/pages/settings/settings-page.tsx
git commit -m "feat: Einstellungen-Tab für den KI-Assistenten"
```

---

### Task 8: Sidebar-Sichtbarkeit + Route

**Files:**
- Modify: `frontend/src/layouts/sidebar/app-sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/assistant/assistant-page.tsx` (nur Platzhalter in diesem Task)

**Interfaces:**
- Consumes: `@/hooks/use-assistant-config`
- Produces: Route `/assistant`, Sidebar-Item „KI-Assistent" nur bei `config?.configured === true`.

- [ ] **Step 1: Platzhalter-Seite anlegen**

`frontend/src/pages/assistant/assistant-page.tsx`:

```tsx
export default function AssistantPage() {
  return <div className="p-6">KI-Assistent</div>;
}
```

- [ ] **Step 2: Route in App.tsx registrieren**

In `frontend/src/App.tsx` bei den Lazy-Imports ergänzen:

```tsx
const AssistantPage = lazy(() => import("@/pages/assistant/assistant-page"));
```

Und innerhalb von `<Route element={<AppLayout />}>` nach dem `/budgets`-Block:

```tsx
              <Route
                path="/assistant"
                element={
                  <ErrorBoundary pageName="KI-Assistent">
                    <AssistantPage />
                  </ErrorBoundary>
                }
              />
```

- [ ] **Step 3: Sidebar-Item bedingt anzeigen**

In `frontend/src/layouts/sidebar/app-sidebar.tsx`:

1. Icon-Import erweitern:

```tsx
import { FileText, Gauge, Repeat, Sparkles, Target, Wallet, Waypoints } from "lucide-react";
```

2. Import ergänzen:

```tsx
import { useAssistantConfig } from "@/hooks/use-assistant-config";
```

3. Innerhalb der Komponente `navData` ersetzen. Direkt nach `export function AppSidebar({ ...props }...) {`:

```tsx
  const assistantConfig = useAssistantConfig();
  const navMain = [
    { title: "Dashboard", url: "/dashboard", icon: Gauge },
    { title: "Transaktionen", url: "/transactions", icon: FileText },
    { title: "Abonnements", url: "/subscriptions", icon: Repeat },
    { title: "Kontenfluss", url: "/account-flow", icon: Waypoints },
    { title: "Finanzplan", url: "/finance-plan", icon: Wallet },
    { title: "Budgets", url: "/budgets", icon: Target },
    ...(assistantConfig?.configured
      ? [{ title: "KI-Assistent", url: "/assistant", icon: Sparkles }]
      : []),
  ];
```

4. Die alte `const navData = { navMain: [...] };`-Definition entfernen.

5. `<NavMain items={navData.navMain} />` zu `<NavMain items={navMain} />` ändern.

- [ ] **Step 4: Build als Compile-Check**

Run (aus `frontend/`): `pnpm build`
Expected: Build erfolgreich.

- [ ] **Step 5: Manuell verifizieren**

Bei konfigurierter KI (Task 7) erscheint „KI-Assistent" in der Sidebar und die Route lädt den Platzhalter. Ohne Konfiguration ist das Item nicht sichtbar.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/assistant/assistant-page.tsx frontend/src/App.tsx frontend/src/layouts/sidebar/app-sidebar.tsx
git commit -m "feat: KI-Assistent-Route und bedingtes Sidebar-Item"
```

---

### Task 9: Chat-UI + Streaming-Hook

**Files:**
- Create: `frontend/src/hooks/use-assistant.ts`
- Modify: `frontend/src/pages/assistant/assistant-page.tsx`

**Interfaces:**
- Consumes: `@/lib/assistant.streamAssistantChat`, `@/hooks/use-global-date-filter`, `@/types/time-range`
- Produces:
  - `type ChatMessage = { role: "user" | "assistant"; content: string }`
  - `useAssistant(dateFrom?: string, dateTo?: string) -> { messages, streaming, error, send, reset }`

- [ ] **Step 1: Streaming-Hook implementieren**

`frontend/src/hooks/use-assistant.ts`:

```ts
import { useCallback, useRef, useState } from "react";

import { streamAssistantChat } from "@/lib/assistant";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useAssistant(dateFrom?: string, dateTo?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamAssistantChat({
          messages: history,
          dateFrom,
          dateTo,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "token") {
              setMessages((previous) => {
                const next = [...previous];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + event.text };
                }
                return next;
              });
            } else if (event.type === "error") {
              setError(event.message);
            }
          },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "KI-Anfrage fehlgeschlagen");
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, dateFrom, dateTo],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  return { messages, streaming, error, send, reset };
}
```

- [ ] **Step 2: Chat-Seite implementieren**

`frontend/src/pages/assistant/assistant-page.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssistant } from "@/hooks/use-assistant";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { getTimeSpanForRange } from "@/types/time-range";
import { cn } from "@/lib/utils";

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export default function AssistantPage() {
  const { dateFilter } = useGlobalDateFilter();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { dateFrom, dateTo } = useMemo(() => {
    if (dateFilter.timeSpan) {
      return {
        dateFrom: toDateParam(startOfDay(dateFilter.timeSpan.from)),
        dateTo: toDateParam(endOfDay(dateFilter.timeSpan.until)),
      };
    }
    if (dateFilter.timeRange) {
      const span = getTimeSpanForRange(dateFilter.timeRange);
      return {
        dateFrom: toDateParam(startOfDay(span.from)),
        dateTo: toDateParam(endOfDay(span.until)),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [dateFilter]);

  const { messages, streaming, error, send, reset } = useAssistant(dateFrom, dateTo);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const value = input;
    setInput("");
    void send(value);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">KI-Assistent</h1>
            <p className="text-xs text-muted-foreground">Fragt deine Finanzdaten lokal ab</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
          <Trash2 className="size-4" /> Leeren
        </Button>
      </div>

      <ScrollArea className="flex-1 px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 py-6">
          {messages.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Stell eine Frage zu deinen Finanzen, z. B. „Wie viel habe ich letzten Monat für
              Lebensmittel ausgegeben?"
            </p>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> denkt nach …
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}

      <div className="border-t border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Frage zu deinen Finanzen …"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={submit} disabled={streaming || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build als Compile-Check**

Run (aus `frontend/`): `pnpm build`
Expected: Build erfolgreich.

- [ ] **Step 4: Manuell verifizieren**

`pnpm run start`, KI-Assistent öffnen, eine Frage stellen.
Expected: Frage erscheint rechts, Antwort streamt Wort für Wort links; „Leeren" setzt den Chat zurück; bei unerreichbarem Server erscheint eine Fehlermeldung.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/use-assistant.ts frontend/src/pages/assistant/assistant-page.tsx
git commit -m "feat: Chat-UI mit gestreamten KI-Antworten"
```

---

## Self-Review

**Spec coverage:**
- Ziel / lokaler OpenAI-kompatibler Server → Tasks 4, 5, 6, 7.
- Nicht-Ziele (keine Cloud, kein Tool-Calling, keine Persistenz) → eingehalten (kein Task nötig).
- Konfiguration (`ai_enabled`, `ai_base_url`, `ai_model`, `ai_api_key`) + Fernet → Task 2.
- Backend-Endpoints (config/models/chat, SSE) → Task 5.
- Kontext + System-Prompt, 200er-Kappung → Task 3.
- Frontend Settings-Tab, Chat-Seite, Streaming-Hook → Tasks 6–9.
- Sidebar nur wenn konfiguriert → Task 8.
- Chat-Optik wie normale Chat-App (Bubbles, Auto-Scroll, Enter senden, Denkt-Indikator) → Task 9.
- Fehlerbehandlung (nicht konfiguriert → 400; nicht erreichbar → `error`-Event/Fehlermeldung) → Tasks 4, 5, 9.
- Tests (Kontext, Maskierung, Fake-Upstream) → Tasks 2–6.
- Dependency `httpx` + Build → Task 1.

**Placeholder-Scan:** keine „TBD/TODO"; jeder Code-Schritt enthält vollständigen Code.

**Type-Konsistenz:** `public_ai_config`-Keys (`enabled`, `base_url`, `model`, `has_api_key`, `configured`) stimmen mit `AssistantConfig` im Frontend und `useAssistantConfig` überein. SSE-Event-Namen (`token`/`error`/`done`) sind in Backend (`_sse`) und Frontend (`AssistantEvent`) identisch. `stream_chat`/`list_models`-Signaturen aus Task 4 werden in Task 5 genau so aufgerufen.
