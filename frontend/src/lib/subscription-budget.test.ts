import { strict as assert } from "node:assert";
import {
  computeSpendingSubscriptionState,
  type SubscriptionBudgetSub,
} from "./subscription-budget.ts";

const subs = [
  { effectiveAmount: 10, frequency: "MONTHLY" },
  { effectiveAmount: 12, frequency: "SEMI_ANNUAL" },
  { effectiveAmount: 120, frequency: "ANNUAL" },
] satisfies SubscriptionBudgetSub[];

// monthly load = 10 + 12/6 + 120/12 = 22
const s = computeSpendingSubscriptionState(subs, 100);
assert.equal(s.load, 22);
assert.equal(s.shortfall, 0);

// budget covers subs -> no warning
const exact = computeSpendingSubscriptionState(subs, 22);
assert.equal(exact.shortfall, 0);

// budget too small -> shortfall = load - budget, independent of what was spent
const tight = computeSpendingSubscriptionState(subs, 24.33);
assert.ok(Math.abs(tight.shortfall - 0) < 1e-9, `no shortfall expected, got ${tight.shortfall}`);

const tight2 = computeSpendingSubscriptionState(subs, 20);
assert.ok(Math.abs(tight2.shortfall - 2) < 1e-9);

// no subs -> zero load
const none = computeSpendingSubscriptionState([], 50);
assert.equal(none.load, 0);
assert.equal(none.shortfall, 0);

console.log("subscription-budget: all assertions passed");
