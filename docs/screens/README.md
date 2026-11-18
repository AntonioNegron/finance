# Screens (fake budget only)

Every screenshot here shows the **made-up budget** from [../specs/fake-budget.md](../specs/fake-budget.md), never real data. Phone size (390 px wide), light and dark. Retake with `npm run screens` (fake server running).

- **0-login**: the app's own password screen.
- **1-home**: total balance of the counted accounts; this month's spending vs. budget as one bar, with the money left (or over); the next three bills; a link to unusual charges.
- **2-spending**: spent vs. budgeted per category this month, over-budget first; ‹ › switch months (up to 13 months back).
- **2b-category**: tapping a category: its transactions this month (here the most over-budget one).
- **3-bills**: recurring charges found from the history plus Actual schedules: next date, amount, total per month. "varies" marks bills whose amount changes (shown as a typical amount); a yellow tag flags a price increase.
- **4-unusual**: possible duplicates, charges much larger than usual at a payee, and new payees with a big first charge (last 45 days). "Fine" hides the warning; saved in the app only, never in Actual.
- **5-accounts**: balance per account, on and off budget; the switch leaves an account out of every total (saved in the app only). Log out at the bottom.

Pull down on any screen (or tap ↻) to sync now. "Last synced" shows on every screen.
