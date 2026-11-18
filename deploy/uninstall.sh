#!/bin/bash
# Removes the finance app from the OptiPlex: the containers, their images and
# networks, the updater timer and the finance user. Asks before deleting
# /opt/finance (the passwords, the app's data and the deploy key).
# Actual and its compose file are not touched.
set -euo pipefail

BASE=${FINANCE_BASE:-/opt/finance}
SYSTEMD_DIR=${FINANCE_SYSTEMD_DIR:-/etc/systemd/system}
[ "$(id -u)" = 0 ] || { echo "Run with sudo" >&2; exit 1; }
exec 3<"${FINANCE_TTY:-/dev/tty}" # answers from the terminal (a test passes a file)

echo "== Updater"
systemctl disable --now finance-update.timer >/dev/null 2>&1 || true
systemctl stop finance-update.service >/dev/null 2>&1 || true
rm -f "$SYSTEMD_DIR/finance-update.timer" "$SYSTEMD_DIR/finance-update.service"
systemctl daemon-reload
echo "removed finance-update.timer"

echo "== App and forwarder"
if [ -f "$BASE/compose.yml" ]; then
  docker compose -f "$BASE/compose.yml" down --remove-orphans >/dev/null 2>&1 || true
fi
docker rm -f finance-app finance-forwarder >/dev/null 2>&1 || true
for tag in $(docker image ls finance-app --format '{{.Tag}}'); do
  docker rmi -f "finance-app:$tag" >/dev/null 2>&1 || true
done
echo "removed the containers, the networks and the finance-app images"

echo "== User"
if id finance >/dev/null 2>&1; then
  userdel finance
  echo "removed the user finance"
fi

echo "== Files"
if [ -d "$BASE" ]; then
  read -r -p "Delete $BASE too (passwords, the app's data, the deploy key)? Type yes to delete: " ans <&3 || ans=
  if [ "$ans" = yes ]; then
    rm -rf --one-file-system "$BASE"
    echo "deleted $BASE"
  else
    echo "kept $BASE"
  fi
fi
echo
echo "Last step, on GitHub: AntonioNegron/finance > Settings > Deploy keys > delete \"Home-Server finance\"."
