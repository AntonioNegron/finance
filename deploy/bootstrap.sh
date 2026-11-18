#!/bin/bash
# Paste-and-run on the OptiPlex with sudo. Makes a read-only deploy key, waits
# while you add it on GitHub, clones the deploy branch to /opt/finance/src and
# runs the install from it.
set -euo pipefail
B=${FINANCE_BASE:-/opt/finance}
REPO=${FINANCE_REPO:-git@github.com:AntonioNegron/finance.git}
[ "$(id -u)" = 0 ] || { echo "Run with sudo" >&2; exit 1; }
exec 3<"${FINANCE_TTY:-/dev/tty}"
if ! command -v git >/dev/null || ! command -v ssh-keygen >/dev/null; then apt-get install -y -q git openssh-client >/dev/null; fi
umask 077
mkdir -p "$B" && chown root:root "$B" && chmod 755 "$B"
# GitHub's published host key (docs.github.com, "GitHub's SSH key fingerprints").
echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' >"$B/known_hosts"
[ -f "$B/deploy-key" ] || ssh-keygen -q -t ed25519 -N '' -C 'Home-Server finance' -f "$B/deploy-key"
export GIT_SSH_COMMAND="ssh -i $B/deploy-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$B/known_hosts"
until git ls-remote -q "$REPO" deploy >/dev/null 2>&1; do
  echo
  echo "Add this key on GitHub: AntonioNegron/finance > Settings > Deploy keys > Add deploy key"
  echo "Title: Home-Server finance. Leave \"Allow write access\" OFF."
  echo
  cat "$B/deploy-key.pub"
  echo
  read -r -p "Press Enter when it's added (Ctrl-C to stop)... " <&3
done
echo "GitHub accepts the key."
if [ -d "$B/src/.git" ]; then
  git -C "$B/src" fetch -q origin deploy && git -C "$B/src" checkout -q --detach FETCH_HEAD
else
  git clone -q --branch deploy --single-branch "$REPO" "$B/src"
fi
chown -R root:root "$B/src" && chmod 755 "$B/src"
exec bash "$B/src/deploy/install.sh"
