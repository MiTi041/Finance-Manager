import { useMemo, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  CircleX,
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/use-finance-data";
import { useRefresh } from "@/hooks/use-refresh";
import { normalizeIban } from "@/lib/iban";
import { getErrorMessage } from "@/lib/utils/error";
import { fetchAvailableBanks, updateBankAccount } from "@/lib/bank/credentials";
import {
  fetchRecipientAccountsReferenceData,
  createRecipientAccount,
  type RecipientAccountRecord,
} from "@/lib/recipient-accounts";
import { executeDirectTransfer } from "@/lib/direct-transfer";
import { VopRequiredError, type VopRequiredInfo } from "@/lib/allocation";
import { VopConfirmDialog } from "@/components/vop-confirm-dialog";
import {
  TransferSetupDialog,
  type TransferSetupResult,
  type SenderAccount,
  type OwnAccount,
} from "./components/transfer-setup-dialog";
import { getTimeSpanForRange } from "@/types/time-range";
import type { DateFilterValue } from "@/types/date-filter";

import { StatCard } from "./components/stat-card";
import { AccountCards } from "./components/account-cards";
import { BalanceChart } from "./components/balance-chart";
import { MonthlyChart } from "./components/monthly-chart";
import { SavingsRateChart } from "./components/savings-rate-chart";
import { WeekdayChart } from "./components/weekday-chart";
import { AccountDistributionChart } from "./components/account-distribution-chart";
import { AnalyticsCharts } from "./components/analytics-charts";
import { DashboardSkeleton } from "./components/dashboard-skeleton";

function computeDateFooter(dateFilter: DateFilterValue) {
  if (dateFilter.timeSpan) {
    return `${format(dateFilter.timeSpan.from, "dd.MM.yy")} - ${format(dateFilter.timeSpan.until, "dd.MM.yy")}`;
  }
  if (dateFilter.timeRange) {
    const span = getTimeSpanForRange(dateFilter.timeRange);
    return `${format(span.from, "dd.MM.yy")} - ${format(span.until, "dd.MM.yy")}`;
  }
  return null;
}

export default function DashboardPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const { triggerRefresh } = useRefresh();
  const {
    totalBalance,
    incomes,
    expenses,
    transactionCount,
    loading,
    refreshing,
    error,
    transactions,
    allTransactions,
    activeAccountIban,
    accountBalances,
    linkedAccounts,
    linkedBanks,
  } = useFinanceData(dateFilter, { excludeHiddenAccounts: true });

  const [canTransferMap, setCanTransferMap] = useState<Map<string, boolean>>(new Map());
  const [sepaExpressMap, setSepaExpressMap] = useState<Map<string, boolean>>(new Map());
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [presetSenderIban, setPresetSenderIban] = useState<string | undefined>(undefined);
  const [vopState, setVopState] = useState<{
    info: VopRequiredInfo;
    result: TransferSetupResult;
  } | null>(null);

  useEffect(() => {
    void fetchAvailableBanks().then((banks) => {
      setCanTransferMap(new Map(banks.map((b) => [b.key, b.can_transfer])));
      setSepaExpressMap(new Map(banks.map((b) => [b.key, b.sepa_express])));
    });
    void fetchRecipientAccountsReferenceData().then((data) =>
      setRecipientAccounts(data.recipient_accounts ?? []),
    );
  }, []);

  const dateFooter = useMemo(() => computeDateFooter(dateFilter), [dateFilter]);

  const expensePct = ((expenses / (incomes + expenses || 1)) * 100).toFixed(0);
  const incomePct = ((incomes / (incomes + expenses || 1)) * 100).toFixed(0);

  const canTransferByIban = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const bank of linkedBanks) {
      const bankCanTransfer = canTransferMap.get(bank.bank_key);
      for (const acc of bank.accounts ?? []) {
        const iban = normalizeIban(acc.iban);
        if (!iban) continue;
        map.set(
          iban,
          acc.can_transfer != null ? acc.can_transfer : bankCanTransfer === true,
        );
      }
    }
    return map;
  }, [linkedBanks, canTransferMap]);

  const sepaExpressByIban = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const bank of linkedBanks) {
      const bankSupports = sepaExpressMap.get(bank.bank_key) !== false;
      for (const acc of bank.accounts ?? []) {
        const iban = normalizeIban(acc.iban);
        if (iban) map.set(iban, bankSupports);
      }
    }
    return map;
  }, [linkedBanks, sepaExpressMap]);

  const senderAccounts: SenderAccount[] = useMemo(
    () =>
      accountBalances
        .filter(
          (a) =>
            (activeAccountIban === "all" || a.accountIban === activeAccountIban) &&
            canTransferByIban.get(a.accountIban) === true,
        )
        .map((a) => ({
          iban: a.accountIban,
          name: a.accountName,
          bankName: a.bankName,
          bankLogo: a.bankLogo,
          bankLogoDark: a.bankLogoDark,
          logoPadding: a.logoPadding,
          balance: a.balance,
          balancePending: a.balancePending,
          supportsInstant: sepaExpressByIban.get(a.accountIban) !== false,
        })),
    [accountBalances, canTransferByIban, sepaExpressByIban, activeAccountIban],
  );

  const transferableIbanSet = useMemo(
    () => new Set(senderAccounts.map((a) => a.iban)),
    [senderAccounts],
  );

  const activeSenderAccount = useMemo(
    () =>
      senderAccounts.find((a) => a.iban === presetSenderIban) ??
      senderAccounts.find((a) => a.iban === activeAccountIban) ??
      senderAccounts[0],
    [senderAccounts, presetSenderIban, activeAccountIban],
  );

  const selectedPending = useMemo(() => {
    if (activeAccountIban === "all") return undefined;
    return accountBalances.find((a) => a.accountIban === activeAccountIban)?.balancePending;
  }, [accountBalances, activeAccountIban]);

  const ownAccounts: OwnAccount[] = useMemo(
    () =>
      linkedAccounts.map((a) => ({
        iban: a.accountIban,
        name: a.accountName,
        bankName: a.bankName,
        bankLogo: a.bankLogo,
        bankLogoDark: a.bankLogoDark,
        logoPadding: a.logoPadding,
        isPrimary: a.isPrimary === true,
        supportsInstant: sepaExpressByIban.get(a.accountIban) !== false,
      })),
    [linkedAccounts, sepaExpressByIban],
  );

  const runTransfer = useCallback(
    async (result: TransferSetupResult, vopToken?: string) => {
      const tid = toast.loading("Überweisung wird durchgeführt…");
      try {
        await executeDirectTransfer(
          {
            senderIban: result.senderIban,
            recipientName: result.recipientName,
            recipientIban: result.recipientIban,
            recipientBic: result.recipientBic,
            amount: result.amount,
            reason: result.purpose || "Überweisung",
            instant: result.instant,
          },
          undefined,
          vopToken,
        );
        toast.success("Überweisung erfolgreich!", { id: tid });
        triggerRefresh();
        return true;
      } catch (e) {
        toast.dismiss(tid);
        if (e instanceof VopRequiredError) {
          setVopState({ info: e.info, result });
          return false;
        }
        toast.error(getErrorMessage(e, "Überweisung fehlgeschlagen."));
        return false;
      }
    },
    [triggerRefresh],
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
      await runTransfer(result);
    },
    [runTransfer],
  );

  const confirmVopTransfer = useCallback(async () => {
    if (!vopState) return;
    const { result, info } = vopState;
    const ok = await runTransfer(result, info.vop_token);
    if (ok) setVopState(null);
  }, [vopState, runTransfer]);

  const handleToggleExclude = useCallback(
    (scope: string, iban: string, next: boolean) => {
      void updateBankAccount(scope, iban, { exclude_from_totals: next }).then(() =>
        triggerRefresh(),
      );
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-6">
      <div className="sticky top-0 z-20 bg-background pt-6 pb-3">
        <div className="flex items-center justify-between gap-4">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          {refreshing && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              Aktualisiere…
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-full h-8 bg-gradient-to-b from-background to-transparent" />
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
            <StatCard
              title="Gesamtvermögen"
              value={totalBalance}
              valueFormat={{ style: "currency", currency: "EUR" }}
              valueLocales="de-DE"
              accent={totalBalance >= 0 ? "#00d4a1" : "#ff5c6c"}
              icon={Wallet}
              pendingValue={selectedPending}
              action={
                activeAccountIban !== "all" && senderAccounts.length > 0 ? (
                  <Button
                    className="w-full gap-1"
                    onClick={() => {
                      setPresetSenderIban(undefined);
                      setSetupOpen(true);
                    }}
                  >
                    <ArrowUpRight className="size-4" />
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
              accent="#b47bff"
              icon={Receipt}
              footer={dateFooter ?? undefined}
            />
          </div>

          {activeAccountIban === "all" && accountBalances.length > 0 && (
            <>
              <AccountCards
                accountBalances={accountBalances}
                transferableIbans={transferableIbanSet}
                onAccountTransfer={(iban) => {
                  setPresetSenderIban(iban);
                  setSetupOpen(true);
                }}
                onToggleExclude={handleToggleExclude}
              />
              <AccountDistributionChart accountBalances={accountBalances} />
            </>
          )}

          {transactions.length > 0 && (
            <>
              <BalanceChart
                transactions={transactions}
                allTransactions={allTransactions}
                currentBalance={totalBalance}
              />
              <MonthlyChart transactions={transactions} />
              <WeekdayChart transactions={transactions} />
              <SavingsRateChart transactions={transactions} />
              <AnalyticsCharts transactions={transactions} dateFooter={dateFooter} />
            </>
          )}
        </>
      )}

      <TransferSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        senderAccount={activeSenderAccount}
        recipientAccounts={recipientAccounts}
        ownAccounts={ownAccounts}
        onConfirm={confirmSetup}
      />

      <VopConfirmDialog
        open={!!vopState}
        onOpenChange={(next) => {
          if (!next) setVopState(null);
        }}
        info={vopState?.info ?? null}
        onConfirm={confirmVopTransfer}
      />
    </div>
  );
}
