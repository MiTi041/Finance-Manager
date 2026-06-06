import { normalizeIban } from "../iban";
import { type StoredBankCredentials } from "../bank/credentials";
import { type SelectedBankOption } from "../bank/selected";

type LinkedBankEntry = SelectedBankOption | StoredBankCredentials;

export function buildLinkedAccountLookup(linkedAccounts: LinkedBankEntry[]) {
  const lookup = new Map<string, SelectedBankOption>();

  linkedAccounts.forEach((entry) => {
    const candidates: Array<string | undefined | null> = [];

    if ("accountIban" in entry && entry.accountIban) {
      candidates.push(entry.accountIban);
    }

    if ("account_iban" in entry && entry.account_iban) {
      candidates.push(entry.account_iban);
    }

    const lookupEntry: SelectedBankOption =
      "accountIban" in entry
        ? entry
        : {
            accountIban: normalizeIban(entry.account_iban),
            accountName:
              entry.account_name ||
              entry.bank_name ||
              entry.username ||
              "Konto",
            bankName: entry.bank_name || entry.bank_key,
            bankLogo: entry.bank_logo,
            username: entry.username,
            scope: entry.scope,
          };

    candidates.forEach((candidate) => {
      const iban = normalizeIban(candidate);
      if (iban) {
        lookup.set(iban, lookupEntry);
      }
    });
  });

  return lookup;
}
