"use client";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/useFinanceData";
import { CircleX } from "lucide-react";

export default function DashboardPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const {
    balance,
    balanceFormatted,
    incomes,
    incomesFormatted,
    expenses,
    expensesFormatted,
    transactionCount,
    loading,
    refreshing,
    error,
    reload,
    transactions,
  } = useFinanceData(dateFilter);

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Daten"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <DateFilter value={dateFilter} onChange={setDateFilter} />

      <p>{balanceFormatted}</p>
      <p>{incomesFormatted}</p>
      <p>{expensesFormatted}</p>
    </div>
  );
}
