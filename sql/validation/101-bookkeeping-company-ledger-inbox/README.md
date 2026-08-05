# SQL101 validation

Stebbi alone runs these queries and the migration in the Supabase SQL editor.
Codex must never run them.

1. Confirm that the selected Supabase project is the intended production project.
2. Run `preflight.sql`. Continue only when `prerequisites_ok` and
   `storage_prerequisites_ok` are true, both target arrays are empty, the current
   bookkeeping counts are 11 tables, 18 RPCs and 41 functions, and there are no old transactions.
3. Run `sql/101_bookkeeping_company_ledger_inbox.sql` once.
4. Run `postflight.sql`. Every `*_ok` column must be true and all three row
   counts must be zero before the feature is used. The exact object-count check
   must also confirm 16 tables, 30 RPCs and 57 functions.

The migration is additive. It creates five default-deny tables, twelve
service-role-only RPCs, four private helpers and one private Storage bucket.
It does not backfill or alter existing VAT entries, A–F, readiness or filing
snapshots. Stop and share the full result row if any check is false.
