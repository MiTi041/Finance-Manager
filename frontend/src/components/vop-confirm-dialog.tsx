import { useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VopRequiredInfo } from "@/lib/allocation";

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: VopRequiredInfo | null;
  onConfirm: () => Promise<void>;
};

export function VopConfirmDialog({ open, onOpenChange, info, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" />
            Namensabgleich fehlgeschlagen
          </DialogTitle>
          <DialogDescription>
            Deine Bank konnte den Empfänger nicht zweifelsfrei zuordnen.
          </DialogDescription>
        </DialogHeader>

        {info && (
          <div className="min-w-0 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
              <div className="min-w-0 space-y-1.5">
                <p>
                  Du überweist an <span className="font-semibold">{info.recipient_name}</span>
                  {info.recipient_iban && (
                    <>
                      {" "}
                      (<span className="font-mono">{formatIban(info.recipient_iban)}</span>)
                    </>
                  )}
                  . Der Name passt laut Bank nicht zum Kontoinhaber.
                </p>
                {info.close_match_name && (
                  <p>
                    Laut Bank lautet der hinterlegte Name:{" "}
                    <span className="font-semibold">{info.close_match_name}</span>.
                  </p>
                )}
                {info.notice && <p className="break-words text-xs">{info.notice}</p>}
                <p>
                  Wenn du trotzdem überweist, könnte das Geld bei einer falschen Person ankommen.
                  Bitte prüfe Empfänger und IBAN genau.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Abbrechen
              </Button>
              <Button variant="destructive" onClick={() => void handleConfirm()} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Wird gesendet…" : "Trotzdem überweisen"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
