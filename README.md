# Finance-Manager

Personal finance management application with automatic bank synchronization via FinTS/EBICS, built with Electron + React + Python.

## Architecture

```
├── frontend/          # React + Vite + TypeScript (UI)
├── backend/           # Python FastAPI server (FinTS sync, REST API)
├── electron/          # Electron main process (auto-updater, backend lifecycle)
├── build/             # App icons (icns, ico)
├── .github/workflows/ # CI/CD – auto-build & release via GitHub Actions
```

## Development

```bash
pnpm install
pnpm run dev           # Starts frontend (Vite) + backend (uvicorn) concurrently
pnpm run start         # Full stack + Electron window
```

## Build & Release

```bash
pnpm run electron:build  # Builds frontend + PyInstaller backend + Electron package
```

On push to `main`, GitHub Actions automatically:
- Builds signed Electron packages for macOS and Windows
- Publishes them as a GitHub Release
- Tags the release with the version from `package.json`

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React, TypeScript, Vite, Tailwind   |
| Backend   | Python, FastAPI, Uvicorn            |
| Banking   | FinTS protocol via `fints` library  |
| Desktop   | Electron, electron-builder          |
| Database  | SQLite (via Python)                 |
| CI/CD     | GitHub Actions, electron-updater    |
