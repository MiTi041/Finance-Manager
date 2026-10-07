import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeLiquidity } from "./utils.ts";

test("covered: shows the surplus when balance is positive", () => {
  const result = computeLiquidity({
    startBalance: 1000,
    entries: [
      { id: 1, label: "Gehalt", amount: 2000, kind: "income", certainty: "certain" },
      { id: 2, label: "Miete", amount: 500, kind: "expense", certainty: "certain" },
    ],
  });

  assert.equal(result.balance, 2500);
  assert.equal(result.status, "covered");
  assert.equal(result.discrepancy, 2500);
});

test("shortfall: negative balance", () => {
  const result = computeLiquidity({
    startBalance: 0,
    entries: [
      { id: 1, label: "Urlaub", amount: 1000, kind: "expense", certainty: "certain" },
      { id: 2, label: "Bonus", amount: 200, kind: "income", certainty: "certain" },
    ],
  });

  assert.equal(result.balance, -800);
  assert.equal(result.status, "shortfall");
  assert.equal(result.discrepancy, -800);
});
