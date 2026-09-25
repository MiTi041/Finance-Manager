import { strict as assert } from "node:assert";
import { isUnknownIban } from "./iban.ts";

const known = new Set(["DE89370400440532013000", "PAYPAL:MAX@EXAMPLE.COM"]);

assert.equal(isUnknownIban("DE89 3704 0044 0532 0130 00", known), false);
assert.equal(isUnknownIban("paypal:max@example.com", known), false);
assert.equal(isUnknownIban("DE02120300000000202051", known), true);
assert.equal(isUnknownIban("", known), false);
assert.equal(isUnknownIban(null, known), false);
assert.equal(isUnknownIban(undefined, known), false);

console.log("iban.test.ts ok");
