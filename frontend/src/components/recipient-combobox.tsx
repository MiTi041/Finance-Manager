import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BankLogo, BrandIcon, RecipientLogo } from "@/components/bank-logo";
import {
  logoBackgroundClass,
  resolveZahlungspartnerLogoSrc,
} from "@/lib/bank/zahlungspartner-logo";
import { useRecipientAccountLogos } from "@/hooks/use-recipient-account-logos";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Command,
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
};

export function RecipientCombobox({
  id,
  value,
  onValueChange,
  onSelect,
  groups,
  placeholder,
}: RecipientComboboxProps) {
  const [open, setOpen] = useState(false);
  const recipientLogos = useRecipientAccountLogos();
  const filtered = useMemo(() => filterRecipientOptions(groups, value), [groups, value]);
  const hasResults = filtered.some((group) => group.options.length > 0);

  return (
    <Popover open={open && hasResults} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          role="combobox"
          aria-expanded={open && hasResults}
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
                    {option.kind === "own" ? (
                      <BankLogo
                        src={option.bankLogo}
                        srcDark={option.bankLogoDark}
                        alt={option.label}
                        sizeClassName="size-9"
                        backgroundClassName="bg-muted/70"
                        imgPadding={option.logoPadding}
                      />
                    ) : option.kind === "recipient" ? (
                      <RecipientLogo
                        logo={recipientLogos.get(Number(option.id.split(":")[1]))}
                        alt={option.label || option.name}
                      />
                    ) : (
                      <BrandIcon
                        src={resolveZahlungspartnerLogoSrc(
                          option.logoUrl,
                          option.partnerId,
                          option.localLogoPath,
                        )}
                        alt={option.label || option.name}
                        sizeClassName="size-9"
                        backgroundClassName={logoBackgroundClass(option.logoBackground)}
                        kind={option.isCompany === false ? "person" : "company"}
                        imgNoPadding={!option.partnerLogoPadding}
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{option.label}</span>
                        {option.isPrimary ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                          >
                            Hauptkonto
                          </Badge>
                        ) : null}
                      </span>
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
