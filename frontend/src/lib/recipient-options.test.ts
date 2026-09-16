import { strict as assert } from "node:assert";
import {
  buildRecipientOptions,
  filterRecipientOptions,
} from "./recipient-options.ts";

const groups = buildRecipientOptions({
  ownAccounts: [
    { accountIban: "DE89370400440532013000", accountName: "Giro", bankName: "Bank", scope: "s1" },
    { accountIban: "DE75512108001245126199", accountName: "Tagesgeld", bankName: "Bank", scope: "s2" },
  ],
  recipientAccounts: [
    {
      id: 1,
      account_name: "Miete",
      iban: "DE02120300000000202051",
      recipient_name: "Vermieter GmbH",
      is_donation_account: false,
    },
    {
      id: 2,
      account_name: "Ohne Empfängername",
      iban: "DE44500105175407324931",
      recipient_name: "",
      is_donation_account: false,
    },
  ],
  zahlungspartner: [
    { id: 5, name: "Giro", is_company: false, is_own_account: true, ibans: ["DE89 3704 0044 0532 0130 00"] },
    { id: 6, name: "Strom", is_company: true, is_own_account: false, ibans: ["DE88100900001234567892"] },
    { id: 7, name: "Ohne IBAN", is_company: true, is_own_account: false, ibans: [] },
  ],
});

// Gruppierung + Reihenfolge
assert.deepEqual(
  groups.map((g) => g.label),
  ["Eigene Konten", "Empfängerkonten", "Zahlungspartner"],
);

// Mapping eigene Konten
assert.equal(groups[0].options[0].name, "Giro");
assert.equal(groups[0].options[0].iban, "DE89370400440532013000");

// Mapping Empfängerkonten inkl. Fallback auf account_name
assert.equal(groups[1].options[0].name, "Vermieter GmbH");
assert.equal(groups[1].options[0].iban, "DE02120300000000202051");
assert.equal(groups[1].options[1].name, "Ohne Empfängername");

// Dedupe über normalisierte IBAN: Zahlungspartner "Giro" (DE89…) fällt weg,
// "Ohne IBAN" (leer) bleibt erhalten.
assert.deepEqual(
  groups[2].options.map((o) => o.name),
  ["Strom", "Ohne IBAN"],
);

// Filter über Name, case-insensitive
const byName = filterRecipientOptions(groups, "strom");
assert.deepEqual(byName.map((g) => g.label), ["Zahlungspartner"]);
assert.deepEqual(byName[0].options.map((o) => o.name), ["Strom"]);

// Filter über IBAN
const byIban = filterRecipientOptions(groups, "2020");
assert.deepEqual(byIban.map((g) => g.label), ["Empfängerkonten"]);
assert.equal(byIban[0].options[0].name, "Vermieter GmbH");

// Leeres Query gibt alles zurück, leere Gruppen werden entfernt
assert.equal(filterRecipientOptions(groups, "   "), groups);

// Kein Treffer
assert.deepEqual(filterRecipientOptions(groups, "xyz"), []);

// Leere Eingaben -> keine Gruppen
assert.deepEqual(
  buildRecipientOptions({ ownAccounts: [], recipientAccounts: [], zahlungspartner: [] }),
  [],
);

console.log("recipient-options: ok");
