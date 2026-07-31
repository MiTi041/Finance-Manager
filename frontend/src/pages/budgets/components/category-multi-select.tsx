import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinanceCategory } from "@/lib/categories/types";
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

export function CategoryMultiSelect({
  categories,
  selected,
  onToggle,
  placeholder = "Kategorien auswählen …",
}: {
  categories: FinanceCategory[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedCats = categories.filter((c) => selected.has(c.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex w-full flex-wrap justify-start gap-1.5 px-3 py-2 font-normal shadow-none"
        >
          {selectedCats.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {selectedCats.slice(0, 3).map((c) => (
                <span
                  key={c.id}
                  className="inline-flex max-w-40 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                >
                  <span>{c.icon ?? "🏷️"}</span>
                  <span className="truncate">{c.name}</span>
                </span>
              ))}
              {selectedCats.length > 3 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  +{selectedCats.length - 3}
                </span>
              )}
            </>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Kategorie suchen …" />
          <CommandList
            className="max-h-60"
            onWheel={(e) => {
              const el = e.currentTarget;
              el.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>Keine Kategorie gefunden</CommandEmpty>
            <CommandGroup>
              {categories.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <CommandItem
                    key={c.id}
                    value={`${c.parent_name ?? ""} ${c.name}`}
                    onSelect={() => onToggle(c.id)}
                    className="cursor-pointer"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                      {c.icon ?? "🏷️"}
                    </span>
                    <span className="flex-1 truncate">
                      {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
                    </span>
                    <Check
                      className={cn("ml-auto size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
