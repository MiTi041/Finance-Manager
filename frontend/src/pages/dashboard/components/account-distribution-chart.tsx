"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import NumberFlow, { type Format } from "@number-flow/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AccountBalance } from "./account-cards";
import { SectionHeading } from "./section-heading";

const COLORS = [
  "#00d4a1",
  "#54a0ff",
  "#b47bff",
  "#ff8c42",
  "#48dbfb",
  "#ff6b9d",
  "#ffca3a",
  "#1dd1a1",
  "#e040fb",
  "#5f9ea0",
];

function fmt(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const CURRENCY0: Format = {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
};

type AccountDistributionChartProps = {
  accountBalances: AccountBalance[];
};

export function AccountDistributionChart({ accountBalances }: AccountDistributionChartProps) {
  const { data, total, negativeCount } = useMemo(() => {
    const included = accountBalances.filter((a) => !a.excludeFromTotals);
    const positive = included
      .filter((a) => a.balance > 0)
      .map((a) => ({ name: a.accountName || a.bankName, value: a.balance }))
      .sort((a, b) => b.value - a.value);
    return {
      data: positive,
      total: positive.reduce((s, d) => s + d.value, 0),
      negativeCount: included.filter((a) => a.balance < 0).length,
    };
  }, [accountBalances]);

  if (data.length === 0) return null;

  return (
    <div className="min-w-0 rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <SectionHeading>Vermögensverteilung nach Konto</SectionHeading>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ transformOrigin: "left" }}
        className="flex h-4 w-full gap-2"
        role="img"
        aria-label="Vermögensverteilung nach Konto als Balkendiagramm"
      >
        {data.map((entry, i) => (
          <Tooltip key={entry.name}>
            <TooltipTrigger asChild>
              <div
                className="h-full cursor-pointer rounded-full transition hover:brightness-125"
                style={{
                  flex: `${entry.value} 1 0%`,
                  minWidth: "6px",
                  background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}bf)`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              {entry.name}: {fmt(entry.value)}
            </TooltipContent>
          </Tooltip>
        ))}
      </motion.div>

      <div className="mt-4 flex flex-col gap-2.5">
        {data.map((entry, i) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <div
              className="size-2 shrink-0 rounded-sm"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.name}</span>
            <NumberFlow
              value={entry.value}
              format={CURRENCY0}
              locales="de-DE"
              className="shrink-0 tabular-nums text-foreground"
            />
            <span className="w-10 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground/60">
              {total > 0 ? `${Math.round((entry.value / total) * 100)} %` : ""}
            </span>
          </div>
        ))}
      </div>

      {negativeCount > 0 && (
        <p className="m-0 mt-3 text-[11px] text-muted-foreground/60">
          {negativeCount} {negativeCount === 1 ? "Konto" : "Konten"} mit negativem Saldo nicht
          dargestellt.
        </p>
      )}
    </div>
  );
}
