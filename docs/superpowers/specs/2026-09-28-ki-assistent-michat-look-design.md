# KI-Assistent im miCHAT-Look — Design

## Ziel

Der bestehende KI-Assistent bekommt die Chat-Optik des Projekts `michat`
(`/Users/michaeltissen/Projects/michat`): unsichtbare Scrollbar, Kapsel-Eingabe,
klarere Nachrichtenblasen und ein Emoji-Empty-State. Die Funktionalität bleibt
vollständig erhalten.

## Nicht-Ziele

- Keine Änderung an Backend, API, Streaming, Tool-Calling oder Konfiguration.
- Keine neuen Komponenten oder Dateien im Frontend.
- Keine Avatare, Timestamps, Namenszeilen oder Nachrichten-Gruppierung.
- Kein Verzicht auf Markdown-Antworten oder die farbliche Trennung der Blasen.
- Keine Änderung der Spaltenbreite (`max-w-3xl`) und der Seitenhöhe.

## Umfang

Genau eine Datei: `frontend/src/pages/assistant/assistant-page.tsx`.

## Umsetzung

### Nachrichtenliste

- `ScrollArea` (Radix, sichtbare Scrollbar) durch ein einfaches
  `div` mit `overflow-auto` und der vorhandenen Utility `.no-scrollbar`
  (`globals.css:204`) ersetzen.
- Auto-Scroll über `bottomRef` bleibt unverändert.
- Innenabstand/Höhe so, dass `bottomRef` weiterhin am Listenende sitzt.

### Nachrichtenblasen

- Nutzer: `rounded-xl bg-primary text-white` (Farbtrennung bleibt).
- Assistent: `rounded-xl bg-secondary/50 text-foreground`.
- Rahmen bleibt `max-w-[80%] px-4 py-2 text-sm`, Zuordnung weiterhin nur
  über `justify-end` / `justify-start`.
- Markdown-Rendering und Status-/Fehleranzeige bleiben unverändert.

### Empty State

- Bei leerer Liste (und konfiguriertem Assistenten): zentriert ein Emoji
  (z. B. `💸`), darunter Titel „Keine Nachrichten", darunter der bisherige
  Beispielsatz als `text-muted-foreground`.
- Inline im vorhandenen Markup, keine neue Komponente.

### Eingabe-Kapsel

- Container ersetzt die bisherige `border-t`-Zeile: `mx-auto max-w-3xl`,
  `rounded-[32px] bg-secondary p-4`, Breite wie die Nachrichtenliste.
- Textarea: `w-full resize-none border-0 bg-transparent text-sm shadow-none
  focus:ring-0`, Platzhalter „Frage zu deinen Finanzen …", Höhe wächst
  automatisch (kein fixer `h-40`, um keinen Leerraum zu erzeugen). Enter sendet,
  Shift+Enter erzwingt einen Umbruch.
- Untere Zeile rechtsbündig, Abstand `gap-2`, innerhalb der Kapsel:
  - `Denken`-Toggle (Brain-Icon, gedrückt = `secondary`-Variante), Zustand
    weiterhin in `localStorage` unter `assistantThink`.
  - `Senden` als Kapsel-Button `rounded-full bg-primary text-primary-foreground`,
    deaktiviert bei laufendem Stream oder leerer Eingabe.
- `Leeren` bleibt im Header.
- Der nicht-konfiguriert-Hinweis mit Link auf die Einstellungen bleibt erhalten
  und sitzt weiterhin über der Kapsel.

### Unverändert

Kopfzeile, Fehler-/Statuslogik, `use-assistant`, `use-assistant-config`,
`MarkdownMessage`, Seitehöhe `h-[calc(100svh-4rem)]`.

## Verifikation

- `pnpm --dir frontend build` läuft fehlerfrei.
- Vorhandene Frontend-Tests (`node --test`) bleiben grün.
- Visuell: leere Liste zeigt Emoji-Empty-State, Kapsel sendet per Enter,
  Blasen links/rechts korrekt, keine sichtbare Scrollbar, `Denken` und
  `Leeren` funktionieren.
