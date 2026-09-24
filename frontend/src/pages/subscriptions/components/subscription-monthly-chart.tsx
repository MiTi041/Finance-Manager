import { useState, type Ref } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";
import { SectionHeading } from "@/pages/dashboard/components/section-heading";
import { SubscriptionMonthBreakdownDialog } from "./subscription-month-breakdown-dialog";

const RED = "#ff5c6c";
const GREEN = "#00d4a1";
const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

function fmtShort(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

export type MonthSubscriptionContribution = {
  subscription: Subscription;
  paidAmount: number;
  projectedAmount: number;
  projectedDate: string | null;
};

export type DataPoint = {
  month: string;
  monthKey: string;
  fullLabel: string;
  ausgaben: number;
  einnahmen: number;
  contributions: MonthSubscriptionContribution[];
};

export function monthKeyOf(date: string) {
  return format(new Date(date), "yyyy-MM");
}

function getSubKey(sub: Subscription) {
  return `${sub._counterpartyName || sub.name}|${sub.amount}`;
}

export function buildMonthlySubscriptionSpending(subscriptions: Subscription[]): DataPoint[] {
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");

  const months: Record<string, Record<string, MonthSubscriptionContribution>> = {};

  const ensureContribution = (monthKey: string, sub: Subscription) => {
    const bucket = (months[monthKey] ??= {});
    const key = getSubKey(sub);
    bucket[key] ??= {
      subscription: sub,
      paidAmount: 0,
      projectedAmount: 0,
      projectedDate: null,
    };
    return bucket[key];
  };

  for (const sub of subscriptions) {
    if (sub.dismissed) continue;
    if (!sub.transactions || sub.transactions.length === 0) continue;

    for (const tx of sub.transactions) {
      const key = monthKeyOf(tx.date);
      ensureContribution(key, sub).paidAmount += Math.abs(tx.amount);
    }

    const nextKey = monthKeyOf(sub.nextDate);
    const isActive = sub.active !== false;
    if (isActive && nextKey === currentMonth) {
      const paidThisMonth = sub.transactions.some((tx) => monthKeyOf(tx.date) === nextKey);
      const lastDate = new Date(sub.lastDate);
      const cycleDays =
        sub.frequency === "SEMI_ANNUAL" ? 182 : sub.frequency === "ANNUAL" ? 365 : 30;
      const daysSinceLast =
        isNaN(lastDate.getTime()) || !sub.lastDate
          ? Number.POSITIVE_INFINITY
          : (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      const previousCyclePaid = daysSinceLast <= cycleDays + 3;
      if (!paidThisMonth && previousCyclePaid) {
        const contribution = ensureContribution(nextKey, sub);
        contribution.projectedAmount = sub.effectiveAmount;
        contribution.projectedDate = sub.nextDate;
      }
    }
  }

  const start = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const result: DataPoint[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = format(d, "yyyy-MM");
    const contributions = Object.values(months[key] ?? {}).sort((a, b) => {
      const totalA = a.paidAmount + a.projectedAmount;
      const totalB = b.paidAmount + b.projectedAmount;
      return totalB - totalA || a.subscription.name.localeCompare(b.subscription.name);
    });
    const amountOf = (c: MonthSubscriptionContribution) => c.paidAmount + c.projectedAmount;
    const ausgaben = contributions.reduce(
      (sum, c) => (c.subscription.direction === "income" ? sum : sum + amountOf(c)),
      0,
    );
    const einnahmen = contributions.reduce(
      (sum, c) => (c.subscription.direction === "income" ? sum + amountOf(c) : sum),
      0,
    );
    result.push({
      month: format(d, "MMM", { locale: de }),
      monthKey: key,
      fullLabel: format(d, "MMM yyyy", { locale: de }),
      ausgaben,
      einnahmen,
      contributions,
    });
  }
  return result;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DataPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as DataPoint | undefined;
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 mb-2 text-xs text-muted-foreground">{data?.fullLabel ?? label}</p>
      <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: RED }}>
        <span className="opacity-70">Ausgaben  </span>
        {data ? fmtShort(data.ausgaben) : ""}
      </p>
      <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: GREEN }}>
        <span className="opacity-70">Einnahmen  </span>
        {data ? fmtShort(data.einnahmen) : ""}
      </p>
    </div>
  );
}

export type ChartHighlight = {
  monthKey: string;
  direction: "income" | "expense";
};

type Props = {
  data: DataPoint[];
  highlight?: ChartHighlight | null;
  containerRef?: Ref<HTMLDivElement>;
};

export function SubscriptionMonthlyChart({ data, highlight, containerRef }: Props) {
  const [selected, setSelected] = useState<DataPoint | null>(null);

  return (
    <div
      ref={containerRef}
      className="min-w-0 flex-[0_0_320px] rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none"
    >
      <SectionHeading>Abo-Ausgaben &amp; -Einnahmen pro Monat (letzte 24 Monate)</SectionHeading>
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-sm" style={{ background: RED }} />
          Ausgaben
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-sm" style={{ background: GREEN }} />
          Einnahmen
        </div>
      </div>
      <div
        className="h-[200px] [&_.recharts-bar-rectangle]:cursor-pointer [&_svg]:outline-none"
        role="img"
        aria-label="Monatliche Abo-Ausgaben und -Einnahmen als Balkendiagramm"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barSize={20}
            barGap={4}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={SUBTLE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="fullLabel"
              tickFormatter={(val) => val.split(" ")[0].slice(0, 3)}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtShort}
              width={52}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar
              dataKey="ausgaben"
              fill={RED}
              radius={[2, 2, 0, 0]}
              onClick={(_, index) => setSelected(data[index] ?? null)}
            >
              {data.map((d) => {
                const isHit = highlight?.monthKey === d.monthKey && highlight.direction === "expense";
                return (
                  <Cell
                    key={d.monthKey}
                    fill={RED}
                    fillOpacity={isHit ? 1 : highlight ? 0.55 : 0.85}
                    stroke={isHit ? "#ffffff" : undefined}
                    strokeWidth={isHit ? 2 : 0}
                  />
                );
              })}
            </Bar>
            <Bar
              dataKey="einnahmen"
              fill={GREEN}
              radius={[2, 2, 0, 0]}
              onClick={(_, index) => setSelected(data[index] ?? null)}
            >
              {data.map((d) => {
                const isHit = highlight?.monthKey === d.monthKey && highlight.direction === "income";
                return (
                  <Cell
                    key={d.monthKey}
                    fill={GREEN}
                    fillOpacity={isHit ? 1 : highlight ? 0.55 : 0.85}
                    stroke={isHit ? "#ffffff" : undefined}
                    strokeWidth={isHit ? 2 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SubscriptionMonthBreakdownDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        fullLabel={selected?.fullLabel ?? ""}
        contributions={selected?.contributions ?? []}
        total={selected?.ausgaben ?? 0}
        totalIncome={selected?.einnahmen ?? 0}
      />
    </div>
  );
}
