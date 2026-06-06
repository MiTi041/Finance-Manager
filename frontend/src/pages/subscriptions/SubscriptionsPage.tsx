"use client";

import { CircleX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/useFinanceData";

export default function SubscriptionsPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();

  const { loading, error } = useFinanceData(dateFilter);

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Transaktionen"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6"></div>;
}
