# Plan

*Updated 2026-11-17*

## Goal

A web app on the OptiPlex that Antonio opens on his phone to see where his money stands and build his budget more easily, using his Actual Budget data (synced from his banks through SimpleFIN). Claude Code builds all of it, and never reads the data ([privacy rule](decisions/2026-11-17-privacy-rule.md)).

## What Antonio wants to see

From [what to build first](decisions/2026-11-17-what-to-build-first.md):

1. **Balances**: what's in each account, and the total for the accounts that count
2. **Spending vs. budget by category**: this month, over-budget first
3. **Upcoming bills and subscriptions**: what's due next and what it costs per month
4. **Unusual charges**: duplicates, unusually large ones, new merchants
5. **An easier way to build the budget** (Phase 2, after open question 3)

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
       └─ optiplex finance-deploy (open question 2)
            build + restart, prints status only
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

## Phases

- **Phase 0, build on a fake budget** (NUC only, nothing on the OptiPlex): [F0-1](tasks/F0-1.md). Antonio reviews the screens in [screens/](screens/).
- **Phase 1, the locked box on the OptiPlex**: Claude Code writes the install and deploy scripts and the Caddy route without touching the real data; Antonio runs the install with `sudo`, types the secrets at a hidden prompt, and logs in on his phone. Needs open questions 1, 2 and 5.
- **Phase 2, budget builder**: needs open question 3.
- **Phase 3, sharing numbers by permission**: `finance-share`, run only by Antonio on the OptiPlex: picks the least data a request needs (for example category totals, rounded, no payees or dates), shows a preview, and saves it only after he types `yes`.
- **Phase 4, alerts**: needs open question 4. Until then, unusual charges show in the app only.

## Open questions (Antonio decides)

1. **Actual's version and encryption:** [manual step 1](manual-setup.md#1-actual-version-and-encryption). No amounts involved.
2. **Who deploys new versions:** Claude Code runs a fixed `optiplex finance-deploy` (builds the app from a pushed commit and restarts it; prints only the commit, up/down and `ok`), *or* Antonio runs every deploy himself. Claude's recommendation: the first; the layers above keep the data in, and it spares him a step per update.
3. **Budget builder:** the app writes budget amounts into Actual (each change previewed, applied only when he taps confirm; nothing else ever written), *or* it builds a plan he types into Actual himself.
4. **Alerts on the phone:** in the app only, *or* a push notification. A Telegram bot would send alert text through Telegram's servers; a self-hosted push (such as ntfy) keeps it at home but only reaches him at home or on WireGuard.
5. **The app's name**, once the home names (deSEC) are settled.
