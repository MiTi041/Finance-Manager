const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

import { fetchCachedJson } from "./fetch-cache";

function toErrorMessage(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map(toErrorMessage).filter(Boolean).join("; ");
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return toErrorMessage(obj.message ?? obj.msg ?? JSON.stringify(val));
  }
  return String(val);
}

export async function parseJsonResponse(response: Response, fallbackMessage?: string) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      toErrorMessage(payload?.detail) ||
        toErrorMessage(payload?.message) ||
        fallbackMessage ||
        "Anfrage fehlgeschlagen",
    );
  }

  return payload;
}

export function createAbortableFetch(signal?: AbortSignal) {
  return (url: string, init?: RequestInit) =>
    fetch(url, { ...init, signal });
}

export async function fetchCachedResource<T>(
  key: string,
  urlPath: string,
  extract: (payload: any) => T,
  options?: { forceRefresh?: boolean; signal?: AbortSignal },
): Promise<T> {
  return fetchCachedJson({
    key,
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(`${getApiBaseUrl()}${urlPath}`, { signal: options?.signal });
      const payload = await parseJsonResponse(response);
      return extract(payload);
    },
  });
}

export class AbortError extends Error {
  constructor() {
    super("Request aborted");
    this.name = "AbortError";
  }
}
