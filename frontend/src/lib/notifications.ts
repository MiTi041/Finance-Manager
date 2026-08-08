import { getApiBaseUrl, parseJsonResponse } from "./api";

export async function fetchNotifications(): Promise<{ email: string }> {
  const response = await fetch(`${getApiBaseUrl()}/notifications`);
  return parseJsonResponse(response);
}

export async function updateNotifications(email: string): Promise<{ email: string }> {
  const response = await fetch(`${getApiBaseUrl()}/notifications`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return parseJsonResponse(response);
}