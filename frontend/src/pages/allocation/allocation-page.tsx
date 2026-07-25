import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useAllocation } from "./hooks/use-allocation";
import { AllocationSummary } from "./components/allocation-summary";
import { BucketCard } from "./components/bucket-card";
import { TransferDialog } from "./components/transfer-dialog";
import { fetchRecipientAccountsReferenceData, type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function AllocationPage() {
  const { status, loading, error, recalculate, transfer, transferring } = useAllocation();
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const runBucketIdRef = useRef<number>(0);
  const [transferState, setTransferState] = useState<{
    open: boolean;
    runBucketId: number;
    amount: number;
    recipientName: string;
    recipientIban: string;
  }>({ open: false, runBucketId: 0, amount: 0, recipientName: "", recipientIban: "" });

  useEffect(() => {
    void fetchRecipientAccountsReferenceData().then((data) => {
      setRecipientAccounts(data.recipient_accounts ?? []);
    });
  }, []);

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
    await transfer(runBucketIdRef.current);
  }, [transfer]);

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
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={recalculate}>
          <RefreshCw className="size-4" />
          Neu berechnen
        </Button>
      </div>

      <AllocationSummary
        month={status.month}
        netIncome={status.net_income}
        remaining={status.remaining}
        status={status.status}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Allokation</h2>
        {status.buckets.map((bucket) => {
          const config = status.config.find((c) => c.id === bucket.bucket_id);
          if (!config) return null;
          if (bucket.bucket_type === "bafoeg" && !config.is_active) return null;
          return (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              config={config}
              onTransfer={handleTransfer}
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
