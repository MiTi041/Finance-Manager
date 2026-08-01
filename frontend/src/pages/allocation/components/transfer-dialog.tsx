import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/utils/format";
import { TanRequiredError } from "@/lib/allocation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  accountName: string;
  recipientName: string;
  recipientIban: string;
  purpose?: string;
  onConfirm: (tan?: string) => Promise<void>;
};

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

export function TransferDialog({
  open,
  onOpenChange,
  amount,
  accountName,
  recipientName,
  recipientIban,
  purpose,
  onConfirm,
}: Props) {
  const [tan, setTan] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tanChallenge, setTanChallenge] = useState<string | null>(null);
  const [tanDecoupled, setTanDecoupled] = useState(false);

  // Reset local state whenever the dialog is reopened for a new transfer,
  // so a previous error or half-typed TAN doesn't linger.
  useEffect(() => {
    if (open) {
      setTan("");
      setError(null);
      setSending(false);
      setTanChallenge(null);
      setTanDecoupled(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSending(true);
    setError(null);
    setTanChallenge(null);
    setTanDecoupled(false);
    try {
      await onConfirm(tan || undefined);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof TanRequiredError) {
        setTanChallenge(e.challenge);
        setTanDecoupled(e.decoupled);
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Die Überweisung ist fehlgeschlagen. Bitte versuche es erneut.",
        );
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let an outside click or Escape close the dialog mid-request;
        // the transfer may already be underway.
        if (!next && sending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Überweisung bestätigen</DialogTitle>
          <DialogDescription>
            Bitte prüfe die Daten, bevor du die Überweisung auslöst.
          </DialogDescription>
        </DialogHeader>

        <form
          className="min-w-0 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirm();
          }}
        >
          <div className="min-w-0 rounded-lg border bg-muted/30 p-4 text-center">
            <p className="break-words text-2xl font-semibold tabular-nums">
              {formatAmount(amount)}
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">an {recipientName}</p>
          </div>

          <div className="min-w-0 space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Konto</span>
              <span className="min-w-0 truncate text-sm font-medium">{accountName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Empfänger</span>
              <span className="min-w-0 truncate text-sm font-medium">{recipientName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">IBAN</span>
              <span className="min-w-0 truncate font-mono text-sm">
                {formatIban(recipientIban)}
              </span>
            </div>
            {purpose && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">Verwendungszweck</span>
                <span className="min-w-0 truncate text-sm font-medium">{purpose}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {tanChallenge && (
            <div className="min-w-0 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <div className="flex min-w-0 items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 break-words">
                  <p className="font-medium">TAN erforderlich</p>
                  <p className="mt-0.5">{tanChallenge}</p>
                  {tanDecoupled && (
                    <p className="mt-1">
                      Bitte in deiner Banking-App freigeben und erneut auf „Abschicken" klicken.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tan">TAN</Label>
            <Input
              id="tan"
              value={tan}
              onChange={(e) => setTan(e.target.value)}
              placeholder="Nur nötig, falls deine Bank eine TAN verlangt"
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            Diese Überweisung wird direkt bei deiner Bank ausgelöst.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={sending}>
              {sending && <Loader2 className="size-4 animate-spin" />}
              {sending ? "Wird gesendet…" : "Abschicken"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
