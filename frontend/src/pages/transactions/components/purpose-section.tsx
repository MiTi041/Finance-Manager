import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { type Transaction } from "@/types/transaction";

import { usePurpose } from "../hooks/use-purpose";

type PurposeSectionProps = {
  transaction: Transaction;
  purpose: ReturnType<typeof usePurpose>;
};

export function PurposeSection({ transaction, purpose }: PurposeSectionProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const purposeText = transaction.texte.verwendungszweck || "";
  const additionalPurpose = transaction.texte.zusatzVerwendungszweck || "";
  const originalPurpose = transaction.texte.verwendungszweckOriginal || "";
  const isEdited = purpose.hasEdit;

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (!purpose.purposeChanged) {
      setEditing(false);
      return;
    }
    try {
      await purpose.savePurpose();
    } finally {
      setEditing(false);
    }
  };

  const handleCancel = () => {
    purpose.resetPurpose();
    setEditing(false);
  };

  const handleClear = async () => {
    try {
      await purpose.clearPurpose();
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="space-y-2 px-5 py-4" onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Verwendungszweck
        </p>
        {!editing && !purpose.savingPurpose && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <Pencil className="size-3" />
            Bearbeiten
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={purpose.purposeDraft}
            onChange={(event) => purpose.setPurposeDraft(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            rows={3}
            placeholder="Verwendungszweck"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {isEdited && originalPurpose && originalPurpose !== purposeText ? (
            <button
              type="button"
              onClick={() => purpose.setPurposeDraft(originalPurpose)}
              className="block cursor-pointer text-left text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
            >
              Original: {originalPurpose}
            </button>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!purpose.purposeChanged || purpose.savingPurpose}
              onClick={() => void handleSave()}
            >
              {purpose.savingPurpose ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              {purpose.savingPurpose ? "Speichere …" : "Speichern"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={purpose.savingPurpose}
              onClick={() => void handleCancel()}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <>
          {purposeText ? (
            <p className="whitespace-normal break-words leading-relaxed text-foreground">
              {purposeText}
            </p>
          ) : null}

          {additionalPurpose && additionalPurpose !== purposeText ? (
            <div
              className={purposeText ? "flex flex-col gap-0.5 border-t border-border/50 pt-2" : ""}
            >
              {purposeText ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
                  Zusatz
                </span>
              ) : null}
              <p className="whitespace-normal break-words leading-relaxed text-foreground">
                {additionalPurpose}
              </p>
            </div>
          ) : null}

          {!purposeText && !additionalPurpose ? <p className="text-muted-foreground">-</p> : null}

          {isEdited ? (
            <div className="flex items-start justify-between gap-2 border-t border-border/50 pt-2">
              <p
                className={cn(
                  "min-w-0 flex-1 whitespace-normal break-words text-xs italic leading-relaxed text-muted-foreground",
                  originalPurpose && originalPurpose === purposeText
                    ? "line-through opacity-60"
                    : "",
                )}
              >
                {originalPurpose ? `Bank: ${originalPurpose}` : "Bank: ohne Verwendungszweck"}
              </p>
              <button
                type="button"
                onClick={() => void handleClear()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                Zurücksetzen
              </button>
            </div>
          ) : null}
        </>
      )}

      {transaction.texte.buchungstext ? (
        <p className="pt-1 font-mono text-xs text-muted-foreground">
          {transaction.texte.buchungstext}
        </p>
      ) : null}
      {transaction.daten.wertstellungsdatum &&
      transaction.daten.wertstellungsdatum !== transaction.daten.buchungsdatum ? (
        <p className="pt-1 text-xs text-muted-foreground">
          Wertstellung: {formatDate(transaction.daten.wertstellungsdatum)}
        </p>
      ) : null}
    </div>
  );
}
