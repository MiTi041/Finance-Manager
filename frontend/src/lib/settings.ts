import { getApiBaseUrl, parseJsonResponse } from "./api";

export type AppSettings = {
  hide_pending_transactions: boolean;
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const response = await fetch(`${getApiBaseUrl()}/db/settings`);
  return parseJsonResponse(response, "Einstellungen konnten nicht geladen werden");
}

export async function updateAppSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  const response = await fetch(`${getApiBaseUrl()}/db/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response, "Einstellung konnte nicht gespeichert werden");
}
