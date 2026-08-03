import { useMemo, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  CircleX,
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  CircleDashed,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/use-finance-data";
import { useRefresh } from "@/hooks/use-refresh";
import { normalizeIban } from "@/lib/iban";
import { fetchAvailableBanks } from "@/lib/bank/credentials";
import {
  fetchRecipientAccountsReferenceData,
  createRecipientAccount,
  type RecipientAccountRecord,
} from "@/lib/recipient-accounts";
import { executeDirectTransfer } from "@/lib/direct-transfer";
import {
  TransferSetupDialog,
  type TransferSetupResult,
  type SenderAccount,
  type OwnAccount,
} from "./components/transfer-setup-dialog";
import { getTimeSpanForRange } from "@/types/time-range";
import type { DateFilterValue } from "@/types/date-filter";

import { StatCard } from "./components/stat-card";
import { BalanceChart } from "./components/balance-chart";
import { MonthlyChart } from "./components/monthly-chart";
import { DashboardSkeleton } from "./components/dashboard-skeleton";

function computeDateFooter(dateFilter: DateFilterValue) {
  if (dateFilter.timeSpan) {
    return `${format(dateFilter.timeSpan.from, "dd.MM.yy")} – ${format(dateFilter.timeSpan.until, "dd.MM.yy")}`;
  }
  if (dateFilter.timeRange) {
    const span = getTimeSpanForRange(dateFilter.timeRange);
    return `${format(span.from, "dd.MM.yy")} – ${format(span.until, "dd.MM.yy")}`;
  }
  return null;
}

export default function DashboardPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const { triggerRefresh } = useRefresh();
  const {
    balance,
    incomes,
    expenses,
    transactionCount,
    loading,
    refreshing,
    error,
    transactions,
    activeAccountIban,
    accountBalances,
    linkedAccounts,
    linkedBanks,
  } = useFinanceData(dateFilter);

  const [canTransferMap, setCanTransferMap] = useState<Map<string, boolean>>(new Map());
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    void fetchAvailableBanks().then((banks) =>
      setCanTransferMap(new Map(banks.map((b) => [b.key, b.can_transfer]))),
    );
    void fetchRecipientAccountsReferenceData().then((data) =>
      setRecipientAccounts(data.recipient_accounts ?? []),
    );
  }, []);

  const dateFooter = useMemo(() => computeDateFooter(dateFilter), [dateFilter]);

  const savingsRate = incomes > 0 ? (((incomes - expenses) / incomes) * 100).toFixed(0) : "0";
  const expensePct = ((expenses / (incomes + expenses || 1)) * 100).toFixed(0);
  const incomePct = ((incomes / (incomes + expenses || 1)) * 100).toFixed(0);

  const bankKeyByIban = useMemo(() => {
    const map = new Map<string, string>();
    for (const bank of linkedBanks) {
      for (const acc of bank.accounts ?? []) {
        const iban = normalizeIban(acc.iban);
        if (iban) map.set(iban, bank.bank_key);
      }
    }
    return map;
  }, [linkedBanks]);

  const senderAccounts: SenderAccount[] = useMemo(
    () =>
      accountBalances
        .filter((a) => canTransferMap.get(bankKeyByIban.get(a.accountIban) ?? "") === true)
        .map((a) => ({
          iban: a.accountIban,
          name: a.accountName,
          bankName: a.bankName,
          balance: a.balance,
        })),
    [accountBalances, canTransferMap, bankKeyByIban],
  );

  const ownAccounts: OwnAccount[] = useMemo(
    () =>
      linkedAccounts.map((a) => ({
        iban: a.accountIban,
        name: a.accountName,
        bankName: a.bankName,
      })),
    [linkedAccounts],
  );

  const confirmSetup = useCallback(
    async (result: TransferSetupResult) => {
      if (result.saveRecipient) {
        createRecipientAccount({
          account_name: result.accountName || result.recipientName,
          iban: result.recipientIban,
          bic: result.recipientBic,
          recipient_name: result.recipientName,
        }).catch(() => toast.error("Empfängerkonto konnte nicht gespeichert werden."));
      }
      const tid = toast.loading("Überweisung wird durchgeführt…");
      try {
        await executeDirectTransfer({
          senderIban: result.senderIban,
          recipientName: result.recipientName,
          recipientIban: result.recipientIban,
          recipientBic: result.recipientBic,
          amount: result.amount,
          reason: result.purpose || "Überweisung",
        });
        toast.success("Überweisung erfolgreich!", { id: tid });
        triggerRefresh();
      } catch {
        toast.dismiss(tid);
        toast.error("Überweisung fehlgeschlagen.");
      }
    },
    [triggerRefresh],
  );

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
      <div className="flex items-center justify-between gap-4">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        {refreshing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Aktualisiere…
          </div>
        )}
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : transactions.length === 0 ? (
        <EmptyState title="Es gibt noch keine Daten" illustration={<CircleDashed />} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
            <StatCard
              title="Gesamtvermögen"
              value={balance}
              valueFormat={{ style: "currency", currency: "EUR" }}
              valueLocales="de-DE"
              accent={balance >= 0 ? "#00d4a1" : "#ff5c6c"}
              icon={Wallet}
              footer={dateFooter ?? undefined}
              accountBalances={activeAccountIban === "all" ? accountBalances : undefined}
              action={
                senderAccounts.length > 0 ? (
                  <Button
                    className="w-full gap-1"
                    onClick={() => setSetupOpen(true)}
                  >
                    <Send className="size-4" />
                    Überweisen
                  </Button>
                ) : undefined
              }
            />
            <StatCard
              title="Einnahmen"
              value={incomes}
              valueFormat={{ style: "currency", currency: "EUR" }}
              valueLocales="de-DE"
              sub={`${incomePct} % der Umsätze`}
              trend="up"
              accent="#00d4a1"
              icon={TrendingUp}
              footer={dateFooter ?? undefined}
            />
            <StatCard
              title="Ausgaben"
              value={-expenses}
              valueFormat={{ style: "currency", currency: "EUR" }}
              valueLocales="de-DE"
              sub={`${expensePct} % der Umsätze`}
              trend="down"
              accent="#ff5c6c"
              icon={TrendingDown}
              footer={dateFooter ?? undefined}
            />
            <StatCard
              title="Transaktionen"
              value={transactionCount}
              valueFormat={{ style: "decimal" }}
              valueLocales="de-DE"
              sub={`${savingsRate} % Sparquote`}
              accent="#b47bff"
              icon={Receipt}
              footer={dateFooter ?? undefined}
            />
          </div>

          <BalanceChart transactions={transactions} currentBalance={balance} />
          <MonthlyChart transactions={transactions} />
        </>
      )}

      <TransferSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        senderAccounts={senderAccounts}
        defaultSenderIban={activeAccountIban !== "all" ? activeAccountIban : undefined}
        recipientAccounts={recipientAccounts}
        ownAccounts={ownAccounts}
        onConfirm={confirmSetup}
      />
    </div>
  );
}
