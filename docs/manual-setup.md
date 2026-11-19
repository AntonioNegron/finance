# Manual setup: Antonio's steps

Everything only Antonio can do, in order. We go through it together in chat: Claude gives the steps for one section at a time and checks the result before the next. Mark each section **done** with the date.

None of these steps shares an amount, a payee or a password with anyone.

## 1. Actual version and encryption

*Status: done 2026-11-17. Client and server v26.4.0 (26.11.0 offered); end-to-end encryption off.*

## 2. Update Actual to 26.11.0, pinned, logs out of Dozzle

*Needs: 1. Status: to do. [Decision](decisions/2026-11-17-actual-26-11.md); logs: [F1-1 report](tasks/F1-1.report.md#dozzle-and-actuals-logs-antonio-decides), option 1*

1. **Backup:** in Actual, Settings → **Export data**; keep the file on your laptop or phone.
2. **OptiPlex:**
   ```
   cd /opt/actual && f=$(ls docker-compose.y*ml compose.y*ml 2>/dev/null | head -1) && s=$(sudo docker compose config --services | head -1) && o="${f%.y*ml}.override.yml" && [ ! -e "$o" ] && sudo cp "$f" "$f.bak-$(date +%F)" && printf 'services:\n  %s:\n    logging:\n      driver: syslog\n      options:\n        syslog-address: unixgram:///dev/log\n        tag: "{{.Name}}"\n        cache-disabled: "true"\n' "$s" | sudo tee "$o" >/dev/null && sudo sed -i 's#actualbudget/actual-server:latest#actualbudget/actual-server:26.11.0#' "$f" && sudo docker compose config | grep -q "actual-server:26.11.0" && sudo docker compose config | grep -E "image:|driver:" && sudo docker compose pull && sudo docker compose up -d && sudo docker compose ps
   ```
   - finds Actual's compose file and its service, and saves a copy of the file
   - adds a small override file that sends Actual's logs to the OptiPlex's journal only (Dozzle and `docker logs` can't read them)
   - changes the image from `latest` to `26.11.0`, and stops before downloading anything if that didn't take
   - shows the image and log driver, downloads 26.11.0, restarts Actual and shows it's up
   - Actual's logs afterwards: `sudo journalctl -t <container name> -n 50`
   - undo: `sudo rm <override file>`, restore the `.bak` copy, `sudo docker compose up -d`
3. **Check:** Actual's Settings shows client and server **v26.11.0**; your budget and accounts look as before; bank sync still works.
4. Tell Claude: done, or the error.

## 3. Install the locked box on the OptiPlex

*Needs: 2 done. Status: to do. Written by [F1-1](tasks/F1-1.report.md). About 15 minutes.*

You need: a terminal on the OptiPlex (SSH from your laptop is fine), GitHub open in a browser, your Actual password, and your phone.

1. **OptiPlex**, paste this one line and press Enter (your sudo password when asked):

   ```
   f=$(mktemp) && echo 'H4sIAAAAAAACA21Va08iSRT93r/iTo0RTazGR1gjDmQRQVxHMMLsZndnY5ruC12hqGqrqkVmxv++t7oB0UjCo6vu89xzD58/VcdCVceRTYPPcBdZhzxSCTe5Aq3ApQiDzIk7ic+wEC4Fmyc6hNtohhYiMBglXCu5hAQzqZcww+UBLCLhLIVbpEIiLHUOUZKAcD7ilXC9fHwAsdSKQvgEK9exiVScgtNQ1ZmrToSiZ6xaEwNVROGoptJBKOsiKWFi9JzChoFFBxxzDZnIcBIJGVw0dn52r/utfrvzcNEadup8O+hLcN+5G2yZ+Mc6nwr3O73TfBzGel5vKaeV0H2cGq3WriEZvAT/AtvZEwnwfJ9BAw7hP/j1C34CxqkGdk/gbcBi0Nw9Pgd8pv6PzuElwGeM4eQLe80+Gv1N9SX4VHVu+cICMYFPQBXMqW/gT0ApoVncq5zapkxvrq1NOeE+RbVlde6RUhBljk8JnTVkfAn8sQioM1TeM5YClXvjORFBPo/sDA5PT4P5LBEGeEYdXzDY3QVqcaHAaO3q/mPrfK4TOK3VihOaVznqioUsH0thU0wg1dZ5jsBeomMbvoJ9AGxjPhz2ChtCfIomM0I5y/bDoAC38upTNI7Jca12dAYterVP+j+i9pH85/L6qD/q1PzZ9eD28VHN/vxh5ofD5Oq3bwP9ePPVRuNpr9Y+07O/xGGSHsuzq5s/ZAWaVHp1pqjBB1+qZTRpPvENVUuWeqBZOe0t2AlS7mBdCu9DpQK8DZWeniMfonlCAyv+VD6IR5TItHFwdT16oOYf2oPb21b/ssEoBXABb6yBa7hOaGTCCbQD2r3GkhaJTofOiNj1qO4bXLZTjGcE4Prym0Vz4xvz97ZLi9l432pOMWXBDWm5wbl26DtjO3472HpNt4h43NwlRic6gIL4qy9gLdp2lwpbTHGz83X4cKGgCUN0jkq19PNyIyP+yQd6FRa2STASTmIdPoA3hK8YPSF8Zy0p9QIWRlAXURyjtd8ZDLrdkL2WG0fu3SxC4uqWgdc34CX97wzFgI5ylG3hd0s4IispG/F6r+2MpImTeFmns/0wDIHBl92TICGZK5m7InhRTOZKJfMZi30nmiVFKSR3Vb8XRLJyhakKPxIKvrpmMEFHQkmj0UZMhVpDRDv43jL2LNC5KxjKE3QROXY7o3bvoddpXQYoLa4SFIJc2q2UeBWWc0vDkbg+XvNhnSQguSg1gd+/lYWyhvfSUDoVKuj/djZdl+mqK6UKbcqC/wG07+aBngYAAA==' | base64 -d | gunzip >"$f" && echo "bd41e5f28607ec5e73eb2d67949f0347a87937c13ff09417f5292fb26f6a13df  $f" | sha256sum -c --quiet && sudo bash "$f"; rm -f "$f"
   ```
   - unpacks the bootstrap script, checks it wasn't cut off (if it was, it stops with "FAILED" and runs nothing), and runs it
   - makes a read-only key for the finance repo in `/opt/finance` and prints it

2. **GitHub**, add the key it printed (the line starting `ssh-ed25519`):
   - AntonioNegron/finance → Settings → Deploy keys → Add deploy key
   - Title: `Home-Server finance`; paste the key; leave **Allow write access** off; Add key
   - back in the terminal, press Enter. If GitHub doesn't take it yet, it shows the key again: check and press Enter again.

3. **Wait** while it builds the app (a few minutes the first time).

4. **Answer the prompts.** Nothing you type is shown:
   - **Actual server password**, twice: the one you log in to Actual with
   - **New password for this app**, twice, at least 12 characters: save it in your password manager; the app asks for it on your phone (about once a month)
   - **Budget Sync ID** (shown as you type; it isn't secret): in Actual, Settings → Show advanced settings → Sync ID

5. **What you should see at the end:** a list under "Installed:", then "The app is up and synced with Actual", then the next steps.
   - If it says "hasn't synced with Actual yet": check Actual is up and the Sync ID is right, then look at `sudo journalctl -t finance-app -n 20` (events only, no numbers). To retype the passwords: `sudo bash /opt/finance/src/deploy/install.sh`

6. **Phone:** open `https://finance.home.lan`
   - log in with the home login, then the app password
   - Accounts tab: switch off the accounts that aren't yours
   - Spending → "Which groups are saving?": check the groups it guessed

7. Tell Claude: done, or the error message. Please don't paste screenshots of the app or its numbers.

**To undo it all**, on the OptiPlex: `sudo bash /opt/finance/src/deploy/uninstall.sh`
- removes the app, the timer and the `finance` user; asks before deleting `/opt/finance`
- then delete the deploy key on GitHub (Settings → Deploy keys)
