# Release Workflow

dev  → tägliche Entwicklung
main → nur für Releases (triggert CI-Build)

## Neues Release

```bash
./release.sh
```

Das Script erhöht die Version (Vorschlag: Patch), committed, merged nach main, pushed, und geht zurück zu dev.
