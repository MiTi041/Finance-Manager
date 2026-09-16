import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  filterRecipientOptions,
  type RecipientOption,
  type RecipientOptionGroup,
} from "@/lib/recipient-options";

type RecipientComboboxProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (option: RecipientOption) => void;
  groups: RecipientOptionGroup[];
  placeholder?: string;
  emptyText?: string;
};

export function RecipientCombobox({
  id,
  value,
  onValueChange,
  onSelect,
  groups,
  placeholder,
  emptyText = "Keine Treffer – Text wird frei übernommen",
}: RecipientComboboxProps) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterRecipientOptions(groups, value), [groups, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          data-recipient-combobox-input
          onFocus={() => {
            if (value) setOpen(true);
          }}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        data-recipient-combobox-content
        onOpenAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.closest("[data-recipient-combobox-input],[data-recipient-combobox-content]")
          ) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.closest("[data-recipient-combobox-input],[data-recipient-combobox-content]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <Command shouldFilter={false} className="overflow-visible">
          <CommandList
            className="max-h-72"
            onWheel={(event) => {
              const el = event.currentTarget;
              el.scrollTop += event.deltaY;
            }}
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            {filtered.map((group) => (
              <CommandGroup key={group.kind} heading={group.label}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.subtitle ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {option.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
