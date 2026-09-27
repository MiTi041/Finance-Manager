# Lokaler KI-Chat-Assistent — Design

## Ziel

Ein Chat-Assistent über die eigenen Finanzen. Das Backend baut pro Frage einen
kompakten Kontext (Aggregate + gefilterte Transaktionen) und schickt ihn an einen
**lokal betriebenen, OpenAI-kompatiblen Modell-Server** (Ollama, LM Studio,
llama.cpp, vLLM, …). Jeder Nutzer trägt in den Einstellungen seine eigene
Base-URL und sein Modell ein; es wird kein Modell mitgeliefert und keine Cloud
kontaktiert.

## Nicht-Ziele

- Keine Cloud-Anbieter (OpenAI/Anthropic) in v1.
- Kein Tool-/Function-Calling in v1 (später ergänzbar).
- Kein mitgeliefertes oder gebündeltes Modell.
- Keine Persistenz des Chat-Verlaufs (nur In-Memory in der Sitzung).

## Architektur

Backend-Proxy. Das Frontend spricht nur mit dem Backend; das Backend hält
Konfiguration, baut den Kontext und proxyt den Stream zum lokalen Modell. Dadurch
keine CORS-Probleme mit lokalen Servern und kein Endpoint/Key im Browser.

```
Frontend --POST /api/assistant/chat (SSE)--> Backend --stream--> lokaler Modell-Server
```

## Konfiguration

Gespeichert in der bestehenden `app_settings`-Tabelle (`db/settings.py`):

| Key | Bedeutung | Default |
|---|---|---|
| `ai_enabled` | Assistent aktiv (`true`/`false`) | `false` |
| `ai_base_url` | OpenAI-kompatible Base-URL | `http://localhost:11434/v1` |
| `ai_model` | Modellname | `""` |
| `ai_api_key` | optionaler Key (viele lokale Server brauchen keinen) | `""` |

Der API-Key wird mit dem vorhandenen Fernet-Schlüssel verschlüsselt
(`get_credentials_fernet()` aus `db/credentials.py`), nicht im Klartext abgelegt.
Nach außen (`GET /api/assistant/config`) wird nur `has_api_key: bool` geliefert.

## Backend

Neue Dateien:

- `api/assistant.py` — Router, in `main.py` registriert:
  - `GET /api/assistant/config` → `{enabled, base_url, model, has_api_key}`
  - `PATCH /api/assistant/config` → speichert Felder, verschlüsselt den Key
  - `POST /api/assistant/models` → ruft `{base_url}/models` ab (Verbindungstest + Dropdown)
  - `POST /api/assistant/chat` → SSE-Stream
- `services/assistant/context.py` — reine Funktion `build_context(...)`:
  - Aggregate: Einnahmen/Ausgaben gesamt, Summe je Kategorie, Budgets, Kontostände
    (wiederverwendet aus `db/analytics`, `db/budgets`, `db/credentials`)
  - Transaktionen des Zeitraums (Datum, Betrag, Empfänger, Zweck, Kategorie),
    gekappt bei 200 Einträgen
  - deutscher System-Prompt: Assistent für persönliche Finanzen, antwortet auf
    Deutsch, nutzt ausschließlich die gelieferten Daten, erfindet keine Zahlen
- `services/assistant/client.py` — `httpx.AsyncClient`, POST
  `{base_url}/chat/completions` mit `stream=true`, parst die SSE-Chunks und
  reicht die Text-Deltas weiter.

Neue Dependency: `httpx`.

### SSE-Events

`token` (Text-Delta), `done`, `error` (mit Meldung). Format wie die vorhandenen
Streams, `text/event-stream`.

### Request

`POST /api/assistant/chat` mit `{messages: [{role, content}], date_from?, date_to?}`.
Ohne Zeitraum: globaler Date-Filter des Frontends, sonst letzte 12 Monate.

## Frontend

- `pages/settings/tabs/assistant-tab.tsx` — Base-URL, Modell-Dropdown (aus
  `/models`), optionaler Key, „Verbindung testen", An/Aus-Schalter. Als neuer Tab
  in `settings-page.tsx` registriert.
- `pages/assistant/` — Chat-Seite im Stil einer normalen Chat-App: scrollbare
  Nachrichtenliste (Nutzer rechts, Assistent links, Avatar), Markdown-Antworten,
  Eingabefeld mit Senden-Button (Enter sendet, Shift+Enter neue Zeile),
  Auto-Scroll, „Denkt nach …"-Indikator während des Streamings.
- `hooks/use-assistant.ts` — streamt per `fetch` + `ReadableStream` und hängt die
  `token`-Events an die Nachricht an.

### Sichtbarkeit des Sidebar-Items

Das KI-Item in der Sidebar wird **nur angezeigt, wenn der Assistent konfiguriert
ist**: `ai_enabled == true` **und** `ai_base_url` **und** `ai_model` gesetzt. Ein
API-Key ist nicht erforderlich (Ollama/LM Studio ohne Key). Andernfalls ist das
Item ausgeblendet; die Konfiguration erfolgt über den Einstellungen-Tab.

## Fehlerbehandlung

- Nicht konfiguriert (`ai_enabled` aus oder kein Modell) → `400 AI_NOT_CONFIGURED`,
  Frontend zeigt Hinweis mit Link zu den Einstellungen.
- Server nicht erreichbar / Timeout (60s) → `error`-Event → Toast „KI nicht
  erreichbar, Einstellungen prüfen".
- Upstream-Status ≠ 200 → `error`-Event mit Statuscode.

## Tests

`backend/tests/test_assistant.py`:

- `build_context` (reine Funktion) liefert Aggregate + gekappte Transaktionen.
- Key-Maskierung in `GET /config`.
- Fake-Upstream über `httpx.MockTransport`: Chat-Stream wird korrekt in
  SSE-Events übersetzt.

## Bekannte Grenzen

- Kontext-Stuffing statt Tool-Calling: sehr große Zeiträume werden gekappt (200
  Transaktionen), Detailfragen außerhalb des Kontexts kann das Modell nicht beantworten.
- Nur OpenAI-kompatible Server; abweichende APIs (z. B. Ollamas `/api/chat`)
  müssen über den kompatiblen Endpoint (`/v1`) angesprochen werden.
- Antwortqualität hängt vom lokalen Modell ab.
