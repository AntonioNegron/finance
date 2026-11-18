# Plan

*Updated 2026-11-17 (evening)*

## Goal

A web app on the OptiPlex that Antonio opens on his phone to see where his money stands and build his budget more easily, using his Actual Budget data (synced from his banks through SimpleFIN). Claude Code builds all of it, and never reads the data ([privacy rule](decisions/2026-11-17-privacy-rule.md)).

## What Antonio wants to see

From [what to build first](decisions/2026-11-17-what-to-build-first.md):

1. **Balances**: what's in each account, and the total for the accounts that count
2. **Spending vs. budget by category**: this month, over-budget first
3. **Upcoming bills and subscriptions**: what's due next and what it costs per month
4. **Unusual charges**: duplicates, unusually large ones, new merchants
5. **An easier way to build the budget** (Phase 2, [decision](decisions/2026-11-17-budget-builder.md))

Some accounts in the budget aren't his. The app has a setting to leave accounts out of every total; he picks them himself.

## Target setup (proposed, confirmed phase by phase)

```
OptiPlex
 ├─ Actual server (/opt/actual)  ◀── SimpleFIN ◀── banks
 │        ▲
 │        │ private network, no internet
 │        ▼
 ├─ finance app (/opt/finance, owner: user `finance`)
 │     secrets file: root + finance only
 │     its own login, behind Authelia (admins)
 └─ Caddy ── finance.<home name> ──▶ Antonio's phone

NUC: Claude Code ── code, fake budget, tests ── git ──▶ GitHub
       └─ moves the `deploy` branch; the OptiPlex pulls it,
            builds and restarts; Claude Code sees /healthz only
```

- **Stack:** Node.js + TypeScript with the official `@actual-app/api` package (Actual's only official client), and a phone-first web page. Claude's pick, because the API package uses the same budget engine as Actual itself.
- **Version:** the API package version matches Antonio's Actual server (manual step 1); check Actual's docs on matching versions.
- **Name:** follows the home names decision in the homelab repo (deSEC name still to settle).

## How the privacy rule is enforced

Each layer is there in case another one fails:

1. **Its own owner.** User `finance` owns `/opt/finance` and the secrets file. It is not a Claude Code stack (those live in `/srv/agent` and Claude Code controls them).
2. **Its own login.** Claude Code manages Caddy, so the app can't rely on Caddy and Authelia alone. It asks for its own password too (a long session on his phone, so it's rarely asked).
3. **No way out.** The app is on a network that only reaches Actual and Caddy, with no internet, and publishes no port to the home network.
4. **Logs closed.** The app logs no data (tested). Its and Actual's logs are hidden from Dozzle and from anything `claude-agent` can open.
5. **Read-only in code.** Only the Actual read functions in [specs/actual-access.md](specs/actual-access.md), enforced by a test.
6. **Fake data for building.** All development and testing on a made-up budget on the NUC ([specs/fake-budget.md](specs/fake-budget.md)).
7. **Numbers only by permission.** [Asking for numbers](README.md#asking-for-numbers); `finance-share` in Phase 3.
8. **Repo hygiene.** Secret scanner, `.gitignore`, the rules in [../CLAUDE.md](../CLAUDE.md).

**What this doesn't cover:** Claude Code manages Caddy and Dozzle, so the app doesn't count on them: its own login and its data-free logs are what keep the data in if either is misconfigured. Deliberately rewiring them to get at the data is ruled out by the rules, not by the machine.

## Phases

- **Phase 0, build on a fake budget** (NUC only, nothing on the OptiPlex): [F0-1](tasks/F0-1.md). Antonio reviews the screens in [screens/](screens/). *Status 2026-11-17: F0-1 built and tested on the NUC ([report](tasks/F0-1.report.md)); container image not built (no Docker on the NUC); screens reviewed; changes go into F1-1.*
- **Phase 1, the locked box on the OptiPlex**: [F1-1](tasks/F1-1.md) (the screen changes, then the install, the updater and the Caddy route, all written without touching the real data). Then Antonio updates Actual ([manual step 2](manual-setup.md)) and runs the install ([manual step 3](manual-setup.md)).
- **Phase 2, budget builder** ([decision](decisions/2026-11-17-budget-builder.md)).
- **Phase 3, sharing numbers by permission**: `finance-share`, run only by Antonio on the OptiPlex: picks the least data a request needs (for example category totals, rounded, no payees or dates), shows a preview, and saves it only after he types `yes`.
- **Later, alerts by push**, if Antonio wants them ([decision](decisions/2026-11-17-alerts-in-app.md)).

## Open questions (Antonio decides)

1. ~~Actual's version~~ decided: update to 26.11.0, pinned ([decision](decisions/2026-11-17-actual-26-11.md))
2. ~~Who deploys~~ decided: Antonio does the one-time install, Claude Code runs updates ([decision](decisions/2026-11-17-deploys.md))
3. ~~Budget builder~~ decided: suggestions from his history, written to Actual when he confirms ([decision](decisions/2026-11-17-budget-builder.md))
4. ~~Alerts~~ decided: in the app for now ([decision](decisions/2026-11-17-alerts-in-app.md))
5. ~~Name~~ decided: `finance.home.lan` for now ([decision](decisions/2026-11-17-screens-and-name.md))
6. ~~Screen review~~ decided: Saving section, fold on-track categories, "Not a bill" ([decision](decisions/2026-11-17-screens-and-name.md))
