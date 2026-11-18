#!/usr/bin/env bash
# Secret scan of the repo: all git history, plus every file in the working
# tree that git would track (committed or new, not ignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
scripts/gitleaks.sh git --redact --no-banner .
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "$f" ] && { mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"; }
done
scripts/gitleaks.sh dir --redact --no-banner --config "$ROOT/.gitleaks.toml" "$TMP"
