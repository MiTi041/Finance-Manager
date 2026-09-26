import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAllocationSettings } from "@/lib/allocation";
import { evalArithmetic } from "@/lib/utils/arithmetic";
import { formatAmount } from "@/lib/utils/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentValue: number;
  isManual: boolean;
  onSaved: () => void | Promise<void>;
};

export function ManualIncomeDialog({ open, onOpenChange, currentValue, isManual, onSaved }: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(currentValue > 0 ? String(currentValue) : "");
  }, [open, currentValue]);

  const computed = evalArithmetic(value);
  const isExpression = /[+\-*/()]/.test(value);

  const save = async () => {
    const parsed = computed === null ? null : Math.round(computed * 100) / 100;
    if (parsed === null || parsed < 0) {
      toast.error("Bitte einen gültigen Betrag eingeben");
      return;
    }
    setSaving(true);
    try {
      await updateAllocationSettings({ manual_net_income: parsed });
      await onSaved();
      toast.success("Netto-Einkommen manuell festgelegt");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await updateAllocationSettings({ manual_net_income: null });
      await onSaved();
      toast.success("Automatische Erkennung wieder aktiv");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Netto-Einkommen festlegen</DialogTitle>
          <DialogDescription>
            Überschreibt die automatisch erkannten Einnahmen für die Verteilung. Leer lassen bzw.
            zurücksetzen nutzt wieder die Erkennung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="manual-net-income">
            Netto-Einkommen pro Monat (Rechenausdrücke erlaubt)
          </Label>
          <div className="relative">
            <Input
              id="manual-net-income"
              type="text"
              inputMode="text"
              placeholder="z.B. 620+534"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              className="pr-7 text-right font-mono tabular-nums"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              €
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            {isExpression &&
              (computed === null ? (
                <span className="text-destructive">Ungültiger Ausdruck</span>
              ) : (
                <span>
                  ={" "}
                  <span className="font-mono font-medium text-foreground">
                    {formatAmount(computed)}
                  </span>
                </span>
              ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isManual ? (
            <Button variant="ghost" size="sm" onClick={() => void reset()} disabled={saving}>
              <RotateCcw className="size-3.5" />
              Automatisch
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
