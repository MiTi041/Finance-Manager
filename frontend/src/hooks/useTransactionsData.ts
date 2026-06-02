"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay } from "date-fns";

import { getApiBaseUrl } from "@/lib/db";
import {
  buildIbanReferenceLookup,
  resolveTransactionsCounterparty,
} from "@/lib/iban-reference";

import { fetchAvailableBanks, type BankDefinition } from "@/lib/banks";

import {
  fetchBankCredentials,
  type StoredBankCredentials,
} from "@/lib/bank-credentials";

import { fetchIbanKontoinhaberReferences } from "@/lib/db";

import {
  Transaction,
  TransactionDto,
  mapTransaction,
} from "@/types/transaction";
import type {
  IbanKontoinhaberReference,
  IbanKontoinhaberReferenceDto,
} from "@/types/iban-reference";
import { DateFilterValue } from "@/types/date-filter";
import { getTimeSpanForRange } from "@/types/time-range";
import { getSelectedBank, type SelectedBankOption } from "@/lib/selected-bank";

const ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-account-iban.v1";
const LEGACY_ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-bank-scope.v1";

function normalizeIban(iban?: string | null) {
  if (!iban) return null;

  const normalized = iban.replace(/\s+/g, "").toUpperCase();

  if (normalized.length < 15) {
    return null;
  }

  return normalized;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Transaktionen konnten nicht geladen werden";
}

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function useTransactionsData(dateFilter: DateFilterValue = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [activeAccountIban, setActiveAccountIban] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "all";
    }

    return (
      window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
      "all"
    );
  });

  const [linkedBanks, setLinkedBanks] = useState<StoredBankCredentials[]>([]);

  const [availableBanks, setAvailableBanks] = useState<BankDefinition[]>([]);

  const [ibanReferences, setIbanReferences] = useState<
    IbanKontoinhaberReference[]
  >([]);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const transactionQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (dateFilter.timeSpan) {
      params.set(
        "from_date",
        toDateParam(startOfDay(dateFilter.timeSpan.from)),
      );
      params.set("to_date", toDateParam(endOfDay(dateFilter.timeSpan.until)));
    } else if (dateFilter.timeRange) {
      const span = getTimeSpanForRange(dateFilter.timeRange);
      params.set("from_date", toDateParam(startOfDay(span.from)));
      params.set("to_date", toDateParam(endOfDay(span.until)));
    } else {
      params.set("days", "36500");
    }

    if (activeAccountIban !== "all") {
      params.set("iban", activeAccountIban);
    }

    return params.toString();
  }, [activeAccountIban, dateFilter]);

  const accountOptions = useMemo(() => {
    const items: SelectedBankOption[] = [];

    linkedBanks.forEach((bank) => {
      const accounts = (bank.accounts ?? []).filter((account) => account?.iban);

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
              bankLogo: bank.bank_logo,
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
          accountName:
            bank.account_name || bank.bank_name || bank.username || "Konto",
          bankName: bank.bank_name || bank.bank_key,
          bankLogo: bank.bank_logo,
          username: bank.username,
          scope: bank.scope,
        });
      }
    });

    return items;
  }, [linkedBanks]);

  const resolveSelection = useCallback(
    (selection: string) => {
      if (selection === "all") {
        return "all";
      }

      const normalizedSelection = normalizeIban(selection);
      if (normalizedSelection) {
        const byIban = accountOptions.find(
          (item) => item.accountIban === normalizedSelection,
        );
        if (byIban) {
          return byIban.accountIban;
        }
      }

      const legacyBank = linkedBanks.find((bank) => bank.scope === selection);
      const legacyFallback =
        legacyBank?.accounts?.find((account) => normalizeIban(account.iban))
          ?.iban ?? legacyBank?.account_iban;

      return normalizeIban(legacyFallback) ?? "all";
    },
    [accountOptions, linkedBanks],
  );

  const loadBankMeta = useCallback(async () => {
    const [banks, definitions] = await Promise.all([
      fetchBankCredentials().catch(() => []),

      fetchAvailableBanks().catch(() => []),
    ]);

    setLinkedBanks(banks);
    setAvailableBanks(definitions);
  }, []);

  const loadIbanReferences = useCallback(async () => {
    const rawReferences: IbanKontoinhaberReferenceDto[] =
      await fetchIbanKontoinhaberReferences().catch(() => []);

    setIbanReferences(
      rawReferences.map((reference) => ({
        iban: reference.iban,
        kontoinhaberId: reference.f_kontoinhaber_id,
        kontoinhaberName: reference.kontoinhaber_name,
        kontoinhaberWebsite: reference.kontoinhaber_website ?? null,
        kontoinhaberLogoUrl: reference.kontoinhaber_logo_url ?? null,
        kontoinhaberLogoWhiteBackground:
          reference.kontoinhaber_logo_white_background ?? false,
        kontoinhaberLogoPadding: reference.kontoinhaber_logo_padding ?? false,
        kontoinhaberIsCompany: Boolean(
          reference.kontoinhaber_is_company ?? true,
        ),
        resolvedLogoUrl: reference.resolved_logo_url ?? null,
      })),
    );
  }, []);

  const loadTransactions = useCallback(async () => {
    setError(null);
    setRefreshing(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/db/transactions?${transactionQuery}`,
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.detail ?? "Transaktionen konnten nicht geladen werden",
        );
      }

      const rawTransactions: TransactionDto[] = Array.isArray(
        payload?.transactions,
      )
        ? payload.transactions
        : [];

      const mappedTransactions = rawTransactions.map(mapTransaction);

      setTransactions(mappedTransactions);
    } catch (err) {
      const message = getErrorMessage(err);

      setError(message);

      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBaseUrl, transactionQuery]);

  useEffect(() => {
    void loadBankMeta();
    void loadIbanReferences();
    void loadTransactions();
  }, [loadBankMeta, loadIbanReferences, loadTransactions]);

  useEffect(() => {
    const onSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        accountIban?: string;
        scope?: string;
      }>;
      const nextSelection =
        customEvent.detail?.accountIban ?? customEvent.detail?.scope ?? "all";
      setActiveAccountIban(resolveSelection(nextSelection));
    };

    window.addEventListener("finance-bank-selection-change", onSelectionChange);
    window.addEventListener(
      "finance-bank-credentials-changed",
      () => void loadBankMeta(),
    );
    window.addEventListener(
      "finance-data-refresh",
      () => void loadTransactions(),
    );
    const onReferenceDataChange = () => {
      void loadIbanReferences();
    };
    window.addEventListener(
      "finance-reference-data-changed",
      onReferenceDataChange,
    );

    return () => {
      window.removeEventListener(
        "finance-bank-selection-change",
        onSelectionChange,
      );
      window.removeEventListener(
        "finance-bank-credentials-changed",
        () => void loadBankMeta(),
      );
      window.removeEventListener(
        "finance-data-refresh",
        () => void loadTransactions(),
      );
      window.removeEventListener(
        "finance-reference-data-changed",
        onReferenceDataChange,
      );
    };
  }, [loadBankMeta, loadIbanReferences, loadTransactions, resolveSelection]);

  const activeAccount = useMemo(
    () => getSelectedBank(accountOptions, activeAccountIban),
    [accountOptions, activeAccountIban],
  );

  const activeBankLabel =
    activeAccountIban === "all"
      ? "Alle Konten"
      : activeAccount?.accountName ||
        activeAccount?.bankName ||
        "Verknüpftes Konto";

  const getSelectedBankFromHook = useCallback(
    () => activeAccount,
    [activeAccount],
  );

  const selectedAccountIban =
    activeAccountIban === "all" ? null : activeAccountIban;

  const filteredTransactions = useMemo(() => {
    if (activeAccountIban === "all" || !selectedAccountIban) {
      return transactions;
    }

    return transactions.filter((transaction) => {
      const kontoIban = normalizeIban(transaction.konto?.iban);

      return kontoIban === selectedAccountIban;
    });
  }, [activeAccountIban, selectedAccountIban, transactions]);

  const resolvedTransactions = useMemo(() => {
    const lookup = buildIbanReferenceLookup(ibanReferences);

    return resolveTransactionsCounterparty(filteredTransactions, lookup);
  }, [filteredTransactions, ibanReferences]);

  return {
    loading,
    refreshing,
    error,

    transactions: resolvedTransactions,
    linkedAccounts: accountOptions,
    availableBanks,

    totalRows: resolvedTransactions.length,

    activeBankScope: activeAccountIban,
    activeBankLabel,
    selectedBank: activeAccount,
    getSelectedBank: getSelectedBankFromHook,
    selectedBankBlz: selectedAccountIban,

    reload: loadTransactions,
  };
}
