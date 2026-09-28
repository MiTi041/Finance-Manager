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
