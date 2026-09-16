# SQL189 operator runbook

1. Run `preflight.sql` alone. Continue only on `READY` with every boolean true.
2. Run `sql/189_receipt_split_shared_exchange.sql` once. Expect `Success. No rows returned`.
3. Do not rerun it. Run `postflight.sql` and accept only `EXACT_INSTALLED` with every boolean true.

SQL189 adds nullable shared exchange settings to each split. Any current member
may update them while the split is sharing. The service-only function verifies
the actor, membership, split state, exact version and an idempotency request ID.
It does not change receipt currency, receipt amounts, claims, RLS or client grants.
