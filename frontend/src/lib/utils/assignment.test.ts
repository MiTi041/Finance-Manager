import { strict as assert } from "node:assert";
import { isTransactionUnassigned } from "./assignment.ts";

const tx = (
  kategorieId: number | null,
  splits: { kategorieId: number | null }[] | null,
  refundTotal = 0,
) =>
  ({
    betrag: { wert: -50, refundTotal },
    refundAttributed: 0,
    refundLinks: [],
    technisch: { kategorieId, splits },
  }) as never;

assert.equal(isTransactionUnassigned(tx(null, null)), true);
assert.equal(isTransactionUnassigned(tx(3, null)), false);

assert.equal(isTransactionUnassigned(tx(null, [{ kategorieId: null }, { kategorieId: 1 }])), true);
assert.equal(isTransactionUnassigned(tx(null, [{ kategorieId: 1 }, { kategorieId: 2 }])), false);
assert.equal(isTransactionUnassigned(tx(3, [{ kategorieId: null }])), true);

assert.equal(isTransactionUnassigned(tx(null, [{ kategorieId: null }], 50)), false);
assert.equal(isTransactionUnassigned(tx(null, [])), true);

console.log("assignment.test.ts OK");
