import { getApiBaseUrl, parseJsonResponse } from "@/lib/api";

export interface SyncSetupRequest {
  password: string;
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_bucket: string;
}

export interface SyncStatus {
  configured: boolean;
  running: boolean;
  device_id: string;
  key_id: string | null;
  r2_bucket: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const response = await fetch(`${getApiBaseUrl()}/sync/status`);
  return parseJsonResponse(response);
}

export async function setupSync(config: SyncSetupRequest): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/sync/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  await parseJsonResponse(response);
}

export async function triggerSync(): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/sync/trigger`, { method: "POST" });
  await parseJsonResponse(response);
}

export async function clearSync(): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/sync/config`, { method: "DELETE" });
  await parseJsonResponse(response);
}
