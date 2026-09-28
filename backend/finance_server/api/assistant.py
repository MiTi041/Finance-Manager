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
    # Nur der gespeicherte Wert faellt auf DEFAULT_BASE_URL zurueck. Ein
    # Body-Feld aus reinen Leerzeichen ist dagegen truthy und wird hier erst zu
    # "" — ohne diese Pruefung kaeme unten "/models" heraus, und die Meldung
    # spräche vom fehlenden http://-Protokoll statt vom leeren Feld.
    base_url = (payload.base_url or config["base_url"]).strip()
    if not base_url:
        raise HTTPException(status_code=400, detail="Die Base-URL darf nicht leer sein.")
    api_key = payload.api_key if payload.api_key is not None else config["api_key"]
    try:
        models = await list_models(base_url=base_url, api_key=api_key)
    except AssistantError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err
    return {"models": models}


@router.post("/assistant/chat")
async def assistant_chat(payload: ChatRequest) -> StreamingResponse:
    # base_url kann nie leer sein: load_ai_config() fällt auf DEFAULT_BASE_URL zurück.
    config = load_ai_config()
    if not config["enabled"] or not config["model"].strip():
        raise HTTPException(status_code=400, detail="KI ist nicht konfiguriert")

    context = await run_in_threadpool(build_context, payload.date_from, payload.date_to)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": build_system_prompt(context)}
    ]
    messages += [{"role": message.role, "content": message.content} for message in payload.messages]

    async def event_stream() -> AsyncIterator[str]:
        # stream_chat ist ein Async-Generator: der Aufruf führt keinen Teil des
        # Rumpfes aus, erst die Iteration. Ein try/except um den Aufruf herum fängt
        # deshalb weder einen abgelehnten API-Key noch den Abbruch ohne [DONE] —
        # die stehen in der __anext__-Schleife, und die beginnt hier schon.
        # Beides kommt als Event: die StreamingResponse ist unterwegs, ein
        # HTTPException hier käme nicht mehr an.
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
