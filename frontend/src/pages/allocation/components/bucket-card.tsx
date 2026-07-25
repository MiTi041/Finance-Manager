import {
  PiggyBank,
  ShieldCheck,
  Settings2,
  TrendingUp,
  Heart,
  Wallet,
  CheckCircle2,
  Info,
} from "lucide-react";
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

const bucketTags: Record<string, string> = {
  bafoeg: "tag.bafoegrueckzahlung",
  emergency: "tag.notfallfonds",
  invest: "tag.investieren",
  donation: "tag.spenden",
};

const bucketDescriptions: Record<string, string> = {
  spending: "Budget nach Bafög, Notgroschen, Investieren und Spenden.",
};

// Each bucket gets a distinct accent so the eye can sort buckets at a glance
// without reading the label first. Kept subtle (10% fill) so it reads as a
// tint, not a decoration competing with the numbers.
const bucketAccents: Record<string, { icon: string; bar: string; badge: string }> = {
  bafoeg: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  emergency: {
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  invest: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  donation: {
    icon: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    bar: "bg-pink-500",
    badge: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400",
  },
  spending: {
    icon: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    bar: "bg-slate-400",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400",
  },
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
  bucket,
  config,
  hasRecipient,
  recipientAccounts,
  bankAccounts,
  onTransfer,
  onUpdateConfig,
  transferring,
}: Props) {
  const progress =
    bucket.target_amount > 0
      ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
      : 0;
  const topUp = Math.max(0, bucket.target_amount - bucket.transferred);
  const isInfoOnly = bucket.bucket_type === "spending";
  const isPaid = topUp <= 0 && bucket.target_amount > 0;
  const accent = bucketAccents[bucket.bucket_type] ?? bucketAccents.spending;

  return (
    <Card className="flex h-full flex-col py-6 transition-shadow hover:shadow-md">
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${accent.icon}`}
            >
              {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-4" />}
            </span>
            <CardTitle>{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</CardTitle>
          </div>
          {!isInfoOnly && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 -mr-2 -mt-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Einstellungen für ${bucketLabels[bucket.bucket_type]}`}
                >
                  <Settings2 className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{bucketLabels[bucket.bucket_type]}</p>
                  <p className="text-xs text-muted-foreground">Verteilung und Konten anpassen</p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`pct-${bucket.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Anteil vom Netto-Einkommen
                  </label>
                  <div className="relative">
                    <input
                      id={`pct-${bucket.id}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={config.percentage}
                      onChange={(e) =>
                        onUpdateConfig(bucket.bucket_id, { percentage: Number(e.target.value) })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>

                {bucket.bucket_type === "bafoeg" && (
                  <label
                    htmlFor={`active-${bucket.id}`}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      id={`active-${bucket.id}`}
                      checked={config.is_active}
                      onChange={(e) =>
                        onUpdateConfig(bucket.bucket_id, { is_active: e.target.checked })
                      }
                      className="size-4 rounded border-input"
                    />
                    Rücklage aktiv
                  </label>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor={`recipient-${bucket.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Empfängerkonto
                  </label>
                  <select
                    id={`recipient-${bucket.id}`}
                    value={config.recipient_account_id ?? ""}
                    onChange={(e) =>
                      onUpdateConfig(bucket.bucket_id, {
                        recipient_account_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Kein Konto ausgewählt</option>
                    {recipientAccounts.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.account_name} ({r.iban})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`sender-${bucket.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Absenderkonto
                  </label>
                  <select
                    id={`sender-${bucket.id}`}
                    value={config.sender_iban ?? ""}
                    onChange={(e) =>
                      onUpdateConfig(bucket.bucket_id, { sender_iban: e.target.value || null })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Standardkonto</option>
                    {bankAccounts.map((a) => (
                      <option key={a.iban} value={a.iban}>
                        {a.name} ({a.iban})
                      </option>
                    ))}
                  </select>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <CardDescription>
          {bucketDescriptions[bucket.bucket_type] ?? `${config.percentage}% vom Netto-Einkommen`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{isInfoOnly ? "Verfügbar" : "Monatsziel"}</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatAmount(bucket.target_amount)}
          </span>
        </div>

        {!isInfoOnly && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatAmount(bucket.transferred)} überwiesen</span>
              <span className="font-medium tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${accent.bar}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}

        {bucketTags[bucket.bucket_type] && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="size-3" />
            Wird gebucht mit Tag {bucketTags[bucket.bucket_type]}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {isInfoOnly ? null : isPaid ? (
            <div
              className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${accent.badge}`}
            >
              <CheckCircle2 className="size-4" />
              Monatsziel erreicht
            </div>
          ) : !hasRecipient ? (
            <div className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
              Kein Empfängerkonto ausgewählt — in den Einstellungen hinzufügen
            </div>
          ) : (
            <Button
              size="sm"
              disabled={transferring}
              onClick={() => onTransfer(bucket.id)}
              className="w-full"
            >
              {transferring ? "Wird gesendet…" : `${formatAmount(topUp)} jetzt überweisen`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
