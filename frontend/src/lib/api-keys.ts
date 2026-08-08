import { getApiBaseUrl, parseJsonResponse } from "./api";

export type ExternalKeys = {
  resend_api_key: string;
  resend_from: string;
  hunter_logo_key: string;
};

export async function fetchExternalKeys(): Promise<ExternalKeys> {
  const response = await fetch(`${getApiBaseUrl()}/keys`);
  return parseJsonResponse(response);
}

export async function updateExternalKeys(
  payload: Partial<ExternalKeys>,
): Promise<ExternalKeys> {
  const response = await fetch(`${getApiBaseUrl()}/keys`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}
