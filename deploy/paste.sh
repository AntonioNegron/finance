#!/bin/bash
# Prints the one-line command Antonio pastes on the OptiPlex: bootstrap.sh,
# gzipped and base64-encoded (short, and a cut-off paste fails the checksum
# instead of running half a script), checked, then run with sudo.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
b64=$(gzip -9n <"$here/bootstrap.sh" | base64 -w0)
sum=$(sha256sum <"$here/bootstrap.sh" | cut -d' ' -f1)
printf '%s\n' "f=\$(mktemp) && echo '$b64' | base64 -d | gunzip >\"\$f\" && echo \"$sum  \$f\" | sha256sum -c --quiet && sudo bash \"\$f\"; rm -f \"\$f\""
