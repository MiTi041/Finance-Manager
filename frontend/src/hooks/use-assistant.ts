import { useCallback, useEffect, useRef, useState } from "react";

import { streamAssistantChat } from "@/lib/assistant";
import { canStartStream, historyForRequest, type ChatMessage } from "@/lib/assistant-send";

export type { ChatMessage };

const TOOL_LABELS: Record<string, string> = {
  get_summary: "Fasse Einnahmen und Ausgaben zusammen …",
  get_category_analytics: "Analysiere Kategorien …",
  get_account_balances: "Lese Kontostände …",
  get_budgets: "Prüfe Budgets …",
  get_transactions: "Suche Transaktionen …",
  get_partner_analytics: "Analysiere Zahlungspartner …",
  list_accounts: "Lade Konten …",
  list_categories: "Lade Kategorien …",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? "Rufe Daten ab …";
}

export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nicht null heißt: genau dieser Stream läuft gerade, und der Platz ist
  // damit belegt. Der Send-Wächter hängt hier dran und nicht am State
  // "streaming": zwei send() im selben Tick lesen denselben State, die Ref
  // ist aber nach dem ersten Aufruf schon gefüllt.
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string, think = true) => {
      if (!canStartStream(abortRef.current, text)) return;
      const trimmed = text.trim();

      setError(null);
      // Die Platzhalter-Blase gehört nicht in den Request: sie würde beim
      // nächsten send() als leere Nachricht mitgehen und vom Modell-Server
      // mit 400 abgelehnt.
      const history: ChatMessage[] = historyForRequest([
        ...messages,
        { role: "user", content: trimmed },
      ]);
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // "done" ist nicht das Abschlusskriterium: das Backend bricht im
      // Fehlerfall nach dem error-Frame ab und sendet es nie. Das Ende des
      // Streams ist das Abschlusssignal, streamAssistantChat löst sich dann auf.
      const appendToken = (chunk: string) => {
        // Nur an die letzte Nachricht hängen, und nur wenn das eine Antwort ist.
        // Das ist zugleich der Schutz gegen einen Token, der nach reset()
        // eintrifft: reset() leert messages und lässt den Controller in der Ref
        // stehen, last ist dann undefined und der Token wird verworfen.
        setMessages((previous) => {
          const last = previous[previous.length - 1];
          if (last?.role !== "assistant") return previous;
          return [...previous.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      };

      try {
        await streamAssistantChat({
          messages: history,
          think,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "token") {
              appendToken(event.text);
              setStatus(null);
            } else if (event.type === "tool") {
              setStatus(toolLabel(event.name));
            } else if (event.type === "error") {
              // Absichtlich ohne Verwerfen der bisherigen Tokens: eine
              // abgeschnittene Antwort ist besser als eine leere.
              setError(event.message);
            }
          },
        });
      } catch (err) {
        // Das Signal statt des Fehlertyps: was ein Abbruch während des
        // Body-Lesens ablehnt, ist nicht in jedem Browser eine DOMException.
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "KI-Anfrage fehlgeschlagen");
      } finally {
        // Nur der eigene Stream gibt den Platz frei. Sonst löschte das finally
        // eines gerade beendeten Streams den Controller eines laufenden nach
        // reset() und ein dritter send() käme durch.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
          setStatus(null);
        }
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    // abortRef bewusst nicht leeren: das finally des Streams räumt auf und
    // setzt streaming zurück. Ein hier gesetztes null ließe streaming dauerhaft
    // true und das Eingabefeld bliebe gesperrt.
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStatus(null);
  }, []);

  // Beim Verlassen der Seite den laufenden Stream beenden, sonst liest der
  // Fetch weiter, bis der Modell-Server von sich aus fertig ist.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { messages, streaming, status, error, send, reset };
}
