# SQL121 — recipient-scoped UL invitation preview

This function-only migration adds a bounded preview for one exact expense and
wraps the existing SQL113 invitation response so an accepted response can
return that exact expense id. It changes no ledger rows, RLS policies, table
grants, auth users, or payment-profile data.

Stebbi alone runs Supabase SQL. Run `preflight.sql`, require
`prerequisites_ok = true`, all collisions null, and no old transaction. Then
run `121_expense_member_invitation_preview.sql` once and `postflight.sql`.
Every `*_ok` postflight value must be true. Do not retry an apply error blindly.

The preview is executable only by service_role, checks the authenticated
actor's canonical invitation email, pending/unexpired lifecycle, and resolves
only a shared-expense pointer or a one-off group with exactly one active
expense. It returns display names and amounts but no emails, user/member ids,
payment instructions, private relationship labels, or unrelated ledger data.

`recovery.sql` is a manual, transactional function-only rollback. It restores
the preserved SQL113 responder and removes the preview/helper. It should not be
run merely because application rollout is paused; leaving the additive
contract unused is safer.

## Localhost checks for Stebbi

SQL121 must not be tested against production casually. After Stebbi has
explicitly applied SQL121 and the app is running locally with the intended
environment, open a pending invitation using its recipient account. Confirm
that only the exact expense title/description, payers, participants and shares
appear; accepting opens that exact expense. A wrong account, expired invite,
ordinary multi-expense group, unknown link, or already answered invite must not
show preview data.
