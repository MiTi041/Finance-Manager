import type { LiquidityEntry, PendingTransactionDto } from "@/lib/liquidity";
import type { Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";

export type LiquidityStatus = "covered" | "best_case" | "shortfall";

export type LiquidityAutoItem = {
  id: string;
  label: string;
  amount: number;
  date: string | null;
  source: "subscription" | "pending";
};

export type LiquidityResult = {
  certainIncome: number;
  certainExpense: number;
  expectedIncome: number;
  expectedExpense: number;
  certainBalance: number;
  bestBalance: number;
  status: LiquidityStatus;
  discrepancy: number;
};

const FREQUENCY_MONTHS: Record<Subscription["frequency"], number> = {
  MONTHLY: 1,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function projectSubscriptions(
  subscriptions: Subscription[],
  fromDate: Date,
  endDate: Date,
): LiquidityAutoItem[] {
  const items: LiquidityAutoItem[] = [];
  for (const subscription of subscriptions) {
    if (subscription.dismissed || subscription.ended || subscription.active === false) continue;
    if (!subscription.nextDate) continue;
    const amount = Math.abs(subscription.effectiveAmount ?? subscription.amount ?? 0);
    if (amount <= 0) continue;
    const step = FREQUENCY_MONTHS[subscription.frequency] ?? 1;
    const signed = subscription.direction === "expense" ? -amount : amount;
    const anchor = parseIsoDate(subscription.nextDate);
    let occurrence = 0;
    let cursor = anchor;
    while (cursor <= endDate && occurrence < 1200) {
      if (cursor >= fromDate) {
        items.push({
          id: `sub-${subscription.name}-${formatIsoDate(cursor)}-${occurrence}`,
          label: subscription.name,
          amount: signed,
          date: formatIsoDate(cursor),
          source: "subscription",
        });
      }
      occurrence += 1;
      cursor = addMonths(anchor, occurrence * step);
    }
  }
  return items;
}

export function buildAutoItems({
  subscriptions,
  pending,
  fromDate,
  endDate,
  includeSubscriptions,
  includePending,
}: {
  subscriptions: Subscription[];
  pending: PendingTransactionDto[];
  fromDate: Date;
  endDate: Date;
  includeSubscriptions: boolean;
  includePending: boolean;
}): LiquidityAutoItem[] {
  const items: LiquidityAutoItem[] = [];
  if (includeSubscriptions) {
    items.push(...projectSubscriptions(subscriptions, fromDate, endDate));
  }
  if (includePending) {
    pending.forEach((transaction, index) => {
      const iso = transaction.date ?? transaction.entry_date ?? null;
      if (iso && parseIsoDate(iso) > endDate) return;
      items.push({
        id: `pending-${index}-${iso ?? "x"}`,
        label:
          transaction.recipient_name ||
          transaction.applicant_name ||
          transaction.purpose ||
          "Vorgemerkte Transaktion",
        amount: transaction.amount,
        date: iso,
        source: "pending",
      });
    });
  }
  return items;
}

export function computeLiquidity({
  startBalance,
  entries,
  autoItems,
}: {
  startBalance: number;
  entries: LiquidityEntry[];
  autoItems: LiquidityAutoItem[];
}): LiquidityResult {
  let certainIncome = 0;
  let certainExpense = 0;
  let expectedIncome = 0;
  let expectedExpense = 0;

  for (const entry of entries) {
    const amount = Math.abs(entry.amount);
    if (entry.kind === "income") {
      if (entry.certainty === "certain") certainIncome += amount;
      else expectedIncome += amount;
    } else if (entry.certainty === "certain") {
      certainExpense += amount;
    } else {
      expectedExpense += amount;
    }
  }

  for (const item of autoItems) {
    if (item.amount >= 0) certainIncome += item.amount;
    else certainExpense += -item.amount;
  }

  const certainBalance = startBalance + certainIncome - certainExpense;
  const bestBalance = certainBalance + expectedIncome - expectedExpense;

  let status: LiquidityStatus;
  let discrepancy: number;
  if (certainBalance >= 0) {
    status = "covered";
    discrepancy = certainBalance;
  } else if (bestBalance >= 0) {
    status = "best_case";
    discrepancy = certainBalance;
  } else {
    status = "shortfall";
    discrepancy = bestBalance;
  }

  return {
    certainIncome,
    certainExpense,
    expectedIncome,
    expectedExpense,
    certainBalance,
    bestBalance,
    status,
    discrepancy,
  };
}
