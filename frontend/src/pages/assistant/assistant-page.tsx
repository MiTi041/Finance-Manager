import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { endOfDay, format, startOfDay } from "date-fns";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssistant } from "@/hooks/use-assistant";
import { useAssistantConfig } from "@/hooks/use-assistant-config";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { cn } from "@/lib/utils";
import { getTimeSpanForRange } from "@/types/time-range";

function toDateParam(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export default function AssistantPage() {
  const { dateFilter } = useGlobalDateFilter();
  const config = useAssistantConfig();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // null heißt "lädt noch" ODER "Abruf fehlgeschlagen" — useAssistantConfig
  // unterscheidet das nicht. Deshalb behauptet diese Seite in diesem Fall
  // nichts: nur eine erfolgreich geladene Config darf "nicht konfiguriert" sagen.
  const nichtKonfiguriert = config !== null && !config.configured;

  const { dateFrom, dateTo } = useMemo(() => {
    if (dateFilter.timeSpan) {
      return {
        dateFrom: toDateParam(startOfDay(dateFilter.timeSpan.from)),
        dateTo: toDateParam(endOfDay(dateFilter.timeSpan.until)),
      };
    }
    if (dateFilter.timeRange) {
      const span = getTimeSpanForRange(dateFilter.timeRange);
      return {
        dateFrom: toDateParam(startOfDay(span.from)),
        dateTo: toDateParam(endOfDay(span.until)),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [dateFilter]);

  const { messages, streaming, error, send, reset } = useAssistant(dateFrom, dateTo);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    // Vor dem Leeren prüfen: send() verwirft den Text bei leerer Eingabe und
    // bei laufendem Stream, sonst wäre der Entwurf weg.
    if (!input.trim() || streaming) return;
    const value = input;
    setInput("");
    void send(value);
  };

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">KI-Assistent</h1>
            <p className="text-xs text-muted-foreground">Fragt deine Finanzdaten lokal ab</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
          <Trash2 className="size-4" /> Leeren
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 py-6">
          {messages.length === 0 && !nichtKonfiguriert && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Stell eine Frage zu deinen Finanzen, z. B. „Wie viel habe ich letzten Monat für
              Lebensmittel ausgegeben?"
            </p>
          )}

          {messages.map((message, index) => {
            const letzte = index === messages.length - 1;
            // Keine leere Antwort-Bubble rendern (Fehler vor dem ersten Token):
            // ein leeres graues Kästchen neben der Fehlermeldung sieht nach einem
            // Darstellungsfehler aus.
            if (!message.content && !(streaming && letzte)) return null;
            return (
              <div
                key={index}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {message.content || "…"}
                </div>
              </div>
            );
          })}

          {streaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> denkt nach …
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {error && (
        <p role="alert" className="px-6 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="border-t border-border/50 px-6 py-4">
        {nichtKonfiguriert && (
          <p className="mx-auto mb-3 max-w-3xl text-sm text-muted-foreground">
            Der Assistent ist nicht eingerichtet.{" "}
            <Link to="/settings?tab=assistant" className="underline">
              In den Einstellungen konfigurieren
            </Link>
            .
          </p>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            aria-label="Frage an den Assistenten"
            placeholder="Frage zu deinen Finanzen …"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={submit} disabled={streaming || !input.trim()} aria-label="Senden">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
