"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  FINTS_SYNC_REQUEST_EVENT,
  FINTS_SYNC_STATUS_EVENT,
  type FintsSyncSource,
  type FintsSyncStatusDetail,
} from "@/lib/sync-events";
import { fetchLatestDbTransaction } from "@/lib/transactions";
import { fetchBankCredentials } from "@/lib/bank/credentials";
import { importFromFintsServer, RateLimitError } from "@/lib/upload-helper";
import { getErrorMessage } from "@/lib/utils/error";
import { dispatchRefresh } from "@/lib/refresh-store";

const FALLBACK_SYNC_DAYS = Number(
  import.meta.env.VITE_FINTS_DAYS ?? "730",
);
const MAX_SYNC_DAYS = Number(
  import.meta.env.VITE_FINTS_MAX_DAYS ?? "36500",
);
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

declare global {
  interface Window {
    __fintsSyncInProgress?: boolean;
  }
}

export default function FintsAutoSync() {
  useEffect(() => {
    const runSync = async (source: FintsSyncSource) => {
      if (window.__fintsSyncInProgress) return;

      window.__fintsSyncInProgress = true;
      emitSyncStatus(source, true);

      try {
        const banksToSync = await fetchBankCredentials().catch(() => []);

        if (banksToSync.length === 0) {
          const daysToSync = await getDaysToSync();
          await importFromFintsServer(
            (percent) => {
              emitSyncStatus(source, true, {
                message: `Synchronisiere Daten... ${percent}%`,
              });
            },
            daysToSync,
            (visible) => {
              if (visible) {
                emitSyncStatus(source, true, {
                  message: "Warte auf TAN-Freigabe...",
                });
                return;
              }
            },
          );
          rememberSyncRun(daysToSync);
        } else {
          for (const bank of banksToSync) {
            try {
              const accountIbans =
                bank.accounts
                  ?.map((account) => account.iban)
                  .filter((iban): iban is string => Boolean(iban)) ?? [];
              const fallbackIban = bank.account_iban ? [bank.account_iban] : [];
              const daysToSync = await getDaysToSync(
                accountIbans.length > 0 ? accountIbans : fallbackIban,
              );
              emitSyncStatus(source, true, {
                message: `Synchronisiere ${bank.bank_name || bank.account_name || bank.username || bank.scope}`,
                scope: bank.scope,
              });

              await importFromFintsServer(
                (percent) => {
                  emitSyncStatus(source, true, {
                    message: `Synchronisiere ${bank.bank_name || bank.account_name || bank.username || bank.scope}... ${percent}%`,
                    scope: bank.scope,
                  });
                },
                daysToSync,
                (visible) => {
                  if (visible) {
                    emitSyncStatus(source, true, {
                      message: `Warte auf TAN für ${bank.bank_name || bank.account_name || bank.username || bank.scope}...`,
                      scope: bank.scope,
                    });
                    return;
                  }
                },
                { scope: bank.scope },
              );
              rememberSyncRun(daysToSync);
            } catch (error) {
              console.error(
                `Sync fehlgeschlagen für ${bank.bank_name || bank.account_name || bank.username || bank.scope}`,
                error,
              );
              if (error instanceof RateLimitError) {
                toast.error(error.message);
              } else {
                toast.error(
                  `Sync fehlgeschlagen für ${bank.bank_name || bank.account_name || bank.username || bank.scope}`,
                );
              }
            }
          }
        }

        dispatchRefresh();
      } catch (error) {
        if (error instanceof RateLimitError) {
          toast.error(error.message);
        } else {
          toast.error(`Sync fehlgeschlagen: ${getErrorMessage(error)}`);
        }
        console.error(error);
      } finally {
        window.__fintsSyncInProgress = false;
        emitSyncStatus(source, false);
      }
    };

    const isAutoSyncDue = () => {
      try {
        const syncRaw = window.localStorage.getItem("fintsSyncCache");
        if (!syncRaw) return true;

        const parsed = JSON.parse(syncRaw);
        const syncedAt = Number(
          parsed?.syncedAt ??
            parsed?.synced_at ??
            parsed?.syncedAtMs ??
            parsed?.lastSynced,
        );
        if (!Number.isFinite(syncedAt) || syncedAt <= 0) return true;

        return Date.now() - syncedAt >= AUTO_SYNC_INTERVAL_MS;
      } catch {
        return true;
      }
    };

    const onManualSyncRequest = () => {
      void runSync("manual");
    };

    window.addEventListener(FINTS_SYNC_REQUEST_EVENT, onManualSyncRequest);

    const autoSyncIfNeeded = () => {
      if (!isAutoSyncDue()) {
        return;
      }

      void runSync("auto");
    };

    autoSyncIfNeeded();
    const interval = window.setInterval(
      autoSyncIfNeeded,
      AUTO_SYNC_INTERVAL_MS,
    );

    return () => {
      window.removeEventListener(FINTS_SYNC_REQUEST_EVENT, onManualSyncRequest);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

function emitSyncStatus(
  source: FintsSyncSource,
  running: boolean,
  extra?: Partial<FintsSyncStatusDetail>,
) {
  window.dispatchEvent(
    new CustomEvent<FintsSyncStatusDetail>(FINTS_SYNC_STATUS_EVENT, {
      detail: { running, source, ...extra },
    }),
  );
}

function rememberSyncRun(days: number) {
  try {
    localStorage.setItem(
      "fintsSyncCache",
      JSON.stringify({ syncedAt: Date.now(), days }),
    );
  } catch {
    // ignore storage write errors
  }
}

function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") return null;

  if (value.includes("T") || value.includes("-")) {
    const iso = new Date(value);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  const [day, month, year] = value.split(".");
  if (!day || !month || !year) return null;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getDaysToSync(accountIbans?: string[]): Promise<number> {
  const fallback = Number.isFinite(FALLBACK_SYNC_DAYS)
    ? FALLBACK_SYNC_DAYS
    : 730;
  const cap = Number.isFinite(MAX_SYNC_DAYS) ? MAX_SYNC_DAYS : 36500;
  const minimumDays = Math.max(1, Math.min(cap, fallback));

  const cleanedIbans = (accountIbans ?? [])
    .map((iban) => iban?.trim())
    .filter((iban): iban is string => Boolean(iban));
  if (cleanedIbans.length === 0) {
    return minimumDays;
  }

  const latestDates = await Promise.all(
    cleanedIbans.map((iban) =>
      fetchLatestDbTransaction(iban).catch(() => null),
    ),
  );

  const parsedDates = latestDates
    .map((latest) => {
      if (!latest) return null;

      return (
        parseFlexibleDate((latest as { entry_date?: unknown }).entry_date) ??
        parseFlexibleDate((latest as { date?: unknown }).date) ??
        parseFlexibleDate((latest as { created_at?: unknown }).created_at)
      );
    })
    .filter(Boolean) as Date[];

  if (parsedDates.length === 0) {
    return minimumDays;
  }

  const oldestRelevantDate = parsedDates.reduce((oldest, current) =>
    current.getTime() < oldest.getTime() ? current : oldest,
  );

  const today = new Date();
  const start = new Date(
    oldestRelevantDate.getFullYear(),
    oldestRelevantDate.getMonth(),
    oldestRelevantDate.getDate(),
  );
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  return Math.max(1, Math.min(cap, diffDays));
}
