# Finance

Kurz: Ein persönliches Finanz-Frontend + Backend (lokal entwickeltes Projekt).

Ziel dieser Dokumentation

- Das Projekt so strukturieren und beschreiben, dass Neulinge sich leicht zurechtfinden.
- Schnellstart-Anleitung für lokale Entwicklung und Hinweise zu wichtigen Ordnern.

Schnellstart (lokal)

Voraussetzungen

- Node.js (16+ empfohlen)
- pnpm
- Python (nur für bestimmte Server-Skripte, falls benötigt)

Installieren

```bash
cd Finance
pnpm install
```

Entwicklung starten

```bash
# im Projekt-Root
pnpm run dev
```

Hauptstruktur (kurze Übersicht)

- `client/` – Frontend (Vite/React). Hier liegen UI-Komponenten, Seiten, Assets.
- `server/` – Backend-Module (Python/Node). Enthält die Finanz-APIs und Sync-Logik.
- `state/` – Persistenter globaler Zustand / Datenbankdateien (lokal)
- `ecosystem.config.js` – PM2 / Prozessdefinitionen

Detaillierte Projektstruktur, Setup und Entwicklerhinweise findest du in `docs/PROJECT_STRUCTURE.md` und `docs/DEV_SETUP.md`.

Wichtige Pfade

- Frontend-Entrypoint: `client/src/main.jsx` oder `client/src/App.jsx`
- Backend-Entrypoint: `server/` (je nach Implementierung z. B. `server/app.py` oder `server/finance_server`)

Contributing

- Öffne Issues oder Pull Requests mit klarer Beschreibung.
- Schreibe kurze PR-Notes: was geändert wurde und warum.

Support

- Für lokale Probleme: `pnpm install` erneut ausführen, Node-Version prüfen.

---

Weitere Dokumente:

- [Projektstruktur](./docs/PROJECT_STRUCTURE.md)
- [Entwicklungs-Setup](./docs/DEV_SETUP.md)
