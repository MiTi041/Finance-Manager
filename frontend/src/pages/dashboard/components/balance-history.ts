import { format } from "date-fns";

import type { Transaction } from "@/types/transaction";

export type BalancePoint = {
  /** ISO day key (yyyy-MM-dd), used for slicing/sorting. */
  _sortKey: string;
  value: number;
};

function dayKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysBetween(start: Date, end: Date) {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86400000);
}

/**
 * Running account balance over the full transaction history.
 *
 * The series is anchored so its last point equals `anchorBalance` (the balance
 * the app currently knows). For a manual account without a bank balance the
 * anchor equals the transaction sum, so the series starts at 0 — the account is
 * assumed to have started empty.
 */
export function buildBalanceHistory(
  transactions: Transaction[],
  anchorBalance: number | null = null,
): BalancePoint[] {
  if (transactions.length === 0) return [];

  let minDate = new Date();
  let maxDate = new Date(0);
  for (const t of transactions) {
    if (!t.daten.buchungsdatum) continue;
    const d = new Date(t.daten.buchungsdatum);
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }
  if (maxDate.getTime() === 0) return [];

  const start = startOfLocalDay(minDate);
  const end = startOfLocalDay(maxDate);
  const buckets: Record<string, number> = {};
  // ponytail: build each day from calendar parts; setDate() drifts an hour
  // across DST and silently drops the last day.
  for (let i = 0; i <= daysBetween(start, end); i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    buckets[dayKey(d)] = 0;
  }

  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.daten.buchungsdatum ?? 0).getTime() -
      new Date(b.daten.buchungsdatum ?? 0).getTime(),
  );
  for (const t of sorted) {
    if (!t.daten.buchungsdatum) continue;
    const key = dayKey(new Date(t.daten.buchungsdatum));
    if (key in buckets) buckets[key] += t.betrag.wert;
  }

  const sumOfWindow = Object.values(buckets).reduce((s, v) => s + v, 0);
  const offset = anchorBalance !== null ? anchorBalance - sumOfWindow : 0;

  const keys = Object.keys(buckets).sort();
  let acc = offset;
  return keys.map((k) => {
    acc += buckets[k];
    const rounded = Math.round(acc * 100) / 100;
    // ponytail: Math.round() yields -0, which Intl renders as "-0,00 €".
    return { _sortKey: k, value: rounded === 0 ? 0 : rounded };
  });
}

/**
 * Restrict a full balance series to the day range covered by `transactions`.
 * Anchoring happens before slicing, so a window ending in the past still shows
 * the real balance at that time instead of being shifted by later cash flow.
 */
export function sliceBalanceHistory(
  series: BalancePoint[],
  transactions: Transaction[],
): BalancePoint[] {
  let from: string | null = null;
  let to: string | null = null;
  for (const t of transactions) {
    if (!t.daten.buchungsdatum) continue;
    const key = dayKey(new Date(t.daten.buchungsdatum));
    if (from === null || key < from) from = key;
    if (to === null || key > to) to = key;
  }
  if (from === null || to === null) return series;
  return series.filter((p) => p._sortKey >= from && p._sortKey <= to);
}
