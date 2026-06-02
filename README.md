# Finance Manager

Personal finance management app with automatic bank synchronization via FinTS/EBICS.  
Built with **Electron + React + Python** — runs on macOS and Windows.

---

## Features

- **Bank account synchronization** via FinTS (HBCI) — supports ING, Sparkasse and all German FinTS-enabled banks
- **Transaction overview** with filtering, sorting and category management
- **Automatic categorization** — assign categories to transactions, group by parent category
- **Bank credential management** — encrypted storage for multiple bank accounts
- **Reference data** — resolves account holder names, IBANs, beneficiary accounts automatically
- **Export / Import** — backup and restore your database via the UI
- **Auto-updater** — built-in updates via GitHub Releases (electron-updater)
- **Cross-platform** — macOS (DMG/ZIP) and Windows (NSIS installer)

---

## Screenshots

> _Coming soon_

---

## Architecture

```
├── frontend/           React + Vite + TypeScript (UI)
├── backend/            Python FastAPI server (FinTS sync, REST API)
├── electron/           Electron main process (auto-updater, backend lifecycle)
├── build/              App icons
└── .github/workflows/  CI/CD — auto-build & release via GitHub Actions
```

The backend runs as a PyInstaller-bundled binary, spawned by Electron on startup.  
The frontend communicates with the backend via REST API (`http://127.0.0.1:8112`).

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) (install via `npm i -g pnpm`)
- [Python](https://python.org) ≥ 3.11

### Setup

```bash
pnpm install              # Install JS dependencies (root + frontend)
python3 -m venv backend/.venv             # Create Python virtual environment
source backend/.venv/bin/activate         # Activate it
pip install -r backend/requirements.txt   # Install Python dependencies
```

### Run for development

```bash
pnpm run dev              # Starts frontend (Vite) + backend (uvicorn) concurrently
```

Or with the Electron shell:

```bash
pnpm run start            # Full stack + Electron window
```

### ⚠️ Wichtiger Hinweis: FinTS-Produkt-ID erforderlich

Diese Anwendung kann **ohne eine persönliche Produkt-ID nicht genutzt werden**.

Beim ersten Start erscheint ein Setup-Bildschirm, der die Eingabe einer **FinTS-Produkt-ID** zwingend erfordert. Erst danach werden die restlichen Funktionen freigeschaltet.

**So erhältst du deine Produkt-ID:**

1. Rufe [fints.org/de/hersteller/produktregistrierung](https://www.fints.org/de/hersteller/produktregistrierung) auf
2. Registriere die Anwendung **kostenfrei** (vorgeschrieben von der Deutschen Kreditwirtschaft)
3. Nach erfolgreicher Registrierung erhältst du eine Produkt-ID (z.B. `7FD7RCC1CP14CE8B35C59DD07`)
4. Trage diese ID im Setup-Bildschirm der App ein

> Die Produkt-ID wird ausschließlich **lokal in der Datenbank** gespeichert und ist nicht im Release enthalten. Jeder Nutzer muss seine eigene ID registrieren.

## Build & Release

```bash
pnpm run electron:build   # Builds frontend + PyInstaller backend + Electron package
```

On every push to `main`, GitHub Actions automatically:

- Builds Electron packages for **macOS** (`.dmg`, `.zip`) and **Windows** (`.exe` installer)
- Publishes them as a **GitHub Release**
- Tags the release with the version from `package.json`

Existing installations receive the update automatically via `electron-updater`.

---

## Tech Stack

| Layer    | Technology                         |
| -------- | ---------------------------------- |
| Frontend | React, TypeScript, Vite, Tailwind  |
| Backend  | Python, FastAPI, Uvicorn           |
| Banking  | FinTS protocol via `fints` library |
| Desktop  | Electron, electron-builder         |
| Database | SQLite (via Python)                |
| CI/CD    | GitHub Actions, electron-updater   |

---

## Security

- Bank credentials are encrypted at rest using **Fernet (symmetric encryption)**
- The FinTS session state and encryption keys are stored locally and **never leave your machine**
- No cloud service — all data stays on your device
- The application is self-contained with no telemetry or analytics

If you discover a security vulnerability, please open a [GitHub Issue](https://github.com/MiTi041/Finance-Manager/issues).
