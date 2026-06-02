#!/usr/bin/env bash
set -euo pipefail

if ! git diff --quiet -- package.json; then
  echo "❌ package.json hat uncommitted changes — commit oder stash sie zuerst."
  exit 1
fi

CURRENT=$(node -p "require('./package.json').version")
echo "Aktuelle Version: $CURRENT"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
NEW="$MAJOR.$MINOR.$((PATCH + 1))"
read -r -p "Neue Version [$NEW]: " INPUT
NEW="${INPUT:-$NEW}"

node -e "
  const p = require('./package.json');
  p.version = '$NEW';
  require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

git add package.json
git commit -m "chore: bump version to $NEW"

git checkout main
git merge dev --no-edit
git push
git checkout dev
git merge main --no-edit

echo "✅ Release v$NEW gestartet — CI baut und publiziert automatisch."
