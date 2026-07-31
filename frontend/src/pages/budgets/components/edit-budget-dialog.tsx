import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import type { FinanceCategory } from "@/lib/categories/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryMultiSelect } from "./category-multi-select";

export function EditBudgetDialog({
  open,
  budget,
  categories,
  existingCategoryIds,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  categories: FinanceCategory[];
  existingCategoryIds: Set<number>;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, name: string, categoryIds: number[], amount: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && budget) {
      setSelected(new Set(budget.category_ids));
      setName(budget.name);
      setAmount(String(budget.monthly_amount));
    }
  }, [open, budget]);

  const available = budget
    ? categories.filter((c) => !existingCategoryIds.has(c.id))
    : [];

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

  const parsed = Number(amount.replace(",", "."));
  const valid = selected.size > 0 && Number.isFinite(parsed) && parsed >= 0 && name.trim().length > 0;

  const save = async () => {
    if (!budget || !valid) return;
    setSaving(true);
    try {
      await onSave(budget.id, name.trim(), [...selected], parsed);
      onOpenChange(false);
    } catch {
      // Fehler wurde bereits im Page-Handler getoastet; Dialog bleibt offen
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget bearbeiten</DialogTitle>
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
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) void save();
            }}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={saving || !valid}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
