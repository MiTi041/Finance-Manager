import { normalizeIban } from "../iban";
import { type StoredBankCredentials } from "../bank/credentials";
import { type SelectedBankOption } from "../bank/selected";

type LinkedBankEntry = SelectedBankOption | StoredBankCredentials;

export type BankAccountOption = {
  accountIban: string;
  accountName: string;
  bankName: string;
  bankLogo?: string;
  username?: string;
  scope: string;
  balanceCorrection?: number | null;
};

export function buildAccountOptions(
  linkedBanks: StoredBankCredentials[],
): BankAccountOption[] {
  const items: BankAccountOption[] = [];

  linkedBanks.forEach((bank) => {
    const accounts = (bank.accounts ?? []).filter((account) => Boolean(account?.iban));

    if (accounts.length > 0) {
      accounts.forEach((account) => {
        const iban = normalizeIban(account.iban);
        if (iban) {
          items.push({
            accountIban: iban,
            accountName:
              account.account_name ||
              bank.account_name ||
              bank.bank_name ||
              bank.username ||
              "Konto",
            bankName: bank.bank_name || bank.bank_key,
            bankLogo: bank.bank_logo || undefined,
            username: bank.username,
            scope: bank.scope,
          });
        }
      });
      return;
    }

    const fallbackIban = normalizeIban(bank.account_iban);
    if (fallbackIban) {
      items.push({
        accountIban: fallbackIban,
        accountName: bank.account_name || bank.bank_name || bank.username || "Konto",
        bankName: bank.bank_name || bank.bank_key,
        bankLogo: bank.bank_logo || undefined,
        username: bank.username,
        scope: bank.scope,
      });
    }
  });

  return items;
}

export function resolveAccountSelection(
  selection: string,
  accountOptions: BankAccountOption[],
  linkedBanks: StoredBankCredentials[],
): string {
  if (selection === "all") return "all";

  const normalizedSelection = normalizeIban(selection);
  if (normalizedSelection) {
    const byIban = accountOptions.find(
      (item) => item.accountIban === normalizedSelection,
    );
    if (byIban) return byIban.accountIban;
  }

  const legacyBank = linkedBanks.find((bank) => bank.scope === selection);
  const legacyFallback =
    legacyBank?.accounts?.find((account) => normalizeIban(account.iban))?.iban ??
    legacyBank?.account_iban;
  return normalizeIban(legacyFallback) || "all";
}

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
