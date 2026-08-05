-- SQL98 bookkeeping production/preview preflight — READ ONLY.
-- Run against the intended project before SQL98. Fresh-install expectation:
-- prerequisites_ok=true; missing_required_columns=[]; existing arrays=[];
-- idea_seed_compatible=true; transactions_older_than_five_minutes=0.
-- An intentional idempotent rerun may report existing SQL98 objects.
-- SQL95 is not a SQL98 prerequisite. Current SQL95/SQL96/SQL98 sources widen
-- the live feature constraint and preserve later keys. Never run a stale copy
-- of SQL95 or SQL96 that hard-replaces the shared allowlist after SQL98.
-- SQL96 as a whole must not be rerun after SQL97; only its feature-key block
-- is forward-compatible with later keys.

WITH required_columns(schema_name, table_name, column_name) AS (
  VALUES
    ('public', 'feature_access', 'email'),
    ('public', 'feature_access', 'feature_key'),
    ('public', 'ideas', 'title'),
    ('public', 'ideas', 'slug'),
    ('public', 'ideas', 'short_description'),
    ('public', 'ideas', 'problem_description'),
    ('public', 'ideas', 'possible_solution'),
    ('public', 'ideas', 'category'),
    ('public', 'ideas', 'status'),
    ('public', 'ideas', 'source'),
    ('public', 'ideas', 'is_public'),
    ('public', 'ideas', 'is_featured')
),
missing_columns AS (
  SELECT required.schema_name || '.' || required.table_name || '.' || required.column_name AS name
  FROM required_columns AS required
  LEFT JOIN information_schema.columns AS present
    ON present.table_schema = required.schema_name
   AND present.table_name = required.table_name
   AND present.column_name = required.column_name
  WHERE present.column_name IS NULL
),
expected_relations(name) AS (
  VALUES
    ('bookkeeping_entities'), ('bookkeeping_entity_members'),
    ('bookkeeping_vat_registrations'), ('bookkeeping_periods'),
    ('bookkeeping_entries'), ('bookkeeping_entry_lines'),
    ('bookkeeping_entry_revisions'),
    ('bookkeeping_filing_snapshots'), ('bookkeeping_activity'),
    ('bookkeeping_mutation_requests')
),
existing_relations AS (
  SELECT name FROM expected_relations WHERE to_regclass('public.' || name) IS NOT NULL
),
expected_functions(name) AS (
  VALUES
    ('bookkeeping_create_entity'), ('bookkeeping_add_vat_registration'),
    ('bookkeeping_create_period'), ('bookkeeping_create_entry'),
    ('bookkeeping_update_entry'), ('bookkeeping_set_entry_review_status'),
    ('bookkeeping_void_entry'), ('bookkeeping_set_period_ready'),
    ('bookkeeping_record_filing'), ('bookkeeping_reopen_period'),
    ('bookkeeping_record_payment'), ('bookkeeping_get_dashboard'),
    ('bookkeeping_get_period'), ('bookkeeping_get_entry'),
    ('bookkeeping_calculate_period_summary'), ('bookkeeping_period_readiness'),
    ('bookkeeping_prepare_account_deletion')
),
existing_functions AS (
  SELECT DISTINCT procedure.proname AS name
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (SELECT name FROM expected_functions)
),
feature_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'feature_access'
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
),
idea_slug_conflict_target AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = 'slug'
     AND NOT attribute.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'ideas'
      AND constraint_row.contype IN ('p', 'u')
      AND constraint_row.conkey = ARRAY[attribute.attnum]::smallint[]
  ) AS ok
),
existing_idea AS (
  SELECT title, slug, status, source, is_public, is_featured
  FROM public.ideas WHERE slug = 'bokhaldid'
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regclass('auth.users') IS NOT NULL
    AND to_regclass('public.feature_access') IS NOT NULL
    AND to_regclass('public.ideas') IS NOT NULL
    AND to_regprocedure('public.normalize_email_canonical(text)') IS NOT NULL
    AND EXISTS (SELECT 1 FROM feature_constraint)
    AND NOT EXISTS (SELECT 1 FROM missing_columns)
    AND (SELECT ok FROM idea_slug_conflict_target)
    AS prerequisites_ok,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM missing_columns), '[]'::jsonb)
    AS missing_required_columns,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM existing_relations), '[]'::jsonb)
    AS existing_bookkeeping_relations,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM existing_functions), '[]'::jsonb)
    AS existing_bookkeeping_functions,
  coalesce((SELECT definition LIKE '%bokhaldid%' FROM feature_constraint), false)
    AS feature_constraint_already_contains_bokhaldid,
  coalesce((SELECT definition LIKE '%agent-collaboration-private-beta%' FROM feature_constraint), false)
    AS feature_constraint_contains_agent_key,
  coalesce((SELECT definition LIKE '%utlagt-og-endurgreitt%' FROM feature_constraint), false)
    AS feature_constraint_contains_expense_key,
  (SELECT definition FROM feature_constraint) AS current_feature_constraint,
  (SELECT ok FROM idea_slug_conflict_target) AS idea_slug_conflict_target_ok,
  NOT EXISTS (SELECT 1 FROM existing_idea)
    OR EXISTS (SELECT 1 FROM existing_idea WHERE is_public)
    AS idea_seed_compatible,
  (SELECT to_jsonb(existing_idea) FROM existing_idea) AS existing_bokhaldid_idea,
  (SELECT count(*) FROM public.feature_access WHERE feature_key = 'bokhaldid')
    AS existing_bookkeeping_feature_rows,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes,
  'SQL95 is separately gated and is not part of the SQL98 rollout. Do not rerun SQL96 after SQL97. Stale SQL95/SQL96 copies can remove bokhaldid.'::text
    AS feature_key_compatibility_note;
