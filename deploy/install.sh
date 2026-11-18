#!/bin/bash
# The finance app's install on the OptiPlex. Run as root (bootstrap.sh runs it
# from /opt/finance/src). Safe to run again: it keeps what is already set up
# and asks before replacing the passwords.
#
# Sets up: the `finance` user, /opt/finance, the secrets file (from hidden
# prompts), the image, the compose file and forwarder config (root-owned
# copies), and the updater timer. Never prints or logs a secret.
set -euo pipefail
umask 022

BASE=${FINANCE_BASE:-/opt/finance}
SYSTEMD_DIR=${FINANCE_SYSTEMD_DIR:-/etc/systemd/system}
SRC="$BASE/src"
PORT=8015 # the forwarder's port on the Docker bridge address (Caddy's way in)
APP_IMAGE=finance-app
HAPROXY_IMAGE=$(sed -n 's/^ *image: \(haproxy:[^ ]*\).*/\1/p' "$SRC/deploy/compose.yml")

# Answers come from the terminal (a test passes a file instead).
exec 3<"${FINANCE_TTY:-/dev/tty}"

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die() {
  printf '\nSTOPPED: %s\n' "$*" >&2
  exit 1
}

# Asks at a hidden prompt, twice. Rejects empty values, spaces at either end
# (the secrets file trims them) and the characters the file can't hold.
ask_hidden() {
  local prompt=$1 min=$2 a b
  while true; do
    read -r -s -p "$prompt: " a <&3 || die "no answer"
    printf '\n' >&2
    if [ "${#a}" -lt "$min" ]; then
      say "  Use at least $min characters." >&2
      continue
    fi
    if [[ $a =~ ^[[:space:]] || $a =~ [[:space:]]$ ]]; then
      say "  No spaces at the start or end, please." >&2
      continue
    fi
    read -r -s -p "Again: " b <&3 || die "no answer"
    printf '\n' >&2
    [ "$a" = "$b" ] && break
    say "  They don't match. Try again." >&2
  done
  REPLY=$a
}

# ---------------------------------------------------------------- checks
step "Checking the OptiPlex"
[ "$(id -u)" = 0 ] || die "run with sudo"
[ -d "$SRC/.git" ] || die "$SRC is missing: run bootstrap.sh first"
command -v docker >/dev/null || die "Docker isn't installed"
docker compose version >/dev/null 2>&1 || die "the Docker compose plugin isn't installed"
missing=()
for c in git curl flock ssh; do command -v "$c" >/dev/null || missing+=("$c"); done
if [ "${#missing[@]}" -gt 0 ]; then
  say "Installing: ${missing[*]}"
  apt-get install -y -q git curl util-linux openssh-client >/dev/null
fi
BRIDGE_IP=$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')
[[ $BRIDGE_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "couldn't read the Docker bridge address"
if ss -Hltn "sport = :$PORT" | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx finance-forwarder; then
  die "port $PORT is taken by something else on this machine"
fi
[ -n "$HAPROXY_IMAGE" ] || die "couldn't read the forwarder image from compose.yml"
COMMIT=$(git -C "$SRC" rev-parse HEAD)
say "Docker bridge address: $BRIDGE_IP, port $PORT"
say "App version: ${COMMIT:0:12}"

# ---------------------------------------------------------- user and folders
step "User and folders"
if ! id finance >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin finance
  say "Created the system user finance (no login, no shell)"
fi
for g in docker sudo; do
  if id -nG finance | tr ' ' '\n' | grep -qx "$g"; then
    gpasswd -d finance "$g" >/dev/null
    say "Removed finance from the $g group"
  fi
done
FUID=$(id -u finance)
FGID=$(id -g finance)

mkdir -p "$BASE" "$BASE/bin" "$BASE/forwarder" "$BASE/state" "$BASE/secrets" "$BASE/data"
chown root:root "$BASE" "$BASE/bin" "$BASE/forwarder" "$BASE/state" "$BASE/secrets"
chmod 755 "$BASE" "$BASE/bin" "$BASE/forwarder"
chmod 700 "$BASE/state" "$BASE/secrets"
chown finance:finance "$BASE/data"
chmod 700 "$BASE/data"
say "$BASE: root; data/: finance only; secrets/ and state/: root only"

# ------------------------------------------------------------------- image
step "Building the app (a few minutes the first time)"
if docker image inspect "$APP_IMAGE:$COMMIT" >/dev/null 2>&1; then
  say "Already built"
else
  docker build -f "$SRC/deploy/Dockerfile" --build-arg "FINANCE_COMMIT=$COMMIT" \
    -t "$APP_IMAGE:$COMMIT" "$SRC" >"$BASE/state/last-build.log" 2>&1 ||
    die "the build failed; the output is in $BASE/state/last-build.log"
fi
if ! docker image inspect "$APP_IMAGE:current" >/dev/null 2>&1; then
  docker tag "$APP_IMAGE:$COMMIT" "$APP_IMAGE:current"
fi

# ----------------------------------------------------------------- secrets
step "Passwords"
SECRETS="$BASE/secrets/finance.env"
keep=n
changed=n
if [ -s "$SECRETS" ]; then
  had_secrets=y
  read -r -p "Passwords and Sync ID are already saved. Keep them? [Y/n] " keep <&3 || keep=y
  [[ ${keep:-y} =~ ^[Nn] ]] && keep=n || keep=y
fi
if [ "$keep" = n ]; then
  say "Nothing you type here is shown or saved anywhere but $SECRETS."
  ask_hidden "Actual server password (the one you log in to Actual with)" 1
  actual_pw=$REPLY
  ask_hidden "New password for this app (at least 12 characters)" 12
  # The app's own hashing, from the image just built, with no network. The
  # password goes in on stdin, never as an argument.
  login_hash=$(printf '%s\n' "$REPLY" | docker run --rm -i --network none --read-only --cap-drop ALL \
    --user "$FUID:$FGID" "$APP_IMAGE:$COMMIT" node dist/app/src/hash-password.js 2>/dev/null) ||
    die "couldn't hash the app password"
  REPLY=''
  [[ $login_hash =~ ^scrypt\$ ]] || die "couldn't hash the app password"
  while true; do
    read -r -p "Budget Sync ID (Actual > Settings > Advanced settings): " sync_id <&3 || die "no answer"
    [[ $sync_id =~ ^[A-Za-z0-9-]{8,64}$ ]] && break
    say "  That doesn't look like a Sync ID (letters, numbers and dashes)."
  done
  tmp=$(mktemp "$BASE/secrets/.finance.env.XXXXXX")
  {
    printf '# Written by install.sh. Root and the finance user only.\n'
    printf 'ACTUAL_PASSWORD=%s\n' "$actual_pw"
    printf 'FINANCE_LOGIN_HASH=%s\n' "$login_hash"
    printf 'ACTUAL_SYNC_ID=%s\n' "$sync_id"
  } >"$tmp"
  actual_pw='' login_hash=''
  chown finance:finance "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$SECRETS"
  [ -n "${had_secrets:-}" ] && changed=y
  say "Saved (mode 600, owner finance)"
fi
chown finance:finance "$SECRETS"
chmod 600 "$SECRETS"

# --------------------------------------------- compose file and forwarder
step "Compose file and forwarder"
sed -e "s|@UID@|$FUID|g" -e "s|@GID@|$FGID|g" -e "s|@BASE@|$BASE|g" \
  -e "s|@BRIDGE_IP@|$BRIDGE_IP|g" -e "s|@PORT@|$PORT|g" \
  "$SRC/deploy/compose.yml" >"$BASE/compose.yml.new"
grep -q '@[A-Z_]*@' "$BASE/compose.yml.new" && die "compose.yml has a value left to fill in"
install -m 644 "$SRC/deploy/haproxy.cfg" "$BASE/forwarder/haproxy.cfg"
chown root:root "$BASE/compose.yml.new" "$BASE/forwarder/haproxy.cfg"
chmod 600 "$BASE/compose.yml.new"
docker compose -f "$BASE/compose.yml.new" config -q || die "Docker refused the compose file"
docker run --rm --network none \
  -v "$BASE/forwarder/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" \
  "$HAPROXY_IMAGE" haproxy -c -q -f /usr/local/etc/haproxy/haproxy.cfg >/dev/null ||
  die "HAProxy refused the forwarder config"
mv -f "$BASE/compose.yml.new" "$BASE/compose.yml"
say "Checked and saved: compose.yml, forwarder/haproxy.cfg"

# --------------------------------------------------------------- start
step "Starting"
docker compose -f "$BASE/compose.yml" up -d --remove-orphans >/dev/null 2>&1 || die "Docker couldn't start the app"
# New passwords on a rerun: the app reads the secrets file when it starts.
if [ "$changed" = y ]; then
  docker compose -f "$BASE/compose.yml" restart app >/dev/null 2>&1 || die "Docker couldn't restart the app"
fi
running=$(docker image inspect "$APP_IMAGE:current" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^FINANCE_COMMIT=//p')
[ -s "$BASE/state/deployed" ] || printf '%s\n' "${running:-$COMMIT}" >"$BASE/state/deployed"

# ---------------------------------------------------------------- updater
step "Updater (every 5 minutes)"
install -m 755 "$SRC/deploy/update.sh" "$BASE/bin/finance-update"
printf 'HEALTH_URL=http://%s:%s/healthz\n' "$BRIDGE_IP" "$PORT" >"$BASE/updater.conf"
chmod 644 "$BASE/updater.conf"
chown root:root "$BASE/bin/finance-update" "$BASE/updater.conf"
for u in finance-update.service finance-update.timer; do
  sed "s|@BASE@|$BASE|g" "$SRC/deploy/$u" >"$SYSTEMD_DIR/$u"
  chmod 644 "$SYSTEMD_DIR/$u"
done
systemctl daemon-reload
systemctl enable --now finance-update.timer >/dev/null 2>&1 || die "couldn't turn on the updater timer"
say "finance-update.timer is on"

# ---------------------------------------------------------------- check
step "Checking the app (up to 3 minutes)"
health=
for _ in $(seq 36); do
  health=$(curl -s -m 5 "http://$BRIDGE_IP:$PORT/healthz" || true)
  [[ $health == ok\ * ]] && break
  sleep 5
done

say ""
say "Installed:"
say "- user finance (no login, no shell, not in docker or sudo)"
say "- $BASE: compose.yml, forwarder/, secrets/ (root and finance only), data/"
say "- containers finance-app and finance-forwarder"
say "- finance-update.timer: checks the deploy branch every 5 minutes"
say "- logs: journalctl -t finance-app (the app), journalctl -u finance-update (updates)"
say ""
if [[ $health == ok\ * ]]; then
  say "The app is up and synced with Actual (version ${health#ok }, short: ${health:3:12})."
  say ""
  say "Next, on your phone:"
  say "1. Open https://finance.home.lan and log in (the home login, then the app password)."
  say "2. Accounts tab: switch off the accounts that aren't yours."
  say "3. Spending > \"Which groups are saving?\": check the groups it guessed."
else
  say "The app is running but hasn't synced with Actual yet (/healthz says: ${health:-no answer})."
  say "Check: is Actual up? Is the Sync ID right? Then:"
  say "  sudo journalctl -t finance-app -n 20"
  say "It retries on its own. To retype the passwords: sudo bash $SRC/deploy/install.sh"
fi
