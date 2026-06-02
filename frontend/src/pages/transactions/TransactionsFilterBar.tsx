import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterX, SearchX } from "lucide-react";

import { type TransactionCategoryOption } from "./transactions.utils";

type TransactionsFilterBarProps = {
  onlyUnassigned: boolean;
  onlyUnknownIban: boolean;
  amountFilter: string;
  categoryFilter: string;
  categoryOptions: TransactionCategoryOption[];
  onToggleOnlyUnassigned: () => void;
  onToggleOnlyUnknownIban: () => void;
  onAmountFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
};

export function TransactionsFilterBar({
  onlyUnassigned,
  onlyUnknownIban,
  amountFilter,
  categoryFilter,
  categoryOptions,
  onToggleOnlyUnassigned,
  onToggleOnlyUnknownIban,
  onAmountFilterChange,
  onCategoryFilterChange,
}: TransactionsFilterBarProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={
          onlyUnassigned
            ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
            : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
        }
        onClick={onToggleOnlyUnassigned}
      >
        <FilterX className="size-4" />
        <span>Nur Transaktionen ohne Kategorie anzeigen</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={
          onlyUnknownIban
            ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
            : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
        }
        onClick={onToggleOnlyUnknownIban}
      >
        <SearchX className="size-4" />
        <span>Nur Transaktionen mit unbekannter IBAN anzeigen</span>
      </Button>

      <Select value={amountFilter} onValueChange={onAmountFilterChange}>
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="Betrag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Beträge</SelectItem>
          <SelectItem value="income">Einnahmen</SelectItem>
          <SelectItem value="expense">Ausgaben</SelectItem>
        </SelectContent>
      </Select>

      <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue placeholder="Kategorie" />
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
