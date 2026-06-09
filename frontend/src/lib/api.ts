const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? DEFAULT_API_BASE_URL;
}

import { fetchCachedJson } from "./fetch-cache";

export async function parseJsonResponse(response: Response, fallbackMessage?: string) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.detail?.message ??
        payload?.detail ??
        payload?.message ??
        fallbackMessage ??
        "Anfrage fehlgeschlagen",
    );
  }

  return payload;
}

export async function fetchCachedResource<T>(
  key: string,
  urlPath: string,
  extract: (payload: any) => T,
  options?: { forceRefresh?: boolean },
): Promise<T> {
  return fetchCachedJson({
    key,
    forceRefresh: options?.forceRefresh,
    fetcher: async () => {
      const response = await fetch(`${getApiBaseUrl()}${urlPath}`);
      const payload = await parseJsonResponse(response);
      return extract(payload);
    },
  });
}
