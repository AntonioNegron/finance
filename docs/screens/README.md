# Screens (fake budget only)

Every screenshot here shows the **made-up budget** from [../specs/fake-budget.md](../specs/fake-budget.md), never real data. Phone size (390 px wide), light and dark. Retake with `npm run screens` (fake server running).

- **0-login**: the app's own password screen.
- **1-home**: total balance of the counted accounts; this month's spending vs. budget as one bar (spending categories only), with the money left (or over), and one "Saved this month" line; the next three bills; a link to unusual charges.
- **2-spending**: spent vs. budgeted per category this month, over-budget first. Over-budget and in-progress categories show; the rest (nothing spent yet, or right on budget) fold under one "N on track" row. Saving categories follow in their own Saving section. ‹ › switch months (up to 13 months back).
- **2c-spending-open**: the same with the "on track" row tapped open.
- **2b-category**: tapping a category: its transactions this month (here the most over-budget one).
- **2d-saving-groups**: which category groups count as saving (from "Which groups are saving?" on Spending). Guessed from the group name until switched; saved in the app only.
- **3-bills**: recurring charges found from the history plus Actual schedules: next date, amount, total per month. "varies" marks bills whose amount changes (shown as a typical amount); a yellow tag flags a price increase. "Not a bill" hides a false alarm (saved in the app only).
- **3b-bills-hidden**: after "Not a bill" on Cinema 8: it moves to a Hidden list at the bottom, out of the total and Home, with Undo.
- **4-unusual**: possible duplicates, charges much larger than usual at a payee, and new payees with a big first charge (last 45 days). "Fine" hides the warning; saved in the app only, never in Actual.
- **5-accounts**: balance per account, on and off budget; the switch leaves an account out of every total (saved in the app only). Log out at the bottom.

Pull down on any screen (or tap ↻) to sync now. "Last synced" shows on every screen. If Actual's server version isn't the app's `@actual-app/api` version, a yellow banner under the title says so on every screen (not pictured: the fake server matches).
