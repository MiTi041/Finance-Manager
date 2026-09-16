import { normalizeIban } from "./iban.ts";
import type { BankAccountOption } from "./utils/accounts";
import type { RecipientAccountRecord } from "./recipient-accounts";
import type { ZahlungspartnerRecord } from "./zahlungspartner";

export type RecipientOptionKind = "own" | "recipient" | "partner";

export type RecipientOption = {
  id: string;
  name: string;
  iban: string;
  kind: RecipientOptionKind;
};

export type RecipientOptionGroup = {
  kind: RecipientOptionKind;
  label: string;
  options: RecipientOption[];
};

export function buildRecipientOptions(input: {
  ownAccounts: BankAccountOption[];
  recipientAccounts: RecipientAccountRecord[];
  zahlungspartner: ZahlungspartnerRecord[];
}): RecipientOptionGroup[] {
  const groups: RecipientOptionGroup[] = [
    {
      kind: "own",
      label: "Eigene Konten",
      options: input.ownAccounts.map((account) => ({
        id: `own:${account.accountIban}`,
        name: account.accountName,
        iban: account.accountIban,
        kind: "own" as const,
      })),
    },
    {
      kind: "recipient",
      label: "Empfängerkonten",
      options: input.recipientAccounts.map((account) => ({
        id: `recipient:${account.id}`,
        name: account.recipient_name || account.account_name,
        iban: account.iban,
        kind: "recipient" as const,
      })),
    },
    {
      kind: "partner",
      label: "Zahlungspartner",
      options: input.zahlungspartner.map((partner) => ({
        id: `partner:${partner.id}`,
        name: partner.name,
        iban: partner.ibans[0] ?? "",
        kind: "partner" as const,
      })),
    },
  ];

  const seen = new Set<string>();
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const iban = normalizeIban(option.iban);
        if (!iban) return true;
        if (seen.has(iban)) return false;
        seen.add(iban);
        return true;
      }),
    }))
    .filter((group) => group.options.length > 0);
}

export function filterRecipientOptions(
  groups: RecipientOptionGroup[],
  query: string,
): RecipientOptionGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  const compactNeedle = needle.replace(/\s+/g, "");

  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const name = option.name.toLowerCase();
        const iban = option.iban.replace(/\s+/g, "").toLowerCase();
        return name.includes(needle) || iban.includes(compactNeedle);
      }),
    }))
    .filter((group) => group.options.length > 0);
}
