# SQL116 validation

SQL116 is the database authority for live sessions. Passwords are hashed with
pgcrypto; participant capabilities are stored only as digests; answers,
timestamps, correctness, idempotency and late team assignment remain
server-side. No browser role receives table, column, function or sequence
access. Password validation is capped at bcrypt's 72-byte input limit in both
the app and SQL boundary.

SQL115 was applied to Stebbi's production project on 2026-08-09 and its full
postflight row was green with zero authoring rows. No SQL116 file has been run
by Codex. Stebbi alone runs every database command under `WORKFLOW.md`.

Before SQL116, Stebbi runs `preflight.sql` manually and shares its complete
single result row. Stop unless `sql115_contract_ok=true`,
`target_objects_absent=true`, `prerequisites_ok=true`, both collision arrays
are empty, all dependency objects are present, the two role capability fields
are true and the long-running transaction count is zero.

The migration is one-time and collision-guarded. Personal-space or auth-user
deletion cascades through the host's sessions. A command written by a future
co-author is retained but its deleted `actor_user_id` is set to null. The
service role receives direct `SELECT` only on live tables. Every live write,
including a database-timestamped and 30-second-throttled participant heartbeat,
uses one of the six SECURITY DEFINER RPCs. The identity sequence has no direct
service-role grant.

After a separately approved SQL116 apply, Stebbi runs `postflight.sql`
immediately and shares its complete single row. Every `*_ok` field must be
true, `transactions_older_than_five_minutes` must be zero and all seven row
counts should be zero before the first live-session test.

The old `../kviss-non-production/README.md` remains a runbook for a future,
explicitly named non-production project. No such project currently exists, so
it is not part of the present production sequence.
