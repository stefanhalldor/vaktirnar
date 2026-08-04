-- SQL97 production preflight — READ ONLY.
-- Run this against the intended Supabase project before running SQL97.
-- Expected: prerequisites_ok=true; missing_required_columns=[]; the new table
-- and all sql97_* function arrays are empty; unexpected source values=[];
-- transactions_older_than_five_minutes=0.

WITH required_relations(name) AS (
  VALUES
    ('expense_groups'), ('expense_group_members'), ('expenses'),
    ('expense_payments'), ('expense_shares'), ('expense_repayments'),
    ('expense_activity'), ('expense_activity_audience'),
    ('expense_mutation_requests'), ('expense_payment_preferences'),
    ('relationships'), ('relationship_sources'), ('feature_access'),
    ('recent_events')
),
required_columns(table_name, column_name) AS (
  VALUES
    ('expense_groups', 'financial_version'),
    ('expense_group_members', 'user_id'),
    ('expense_group_members', 'display_name'),
    ('expenses', 'split_method'),
    ('expense_repayments', 'status'),
    ('relationships', 'counterpart_user_id'),
    ('relationship_sources', 'source_type'),
    ('relationship_sources', 'source_id')
),
missing_columns AS (
  SELECT required.table_name || '.' || required.column_name AS name
  FROM required_columns AS required
  LEFT JOIN information_schema.columns AS present
    ON present.table_schema = 'public'
   AND present.table_name = required.table_name
   AND present.column_name = required.column_name
  WHERE present.column_name IS NULL
),
unexpected_sources AS (
  SELECT DISTINCT source.source_type
  FROM public.relationship_sources AS source
  WHERE source.source_type NOT IN ('loans')
),
new_functions AS (
  SELECT procedure.proname
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'expense_update_expense',
      'expense_link_guest_member_email',
      'expense_get_my_member_invitations',
      'expense_sync_my_member_invitation_events',
      'expense_terminalize_member_invitations',
      'expense_reserve_member_invitation_send',
      'expense_update_member_invitation_delivery',
      'expense_respond_member_invitation',
      'expense_cancel_member_invitation'
    )
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  NOT EXISTS (
    SELECT 1 FROM required_relations
    WHERE to_regclass('public.' || required_relations.name) IS NULL
  )
  AND to_regprocedure('public.normalize_email_canonical(text)') IS NOT NULL
  AND to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)') IS NOT NULL
    AS prerequisites_ok,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM missing_columns), '[]'::jsonb)
    AS missing_required_columns,
  to_regclass('public.expense_member_invitations') AS existing_sql97_relation,
  coalesce((SELECT jsonb_agg(proname ORDER BY proname) FROM new_functions), '[]'::jsonb)
    AS existing_sql97_functions,
  coalesce((SELECT jsonb_agg(source_type ORDER BY source_type) FROM unexpected_sources), '[]'::jsonb)
    AS unexpected_relationship_source_types,
  (SELECT count(*) FROM public.relationship_sources) AS relationship_source_rows,
  (SELECT count(*) FROM public.feature_access WHERE feature_key = 'utlagt-og-endurgreitt')
    AS expense_feature_rows,
  (SELECT count(*) FROM public.expense_group_members WHERE user_id IS NULL AND status = 'active')
    AS active_guest_members,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes,
  (SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'relationship_sources'
      AND constraint_row.contype = 'c'
      AND constraint_row.conname = 'relationship_sources_source_type_check')
    AS current_relationship_source_constraint,
  (SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'expense_activity'
      AND constraint_row.conname = 'expense_activity_event_type_check')
    AS current_expense_activity_event_constraint;
