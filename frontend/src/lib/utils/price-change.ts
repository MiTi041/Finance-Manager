import type { SubscriptionTransaction } from "@/pages/subscriptions/hooks/use-subscriptions";

const MIN_ABS = 0.5;
const MIN_REL = 0.01;

export function getPriceChange(
  direction: "income" | "expense",
  transactions: SubscriptionTransaction[],
): number | null {
  if (direction !== "expense" || transactions.length < 2) return null;
  const newest = Math.abs(transactions[0].amount);
  const previous = Math.abs(transactions[1].amount);
  if (previous === 0) return null;
  const delta = newest - previous;
  if (Math.abs(delta) < MIN_ABS || Math.abs(delta) / previous < MIN_REL) return null;
  return delta;
}
