import { PiggyBank, ShieldCheck, TrendingUp, Heart, Wallet, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpButton } from "@/components/ui/help-button";
import { BucketSettingsPopover } from "./bucket-settings-popover";
import { BucketProgress } from "./bucket-progress";
import { BucketDetails } from "./bucket-details";
import { BucketFooter } from "./bucket-footer";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";
import { formatAmount } from "@/lib/utils/format";
import type { SpendingSubscriptionState } from "@/lib/subscription-budget";

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

const bucketAccents: Record<string, { icon: string; bar: string; badge: string; barMuted: string }> = {
  bafoeg: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    barMuted: "bg-amber-500/40",
  },
  emergency: {
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    barMuted: "bg-rose-500/40",
  },
  invest: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    barMuted: "bg-emerald-500/40",
  },
  donation: {
    icon: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    bar: "bg-pink-500",
    badge: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400",
    barMuted: "bg-pink-500/40",
  },
  spending: {
    icon: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    bar: "bg-slate-400",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400",
    barMuted: "bg-slate-400/40",
  },
};

const bucketDescriptions: Record<string, (pct: number) => string> = {
  spending: () => "Budget nach Sparplänen, Notgroschen, Investieren und Spenden.",
  emergency: (pct) => `${pct}% vom verbleibenden Netto nach Sparplänen.`,
  invest: (pct) => `${pct}% vom verbleibenden Netto nach Sparplänen.`,
  donation: (pct) => `${pct}% vom Netto-Einkommen.`,
};
const bucketDescriptionsBafoeg: Record<string, (pct: number) => string> = {
  spending: () => "Budget nach Bafög, Sparplänen, Notgroschen, Investieren und Spenden.",
  emergency: (pct) => `${pct}% vom verbleibenden Netto nach Bafög und Sparplänen.`,
  invest: (pct) => `${pct}% vom verbleibenden Netto nach Bafög und Sparplänen.`,
  donation: (pct) => `${pct}% vom Netto-Einkommen.`,
};

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  hasRecipient: boolean;
  recipientAccounts: { id: number; account_name: string; recipient_name: string; iban: string }[];
  bankAccounts: { iban: string; name: string; bankKey: string }[];
  canTransferMap: Map<string, boolean>;
  bafoegActive: boolean;
  onTransfer: (runBucketId: number, amount?: number) => void;
  onUpdateConfig: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
  onAnalyse: () => void;
  onRefresh?: () => void;
  transferring: boolean;
  subscriptionState: SpendingSubscriptionState | null;
};

export function BucketCard({
  bucket,
  config,
  hasRecipient,
  recipientAccounts,
  bankAccounts,
  canTransferMap,
  bafoegActive,
  onTransfer,
  onUpdateConfig,
  onAnalyse,
  onRefresh,
  transferring,
  subscriptionState,
}: Props) {
  const progress =
    bucket.target_amount > 0
      ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
      : 0;
  const topUp = Math.max(0, bucket.target_amount - bucket.transferred);
  const isInfoOnly = bucket.bucket_type === "spending";
  const isPaid = topUp <= 0 && bucket.target_amount > 0;
  const accent = bucketAccents[bucket.bucket_type] ?? bucketAccents.spending;

  const hasEmergencyGoal = bucket.bucket_type === "emergency" && bucket.goal_amount != null;
  const hasBafoegGoal = bucket.bucket_type === "bafoeg" && bucket.goal_amount != null;
  const hasDetails = hasEmergencyGoal || hasBafoegGoal;

  const bafoegSafeTarget =
    bucket.goal_amount != null && bucket.goal_amount > 0 ? bucket.goal_amount : 1;
  const bafoegMonthEinz = bucket.month_einzahlungen ?? 0;
  const bafoegBeforeMonth = Math.max(0, (bucket.saved_total ?? 0) - bafoegMonthEinz);
  const bafoegBeforeMonthPct = Math.min(
    100,
    Math.max(0, (bafoegBeforeMonth / bafoegSafeTarget) * 100),
  );
  const bafoegMonthPct = Math.min(100, Math.max(0, (bafoegMonthEinz / bafoegSafeTarget) * 100));
  const bafoegOutstanding = Math.max(
    0,
    (bucket.saved_entnahmen ?? 0) - (bucket.saved_tilgungen ?? 0),
  );
  const bafoegOutstandingPct = Math.min(
    100,
    Math.max(0, (bafoegOutstanding / bafoegSafeTarget) * 100),
  );
  const bafoegMonthlyRate = bucket.required_monthly_rate ?? bucket.target_amount;
  const bafoegThisMonth = bucket.month_einzahlungen ?? 0;
  const bafoegPaid = bafoegMonthlyRate <= 0 || bafoegThisMonth >= bafoegMonthlyRate;
  const bafoegTopUp = Math.max(0, bafoegMonthlyRate - bafoegThisMonth);
  const bafoegFullyPaid = bafoegPaid && bafoegOutstanding <= 0;

  return (
    <Card className="flex h-full flex-col py-6 transition-shadow hover:shadow-md">
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${accent.icon}`}
            >
              {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-4" />}
            </span>
            <CardTitle className="flex items-center gap-1.5 break-words min-w-0">
              {bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}
              {bucket.bucket_type === "donation" && (
                <HelpButton>
                  Der Spenden-Betrag wird an ein zufällig ausgewähltes Spenden-Konto gesendet.
                  Hinterlege in{" "}
                  <span className="font-semibold">Einstellungen → Empfängerkonten</span> ein Konto
                  und markiere es als Spenden-Konto.
                </HelpButton>
              )}
            </CardTitle>
          </div>
          {!isInfoOnly && (
            <BucketSettingsPopover
              bucket={bucket}
              config={config}
              accent={accent}
              recipientAccounts={recipientAccounts}
              bankAccounts={bankAccounts}
              canTransferMap={canTransferMap}
              onUpdateConfig={onUpdateConfig}
              onRefresh={onRefresh}
            />
          )}
        </div>
        <CardDescription className="break-words">
          {bucket.bucket_type === "bafoeg"
            ? null
            : ((bafoegActive ? bucketDescriptionsBafoeg : bucketDescriptions)[bucket.bucket_type]?.(
                config.percentage,
              ) ?? `${config.percentage}% vom Netto-Einkommen`)}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-3 text-sm">
        <BucketProgress
          bucket={bucket}
          accent={accent}
          isInfoOnly={isInfoOnly}
          hasEmergencyGoal={hasEmergencyGoal}
          hasBafoegGoal={hasBafoegGoal}
          bafoegSafeTarget={bafoegSafeTarget}
          bafoegBeforeMonthPct={bafoegBeforeMonthPct}
          bafoegMonthPct={bafoegMonthPct}
          bafoegOutstandingPct={bafoegOutstandingPct}
          bafoegBeforeMonth={bafoegBeforeMonth}
          bafoegMonthEinz={bafoegMonthEinz}
          bafoegOutstanding={bafoegOutstanding}
          progress={progress}
          onAnalyse={onAnalyse}
        />

        {isInfoOnly && subscriptionState && subscriptionState.load > 0 && (
          <div className="space-y-1 rounded-lg border border-slate-500/20 bg-muted/30 px-2.5 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Abonnements</span>
              <span className="font-medium tabular-nums">
                {formatAmount(subscriptionState.load)}/Monat
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Budget Restliche Ausgaben</span>
              <span className="font-medium tabular-nums">
                {formatAmount(bucket.target_amount)}
              </span>
            </div>
            {subscriptionState.shortfall > 0 && (
              <p className="flex items-center gap-1 pt-0.5 font-medium text-red-500">
                <TriangleAlert className="size-3.5 shrink-0" />
                Abonnements übersteigen das Budget um {formatAmount(subscriptionState.shortfall)}
              </p>
            )}
          </div>
        )}

        <BucketDetails
          hasDetails={hasDetails}
          hasEmergencyGoal={hasEmergencyGoal}
          hasBafoegGoal={hasBafoegGoal}
          bucketType={bucket.bucket_type}
          monthsLeft={bucket.months_left}
          bafoegOutstanding={bafoegOutstanding}
          requiredMonthlyRate={bucket.required_monthly_rate}
          monthEinzahlungen={bucket.month_einzahlungen}
          incomeEventsLeft={bucket.future_income_events}
        />

        <BucketFooter
          bucketType={bucket.bucket_type}
          isInfoOnly={isInfoOnly}
          hasRecipient={hasRecipient}
          accent={accent}
          transferring={transferring}
          bucketRunId={bucket.id}
          isPaid={isPaid}
          topUp={topUp}
          bafoegFullyPaid={bafoegFullyPaid}
          bafoegTopUp={bafoegTopUp}
          bafoegPaid={bafoegPaid}
          bafoegOutstanding={bafoegOutstanding}
          onTransfer={onTransfer}
        />
      </CardContent>
    </Card>
  );
}
