"use client";

import * as React from "react";
import { CalendarDays, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DatePicker({
  value,
  onChange,
  className,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const startMonth = new Date(now.getFullYear() - 50, 0, 1);
  const endMonth = new Date(now.getFullYear() + 50, 11, 31);

  return (
    <div className="flex flex-col gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date"
            className={cn("w-48 justify-between font-normal", className)}
          >
            <CalendarDays className="size-4" />
            {value ? value.toLocaleDateString() : "Select date"}
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            onSelect={(date) => {
              onChange(date ?? null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
