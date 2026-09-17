import { strict as assert } from "node:assert";
import { isFullyRefunded } from "./refunds.ts";

const expense = (wert: number, refundTotal: number) =>
  ({ betrag: { wert, refundTotal }, refundAttributed: 0, refundLinks: [] }) as never;

const refund = (wert: number, refundAttributed: number) =>
  ({
    betrag: { wert, refundTotal: 0 },
    refundAttributed,
    refundLinks: [{}],
  }) as never;

assert.equal(isFullyRefunded(expense(-50, 50)), true);
assert.equal(isFullyRefunded(expense(-50, 60)), true);
assert.equal(isFullyRefunded(expense(-50, 20)), false);
assert.equal(isFullyRefunded(expense(-50, 0)), false);

assert.equal(isFullyRefunded(refund(50, 50)), true);
assert.equal(isFullyRefunded(refund(50, 60)), true);
assert.equal(isFullyRefunded(refund(50, 20)), false);

assert.equal(isFullyRefunded({ betrag: { wert: 50, refundTotal: 0 }, refundAttributed: 50, refundLinks: [] } as never), false);

console.log("refunds.test.ts OK");
