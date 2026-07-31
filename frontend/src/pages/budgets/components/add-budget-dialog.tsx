import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FinanceCategory } from "@/lib/categories/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function AddBudgetDialog({
  open,
  onOpenChange,
  categories,
  existingCategoryIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategory[];
  existingCategoryIds: Set<number>;
  onCreate: (categoryId: number, amount: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const available = categories.filter((c) => !existingCategoryIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                categoryId === c.id
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "hover:bg-muted",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                {c.icon ?? "🏷️"}
              </span>
              <span className="truncate">{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</span>
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground">Alle Ausgabe-Kategorien haben bereits ein Budget.</p>
          )}
        </div>
        <div className="relative">
          <Input
            type="number"
            min={0}
            placeholder="Monatsbudget"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && categoryId != null && Number(amount) > 0) {
                void onCreate(categoryId, Number(amount));
                setCategoryId(null);
                setAmount("");
                onOpenChange(false);
              }
            }}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
        <DialogFooter>
          <Button
            disabled={categoryId == null || !(Number(amount) > 0)}
            onClick={() => {
              if (categoryId == null) return;
              void onCreate(categoryId, Number(amount));
              setCategoryId(null);
              setAmount("");
              onOpenChange(false);
            }}
          >
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
