# Manual setup: Antonio's steps

Everything only Antonio can do, in order. We go through it together in chat: Claude gives the steps for one section at a time and checks the result before the next. Mark each section **done** with the date.

None of these steps shares an amount, a payee or a password with anyone.

## 1. Actual version and encryption

*Status: done 2026-11-17. Client and server v26.4.0 (26.11.0 offered); end-to-end encryption off.*

## 2. Update Actual to 26.11.0, pinned

*Needs: 1. Status: to do. [Decision](decisions/2026-11-17-actual-26-11.md)*

1. **Backup:** in Actual, Settings → **Export data**; keep the file on your laptop or phone.
2. **OptiPlex:** change the image from `latest` to `26.11.0` in Actual's compose file, pull and restart (Claude gives the exact command in chat).
3. **Check:** Actual's Settings shows client and server **v26.11.0**; your budget and accounts look as before; bank sync still works.
4. Tell Claude: done, or the error.

## 3. Install the locked box on the OptiPlex

*Needs: 2, [F1-1](tasks/F1-1.md) done. Status: F1-1 writes the exact steps here*

In short: paste one small bootstrap command, add the key it prints to the GitHub repo as a read-only deploy key, type the Actual password, a new app password and the budget's Sync ID at the prompts, then open `https://finance.home.lan` on your phone, log in, and switch off the accounts that aren't yours.
