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
  bafoegAvailable: number;
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
    bafoegAvailable,
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

  const bafoegAvailablePct = Math.min(
    100,
    Math.max(0, (bafoegAvailable / bafoegSafeTarget) * 100),
  );
  const bafoegBeforeAmberPct = Math.min(bafoegBeforeMonthPct, bafoegAvailablePct);
  const bafoegMonthAmberPct = Math.max(
    0,
    Math.min(bafoegMonthPct, bafoegAvailablePct - bafoegBeforeAmberPct),
  );

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground">
          {isInfoOnly ? "Verfügbar" : bucket.bucket_type === "bafoeg" ? "Ziel" : "Monatsziel"}
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {isInfoOnly && bucket.available != null
            ? formatAmount(bucket.available)
            : bucket.bucket_type === "bafoeg" && bucket.goal_amount != null
              ? formatAmount(bucket.goal_amount)
              : formatAmount(bucket.target_amount)}
        </span>
      </div>

      {isInfoOnly && bucket.bucket_type === "spending" && bucket.spent !== undefined ? (
        <>
          <div className="flex h-2 w-full gap-1">
            {spendingPct > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`h-full rounded-full cursor-pointer ${bucket.spent > bucket.target_amount ? "bg-red-500" : accent.bar}`}
                    style={
                      {
                        width: `${spendingPct}%`,
                        minWidth: spendingPct > 0 ? "8px" : undefined,
                      } as React.CSSProperties
                    }
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="font-mono">{formatAmount(bucket.spent)}</span> ausgegeben
                  (diesen Monat)
                </TooltipContent>
              </Tooltip>
            )}
            <div className="h-full flex-1 rounded-full bg-muted" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <span className="font-mono">{formatAmount(bucket.spent)}</span> ausgegeben
            </span>
            <span
              className={`font-medium tabular-nums ${bucket.spent > bucket.target_amount ? "text-red-500" : ""}`}
            >
              {spendingPct}%
            </span>
          </div>
        </>
      ) : hasBafoegGoal ? (
        <div className="flex h-2 w-full gap-1">
          {bafoegBeforeAmberPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full bg-amber-500/40 cursor-pointer"
                  style={
                    { width: `${bafoegBeforeAmberPct}%`, minWidth: "8px" } as React.CSSProperties
                  }
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-mono">{formatAmount(bafoegBeforeMonth)}</span> angespart
                (vorherige Monate)
              </TooltipContent>
            </Tooltip>
          )}
          {bafoegMonthAmberPct > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="h-full rounded-full bg-amber-500 cursor-pointer"
                  style={{ width: `${bafoegMonthAmberPct}%`, minWidth: "8px" } as React.CSSProperties}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-mono">{formatAmount(bafoegMonthEinz)}</span> angespart
                (diesen Monat)
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
                <span className="font-mono">{formatAmount(bafoegOutstanding)}</span> ausstehende
                Schulden
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-full flex-1 rounded-full bg-muted" />
        </div>
      ) : bucket.bucket_type === "emergency" && bucket.saved_einzahlungen != null ? (
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
                <span className="font-mono">{formatAmount(segBeforeMonthEinz)}</span> eingezahlt
                (vorherige Monate)
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
                <span className="font-mono">{formatAmount(segMonthEinz)}</span> eingezahlt
                (diesen Monat)
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
                <span className="font-mono">{formatAmount(segTotalEntnahmen)}</span> entnommen
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-full flex-1 rounded-full bg-muted" />
        </div>
      ) : bucket.bucket_type === "donation" ? (
        <>
          <div className="flex h-2 w-full gap-1">
            {progress > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`h-full rounded-full cursor-pointer ${accent.bar}`}
                    style={
                      {
                        width: `${progress}%`,
                        minWidth: progress > 0 ? "8px" : undefined,
                      } as React.CSSProperties
                    }
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="font-mono">{formatAmount(bucket.transferred)}</span> überwiesen
                  (diesen Monat)
                </TooltipContent>
              </Tooltip>
            )}
            <div className="h-full flex-1 rounded-full bg-muted" />
          </div>
        </>
      ) : (() => {
        const barPct = hasEmergencyGoal && bucket.goal_amount
          ? Math.min(100, Math.round(((bucket.saved_total ?? 0) / bucket.goal_amount) * 100))
          : progress;
        return (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${accent.bar}`}
              style={
                {
                  width: `${barPct}%`,
                  minWidth: barPct > 0 ? "8px" : undefined,
                } as React.CSSProperties
              }
            />
          </div>
        );
      })()}

      {!isInfoOnly && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {hasBafoegGoal ? (
            <>
              <span>
                <span className="font-mono">{formatAmount(bafoegAvailable)}</span> von{" "}
                <span className="font-mono">{formatAmount(bucket.goal_amount!)}</span>
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {Math.round((bafoegAvailable / bafoegSafeTarget) * 100)}%
              </span>
            </>
          ) : hasEmergencyGoal ? (
            <>
              <span>
                <span className="font-mono">{formatAmount(bucket.saved_total ?? 0)}</span> von{" "}
                <span className="font-mono">{formatAmount(bucket.goal_amount!)}</span> gespart
              </span>
            </>
          ) : (
            <>
              <span>
                <span className="font-mono">{formatAmount(bucket.transferred)}</span> überwiesen
              </span>
              <span className="font-medium tabular-nums text-foreground">{progress}%</span>
            </>
          )}
        </div>
      )}

      {bucket.bucket_type === "invest" && bucket.saved_total != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Netto investiert</span>
          <span className="font-medium tabular-nums">
            <span className="font-mono">{formatAmount(bucket.saved_total)}</span>
            {bucket.saved_profit != null && bucket.saved_profit > 0 && (
              <span className="text-emerald-500">
                {" "}
                (Gewinn: <span className="font-mono">{formatAmount(bucket.saved_profit)}</span>)
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
