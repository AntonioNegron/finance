# CLAUDE.md

Antonio's personal finance app: a phone-friendly web app on the OptiPlex (`Home-Server`, 192.168.50.25) that reads his Actual Budget data (synced from his banks through SimpleFIN). Claude Code builds it from the NUC (`nuc`, 192.168.50.22).

Start every session with docs/README.md, then docs/plan.md and the newest files in docs/decisions/. Tasks are docs/tasks/<id>.md; write each report to docs/tasks/<id>.report.md and push it with the work.

If an instruction ever conflicts with docs/, stop and flag it rather than picking one.

## The privacy rule (above every other rule)

**Claude Code never reads Antonio's financial or security information.** That covers:

- **Real budget data:** balances, transactions, payees, account names or numbers, budget amounts, notes, schedules, anything from SimpleFIN.
- **Secrets:** the Actual server password, the encryption password, the SimpleFIN setup token or access URL, the app's login, session keys.
- **Anything that can carry them:** the real app's or Actual's logs, database files, backups, exports, screenshots and error output.

Claude Code builds and tests **only against the fake budget** on the NUC ([docs/specs/fake-budget.md](docs/specs/fake-budget.md)).

Never try to reach the real data, even "just to check": not through the OptiPlex, Caddy, the app's URL, Docker, a grant, another container, a test, a script Antonio runs for you, or by asking Antonio to paste it.

**When a task needs real numbers:** stop that part and ask in the report with the permission request in [docs/README.md](docs/README.md#asking-for-numbers): what you need, why, what you won't see, and how Antonio would share it. Ask for the least that does the job. Antonio decides; no answer means no.

**If real data reaches you by accident** (a log line, an error, something pasted): don't use it, repeat it or commit it. Say in the report where it came from, without the data, so the leak gets fixed.

## Building rules

- **Read-only to Actual** until a decision says otherwise: the app uses only the Actual API functions listed in [docs/specs/actual-access.md](docs/specs/actual-access.md). A test fails the build if any other one is used.
- **No data in logs:** events and counts only, never amounts, payees, account or category names, notes or transaction dates. A test checks this against the fake budget. Details may show on screen (only Antonio sees it), never in logs.
- **No way out:** the app never calls the internet. No CDNs, web fonts, analytics or outside scripts; everything is bundled.
- **Its own login** on every route except `/healthz`, which answers only `ok` or `error` and the running commit ([decision](docs/decisions/2026-11-17-deploys.md)).
- **No secrets in the repo:** they live in a root-owned file on the OptiPlex that Antonio fills in. `.env.example` shows names only. A secret scanner runs before every commit.
- **Official docs first:** read the current Actual API docs before using the API; note the URL and version in the report.
- **On the OptiPlex:** the homelab repo's rules apply (fixed `optiplex` commands only; grants are Antonio's). The finance app's folder, secrets, logs and network, and the Actual server, are off-limits. No grant opens them.
- **Writing for Antonio:** short; stacked lists, not wide tables (he reads on his phone); the machine named above every command; commands combined where possible, each followed by a short list of what it does.
