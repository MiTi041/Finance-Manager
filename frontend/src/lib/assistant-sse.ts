export type AssistantEvent =
  | { type: "token"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

// Passt zu backend/finance_server/api/assistant.py::_sse — "data: {json}\n\n".
// Ein kaputter JSON-Frame wird verworfen statt weitergereicht.
export function parseSseBuffer(buffer: string): {
  events: AssistantEvent[];
  rest: string;
} {
  const events: AssistantEvent[] = [];
  let rest = buffer;
  let index = rest.indexOf("\n\n");

  while (index !== -1) {
    const frame = rest.slice(0, index);
    rest = rest.slice(index + 2);
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as AssistantEvent);
      } catch {
        // unvollständiges JSON ignorieren
      }
    }
    index = rest.indexOf("\n\n");
  }

  return { events, rest };
}
