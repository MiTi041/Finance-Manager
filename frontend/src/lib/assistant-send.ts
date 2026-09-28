export type ChatMessage = { role: "user" | "assistant"; content: string };

// Der Wächter hängt am Controller, nicht an einem "läuft gerade"-State: zwei
// send() im selben Tick lesen beide denselben State, der erste hat seinen
// Controller aber schon synchron abgelegt. Der zweite wird dadurch abgewiesen —
// sonst schriebe der erste Stream seine Tokens in die Blase des zweiten.
// Ein State-Boolean ließe beide durch, weil er erst nach dem Re-Render stimmt.
export function canStartStream(active: AbortController | null, text: string): boolean {
  return active === null && text.trim() !== "";
}

// Eine Nachricht mit leerem Inhalt darf nie raus: llama.cpp und vLLM lehnen
// {"role": "assistant", "content": ""} mit 400 ab, und das Backend meldet so
// einen 400 als "Base-URL und API-Key prüfen" — eine Meldung, die ins Leere
// führt. Genau das ist die Platzhalter-Blase, die nach einem Fehler vor dem
// ersten Token zurückbleibt.
//
// Eine echte Nutzernachricht geht dabei nicht verloren: send() legt sie nur mit
// dem getrimmten, also nicht leeren Text an. Der geprüfte Platzhalter wird
// danach wieder angehängt — unsichtbar im Request, sichtbar in der Liste.
export function historyForRequest(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.content !== "");
}
