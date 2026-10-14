import type { AllocationBucket, AllocationRunBucket, SavingsPlan } from "./allocation";
import { normalizeIban } from "./iban.ts";

export type BucketOnAccount = {
  bucketType: string;
  label: string;
  amount: number;
};

export type AccountBuckets = {
  iban: string;
  name: string;
  buckets: BucketOnAccount[];
  total: number;
};

export const BUCKET_LABELS: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
};

/**
 * The amount a bucket contributes to its account. For BAföG this is the same
 * number the Finanzplan card shows as "X von Ziel": cash minus outstanding debt.
 */
export function bucketAmount(bucket: AllocationRunBucket): number {
  const saved = bucket.saved_total ?? 0;
  if (bucket.bucket_type === "bafoeg") {
    const outstanding = Math.max(0, (bucket.saved_entnahmen ?? 0) - (bucket.saved_tilgungen ?? 0));
    return Math.max(0, saved - outstanding);
  }
  return saved;
}

/**
 * Groups allocation pots by the account their money sits on (the destination).
 * Buckets without a fixed destination (donation/spending) and pots with a zero
 * (or, for savings plans, non-positive) balance are skipped.
 *
 * Savings plans are keyed by their target recipient IBAN and contribute their
 * accumulated `saved_amount`.
 *
 * `recipientIbansById` maps a recipient-account id to its IBAN; `nameByIban`
 * maps a normalized IBAN to a display name.
 */
export function groupBucketsByAccount(
  runBuckets: AllocationRunBucket[],
  config: AllocationBucket[],
  recipientIbansById: Map<number, string>,
  nameByIban: Map<string, string>,
  savingsPlans: SavingsPlan[] = [],
): AccountBuckets[] {
  const configById = new Map(config.map((c) => [c.id, c]));
  const groups = new Map<string, AccountBuckets>();

  for (const bucket of runBuckets) {
    const cfg = configById.get(bucket.bucket_id);
    if (!cfg) continue;
    const iban =
      normalizeIban(cfg.recipient_iban) ||
      (cfg.recipient_account_id != null
        ? normalizeIban(recipientIbansById.get(cfg.recipient_account_id))
        : "");
    if (!iban) continue;

    const amount = bucketAmount(bucket);
    if (amount === 0) continue;

    let group = groups.get(iban);
    if (!group) {
      group = { iban, name: nameByIban.get(iban) ?? iban, buckets: [], total: 0 };
      groups.set(iban, group);
    }
    group.buckets.push({
      bucketType: bucket.bucket_type,
      label: BUCKET_LABELS[bucket.bucket_type] ?? bucket.bucket_type,
      amount,
    });
    group.total += amount;
  }

  // ponytail: savings plans use their target IBAN as destination; only plans
  // with something saved show up.
  for (const plan of savingsPlans) {
    const iban = normalizeIban(plan.target_recipient_iban);
    if (!iban) continue;
    const amount = plan.saved_amount ?? 0;
    if (amount <= 0) continue;

    let group = groups.get(iban);
    if (!group) {
      group = {
        iban,
        name: nameByIban.get(iban) ?? plan.target_recipient_name ?? iban,
        buckets: [],
        total: 0,
      };
      groups.set(iban, group);
    }
    group.buckets.push({ bucketType: `plan:${plan.id}`, label: plan.name, amount });
    group.total += amount;
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.buckets.sort((a, b) => b.amount - a.amount);
    group.total = Math.round(group.total * 100) / 100;
  }
  return result.sort((a, b) => b.total - a.total);
}
