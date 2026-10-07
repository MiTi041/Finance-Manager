import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildAutoItems, computeLiquidity, projectSubscriptions } from "./utils.ts";

test("covered: shows the surplus when certain balance is positive", () => {
  const result = computeLiquidity({
    startBalance: 1000,
    entries: [
      { id: 1, label: "Gehalt", amount: 2000, kind: "income", certainty: "certain" },
      { id: 2, label: "Miete", amount: 500, kind: "expense", certainty: "certain" },
    ],
    autoItems: [
      { id: "a", label: "Netflix", amount: -15, date: "2026-11-01", source: "subscription" },
    ],
  });

  assert.equal(result.certainBalance, 2485);
  assert.equal(result.status, "covered");
  assert.equal(result.discrepancy, 2485);
});

test("best_case: expected income closes the certain gap", () => {
  const result = computeLiquidity({
    startBalance: 100,
    entries: [
      { id: 1, label: "Weihnachtsgeld", amount: 500, kind: "income", certainty: "expected" },
      { id: 2, label: "Geschenke", amount: 300, kind: "expense", certainty: "certain" },
    ],
    autoItems: [],
  });

  assert.equal(result.certainBalance, -200);
  assert.equal(result.bestBalance, 300);
  assert.equal(result.status, "best_case");
  assert.equal(result.discrepancy, -200);
});

test("shortfall: negative even in the best case", () => {
  const result = computeLiquidity({
    startBalance: 0,
    entries: [
      { id: 1, label: "Urlaub", amount: 1000, kind: "expense", certainty: "certain" },
      { id: 2, label: "Bonus", amount: 200, kind: "income", certainty: "expected" },
    ],
    autoItems: [],
  });

  assert.equal(result.bestBalance, -800);
  assert.equal(result.status, "shortfall");
  assert.equal(result.discrepancy, -800);
});

test("projectSubscriptions steps monthly through the range", () => {
  const subscriptions = [
    {
      name: "Netflix",
      amount: 15,
      effectiveAmount: 15,
      direction: "expense",
      frequency: "MONTHLY",
      nextDate: "2026-11-15",
      recipientId: 1,
    },
  ];

  const items = projectSubscriptions(
    subscriptions as never,
    new Date(2026, 9, 7),
    new Date(2026, 11, 31),
  );

  assert.deepEqual(
    items.map((item) => item.date),
    ["2026-11-15", "2026-12-15"],
  );
  assert.equal(items[0].amount, -15);
});

test("projectSubscriptions does not drift on month-end anchor dates", () => {
  const subscriptions = [
    {
      name: "Rente",
      amount: 10,
      effectiveAmount: 10,
      direction: "expense",
      frequency: "MONTHLY",
      nextDate: "2026-01-31",
      recipientId: 1,
    },
  ];

  const items = projectSubscriptions(
    subscriptions as never,
    new Date(2026, 0, 1),
    new Date(2026, 2, 30),
  );

  assert.deepEqual(
    items.map((item) => item.date),
    ["2026-01-31", "2026-02-28"],
  );
});

test("buildAutoItems includes pending transactions within the range", () => {
  const items = buildAutoItems({
    subscriptions: [],
    pending: [{ amount: -100, date: "2026-11-01", recipient_name: "Vermieter" }],
    fromDate: new Date(2026, 9, 7),
    endDate: new Date(2026, 11, 31),
    includeSubscriptions: false,
    includePending: true,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Vermieter");
  assert.equal(items[0].amount, -100);
});
