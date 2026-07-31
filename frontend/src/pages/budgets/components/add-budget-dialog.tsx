import { useState } from "react";
import type { FinanceCategory } from "@/lib/categories/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryMultiSelect } from "./category-multi-select";

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
  onCreate: (name: string, categoryIds: number[], amount: number) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const available = categories.filter((c) => !existingCategoryIds.has(c.id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submit = () => {
    if (selected.size === 0 || !(Number(amount) > 0) || !name.trim()) return;
    onCreate(name.trim(), [...selected], Number(amount));
    setSelected(new Set());
    setName("");
    setAmount("");
    onOpenChange(false);
  };

  const canSubmit = selected.size > 0 && Number(amount) > 0 && name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget hinzufügen</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Name des Budgets"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CategoryMultiSelect categories={available} selected={selected} onToggle={toggle} />
        <div className="relative">
          <Input
            type="number"
            min={0}
            placeholder="Monatsbudget"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submit();
            }}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
        <DialogFooter>
          <Button disabled={!canSubmit} onClick={submit}>
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
