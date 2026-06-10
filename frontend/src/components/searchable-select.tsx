"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type SelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  triggerId?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  showNoneOption?: boolean;
  noneLabel?: string;
  noneValue?: string;
};

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Auswählen …",
  searchPlaceholder = "Suchen …",
  emptyText = "Keine Ergebnisse",
  className,
  triggerClassName,
  contentClassName,
  disabled = false,
  triggerId,
  onKeyDown,
  showNoneOption = false,
  noneLabel = "Keine Auswahl",
  noneValue = "__none__",
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          id={triggerId}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full justify-between font-normal shadow-none",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", contentClassName)}
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showNoneOption && (
                <CommandItem
                  value={noneLabel}
                  onSelect={() => {
                    onValueChange(noneValue);
                    setOpen(false);
                  }}
                >
                  <span className="text-muted-foreground">{noneLabel}</span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      value === noneValue || value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
