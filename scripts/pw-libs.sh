#!/usr/bin/env bash
# User-level system libraries for Playwright's headless Chromium, for a
# machine where `sudo npx playwright install-deps` isn't wanted (the NUC).
# Downloads Debian packages with apt-get download (no root) and unpacks them
# into ~/.local/share/finance-pw-libs; dev/screens.ts adds it to
# LD_LIBRARY_PATH. Undo: rm -rf ~/.local/share/finance-pw-libs
set -euo pipefail
D="$HOME/.local/share/finance-pw-libs"
mkdir -p "$D/debs"
cd "$D/debs"
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxrender1 libxi6 libxkbcommon0 \
  libgbm1 libdrm2 libdrm-common libwayland-server0 fonts-dejavu-core
for f in *.deb; do dpkg -x "$f" "$D/root"; done
# A fontconfig file that only knows the unpacked fonts.
mkdir -p "$D/cache"
cat > "$D/fonts.conf" <<CONF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$D/root/usr/share/fonts</dir>
  <cachedir>$D/cache</cachedir>
</fontconfig>
CONF
echo "libraries in $D/root"
