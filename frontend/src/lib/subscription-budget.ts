export type SubscriptionFrequency = "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL";

export interface SubscriptionBudgetSub {
  effectiveAmount: number;
  frequency: SubscriptionFrequency;
  direction?: "income" | "expense";
}

export interface SpendingSubscriptionState {
  load: number;
  shortfall: number;
}

// The question is "does the Restliche-Ausgaben budget cover the subscriptions?",
// so only the monthly subscriptions vs the spending-bucket target matter.
// Semi-annual and annual subscriptions are ignored here.
export function computeSpendingSubscriptionState(
  subscriptions: SubscriptionBudgetSub[],
  target: number,
): SpendingSubscriptionState {
  let load = 0;
  for (const sub of subscriptions) {
    if (sub.frequency !== "MONTHLY") continue;
    if (sub.direction === "income") continue;
    load += sub.effectiveAmount;
  }
  load = round2(load);
  return { load, shortfall: round2(Math.max(0, load - target)) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
