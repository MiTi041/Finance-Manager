import { formatAmount } from "@/lib/utils/format";

type Props = {
  month: string;
  netIncome: number;
  remaining: number;
  status: string;
};

export function AllocationSummary({ month, netIncome, remaining, status }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <SummaryCard label="Monat" value={month} />
      <SummaryCard label="Netto-Einkommen" value={formatAmount(netIncome)} />
      <SummaryCard label="Verbleibend" value={formatAmount(remaining)} />
      <SummaryCard
        label="Status"
        value={
          status === "completed" ? "Abgeschlossen" :
          status === "partial" ? "Teilweise" : "Berechnet"
        }
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
