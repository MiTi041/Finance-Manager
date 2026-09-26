import { strict as assert } from "node:assert";
import { evalArithmetic } from "./arithmetic.ts";

assert.equal(evalArithmetic("620+534"), 1154);
assert.equal(evalArithmetic("620 + 534"), 1154);
assert.equal(evalArithmetic("1000"), 1000);
assert.equal(evalArithmetic("1.5*2"), 3);
assert.equal(evalArithmetic("1,5*2"), 3);
assert.equal(evalArithmetic("1+2*3"), 7);
assert.equal(evalArithmetic("2*(3+4)"), 14);
assert.equal(evalArithmetic("-50+100"), 50);
assert.equal(evalArithmetic("10/4"), 2.5);

assert.equal(evalArithmetic(""), null);
assert.equal(evalArithmetic("abc"), null);
assert.equal(evalArithmetic("1+"), null);
assert.equal(evalArithmetic("(1+2"), null);
assert.equal(evalArithmetic("1/0"), null);
