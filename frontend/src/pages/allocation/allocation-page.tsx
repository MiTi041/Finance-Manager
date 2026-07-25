import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAllocation } from "./hooks/use-allocation";
import { BucketCard } from "./components/bucket-card";
import { TransferDialog } from "./components/transfer-dialog";
import {
  fetchRecipientAccountsReferenceData,
  type RecipientAccountRecord,
} from "@/lib/recipient-accounts";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";
import { updateAllocationBucket, type AllocationBucket } from "@/lib/allocation";
import { formatAmount } from "@/lib/utils/format";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";

function extractBankAccounts(banks: StoredBankCredentials[]): { iban: string; name: string }[] {
  const accounts: { iban: string; name: string }[] = [];
  for (const bank of banks) {
    for (const acc of bank.accounts ?? []) {
      if (acc.iban)
        accounts.push({
          iban: acc.iban as string,
          name: (acc.account_name as string) ?? (acc.iban as string),
        });
    }
  }
  return accounts;
}

export default function AllocationPage() {
  const { status, loading, error, load, transfer, transferring } = useAllocation();
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ iban: string; name: string }[]>([]);
  const runBucketIdRef = useRef<number>(0);
  const [transferState, setTransferState] = useState<{
    open: boolean;
    runBucketId: number;
    amount: number;
    recipientName: string;
    recipientIban: string;
  }>({ open: false, runBucketId: 0, amount: 0, recipientName: "", recipientIban: "" });

  const loadReferenceData = useCallback(async () => {
    const [recipientsData, banks] = await Promise.all([
      fetchRecipientAccountsReferenceData(),
      fetchBankCredentials(),
    ]);
    setRecipientAccounts(recipientsData.recipient_accounts ?? []);
    setBankAccounts(extractBankAccounts(banks));
  }, []);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const donationAccounts = useMemo(
    () => recipientAccounts.filter((r) => r.is_donation_account),
    [recipientAccounts],
  );

  const handleTransfer = useCallback(
    async (runBucketId: number) => {
      const bucket = status?.buckets.find((b) => b.id === runBucketId);
      if (!bucket) return;
      const cfg = status?.config.find((c) => c.id === bucket.bucket_id);
      if (!cfg) return;

      let recipientName: string;
      let recipientIban: string;

      if (bucket.bucket_type === "donation") {
        const acc = donationAccounts[Math.floor(Math.random() * donationAccounts.length)];
        if (!acc) return;
        recipientName = acc.recipient_name;
        recipientIban = acc.iban;
      } else {
        if (!cfg.recipient_account_id) return;
        const recipient = recipientAccounts.find((r) => r.id === cfg.recipient_account_id);
        if (!recipient) return;
        recipientName = recipient.recipient_name;
        recipientIban = recipient.iban;
      }

      runBucketIdRef.current = runBucketId;

      setTransferState({
        open: true,
        runBucketId,
        amount: bucket.target_amount - bucket.transferred,
        recipientName,
        recipientIban,
      });
    },
    [status, recipientAccounts, donationAccounts],
  );

  const confirmTransfer = useCallback(
    async (tan?: string) => {
      await transfer(runBucketIdRef.current, tan);
    },
    [transfer],
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

  const diff = status.net_income - status.total_allocated - status.remaining;
  const balanced = status.net_income > 0 && status.total_allocated > 0 && Math.abs(diff) < 0.01;
  const visibleBuckets = status.buckets.filter((bucket) => {
    const config = status.config.find((c) => c.id === bucket.bucket_id);
    if (!config) return false;
    if (bucket.bucket_type === "bafoeg" && !config.is_active) return false;
    return true;
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none" role="status" aria-live="polite">
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
                {balanced ? "Allokation ausgeglichen" : "Allokation weicht ab"}
              </p>
              <p className="text-xs text-muted-foreground">
                {balanced
                  ? "Netto-Einkommen ist vollständig verteilt"
                  : `Differenz von ${formatAmount(diff)} zum Netto-Einkommen`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm">
            <div>
              <p className="text-muted-foreground">Netto</p>
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
          </div>
        </CardContent>
      </Card>

      {visibleBuckets.length === 0 ? (
        <EmptyState
          title="Keine aktiven Töpfe"
          text="Aktiviere mindestens einen Topf, um deine Verteilung zu sehen."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleBuckets.map((bucket) => {
            const config = status.config.find((c) => c.id === bucket.bucket_id)!;
            const donationAvailable = donationAccounts.length > 0;
            const hasRecipient =
              (bucket.bucket_type === "donation" && donationAvailable) ||
              (!!config.recipient_account_id &&
                recipientAccounts.some((r) => r.id === config.recipient_account_id));
            return (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                config={config}
                hasRecipient={hasRecipient}
                recipientAccounts={recipientAccounts.map((r) => ({
                  id: r.id,
                  account_name: r.account_name,
                  iban: r.iban,
                }))}
                bankAccounts={bankAccounts}
                onTransfer={handleTransfer}
                onUpdateConfig={handleUpdateConfig}
                transferring={transferring === bucket.id}
              />
            );
          })}
        </div>
      )}

      <TransferDialog
        open={transferState.open}
        onOpenChange={(open) => setTransferState((s) => ({ ...s, open }))}
        amount={transferState.amount}
        recipientName={transferState.recipientName}
        recipientIban={transferState.recipientIban}
        onConfirm={confirmTransfer}
      />
    </div>
  );
}
