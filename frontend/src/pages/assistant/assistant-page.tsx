import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, Loader2, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { MarkdownMessage } from "@/components/assistant/markdown-message";
import { Button } from "@/components/ui/button";
import { useAssistant } from "@/hooks/use-assistant";
import { useAssistantConfig } from "@/hooks/use-assistant-config";
import { cn } from "@/lib/utils";

const THINK_STORAGE_KEY = "assistantThink";

export default function AssistantPage() {
  const config = useAssistantConfig();
  const [input, setInput] = useState("");
  const [think, setThink] = useState(
    () => window.localStorage.getItem(THINK_STORAGE_KEY) !== "false",
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.localStorage.setItem(THINK_STORAGE_KEY, String(think));
  }, [think]);

  // null heißt "lädt noch" ODER "Abruf fehlgeschlagen" — useAssistantConfig
  // unterscheidet das nicht. Deshalb behauptet diese Seite in diesem Fall
  // nichts: nur eine erfolgreich geladene Config darf "nicht konfiguriert" sagen.
  const nichtKonfiguriert = config !== null && !config.configured;

  const { messages, streaming, status, error, send, reset } = useAssistant();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    // Vor dem Leeren prüfen: send() verwirft den Text bei leerer Eingabe und
    // bei laufendem Stream, sonst wäre der Entwurf weg.
    if (!input.trim() || streaming) return;
    const value = input;
    setInput("");
    void send(value, think);
  };

  return (
    <div className="relative flex h-[calc(100svh-4rem)] box-border flex-col items-center">
      <div className="relative flex h-full w-full flex-col items-start overflow-visible bg-background xl:w-[1200px]">
        {/* Kopfzeile */}
        <div className="flex w-full flex-col items-center justify-center space-y-2 border-b border-secondary pb-4">
          <div className="flex items-center">
            <div className="flex items-center justify-center space-x-2 pt-4 text-sm font-bold text-foreground sm:pt-0">
              {nichtKonfiguriert ? (
                <>
                  <p>Nicht eingerichtet</p>
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                </>
              ) : (
                <>
                  <p>{config?.model ?? "Assistent"}</p>
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
              <Trash2 className="size-4" /> Leeren
            </Button>
          </div>
        </div>

        {/* Nachrichten */}
        <div className="no-scrollbar box-border mb-6 flex min-h-0 w-full flex-1 flex-col items-start space-y-4 overflow-auto p-4">
          {messages.length === 0 && !nichtKonfiguriert && (
            <div className="flex h-full w-full items-center justify-center">
              <EmptyState
                title="Keine Nachrichten"
                illustration="💸"
                text={
                  "Stell eine Frage zu deinen Finanzen, z. B. „Wie viel habe ich letzten Monat für Lebensmittel ausgegeben?\u201c"
                }
              />
            </div>
          )}

          {messages.map((message, index) => {
            const letzte = index === messages.length - 1;
            // Keine leere Antwort-Bubble rendern (Fehler vor dem ersten Token):
            // ein leeres graues Kästchen neben der Fehlermeldung sieht nach einem
            // Darstellungsfehler aus.
            if (!message.content && !(streaming && letzte)) return null;
            const istNutzer = message.role === "user";
            return (
              <div
                key={index}
                className="flex w-full rounded-lg"
                style={{ justifyContent: istNutzer ? "flex-end" : "flex-start" }}
              >
                <div
                  className={cn(
                    "flex max-w-[80%] items-center gap-2 rounded-xl px-5 py-4",
                    istNutzer ? "bg-blue-500/50 text-white" : "bg-secondary/50",
                  )}
                >
                  <div className="flex flex-col">
                    {!istNutzer && (
                      <div className="flex gap-1 pb-1 items-center">
                        <p className="text-sm font-semibold text-muted-foreground">Assistent</p>
                        {streaming && letzte && <Loader2 className="size-3.5 animate-spin" />}
                      </div>
                    )}
                    <div
                      className={cn(
                        "text-sm text-foreground",
                        istNutzer && "whitespace-pre-wrap font-semibold text-white",
                      )}
                    >
                      {istNutzer ? message.content : <MarkdownMessage content={message.content} />}
                    </div>

                    {!message.content && streaming && letzte && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {status ?? "denkt nach …"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Platz, damit die letzte Blase über der schwebenden Eingabe frei scrollt. */}
          <div className="h-52 shrink-0" />
          <div ref={bottomRef} />
        </div>

        {/* Hinweise + Eingabe schweben über der Nachrichtenliste, damit die
            Nachrichten an den abgerundeten Ecken dahinter sichtbar bleiben. */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col">
          {nichtKonfiguriert && (
            <p className="w-full bg-background/80 px-4 pb-2 text-sm text-muted-foreground backdrop-blur-sm">
              Der Assistent ist nicht eingerichtet.{" "}
              <Link to="/settings?tab=assistant" className="underline">
                In den Einstellungen konfigurieren
              </Link>
              .
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="w-full bg-background/80 px-4 pb-2 text-sm text-destructive backdrop-blur-sm"
            >
              {error}
            </p>
          )}

          {/* Eingabe */}
          <div className="mb-4 flex w-full flex-col items-start space-y-4 rounded-[32px] bg-secondary p-4 shadow-xl/50 shadow-blue-500/10">
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
              placeholder="Nachricht eingeben ..."
              className="min-h-16 w-full resize-none border-0 bg-transparent p-4 text-foreground shadow-none focus:outline-none focus:ring-0"
            />
            <div className="flex w-full items-center justify-between space-x-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={think}
                title={think ? "Denkmodus ausschalten" : "Denkmodus einschalten"}
                onClick={() => setThink((value) => !value)}
                className={
                  think
                    ? "!rounded-full !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
                    : "!rounded-full !bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
                }
              >
                <Brain className="size-4" /> Denken
              </Button>
              <Button
                onClick={submit}
                disabled={streaming || !input.trim()}
                className="min-w-[90px] bg-blue-500/50 text-white !rounded-full px-4 py-2 text-sm font-semibold border border-blue-500/50 hover:cursor-pointer"
              >
                <span>Senden</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
