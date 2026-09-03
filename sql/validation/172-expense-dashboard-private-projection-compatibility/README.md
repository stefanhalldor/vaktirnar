# SQL172 — private dashboard projection compatibility

SQL172 is a function-only compatibility repair for TES-24. It keeps the
strict SQL159 publication/finalization normalizer unchanged and adds an
owner-only projection adapter used solely by the private-creation dashboard
branch.

The Production evidence that admits this repair was bounded and exact:

- the SQL171 target, its helper lineage, ACLs and relation lineage were exact;
- all seven reproduced private-creation failures were the allowlisted
  `expense_unconfirmed_invalid_draft` row-local class;
- the live-publication domain completed `1/1` without an exception;
- the settlement domain completed `13/13` without an exception;
- no unexpected P0001 or non-P0001 exception occurred.

SQL159 remains byte- and semantically unchanged. The adapter contains only
the reviewed private-projection exception policy. It must never be used by
share, publish, finalize, live-publication or settlement paths.

## Installed function contracts

The existing service projection remains:

`public.expense_list_dashboard_presentations_v1(uuid) RETURNS jsonb`

It stays `VOLATILE`, `SECURITY DEFINER`, postgres-owned, has an empty
`search_path`, and has exactly two EXECUTE ACL entries: postgres/owner and
`service_role`, both granted by postgres without grant option.

The new internal adapter is:

`public.expense_sql172_project_private_draft(uuid,uuid) RETURNS jsonb`

It is `VOLATILE`, `SECURITY INVOKER`, postgres-owned, non-strict,
non-leakproof, parallel-unsafe, cost 100 and has an empty `search_path`. Its
ACL contains exactly one postgres/owner EXECUTE entry. PUBLIC, `anon`,
`authenticated` and `service_role` receive no direct EXECUTE grant.

Only CRLF-to-LF transport normalization is allowed when comparing installed
`pg_proc.prosrc`:

```sql
pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n'))
```

No trimming or broader whitespace normalization is part of either source
identity.

The exact normalized source identities are:

- SQL171 predecessor target: `aad418eeda9d6b1dfe073c4109723d88`;
- SQL172 installed target: `c27e4db0344e21ff660387dab9b3b36c`;
- SQL172 owner-only adapter: `f6f261b2f4405afa09c033b7a7b651be`.

Every state-changing artifact also carries the reviewed V246 unchanged
lineage closure: exactly 29 helper functions with their source, metadata,
namespace/language dependencies and ACLs; exactly 17 relations with their
owner, RLS and ACL contracts; and exactly 31 required columns with their
rendered types. The SQL171/SQL172 target and SQL172 adapter are checked
separately from those 29 helpers.

## Operator sequence

Every SQL step requires separate approval. Stebbi is the only Production SQL
operator.

1. Deploy the backward-compatible app parser/UI change first under a separate
   deployment approval. It accepts a nullable private title while continuing
   to accept every current SQL171 response.
2. Run `preflight.sql` alone in a new SQL Editor tab. Continue only from
   `PREDECESSOR_READY`; `EXACT_INSTALLED` is an idempotent already-installed
   classification. Any other state is STOP.
3. Run `rehearse-migration.sql` only if separately authorized. Replace its
   sole `__STEBBI_PRIVATE_ACTOR_UUID__` token privately, changing no other
   byte. It is one standalone DO statement. Its nested subtransaction installs
   the exact SQL172 definitions and invokes the dashboard target exactly once.
   The controlled `P1701` result exposes only bounded envelope/count/safety
   evidence and is emitted only after that subtransaction has rolled back and
   exact SQL171 target, absent adapter and full V246 lineage have been
   re-observed. A PASS also requires at least one `needs_attention` row, the
   exact ten-key SQL172 row shape, and the private-draft implications for an
   attention row or nullable title; this prevents a green rehearsal that never
   exercises the proven containment domain.
4. Run the SQL172 migration alone under normal autocommit. Do not wrap it in a
   caller-created `BEGIN` / `COMMIT` and do not combine it with other SQL.
5. Run `postflight.sql` alone and require every exact predicate and
   `postconditions_ok` to be true.

The migration and recovery use transaction-scoped advisory locks in the
established order and perform preconditions, mutation and postconditions in
one top-level statement. An uncaught error therefore rolls back the complete
statement and releases its locks under normal autocommit.

## Recovery

`recovery.sql` is not ordinary rollback authorization. It requires a separate
operator decision.

It admits only one of two exact states:

- exact SQL172 target plus exact owner-only adapter, which may be restored;
- exact SQL171 target plus absent adapter, which is already recovered and
  requires no mutation.

Every partial or drifted state stops before mutation. On the SQL172 path the
single atomic statement first restores the exact SQL171 target, proves that
restoration, then drops only the exact adapter without `CASCADE`, and finally
proves the SQL171 target remains exact and the adapter is absent. It reads or
changes no application rows.

## PostgreSQL runtime-test gap

This repository/session has no disposable PostgreSQL harness: no local
`psql`, server, Docker/Podman, Supabase CLI, WSL PostgreSQL, Testcontainers,
PGlite or pg-mem setup is available. Static Vitest coverage therefore cannot
prove PL/pgSQL parsing or exception/subtransaction behavior. The separately
gated rollback-only Production rehearsal is required before permanent SQL172
execution.

No SQL in this bundle was executed by Codex.

## Localhost checks for Stebbi

No localhost check should be performed until the app compatibility change is
locally green and the separately approved SQL172 Production installation has
an exact postflight.

After those gates:

1. Sign in as the same closed-beta actor used for the aggregate diagnostic.
2. Open `/auth-mvp/utlagt-og-endurgreitt` once without creating or editing
   Expense data.
3. Expect the dashboard entries to render instead of the global unavailable
   message.
4. Confirm incomplete contained private drafts remain visible as owner-private
   base rows, use the localized untitled fallback where necessary, have no
   inferred person/circle facets, and show the existing attention treatment.
5. Confirm the valid private row, live publication and settlement-driven rows
   still render normally.
6. Verify the browser/server console contains no raw SQLSTATE, UUID, amount,
   title, payment detail or other private Expense value.

Do not manufacture Production drafts, alter another actor's data, rerun SQL,
or test recovery casually. Those actions require separate approval.
