# The finance app runs from its own repo, like the homelab and the dash

*2026-11-17 · Antonio*

**Decision:** a new private repo, AntonioNegron/finance, shared by Antonio, Claude (chat) and Claude Code. It works like the homelab and dash repos: docs/ is the single source of truth, Claude writes decisions, the plan and tasks, Claude Code on the NUC runs tasks and pushes reports, Antonio's own steps go in [manual-setup.md](../manual-setup.md).

**Why:** Antonio wants Claude Code to build whatever he needs to track his finances without spending much time setting it up himself, and this way of working already runs his other projects.
