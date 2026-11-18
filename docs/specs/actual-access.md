# What the app may call in Actual

The app may use only the `@actual-app/api` functions listed here. A test (`test/allowed-functions.test.ts`) reads the **Allowed** list below and fails the build if code in `app/` uses any other, or imports the API anywhere but `app/src/actual.ts`.

Checked against the official reference, `https://actualbudget.org/docs/api/reference`, for `@actual-app/api` 26.11.0 (F0-1, 2026-11-17).

## Allowed

Connect and sync:

- `init`: open the connection to the Actual server (server URL, password, the app's data folder).
- `downloadBudget`: download the budget by its sync ID (and the encryption password, if it is on) into the app's own data folder.
- `sync`: pull the latest changes from the server, on the timer and on pull-to-refresh. The app makes no local changes, so nothing is pushed back.
- `shutdown`: close the budget cleanly when the app stops.

Read:

- `getAccounts`: the account list (name, on/off budget, closed) for Home, Accounts and the "count in totals" switches.
- `getAccountBalance`: each account's balance, for Home and Accounts.
- `getCategoryGroups`: group names, shown under each category on Spending.
- `getCategories`: categories, to split spending by category and tell income from expenses.
- `getPayees`: payee names, and which payees are transfers (left out of bills and unusual charges).
- `getTransactions`: the last 13 months per account, for Spending, Bills and Unusual.
- `getBudgetMonths`: which months have a budget, for the month switcher.
- `getBudgetMonth`: the budgeted amount per category in a month, for Home and Spending.
- `getSchedules`: Actual's scheduled bills, merged into Bills.

## Rules

- **Connect and sync:** only what's needed to open the budget and pull the latest changes.
- **Read:** accounts, balances, categories, budget months, transactions, payees, schedules: only what a screen needs.
- **Never, until a decision allows it:** any function that creates, changes, deletes, imports or runs bank sync. The budget builder (Phase 2) will add only what its decision allows.
- **Not used, though read-only:** `aqlQuery`/`runQuery` (a general query could read anything; the named functions above are enough), `exportBudget` (a full copy of the budget), `getNote`, `getRules`, `getTags`, `getPreferences`, `getServerVersion`. Adding one needs this list changed first.

The fake-budget seed script (`dev/seed.ts`) is exempt: it writes the fake budget with `runImport`, `createAccount`, `createCategoryGroup`, `createCategory`, `addTransactions`, `setBudgetAmount` and `createSchedule`, against the fake server only.
