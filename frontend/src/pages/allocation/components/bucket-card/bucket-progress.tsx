import { PieChart } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/utils/format";
import type { AllocationRunBucket } from "@/lib/allocation";

type Props = {
  bucket: AllocationRunBucket;
  accent: { icon: string; bar: string; badge: string; barMuted: string };
  isInfoOnly: boolean;
  hasEmergencyGoal: boolean;
  hasBafoegGoal: boolean;
  bafoegSafeTarget: number;
  bafoegBeforeMonthPct: number;
  bafoegMonthPct: number;
  bafoegOutstandingPct: number;
  bafoegBeforeMonth: number;
  bafoegMonthEinz: number;
  bafoegOutstanding: number;
  progress: number;
  onAnalyse: () => void;
};

export function BucketProgress(props: Props) {
  const {
    bucket,
    accent,
    isInfoOnly,
    hasEmergencyGoal,
    hasBafoegGoal,
    bafoegSafeTarget,
    bafoegBeforeMonthPct,
    bafoegMonthPct,
    bafoegOutstandingPct,
    bafoegBeforeMonth,
    bafoegMonthEinz,
    bafoegOutstanding,
    progress,
    onAnalyse,
  } = props;

  const spendingPct =
    bucket.spent != null
      ? Math.min(100, Math.round((bucket.spent / bucket.target_amount) * 100))
      : 0;

  const segSafeTarget =
    hasEmergencyGoal && bucket.goal_amount != null && bucket.goal_amount > 0
      ? bucket.goal_amount
      : bucket.target_amount > 0
        ? bucket.target_amount
        : 1;
  const segTotalEinz = bucket.saved_einzahlungen ?? 0;
  const segMonthEinz = bucket.month_einzahlungen ?? 0;
  const segBeforeMonthEinz = Math.max(0, segTotalEinz - segMonthEinz);
  const segTotalEntnahmen = bucket.saved_entnahmen ?? 0;
  const segBeforeMonthPct = Math.min(100, Math.max(0, (segBeforeMonthEinz / segSafeTarget) * 100));
  const segMonthPct = Math.min(100, Math.max(0, (segMonthEinz / segSafeTarget) * 100));
  const segEntnahmenPct = Math.min(100, Math.max(0, (segTotalEntnahmen / segSafeTarget) * 100));

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground">
          {isInfoOnly ? "Verfügbar" : bucket.bucket_type === "bafoeg" ? "Ziel" : "Monatsziel"}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {isInfoOnly && bucket.available != null
            ? formatAmount(bucket.available)
            : bucket.bucket_type === "bafoeg" && bucket.goal_amount != null
              ? formatAmount(bucket.goal_amount)
              : formatAmount(bucket.target_amount)}
        </span>
      </div>

      {isInfoOnly && bucket.bucket_type === "spending" && bucket.spent !== undefined ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${bucket.spent > bucket.target_amount ? "bg-red-500" : accent.bar}`}
              style={
                {
                  width: `${spendingPct}%`,
                  minWidth: bucket.spent > 0 ? "8px" : undefined,
                } as React.CSSProperties
              }
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatAmount(bucket.spent)} ausgegeben</span>
            <span
              className={`font-medium tabular-nums ${bucket.spent > bucket.target_amount ? "text-red-500" : ""}`}
            >
              {spendingPct}%
            </span>
          </div>
        </>
      ) : hasBafoegGoal ? (
        <div className="flex h-2 w-full gap-1">
          {bafoegBeforeMonthPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full bg-amber-500/40 cursor-pointer"
                  style={
                    { width: `${bafoegBeforeMonthPct}%`, minWidth: "8px" } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(bafoegBeforeMonth)} angespart (vorherige Monate)
              </TooltipContent>
            </Tooltip>
          )}
          {bafoegMonthPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full bg-amber-500 cursor-pointer"
                  style={{ width: `${bafoegMonthPct}%`, minWidth: "8px" } as React.CSSProperties}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(bafoegMonthEinz)} angespart (diesen Monat)
              </TooltipContent>
            </Tooltip>
          )}
          {bafoegOutstandingPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full bg-red-500/40 cursor-pointer"
                  style={
                    { width: `${bafoegOutstandingPct}%`, minWidth: "8px" } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(bafoegOutstanding)} ausstehende Schulden
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-full flex-1 rounded-full bg-muted" />
        </div>
      ) : (bucket.bucket_type === "emergency" || bucket.bucket_type === "invest") &&
        bucket.saved_einzahlungen != null ? (
        <div className="flex h-2 w-full gap-1">
          {segBeforeMonthPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`h-full rounded-full cursor-pointer ${accent.barMuted}`}
                  style={
                    {
                      width: `${segBeforeMonthPct}%`,
                      minWidth: segBeforeMonthPct > 0 ? "8px" : undefined,
                    } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(segBeforeMonthEinz)} eingezahlt (vorherige Monate)
              </TooltipContent>
            </Tooltip>
          )}
          {segMonthPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`h-full rounded-full cursor-pointer ${accent.bar}`}
                  style={
                    {
                      width: `${segMonthPct}%`,
                      minWidth: segMonthPct > 0 ? "8px" : undefined,
                    } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(segMonthEinz)} eingezahlt (diesen Monat)
              </TooltipContent>
            </Tooltip>
          )}
          {segEntnahmenPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full cursor-pointer bg-orange-500/20"
                  style={
                    {
                      width: `${segEntnahmenPct}%`,
                      minWidth: segEntnahmenPct > 0 ? "8px" : undefined,
                    } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {formatAmount(segTotalEntnahmen)} entnommen
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-full flex-1 rounded-full bg-muted" />
        </div>
      ) : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${accent.bar}`}
            style={
              {
                width: `${hasEmergencyGoal && bucket.goal_amount ? Math.min(100, Math.round(((bucket.saved_total ?? 0) / bucket.goal_amount) * 100)) : progress}%`,
                minWidth: "8px",
              } as React.CSSProperties
            }
          />
        </div>
      )}

      {!isInfoOnly && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {hasBafoegGoal ? (
            <>
              <span>
                {formatAmount(bucket.saved_total ?? 0)} von {formatAmount(bucket.goal_amount!)}
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {Math.round(((bucket.saved_total ?? 0) / bafoegSafeTarget) * 100)}%
              </span>
            </>
          ) : hasEmergencyGoal ? (
            <>
              <span>
                {formatAmount(bucket.saved_total ?? 0)} von {formatAmount(bucket.goal_amount!)}{" "}
                gespart
              </span>
            </>
          ) : (
            <>
              <span>{formatAmount(bucket.transferred)} überwiesen</span>
              <span className="font-medium tabular-nums text-foreground">{progress}%</span>
            </>
          )}
        </div>
      )}

      {bucket.bucket_type === "invest" && bucket.saved_total != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Netto investiert</span>
          <span className="font-medium tabular-nums">
            {formatAmount(bucket.saved_total)}
            {bucket.saved_profit != null && bucket.saved_profit > 0 && (
              <span className="text-emerald-500">
                {" "}
                (Gewinn: {formatAmount(bucket.saved_profit)})
              </span>
            )}
          </span>
        </div>
      )}

      {bucket.bucket_type === "donation" && (
        <button
          onClick={onAnalyse}
          className="flex cursor-pointer text-start items-center gap-1.5 self-start rounded-md border border-pink-500/20 px-2.5 py-1 text-xs font-medium text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 transition-colors"
        >
          <PieChart className="size-3.5" />
          Details zur Spendenverteilung ansehen
        </button>
      )}
    </>
  );
}
