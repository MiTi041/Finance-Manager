import { normalizeIban } from "./iban.ts";
import type { BankAccountOption } from "./utils/accounts";
import type { RecipientAccountRecord } from "./recipient-accounts";
import type { ZahlungspartnerRecord } from "./zahlungspartner";

export type RecipientOptionKind = "own" | "recipient" | "partner";

export type RecipientOption = {
  id: string;
  kind: RecipientOptionKind;
  name: string;
  label: string;
  subtitle: string;
  iban: string;
  isPrimary?: boolean;
  bankLogo?: string;
  bankLogoDark?: string;
  logoPadding?: number;
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
        kind: "own" as const,
        name: account.holderName || account.accountName,
        label: account.accountName,
        subtitle: account.holderName
          ? `${account.holderName} · ${account.accountIban}`
          : account.accountIban,
        iban: account.accountIban,
        isPrimary: account.isPrimary === true,
        bankLogo: account.bankLogo,
        bankLogoDark: account.bankLogoDark,
        logoPadding: account.logoPadding,
      })),
    },
    {
      kind: "recipient",
      label: "Empfängerkonten",
      options: input.recipientAccounts.map((account) => {
        const name = account.recipient_name || account.account_name;
        return {
          id: `recipient:${account.id}`,
          kind: "recipient" as const,
          name,
          label: name,
          subtitle: account.iban,
          iban: account.iban,
        };
      }),
    },
    {
      kind: "partner",
      label: "Zahlungspartner",
      options: input.zahlungspartner.map((partner) => {
        const iban = partner.ibans[0] ?? "";
        return {
          id: `partner:${partner.id}`,
          kind: "partner" as const,
          name: partner.name,
          label: partner.name,
          subtitle: iban,
          iban,
        };
      }),
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
        const text = `${option.label} ${option.subtitle}`.toLowerCase();
        const iban = option.iban.replace(/\s+/g, "").toLowerCase();
        return text.includes(needle) || iban.includes(compactNeedle);
      }),
    }))
    .filter((group) => group.options.length > 0);
}
