"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  CommandSeparator,
} from "@/components/ui/command";

import { type TransactionCategoryOption } from "@/lib/utils/categories";

type CategoryComboboxProps = {
  options: TransactionCategoryOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerRef?: (node: HTMLButtonElement | null) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  showNoneOption?: boolean;
  noneLabel?: string;
  noneValue?: string;
  height?: number;
};

export function CategoryCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Kategorie wählen",
  className,
  triggerRef,
  onKeyDown,
  showNoneOption = false,
  noneLabel = "Keine Kategorie",
  noneValue = "__unassigned__",
  height = 10,
}: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  const selected = options.find((o) => o.value === value);

  const displayLabel = selected
    ? selected.label.replace(/\u00A0/g, "").trim()
    : value === noneValue
      ? noneLabel
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          ref={triggerRef}
          onKeyDown={onKeyDown}
          height={height}
          className={cn(
            "w-full justify-between font-normal text-xs shadow-none",
            className,
          )}
        >
          {displayLabel ? (
            <span className="truncate">
              {selected?.icon && (
                <span className="mr-1.5">{selected.icon}</span>
              )}
              {displayLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Kategorie suchen..." />
          <CommandList className="max-h-80">
            <CommandEmpty>Keine Kategorie gefunden</CommandEmpty>
            <CommandGroup className="[&_[cmdk-item]]:my-1">
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
                      value === noneValue ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              )}
              {options.map((option, index) => (
                <React.Fragment key={option.value}>
                  {index > 0 && option.depth === 0 && <CommandSeparator />}
                  <CommandItem
                    value={option.label.replace(/\u00A0/g, "").trim()}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${option.depth * 16}px` }}
                    >
                      {option.depth > 0 && (
                        <div className="h-4 w-px shrink-0 bg-border/40" />
                      )}
                      {option.depth === 0 && option.icon && (
                        <span className="shrink-0">{option.icon}</span>
                      )}
                      <span
                        className={cn(
                          "truncate",
                          option.depth === 0 && "font-medium",
                        )}
                      >
                        {option.label.replace(/\u00A0/g, "").trim()}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                </React.Fragment>
              ))}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <div className="px-2 py-1.5">
            <Button
              className="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground bg-transparent hover:bg-muted transition-colors"
              height={8}
              onClick={() => {
                setOpen(false);
                navigate("/settings?tab=categories");
              }}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              Kategorien bearbeiten
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
