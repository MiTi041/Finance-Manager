import { strict as assert } from "node:assert";
import {
  computeSpendingSubscriptionState,
  type SubscriptionBudgetSub,
} from "./subscription-budget.ts";

// only MONTHLY subscriptions count; semi-annual/annual are ignored
const subs = [
  { effectiveAmount: 10, frequency: "MONTHLY" },
  { effectiveAmount: 12, frequency: "SEMI_ANNUAL" },
  { effectiveAmount: 120, frequency: "ANNUAL" },
] satisfies SubscriptionBudgetSub[];

// monthly load = 10 (semi-annual 12 and annual 120 excluded)
const s = computeSpendingSubscriptionState(subs, 100);
assert.equal(s.load, 10);
assert.equal(s.shortfall, 0);

// budget covers subs -> no warning
const exact = computeSpendingSubscriptionState(subs, 10);
assert.equal(exact.shortfall, 0);

// budget too small -> shortfall = load - budget
const tight = computeSpendingSubscriptionState(subs, 5);
assert.ok(Math.abs(tight.shortfall - 5) < 1e-9);

// no monthly subs -> zero load, even if semi-annual/annual exist
const onlyRare = computeSpendingSubscriptionState(
  [
    { effectiveAmount: 12, frequency: "SEMI_ANNUAL" },
    { effectiveAmount: 120, frequency: "ANNUAL" },
  ],
  50,
);
assert.equal(onlyRare.load, 0);
assert.equal(onlyRare.shortfall, 0);

// no subs -> zero load
const none = computeSpendingSubscriptionState([], 50);
assert.equal(none.load, 0);
assert.equal(none.shortfall, 0);

// income subscriptions never load the spending budget
const withIncome = computeSpendingSubscriptionState(
  [
    { effectiveAmount: 10, frequency: "MONTHLY" },
    { effectiveAmount: 900, frequency: "MONTHLY", direction: "income" },
  ],
  100,
);
assert.equal(withIncome.load, 10);
assert.equal(withIncome.shortfall, 0);

console.log("subscription-budget: all assertions passed");
