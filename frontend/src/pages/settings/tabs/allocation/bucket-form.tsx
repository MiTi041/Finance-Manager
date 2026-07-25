import type { AllocationBucket } from "@/lib/allocation";
import type { RecipientAccountRecord } from "@/lib/recipient-accounts";

type Props = {
  bucket: AllocationBucket;
  recipientAccounts: RecipientAccountRecord[];
  bankAccounts: { iban: string; name: string }[];
  onUpdate: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
};

const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

export function BucketForm({ bucket, recipientAccounts, bankAccounts, onUpdate }: Props) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <h3 className="font-medium">{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</h3>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground">Prozentsatz (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={bucket.percentage}
            onChange={(e) => onUpdate(bucket.id, { percentage: Number(e.target.value) })}
            disabled={bucket.bucket_type === "spending"}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Aktiv</label>
          <div className="mt-1.5">
            <input
              type="checkbox"
              checked={bucket.is_active}
              onChange={(e) => onUpdate(bucket.id, { is_active: e.target.checked })}
              className="size-4"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Empfängerkonto</label>
          <select
            value={bucket.recipient_account_id ?? ""}
            onChange={(e) => onUpdate(bucket.id, { recipient_account_id: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Kein Konto —</option>
            {recipientAccounts.map((r) => (
              <option key={r.id} value={r.id}>{r.account_name} ({r.iban})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Absenderkonto (IBAN)</label>
          <select
            value={bucket.sender_iban ?? ""}
            onChange={(e) => onUpdate(bucket.id, { sender_iban: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Standard —</option>
            {bankAccounts.map((a) => (
              <option key={a.iban} value={a.iban}>{a.name} ({a.iban})</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
