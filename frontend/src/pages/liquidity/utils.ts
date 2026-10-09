import type { LiquidityEntry } from "@/lib/liquidity";

export function parseHiddenEntries(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

export type LiquidityStatus = "covered" | "shortfall";

export type LiquidityResult = {
  income: number;
  expense: number;
  balance: number;
  status: LiquidityStatus;
  discrepancy: number;
};

export function computeLiquidity({
  startBalance,
  entries,
}: {
  startBalance: number;
  entries: LiquidityEntry[];
}): LiquidityResult {
  let income = 0;
  let expense = 0;

  for (const entry of entries) {
    const amount = Math.abs(entry.amount);
    if (entry.kind === "income") income += amount;
    else expense += amount;
  }

  const balance = startBalance + income - expense;

  return {
    income,
    expense,
    balance,
    status: balance >= 0 ? "covered" : "shortfall",
    discrepancy: balance,
  };
}
