import { strict as assert } from "node:assert";

import {
  buildBalanceHistory,
  sliceBalanceHistory,
  type BalancePoint,
} from "./balance-history.ts";

function tx(id: number, amount: number, date: string) {
  return {
    id,
    betrag: { wert: amount },
    daten: { buchungsdatum: new Date(date) },
  } as unknown as Parameters<typeof buildBalanceHistory>[0][number];
}

function minValue(series: BalancePoint[]) {
  return Math.min(...series.map((p) => p.value));
}

// Manual account (Trade Republic): no bank balance, transactions net to zero.
const transactions = [
  tx(1, 1000, "2025-06-01"),
  tx(2, 500, "2025-12-01"),
  tx(3, -1500, "2026-06-01"),
];
const full = buildBalanceHistory(transactions, 0);

// Anchored at 0: the all-time series starts empty and ends at the anchor.
assert.equal(full[full.length - 1].value, 0, "ends at the anchor balance");
assert.equal(full[0].value, 1000, "starts from the first transaction, not shifted");

// Rounding a tiny negative balance must not surface as "-0,00 €".
const tiny = buildBalanceHistory([tx(9, -0.001, "2025-06-01")]);
assert.ok(
  !tiny.some((p) => Object.is(p.value, -0)),
  "never emits negative zero",
);

// A window ending in the past must show the balance at that time, not be
// shifted negative by the later cash flow (the reported Trade Republic bug).
const only2025 = [transactions[0], transactions[1]];
const sliced2025 = sliceBalanceHistory(full, only2025);
assert.equal(sliced2025[sliced2025.length - 1].value, 1500, "2025 closes at +1500");
assert.ok(minValue(sliced2025) > 0, `2025 must not dip negative (got ${minValue(sliced2025)})`);

// Real account: a known current balance shifts the whole series.
const anchored = buildBalanceHistory(transactions, 2000);
assert.equal(anchored[0].value, 3000, "start = current balance minus later cash flow");
assert.equal(anchored[anchored.length - 1].value, 2000, "ends at the known balance");

console.log("balance-history tests passed");
