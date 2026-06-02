export const FINTS_SYNC_REQUEST_EVENT = "fints-sync-request";
export const FINTS_SYNC_STATUS_EVENT = "fints-sync-status";

export type FintsSyncSource = "auto" | "manual";

export type FintsSyncStatusDetail = {
  running: boolean;
  source: FintsSyncSource;
  message?: string;
  scope?: string;
};
