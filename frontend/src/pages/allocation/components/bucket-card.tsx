import { PiggyBank, ShieldCheck, TrendingUp, Heart, Wallet } from "lucide-react";
import { formatAmount } from "@/lib/utils/format";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";
import { Button } from "@/components/ui/button";

const bucketIcons: Record<string, React.ReactNode> = {
  bafoeg: <PiggyBank className="size-5" />,
  emergency: <ShieldCheck className="size-5" />,
  invest: <TrendingUp className="size-5" />,
  donation: <Heart className="size-5" />,
  spending: <Wallet className="size-5" />,
};

const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  onTransfer: (runBucketId: number) => void;
  transferring: boolean;
};

export function BucketCard({ bucket, config, onTransfer, transferring }: Props) {
  const progress = bucket.target_amount > 0
    ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
    : 0;

  const isInfoOnly = bucket.bucket_type === "spending";

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-5" />}
          </div>
          <div>
            <p className="font-medium">{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</p>
            <p className="text-sm text-muted-foreground">
              {formatAmount(bucket.target_amount)} Ziel · {config.percentage}%
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatAmount(bucket.transferred)}</p>
          {!isInfoOnly && (
            <Button
              size="sm"
              variant={bucket.is_completed ? "outline" : "default"}
              disabled={bucket.is_completed || transferring}
              onClick={() => onTransfer(bucket.id)}
              className="mt-1"
            >
              {bucket.is_completed ? "Erledigt" : transferring ? "Wird gesendet..." : "Jetzt zahlen"}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
