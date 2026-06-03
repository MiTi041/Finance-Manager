"use client";

import { useMemo } from "react";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";

import { useTransactionsData } from "@/hooks/useTransactionsData";
import type { DateFilterValue } from "@/types/date-filter";
import type { Transaction } from "@/types/transaction";
import { getTimeSpanForRange } from "@/types/time-range";

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

function filterTransactionsByDate(
  transactions: Transaction[],
  dateFilter: DateFilterValue,
) {
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
) {
  const { transactions, loading, refreshing, error, reload } =
    useTransactionsData();

  const filteredTransactions = useMemo(
    () => filterTransactionsByDate(transactions, dateFilter),
    [transactions, dateFilter],
  );

  const balance = useMemo(() => calculateBalance(transactions), [transactions]);
  const balanceFormatted = useMemo(() => formatBalance(balance), [balance]);
  const incomes = useMemo(() => calculateIncomes(transactions), [transactions]);
  const expenses = useMemo(() => calculateExpenses(transactions), [transactions]);
  const incomesFormatted = useMemo(() => formatBalance(incomes), [incomes]);
  const expensesFormatted = useMemo(() => formatBalance(-expenses), [expenses]);

  return {
    balance,
    balanceFormatted,
    transactionCount: filteredTransactions.length,
    loading,
    refreshing,
    error,
    reload,
    incomes,
    incomesFormatted,
    expenses,
    expensesFormatted,
    transactions: filteredTransactions,
  };
}
