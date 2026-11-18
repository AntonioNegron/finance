# Deploy: the finance app on the OptiPlex

Antonio runs the install once ([manual step 3](../docs/manual-setup.md)); after that, moving the `deploy` branch ships an update.

- `paste.sh`: prints the one-line command Antonio pastes (bootstrap.sh, compressed and checksummed).
- `bootstrap.sh`: makes the read-only deploy key, waits for it on GitHub, clones `deploy` to `/opt/finance/src`, runs the install.
- `install.sh`: the `finance` user, `/opt/finance`, the passwords (hidden prompts), the image, the compose file and forwarder config, the updater timer. Safe to run again.
- `compose.yml`, `haproxy.cfg`: templates the install copies to `/opt/finance` (root-owned). The updater never changes them.
- `update.sh`, `finance-update.service`, `finance-update.timer`: every 5 minutes, build and start a new `deploy` commit; roll back if `/healthz` isn't `ok <commit>` within 3 minutes.
- `uninstall.sh`: removes the app, the forwarder, the timer and the user; asks before deleting `/opt/finance`.
- `Dockerfile`: the app image (pinned base).

On the OptiPlex:

```
/opt/finance/            root
├─ src/                  root: the deploy branch (the updater checks it out)
├─ deploy-key, known_hosts   root 600: read-only GitHub key, GitHub's pinned host key
├─ compose.yml           root 600
├─ forwarder/haproxy.cfg root 644
├─ secrets/finance.env   finance 600: Actual password, app password hash, Sync ID
├─ data/                 finance 700: the app's own storage and Actual's cache
├─ bin/finance-update    root: the updater (a copy, not run from src/)
├─ updater.conf          root: the health URL
└─ state/                root 700: deployed and failed commits, last build output
```

Logs: `journalctl -t finance-app` (the app; Docker can't read them, so neither can Dozzle), `journalctl -u finance-update` (commits, steps, up/down).

Tested on the NUC by `test/deploy.test.ts` with stand-ins for Docker and systemd; see the F1-1 report for what only runs on the OptiPlex.
