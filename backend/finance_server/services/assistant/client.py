from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx
from fastapi.concurrency import run_in_threadpool

from finance_server.services.assistant.tools import TOOL_SCHEMAS, execute_tool

MAX_TOOL_ROUNDS = 5


class AssistantError(Exception):
    """Fehler bei der Kommunikation mit dem lokalen Modell-Server."""


_UNERWARTETE_ANTWORT = (
    "Der Modell-Server hat eine unerwartete Antwort gesendet. Läuft dort wirklich "
    "ein OpenAI-kompatibler Modell-Server?"
)


def _authorization(api_key: str) -> dict[str, str]:
    """Authorization-Header bauen — leer, wenn kein Key konfiguriert ist.

    Der Wert landet ungefiltert in einer Exception, sobald die Kodierung scheitert,
    deshalb wird er hier geprüft statt in httpx: httpx kodiert Header als ASCII und
    wirft UnicodeEncodeError, dessen repr() den kompletten Key enthält.

    Umkodiert wird nicht — ein umkodierter Key ist ein anderer Key, den der Server
    nicht authentifizieren kann, und ein 401 darauf ist schwerer zu deuten als eine
    klare Meldung. Nicht-ASCII wird deshalb abgelehnt, bevor eine Anfrage rausgeht.
    Umgebender Whitespace wird getrimmt, der kommt beim Einfügen aus der Zwischenablage.

    strip() räumt nur die Ränder. Ein Key aus einem Mehrzeilen-Paste (zwei
    eingefügte Keys, eine umbrochene Zeile) behält innen seinen Zeilenumbruch, und
    den lehnt h11 erst beim Senden ab — mit dem kompletten Headerwert in der
    eigenen Fehlermeldung. Deshalb wird zusätzlich gefordert, dass der Key
    druckbar ist: Steuerzeichen innen sind in einem Headerwert nie gültig, und
    ASCII-Steuerzeichen kann ein Server nicht ausstellen.
    """
    key = api_key.strip()
    if not key:
        return {}
    # isascii() statt encode(): ein except-Block hier haette die UnicodeEncodeError
    # mit dem Key im repr() als __context__ an die AssistantError gehaengt.
    if not key.isascii() or not key.isprintable():
        raise AssistantError(
            "Der API-Key enthält Zeichen, die nicht übertragen werden können "
            "(z. B. Umlaute, typografische Anführungszeichen oder ein Zeilenumbruch "
            "in der eingefügten Zeile). Bitte den Key noch einmal einfügen."
        )
    return {"Authorization": f"Bearer {key}"}


def _als_dict(value: Any) -> dict[str, Any]:
    """JSON-Objekt erzwingen — alles andere ist ein Protokollbruch des Servers."""
    if not isinstance(value, dict):
        raise AssistantError(_UNERWARTETE_ANTWORT)
    return value


def _delta_events(frame: str) -> list[dict[str, Any]]:
    """Einen SSE-Frame in Token-/Tool-Call-Events uebersetzen.

    Liefert eine (ggf. leere) Liste: Text-Deltas werden sofort als ``token``
    gemeldet, Tool-Call-Fragmente gesammelt der Aufrufer. ``index`` ordnet die
    Fragmente mehrerer Tool-Calls einander zu.
    """
    try:
        chunk = json.loads(frame)
    except json.JSONDecodeError as err:
        # ``from None`` unterdrueckt nur die Anzeige: das Objekt bleibt als
        # __context__ erreichbar und .doc traegt den kompletten Rohbody des
        # Servers. Genau den Text, der dort zurueckgespielt wird, will die
        # Fehlermeldung nicht mehr preisgeben — er wird hier geleert.
        err.doc = ""
        raise AssistantError(_UNERWARTETE_ANTWORT) from None

    choices = _als_dict(chunk).get("choices")
    if choices is None:
        return []
    if not isinstance(choices, list):
        raise AssistantError(_UNERWARTETE_ANTWORT)
    if not choices:
        return []

    delta = _als_dict(choices[0]).get("delta")
    if delta is None:
        return []
    delta = _als_dict(delta)

    events: list[dict[str, Any]] = []
    content = delta.get("content")
    if isinstance(content, str) and content:
        events.append({"type": "token", "text": content})

    tool_calls = delta.get("tool_calls")
    if isinstance(tool_calls, list):
        for raw_call in tool_calls:
            call = _als_dict(raw_call)
            index = call.get("index")
            index = index if isinstance(index, int) else 0
            function = call.get("function")
            function = function if isinstance(function, dict) else {}
            events.append(
                {
                    "type": "tool_call_delta",
                    "index": index,
                    "id": call.get("id") if isinstance(call.get("id"), str) else "",
                    "name": function.get("name") if isinstance(function.get("name"), str) else "",
                    "arguments": (
                        function.get("arguments")
                        if isinstance(function.get("arguments"), str)
                        else ""
                    ),
                }
            )
    return events


def _merge_tool_call(calls: dict[int, dict[str, Any]], delta: dict[str, Any]) -> None:
    slot = calls.setdefault(delta["index"], {"id": "", "name": "", "arguments": ""})
    if delta["id"]:
        slot["id"] = delta["id"]
    if delta["name"]:
        slot["name"] = delta["name"]
    slot["arguments"] += delta["arguments"]


def _nicht_erreichbar(err: httpx.HTTPError) -> AssistantError:
    """Netzwerkfehler in eine AssistantError mit nie leerer Meldung übersetzen.

    httpx-Timeout-Ausnahmen tragen eine leere Meldung: httpcore wirft TimeoutError
    ohne Argument, und httpx reicht str(err) durch. Ohne eigenen Zweig stünde im
    Frontend nur "KI nicht erreichbar: " ohne Text. Der Fallback deckt die übrigen
    leeren Fälle (z. B. ReadError aus einem abgerissenen Stream) ab.
    """
    if isinstance(err, httpx.TimeoutException):
        return AssistantError("KI nicht erreichbar: Zeitüberschreitung")
    detail = str(err) or "Verbindung unterbrochen"
    return AssistantError(f"KI nicht erreichbar: {detail}")


async def stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    think: bool | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Eine Upstream-Runde gegen den Modell-Server.

    ``think=False`` schaltet das Denken ab (reasoning_effort "none"); None/True
    überlässt es dem Modell-Default. Ollama und vLLM verstehen das Feld,
    Modelle ohne Denkmodus ignorieren es.

    Ergibt ``{"type": "token", "text": ...}``-Events, sobald Text eintrifft, und
    als Abschluss genau ein ``{"type": "tool_calls", "calls": [...]}``-Event
    (leere Liste, wenn das Modell kein Werkzeug anfordert).
    """
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json", **_authorization(api_key)}
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if tools:
        payload["tools"] = tools
    if think is False:
        payload["reasoning_effort"] = "none"
    # Read-Timeout grosszuegig: laedt der lokale Server ein grosses oder
    # denkendes Modell (z. B. Qwen3.5) erst in den RAM, kommt vor dem ersten
    # Token laenger nichts — 60s rissen dort ab. Waehrend des Streams setzt jeder
    # Token den Timer zurueck, das Limit greift also nur bei echten Pausen.
    timeout = httpx.Timeout(180.0, connect=10.0)
    abgeschlossen = False
    calls: dict[int, dict[str, Any]] = {}

    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            async with client.stream(
                "POST", url, json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    # Kein Body im Text: der Server kann den Authorization-Header im
                    # eigenen Fehlertext wiederholen, dann landet der Key in der
                    # Fehlermeldung und von dort im Log und in der Antwort.
                    raise AssistantError(
                        f"Modell-Server antwortete mit {response.status_code}. Der "
                        "Inhalt der Antwort wird nicht angezeigt, weil er den API-Key "
                        "enthalten könnte. Bitte Base-URL und API-Key prüfen."
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if data == "[DONE]":
                        abgeschlossen = True
                        break
                    if not data:
                        continue
                    for event in _delta_events(data):
                        if event["type"] == "token":
                            yield event
                        else:
                            _merge_tool_call(calls, event)
    except httpx.HTTPError as err:
        raise _nicht_erreichbar(err) from err

    # Die bereits ausgelieferten Tokens bleiben beim Aufrufer; ohne [DONE] ist die
    # Antwort aber unvollständig, und eine unerkennte Endlosschleife sieht im
    # Frontend aus wie eine fertige Antwort.
    if not abgeschlossen:
        raise AssistantError(
            "Die Verbindung zum Modell-Server wurde unterbrochen — die Antwort wurde "
            "abgeschnitten."
        )

    yield {"type": "tool_calls", "calls": [calls[index] for index in sorted(calls)]}


def _parse_arguments(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def run_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    think: bool | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Vollstaendiger Agent-Loop mit Function-Calling.

    Oeffentliche Events: ``token`` (Text), ``tool`` (Status fuer die Oberflaeche)
    und ``done``. Nach ``MAX_TOOL_ROUNDS`` folgt eine letzte Runde ohne ``tools``,
    damit das Modell garantiert eine Antwort formuliert.
    """
    convo = list(messages)

    for _ in range(MAX_TOOL_ROUNDS):
        calls: list[dict[str, Any]] = []
        text_ausgegeben = False
        async for event in stream_chat(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=convo,
            tools=TOOL_SCHEMAS,
            think=think,
            transport=transport,
        ):
            if event["type"] == "token":
                yield event
                text_ausgegeben = True
            else:
                calls = event["calls"]
        if not calls:
            yield {"type": "done"}
            return

        # Nach einem Werkzeugaufruf setzt das Modell wie in einem neuen Turn an:
        # sein erster Token traegt keine fuehrende Leerstelle. Ohne Trenner klebte
        # die Erzaehlung davor ("Ich pruefe jetzt ... Monat.") am Ergebnis danach
        # ("...Monat.Die Ausgaben ..."). Ein Absatz passt, weil das Modell erst
        # nach den Werkzeugergebnissen neu formuliert.
        if text_ausgegeben:
            yield {"type": "token", "text": "\n\n"}

        convo.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call["id"],
                        "type": "function",
                        "function": {"name": call["name"], "arguments": call["arguments"]},
                    }
                    for call in calls
                ],
            }
        )
        for call in calls:
            yield {"type": "tool", "name": call["name"], "arguments": call["arguments"]}
            result = await run_in_threadpool(
                execute_tool, call["name"], _parse_arguments(call["arguments"])
            )
            convo.append({"role": "tool", "tool_call_id": call["id"], "content": result})

    async for event in stream_chat(
        base_url=base_url,
        api_key=api_key,
        model=model,
        messages=convo,
        tools=None,
        think=think,
        transport=transport,
    ):
        if event["type"] == "token":
            yield event

    yield {"type": "done"}


async def list_models(
    *,
    base_url: str,
    api_key: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    url = f"{base_url.rstrip('/')}/models"
    headers = _authorization(api_key)
    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as err:
        raise _nicht_erreichbar(err) from err

    if response.status_code != 200:
        raise AssistantError(f"Modell-Server antwortete mit {response.status_code}")

    try:
        payload = response.json()
    except json.JSONDecodeError as err:
        # Siehe _delta_events: ``from None`` loescht das Ausnahmeobjekt nicht,
        # nur seine Anzeige. Ohne das Leeren haelt die Kette den Rohbody.
        err.doc = ""
        raise AssistantError(_UNERWARTETE_ANTWORT) from None

    data = _als_dict(payload).get("data")
    if not isinstance(data, list):
        # Auch fehlendes oder null "data": eine leere Liste waere fuer den
        # Nutzer ein totes Auswahlfeld ohne erkennbare Ursache.
        raise AssistantError(_UNERWARTETE_ANTWORT)
    modelle: list[str] = []
    for item in data:
        model_id = _als_dict(item).get("id")
        if isinstance(model_id, str) and model_id:
            modelle.append(model_id)
    return modelle
