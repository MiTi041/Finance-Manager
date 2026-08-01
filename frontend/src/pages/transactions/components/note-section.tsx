import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useNote } from "../hooks/use-note";

type NoteSectionProps = {
  note: ReturnType<typeof useNote>;
  showRefundSection: boolean;
};

export function NoteSection({ note, showRefundSection }: NoteSectionProps) {
  return (
    <div
      className={cn("px-4 py-4", showRefundSection && "sm:border-r sm:border-border/60")}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Anmerkung
        </p>

        {note.isInTagMode && (
          <div className="text-[10px] flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-violet-500" />
            Hashtag eingabe erkannt
          </div>
        )}
      </div>
      <textarea
        value={note.noteDraft}
        onChange={(event) => note.setNoteDraft(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="Anmerkung zu dieser Transaktion"
        className={cn(
          "h-18 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          note.isInTagMode
            ? "border-violet-400 focus-visible:border-violet-400 focus-visible:ring-violet-500/30"
            : "border-input focus-visible:border-ring",
        )}
      />
      <div className="flex items-start justify-between gap-3 mt-2">
        <div className="flex flex-col items-start gap-1.5">
          {note.allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {note.allTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!note.noteChanged || note.savingNote}
          onClick={() => void note.saveNote()}
        >
          {note.savingNote ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {note.savingNote ? "Speichere …" : "Anmerkung speichern"}
        </Button>
      </div>
    </div>
  );
}
