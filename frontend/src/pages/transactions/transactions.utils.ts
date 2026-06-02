import { type FinanceCategory } from "@/lib/categories";
import { type StoredBankCredentials } from "@/lib/bank-credentials";
import { type SelectedBankOption } from "@/lib/selected-bank";

export const UNASSIGNED_CATEGORY_VALUE = "__unassigned__";

export type TransactionCategoryOption = {
  value: string;
  label: string;
};

type LinkedBankEntry = SelectedBankOption | StoredBankCredentials;

export function normalizeIban(value?: string | null) {
  return value ? value.replace(/\s+/g, "").toUpperCase() : "";
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat("de-DE").format(parsed);
}

export function formatAmount(value?: number | null, currency?: string | null) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(value ?? 0));
}

export function buildCategoryOptions(categories: FinanceCategory[]) {
  const childrenByParent = new Map<number | null, FinanceCategory[]>();

  categories.forEach((category) => {
    const key = category.parent_id ?? null;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
  });

  const sortCategories = (items: FinanceCategory[]) =>
    [...items].sort(
      (left, right) =>
        left.typ.localeCompare(right.typ, "de") ||
        left.name.localeCompare(right.name, "de"),
    );

  const options: TransactionCategoryOption[] = [];

  const walk = (parentId: number | null, depth: number) => {
    sortCategories(childrenByParent.get(parentId) ?? []).forEach((category) => {
      options.push({
        value: String(category.id),
        label: `${"\u00A0\u00A0".repeat(depth)}${category.name}`,
      });
      walk(category.id, depth + 1);
    });
  };

  walk(null, 0);

  return options;
}

export function buildLinkedAccountLookup(linkedAccounts: LinkedBankEntry[]) {
  const lookup = new Map<string, SelectedBankOption>();

  linkedAccounts.forEach((entry) => {
    const candidates: Array<string | undefined | null> = [];

    if ("accountIban" in entry && entry.accountIban) {
      candidates.push(entry.accountIban);
    }

    if ("iban" in entry && entry.iban) {
      candidates.push(entry.iban);
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
