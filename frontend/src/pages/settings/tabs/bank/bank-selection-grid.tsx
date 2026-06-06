import { Check, Landmark } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BankDefinition } from "@/lib/bank/definitions";
import { EmptyState } from "@/components/empty-state";
import { BankLogo, BrandIcon } from "@/components/bank-logo";

type BankSelectionGridProps = {
  selectedKey: string;
  onSelect: (bankKey: string) => void;
  banks: BankDefinition[];
};

export function BankSelectionGrid({
  selectedKey,
  onSelect,
  banks,
}: BankSelectionGridProps) {
  if (banks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        <EmptyState
          title="Momentan sind keine Banken verfügbar"
          text="Das Abrufen der verfügbaren Banken ist fehlgeschlagen. Bitte versuche es später erneut."
          margin="mt-0"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
      {banks.map((bank) => {
        const isSelected = selectedKey === bank.key;

        return (
          <button
            key={bank.key}
            type="button"
            onClick={() => onSelect(bank.key)}
            aria-pressed={isSelected}
            className={cn(
              "cursor-pointer group relative flex items-center gap-2 rounded-2xl border p-3 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isSelected
                ? "border-primary/50 bg-primary/5 shadow-sm"
                : "border-border/70 bg-background hover:border-border hover:bg-muted/40",
            )}
          >
            <BrandIcon
              src={bank.bank_logo || undefined}
              alt={"Bank"}
              sizeClassName="size-12 shrink-0"
              className={cn("p-1 transition-colors border-0 !bg-transparent")}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {bank.name}
                </span>
              </div>
            </div>

            {isSelected && (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-4" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
