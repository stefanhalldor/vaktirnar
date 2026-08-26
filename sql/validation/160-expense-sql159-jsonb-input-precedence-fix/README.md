# SQL160 SQL159 JSONB input precedence forward-fix

SQL160 corrects only the six nested JSONB subtraction expressions inside
`public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)`. PostgreSQL
otherwise parses the unparenthesized `member.value->'input' - ARRAY[...]`
shape as invalid JSON and raises `22P02` before a private draft can be shared.

The migration performs a hash-guarded `CREATE OR REPLACE FUNCTION`. It changes
no signature, owner, language, volatility, `SECURITY DEFINER`, `search_path`,
ACL/grants, table, row, RLS policy, trigger or financial state. The separately
planned predecessor-writer hardening is now SQL161, not part of this fix.

No SQL in this bundle was run by Codex and Codex did not connect to Supabase.

## Manual rollout

Use a fresh Supabase SQL Editor session with
`current_user = session_user = postgres`:

1. Run `preflight.sql`, which is 100% read-only.
2. Run `../../160_expense_sql159_jsonb_input_precedence_fix.sql` exactly once
   only when `prerequisites_ok = true`.
3. Run `postflight.sql`, which is 100% read-only, and require
   `postconditions_ok = true`.

No PostgREST schema-cache reload is required because the function signature and
permissions do not change. If the migration response is lost, do not rerun it.
Open a fresh session and rerun only `preflight.sql`: `exact_installed = true`
with `operator_state_ok = true` means skip the migration and run postflight.
Any other state is a stop for review.

`recovery.sql` is a separately approved exact reverse patch. It changes no
data, but intentionally restores the known share failure, so use it only for
an unforeseen regression attributable to SQL160. Prefer leaving SQL160 in
place. Recovery requires its own post-recovery verification against the
preflight predecessor state.

## Localhost checks for Stebbi

After Stebbi has separately approved and manually completed the SQL160 rollout:

1. Keep the existing private draft; do not recreate it.
2. Open `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=8aedf0bb-f994-4cd0-8541-5015a66084df`
   while authenticated as its author.
3. Confirm the author and the existing second participant remain selected.
4. Leave `Þetta er rétt skipting` unchecked and press `Deila drögum`.
5. Expect the pending state to finish without `22P02`, the draft to move from
   `Drög fyrir mig` to the shared lifecycle, and no active financial Expense
   to be created.
6. Refresh and confirm the shared state persists. Verify only with consenting
   closed-beta accounts; do not add real recipients or finalize financial
   state casually.
