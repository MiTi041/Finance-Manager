# Finance Manager

Persönliche Finanzverwaltung mit automatischer Banksynchronisation über **FinTS/EBICS**.  
Die App läuft lokal auf deinem Rechner, speichert sensible Daten verschlüsselt und bringt deine Konten und Umsätze an einem Ort zusammen.

---

## Warum diese App?

- **Banksynchronisation** mit deutschen FinTS-fähigen Banken, darunter ING und Sparkasse
- **Lokale Datenspeicherung** ohne Cloud-Zwang
- **Verschlüsselte Bankzugänge** für mehrere Konten
- **Referenzdaten** zur automatischen Zuordnung von Kontoinhabern, IBANs und Empfängerkonten
- **Export / Import** für Backup und Wiederherstellung
- **Auto-Updater** über GitHub Releases

---

## Erste Schritte

### Voraussetzungen

- [Node.js](https://nodejs.org) ≥ 20
- [Python](https://python.org) ≥ 3.11

[pnpm](https://pnpm.io) installierst du mit `npm i -g pnpm`.

### Setup

```bash
pnpm install                                    # JS-Abhängigkeiten (root + frontend)
python3 -m venv backend/.venv && source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

### Entwicklung starten

```bash
pnpm run dev        # Frontend (Vite) + Backend (uvicorn)
pnpm run start      # Kompletter Stack + Electron-Fenster
```

---

## FinTS-Produkt-ID

Die App erfordert beim ersten Start eine **persönliche FinTS-Produkt-ID** (vorgeschrieben von der Deutschen Kreditwirtschaft). Erst danach werden alle Funktionen freigeschaltet.

1. Registriere die Anwendung kostenfrei auf [fints.org/de/hersteller/produktregistrierung](https://www.fints.org/de/hersteller/produktregistrierung) und erhalte deine Produkt-ID (z. B. `7FD7RCC1CP14CE8B35C59DD07`)
2. Trage die ID im Setup-Bildschirm der App ein

> Die Produkt-ID wird **ausschließlich lokal** in der Datenbank gespeichert und ist nicht im Release enthalten. Jeder Nutzer registriert seine eigene ID.

---

## Betrieb

Das Backend läuft als PyInstaller-Binary und wird von Electron beim Start gestartet.  
Die Kommunikation erfolgt lokal über die REST-API.

**Tech-Stack:** React · TypeScript · Vite · Electron · Python · FastAPI · SQLite

---

## Build & Release

```bash
pnpm run electron:build   # Frontend + PyInstaller-Backend + Electron-Paket
```

Bei jedem Push auf `main` baut GitHub Actions automatisch:

- **macOS**: `.dmg`, `.zip`
- **Windows**: `.exe` (NSIS-Installer)

und veröffentlicht sie als **GitHub Release** (Version aus `package.json`).  
Bestehende Installationen erhalten das Update automatisch über `electron-updater`.

---

## Sicherheit

- Bankzugangsdaten sind **verschlüsselt gespeichert** (Fernet, symmetrische Verschlüsselung)
- FinTS-Session-State und Schlüssel bleiben **lokal auf deinem Gerät**

Alle Daten bleiben auf deinem Gerät. Die App ist in sich geschlossen.

Sicherheitslücken bitte als [GitHub Issue](https://github.com/MiTi041/Finance-Manager/issues) melden.
