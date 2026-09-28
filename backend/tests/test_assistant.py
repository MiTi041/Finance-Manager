from __future__ import annotations

import asyncio
import json
import traceback
from contextlib import ExitStack, contextmanager
from datetime import date
from unittest.mock import patch

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException

from finance_server.api import assistant as assistant_api
from finance_server.api.assistant import _sse
from finance_server.models.assistant import (
    AssistantConfigUpdate,
    ChatMessage,
    ChatRequest,
)
from finance_server.services.assistant import config as ai_config
from finance_server.services.assistant.client import (
    AssistantError,
    list_models,
    stream_chat,
)
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
        "budgets": [
            {"name": "Freizeit", "period": "yearly", "spent": 50.0, "amount": 200.0}
        ],
        "budgets_month": "2025-01",
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
    # Finding 2: beide Sektionen tragen ihren eigenen Geltungsbereich, nicht den
    # gefragten Zeitraum — Budgets laufen über den laufenden Monat, Kontostände
    # sind der aktuelle Stand über ~100 Jahre.
    assert "Kontostände (EUR, aktueller Stand, nicht auf den Zeitraum bezogen)" in prompt
    assert "Budgets (EUR, Referenzmonat 2025-01, Zeitraum je Zeile)" in prompt
    assert "Kontostände (EUR):" not in prompt
    assert "Budgets (EUR):" not in prompt


def test_build_system_prompt_labels_each_budget_with_its_own_period():
    """Der Header "Monat 2025-01" gilt nicht für jede Budgetzeile.

    _fetch_spent summiert bei period == "yearly" das laufende Jahr bis Monat 9,
    nicht den Monat — der Zeitraum gehört deshalb in die Zeile selbst. "yearly"
    kommt sonst nirgends im Prompt vor, der Assert kann also nicht aus Versehen
    über einen anderen Text grün werden.
    """
    prompt = build_system_prompt(
        {
            "date_from": "2025-01-01",
            "date_to": "2025-01-31",
            "summary": {"incomes": 0.0, "expenses": 0.0, "balance": 0.0},
            "categories": [],
            "balances": [],
            "budgets": [
                {"name": "Urlaub", "period": "yearly", "spent": 4800.0, "amount": 12000.0}
            ],
            "budgets_month": "2025-01",
            "transactions": [],
            "transaction_count": 0,
            "transactions_truncated": False,
        }
    )
    assert "- Urlaub (yearly): 4800.00 von 12000.00" in prompt


def test_build_system_prompt_budget_header_does_not_claim_one_month_for_all_rows():
    """Der Header nennt den Monat als Referenz, nicht als Geltung aller Zeilen.

    "Budgets (EUR, Monat 2025-01):" behauptete den Monat für jede Zeile und
    widersprach damit der Periodenangabe direkt darunter. Geprüft wird die
    vollständige Headerzeile, nicht das Fehlen eines Teilstrings: so fällt
    jede andere Monatsbehauptung im Header auf, auch eine künftig added.
    """
    prompt = build_system_prompt(
        {
            "date_from": "2025-01-01",
            "date_to": "2025-01-31",
            "summary": {"incomes": 0.0, "expenses": 0.0, "balance": 0.0},
            "categories": [],
            "balances": [],
            "budgets": [
                {"name": "Miete", "period": "monthly", "spent": 900.0, "amount": 1000.0},
                {"name": "Urlaub", "period": "yearly", "spent": 4800.0, "amount": 12000.0},
            ],
            "budgets_month": "2025-01",
            "transactions": [],
            "transaction_count": 0,
            "transactions_truncated": False,
        }
    )
    header = next(line for line in prompt.splitlines() if line.startswith("Budgets"))
    assert header == "Budgets (EUR, Referenzmonat 2025-01, Zeitraum je Zeile):"
    # Zwei Zeilen, zwei Zeiträume, ein Header — der Widerspruch, den die alte
    # Fassung in aufeinanderfolgenden Zeilen erzeugt hat.
    assert "- Miete (monthly): 900.00 von 1000.00" in prompt
    assert "- Urlaub (yearly): 4800.00 von 12000.00" in prompt


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


_ASSISTANT_IBAN = "DE00ASSISTANT"
_DELETED_ASSISTANT_IBAN = "DE00ASSISTANTGELOESCHT"


def _seed_bank_account(connection, iban: str = _ASSISTANT_IBAN) -> None:
    """Register the account in bank_accounts.

    fetch_transactions flags every row whose IBAN is unknown to bank_accounts as
    bank_deleted, and build_context drops exactly those — an unregistered seed
    would silently produce an empty transaction list.
    """
    connection.execute(
        "INSERT OR IGNORE INTO bank_credentials (scope, payload, created_at, updated_at) "
        "VALUES ('assistant', X'00', '2025-01-01', '2025-01-01')"
    )
    connection.execute(
        "INSERT OR IGNORE INTO bank_accounts (scope, iban, account_name) "
        "VALUES ('assistant', ?, 'Assistant')",
        (iban,),
    )
    connection.commit()


def _seed_transactions(
    connection, count: int, kategorie_id: int | None, iban: str = _ASSISTANT_IBAN
) -> None:
    connection.executemany(
        """
        INSERT INTO umsaetze
            (account_iban, transaction_hash, date, amount, recipient_name, purpose, kategorie)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                iban,
                f"HASH{iban}-{index}",
                "2025-01-05",
                -float(index),
                f"SHOP{iban}-{index}",
                "Einkauf",
                kategorie_id,
            )
            for index in range(count)
        ],
    )
    connection.commit()


_CONTEXT_DB_MODULES = ("analytics", "budgets", "transactions")


@contextmanager
def _patched_context_db(db):
    """Point every db module build_context touches at the test connection.

    Each db module does `from finance_server.core.database import get_connection`,
    so the name is bound per module — patching db.settings (or core.database)
    would not redirect them. db.categories is not listed: build_context takes the
    id→name map from fetch_category_analytics, it no longer calls a categories
    function.
    """
    with ExitStack() as stack:
        for module in _CONTEXT_DB_MODULES:
            stack.enter_context(
                patch(f"finance_server.db.{module}.get_connection", return_value=db)
            )
        yield


def test_build_context_caps_transactions(test_db):
    with _patched_context_db(test_db):
        _seed_bank_account(test_db)
        _seed_transactions(test_db, MAX_CONTEXT_TRANSACTIONS + 50, None)
        context = build_context("2025-01-01", "2025-12-31")

    # Finding 4: die drei Zusicherungen oben interpolieren die Konstante selbst,
    # ein Wert 1000 ließe sie grün. Nur das Literal pinnt die Planvorgabe.
    assert MAX_CONTEXT_TRANSACTIONS == 200
    assert len(context["transactions"]) == MAX_CONTEXT_TRANSACTIONS
    assert context["transaction_count"] == MAX_CONTEXT_TRANSACTIONS + 50
    assert context["transactions_truncated"] is True


def test_build_context_drops_transactions_of_deleted_accounts(test_db):
    """fetch_summary zählt nur bekannte Bankkonten; die Liste muss denselben Scope haben.

    Die gelöschten Zeilen werden zuletzt geseedet und damit von fetch_transactions
    (ORDER BY ... date DESC, id DESC) nach oben sortiert — sie wären also genau die,
    die der 200er-Cap zuerst zeigen würde.
    """
    with _patched_context_db(test_db):
        _seed_bank_account(test_db)
        _seed_transactions(test_db, MAX_CONTEXT_TRANSACTIONS + 50, None)
        _seed_transactions(test_db, 3, None, iban=_DELETED_ASSISTANT_IBAN)
        context = build_context("2025-01-01", "2025-12-31")

    assert len(context["transactions"]) == MAX_CONTEXT_TRANSACTIONS
    assert all(
        transaction["recipient"].startswith(f"SHOP{_ASSISTANT_IBAN}-")
        for transaction in context["transactions"]
    )
    # Zählt die gefilterte, ungekappte Menge — sonst widerspräche der Hinweis
    # "nur die ersten 200 von N" der direkt darüber gedruckten Liste.
    assert context["transaction_count"] == MAX_CONTEXT_TRANSACTIONS + 50
    assert context["transactions_truncated"] is True


def test_build_context_resolves_category_id_to_name(test_db):
    with _patched_context_db(test_db):
        _seed_bank_account(test_db)
        cursor = test_db.execute(
            "INSERT INTO kategorien (name, typ) VALUES ('Lebensmittel', 'ausgabe')"
        )
        kategorie_id = cursor.lastrowid
        test_db.commit()
        _seed_transactions(test_db, 1, kategorie_id)
        _seed_bank_account(test_db, "DE00OHNEKATEGORIE")
        _seed_transactions(test_db, 1, None, iban="DE00OHNEKATEGORIE")
        context = build_context("2025-01-01", "2025-12-31")

    by_recipient = {t["recipient"]: t["category"] for t in context["transactions"]}
    assert by_recipient[f"SHOP{_ASSISTANT_IBAN}-0"] == "Lebensmittel"
    # Unauflösbare ID (hier: NULL) -> "" und nie None, nie "None" im Prompt.
    assert by_recipient["SHOPDE00OHNEKATEGORIE-0"] == ""


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


def test_assistant_error_never_carries_the_api_key():
    """Der Key steht ausschliesslich im Authorization-Header.

    Keine Fehlerverzweigung gibt Header oder Anfrage aus, deshalb darf er in
    weder Status- noch Verbindungsfehler auftauchen. Geprueft werden beide
    Zweige, und die Meldung muss den Status nennen -- sonst koennte der Test
    auch mit einer leeren Exception gruen werden.

    Abgedeckt sind nur die beiden Transportzweige. Die inhaltlichen Zweige
    (unerwarteter Servertext, ungueltiger Key, kaputter Payload) laufen ueber
    test_kein_fehlerpfad_leakt_den_api_key.
    """
    secret = "sk-super-secret"

    def status_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"boom")

    async def consume() -> None:
        async for _ in stream_chat(
            base_url="http://x/v1",
            api_key=secret,
            model="m",
            messages=[],
            transport=httpx.MockTransport(status_handler),
        ):
            pass

    with pytest.raises(AssistantError) as status_error:
        asyncio.run(consume())
    assert "500" in str(status_error.value)
    assert secret not in str(status_error.value)

    def connect_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with pytest.raises(AssistantError) as connect_error:
        asyncio.run(
            list_models(
                base_url="http://x/v1",
                api_key=secret,
                transport=httpx.MockTransport(connect_handler),
            )
        )
    assert secret not in str(connect_error.value)


# --- Findings aus dem Task-4-Review -------------------------------------------

_CANARY = "sk-LEAK-CANARY-1234"
_NICHT_ASCII_CANARY = f"{_CANARY}ä"
# Re-Review Finding 1: Keys, die isascii() bestehen, aber kein einzeiliger
# Headerwert sind. strip() raeumt nur die Raender, ein Mehrzeilen-Paste laesst den
# Umbruch also innen stehen — genau daran scheitert h11 erst beim Senden.
_STEUERZEICHEN_KEYS = {
    "zeilenumbruch": f"{_CANARY}\nsecond-line",
    "wagenruecklauf": f"{_CANARY}\rsecond-line",
    "tabulator": f"{_CANARY}\tsecond-line",
    "nullbyte": f"{_CANARY}\x00second-line",
    "esc-sequenz": f"{_CANARY}\x1b[31m",
}
# Ein Server, der den Authorization-Header im eigenen Fehlertext wiederholt.
_ECHO_BODY = f'{{"error":"unauthorized: Bearer {_CANARY}"}}'.encode()
_FRAME_MIT_TEXT = 'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n'
_FRAME_MIT_WELT = 'data: {"choices":[{"delta":{"content":" Welt"}}]}\n\n'


def _antwort(status: int, body: bytes):
    return lambda request: httpx.Response(status, content=body)


def _stream_mit(status: int, body: bytes, api_key: str = _CANARY):
    """Coroutine: stream_chat starten und den Stream vollstaendig konsumieren."""

    async def lauf() -> None:
        async for _ in stream_chat(
            base_url="http://x/v1",
            api_key=api_key,
            model="m",
            messages=[],
            transport=httpx.MockTransport(_antwort(status, body)),
        ):
            pass

    return lauf


def _models_mit(status: int, body: bytes, api_key: str = _CANARY):
    """Coroutine: list_models aufrufen."""

    async def lauf() -> list[str]:
        return await list_models(
            base_url="http://x/v1",
            api_key=api_key,
            transport=httpx.MockTransport(_antwort(status, body)),
        )

    return lauf


def _verbindung_verweigert(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


def _stream_abgewiesen(api_key: str = _CANARY):
    """Coroutine: stream_chat gegen einen Server, der die Verbindung verweigert."""

    async def lauf() -> None:
        async for _ in stream_chat(
            base_url="http://x/v1",
            api_key=api_key,
            model="m",
            messages=[],
            transport=httpx.MockTransport(_verbindung_verweigert),
        ):
            pass

    return lauf


def _models_abgewiesen(api_key: str = _CANARY):
    """Coroutine: list_models gegen einen Server, der die Verbindung verweigert."""

    async def lauf() -> list[str]:
        return await list_models(
            base_url="http://x/v1",
            api_key=api_key,
            transport=httpx.MockTransport(_verbindung_verweigert),
        )

    return lauf


# Bodies, die formal gueltiges JSON sind, aber kein OpenAI-Format tragen.
_UNERWARTETE_PAYLOADS = {
    "kein-json": b"<html>404 not found</html>",
    "null": b"null",
    "liste": b"[1, 2]",
    "text": b'"llama3"',
    "data-null": b'{"data": null}',
    "data-zahlen": b'{"data": [1, 2]}',
    "data-text": b'{"data": "llama3"}',
    # Kaputtes JSON, das den zurueckgespielten Key enthaelt: genau der Fall, in dem
    # der Rohbody ueber .doc der verketteten JSONDecodeError erreichbar war.
    "key-im-body": f'{{"error":"unauthorized: Bearer {_CANARY}"'.encode(),
}

_UNERWARTETE_FRAMES = {
    "kein-json": "data: {nope}\n\n",
    "null": "data: null\n\n",
    "liste": "data: [1, 2]\n\n",
    "text": 'data: "Hallo"\n\n',
    "choices-text": 'data: {"choices": ["x"]}\n\n',
    "choices-zahlen": 'data: {"choices": [1, 2]}\n\n',
    "delta-text": 'data: {"choices": [{"delta": "x"}]}\n\n',
    "key-im-frame": f'data: {{"choices":[{{"delta":"Bearer {_CANARY}"\n\n',
}


def _leak_params() -> list:
    """Ein Fall je Fehlerpfad, ueber den der Key wandern koennte."""
    params = [
        # Finding 1: Statuszweige, deren Body den Key wiederholt.
        pytest.param(_stream_mit(401, _ECHO_BODY), _CANARY, id="stream/401"),
        pytest.param(_stream_mit(500, _ECHO_BODY), _CANARY, id="stream/500"),
        pytest.param(_models_mit(401, _ECHO_BODY), _CANARY, id="models/401"),
        pytest.param(_models_mit(500, _ECHO_BODY), _CANARY, id="models/500"),
        # Finding 2: nicht-ASCII-Key in beide Richtungen.
        pytest.param(
            _stream_mit(200, b"data: [DONE]\n\n", _NICHT_ASCII_CANARY),
            _NICHT_ASCII_CANARY,
            id="stream/key-umlaut",
        ),
        pytest.param(
            _models_mit(200, b'{"data": []}', _NICHT_ASCII_CANARY),
            _NICHT_ASCII_CANARY,
            id="models/key-umlaut",
        ),
        # Re-Review Finding 1: ASCII-Steuerzeichen im Key. Geprueft wird der
        # druckbare Teil des Keys — genau ihn bettet h11 in seine Fehlermeldung.
        pytest.param(
            _stream_mit(200, b"data: [DONE]\n\n", _STEUERZEICHEN_KEYS["zeilenumbruch"]),
            _CANARY,
            id="stream/key-zeilenumbruch",
        ),
        pytest.param(
            _models_mit(200, b'{"data": []}', _STEUERZEICHEN_KEYS["zeilenumbruch"]),
            _CANARY,
            id="models/key-zeilenumbruch",
        ),
        # Finding 3: unerwartete Payloads.
        *[
            pytest.param(_models_mit(200, body), _CANARY, id=f"models/{name}")
            for name, body in _UNERWARTETE_PAYLOADS.items()
        ],
        *[
            pytest.param(_stream_mit(200, frame.encode()), _CANARY, id=f"stream/{name}")
            for name, frame in _UNERWARTETE_FRAMES.items()
        ],
        # Finding 4: Stream endet ohne [DONE].
        pytest.param(
            _stream_mit(200, _FRAME_MIT_TEXT.encode()), _CANARY, id="stream/ohne-done"
        ),
        # Transportzweig, damit der Sweep vollstaendig ist.
        pytest.param(_models_abgewiesen(), _CANARY, id="models/verbindung"),
        pytest.param(_stream_abgewiesen(), _CANARY, id="stream/verbindung"),
    ]
    return params


@pytest.mark.parametrize(("coro", "canary"), _leak_params())
def test_kein_fehlerpfad_leakt_den_api_key(coro, canary):
    """Der Key darf in keine AssistantError-Meldung und in keine Exception-Kette.

    Geprueft werden str, repr und die formatierte Traceback -- nicht nur str.
    Die UnicodeEncodeError aus dem Header-Encoding traegt den Key in ihrem repr()
    und haengt sich als __context__ an die AssistantError; ein Handler, der die
    Ausnahmekette protokolliert, haette ihn sonst im Log. Die Kette ist deshalb
    ausdruecklich mitgeprueft -- ``from None`` unterdrueckt nur die Ausgabe,
    __context__ bleibt erreichbar.
    """
    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(coro())

    fehler = excinfo.value
    assert str(fehler)
    assert canary not in str(fehler)
    assert canary not in repr(fehler)
    assert canary not in "".join(
        traceback.format_exception(type(fehler), fehler, fehler.__traceback__)
    )
    for gechelt in (fehler.__cause__, fehler.__context__):
        if gechelt is not None:
            assert canary not in f"{gechelt} {gechelt!r}"
            # Re-Review Finding 2: JSONDecodeError traegt den kompletten Rohbody
            # des Servers in .doc. str() und repr() zeigen ihn nicht, ein Logger,
            # der die Exceptionkette traversiert, schon.
            assert canary not in str(getattr(gechelt, "doc", "") or "")


def test_fehlerstatus_gibt_keinen_servertext_weiter():
    """Finding 1: der Body eines 4xx/5xx ist nicht vertrauenswuerdig.

    Er wird nicht gekuerzt und nicht maskiert, sondern weggelassen -- ein
    "Bearer <key>" im Servertext waere sonst in Meldung, Log und HTTP-Response
    gelandet. Geprueft wird der Statuscode selbst, damit der Test nicht auch
    mit einer inhaltsleeren Meldung gruen wuerde.
    """
    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(_stream_mit(401, _ECHO_BODY)())

    meldung = str(excinfo.value)
    assert "401" in meldung
    assert "unauthorized" not in meldung
    assert _CANARY not in meldung


def test_api_key_mit_umlaut_wird_abgelehnt_ohne_anfrage():
    """Finding 2: nicht-ASCII wird abgelehnt, nicht umkodiert.

    httpx kodiert Header als ASCII; ohne Vorpruefung bricht der Aufruf mit
    UnicodeEncodeError ab, der nicht AssistantError ist und vom Router nicht
    uebersetzt wird. Umkodieren waere kein Fix, sondern ein anderer Key: der
    Server koennte ihn nicht authentifizieren. Der Handler ist die
    Beweisstelle -- er darf gar nicht erst aufgerufen werden.
    """
    aufgerufen = []

    def handler(request: httpx.Request) -> httpx.Response:
        aufgerufen.append(request)
        return httpx.Response(200, content=b'{"data": []}')

    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(
            list_models(
                base_url="http://x/v1",
                api_key=_NICHT_ASCII_CANARY,
                transport=httpx.MockTransport(handler),
            )
        )

    assert aufgerufen == []
    assert "API-Key" in str(excinfo.value)
    assert _NICHT_ASCII_CANARY not in str(excinfo.value)


def test_api_key_wird_getrimmt():
    """Paste-Artefakte: der Key selbst bleibt unveraendert im Header.

    Nur an den Raendern wird entfernt, was nicht zum Key gehoert -- die
    getrimmte Fassung ist genau die, die der Server ohnehin authentifiziert.
    """
    gesendet: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        gesendet.update(request.headers)
        return httpx.Response(200, json={"data": []})

    asyncio.run(
        list_models(
            base_url="http://x/v1",
            api_key=f"  {_CANARY}\n",
            transport=httpx.MockTransport(handler),
        )
    )
    assert gesendet["authorization"] == f"Bearer {_CANARY}"


@pytest.mark.parametrize("body", _UNERWARTETE_PAYLOADS.values(), ids=list(_UNERWARTETE_PAYLOADS))
def test_list_models_unexpected_payload_becomes_assistant_error(body):
    """Finding 3: JSONDecodeError allein fasst nur kaputtes JSON, nicht das Format."""
    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(_models_mit(200, body)())
    assert str(excinfo.value)


@pytest.mark.parametrize("frame", list(_UNERWARTETE_FRAMES.values()), ids=list(_UNERWARTETE_FRAMES))
def test_stream_chat_unexpected_frame_becomes_assistant_error(frame):
    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(_stream_mit(200, frame.encode())())
    assert str(excinfo.value)


def test_list_models_meldet_fehlerstatus():
    """Finding 5: der Statuszweig von list_models war ungetestet.

    Load-bearing: faellt der Zweig weg, laeuft der Aufruf in response.json() und
    endet mit der Meldung fuer kaputtes JSON -- die den Status nicht nennt.
    """
    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(_models_mit(503, b"model runner restarting")())

    assert "503" in str(excinfo.value)
    assert "model runner" not in str(excinfo.value)


def test_stream_ohne_done_liefert_tokens_und_meldet_abschneiden():
    """Finding 4: Tokens ausliefern, dann das Signal.

    Der Aufrufer sammelt beim Iterieren; ein Raise erst nach der Schleife
    laesst ihm den Partialtext und macht die Unvollstaendigkeit sichtbar.
    Wuerde statt dessen still beendet, erschiene die Antwort im Frontend als
    fertig.
    """
    body = (_FRAME_MIT_TEXT + 'data: {"choices":[{"delta":{"content":" Welt"}}]}\n\n').encode()
    tokens: list[str] = []

    async def sammle() -> None:
        async for token in stream_chat(
            base_url="http://x/v1",
            api_key="",
            model="m",
            messages=[],
            transport=httpx.MockTransport(_antwort(200, body)),
        ):
            tokens.append(token)

    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(sammle())

    assert tokens == ["Hallo", " Welt"]
    assert "abgeschnitten" in str(excinfo.value)


def test_ungueltiger_frame_behaelt_bisherige_tokens():
    """Finding 3: das continue im Stream hat generierten Text verworfen.

    Es ist ein stummer Datenverlust: der Nutzer sieht eine kuerzere Antwort und
    kein Wort dazu. Der Stream endet hier *mit* [DONE] und einem weiteren
    gueltigen Frame -- ein continue wuerde beides ueberspringen und sauber
    "fertig" melden, nur eben mit einer Luecke in der Antwort.
    """
    body = (_FRAME_MIT_TEXT + "data: {nope\n\n" + _FRAME_MIT_WELT + "data: [DONE]\n\n").encode()
    tokens: list[str] = []

    async def sammle() -> None:
        async for token in stream_chat(
            base_url="http://x/v1",
            api_key="",
            model="m",
            messages=[],
            transport=httpx.MockTransport(_antwort(200, body)),
        ):
            tokens.append(token)

    with pytest.raises(AssistantError):
        asyncio.run(sammle())

    assert tokens == ["Hallo"]


# --- Re-Review zu Task 4 ---------------------------------------------------


def _rekursiv_ueber_die_kette(fehler: BaseException) -> list[BaseException]:
    """Die Exception mit __cause__ und __context__, Tiefensuche mit Schleifenschutz."""
    kette: list[BaseException] = []
    knoten: BaseException | None = fehler
    while knoten is not None and knoten not in kette:
        kette.append(knoten)
        knoten = knoten.__cause__ or knoten.__context__
    return kette


@pytest.mark.parametrize("key", list(_STEUERZEICHEN_KEYS.values()), ids=list(_STEUERZEICHEN_KEYS))
@pytest.mark.parametrize("eintritt", ["list_models", "stream_chat"])
def test_api_key_mit_steuerzeichen_wird_abgelehnt_ohne_anfrage(eintritt, key):
    """Re-Review Finding 1: isascii() allein lässt \n, \t, \r und \x00 durch.

    strip() raeumt nur die Raender, ein Mehrzeilen-Paste laesst den Umbruch innen
    stehen. Der Key passierte die alte Pruefung, httpx reichte ihn an h11 weiter,
    und h11 lehnte ihn beim Senden ab -- mit dem kompletten Headerwert in seiner
    eigenen Fehlermeldung. Ein MockTransport sieht das nicht: er umgeht die
    Headerkodierung vollstaendig. Deshalb ist hier der Handler die Beweisstelle,
    er darf gar nicht erst aufgerufen werden. Beide Aufrufwege werden geprueft,
    weil stream_chat als Generator erst beim Iterieren den Guard erreicht.
    """
    aufgerufen = []

    def handler(request: httpx.Request) -> httpx.Response:
        aufgerufen.append(request)
        return httpx.Response(200, content=b'{"data": []}')

    async def models() -> None:
        await list_models(
            base_url="http://x/v1", api_key=key, transport=httpx.MockTransport(handler)
        )

    async def stream() -> None:
        async for _ in stream_chat(
            base_url="http://x/v1",
            api_key=key,
            model="m",
            messages=[],
            transport=httpx.MockTransport(handler),
        ):
            pass

    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(models() if eintritt == "list_models" else stream())

    assert aufgerufen == []
    # Die Meldung muss die actionable bleiben und den Key selbst nicht nennen.
    assert "API-Key" in str(excinfo.value)
    assert key not in str(excinfo.value)
    assert _CANARY not in repr(excinfo.value)
    for gechelt in _rekursiv_ueber_die_kette(excinfo.value)[1:]:
        assert _CANARY not in f"{gechelt} {gechelt!r}"


async def _loopback_server(protokoll: dict):
    """127.0.0.1 auf einem freien Port — kein Egress, kein fremder Dienst.

    Der Stub beantwortet jede Anfrage mit einer leeren Model-Liste, damit der
    Gegenpol des Tests (ein gueltiger Key kommt an) ein echter Roundtrip ist.
    """
    body = b'{"data": []}'

    async def handle(reader, writer):
        protokoll["verbindungen"] += 1
        try:
            roh = await asyncio.wait_for(reader.read(4096), timeout=1.0)
        except (asyncio.TimeoutError, OSError):
            roh = b""
        protokoll["anfragen"].append(roh)
        writer.write(
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
            + str(len(body)).encode()
            + b"\r\n\r\n"
            + body
        )
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    return f"http://127.0.0.1:{port}/v1", server


@pytest.mark.parametrize("key", list(_STEUERZEICHEN_KEYS.values()), ids=list(_STEUERZEICHEN_KEYS))
def test_steuerzeichen_im_key_erreicht_keinen_echten_socket(key):
    """Re-Review Finding 1 am echten Socket: der Weg, den ein MockTransport nicht sieht.

    Der obige Test beweist, dass der Handler nicht aufgerufen wird. Hier laeuft
    derselbe Key ueber eine echte TCP-Verbindung, weil genau dort h11 die
    Headerkodierung macht. Faellt der Guard zurueck, baut der Client den Header,
    verbindet sich und bricht mit "Illegal header value b'Bearer <key>'" ab —
    die Meldung enthaelt den Key, und der Listener hat eine Verbindung gesehen.
    Zwei unabhaengige Signale, damit der Test nicht nur an einem haengt.
    """
    async def lauf() -> None:
        protokoll = {"verbindungen": 0, "anfragen": []}
        base_url, server = await _loopback_server(protokoll)
        try:
            for aufruf in ("list_models", "stream_chat"):
                with pytest.raises(AssistantError) as excinfo:
                    # wait_for: kehrt der Guard nicht zurueck, haengt der Test nicht.
                    await asyncio.wait_for(_echter_aufruf(aufruf, base_url, key), timeout=5.0)
                fehler = excinfo.value
                assert protokoll["verbindungen"] == 0, f"{aufruf}: Verbindung kam an"
                assert "API-Key" in str(fehler)
                assert _CANARY not in str(fehler)
                assert _CANARY not in repr(fehler)
                assert _CANARY not in "".join(
                    traceback.format_exception(type(fehler), fehler, fehler.__traceback__)
                )
        finally:
            server.close()
            await server.wait_closed()

    asyncio.run(lauf())


def test_gueltiger_key_erreicht_den_echten_socket_unveraendert():
    """Gegenprobe: die Straffung des Guards darf keinen echten Key aussperren.

    ``isascii() and isprintable()`` schliesst unter ASCII genau die
    Steuerzeichen C0/C1 aus — Zeichen, die in einem Headerwert nie gueltig sind
    und die kein Modell-Server in einen Key schreibt. Geprueft wird das am
    echten Socket gegen die rohen Bytes, die der Client wirklich sendet: ein
    Server, der einen solchen Key ausstellt, muss ihn unveraendert bekommen.
    """
    protokoll = {"verbindungen": 0, "anfragen": []}

    async def lauf() -> list[str]:
        base_url, server = await _loopback_server(protokoll)
        try:
            return await asyncio.wait_for(
                _echter_aufruf("list_models", base_url, _CANARY), timeout=5.0
            )
        finally:
            server.close()
            await server.wait_closed()

    assert asyncio.run(lauf()) == []
    assert protokoll["verbindungen"] == 1
    assert f"Authorization: Bearer {_CANARY}".encode() in protokoll["anfragen"][0]


async def _echter_aufruf(eintritt: str, base_url: str, key: str):
    if eintritt == "list_models":
        return await list_models(base_url=base_url, api_key=key)
    return [token async for token in
            stream_chat(base_url=base_url, api_key=key, model="m", messages=[])]


@pytest.mark.parametrize("pfad", ["models", "stream"])
def test_roher_upstream_text_ist_ueber_die_kette_nicht_erreichbar(pfad):
    """Re-Review Finding 2: ``from None`` loescht die Ausnahme nicht, nur die Anzeige.

    Die JSONDecodeError bleibt als __context__ in der Kette und traegt den
    kompletten Rohbody in .doc. str(), repr() und der Traceback zeigen ihn nicht —
    ein strukturierter Logger, der die Kette traversiert, schon. Geprueft wird
    deshalb die Kette als Kette, ueber __cause__ und __context__, und je Knoten
    str, repr, args und .doc. Dass die Meldung selbst noch die inhaltliche ist,
    wird mitgeprueft, sonst koennte der Test auch mit einer leeren Ausnahme gruen
    werden.
    """
    koerper = f'{{"error":"unauthorized: Bearer {_CANARY}"'.encode()
    aufruf = (
        (lambda: _models_mit(200, koerper)())
        if pfad == "models"
        else (lambda: _stream_mit(200, f'data: {{"choices":[{{"delta":"{_CANARY}"\n\n'.encode())())
    )

    with pytest.raises(AssistantError) as excinfo:
        asyncio.run(aufruf())

    kette = _rekursiv_ueber_die_kette(excinfo.value)
    assert "unerwartete Antwort" in str(excinfo.value)
    assert _CANARY not in str(excinfo.value)
    # Die Kette ist nicht leer und enthaelt weiterhin eine JSONDecodeError —
    # der Test darf nicht durch eine geaenderte Kettenform gruen werden.
    assert any(type(knoten).__name__ == "JSONDecodeError" for knoten in kette)
    for knoten in kette:
        rohtext = str(getattr(knoten, "doc", "") or "")
        assert _CANARY not in rohtext
        assert "unauthorized" not in rohtext
        assert all(_CANARY not in str(teil) for teil in knoten.args)
        assert _CANARY not in f"{knoten!r}"
        if type(knoten).__name__ == "JSONDecodeError":
            # Nicht "weg", sondern geleert: der Rohbody darf nicht mehr drinstehen.
            assert rohtext == ""


# --- Task 5: Router ------------------------------------------------------------


def test_sse_format():
    frame = _sse({"type": "token", "text": "Hi"})
    assert frame == 'data: {"type": "token", "text": "Hi"}\n\n'
    assert frame.endswith("\n\n")


_CHAT_REQUEST = ChatRequest(
    messages=[ChatMessage(role="user", content="Wie viel habe ich ausgegeben?")]
)
_KEY_GUARD_MELDUNG = "Der API-Key enthält Zeichen, die nicht übertragen werden können."
_ABGESCHNITTEN_MELDUNG = (
    "Die Verbindung zum Modell-Server wurde unterbrochen — die Antwort wurde "
    "abgeschnitten."
)


def _nie_aufgerufen(**kwargs):
    """Async-Generator, der nie laufen darf: als Beweisstelle fuer eine Vorpruefung."""
    raise AssertionError("stream_chat wurde aufgerufen, obwohl es nicht durfte")
    yield  # macht die Funktion erst zum Async-Generator


def _chat_frames(stream):
    """assistant_chat aufrufen und den Stream als SSE-Frames zurueckgeben.

    stream_chat wird im Router-Namespace ersetzt, nicht sein Transport: der
    Aufbau des HTTP-Requests ist Sache des Clients und in Task 4 getestet,
    hier zaehlt die Stelle, an der der Router den Fehler faengt.

    Patch und Iteration liegen in einem Block, weil event_stream ein
    Async-Generator ist: assistant_chat liefert nur die leere Huelle zurueck,
    der Rumpf laeuft erst beim Lesen von body_iterator — und loest dabei erst
    den Namen stream_chat auf.

    build_context laeuft bewusst ungepatcht: der Router schiebt sie per
    run_in_threadpool in einen Worker-Thread, und get_connection() oeffnet pro
    Aufruf eine eigene Verbindung. Die test_db-Fixture kann den Thread nicht
    wechseln (sqlite verbietet das), die autouse-Isolierung aus conftest.py
    lenkt den echten Pfad auf eine tmp-DB um -- das ist der Produktionsweg.
    """

    async def lauf() -> list[dict]:
        with patch.object(assistant_api, "stream_chat", stream):
            antwort = await assistant_api.assistant_chat(_CHAT_REQUEST)
            return [json.loads(rahmen[6:]) async for rahmen in antwort.body_iterator]

    return asyncio.run(lauf())


def test_chat_stromt_tokens_und_beendet_mit_done(mem_settings):
    ai_config.save_ai_config(enabled=True, model="llama3", api_key=_CANARY)

    async def stream(**kwargs):
        yield "Hallo"
        yield " Welt"

    assert _chat_frames(stream) == [
        {"type": "token", "text": "Hallo"},
        {"type": "token", "text": " Welt"},
        {"type": "done"},
    ]


def test_chat_meldet_einen_abgelehnten_key_als_terminales_event(mem_settings):
    """Der Key-Guard laeuft bei der ersten Iteration, nicht beim Aufruf.

    stream_chat ist ein Async-Generator: der Aufruf fuehrt keinen Zeilenteil des
    Rumpfes aus, das __anext__ der ersten Iteration dagegen schon. Ein
    try/except um den Aufruf herum wuerde eine abgelehnte Tastatur also nicht
    fangen — die AssistantError bräche aus dem Generator durch, mitten im bereits
    begonnenen Stream, ohne Event und ohne Moeglichkeit, den Statuscode zu
    aendern. Der Test belegt die richtige Stelle: der Fehler muss als letztes
    Event ankommen, und ein "done" darf es danach nicht mehr geben.
    """
    ai_config.save_ai_config(enabled=True, model="llama3", api_key=_NICHT_ASCII_CANARY)

    async def abgelehnt(**kwargs):
        raise AssistantError(_KEY_GUARD_MELDUNG)
        yield  # macht die Funktion erst zum Async-Generator

    frames = _chat_frames(abgelehnt)
    # Genau ein Frame, und er ist der Fehler: kein Token, kein "done" danach.
    assert frames == [{"type": "error", "message": _KEY_GUARD_MELDUNG}]


def test_chat_behaelt_tokens_und_meldet_das_abschneiden_als_terminales_event(mem_settings):
    """stream_chat liefert die empfangenen Tokens und meldet danach den Abbruch.

    Der Router darf sie nicht verwerfen — der Nutzer hat den Text schon gesehen —
    und darf es auch nicht als HTTP-Fehler behandeln: die StreamingResponse ist
    laengst mit Status 200 unterwegs. Der Abbruch kommt als letztes Event.
    """
    ai_config.save_ai_config(enabled=True, model="llama3", api_key=_CANARY)

    async def abgeschnitten(**kwargs):
        yield "Hallo"
        yield " Welt"
        raise AssistantError(_ABGESCHNITTEN_MELDUNG)

    frames = _chat_frames(abgeschnitten)
    assert [frame["text"] for frame in frames if frame["type"] == "token"] == [
        "Hallo",
        " Welt",
    ]
    assert frames[-1] == {"type": "error", "message": _ABGESCHNITTEN_MELDUNG}
    assert all(frame["type"] != "done" for frame in frames)


@pytest.mark.parametrize(
    "speicher",
    [{}, {"enabled": False, "model": "llama3"}, {"enabled": True, "model": ""}],
    ids=["standard", "aus", "ohne-modell"],
)
def test_chat_bricht_ohne_konfiguration_mit_400_ab(mem_settings, speicher):
    """Beide Seiten der Bedingung — und der Stream darf gar nicht erst starten.

    ``base_url`` steht bewusst nicht in der Liste: load_ai_config() faellt fuer
    jeden falsy Wert auf DEFAULT_BASE_URL zurueck, eine leere Base-URL gibt es
    nicht zu pruefen. ``_nie_aufgerufen`` ist die Beweisstelle fuer die
    Reihenfolge: faellt die Vorpruefung weg, kommt der Aufruf durch.
    """
    ai_config.save_ai_config(**speicher)

    with pytest.raises(HTTPException) as excinfo:
        _chat_frames(_nie_aufgerufen)

    assert excinfo.value.status_code == 400
    assert "nicht konfiguriert" in excinfo.value.detail


def test_config_antworten_enthalten_den_api_key_nicht(mem_settings):
    """Beide Antwortpfade der Config-Endpunkte, und zwar beide gerichtete.

    GET liest, PATCH schreibt und liest danach; der Key wird verschluesselt
    gespeichert. Ueber die Antwort darf er trotzdem nicht herauskommen — deshalb
    wird nicht nur der gespeicherte Wert geprueft, sondern das, was der Client
    tatsaechlich serialisiert bekommt. Der Allowlist-Assert unten verhindert,
    dass der Test auch mit einem zusaetzlichen Schluessel gruen wuerde.
    """
    gespeichert = assistant_api.update_assistant_config(
        AssistantConfigUpdate(
            enabled=True, base_url="http://x/v1", model="llama3", api_key=_CANARY
        )
    )
    gelesen = assistant_api.get_assistant_config()

    for antwort in (gespeichert, gelesen):
        assert _CANARY not in json.dumps(antwort)
        assert "api_key" not in antwort
    assert gespeichert == {
        "enabled": True,
        "base_url": "http://x/v1",
        "model": "llama3",
        "has_api_key": True,
        "configured": True,
    }
    assert gelesen == gespeichert


# --- Task-5-Review: POST /assistant/models -----------------------------------
#
# Die einzige Route, die einen Klartext-Key im Request-Body annimmt (Verbindung
# testen, bevor gespeichert wird), und bis hierher ohne jeden Test. Der Key wird
# nicht persistiert — er darf aber auch nicht in die Antwort wandern. Geprueft
# wird deshalb der vollstaendige serialisierte Body, nicht ein einzelnes Feld:
# {"models": ...} koennte morgen aus der geladenen Config gebaut sein und trotzdem
# einen Key enthalten.


def _models_antwort(list_models_stub, koerper: dict) -> httpx.Response:
    """POST /assistant/models ueber den echten ASGI-Stack.

    Kein Aufruf der Routenfunktion: die Beweisstelle ist die Serialisierung.
    Nur ueber FastAPI wird aus dem zurueckgegebenen dict ein HTTP-Body und aus
    dem HTTPException.detail ein JSON-Feld — dort erst waere ein Key sichtbar,
    und genau dort prueft der Test.

    list_models_stub wird im Router-Namespace ersetzt, nicht sein Transport: der
    Aufbau der HTTP-Anfrage ist Sache des Clients und in Task 4 getestet, hier
    zaehlt der Weg vom Request zur Antwort.
    """

    async def lauf() -> httpx.Response:
        app = FastAPI()
        app.include_router(assistant_api.router)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch.object(assistant_api, "list_models", list_models_stub):
                return await client.post("/assistant/models", json=koerper)

    return asyncio.run(lauf())


def test_models_liefert_die_liste_und_leakt_den_api_key_nicht(mem_settings):
    """Erfolgspfad: die Modelle kommen zurueck, der Klartext-Key nicht.

    Derselbe Canary liegt in der gespeicherten Config und im Request-Body, weil
    beide Wege in dieselbe Antwort laufen koennten. Ohne den gespeicherten Key
    waere eine Antwort, die aus der Config gebaut wird, hier gruen geblieben.
    """
    ai_config.save_ai_config(base_url="http://x/v1", model="llama3", api_key=_CANARY)
    gesendet: dict[str, str] = {}

    async def list_models_stub(*, base_url, api_key, **kwargs):
        gesendet.update(base_url=base_url, api_key=api_key)
        return ["llama3", "qwen"]

    antwort = _models_antwort(
        list_models_stub, {"base_url": "http://x/v1", "api_key": _CANARY}
    )

    assert antwort.status_code == 200
    # Gegenprobe: der Klartext-Key ist wirklich angekommen. Ohne sie koennte der
    # Canary-Assert auch gruen sein, weil der Key nirgends gelesen wurde.
    assert gesendet["api_key"] == _CANARY
    # Der ganze serialisierte Body, nicht das models-Feld. Steht bewusst vor den
    # Form-Asserts: der Key darf nicht herauskommen, unabhaengig davon, wie die
    # Antwort sonst aufgebaut ist.
    assert _CANARY not in antwort.text
    assert antwort.json() == {"models": ["llama3", "qwen"]}
    # Allowlist statt nur Abwesenheit: ein zusaetzlicher Schluessel faellt auf,
    # auch einer ohne den Key im Namen ("has_api_key", "modelle").
    assert set(antwort.json()) == {"models"}
    # Und er wird auch nicht persistiert: "testen ohne speichern" heisst genau das.
    assert _CANARY not in json.dumps(dict(mem_settings))


class _KeyInArgsError(AssistantError):
    """AssistantError, deren str() den Key nicht zeigt und deren repr() schon.

    Genau der Unterschied, an dem ``detail=str(err)`` unauffaellig bleibt und
    ``detail=repr(err)`` den Key in die HTTP-Antwort traegt. Der Key steckt in
    args — dort, wo ihn eine AssistantError aus einem fremden Client auch haben
    koennte, ohne dass str() etwas anzeigt.
    """

    def __str__(self) -> str:
        return "Modell-Server antwortete mit 401"


_UPSSTREAM_FEHLER = {
    # Der Normalfall: die Form, die der Client heute liefert.
    "einfach": lambda: AssistantError("Modell-Server antwortete mit 401"),
    # Der Fall aus dem Review: ein detail=repr(err) zeigt den Key, str(err) nicht.
    "key-in-args": lambda: _KeyInArgsError(
        f"Modell-Server antwortete mit 401 (Key: {_CANARY})"
    ),
}


@pytest.mark.parametrize("fehler", _UPSSTREAM_FEHLER.values(), ids=list(_UPSSTREAM_FEHLER))
def test_models_meldet_upstream_fehler_als_502_und_leakt_den_api_key_nicht(mem_settings, fehler):
    """AssistantError -> 502, und der Body nennt weder den Key noch die Exception.

    Status und Inhalt des details werden mitgeprueft: eine 502 mit leerem oder
    generischem detail koennte den Key nicht zeigen und der Test waere trotzdem
    gruen. Der Key steckt in der zweiten Variante in args, also genau dort, wo er
    bei einem Wechsel auf repr(err) sichtbar wuerde.
    """
    ai_config.save_ai_config(base_url="http://x/v1", model="llama3", api_key=_CANARY)

    async def list_models_stub(*, base_url, api_key, **kwargs):
        raise fehler()

    antwort = _models_antwort(
        list_models_stub, {"base_url": "http://x/v1", "api_key": _CANARY}
    )

    assert antwort.status_code == 502
    assert "401" in antwort.json()["detail"]
    assert _CANARY not in antwort.text


def test_models_lehnt_eine_nur_aus_leerzeichen_bestehende_base_url_ab(mem_settings):
    """Whitespace-only ist truthy, strip() macht "" daraus — und "/models" ist
    keine gueltige URL. Der Aufruf scheitert dann an einer Meldung ueber das
    fehlende http://-Protokoll, die dem Nutzer nicht sagt, was er tippen soll.

    Stattdessen 400 mit Klartext, und list_models wird gar nicht erst aufgerufen.
    """
    aufgerufen: list[str] = []

    async def list_models_stub(*, base_url, api_key, **kwargs):
        aufgerufen.append(base_url)
        return []

    antwort = _models_antwort(list_models_stub, {"base_url": "   ", "api_key": _CANARY})

    assert antwort.status_code == 400
    assert aufgerufen == []
    assert "Base-URL" in antwort.json()["detail"]
    assert _CANARY not in antwort.text
