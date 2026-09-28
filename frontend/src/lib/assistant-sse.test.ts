import { strict as assert } from "node:assert";
import { parseSseBuffer } from "./assistant-sse.ts";

const first = parseSseBuffer('data: {"type":"token","text":"Hi"}\n\ndata: {"type":"done"}\n\n');
assert.deepEqual(first.events, [{ type: "token", text: "Hi" }, { type: "done" }]);
assert.equal(first.rest, "");

const partial = parseSseBuffer('data: {"type":"token","text":"Hal');
assert.deepEqual(partial.events, []);
assert.equal(partial.rest, 'data: {"type":"token","text":"Hal');

const continued = parseSseBuffer(partial.rest + 'lo"}\n\n');
assert.deepEqual(continued.events, [{ type: "token", text: "Hallo" }]);
assert.equal(continued.rest, "");

const bad = parseSseBuffer("data: {nope}\n\n");
assert.deepEqual(bad.events, []);

// Ein kaputter Frame darf den folgenden nicht mitverschlucken: der Buffer wird
// weiter nach "\n\n" geteilt, nicht "ab hier verwerfen".
const badThenGood = parseSseBuffer('data: {nope}\n\ndata: {"type":"token","text":"ok"}\n\n');
assert.deepEqual(badThenGood.events, [{ type: "token", text: "ok" }]);
assert.equal(badThenGood.rest, "");

// Der Fehlerpfad des Backends bricht nach dem error-Frame ab und sendet kein
// "done" mehr — genau so muss der Parser das durchreichen.
const errorEvent = parseSseBuffer(
  'data: {"type":"error","message":"Die Antwort wurde abgeschnitten."}\n\n',
);
assert.deepEqual(errorEvent.events, [
  { type: "error", message: "Die Antwort wurde abgeschnitten." },
]);
assert.equal(errorEvent.rest, "");

// json.dumps(ensure_ascii=False): Umlaute kommen roh, nicht als \uXXXX.
const umlaut = parseSseBuffer('data: {"type":"token","text":"Über 10 €"}\n\n');
assert.deepEqual(umlaut.events, [{ type: "token", text: "Über 10 €" }]);

// Leerer Frame und Zeilen ohne "data:" liefern nichts — und verschlucken die
// Nachbarzeile nicht, die im selben Frame stehen kann.
const noisy = parseSseBuffer('\n\n: keep-alive\nevent: message\ndata: \ndata: {"type":"done"}\n\n');
assert.deepEqual(noisy.events, [{ type: "done" }]);
assert.equal(noisy.rest, "");

console.log("assistant-sse.test.ts ok");
