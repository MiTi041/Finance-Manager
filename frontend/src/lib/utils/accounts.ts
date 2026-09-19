import { normalizeIban } from "../iban";
import { type StoredBankCredentials } from "../bank/credentials";
import { type SelectedBankOption } from "../bank/selected";

type LinkedBankEntry = SelectedBankOption | StoredBankCredentials;

export type BankAccountOption = {
  accountIban: string;
  accountName: string;
  holderName?: string;
  bankName: string;
  bankLogo?: string;
  bankLogoDark?: string;
  logoPadding?: number;
  /** Fixed payout IBAN of the provider, treated as part of this account. */
  senderIban?: string | null;
  username?: string;
  scope: string;
  manual?: boolean;
  balanceCorrection?: number | null;
  /** Konto bleibt sichtbar, fließt aber nicht in Dashboard-Summen/Charts ein. */
  excludeFromTotals?: boolean;
};

export function buildAccountOptions(
  linkedBanks: StoredBankCredentials[],
  { includeArchived = false }: { includeArchived?: boolean } = {},
): BankAccountOption[] {
  const items: BankAccountOption[] = [];

  linkedBanks.forEach((bank) => {
    const storedAccounts = bank.accounts ?? [];
    const accounts = (bank.accounts ?? []).filter(
      (account) => Boolean(account?.iban) && (includeArchived || account.archived !== true),
    );

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
            holderName: account.holder_name || undefined,
            bankName: account.bank_name || bank.bank_name || bank.bank_key,
            bankLogo: account.bank_logo || bank.bank_logo || undefined,
            bankLogoDark: account.bank_logo_dark || bank.bank_logo_dark || undefined,
            logoPadding: bank.logo_padding || undefined,
            senderIban: account.sender_iban || undefined,
            username: bank.username,
            scope: bank.scope,
            manual: bank.manual === true,
            excludeFromTotals: account.exclude_from_totals === true,
          });
        }
      });
      return;
    }

    if (storedAccounts.length > 0) return;

    const fallbackIban = normalizeIban(bank.account_iban);
    if (fallbackIban) {
      items.push({
        accountIban: fallbackIban,
        accountName: bank.account_name || bank.bank_name || bank.username || "Konto",
        bankName: bank.bank_name || bank.bank_key,
        bankLogo: bank.bank_logo || undefined,
        bankLogoDark: bank.bank_logo_dark || undefined,
        logoPadding: bank.logo_padding || undefined,
        username: bank.username,
        scope: bank.scope,
        manual: bank.manual === true,
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
    const byIban = accountOptions.find((item) => item.accountIban === normalizedSelection);
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
    if ("accounts" in entry && entry.accounts?.length) {
      entry.accounts.forEach((account) => {
        const iban = normalizeIban(account.iban);
        if (!iban) return;

        const option: SelectedBankOption = {
          accountIban: iban,
          accountName:
            account.account_name ||
            entry.account_name ||
            entry.bank_name ||
            entry.username ||
            "Konto",
          bankName: account.bank_name || entry.bank_name || entry.bank_key,
          bankLogo: account.bank_logo || entry.bank_logo,
          bankLogoDark: account.bank_logo_dark || entry.bank_logo_dark,
          username: entry.username,
          scope: entry.scope,
          manual: entry.manual === true,
          archived: account.archived === true,
        };
        lookup.set(iban, option);

        // The provider's payout IBAN belongs to the same account, so transfers
        // from it are recognised as internal (Kontotransfer).
        const senderIban = normalizeIban(account.sender_iban);
        if (senderIban && !lookup.has(senderIban)) {
          lookup.set(senderIban, option);
        }
      });
      return;
    }

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
            accountName: entry.account_name || entry.bank_name || entry.username || "Konto",
            bankName: entry.bank_name || entry.bank_key,
            bankLogo: entry.bank_logo,
            bankLogoDark: entry.bank_logo_dark,
            username: entry.username,
            scope: entry.scope,
            manual: entry.manual === true,
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
