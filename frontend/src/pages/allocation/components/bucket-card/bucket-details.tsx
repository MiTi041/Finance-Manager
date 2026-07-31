import { useState } from "react";
import { ChevronDown, HashIcon } from "lucide-react";
import { formatAmount } from "@/lib/utils/format";

const bucketTags: Record<string, string> = {
  bafoeg: "tag.bafoegschulden",
  emergency: "tag.notfallfonds",
  invest: "tag.investieren",
  donation: "tag.spenden",
};

function formatMonthsLeft(months: number) {
  if (months >= 12) {
    return `${Math.floor(months / 12)} Jahre, ${months % 12} Monate`;
  }
  return `${months} ${months === 1 ? "Monat" : "Monate"}`;
}

function DetailRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "default" | "destructive" }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground min-w-0 break-words">{label}</span>
      <span className={`font-medium tabular-nums ${tone === "destructive" ? "text-red-500" : ""}`}>
        {value}
      </span>
    </div>
  );
}

type Props = {
  hasDetails: boolean;
  hasEmergencyGoal: boolean;
  hasBafoegGoal: boolean;
  bucketType: string;
  monthsLeft: number | null | undefined;
  bafoegOutstanding: number;
  requiredMonthlyRate: number | null | undefined;
  monthEinzahlungen: number | null | undefined;
  incomeEventsLeft: number | null | undefined;
};

export function BucketDetails(props: Props) {
  const {
    hasDetails, hasEmergencyGoal, hasBafoegGoal, bucketType,
    monthsLeft, bafoegOutstanding, requiredMonthlyRate,
    monthEinzahlungen, incomeEventsLeft,
  } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!hasDetails) return null;

  return (
    <div className="rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        Details
        <ChevronDown className={`size-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
      </button>
      {detailsOpen && (
        <div className="space-y-1.5 border-t px-2.5 py-2.5">
          {hasEmergencyGoal && monthsLeft != null && monthsLeft > 0 && (
            <DetailRow label="Noch nötig bei aktueller Sparrate" value={formatMonthsLeft(monthsLeft)} />
          )}
          {hasBafoegGoal && (
            <>
              {bafoegOutstanding > 0 && (
                <DetailRow label="Ausstehende Schulden" value={formatAmount(bafoegOutstanding)} tone="destructive" />
              )}
              {requiredMonthlyRate != null && requiredMonthlyRate > 0 && (
                <DetailRow label="Nötige Rate/Monat (mit Zinsen)" value={formatAmount(requiredMonthlyRate)} />
              )}
              {monthEinzahlungen != null && (
                <DetailRow label="Diesen Monat überwiesen" value={formatAmount(monthEinzahlungen)} />
              )}
              {monthsLeft != null && monthsLeft > 0 && (
                <DetailRow label="Noch nötig bei aktueller Rate" value={formatMonthsLeft(monthsLeft)} />
              )}
              {incomeEventsLeft != null && (
                <DetailRow label="Erwartete Einkommen bis Zieldatum" value={incomeEventsLeft} />
              )}
            </>
          )}
          {bucketTags[bucketType] && (
            <DetailRow
              label="Verwendungszweck-Tag"
              value={
                <span className="flex items-center gap-0.5">
                  <HashIcon className="size-3" />
                  {bucketTags[bucketType]}
                </span>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
