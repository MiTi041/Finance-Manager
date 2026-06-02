"use client";

import { useMemo } from "react";

import { useTransactionsData } from "@/hooks/useTransactionsData";
import type { DateFilterValue } from "@/types/date-filter";
import type { Transaction } from "@/types/transaction";

type UseFinanceDataResult = {
  balance: number;
  balanceFormatted: string;
  incomes: number;
  incomesFormatted: string;
  expenses: number;
  expensesFormatted: string;
  transactionCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  transactions: Transaction[];
};

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

export function useFinanceData(
  dateFilter: DateFilterValue = {},
): UseFinanceDataResult {
  const { transactions, loading, refreshing, error, reload } =
    useTransactionsData(dateFilter);
  const { transactions: allTransactions } = useTransactionsData();

  const balance = useMemo(
    () => calculateBalance(allTransactions),
    [allTransactions],
  );

  const balanceFormatted = useMemo(() => formatBalance(balance), [balance]);

  const incomes = useMemo(
    () => calculateIncomes(allTransactions),
    [allTransactions],
  );

  const expenses = useMemo(
    () => calculateExpenses(allTransactions),
    [allTransactions],
  );

  const incomesFormatted = useMemo(() => formatBalance(incomes), [incomes]);
  const expensesFormatted = useMemo(() => formatBalance(-expenses), [expenses]);

  return {
    balance,
    balanceFormatted,
    transactionCount: transactions.length,
    loading,
    refreshing,
    error,
    reload,
    incomes,
    incomesFormatted,
    expenses,
    expensesFormatted,
    transactions,
  };
}
