import { strict as assert } from "node:assert";
import { bucketAmount, groupBucketsByAccount } from "./buckets-by-account.ts";
import type { AllocationBucket, AllocationRunBucket, SavingsPlan } from "./allocation.ts";

const config = [
  { id: 2, bucket_type: "emergency", recipient_account_id: 3, recipient_iban: null },
  { id: 3, bucket_type: "invest", recipient_account_id: 3, recipient_iban: null },
  { id: 1, bucket_type: "bafoeg", recipient_account_id: null, recipient_iban: "DE46120300001211954068" },
  { id: 4, bucket_type: "donation", recipient_account_id: null, recipient_iban: null },
  { id: 5, bucket_type: "spending", recipient_account_id: null, recipient_iban: null },
] as unknown as AllocationBucket[];

const run = [
  { bucket_id: 2, bucket_type: "emergency", saved_total: 1 },
  { bucket_id: 3, bucket_type: "invest", saved_total: 215 },
  // Bafög: Guthaben 100, ausstehende Schulden 30 - 10 = 20 → 80 auf dem Konto
  { bucket_id: 1, bucket_type: "bafoeg", saved_total: 100, saved_entnahmen: 30, saved_tilgungen: 10 },
  { bucket_id: 4, bucket_type: "donation" },
  { bucket_id: 5, bucket_type: "spending" },
] as unknown as AllocationRunBucket[];

const recipientIbansById = new Map([[3, "DE18100123450758164301"]]);
const nameByIban = new Map([
  ["DE18100123450758164301", "Trade Republic"],
  ["DE46120300001211954068", "DKB Girokonto"],
]);

const groups = groupBucketsByAccount(run, config, recipientIbansById, nameByIban);

// Notgroschen + Invest → Trade Republic, sum 216.
// Bafög net (100-20=80) → DKB. donation/spending have no destination → skipped.
assert.equal(groups.length, 2);
const tr = groups.find((g) => g.name === "Trade Republic")!;
assert.equal(tr.total, 216);
assert.deepEqual(
  tr.buckets.map((b) => b.label),
  ["Investieren", "Notgroschen"],
);
assert.equal(groups.find((g) => g.name === "DKB Girokonto")!.total, 80);

// Bafög amount is cash minus outstanding debt, clamped at 0.
assert.equal(bucketAmount({ bucket_type: "bafoeg", saved_total: 100, saved_entnahmen: 30, saved_tilgungen: 10 } as AllocationRunBucket), 80);
assert.equal(bucketAmount({ bucket_type: "bafoeg", saved_total: 10, saved_entnahmen: 30, saved_tilgungen: 0 } as AllocationRunBucket), 0);
assert.equal(bucketAmount({ bucket_type: "emergency", saved_total: 42 } as AllocationRunBucket), 42);

// recipient_iban path + IBAN normalization (spaces/case).
const groups2 = groupBucketsByAccount(
  [{ bucket_id: 2, bucket_type: "emergency", saved_total: 5 }] as unknown as AllocationRunBucket[],
  [
    { id: 2, bucket_type: "emergency", recipient_account_id: null, recipient_iban: "de18 1001 2345 0758 1643 01" },
  ] as unknown as AllocationBucket[],
  new Map(),
  new Map([["DE18100123450758164301", "TR"]]),
);
assert.equal(groups2[0].iban, "DE18100123450758164301");
assert.equal(groups2[0].name, "TR");

// Savings plans land on their target account and add their saved amount.
// Plans with nothing saved or no target IBAN are skipped; unknown targets
// fall back to the plan's recipient name.
const plans = [
  { id: 1, name: "Urlaub", target_recipient_iban: "DE18100123450758164301", target_recipient_name: "Trade Republic", saved_amount: 50 },
  { id: 2, name: "Leer", target_recipient_iban: "DE18100123450758164301", target_recipient_name: "Trade Republic", saved_amount: 0 },
  { id: 3, name: "Ohne Ziel", target_recipient_iban: null, target_recipient_name: "Niemand", saved_amount: 30 },
  { id: 4, name: "Neues Konto", target_recipient_iban: "de89 3704 0044 0532 0130 00", target_recipient_name: "Commerzbank", saved_amount: 12 },
] as unknown as SavingsPlan[];

const groups3 = groupBucketsByAccount(run, config, recipientIbansById, nameByIban, plans);
// Trade Republic keeps its buckets plus the merged Urlaub plan.
assert.equal(groups3.length, 3);
const tr3 = groups3.find((g) => g.name === "Trade Republic")!;
assert.equal(tr3.total, 266);
assert.deepEqual(
  tr3.buckets.map((b) => b.label),
  ["Investieren", "Urlaub", "Notgroschen"],
);
// Unknown target, name from the plan, IBAN normalized.
const cb = groups3.find((g) => g.name === "Commerzbank")!;
assert.equal(cb.iban, "DE89370400440532013000");
assert.equal(cb.total, 12);

console.log("buckets-by-account: ok");
