-- SQL103 preflight. 100% read-only. Run against the intended Supabase project
-- before sql/103_expense_revisions_and_recalculation.sql.
WITH required_relations(name) AS (
  VALUES
    ('expense_groups'), ('expense_group_members'), ('expenses'),
    ('expense_payments'), ('expense_shares'), ('expense_repayments'),
    ('expense_activity'), ('expense_private_drafts')
), required_functions(signature) AS (
  VALUES
    ('public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'),
    ('public.expense_group_balances(uuid,boolean)'),
    ('public.expense_simplified_settlement(uuid,text,boolean)'),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)')
), missing_relations AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS value
  FROM required_relations WHERE to_regclass('public.' || name) IS NULL
), missing_functions AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) AS value
  FROM required_functions WHERE to_regprocedure(signature) IS NULL
), target_functions(name) AS (
  VALUES
    ('expense_valid_revision_fields'), ('expense_valid_revision_snapshot'),
    ('expense_revisions_immutable'), ('expense_build_revision_snapshot'),
    ('expense_reported_repayments_need_review'), ('expense_guard_new_reported_repayment')
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  missing_relations.value = '[]'::jsonb AND missing_functions.value = '[]'::jsonb AS prerequisites_ok,
  missing_relations.value AS missing_required_relations,
  missing_functions.value AS missing_required_functions,
  to_regclass('public.expense_revisions')::text AS existing_target_relation,
  (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
   FROM target_functions WHERE to_regprocedure('public.' || name || CASE name
     WHEN 'expense_valid_revision_fields' THEN '(text[])'
     WHEN 'expense_valid_revision_snapshot' THEN '(jsonb)'
     WHEN 'expense_revisions_immutable' THEN '()'
     WHEN 'expense_build_revision_snapshot' THEN '(uuid,uuid)'
     WHEN 'expense_reported_repayments_need_review' THEN '(uuid)'
     ELSE '()' END) IS NOT NULL) AS existing_target_functions,
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid = 'public.expense_repayments'::regclass
     AND tgname = 'expense_repayments_review_guard' AND NOT tgisinternal) AS existing_target_triggers,
  (SELECT count(*) FROM pg_stat_activity
   WHERE datname = current_database() AND pid <> pg_backend_pid()
     AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes
FROM missing_relations, missing_functions;
