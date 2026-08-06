import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAllocation } from "./hooks/use-allocation";
import { BucketCard } from "./components/bucket-card";
import { SavingsPlansCard } from "./components/savings-plans-card";
import { TransferDialog } from "./components/transfer-dialog";
import { DonationAnalysisDialog } from "./components/donation-analysis-dialog";
import { IncomeBreakdownDialog } from "./components/income-breakdown-dialog";
import {
  fetchRecipientAccountsReferenceData,
  type RecipientAccountRecord,
} from "@/lib/recipient-accounts";
import {
  fetchBankCredentials,
  fetchAvailableBanks,
  type StoredBankCredentials,
} from "@/lib/bank/credentials";
import {
  fetchAllocationSettings,
  updateAllocationBucket,
  type AllocationBucket,
  type SavingsPlan,
} from "@/lib/allocation";
import { formatAmount } from "@/lib/utils/format";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSubscriptions } from "@/pages/subscriptions/hooks/use-subscriptions";
import {
  computeSpendingSubscriptionState,
  type SpendingSubscriptionState,
} from "@/lib/subscription-budget";

function extractBankAccounts(
  banks: StoredBankCredentials[],
): { iban: string; name: string; bankKey: string }[] {
  const accounts: { iban: string; name: string; bankKey: string }[] = [];
  for (const bank of banks) {
    for (const acc of bank.accounts ?? []) {
      if (acc.iban)
        accounts.push({
          iban: acc.iban as string,
          name: (acc.account_name as string) ?? (acc.iban as string),
          bankKey: bank.bank_key,
        });
    }
  }
  return accounts;
}

export default function AllocationPage() {
  const { status, loading, error, load, recalculate, transfer, transferring, transferSavings } =
    useAllocation();
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<
    { iban: string; name: string; bankKey: string }[]
  >([]);
  const [canTransferMap, setCanTransferMap] = useState<Map<string, boolean>>(new Map());
  const runBucketIdRef = useRef<number>(0);
  const runBucketAmountRef = useRef<number>(0);
  const savingsPlanIdRef = useRef<number>(0);
  const savingsPlanAmountRef = useRef<number>(0);
  const [transferState, setTransferState] = useState<{
    open: boolean;
    runBucketId: number;
    amount: number;
    accountName: string;
    recipientName: string;
    recipientIban: string;
    purpose: string;
    instant: boolean;
  }>({
    open: false,
    runBucketId: 0,
    amount: 0,
    accountName: "",
    recipientName: "",
    recipientIban: "",
    purpose: "",
    instant: true,
  });
  const [donationAnalysisOpen, setDonationAnalysisOpen] = useState(false);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [bafoegEnabled, setBafoegEnabled] = useState(false);
  const { subscriptions } = useSubscriptions();

  const loadReferenceData = useCallback(async () => {
    const [recipientsData, banks, settings, availableBanks] = await Promise.all([
      fetchRecipientAccountsReferenceData(),
      fetchBankCredentials(),
      fetchAllocationSettings(),
      fetchAvailableBanks(),
    ]);
    setRecipientAccounts(recipientsData.recipient_accounts ?? []);
    setBankAccounts(extractBankAccounts(banks));
    setBafoegEnabled(settings.bafoeg_enabled);
    setCanTransferMap(new Map(availableBanks.map((b) => [b.key, b.can_transfer])));
  }, []);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const handleSavingsRefresh = useCallback(async () => {
    await recalculate();
  }, [recalculate]);

  const donationAccounts = useMemo(
    () => recipientAccounts.filter((r) => r.is_donation_account),
    [recipientAccounts],
  );

  const senderBankAccounts = useMemo(
    () => bankAccounts.filter((a) => canTransferMap.get(a.bankKey) !== false),
    [bankAccounts, canTransferMap],
  );

  const handleTransfer = useCallback(
    async (runBucketId: number, amount?: number) => {
      const bucket = status?.buckets.find((b) => b.id === runBucketId);
      if (!bucket) return;
      const cfg = status?.config.find((c) => c.id === bucket.bucket_id);
      if (!cfg) return;

      let recipientName: string;
      let recipientIban: string;

      let accountName = "";

      if (bucket.bucket_type === "donation") {
        const acc = donationAccounts[Math.floor(Math.random() * donationAccounts.length)];
        if (!acc) return;
        accountName = acc.account_name;
        recipientName = acc.recipient_name;
        recipientIban = acc.iban;
      } else if (cfg.recipient_iban) {
        const bankAcc = bankAccounts.find((a) => a.iban === cfg.recipient_iban);
        if (!bankAcc) return;
        accountName = bankAcc.name;
        recipientName = bankAcc.name;
        recipientIban = bankAcc.iban;
      } else {
        if (!cfg.recipient_account_id) return;
        const recipient = recipientAccounts.find((r) => r.id === cfg.recipient_account_id);
        if (!recipient) return;
        accountName = recipient.account_name;
        recipientName = recipient.recipient_name;
        recipientIban = recipient.iban;
      }

      const bucketTags: Record<string, string> = {
        bafoeg: "tag.bafoegschulden",
        emergency: "tag.notfallfonds",
        invest: "tag.investieren",
        donation: "tag.spenden",
      };
      const purpose =
        `Allokation ${bucket.bucket_type} ${bucketTags[bucket.bucket_type] ?? ""}`.trim();

      const defaultAmount =
        bucket.bucket_type === "bafoeg"
          ? Math.max(
              0,
              (bucket.required_monthly_rate ?? bucket.target_amount) -
                (bucket.month_einzahlungen ?? 0),
            )
          : bucket.target_amount - bucket.transferred;

      runBucketIdRef.current = runBucketId;
      runBucketAmountRef.current = amount ?? defaultAmount;
      savingsPlanIdRef.current = 0;

      setTransferState({
        open: true,
        runBucketId,
        amount: amount ?? defaultAmount,
        accountName,
        recipientName,
        recipientIban,
        purpose,
        instant: true,
      });
    },
    [status, recipientAccounts, donationAccounts],
  );

  const confirmTransfer = useCallback(
    async (tan?: string) => {
      const tid = toast.loading("Überweisung wird durchgeführt…");
      try {
        if (savingsPlanIdRef.current) {
          await transferSavings(
            savingsPlanIdRef.current,
            tan,
            savingsPlanAmountRef.current || undefined,
            transferState.instant,
          );
          savingsPlanIdRef.current = 0;
          savingsPlanAmountRef.current = 0;
        } else {
          await transfer(
            runBucketIdRef.current,
            tan,
            runBucketAmountRef.current > 0 ? runBucketAmountRef.current : undefined,
            transferState.instant,
          );
        }
        toast.success("Überweisung erfolgreich!", { id: tid });
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    [transfer, transferSavings, transferState.instant],
  );

  const handleSavingsPlanTransfer = useCallback(
    (plan: SavingsPlan, customAmount?: number) => {
      if (!plan.target_recipient_name || !plan.target_recipient_iban) return;
      savingsPlanIdRef.current = plan.id;
      const amount =
        customAmount ??
        (plan.required_monthly_rate != null
          ? Math.max(0, plan.required_monthly_rate - (plan.month_einzahlungen ?? 0))
          : 0);
      savingsPlanAmountRef.current = amount;
      const tag = plan.tag ?? "";
      const tagClean = tag.startsWith("tag.") ? tag : `tag.${tag}`;
      const purpose = `Sparplan ${plan.name}${tagClean ? ` ${tagClean}` : ""}`;

      const recipientAcc = recipientAccounts.find((r) => r.iban === plan.target_recipient_iban);
      const bankAcc = bankAccounts.find((a) => a.iban === plan.target_recipient_iban);
      setTransferState({
        open: true,
        runBucketId: 0,
        amount,
        accountName: recipientAcc?.account_name ?? bankAcc?.name ?? plan.target_recipient_name,
        recipientName: plan.target_recipient_name,
        recipientIban: plan.target_recipient_iban,
        purpose,
        instant: true,
      });
    },
    [recipientAccounts, bankAccounts],
  );

  const handleUpdateConfig = useCallback(
    async (bucketId: number, updates: Partial<AllocationBucket>) => {
      await updateAllocationBucket(bucketId, updates);
      await load();
    },
    [load],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Finanzplan konnte nicht geladen werden" text={error} />;
  }

  if (!status) return null;

  const spendingBucket = status.buckets.find((b) => b.bucket_type === "spending");
  const subscriptionState: SpendingSubscriptionState | null =
    spendingBucket && subscriptions.length > 0
      ? computeSpendingSubscriptionState(subscriptions, spendingBucket.target_amount)
      : null;
  const diff = status.remaining;
  const balanced = status.net_income > 0 && status.total_allocated > 0 && diff > 0.01;
  const visibleBuckets = status.buckets.filter((bucket) => {
    const config = status.config.find((c) => c.id === bucket.bucket_id);
    if (!config) return false;
    if (bucket.bucket_type === "bafoeg" && !bafoegEnabled) return false;
    return true;
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-2.5">
            {balanced ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            ) : (
              <TriangleAlert className="size-5 shrink-0 text-amber-500" />
            )}
            <div>
              <p
                className={`text-sm font-medium ${balanced ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
              >
                {balanced ? "Verteilung ausgeglichen" : "Verteilung weicht ab"}
              </p>
              <p className="text-xs text-muted-foreground">
                {balanced
                  ? "Netto-Einkommen ist vollständig verteilt"
                  : diff < 0
                    ? `Mehr verteilt als Netto-Einkommen`
                    : `Differenz von ${formatAmount(diff)} zum Netto-Einkommen`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground">Netto</p>
                <button
                  type="button"
                  aria-label="Details zur Netto-Berechnung anzeigen"
                  onClick={() => setIncomeDialogOpen(true)}
                  className="inline-flex size-4 cursor-pointer items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/80 select-none"
                >
                  ?
                </button>
              </div>
              <p className="font-semibold tabular-nums">{formatAmount(status.net_income)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Verteilt</p>
              <p className="font-semibold tabular-nums">{formatAmount(status.total_allocated)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Übrig</p>
              <p className="font-semibold tabular-nums">{formatAmount(status.remaining)}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculate()}
              className="h-7 text-xs"
            >
              Neu berechnen
            </Button>
          </div>
        </CardContent>
      </Card>

      {visibleBuckets.length === 0 ? (
        <EmptyState
          title="Keine aktiven Töpfe"
          text="Aktiviere mindestens einen Topf, um deine Verteilung zu sehen."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {visibleBuckets.map((bucket) => {
            const config = status.config.find((c) => c.id === bucket.bucket_id)!;
            const donationAvailable = donationAccounts.length > 0;
            const hasRecipient =
              (bucket.bucket_type === "donation" && donationAvailable) ||
              (!!config.recipient_account_id &&
                recipientAccounts.some((r) => r.id === config.recipient_account_id));
            const hasSender = !!config.sender_iban;
            return (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                config={config}
                hasRecipient={hasRecipient}
                hasSender={hasSender}
                recipientAccounts={recipientAccounts.map((r) => ({
                  id: r.id,
                  account_name: r.account_name,
                  recipient_name: r.recipient_name,
                  iban: r.iban,
                }))}
                bankAccounts={bankAccounts}
                canTransferMap={canTransferMap}
                bafoegActive={
                  status.config.some((c) => c.bucket_type === "bafoeg" && c.is_active) &&
                  bafoegEnabled
                }
                onTransfer={handleTransfer}
                onUpdateConfig={handleUpdateConfig}
                onAnalyse={() => setDonationAnalysisOpen(true)}
                onRefresh={load}
                transferring={transferring === bucket.id}
                subscriptionState={subscriptionState}
              />
            );
          })}
        </div>
      )}

      <SavingsPlansCard
        plans={status.savings_plans}
        savingsTotal={status.savings_total}
        availableForSavings={status.available_for_savings}
        currentMonth={status.month}
        payoutDays={status.payout_days ?? []}
        holidays={status.holidays ?? []}
        onRefresh={handleSavingsRefresh}
        onTransfer={handleSavingsPlanTransfer}
        recipientAccounts={recipientAccounts}
        bankAccounts={bankAccounts}
        canTransferMap={canTransferMap}
      />

      <TransferDialog
        open={transferState.open}
        onOpenChange={(open) => setTransferState((s) => ({ ...s, open }))}
        amount={transferState.amount}
        accountName={transferState.accountName}
        recipientName={transferState.recipientName}
        recipientIban={transferState.recipientIban}
        purpose={transferState.purpose}
        instant={transferState.instant}
        onInstantChange={(instant) => setTransferState((s) => ({ ...s, instant }))}
        onConfirm={confirmTransfer}
      />

      <DonationAnalysisDialog open={donationAnalysisOpen} onOpenChange={setDonationAnalysisOpen} />

      <IncomeBreakdownDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        sources={status.income_sources ?? []}
      />
    </div>
  );
}
