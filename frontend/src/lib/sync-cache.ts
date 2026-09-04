const FINTS_SYNC_CACHE_KEY = "fintsSyncCache";

export type FintsSyncCache = {
  syncedAt: number;
  days?: number;
  scopes?: Record<string, number>;
};

export function readFintsSyncCache(): FintsSyncCache | null {
  try {
    const raw = window.localStorage.getItem(FINTS_SYNC_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawTimestamp =
      parsed?.syncedAt ?? parsed?.synced_at ?? parsed?.syncedAtMs ?? parsed?.lastSynced;
    const syncedAt = Number(rawTimestamp);
    if (!Number.isFinite(syncedAt) || syncedAt <= 0) return null;

    const scopes: Record<string, number> = {};
    const rawScopes = parsed?.scopes;
    if (rawScopes && typeof rawScopes === "object") {
      for (const [scope, value] of Object.entries(rawScopes as Record<string, unknown>)) {
        const ts = Number(value);
        if (scope && Number.isFinite(ts) && ts > 0) {
          scopes[scope] = ts;
        }
      }
    }

    const days = Number(parsed?.days);
    return {
      syncedAt,
      ...(Number.isFinite(days) ? { days } : {}),
      scopes,
    };
  } catch {
    return null;
  }
}

export function rememberSyncRun(days: number, scope?: string | null) {
  const now = Date.now();
  const existing = readFintsSyncCache();
  const scopes = { ...(existing?.scopes ?? {}) };
  if (scope) {
    scopes[scope] = now;
  }

  const payload: FintsSyncCache = { syncedAt: now, days, scopes };
  try {
    window.localStorage.setItem(FINTS_SYNC_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write errors
  }
}
