import { strict as assert } from "node:assert";
import { transactionToManualInput } from "./manual-transaction.ts";

type ManualInput = Parameters<typeof transactionToManualInput>[0];

const transaction = {
  id: 42,
  konto: { iban: "DE02120300000000202051" },
  daten: { buchungsdatum: "2026-07-01" },
  betrag: { wert: -12.5 },
  zahlungspartner: { name: "Firma GmbH", iban: "DE89370400440532013000" },
  texte: { verwendungszweck: "Rechnung", anmerkung: "Notiz" },
  technisch: { kategorieId: 7 },
} as unknown as ManualInput;

const input = transactionToManualInput(transaction);
assert.equal(input.date, "2026-07-01");
assert.equal(input.amount, -12.5);
assert.equal(input.recipient_name, "Firma GmbH");
assert.equal(input.recipient_iban, "DE89370400440532013000");
assert.equal(input.purpose, "Rechnung");
assert.equal(input.category, 7);
assert.equal(input.note, "Notiz");

const sparse = {
  id: 43,
  konto: { iban: "DE1" },
  daten: { buchungsdatum: null },
  betrag: { wert: 5 },
  zahlungspartner: { name: "", iban: "" },
  texte: { verwendungszweck: "", anmerkung: "" },
  technisch: { kategorieId: null },
} as unknown as ManualInput;

const sparseInput = transactionToManualInput(sparse);
assert.equal(sparseInput.recipient_name, null);
assert.equal(sparseInput.recipient_iban, null);
assert.equal(sparseInput.purpose, null);
assert.equal(sparseInput.category, null);
assert.equal(sparseInput.note, null);
assert.match(sparseInput.date, /^\d{4}-\d{2}-\d{2}$/);

console.log("transactions: ok");
