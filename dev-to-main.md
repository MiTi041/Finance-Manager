# Release Workflow

```
dev  ─── tägliche Entwicklung (committen)
   \
    └── main ─── nur für Releases (triggert CI-Build)
```

## Neues Release

```bash
# 1. Version hochziehen (auf dev)
#    package.json → "version": "0.0.7"
git add package.json && git commit -m "chore: bump version to 0.0.7"

# 2. Nach main mergen und pushen
git checkout main && git merge dev --no-edit && git push && git checkout dev && git merge main --no-edit
```

Danach baut GitHub Actions automatisch macOS `.dmg`/`.zip` + Windows `.exe` und veröffentlicht sie als GitHub Release. Bestehende Installationen updaten sich automatisch via `electron-updater`.
