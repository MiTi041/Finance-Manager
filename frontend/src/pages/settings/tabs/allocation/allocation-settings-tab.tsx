import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  fetchAllocationBuckets,
  updateAllocationBucket,
  fetchAllocationSettings,
  updateAllocationSettings,
} from "@/lib/allocation";
import { fetchRecipientAccountsReferenceData, type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";
import type { AllocationBucket } from "@/lib/allocation";
import { BucketForm } from "./bucket-form";
import { BafoegConfigForm } from "./bafoeg-config-form";

function extractBankAccounts(banks: StoredBankCredentials[]): { iban: string; name: string }[] {
  const accounts: { iban: string; name: string }[] = [];
  for (const bank of banks) {
    for (const acc of bank.accounts ?? []) {
      if (acc.iban) accounts.push({ iban: acc.iban as string, name: (acc.account_name as string) ?? acc.iban as string });
    }
  }
  return accounts;
}

export function AllocationSettingsTab() {
  const [buckets, setBuckets] = useState<AllocationBucket[]>([]);
  const [bafoegEnabled, setBafoegEnabled] = useState(false);
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ iban: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const [bucketsData, settings, recipientsData, banks] = await Promise.all([
      fetchAllocationBuckets(),
      fetchAllocationSettings(),
      fetchRecipientAccountsReferenceData(),
      fetchBankCredentials(),
    ]);
    setBuckets(bucketsData);
    setBafoegEnabled(settings.bafoeg_enabled);
    setRecipientAccounts(recipientsData.recipient_accounts ?? []);
    setBankAccounts(extractBankAccounts(banks));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggleBafoeg = async (enabled: boolean) => {
    await updateAllocationSettings({ bafoeg_enabled: enabled });
    setBafoegEnabled(enabled);
  };

  const handleUpdateBucket = async (bucketId: number, updates: Partial<AllocationBucket>) => {
    await updateAllocationBucket(bucketId, updates);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="bafoeg-toggle"
          checked={bafoegEnabled}
          onCheckedChange={handleToggleBafoeg}
        />
        <Label htmlFor="bafoeg-toggle">Bafög-Modus aktivieren</Label>
      </div>

      {bafoegEnabled && <BafoegConfigForm />}

      <div className="space-y-3">
        <h3 className="font-medium">Allokations-Buckets</h3>
        {buckets.map((bucket) => (
          <BucketForm
            key={bucket.id}
            bucket={bucket}
            recipientAccounts={recipientAccounts}
            bankAccounts={bankAccounts}
            onUpdate={handleUpdateBucket}
          />
        ))}
      </div>
    </div>
  );
}
