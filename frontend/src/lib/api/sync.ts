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
  last_sync_at: string | null;
  pending_push: number;
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

export async function recoverSync(password: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/sync/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await parseJsonResponse(response);
}

export function pollSyncStatus(
  intervalMs: number,
  onTick: (status: SyncStatus) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  const poll = async () => {
    if (cancelled) return;
    try {
      const status = await getSyncStatus();
      if (cancelled) return;
      onTick(status);
      if (status.configured && status.pending_push === 0) {
        onDone();
        return;
      }
    } catch (err) {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    }
    if (!cancelled) {
      timeoutId = setTimeout(poll, intervalMs);
    }
  };

  poll();
  return () => {
    cancelled = true;
    clearTimeout(timeoutId);
  };
}
