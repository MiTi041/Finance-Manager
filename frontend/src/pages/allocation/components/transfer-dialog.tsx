import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  recipientName: string;
  recipientIban: string;
  onConfirm: (tan?: string) => Promise<void>;
};

export function TransferDialog({ open, onOpenChange, amount, recipientName, recipientIban, onConfirm }: Props) {
  const [tan, setTan] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSending(true);
    setError(null);
    try {
      await onConfirm(tan || undefined);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler bei der Überweisung");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Überweisung bestätigen</DialogTitle>
          <DialogDescription>
            Überweise {amount.toFixed(2)} € an {recipientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Empfänger</Label>
            <p className="text-sm font-medium">{recipientName}</p>
          </div>
          <div>
            <Label>IBAN</Label>
            <p className="text-sm font-mono">{recipientIban}</p>
          </div>
          <div>
            <Label>Betrag</Label>
            <p className="text-sm font-semibold">{amount.toFixed(2)} €</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <Label htmlFor="tan">TAN (falls erforderlich)</Label>
            <Input
              id="tan"
              value={tan}
              onChange={(e) => setTan(e.target.value)}
              placeholder="TAN eingeben"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirm} disabled={sending}>
              {sending ? "Wird gesendet..." : "Abschicken"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
