# Start here

This folder is the finance app's single source of truth. Antonio, Claude (chat) and Claude Code all work from it. If something isn't written here, it isn't decided.

Read this file, then [plan.md](plan.md), then the newest files in [decisions/](decisions/), before doing anything. The privacy rule in [../CLAUDE.md](../CLAUDE.md) comes before everything else.

## Where things are

- **[plan.md](plan.md)**: the goal, what Antonio wants to see, the target setup, the guardrails, the phases, open questions. *Claude.*
- **[decisions/](decisions/)**: one file per decision: date, what, why, sources. *Claude.*
- **[specs/](specs/)**: one file per feature or piece when it needs more than the plan says. *Claude; Claude Code fills in what its tasks build.*
- **[tasks/](tasks/)**: each Claude Code task (`<id>.md`) and its report (`<id>.report.md`). *Claude writes the task, Claude Code the report.*
- **[manual-setup.md](manual-setup.md)**: every step only Antonio can do, in order, done together with Claude in chat. *Claude.*
- **[screens/](screens/)**: screenshots of the app **with the fake budget only**, so Antonio can review the design. *Claude Code.*

## How work flows

1. Antonio and Claude decide in chat.
2. The same turn, Claude writes the decision to `decisions/`, updates `plan.md`, and commits.
3. When something needs building, Claude writes the task to `tasks/<id>.md` and commits it.
4. Antonio tells Claude Code on the NUC: "Run finance/docs/tasks/<id>.md".
5. Claude Code does the task start to finish, commits the work and `tasks/<id>.report.md`, and pushes.
6. Claude reads the report from the repo, updates `plan.md`, and brings anything that needs a decision to Antonio.

## Rules for all three of us

1. **The privacy rule first.** Nobody but Antonio sees real financial data or secrets, unless he approves a specific request ([below](#asking-for-numbers)).
2. **Nothing assumed.** Every fact in a task comes from these docs, a report, an official doc or a command's output. Anything else is a question for Antonio or a "check and report" step.
3. **Write decisions down the same day,** in `decisions/`, with the reason.
4. **Causes only from evidence:** a log, a command's output, a reproduction, never real data. Say what is confirmed and what isn't.
5. **Tasks run unattended.** Claude Code never waits on Antonio mid-task. Anything that needs sudo, a grant, his phone or real data: finish everything else and put the exact steps in the report.
6. **Writing for Antonio:** short; stacked lists, not wide tables; the machine named above every command; commands combined where possible, each followed by a short list of what it does.

## Asking for numbers

When Claude Code or Claude needs anything from the real budget, even a total, it asks first, in this form, and does nothing until Antonio answers:

```
PERMISSION REQUEST
Need:      monthly totals per category group, last 3 months, rounded to $10
Why:       to suggest starting budget amounts
Won't see: payees, accounts, single transactions, dates, balances
How:       Antonio runs `finance-share <options>` on the OptiPlex,
           checks the preview, and shares it only if he agrees
```

Until `finance-share` exists (Phase 3), the "How" says exactly what Antonio would copy and from where, and he decides.

## Writing a task (Claude)

A task file says everything Claude Code needs: context (which docs to read), what it may and may not touch, the decisions to build exactly, verify steps, rollback, the report list, and the docs to update. Name tasks by phase: `F0-1`, `F1-1`, ...

## Writing a report (Claude Code)

`tasks/<id>.report.md`: commits, what was done, versions and official doc URLs used, test results, anything not done and why (with the exact steps Antonio needs), implementation calls the task didn't spell out, and every doc change. Never any real data.
