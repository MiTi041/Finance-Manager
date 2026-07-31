export type SubscriptionFrequency = "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL";

export interface SubscriptionBudgetSub {
  effectiveAmount: number;
  frequency: SubscriptionFrequency;
}

const FREQUENCY_MONTHLY_FACTOR: Record<SubscriptionFrequency, number> = {
  MONTHLY: 1,
  SEMI_ANNUAL: 1 / 6,
  ANNUAL: 1 / 12,
};

export interface SpendingSubscriptionState {
  load: number;
  shortfall: number;
}

// The question is "does the Restliche-Ausgaben budget cover the subscriptions?",
// so only the monthly subscription load vs the spending-bucket target matters.
// What was already spent this month is a separate signal (spent vs target),
// mixing it in made the shortfall conflate subscriptions with other spending.
export function computeSpendingSubscriptionState(
  subscriptions: SubscriptionBudgetSub[],
  target: number,
): SpendingSubscriptionState {
  let load = 0;
  for (const sub of subscriptions) {
    load += sub.effectiveAmount * FREQUENCY_MONTHLY_FACTOR[sub.frequency];
  }
  load = round2(load);
  return { load, shortfall: round2(Math.max(0, load - target)) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
