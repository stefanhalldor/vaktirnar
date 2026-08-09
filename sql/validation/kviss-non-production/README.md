# Kviss SQL115–116 non-production runbook

This runbook is for a newly chosen **non-production Supabase project only**.
It does not authorize an apply. Record the project name and project ref in the
test handoff before running anything, and verify that neither value belongs to
production.

There is no non-production Supabase project available as of 2026-08-09. Do not
use this runbook against the sole production project. The current production
gate is documented separately in the SQL115 and SQL116 validation READMEs.

## Stop conditions

- Stop if the target identity is uncertain or the project ref is production.
- Stop if SQL100–114 migration history for the chosen target is unknown. SQL115
  does not technically depend on those files, but migration ordering must be
  recorded before a numbered migration is applied.
- Stop if any `*_collision` column in a preflight is non-null on a target that
  is expected to be clean.
- Stop if a required dependency or pgcrypto procedure is null.
- Do not run either `recovery.sql` unless an empty-beta destructive rollback is
  separately approved.

## Apply and verification order

1. In the named non-production SQL editor, run
   `sql/validation/115-kviss-authoring/preflight.sql`. Save the complete output.
2. Confirm the three dependencies and `ensure_personal_space()` exist, all
   collision values are null, and the `feature_access` check constraint is the
   expected existing union.
3. With separate apply approval, run `sql/115_kviss_authoring.sql` as one unit.
   It contains its own transaction and timeouts.
4. Run `sql/validation/115-kviss-authoring/postflight.sql`. It must return one
   row with every `*_ok` field true. The service role should have direct SELECT
   only and all authoring mutations should remain behind RPCs.
5. Run `sql/validation/116-kviss-live/preflight.sql`. SQL115 dependencies and
   all three pgcrypto procedures must be non-null; all collision values must be
   null.
6. With separate apply approval, run `sql/116_kviss_live.sql` as one unit.
7. Run `sql/validation/116-kviss-live/postflight.sql`. It must return one row
   with every `*_ok` field true, no browser grants and SELECT-only direct
   service table access. The participant heartbeat must remain behind its RPC.

If SQL116 fails, preserve SQL115 and investigate the failing statement; do not
run broad cleanup. The SQL116 transaction rolls itself back. If SQL115 fails,
its transaction also rolls itself back.

## App test setup

Point a local test environment at this non-production project and set:

- `AUTH_MVP_ENABLED=true`
- `KVISS_ENABLED=true`
- `KVISS_REALTIME_ENABLED=false` for the first authoritative polling pass
- the non-production Supabase URL, anon key and service-role key
- `AUTH_CODE_SECRET` with at least 32 characters

Create an explicit `feature_access` row with `feature_key = 'kviss'` for the
test host through the authenticated admin control. Do not copy production user
or quiz data into the test project.

## Functional smoke test

1. Sign in as the entitled host and open `/auth-mvp/kviss`.
2. Create a question, edit it once, and create a quiz from its current revision.
3. Create a live session with no password. Open `/kviss/{CODE}` in a private
   window, join, and confirm the host sees the participant within about 5 s.
4. Open a question, answer once, retry the same answer command, reveal it, show
   the leaderboard and end the session. Before reveal, inspect the participant
   session response and confirm it contains neither correct-answer indices nor
   leaderboard results.
5. Send more than 100 chat messages only with generated test data if load
   testing is explicitly approved; otherwise verify two messages and their
   order. Public mutation responses must contain only `{ "ok": true }`.
6. Repeat with a password-protected session and verify a wrong password is a
   generic failure. Do not deliberately trigger broad rate limits on a shared
   environment without coordination.
7. Enable `KVISS_REALTIME_ENABLED=true` only after the polling pass. Confirm
   Broadcast merely accelerates refresh and that disabling it leaves the flow
   functional.

Record timings for join, host participant refresh, answer, reveal and
leaderboard. The current repository implementation is intended for beta-scale
testing; participant-count/load limits must be measured before a broad public
event.
