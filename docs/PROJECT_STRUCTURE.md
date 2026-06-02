# Projektstruktur — Finance

Zweck: Schnellorientierung für neue Entwicklerinnen und Entwickler.

Root

- `ecosystem.config.js` — Prozess-Definitionen (PM2)
- `package.json` — Root-Scripts, häufig Aggregations-Skripte
- `pnpm-lock.yaml` — Lockfile

client/

- `index.html` — HTML-Template
- `package.json` — Frontend-spezifische Scripts
- `src/`
  - `main.jsx` / `App.jsx` — Einstiegspunkt
  - `assets/` — Bilder, Icons
  - `components/` — Wiederverwendbare UI-Komponenten (z. B. `bank-logo`, `app-sidebar`)
  - `hooks/` — Custom React Hooks
  - `layouts/` — Layout-Komponenten wie Header/Sidebar
  - `pages/` — Routen/Seiten
  - `lib/` — Hilfsfunktionen (z. B. `banks`, `sync-events`, `db`)

server/

- `package.json` / `requirements.txt` — Server-Abhängigkeiten
- `finance_server/` oder `app.py` — Backend-Logik
- `state/` — lokale DB-Dateien, persistente Zustände

Weitere Ordner

- `sql/` — SQL-Skripte und Schemas
- `docs/` — Projekt-Dokumentation (diese Datei)

Wichtige Hinweise

- Suche nach `README.md` in Unterordnern — manche Module enthalten eigene Anleitungen.
- Beim Arbeiten an Frontend: ändere nur Komponenten im `client/src/components`-Ordner, wenn du UI-Anpassungen machst.
- Beim Arbeiten an Backend: prüfe `server/` für API-Änderungen und `requirements.txt` / `package.json` für neue Abhängigkeiten.

Wo anfangen?

1. `client/README.md` (wenn vorhanden) lesen.
2. `docs/DEV_SETUP.md` für lokale Startanweisungen.
3. `client/src/App.jsx` öffnen, um die App-Initialisierung zu verstehen.

Tipps für das Navigieren im Code

- Komponenten-Dateien sind nach Funktion benannt — suche nach `sidebar`, `bank`, `transaction`.
- `lib/` enthält oft Hilfsfunktionen; dort finden sich Datenzugriffe und API-Wrapper.
- Nutze die lokale Suche (z. B. VS Code "Suche in Dateien") für Schlüsselbegriffe wie `FINTS_SYNC`.
