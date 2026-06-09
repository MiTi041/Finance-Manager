import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";

export const SUBSCRIPTION_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function getSubDay(sub: Subscription): number {
  return new Date(sub.nextDate).getDate();
}

function isActiveInMonth(sub: Subscription, month: Date): boolean {
  if (sub.frequency === "MONTHLY") return true;
  const first = new Date(sub.firstDate);
  const m = month.getMonth();
  const y = month.getFullYear();
  const diff = (y - first.getFullYear()) * 12 + (m - first.getMonth());
  if (sub.frequency === "SEMI_ANNUAL") return diff >= 0 && diff % 6 === 0;
  if (sub.frequency === "ANNUAL") return m === first.getMonth() && y >= first.getFullYear();
  return false;
}

function subsForDay(day: Date, subs: Subscription[]): Subscription[] {
  return subs.filter((s) => getSubDay(s) === day.getDate() && isActiveInMonth(s, day));
}

type Props = {
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  subscriptions: Subscription[];
};

export function SubscriptionCalendar({ month, onPrev, onNext, subscriptions }: Props) {
  const days = useMemo(() => {
    const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: s, end: e });
  }, [month]);

  return (
    <div className="rounded-panel border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onPrev}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-sm font-semibold">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </h3>
        <button
          onClick={onNext}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day names */}
      <div className="mb-1 grid grid-cols-7">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[11px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const inMonth = isSameMonth(day, month);
          const subs = subsForDay(day, subscriptions);
          const today = isToday(day);

          return (
            <div
              key={i}
              className={cn(
                "relative flex flex-col items-center py-1 transition-colors",
                !inMonth && "opacity-25",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs",
                  today && "bg-primary font-bold text-primary-foreground",
                  !today && "text-foreground",
                )}
              >
                {day.getDate()}
              </span>
              {subs.length > 0 && (
                <div className="mt-0.5 flex h-1.5 items-center gap-[2px]">
                  {subs.slice(0, 3).map((sub) => {
                    const idx = subscriptions.indexOf(sub);
                    return (
                      <div
                        key={`${sub.name}-${idx}`}
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            SUBSCRIPTION_COLORS[idx % SUBSCRIPTION_COLORS.length],
                        }}
                        title={sub.name}
                      />
                    );
                  })}
                  {subs.length > 3 && (
                    <span className="ml-[1px] text-[8px] text-muted-foreground">
                      +{subs.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {subscriptions.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Legende
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {subscriptions.map((sub, idx) => (
              <div
                key={`${sub.name}-${idx}`}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <div
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      SUBSCRIPTION_COLORS[idx % SUBSCRIPTION_COLORS.length],
                  }}
                />
                <span className="max-w-[90px] truncate">{sub.name}</span>
                <span className="text-[10px] tabular-nums">({getSubDay(sub)}.)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
