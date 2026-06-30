import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay } from "date-fns";

import { normalizeIban } from "@/lib/iban";
import { buildAccountOptions } from "@/lib/utils/accounts";
import { getSelectedBank } from "@/lib/bank/selected";
import { readActiveAccountIban } from "@/lib/bank/active-storage";
import { buildIbanReferenceLookup, resolveTransactionsCounterparty } from "@/lib/iban-reference";

import type { DateFilterValue } from "@/types/date-filter";
import { getTimeSpanForRange } from "@/types/time-range";
import type { Transaction } from "@/types/transaction";

import { useRefresh } from "./use-refresh";
import { useTransactions } from "./use-transactions";
import { useBankCredentials } from "./use-bank-credentials";
import { useIbanReferences } from "./use-iban-references";
import { useSummary } from "./use-summary";
import { useAccountBalances } from "./use-account-balances";

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function calculateBalance(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.betrag.wert, 0);
}

function formatBalance(balance: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(balance);
}

function calculateIncomes(transactions: Transaction[]) {
  return transactions.reduce((total, t) => (t.betrag.wert > 0 ? total + t.betrag.wert : total), 0);
}

function calculateExpenses(transactions: Transaction[]) {
  return transactions.reduce(
    (total, t) => (t.betrag.wert < 0 ? total + Math.abs(t.betrag.wert) : total),
    0,
  );
}

function filterTransactionsByDate(transactions: Transaction[], dateFilter: DateFilterValue) {
  if (dateFilter.timeSpan) {
    const from = startOfDay(dateFilter.timeSpan.from);
    const until = endOfDay(dateFilter.timeSpan.until);
    return transactions.filter((t) => {
      const date = t.daten.buchungsdatum ? new Date(t.daten.buchungsdatum) : null;
      return date && date >= from && date <= until;
    });
  }
  if (!dateFilter.timeRange) return transactions;
  const span = getTimeSpanForRange(dateFilter.timeRange);
  const from = startOfDay(span.from);
  const until = endOfDay(span.until);
  return transactions.filter((t) => {
    const date = t.daten.buchungsdatum ? new Date(t.daten.buchungsdatum) : null;
    return date && date >= from && date <= until;
  });
}

export function useFinanceData(
  dateFilter: DateFilterValue = {},
  { deletedBankTransactionsIncluded = false }: { deletedBankTransactionsIncluded?: boolean } = {},
) {
  const { refreshVersion } = useRefresh();

  const [activeAccountIban, setActiveAccountIban] = useState<string>(() => readActiveAccountIban());

  const queryParams = useMemo(() => {
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

  const { banks: linkedBanks } = useBankCredentials(refreshVersion);
  const { references: ibanReferences } = useIbanReferences(refreshVersion);
  const {
    transactions: rawTransactions,
    loading,
    refreshing,
    error: txError,
    reload: loadTransactions,
  } = useTransactions(queryParams, refreshVersion);
  const { summary } = useSummary(queryParams, refreshVersion);
  const { balances: accountBalancesApi } = useAccountBalances(queryParams, refreshVersion);

  useEffect(() => {
    const onSelectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ accountIban?: string }>;
      setActiveAccountIban(customEvent.detail?.accountIban ?? "all");
    };

    window.addEventListener("finance-bank-selection-change", onSelectionChange);

    return () => {
      window.removeEventListener("finance-bank-selection-change", onSelectionChange);
    };
  }, []);

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

  const activeAccount = useMemo(
    () => getSelectedBank(accountOptions, activeAccountIban),
    [accountOptions, activeAccountIban],
  );

  const selectedAccountIban = activeAccountIban === "all" ? null : activeAccountIban;

  const accountFilteredTransactions = useMemo(() => {
    if (activeAccountIban === "all" || !selectedAccountIban) return rawTransactions;
    return rawTransactions.filter((transaction) => {
      const kontoIban = normalizeIban(transaction.konto?.iban);
      return kontoIban === selectedAccountIban;
    });
  }, [activeAccountIban, selectedAccountIban, rawTransactions]);

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

    const base = summary?.balance ?? calculateBalance(cleanedTransactions);
    if (selectedAccountIban) {
      const c = (accountOptions ?? []).find(
        (a) => a.accountIban === selectedAccountIban,
      )?.balanceCorrection;
      return base + (c ?? 0);
    }
    return base + (accountOptions ?? []).reduce((s, a) => s + (a.balanceCorrection ?? 0), 0);
  }, [cleanedTransactions, filteredTransactions, accountOptions, selectedAccountIban, needsCorrection, summary]);

  const balanceFormatted = useMemo(() => formatBalance(balance), [balance]);

  const incomes = useMemo(() => {
    const txs = needsCorrection ? cleanedTransactions : filteredTransactions;
    const base = summary ? summary.incomes : calculateIncomes(txs);

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
  }, [cleanedTransactions, filteredTransactions, accountOptions, selectedAccountIban, needsCorrection, summary]);

  const expenses = useMemo(() => {
    const txs = needsCorrection ? cleanedTransactions : filteredTransactions;
    const base = summary ? summary.expenses : calculateExpenses(txs);

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
  }, [cleanedTransactions, filteredTransactions, accountOptions, selectedAccountIban, needsCorrection, summary]);

  const incomesFormatted = useMemo(() => formatBalance(incomes), [incomes]);
  const expensesFormatted = useMemo(() => formatBalance(-expenses), [expenses]);

  const accountBalances = useMemo(() => {
    if (selectedAccountIban) return [];

    const source = needsCorrection ? cleanedTransactions : filteredTransactions;
    const byIban = new Map<string, number>();
    for (const t of source) {
      const iban = normalizeIban(t.konto.iban);
      if (iban) {
        byIban.set(iban, (byIban.get(iban) ?? 0) + t.betrag.wert);
      }
    }

    return (accountOptions ?? []).map((account) => {
      const apiBalance = accountBalancesApi.find(
        (ab) => ab.account_iban === account.accountIban,
      );
      return {
        bankLogo: account.bankLogo,
        accountIban: account.accountIban,
        accountName: account.accountName,
        bankName: account.bankName,
        balance:
          (needsCorrection ? (account.balanceCorrection ?? 0) : 0) +
          (apiBalance?.balance ?? byIban.get(account.accountIban) ?? 0),
      };
    });
  }, [accountOptions, cleanedTransactions, filteredTransactions, selectedAccountIban, needsCorrection, accountBalancesApi]);

  const error = txError;
  const transactions = filteredTransactions;
  const transactionCount = transactions.length;

  return {
    loading,
    refreshing,
    error,
    reload: loadTransactions,
    transactions,
    transactionCount,
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
