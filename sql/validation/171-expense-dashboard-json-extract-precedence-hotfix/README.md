# SQL171 — dashboard JSON extraction precedence hotfix

SQL171 is a function-only forward correction for
`public.expense_list_dashboard_presentations_v1(uuid)`.

The SQL170 body contained this one ambiguous PostgreSQL operator chain:

```sql
|| '|' || party.value->>'party_key_hash'
```

Because the generic operators associate left-to-right, PostgreSQL attempted an
invalid `text ->> unknown` operation while planning the projection query and
returned SQLSTATE `42883`. SQL171 derives the target by changing only that token
to:

```sql
|| '|' || (party.value->>'party_key_hash')
```

## Frozen source identities

- SQL170 normalized installed `prosrc` predecessor:
  `dbf8086df87d9574e29a914c7201257b`
- SQL171 normalized installed `prosrc` target:
  `aad418eeda9d6b1dfe073c4109723d88`

Only CRLF-to-LF transport normalization is used for these installed-source
hashes. No trimming or broader whitespace normalization is accepted.

## Atomic operator contract

`sql/171_expense_dashboard_json_extract_precedence_hotfix.sql` is exactly one
top-level anonymous `DO` statement. Run it standalone under normal autocommit.
Do not wrap it in `BEGIN` / `COMMIT`, and do not combine it with other SQL.

Before mutation it requires:

- executor and session user `postgres`;
- the exact target signature, metadata, owner and `plpgsql` language;
- the exact two-entry function ACL for owner/postgres and `service_role`, both
  `EXECUTE`, both granted by postgres, with no grant option;
- denial of effective execution to `anon` and `authenticated`;
- exactly two direct normal dependencies: the `public` namespace and
  `plpgsql` language, with no extension ownership or additional dependency;
- either the exact SQL170 predecessor source with one invalid token, or the
  exact SQL171 target source with one corrected token.

The frozen metadata also covers cost, rows, variadic/support/transform state,
binary body and SQL-standard body defaults because `CREATE OR REPLACE` assigns
all properties specified or implied by its command. The predecessor path
derives the target in memory, verifies its exact hash and reverse equivalence,
and performs one dynamic `CREATE OR REPLACE FUNCTION`. There is no owner or ACL
mutation. The same metadata, ACL, exact dependency multiset, source,
token-count and function-OID conditions are checked again before success.

The statement uses fail-fast transaction-scoped advisory locks for SQL170 and
SQL171 plus a five-second lock timeout for the function replacement's database
lock acquisition. The Supabase SQL Editor/platform execution timeout remains
the outer bound for the complete statement. Any uncaught failure aborts the
one statement, rolls back the function replacement and releases both advisory
locks under normal autocommit. A second execution against the exact target is
idempotent and performs no replacement.

## Data, auth and recovery

The operator reads only PostgreSQL catalogs and changes only the existing
function body. It does not call the target, read or mutate application rows,
alter relations, RLS, auth, policies, ownership or grants.

No automatic recovery SQL is provided. The predecessor is the proven broken
body, so restoring it is not a safe normal rollback. A failed SQL171 statement
rolls itself back. Any later need to restore the predecessor requires a new,
explicitly reviewed recovery decision.

## Localhost checks for Stebbi

Only after a separately reviewed Production execution succeeds:

1. Stay signed in as the same closed-beta actor that produced the TES-24
   `sql_unavailable` result.
2. Refresh `/auth-mvp/utlagt-og-endurgreitt` once without creating or editing
   Expense data.
3. Expect the entries section to render its real ready or legitimate empty
   state, not `Ekki tókst að sækja færslurnar núna`.
4. Confirm the safe server diagnostic reports a ready result and no SQLSTATE
   `42883` or Next.js server/runtime error appears.
5. Check that titles, amounts, facets and links shown belong only to the signed-
   in actor's authorized Expense universe.

Do not casually test with another person's account, manufacture Production
Expense rows, rerun SQL170, or run repair/recovery SQL. Those require separate
authorization.
