-- SQL107 preflight. Read-only: no DDL/DML and no function calls that write.
WITH required_relations(name) AS (
  VALUES
    ('expense_payment_preferences'), ('expense_repayments'),
    ('expense_group_members'), ('expense_obligations'),
    ('expense_repayment_allocations'), ('expense_mutation_requests')
), missing AS (
  SELECT name FROM required_relations WHERE to_regclass('public.' || name) IS NULL
), target_functions AS (
  SELECT count(*)::int AS count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'expense_save_payment_profile_v2', 'expense_clear_payment_profile_v2',
      'expense_convert_legacy_payment_profile_v2',
      'expense_resolve_payment_profile_v2', 'expense_resolve_repayment_payment_snapshot_v2'
    )
), old_transactions AS (
  SELECT count(*)::int AS count FROM pg_stat_activity
  WHERE xact_start IS NOT NULL AND now() - xact_start > interval '5 minutes'
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  NOT EXISTS (SELECT 1 FROM missing) AS prerequisites_ok,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM missing), '[]'::jsonb) AS missing_required_relations,
  to_regclass('public.expense_payment_profiles_v2') IS NOT NULL AS already_applied,
  (SELECT count FROM target_functions) AS existing_target_functions,
  CASE WHEN to_regclass('public.expense_payment_preferences') IS NULL THEN NULL ELSE
    (SELECT count(*) FROM public.expense_payment_preferences WHERE active)
  END AS legacy_active_profiles,
  CASE WHEN to_regclass('public.expense_repayments') IS NULL THEN NULL ELSE
    (SELECT count(*) FROM public.expense_repayments WHERE payment_preference_snapshot IS NOT NULL)
  END AS legacy_plaintext_snapshots,
  (SELECT count FROM old_transactions) AS transactions_older_than_five_minutes;
