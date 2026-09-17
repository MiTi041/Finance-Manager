import { useMemo } from "react";
import { CircleDashed, CircleX, Loader2 } from "lucide-react";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { useFinanceData } from "@/hooks/use-finance-data";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";

import { AccountFlowGraph } from "@/pages/account-flow/account-flow-graph";
import { buildAccountFlowGraph } from "./account-flow-data";

export default function AccountFlowPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const {
    loading,
    refreshing,
    error,
    transactions,
    linkedAccounts,
    accountBalances,
    activeAccountIban,
  } = useFinanceData(dateFilter, { ignoreActiveAccountFilter: true });

  const graph = useMemo(
    () => buildAccountFlowGraph(linkedAccounts, transactions, accountBalances),
    [linkedAccounts, transactions, accountBalances],
  );

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Geldflüsse"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          {refreshing && (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Aktualisiere"
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[610px] items-center justify-center rounded-panel border border-border bg-card">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : graph.edges.length === 0 ? (
        <EmptyState
          title="Keine internen Geldflüsse gefunden"
          text="Im ausgewählten Zeitraum wurden keine Überweisungen zwischen deinen eigenen Konten erkannt."
          illustration={<CircleDashed />}
        />
      ) : (
        <AccountFlowGraph graph={graph} activeAccountIban={activeAccountIban} />
      )}
    </div>
  );
}
