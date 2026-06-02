"use client";

import { useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay } from "date-fns";
import {
  CalendarDays,
  CalendarIcon,
  CalendarRange,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TimeRange } from "@/types/time-range";
import { DateFilterValue } from "@/types/date-filter";

interface DateFilterProps {
  initialTimeRange?: TimeRange;
  value?: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}

export function DateFilter({
  initialTimeRange,
  value,
  onChange,
}: DateFilterProps) {
  const [internalFilter, setInternalFilter] = useState<DateFilterValue>(
    initialTimeRange ? { timeRange: initialTimeRange } : {},
  );

  const currentFilter = value ?? internalFilter;
  const selectedTimeRange = currentFilter.timeRange;
  const date = useMemo<DateRange | undefined>(() => {
    if (!currentFilter.timeSpan) return undefined;
    return {
      from: currentFilter.timeSpan.from,
      to: currentFilter.timeSpan.until,
    };
  }, [currentFilter.timeSpan]);

  const updateFilter = (nextFilter: DateFilterValue) => {
    if (!value) setInternalFilter(nextFilter);
    onChange(nextFilter);
  };

  const handleClick = (range: TimeRange) => {
    if (selectedTimeRange === range) {
      updateFilter({});
      return;
    }
    updateFilter({ timeRange: range });
  };

  const handleDateSelect = (nextDate: DateRange | undefined) => {
    if (!nextDate?.from) {
      updateFilter({});
      return;
    }

    if (!nextDate.to) {
      updateFilter({
        timeSpan: {
          from: startOfDay(nextDate.from),
          until: endOfDay(nextDate.from),
        },
      });
      return;
    }

    updateFilter({
      timeSpan: {
        from: startOfDay(nextDate.from),
        until: endOfDay(nextDate.to),
      },
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Datum filtern
      </p>
      <div className="flex items-start justify-start flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              id="date-picker-range"
              className={cn(
                "h-9",
                "justify-start px-2.5 font-normal",
                date != null && "!border-primary",
              )}
            >
              <CalendarRange />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Datum wählen</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleDateSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9",
            selectedTimeRange === TimeRange.Last7Days && "!border-primary",
          )}
          onClick={() => handleClick(TimeRange.Last7Days)}
        >
          <Clock3 className="size-4" />
          Letzte 7 Tage
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9",
            selectedTimeRange === TimeRange.Last30Days && "!border-primary",
          )}
          onClick={() => handleClick(TimeRange.Last30Days)}
        >
          <Clock3 className="size-4" />
          Letzte 30 Tage
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9",
            selectedTimeRange === TimeRange.Last90Days && "!border-primary",
          )}
          onClick={() => handleClick(TimeRange.Last90Days)}
        >
          <Clock3 className="size-4" />
          Letzte 90 Tage
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9",
            selectedTimeRange === TimeRange.ThisYear && "!border-primary",
          )}
          onClick={() => handleClick(TimeRange.ThisYear)}
        >
          <Clock3 className="size-4" />
          Dieses Jahr
        </Button>
      </div>
    </div>
  );
}

export default DateFilter;
