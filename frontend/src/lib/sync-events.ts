export const FINTS_SYNC_REQUEST_EVENT = "fints-sync-request";
export const FINTS_SYNC_STATUS_EVENT = "fints-sync-status";

export type FintsSyncSource = "auto" | "manual";

export type FintsSyncRequestDetail = {
  /** Ziel-Bank (scope). Fehlt/leer = alle Banken syncen. */
  scope?: string;
};

export type FintsSyncStatusDetail = {
  running: boolean;
  source: FintsSyncSource;
  message?: string;
  scope?: string;
};

export function emitSyncRequest(scope?: string) {
  window.dispatchEvent(
    new CustomEvent<FintsSyncRequestDetail>(FINTS_SYNC_REQUEST_EVENT, {
      detail: scope ? { scope } : undefined,
    }),
  );
}
