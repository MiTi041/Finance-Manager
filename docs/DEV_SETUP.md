# Entwicklungs-Setup (lokal)

Kurz: So startest du das Projekt lokal auf macOS / Linux.

Voraussetzungen

- Node.js (empfohlen: 16+)
- `pnpm` (global installiert)
- Optional: Python 3.x (für bestimmte serverseitige Skripte)

Schritte

1. Abhängigkeiten installieren

```bash
cd Finance
pnpm install
```

2. Development-Server starten

```bash
pnpm run dev
```

Hinweise

- `pnpm run dev` startet im Root normalerweise sowohl Frontend als auch Backend (oder leitet zu den einzelnen Projekten weiter). Wenn der Root-`package.json` keine Multi-Start-Tasks enthält, wechsle in `client/` bzw. `server/` und führe dort `pnpm install` und `pnpm run dev` aus.

- Falls API-Endpunkte nicht erreichbar sind: Prüfe `server/`-Logs, `ecosystem.config.js` und mögliche Umgebungsvariablen.

Umgebungsvariablen

- Manche Dienste erwarten `.env`-Dateien. Schaue in `client/` und `server/` nach Beispieldateien oder `README`s.

Fehlerbehebung

- Node-Version prüfen: `node -v`
- Lockfile neu schreiben: `pnpm install --lockfile-only` oder `pnpm install` erneut ausführen.

Mehr Infos

- Siehe `docs/PROJECT_STRUCTURE.md` für Orientierung im Code.
