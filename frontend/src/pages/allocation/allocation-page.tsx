import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAllocation } from "./hooks/use-allocation";
import { BucketCard } from "./components/bucket-card";
import { TransferDialog } from "./components/transfer-dialog";
import { fetchRecipientAccountsReferenceData, type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";
import { updateAllocationBucket, type AllocationBucket } from "@/lib/allocation";
import { formatAmount } from "@/lib/utils/format";
import { EmptyState } from "@/components/empty-state";

function extractBankAccounts(banks: StoredBankCredentials[]): { iban: string; name: string }[] {
  const accounts: { iban: string; name: string }[] = [];
  for (const bank of banks) {
    for (const acc of bank.accounts ?? []) {
      if (acc.iban) accounts.push({ iban: acc.iban as string, name: (acc.account_name as string) ?? acc.iban as string });
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

  useEffect(() => { void loadReferenceData(); }, [loadReferenceData]);

  const handleTransfer = useCallback(async (runBucketId: number) => {
    const bucket = status?.buckets.find((b) => b.id === runBucketId);
    if (!bucket) return;
    const cfg = status?.config.find((c) => c.id === bucket.bucket_id);
    if (!cfg || !cfg.recipient_account_id) return;

    const recipient = recipientAccounts.find((r) => r.id === cfg.recipient_account_id);
    if (!recipient) return;

    runBucketIdRef.current = runBucketId;

    setTransferState({
      open: true,
      runBucketId,
      amount: bucket.target_amount - bucket.transferred,
      recipientName: recipient.recipient_name,
      recipientIban: recipient.iban,
    });
  }, [status, recipientAccounts]);

  const confirmTransfer = useCallback(async (tan?: string) => {
    await transfer(runBucketIdRef.current, tan);
  }, [transfer]);

  const handleUpdateConfig = useCallback(async (bucketId: number, updates: Partial<AllocationBucket>) => {
    await updateAllocationBucket(bucketId, updates);
    await load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Finanzplan konnte nicht geladen werden"
        text={error}
      />
    );
  }

  if (!status) return null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <div className="flex items-center gap-2 text-sm">
        {status.net_income > 0 && status.total_allocated > 0 &&
          Math.abs(status.net_income - status.total_allocated - status.remaining) < 0.01 ? (
          <>
            <CheckCircle2 className="size-4 text-green-500" />
            <span className="text-green-600">
              100%-Check: Allokation ausgeglichen ({formatAmount(status.net_income)} Netto)
            </span>
          </>
        ) : (
          <>
            <TriangleAlert className="size-4 text-amber-500" />
            <span className="text-amber-600">
              Differenz: {formatAmount(status.net_income - status.total_allocated - status.remaining)}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {status.buckets.map((bucket) => {
          const config = status.config.find((c) => c.id === bucket.bucket_id);
          if (!config) return null;
          if (bucket.bucket_type === "bafoeg" && !config.is_active) return null;
          const recipient = config.recipient_account_id
            ? recipientAccounts.find((r) => r.id === config.recipient_account_id)
            : undefined;
          return (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              config={config}
              hasRecipient={!!recipient}
              recipientAccounts={recipientAccounts.map((r) => ({ id: r.id, account_name: r.account_name, iban: r.iban }))}
              bankAccounts={bankAccounts}
              onTransfer={handleTransfer}
              onUpdateConfig={handleUpdateConfig}
              transferring={transferring === bucket.id}
            />
          );
        })}
      </div>

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
