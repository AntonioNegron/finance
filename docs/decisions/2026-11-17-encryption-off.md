# Actual's end-to-end encryption is off; the app needs no encryption password

*2026-11-17 · Antonio · from manual step 1*

**Decision:** Antonio's budget has end-to-end encryption off. Actual's Settings shows the "Enable encryption" button greyed out, with the message that encryption isn't available over an unencrypted connection to a remote server and needs HTTPS. Phase 1 sets up the app without an encryption password. The setting stays optional in the app, so turning encryption on later (once Actual is opened over HTTPS) only adds one secret.

**Why:** that's how his server is set up today; nothing to change for the app.
