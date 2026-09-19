import { strict as assert } from "node:assert";
import { buildMonthlyOverview } from "./allocation-overview.ts";
import type { AllocationRunBucket, AllocationStatus } from "./allocation.ts";

function bucket(bucket_type: string, target_amount: number): AllocationRunBucket {
  return { bucket_type, target_amount } as AllocationRunBucket;
}

function status(
  partial: Partial<AllocationStatus> & { net_income: number; remaining: number },
): AllocationStatus {
  return {
    month: "2026-09",
    total_allocated: 0,
    status: "calculated",
    buckets: [],
    config: [],
    savings_total: 0,
    savings_plans: [],
    auto_hidden_plan_ids: [],
    available_for_savings: 0,
    ...partial,
  } as AllocationStatus;
}

// order: income, then donations/emergency/invest, savings, leftover; missing buckets skipped
const full = status({
  net_income: 3000,
  remaining: 1400,
  savings_total: 300,
  buckets: [
    bucket("invest", 400),
    bucket("donation", 300),
    bucket("emergency", 600),
    bucket("spending", 1400),
  ],
});
const rows = buildMonthlyOverview(full);
assert.deepEqual(
  rows.map((r) => r.key),
  ["income", "donation", "emergency", "invest", "savings", "leftover"],
);
assert.deepEqual(
  rows.map((r) => r.kind),
  ["income", "deduction", "deduction", "deduction", "deduction", "leftover"],
);

// deductions + leftover must equal net income
const deducted = rows
  .filter((r) => r.kind === "deduction")
  .reduce((sum, r) => sum + r.amount, 0);
assert.equal(deducted + full.remaining, full.net_income);

// percent is share of net income
assert.equal(rows[0].percent, 100);
assert.equal(rows[1].percent, 10); // 300 / 3000

// bafoeg comes first among deductions when present
const withBafoeg = buildMonthlyOverview(
  status({
    net_income: 2000,
    remaining: 800,
    buckets: [bucket("bafoeg", 200), bucket("donation", 100)],
  }),
);
assert.deepEqual(
  withBafoeg.map((r) => r.key),
  ["income", "bafoeg", "donation", "leftover"],
);

// inactive/missing buckets are skipped
const onlyDonation = buildMonthlyOverview(
  status({ net_income: 1000, remaining: 900, buckets: [bucket("donation", 100)] }),
);
assert.deepEqual(
  onlyDonation.map((r) => r.key),
  ["income", "donation", "leftover"],
);

// zero income never divides by zero
const zero = buildMonthlyOverview(status({ net_income: 0, remaining: 0 }));
assert.deepEqual(
  zero.map((r) => r.percent),
  [0, 0],
);

console.log("allocation-overview: ok");
