from __future__ import annotations

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    # None = Modell-Default. False = Denken abschalten (reasoning_effort "none").
    think: bool | None = None


class AssistantConfigUpdate(BaseModel):
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None


class ModelsRequest(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
