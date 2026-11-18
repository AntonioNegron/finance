#!/bin/bash
# finance-update: run as root by finance-update.timer every 5 minutes.
# install.sh copies this file to /opt/finance/bin/finance-update; that copy is
# what runs, so a commit can't change it. Only a rerun of the install does.
#
# If the repo's `deploy` branch moved: build that commit, start it, and if
# /healthz isn't "ok <commit>" within 3 minutes, go back to the previous image.
# It never touches the compose file, the networks, the folders or the secrets.
#
# Its log (journalctl -u finance-update) has commits, steps and up/down only.
set -euo pipefail
umask 077

BASE=${FINANCE_BASE:-/opt/finance}
SRC="$BASE/src"
STATE="$BASE/state"
IMAGE=finance-app
HEALTH_TRIES=${FINANCE_HEALTH_TRIES:-36} # x 5 s = 3 minutes
HEALTH_URL=$(sed -n 's/^HEALTH_URL=//p' "$BASE/updater.conf")
export GIT_SSH_COMMAND="ssh -i $BASE/deploy-key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$BASE/known_hosts"

log() { printf '%s\n' "$*"; }
short() { printf '%s' "${1:0:12}"; }
compose() { docker compose -f "$BASE/compose.yml" "$@" >/dev/null 2>&1; }

# One run at a time.
exec 9>"$STATE/lock"
flock -n 9 || exit 0

if ! git -C "$SRC" fetch -q origin deploy 2>/dev/null; then
  log "fetch failed"
  exit 1
fi
new=$(git -C "$SRC" rev-parse FETCH_HEAD)
cur=$(cat "$STATE/deployed" 2>/dev/null || true)
failed=$(cat "$STATE/failed" 2>/dev/null || true)
# Nothing new, or a commit that already failed: say nothing.
[ "$new" = "$cur" ] && exit 0
[ "$new" = "$failed" ] && exit 0

healthy() { # waits for /healthz to say "ok <commit>"
  local body
  for _ in $(seq "$HEALTH_TRIES"); do
    body=$(curl -s -m 5 "$HEALTH_URL" || true)
    [ "$body" = "ok $1" ] && return 0
    sleep "${FINANCE_HEALTH_WAIT:-5}"
  done
  return 1
}

log "update $(short "$cur") -> $(short "$new")"
git -C "$SRC" checkout -q --detach "$new"
git -C "$SRC" reset -q --hard
git -C "$SRC" clean -q -fdx

log "build $(short "$new")"
if ! docker build -f "$SRC/deploy/Dockerfile" --build-arg "FINANCE_COMMIT=$new" \
  -t "$IMAGE:$new" "$SRC" >"$STATE/last-build.log" 2>&1; then
  printf '%s\n' "$new" >"$STATE/failed"
  log "build failed; still running $(short "$cur")"
  exit 1
fi

docker tag "$IMAGE:current" "$IMAGE:previous"
docker tag "$IMAGE:$new" "$IMAGE:current"
log "start $(short "$new")"
compose up -d --no-deps --force-recreate app || true

if healthy "$new"; then
  printf '%s\n' "$new" >"$STATE/deployed"
  rm -f "$STATE/failed"
  log "up $(short "$new")"
  # Keep only the running image and the one before it.
  for tag in $(docker image ls "$IMAGE" --format '{{.Tag}}'); do
    case $tag in current | previous | "$new" | "$cur") ;; *) docker rmi -f "$IMAGE:$tag" >/dev/null 2>&1 || true ;; esac
  done
  exit 0
fi

log "down $(short "$new"): not healthy; rolling back to $(short "$cur")"
printf '%s\n' "$new" >"$STATE/failed"
docker tag "$IMAGE:previous" "$IMAGE:current"
compose up -d --no-deps --force-recreate app || true
if healthy "$cur"; then
  log "up $(short "$cur") (rolled back)"
else
  log "down $(short "$cur"): still not healthy after the rollback"
fi
exit 1
