"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  renderOption?: (option: SelectOption) => React.ReactNode;
  renderSelected?: (option: SelectOption) => React.ReactNode;
  height?: number;
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
  renderOption,
  renderSelected,
  height,
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
          height={height}
          className={cn(
            "w-full justify-between font-normal shadow-none",
            !selected && "text-muted-foreground",
            className,
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="min-w-0 flex-1">
              {renderSelected ? (
                renderSelected(selected)
              ) : (
                <span className="block truncate">{selected.label}</span>
              )}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-searchable-select-content
        className={cn("p-0", contentClassName)}
        align="start"
        sideOffset={4}
      >
        <Command className="overflow-visible">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            className="max-h-80"
            onWheel={(e) => {
              const el = e.currentTarget;
              el.scrollTop += e.deltaY;
            }}>
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
                  {renderOption ? (
                    renderOption(option)
                  ) : (
                    <span className="flex-1 truncate">{option.label}</span>
                  )}
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
