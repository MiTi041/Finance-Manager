import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";

import { getApiBaseUrl } from "@/lib/api";
import { buildIbanReferenceLookup, resolveTransactionsCounterparty } from "@/lib/iban-reference";

import { type BankDefinition } from "@/lib/bank/definitions";

import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";

import { fetchIbanZahlungspartnerReferences } from "@/lib/reference-data";

import { type Transaction, type TransactionDto } from "@/types/transaction";
import { mapTransaction } from "@/lib/mappers";
import type {
  IbanZahlungspartnerReference,
  IbanZahlungspartnerReferenceDto,
} from "@/types/iban-reference";
import { DateFilterValue } from "@/types/date-filter";
import { getTimeSpanForRange } from "@/types/time-range";
import { getSelectedBank, type SelectedBankOption } from "@/lib/bank/selected";
import { normalizeIban } from "@/lib/iban";
import { buildAccountOptions, resolveAccountSelection } from "@/lib/utils/accounts";
import { getErrorMessage } from "@/lib/utils/error";

const ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-account-iban.v1";
const LEGACY_ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-bank-scope.v1";

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function calculateBalance(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => {
    return total + transaction.betrag.wert;
  }, 0);
}

function formatBalance(balance: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(balance);
}

function calculateIncomes(transactions: Transaction[]) {
  return transactions.reduce((total, t) => {
    const v = t.betrag.wert;
    return v > 0 ? total + v : total;
  }, 0);
}

function calculateExpenses(transactions: Transaction[]) {
  return transactions.reduce((total, t) => {
    const v = t.betrag.wert;
    return v < 0 ? total + Math.abs(v) : total;
  }, 0);
}

function filterTransactionsByDate(transactions: Transaction[], dateFilter: DateFilterValue) {
  if (!dateFilter.timeSpan && !dateFilter.timeRange) return transactions;

  const span = dateFilter.timeSpan ?? getTimeSpanForRange(dateFilter.timeRange!);
  const from = startOfDay(span.from);
  const until = endOfDay(span.until);

  return transactions.filter((t) => {
    const date = t.daten.buchungsdatum ? new Date(t.daten.buchungsdatum) : null;
    return date && isWithinInterval(date, { start: from, end: until });
  });
}

export function useFinanceData(
  dateFilter: DateFilterValue = {},
  { deletedBankTransactionsIncluded = false }: { deletedBankTransactionsIncluded?: boolean } = {},
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeAccountIban, setActiveAccountIban] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return (
      window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
      "all"
    );
  });

  const [linkedBanks, setLinkedBanks] = useState<StoredBankCredentials[]>([]);
  const [ibanReferences, setIbanReferences] = useState<IbanZahlungspartnerReference[]>([]);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const transactionQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFilter.timeSpan) {
      params.set("from_date", toDateParam(startOfDay(dateFilter.timeSpan.from)));
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
    const base = buildAccountOptions(linkedBanks);
    const balanceByIban = new Map<string, number | null>();
    linkedBanks.forEach((bank) => {
      (bank.accounts ?? []).forEach((account) => {
        const iban = normalizeIban(account.iban);
        if (iban) balanceByIban.set(iban, account.balance ?? null);
      });
    });
    return base.map((opt) => ({
      ...opt,
      balanceCorrection: balanceByIban.get(opt.accountIban) ?? null,
    }));
  }, [linkedBanks]);

  const resolveSelection = useCallback(
    (selection: string) => resolveAccountSelection(selection, accountOptions, linkedBanks),
    [accountOptions, linkedBanks],
  );

  const loadBankMeta = useCallback(async () => {
    const banks = await fetchBankCredentials().catch(() => []);
    setLinkedBanks(banks);
  }, []);

  const loadIbanReferences = useCallback(async () => {
    const rawReferences: IbanZahlungspartnerReferenceDto[] =
      await fetchIbanZahlungspartnerReferences().catch(() => []);

    setIbanReferences(
      rawReferences.map((reference) => ({
        iban: reference.iban,
        zahlungspartnerId: reference.f_zahlungspartner_id,
        zahlungspartnerName: reference.zahlungspartner_name,
        zahlungspartnerWebsite: reference.zahlungspartner_website ?? null,
        zahlungspartnerLogoUrl: reference.zahlungspartner_logo_url ?? null,
        zahlungspartnerLogoWhiteBackground: reference.zahlungspartner_logo_white_background ?? false,
        zahlungspartnerLogoPadding: reference.zahlungspartner_logo_padding ?? false,
        zahlungspartnerIsCompany: Boolean(reference.zahlungspartner_is_company ?? true),
        resolvedLogoUrl: reference.resolved_logo_url ?? null,
      })),
    );
  }, []);

  const loadTransactions = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/db/transactions?${transactionQuery}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Transaktionen konnten nicht geladen werden");
      }
      const rawTransactions: TransactionDto[] = Array.isArray(payload?.transactions)
        ? payload.transactions
        : [];
      setTransactions(rawTransactions.map(mapTransaction));
    } catch (err) {
      setError(getErrorMessage(err));
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
      const nextSelection = customEvent.detail?.accountIban ?? customEvent.detail?.scope ?? "all";
      setActiveAccountIban(resolveSelection(nextSelection));
    };

    const onBankCredentialsChanged = () => void loadBankMeta();
    const onDataRefresh = () => void loadTransactions();
    const onReferenceDataChange = () => void loadIbanReferences();

    window.addEventListener("finance-bank-selection-change", onSelectionChange);
    window.addEventListener("finance-bank-credentials-changed", onBankCredentialsChanged);
    window.addEventListener("finance-data-refresh", onDataRefresh);
    window.addEventListener("finance-reference-data-changed", onReferenceDataChange);

    return () => {
      window.removeEventListener("finance-bank-selection-change", onSelectionChange);
      window.removeEventListener("finance-bank-credentials-changed", onBankCredentialsChanged);
      window.removeEventListener("finance-data-refresh", onDataRefresh);
      window.removeEventListener("finance-reference-data-changed", onReferenceDataChange);
    };
  }, [loadBankMeta, loadIbanReferences, loadTransactions, resolveSelection]);

  const activeAccount = useMemo(
    () => getSelectedBank(accountOptions, activeAccountIban),
    [accountOptions, activeAccountIban],
  );

  const selectedAccountIban = activeAccountIban === "all" ? null : activeAccountIban;

  const accountFilteredTransactions = useMemo(() => {
    if (activeAccountIban === "all" || !selectedAccountIban) return transactions;
    return transactions.filter((transaction) => {
      const kontoIban = normalizeIban(transaction.konto?.iban);
      return kontoIban === selectedAccountIban;
    });
  }, [activeAccountIban, selectedAccountIban, transactions]);

  const resolvedTransactions = useMemo(() => {
    const lookup = buildIbanReferenceLookup(ibanReferences);
    return resolveTransactionsCounterparty(accountFilteredTransactions, lookup);
  }, [accountFilteredTransactions, ibanReferences]);

  const cleanedTransactions = useMemo(
    () =>
      deletedBankTransactionsIncluded
        ? resolvedTransactions
        : resolvedTransactions.filter((t) => !t.technisch.bankDeleted),
    [deletedBankTransactionsIncluded, resolvedTransactions],
  );

  const filteredTransactions = useMemo(
    () => filterTransactionsByDate(cleanedTransactions, dateFilter),
    [cleanedTransactions, dateFilter],
  );

  const needsCorrection = useMemo(() => {
    return !dateFilter.timeSpan && !dateFilter.timeRange;
  }, [dateFilter]);

  const balance = useMemo(() => {
    if (!needsCorrection) return calculateBalance(filteredTransactions);

    const fullSum = calculateBalance(cleanedTransactions);
    if (selectedAccountIban) {
      const c = (accountOptions ?? []).find(
        (a) => a.accountIban === selectedAccountIban,
      )?.balanceCorrection;
      return fullSum + (c ?? 0);
    }
    return fullSum + (accountOptions ?? []).reduce((s, a) => s + (a.balanceCorrection ?? 0), 0);
  }, [
    cleanedTransactions,
    filteredTransactions,
    accountOptions,
    selectedAccountIban,
    needsCorrection,
  ]);

  const balanceFormatted = useMemo(() => formatBalance(balance), [balance]);

  const incomes = useMemo(() => {
    const txs = needsCorrection ? cleanedTransactions : filteredTransactions;
    const base = calculateIncomes(txs);
    if (!needsCorrection) return base;

    if (selectedAccountIban) {
      const correction = (accountOptions ?? []).find(
        (a) => a.accountIban === selectedAccountIban,
      )?.balanceCorrection;
      return correction && correction > 0 ? base + correction : base;
    }

    let positiveCorrectionSum = 0;
    for (const account of accountOptions) {
      const c = account.balanceCorrection;
      if (c && c > 0) positiveCorrectionSum += c;
    }
    return base + positiveCorrectionSum;
  }, [
    cleanedTransactions,
    filteredTransactions,
    accountOptions,
    selectedAccountIban,
    needsCorrection,
  ]);

  const expenses = useMemo(() => {
    const txs = needsCorrection ? cleanedTransactions : filteredTransactions;
    const base = calculateExpenses(txs);
    if (!needsCorrection) return base;

    if (selectedAccountIban) {
      const correction = (accountOptions ?? []).find(
        (a) => a.accountIban === selectedAccountIban,
      )?.balanceCorrection;
      return correction && correction < 0 ? base + Math.abs(correction) : base;
    }

    let negativeCorrectionSum = 0;
    for (const account of accountOptions) {
      const c = account.balanceCorrection;
      if (c && c < 0) negativeCorrectionSum += Math.abs(c);
    }
    return base + negativeCorrectionSum;
  }, [
    cleanedTransactions,
    filteredTransactions,
    accountOptions,
    selectedAccountIban,
    needsCorrection,
  ]);
  const incomesFormatted = useMemo(() => formatBalance(incomes), [incomes]);
  const expensesFormatted = useMemo(() => formatBalance(-expenses), [expenses]);

  const accountBalances = useMemo(() => {
    if (selectedAccountIban) return [];

    const byIban = new Map<string, number>();
    const source = needsCorrection ? cleanedTransactions : filteredTransactions;
    for (const t of source) {
      const iban = normalizeIban(t.konto.iban);
      if (iban) {
        byIban.set(iban, (byIban.get(iban) ?? 0) + t.betrag.wert);
      }
    }

    return (accountOptions ?? []).map((account) => ({
      bankLogo: account.bankLogo,
      accountIban: account.accountIban,
      accountName: account.accountName,
      bankName: account.bankName,
      balance:
        (needsCorrection ? (account.balanceCorrection ?? 0) : 0) +
        (byIban.get(account.accountIban) ?? 0),
    }));
  }, [
    accountOptions,
    cleanedTransactions,
    filteredTransactions,
    selectedAccountIban,
    needsCorrection,
  ]);

  return {
    loading,
    refreshing,
    error,
    reload: loadTransactions,
    transactions: filteredTransactions,
    transactionCount: filteredTransactions.length,
    balance,
    balanceFormatted,
    incomes,
    incomesFormatted,
    expenses,
    expensesFormatted,
    linkedAccounts: accountOptions,
    selectedBank: activeAccount,
    activeAccountIban,
    accountBalances,
  };
}
