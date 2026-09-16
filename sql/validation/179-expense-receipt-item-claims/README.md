# SQL179 operator package

SQL179 installs the private receipt-image, reviewed receipt-line and fractional
claim contract used by **Splitta reikningnum**. It does not upload, extract,
claim or confirm a receipt by itself.

The operator order is strict:

1. Run `preflight.sql` by itself. Continue only when `operator_state_ok = true`
   and `installation_state = PREDECESSOR_READY`.
2. Run `../../179_expense_receipt_item_claims.sql` by itself once.
3. Run `postflight.sql` by itself. It is GREEN only when
   `installation_state = EXACT_INSTALLED` and `postconditions_ok = true`.

Preflight and postflight are read-only transactions that end in `ROLLBACK`.
They accept no actor input and read no application, identity or receipt rows.
They inspect PostgreSQL catalogs and the single dedicated storage bucket row.
The apply migration is transactional and fail-closed. It refuses partial
targets, unexpected overloads and prerequisite lineage drift. All three scripts
use the same installed catalog seal, covering exact relation properties, column
types/nullability/defaults, constraints, indexes, function definitions/security
metadata and the private bucket contract. A PostgreSQL server-version change or
any catalog drift therefore classifies as `DRIFT_STOP`.

The relation ACL predicate compares the complete installed table ACL with
`pg_catalog.acldefault('r', relowner)` for the running PostgreSQL version. The
comparison is order-independent and includes grantor, grantee, privilege and
grant option. This accepts PostgreSQL 17's owner `MAINTAIN` privilege only when
it is part of the exact authoritative owner-default ACL, while any missing,
extra, public or non-owner grant remains `DRIFT_STOP`.

Stebbi runs all three SQL steps manually. Codex never runs SQL.
