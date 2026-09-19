import { useMemo } from "react";
import { CircleDashed, CircleX, Loader2 } from "lucide-react";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { filterTransactionsByDate, useFinanceData } from "@/hooks/use-finance-data";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";

import { AccountFlowGraph } from "@/pages/account-flow/account-flow-graph";
import { buildAccountFlowGraph, type AccountFlowGraph as AccountFlowGraphData } from "./account-flow-data";

const ALL_TIME = {};

export default function AccountFlowPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const { loading, refreshing, error, transactions, linkedAccounts, accountBalances } =
    useFinanceData(ALL_TIME, { ignoreActiveAccountFilter: true });

  // Card numbers (balance + external flow) are all-time; the date filter only
  // narrows which edges are drawn.
  const allTimeGraph = useMemo(
    () => buildAccountFlowGraph(linkedAccounts, transactions, accountBalances),
    [linkedAccounts, transactions, accountBalances],
  );

  const periodGraph = useMemo(
    () =>
      buildAccountFlowGraph(
        linkedAccounts,
        filterTransactionsByDate(transactions, dateFilter),
        accountBalances,
      ),
    [linkedAccounts, transactions, accountBalances, dateFilter],
  );

  const graph = useMemo<AccountFlowGraphData>(
    () => ({ nodes: allTimeGraph.nodes, edges: periodGraph.edges }),
    [allTimeGraph, periodGraph],
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
    <div className="flex h-[calc(100svh-4rem)] w-full flex-col gap-6 overflow-hidden py-6">
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
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-panel border border-border bg-card">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : graph.edges.length === 0 ? (
        <EmptyState
          title="Keine internen Geldflüsse gefunden"
          text="Im ausgewählten Zeitraum wurden keine Überweisungen zwischen deinen eigenen Konten erkannt."
          illustration={<CircleDashed />}
        />
      ) : (
        <AccountFlowGraph graph={graph} activeAccountIban="all" />
      )}
    </div>
  );
}
