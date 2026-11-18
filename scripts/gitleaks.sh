#!/usr/bin/env bash
# Runs the pinned gitleaks secret scanner; downloads it into .tools/ on first use
# (user-level, checksum-verified). Usage: scripts/gitleaks.sh <gitleaks args>
set -euo pipefail
VERSION=8.30.1
SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.tools/gitleaks-$VERSION"
if [ ! -x "$BIN" ]; then
  mkdir -p "$ROOT/.tools"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/g.tgz" \
    "https://github.com/gitleaks/gitleaks/releases/download/v$VERSION/gitleaks_${VERSION}_linux_x64.tar.gz"
  echo "$SHA256  $TMP/g.tgz" | sha256sum -c --quiet
  tar -xzf "$TMP/g.tgz" -C "$TMP" gitleaks
  install -m 0755 "$TMP/gitleaks" "$BIN"
fi
exec "$BIN" "$@"
