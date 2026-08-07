import { useEffect, useRef, useState } from "react";

import { Check, Hash, Loader2, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useNote } from "../hooks/use-note";

type NoteSectionProps = {
  note: ReturnType<typeof useNote>;
  showRefundSection: boolean;
};

export function NoteSection({ note, showRefundSection }: NoteSectionProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const suggestionsOpen = note.matchingSuggestions.length > 0;

  useEffect(() => {
    if (!suggestionsOpen) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimated = 220;
    setDirection(rect.bottom + estimated > window.innerHeight ? "up" : "down");
  }, [suggestionsOpen, note.matchingSuggestions]);

  return (
    <div
      className={cn("px-4 py-4", showRefundSection && "sm:border-r sm:border-border/60")}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Anmerkung
        </p>

        {note.typingHashtag && (
          <div className="text-[10px] flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-violet-500" />
            Hashtag-Eingabe erkannt
          </div>
        )}
        {note.typingTag && (
          <div className="text-[10px] flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-teal-500" />
            Tag-Eingabe erkannt
          </div>
        )}
      </div>
      <div className="mb-2 space-y-2.5 rounded-xl border border-border/60 bg-muted/40 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Hash className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Hashtag</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Freies Schlagwort in der Notiz, nur für dich sichtbar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
            <Tag className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Finanzplan-Tag</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Wird zur Einzahlung oder Entnahme des Sparziels gezählt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Beispiel
          </span>
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            #urlaub
          </span>
          <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
            tag.urlaub2026
          </span>
        </div>
      </div>
      <div className="relative" ref={wrapRef}>
        <textarea
          value={note.noteDraft}
          onChange={(event) => note.setNoteDraft(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Anmerkung zu dieser Transaktion"
          className={cn(
            "h-18 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            note.typingHashtag
              ? "border-violet-400 focus-visible:border-violet-400 focus-visible:ring-violet-500/30"
              : note.typingTag
                ? "border-teal-400 focus-visible:border-teal-400 focus-visible:ring-teal-500/30"
                : "border-input focus-visible:border-ring",
          )}
        />
        {note.matchingSuggestions.length > 0 && (
          <div
            className={cn(
              "bg-popover text-popover-foreground absolute z-20 w-full origin-(--radix-select-content-transform-origin) animate-in fade-in-0 zoom-in-95 overflow-y-auto rounded-surface border p-1 shadow-md",
              direction === "up" ? "bottom-full mb-1" : "mt-1",
            )}
          >
            {note.matchingSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => note.applyTagSuggestion(name)}
                className="relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-chip px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium text-teal-600 dark:text-teal-400">tag.{name}</span>
                {name.endsWith(".entnahme") && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    Entnahme
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3 mt-2">
        <div className="flex flex-col items-start gap-1.5">
          {note.allHashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {note.allHashtags.map((tag) => (
                <span
                  key={`#${tag}`}
                  className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {note.allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {note.allTags.map((tag) => (
                <span
                  key={`tag.${tag}`}
                  className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                >
                  tag.{tag}
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
