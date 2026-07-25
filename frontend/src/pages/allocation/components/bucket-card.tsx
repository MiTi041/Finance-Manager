import { PiggyBank, ShieldCheck, Settings2, TrendingUp, Heart, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAmount } from "@/lib/utils/format";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";

export const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

const bucketIcons: Record<string, React.ReactNode> = {
  bafoeg: <PiggyBank className="size-4" />,
  emergency: <ShieldCheck className="size-4" />,
  invest: <TrendingUp className="size-4" />,
  donation: <Heart className="size-4" />,
  spending: <Wallet className="size-4" />,
};

const bucketDescriptions: Record<string, string> = {
  spending: "Budget nach Bafög, Notgroschen, Investieren und Spenden.",
};

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  hasRecipient: boolean;
  recipientAccounts: { id: number; account_name: string; iban: string }[];
  bankAccounts: { iban: string; name: string }[];
  onTransfer: (runBucketId: number) => void;
  onUpdateConfig: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
  transferring: boolean;
};

export function BucketCard({
  bucket, config, hasRecipient, recipientAccounts, bankAccounts,
  onTransfer, onUpdateConfig, transferring,
}: Props) {
  const progress = bucket.target_amount > 0
    ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
    : 0;
  const topUp = Math.max(0, bucket.target_amount - bucket.transferred);
  const isInfoOnly = bucket.bucket_type === "spending";
  const isPaid = topUp <= 0;

  return (
    <Card className="flex h-full flex-col py-6">
      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-4" />}
            <CardTitle>{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</CardTitle>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 -mr-2 -mt-1">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Prozentsatz (%)</label>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={config.percentage}
                  onChange={(e) => onUpdateConfig(bucket.bucket_id, { percentage: Number(e.target.value) })}
                  disabled={isInfoOnly}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {bucket.bucket_type === "bafoeg" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" id={`active-${bucket.id}`}
                    checked={config.is_active}
                    onChange={(e) => onUpdateConfig(bucket.bucket_id, { is_active: e.target.checked })}
                    className="size-4"
                  />
                  <label htmlFor={`active-${bucket.id}`} className="text-sm">Aktiv</label>
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground">Empfängerkonto</label>
                <select
                  value={config.recipient_account_id ?? ""}
                  onChange={(e) => onUpdateConfig(bucket.bucket_id, { recipient_account_id: e.target.value ? Number(e.target.value) : null })}
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
                  value={config.sender_iban ?? ""}
                  onChange={(e) => onUpdateConfig(bucket.bucket_id, { sender_iban: e.target.value || null })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Standard —</option>
                  {bankAccounts.map((a) => (
                    <option key={a.iban} value={a.iban}>{a.name} ({a.iban})</option>
                  ))}
                </select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <CardDescription>
          {bucketDescriptions[bucket.bucket_type] ?? `${config.percentage}% vom Netto-Einkommen`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Monatsziel</span>
          <span className="font-semibold">{formatAmount(bucket.target_amount)}</span>
        </div>
        {!isInfoOnly && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Diesen Monat überwiesen</span>
            <span className="font-semibold">{formatAmount(bucket.transferred)}</span>
          </div>
        )}
        <div className="bg-muted h-2 w-full overflow-hidden rounded">
          <div
            className="h-full rounded bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs">Tag: {bucket.bucket_type}</p>
        <div className="mt-auto flex flex-col gap-2">
          {isInfoOnly ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-md border border-muted bg-muted/30 px-3 py-2 text-muted-foreground">
              <Wallet className="size-4" />
              <span className="text-sm">Restbudget: {formatAmount(bucket.target_amount)}</span>
            </div>
          ) : isPaid ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700">
              <span className="text-sm font-medium">Monatsziel erreicht</span>
            </div>
          ) : !hasRecipient ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-md border border-muted bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
              Kein Empfänger konfiguriert
            </div>
          ) : (
            <Button
              size="sm"
              disabled={transferring}
              onClick={() => onTransfer(bucket.id)}
              className="w-full"
            >
              {transferring ? "Wird gesendet..." : `Jetzt ${formatAmount(topUp)} zahlen`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
