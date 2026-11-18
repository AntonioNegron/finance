# What the app may call in Actual

The app may use only the `@actual-app/api` functions listed here. A test fails the build if the code uses any other.

*F0-1 fills in this list from the official API reference: the connect and sync functions, the read functions each screen needs, and why each one is needed.*

## Rules

- **Connect and sync:** only what's needed to open the budget and pull the latest changes.
- **Read:** accounts, balances, categories, budget months, transactions, payees, schedules: only what a screen needs.
- **Never, until a decision allows it:** any function that creates, changes, deletes, imports or runs bank sync. The budget builder (Phase 2) will add only what its decision allows.
