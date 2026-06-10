import { useMemo } from "react";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2, CircleDashed, CircleX, Ellipsis } from "lucide-react";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BankLogo } from "@/components/bank-logo";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/use-finance-data";
import { useCategories } from "@/hooks/use-categories";
import { usePartnerAnalytics } from "@/hooks/use-partner-analytics";
import { getTimeSpanForRange } from "@/types/time-range";
import type { DateFilterValue } from "@/types/date-filter";

const COLORS = [
  "#00d4a1",
  "#ff5c6c",
  "#b47bff",
  "#ff9f43",
  "#54a0ff",
  "#5f27cd",
  "#01a3a4",
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
];

function fmt(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function computeDateFooter(dateFilter: DateFilterValue) {
  if (!dateFilter.timeSpan && !dateFilter.timeRange) return null;
  const span = dateFilter.timeSpan ?? getTimeSpanForRange(dateFilter.timeRange!);
  return `${format(span.from, "dd.MM.yy")} – ${format(span.until, "dd.MM.yy")}`;
}

function groupSmallSlices(
  items: {
    name: string;
    value: number;
    icon?: string | null;
    logoUrl?: string | null;
    logoWhiteBackground?: boolean;
    logoPadding?: boolean;
  }[],
  restLabel = "Weitere Kategorien",
): {
  name: string;
  value: number;
  icon?: string | null;
  logoUrl?: string | null;
  logoWhiteBackground?: boolean;
  logoPadding?: boolean;
}[] {
  if (items.length === 0) return items;
  const total = items.reduce((s, i) => s + i.value, 0);
  const threshold = total * 0.05;
  const big: typeof items = [];
  let restSum = 0;
  for (const item of items) {
    if (item.value >= threshold) {
      big.push(item);
    } else {
      restSum += item.value;
    }
  }
  if (restSum > 0 && Math.round((restSum / total) * 100) > 0) {
    big.push({ name: restLabel, value: restSum, icon: "❓" });
  }
  return big;
}

function PieLabel({ cx, cy, midAngle, outerRadius, percent, payload }: any) {
  const RAD = Math.PI / 180;
  const r = outerRadius + 28;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  const anchor = x > cx ? "start" : "end";

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      className="fill-muted-foreground text-[11px]"
    >
      {payload.icon && <tspan>{payload.icon} </tspan>}
      <tspan>{payload.name}</tspan>
      <tspan className="fill-foreground" dx={4}>
        {(percent * 100).toFixed(0)}%
      </tspan>
    </text>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: entry } = payload[0];
  return (
    <div className="rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
        {entry.icon && <span>{entry.icon}</span>}
        {name}
      </p>
      <p className="m-0 mt-1 text-base font-semibold tabular-nums text-[#f0f0fa]">{fmt(value)}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const {
    loading: txLoading,
    refreshing,
    error: txError,
    transactions,
  } = useFinanceData(dateFilter);
  const {
    loading: catLoading,
    error: catError,
    categoryAnalytics,
  } = useCategories({ transactions });
  const { outgoing: partnerOutgoing, incoming: partnerIncoming } = usePartnerAnalytics({
    transactions,
  });

  const loading = txLoading || catLoading;
  const error = txError || catError;
  const dateFooter = useMemo(() => computeDateFooter(dateFilter), [dateFilter]);

  const expenseData = useMemo(
    () =>
      groupSmallSlices(
        categoryAnalytics
          .filter((a) => a.typ === "Ausgabe" && a.totalAmount < 0)
          .map((a) => ({ name: a.name, value: Math.abs(a.totalAmount), icon: a.icon }))
          .sort((a, b) => b.value - a.value),
      ) as { name: string; value: number; icon: string | null }[],
    [categoryAnalytics],
  );

  const incomeData = useMemo(
    () =>
      groupSmallSlices(
        categoryAnalytics
          .filter((a) => a.typ === "Einnahme" && a.totalAmount > 0)
          .map((a) => ({ name: a.name, value: a.totalAmount, icon: a.icon }))
          .sort((a, b) => b.value - a.value),
      ) as { name: string; value: number; icon: string | null }[],
    [categoryAnalytics],
  );

  const partnerExpenseData = useMemo(
    () =>
      groupSmallSlices(
        partnerOutgoing.map((p) => ({
          name: p.name,
          value: p.totalAmount,
          logoUrl: p.logoUrl,
          logoWhiteBackground: p.logoWhiteBackground,
          logoPadding: p.logoPadding,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoWhiteBackground: boolean;
        logoPadding: boolean;
      }[],
    [partnerOutgoing],
  );

  const partnerIncomeData = useMemo(
    () =>
      groupSmallSlices(
        partnerIncoming.map((p) => ({
          name: p.name,
          value: p.totalAmount,
          logoUrl: p.logoUrl,
          logoWhiteBackground: p.logoWhiteBackground,
          logoPadding: p.logoPadding,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoWhiteBackground: boolean;
        logoPadding: boolean;
      }[],
    [partnerIncoming],
  );

  if (transactions.length === 0 && !loading) {
    return <EmptyState title="Es gibt noch keine Daten" illustration={<CircleDashed />} />;
  }

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Analysedaten"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        {refreshing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Aktualisiere…
          </div>
        )}
      </div>

      {loading ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <DonutChartCard title="Ausgaben" data={expenseData} dateFooter={dateFooter} />
            <DonutChartCard title="Einnahmen" data={incomeData} dateFooter={dateFooter} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PartnerChartCard
              title="Zahlungspartner Ausgaben"
              data={partnerExpenseData}
              dateFooter={dateFooter}
            />
            <PartnerChartCard
              title="Zahlungspartner Einnahmen"
              data={partnerIncomeData}
              dateFooter={dateFooter}
            />
          </div>
        </>
      )}
    </div>
  );
}

function DonutChartCard({
  title,
  data,
  dateFooter,
}: {
  title: string;
  data: { name: string; value: number; icon: string | null }[];
  dateFooter?: string | null;
}) {
  return (
    <div className="rounded-panel border border-border bg-card p-[22px_22px_14px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-[0.06em] uppercase text-muted-foreground">
          {title}
        </span>
        {dateFooter && <span className="text-[11px] text-muted-foreground/50">{dateFooter}</span>}
      </div>
      {data.length === 0 ? (
        <EmptyState title="Keine Daten" illustration={<CircleX />} />
      ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={105}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                label={PieLabel}
                labelLine
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function PartnerChartCard({
  title,
  data,
  dateFooter,
}: {
  title: string;
  data: {
    name: string;
    value: number;
    logoUrl: string | null;
    logoWhiteBackground: boolean;
    logoPadding: boolean;
  }[];
  dateFooter?: string | null;
}) {
  return (
    <div className="rounded-panel border border-border bg-card p-[22px_22px_14px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-[0.06em] uppercase text-muted-foreground">
          {title}
        </span>
        {dateFooter && <span className="text-[11px] text-muted-foreground/50">{dateFooter}</span>}
      </div>
      {data.length === 0 ? (
        <EmptyState title="Keine Daten" illustration={<CircleX />} />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="h-[260px] w-full shrink-0 sm:w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            {data.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <div
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                {entry.name === "Weitere Zahlungspartner" ? (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-xs tracking-[0.2em] text-muted-foreground">
                    <Ellipsis />
                  </div>
                ) : (
                  <BankLogo
                    src={entry.logoUrl || undefined}
                    alt={entry.name}
                    sizeClassName="size-7 shrink-0"
                    backgroundClassName={entry.logoWhiteBackground ? "bg-white" : "bg-muted/70"}
                    imgNoPadding={!entry.logoPadding}
                  />
                )}
                <span className="truncate text-muted-foreground">{entry.name}</span>
                <span className="ml-auto shrink-0 tabular-nums font-medium text-foreground">
                  {fmt(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-[360px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-[360px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
