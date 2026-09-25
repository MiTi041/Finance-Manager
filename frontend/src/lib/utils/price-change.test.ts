import { strict as assert } from "node:assert";
import { getPriceChange } from "./price-change.ts";

const tx = (amount: number) => ({ amount }) as never;
const near = (value: number | null, expected: number) =>
  assert.ok(value !== null && Math.abs(value - expected) < 1e-9, `expected ~${expected}, got ${value}`);

near(getPriceChange("expense", [tx(-15.99), tx(-12.99)]), 3);
near(getPriceChange("expense", [tx(-12.99), tx(-15.99)]), -3);
assert.equal(getPriceChange("expense", [tx(-13.0), tx(-12.99)]), null);
assert.equal(getPriceChange("expense", [tx(-100.5), tx(-100.0)]), null);
assert.equal(getPriceChange("income", [tx(15.99), tx(12.99)]), null);
assert.equal(getPriceChange("expense", [tx(-15.99)]), null);
assert.equal(getPriceChange("expense", [tx(-15.99), tx(0)]), null);

console.log("price-change.test.ts OK");
