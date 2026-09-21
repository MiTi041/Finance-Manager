import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Info, Zap, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
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
import { ToggleRow } from "@/components/toggle-row";
import { formatAmount } from "@/lib/utils/format";
import { TanRequiredError, VopRequiredError } from "@/lib/allocation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  accountName: string;
  recipientName: string;
  recipientIban: string;
  purpose?: string;
  instant: boolean;
  /** SEPA-Instant ist für Absender- und Empfängerbank möglich. */
  instantAvailable?: boolean;
  onInstantChange: (instant: boolean) => void;
  onConfirm: (tan?: string, vopToken?: string) => Promise<void>;
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
  instant,
  instantAvailable = true,
  onInstantChange,
  onConfirm,
}: Props) {
  const [tan, setTan] = useState("");
  const [sending, setSending] = useState(false);
  const [tanChallenge, setTanChallenge] = useState<string | null>(null);
  const [tanDecoupled, setTanDecoupled] = useState(false);
  const [vopError, setVopError] = useState<VopRequiredError | null>(null);

  // Reset local state whenever the dialog is reopened for a new transfer,
  // so a previous error or half-typed TAN doesn't linger.
  useEffect(() => {
    if (open) {
      setTan("");
      setSending(false);
      setTanChallenge(null);
      setTanDecoupled(false);
      setVopError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSending(true);
    setTanChallenge(null);
    setTanDecoupled(false);
    try {
      await onConfirm(tan || undefined, vopError?.info.vop_token);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof VopRequiredError) {
        setVopError(e);
      } else if (e instanceof TanRequiredError) {
        setTanChallenge(e.challenge);
        setTanDecoupled(e.decoupled);
      } else {
        toast.error(
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
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">Verwendungszweck</span>
                <span className="min-w-0 whitespace-normal break-words text-right text-sm font-medium">
                  {purpose}
                </span>
              </div>
            )}
          </div>

          {instantAvailable && (
            <ToggleRow
              title="Echtzeit (SEPA Instant)"
              description="Geld kommt sofort an, falls deine Bank SEPA-Instant unterstützt."
              icon={<Zap className="size-4" />}
              size="sm"
              checked={instant}
              onCheckedChange={onInstantChange}
            />
          )}

          {vopError && (
            <div className="min-w-0 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <div className="flex min-w-0 items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 break-words">
                  <p className="font-medium">Namensabgleich fehlgeschlagen</p>
                  <p className="mt-0.5">
                    Die Bank konnte den Empfänger „{recipientName}" nicht zweifelsfrei dem
                    Kontoinhaber der IBAN {formatIban(recipientIban)} zuordnen.
                  </p>
                  {vopError.info.close_match_name && (
                    <p className="mt-1">
                      Laut Bank lautet der hinterlegte Name:{` `}
                      <span className="font-medium">{vopError.info.close_match_name}</span>.
                    </p>
                  )}
                  {vopError.info.notice && <p className="mt-1">{vopError.info.notice}</p>}
                  <p className="mt-1">
                    Wenn du die Überweisung trotzdem ausführst, könnte das Geld bei einer falschen
                    Person ankommen. Bitte prüfe Empfänger und IBAN genau.
                  </p>
                </div>
              </div>
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
              {sending ? "Wird gesendet…" : vopError ? "Trotzdem überweisen" : "Abschicken"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
