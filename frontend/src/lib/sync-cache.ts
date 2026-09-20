const FINTS_SYNC_CACHE_KEY = "fintsSyncCache";
const FINTS_COOLDOWN_KEY = "fintsSyncCooldowns";

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

export function readSyncCooldown(scope: string): number {
  try {
    const raw = window.localStorage.getItem(FINTS_COOLDOWN_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const until = Number(parsed?.[scope]);
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
}

export function setSyncCooldown(scope: string, durationMs: number): void {
  try {
    const raw = window.localStorage.getItem(FINTS_COOLDOWN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[scope] = Date.now() + durationMs;
    window.localStorage.setItem(FINTS_COOLDOWN_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage write errors
  }
}
