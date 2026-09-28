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
  think?: boolean;
  onEvent: (event: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages,
      think: params.think,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "KI-Anfrage fehlgeschlagen");
  }
  if (!response.body) throw new Error("Keine Antwort vom Server");

  // Nicht parseJsonResponse: das würde response.body konsumieren und der
  // Stream stünde danach nicht mehr zur Verfügung.
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
