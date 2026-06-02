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

> *Coming soon*

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
pip install -r backend/requirements.txt  # Install Python dependencies
cp backend/.env.example backend/.env      # Configure environment (see below)
```

### Run for development

```bash
pnpm run dev              # Starts frontend (Vite) + backend (uvicorn) concurrently
```

Or with the Electron shell:

```bash
pnpm run start            # Full stack + Electron window
```

### Configuration

Copy `backend/.env.example` to `backend/.env` and fill in the values.
At minimum you need a **PRODUCT_ID** for FinTS bank synchronization —
[register for free](https://www.fints.org/de/hersteller/produktregistrierung) at the Deutsche Kreditwirtschaft.

---

## Workflow

```
dev  ─── daily development (push any time)
   \
    └── main ─── only for releases (triggers CI build)
```

- **`dev` branch** — all day-to-day work, no CI release
- **`main` branch** — merge `dev` → `main` only when you want to publish a release
- **Version bump** — `package.json` version is the release version; update it on `dev` before merging

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

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React, TypeScript, Vite, Tailwind   |
| Backend   | Python, FastAPI, Uvicorn            |
| Banking   | FinTS protocol via `fints` library  |
| Desktop   | Electron, electron-builder          |
| Database  | SQLite (via Python)                 |
| CI/CD     | GitHub Actions, electron-updater    |

---

## Security

- Bank credentials are encrypted at rest using **Fernet (symmetric encryption)**
- The FinTS session state and encryption keys are stored locally and **never leave your machine**
- No cloud service — all data stays on your device
- The application is self-contained with no telemetry or analytics

If you discover a security vulnerability, please open a [GitHub Issue](https://github.com/MiTi041/Finance-Manager/issues).


