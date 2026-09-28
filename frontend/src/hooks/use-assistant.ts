import { useCallback, useEffect, useRef, useState } from "react";

import { streamAssistantChat } from "@/lib/assistant";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useAssistant(dateFrom?: string, dateTo?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nicht null heißt: genau dieser Stream läuft gerade. Zwei Gründe:
  // ein zweiter send() bricht ab, und die Events eines veralteten Streams
  // werden verworfen, statt in die nächste Antwort geschrieben zu werden.
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;

      setError(null);
      const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // "done" ist nicht das Abschlusskriterium: das Backend bricht im
      // Fehlerfall nach dem error-Frame ab und sendet es nie. Das Ende des
      // Streams ist das Abschlusssignal, streamAssistantChat löst sich dann auf.
      const appendToken = (chunk: string) => {
        if (abortRef.current !== controller) return;
        setMessages((previous) => {
          const last = previous[previous.length - 1];
          if (last?.role !== "assistant") return previous;
          return [...previous.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      };

      try {
        await streamAssistantChat({
          messages: history,
          dateFrom,
          dateTo,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "token") {
              appendToken(event.text);
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
        }
      }
    },
    [messages, dateFrom, dateTo],
  );

  const reset = useCallback(() => {
    // abortRef bewusst nicht leeren: das finally des Streams räumt auf und
    // setzt streaming zurück. Ein hier gesetztes null ließe streaming dauerhaft
    // true und das Eingabefeld bliebe gesperrt.
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  // Beim Verlassen der Seite den laufenden Stream beenden, sonst liest der
  // Fetch weiter, bis der Modell-Server von sich aus fertig ist.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { messages, streaming, error, send, reset };
}
