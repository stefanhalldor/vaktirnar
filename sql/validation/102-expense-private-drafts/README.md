# SQL102 — expense private drafts and known recipients

Stebbi alone runs these files in the production Supabase SQL editor.

1. Run `preflight.sql`. Continue only when `prerequisites_ok = true`, the target relation is null, target functions are empty and no old transaction is present.
2. Run `../../102_expense_private_drafts.sql` once.
3. Run `postflight.sql`. Every boolean must be true and `draft_rows` must be `0` immediately after installation.

SQL102 creates private autosave drafts and a service-role-only atomic wrapper around the existing SQL96 expense create RPC. The wrapper turns a registered person chosen from the actor's Relationships into a consent-gated invited member instead of a guest. It does not backfill existing rows or mutate existing expenses, payments, shares, obligations, repayments, invitations, activity or feature access.
