import type { AllocationStatus } from "./allocation";

export type OverviewRowKind = "income" | "deduction" | "leftover";

export type OverviewRow = {
  key: string;
  label: string;
  amount: number;
  kind: OverviewRowKind;
  percent: number;
};

const DEDUCTION_ROWS: { key: string; label: string; bucketType: string }[] = [
  { key: "bafoeg", label: "BAföG-Rücklage", bucketType: "bafoeg" },
  { key: "donation", label: "Spenden", bucketType: "donation" },
  { key: "emergency", label: "Notgroschen", bucketType: "emergency" },
  { key: "invest", label: "Investieren", bucketType: "invest" },
];

export function buildMonthlyOverview(status: AllocationStatus): OverviewRow[] {
  const netIncome = status.net_income;
  const percentOf = (amount: number) => (netIncome > 0 ? (amount / netIncome) * 100 : 0);

  const rows: OverviewRow[] = [
    {
      key: "income",
      label: "Einkommen",
      amount: netIncome,
      kind: "income",
      percent: netIncome > 0 ? 100 : 0,
    },
  ];

  for (const { key, label, bucketType } of DEDUCTION_ROWS) {
    const bucket = status.buckets.find((b) => b.bucket_type === bucketType);
    if (!bucket || bucket.target_amount <= 0) continue;
    rows.push({
      key,
      label,
      amount: bucket.target_amount,
      kind: "deduction",
      percent: percentOf(bucket.target_amount),
    });
  }

  if (status.savings_total > 0) {
    rows.push({
      key: "savings",
      label: "Sparpläne",
      amount: status.savings_total,
      kind: "deduction",
      percent: percentOf(status.savings_total),
    });
  }

  rows.push({
    key: "leftover",
    label: "Übrig",
    amount: status.remaining,
    kind: "leftover",
    percent: percentOf(status.remaining),
  });

  return rows;
}
