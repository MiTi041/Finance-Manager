import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function EditBudgetDialog({
  open,
  budget,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && budget) setAmount(String(budget.monthly_amount));
  }, [open, budget]);

  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0;

  const save = async () => {
    if (!budget || !valid) return;
    setSaving(true);
    try {
      await onSave(budget.id, parsed);
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
        <p className="text-sm text-muted-foreground">{budget?.name}</p>
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
