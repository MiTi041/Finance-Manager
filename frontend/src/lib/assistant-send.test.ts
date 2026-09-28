import { strict as assert } from "node:assert";
import { canStartStream, historyForRequest, type ChatMessage } from "./assistant-send.ts";

// Der Wächter hängt am Controller, nicht an einem "läuft gerade"-Boolean: zwei
// send() im selben Tick lesen beide denselben State, der erste hat seinen
// Controller aber schon synchron abgelegt. Genau das weist den zweiten ab —
// sonst schriebe der erste Stream seine Tokens in die Blase des zweiten.
const ref: { current: AbortController | null } = { current: null };
assert.equal(canStartStream(ref.current, "erste Frage"), true);
ref.current = new AbortController();
assert.equal(canStartStream(ref.current, "zweite Frage"), false);
assert.equal(canStartStream(null, "   "), false);

// Das ist der Fehlerfall aus dem Review: die Platzhalter-Blase einer Antwort,
// die vor dem ersten Token mit einem error endete, ist noch in messages und
// darf nicht in den nächsten Request wandern.
const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

const nachFehler = historyForRequest([user("Wie viel Lebensmittel?"), assistant("")]);
assert.deepEqual(nachFehler, [user("Wie viel Lebensmittel?")]);

// Und derselbe Request mit dem neuen Turns, den der Hook hintenanhängt.
assert.deepEqual(historyForRequest([...nachFehler, user("Und im Mai?")]), [
  user("Wie viel Lebensmittel?"),
  user("Und im Mai?"),
]);

// Eine echte Nutzernachricht geht nicht verloren: send() legt sie nur mit dem
// getrimmten, nicht leeren Text an, und der Filter arbeitet auf dem, was
// tatsächlich in messages steht.
assert.deepEqual(historyForRequest([user("  Wie viel?  "), assistant("42 €")]), [
  user("  Wie viel?  "),
  assistant("42 €"),
]);

// Nur wirklich leere Inhalte fliegen raus. Ein Token kann ein einzelnes
// Leerzeichen sein, und das ist gültiger Inhalt.
assert.deepEqual(historyForRequest([assistant(" "), assistant("42 €")]), [
  assistant(" "),
  assistant("42 €"),
]);

// Leere Liste bleibt leere Liste: der erste send() darf nicht daran scheitern.
assert.deepEqual(historyForRequest([]), []);

console.log("assistant-send.test.ts ok");
