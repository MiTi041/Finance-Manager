from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx


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


def _token_aus_frame(frame: str) -> str:
    """Ein SSE-Frame zu einem Token; leer bedeutet "Frame ohne Text"."""
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
        return ""
    if not isinstance(choices, list):
        raise AssistantError(_UNERWARTETE_ANTWORT)
    if not choices:
        return ""
    delta = _als_dict(choices[0]).get("delta")
    if delta is None:
        return ""
    content = _als_dict(delta).get("content")
    return content if isinstance(content, str) else ""


async def stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[str]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json", **_authorization(api_key)}
    payload = {"model": model, "messages": messages, "stream": True}
    timeout = httpx.Timeout(60.0, connect=10.0)
    abgeschlossen = False

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
                    token = _token_aus_frame(data)
                    if token:
                        yield token
    except httpx.HTTPError as err:
        raise AssistantError(f"KI nicht erreichbar: {err}") from err

    # Die bereits ausgelieferten Tokens bleiben beim Aufrufer; ohne [DONE] ist die
    # Antwort aber unvollständig, und eine unerkennte Endlosschleife sieht im
    # Frontend aus wie eine fertige Antwort.
    if not abgeschlossen:
        raise AssistantError(
            "Die Verbindung zum Modell-Server wurde unterbrochen — die Antwort wurde "
            "abgeschnitten."
        )


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
        raise AssistantError(f"KI nicht erreichbar: {err}") from err

    if response.status_code != 200:
        raise AssistantError(f"Modell-Server antwortete mit {response.status_code}")

    try:
        payload = response.json()
    except json.JSONDecodeError as err:
        # Siehe _token_aus_frame: ``from None`` loescht das Ausnahmeobjekt nicht,
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
