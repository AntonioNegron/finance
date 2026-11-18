# Manual setup: Antonio's steps

Everything only Antonio can do, in order. We go through it together in chat: Claude gives the steps for one section at a time and checks the result before the next. Mark each section **done** with the date.

None of these steps shares an amount, a payee or a password with anyone.

## 1. Actual version and encryption

*Needs: nothing. For: Phase 1 (the API package must match the server). Status: encryption done 2026-11-17 (off); version to do*

Phone or laptop, open Actual (`budget.home.lan`, or `192.168.50.25:5006`) → **Settings**:
1. Note the **version numbers** Settings shows (the app and the server)
2. Find the **encryption** section and note whether end-to-end encryption is **on or off**
3. Tell Claude in chat: the version(s) and on/off. Nothing else.

## 2. Install the locked box on the OptiPlex

*Needs: 1, Phase 1's task done. Status: Phase 1 writes the exact steps*

You'll run one `sudo` command, type the Actual password and a new app password at a hidden prompt, then open the app on your phone and log in.
