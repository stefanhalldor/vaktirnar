# SQL174 Event `shared` JSONB precedence forward-fix

## Findings

The read-only dashboard diagnostic returned `private_adapter_exception` with
SQLSTATE `22P02` while the exact SQL172 lineage was installed. The failure is
not evidence that any Expense row disappeared.

The frozen SQL159 normalizer still contains two Event-source expressions:

```sql
candidate.value->'shared' - ARRAY[...]
```

PostgreSQL binds this unparenthesized expression incorrectly and tries to parse
the literal `shared` as JSONB, raising `22P02` when an Event-linked draft reaches
that validation statement. SQL160 already fixed the identical issue for six
`member.value->'input'` expressions, but its exact replacement token did not
match these two `candidate.value->'shared'` expressions.

SQL174 completes that repair by changing exactly those two tokens to:

```sql
(candidate.value->'shared') - ARRAY[...]
```

This explains both observed symptoms: sharing an Event-linked draft failed, and
the SQL172 dashboard fail-closed envelope hid every otherwise valid row after
the same private-draft adapter raised the uncontained `22P02`.

## Safety boundary

The migration changes only the body of
`public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)` with one
hash-guarded `CREATE OR REPLACE FUNCTION`. It preserves the function OID,
signature, owner, language, volatility, `SECURITY DEFINER`, `search_path`, ACL,
comment and dependency catalog shape. It also proves that the exact SQL172
dashboard target and private adapter remain byte-for-byte unchanged.

It does not insert, update, delete, redact, cancel or otherwise mutate an
Expense or any other application row. It changes no table, RLS policy, grant,
auth state, secret, deployment setting or financial state. No data cleanup is
needed or permitted.

The predecessor normalized-body MD5 is
`18a6e628bdb1d3c175b515541ab56787`. The installed SQL174 body MD5 is
`9d703deec837fbffed4add9cf8b97b56`. The transformation has exactly two forward
replacements, exactly two reverse replacements and a four-byte UTF-8 delta.

Historical SQL160–SQL172 validators or recoveries that pin the predecessor
helper hash, and the already-run frozen SQL174 runtime diagnostic, are
historical evidence; after SQL174 they are not current-state postflight or
recovery tools. In particular, never try SQL160 recovery against the SQL174
installed hash; its exact drift gate should reject that state.

This candidate had no working disposable PostgreSQL/`psql` harness, so the new
SQL and PL/pgSQL were statically checked only. Codex executed no SQL and did not
access Production or Supabase. The rollback-only rehearsal below is the live
parser/catalog proof that must pass before the permanent install.

## Manual Production rollout

Stebbi remains the sole manual Production SQL operator. Use a fresh Supabase SQL
Editor tab as `postgres` for each step. Run only the linked artifact, without
appending another statement.

1. Run `preflight.sql`. Continue only when every contract/ACL/dependency and
   consumer flag is `true`, `installation_state = PREDECESSOR_READY`,
   `operator_state_ok = true` and `prerequisites_ok = true`.
2. Run `rehearse-migration.sql`. Its expected result is a controlled PostgreSQL
   error with SQLSTATE `P1740`. Continue only when its JSON says
   `rehearsal_pass = true`, `installation_rolled_back = true`, both expression
   flags are `true`, `consumers_unchanged = true`, and `failure_sqlstate = null`.
   The forced exception proves that the temporary function replacement rolled
   back. The rehearsal reads no application table and calls no application
   function.
3. Run `../../174_expense_sql159_event_shared_precedence_fix.sql`. Expected:
   `Success. No rows returned.` It is idempotent for the exact installed state.
4. Run `postflight.sql` unchanged. It is 100% catalog-only and requires no User
   UID. Continue only when every flag, including `postconditions_ok`, is `true`.
   Return the complete one-row result.

If preflight reports `EXACT_INSTALLED`, skip rehearsal and migration and run only
postflight. Any other state, PostgreSQL error, timeout, missing output, false
flag or malformed result is `STOP`. Never run recovery automatically.

No PostgREST schema-cache reload is expected because the function OID and
signature do not change.

Do not rerun the frozen `174-expense-dashboard-runtime-diagnostic` after this
install. It intentionally requires the predecessor SQL159 source hash and must
therefore stop once this forward-fix is installed. Runtime product proof is the
separate authenticated UI check below, not part of mandatory SQL postflight.

`recovery.sql` is a separately approved exact reverse patch. It intentionally
restores the known Event-linked `22P02` failure and exists only for an unforeseen
regression proven to come from SQL174. It is not application-data recovery. If
separately approved, run recovery by itself under normal autocommit. It accepts
only `EXACT_INSTALLED` or an already restored `PREDECESSOR_READY` state and stops
on all drift. Verify it afterward with `preflight.sql`, expecting
`PREDECESSOR_READY`; installed-state postflight intentionally fails after the
known-bad predecessor source is restored.

## Localhost checks for Stebbi

After the separately approved Production SQL174 install and green postflight:

1. Stay signed in as the same account and reload
   `/auth-mvp/utlagt-og-endurgreitt`. Existing rows should appear again without
   unavailable/error UI.
2. Reopen the existing safe Event-linked draft that already failed. Do not
   manufacture a new Production Expense merely for this check.
3. Confirm the already-selected Event participants remain correct. Press
   `Deila drögum` once only if you intend that exact shared-publication state
   change; this step is not read-only. It should finish without `22P02` or a
   server error.
4. Refresh once and confirm the shared-draft state persists and the dashboard
   remains available.
5. A dashboard reload by itself is the read-only regression check. Do not share,
   finalize, settle, delete, invite a real recipient or otherwise change
   financial/public state unless that exact action is intended.

The new modal error presentation lives in the separate app candidate. Until
that app candidate is released or Stebbi runs localhost from its isolated
checkout, the old localhost process may still show the earlier inline error UI.
