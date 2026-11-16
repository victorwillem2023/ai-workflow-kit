# Signers

Who may sign off a change to the sensitive files (`sensitive.paths`): each person's public key, written by
`npm run signoff -- --init` (the first signer) or `npm run signoff -- --add-signer` (by an existing signer, who endorses the new one),
never by hand. The gate trusts only the signers on main, so a key added in a change counts once that change is there. The private
keys never come here: each stays on its owner's computer, encrypted with their passphrase. Read workflow/guides/SENSITIVE.md.

| Who | Public key | Added | Endorsed by |
|---|---|---|---|
