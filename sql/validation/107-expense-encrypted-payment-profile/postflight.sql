-- SQL107 postflight. Read-only.
WITH table_state AS (
  SELECT c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'expense_payment_profiles_v2'
), function_state AS (
  SELECT count(*)::int AS count,
         bool_and(p.prosecdef) AS security_definer_ok,
         bool_and(coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%') AS search_path_ok
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'expense_save_payment_profile_v2', 'expense_clear_payment_profile_v2',
    'expense_convert_legacy_payment_profile_v2',
    'expense_resolve_payment_profile_v2', 'expense_resolve_repayment_payment_snapshot_v2'
  )
), grants AS (
  SELECT
    count(*) FILTER (WHERE grantee IN ('anon', 'authenticated', 'PUBLIC'))::int AS browser_grants,
    count(*) FILTER (WHERE grantee = 'service_role' AND privilege_type <> 'SELECT')::int AS service_role_direct_writes
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'expense_payment_profiles_v2'
), function_grants AS (
  SELECT count(*) FILTER (
    WHERE grantee IN ('anon', 'authenticated', 'PUBLIC') AND privilege_type = 'EXECUTE'
  )::int AS browser_execute
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name LIKE 'expense_%payment%v2%'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  to_regclass('public.expense_payment_profiles_v2') IS NOT NULL AS profile_table_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expense_repayments'
      AND column_name = 'payment_profile_encrypted_snapshot'
  ) AS repayment_snapshot_column_ok,
  coalesce((SELECT relrowsecurity AND relforcerowsecurity FROM table_state), false) AS rls_force_ok,
  (SELECT count = 5 AND security_definer_ok AND search_path_ok FROM function_state) AS functions_ok,
  (SELECT browser_grants FROM grants) AS browser_table_grants,
  (SELECT service_role_direct_writes FROM grants) AS service_role_direct_writes,
  (SELECT browser_execute FROM function_grants) AS browser_function_execute,
  (SELECT count(*) FROM public.expense_payment_profiles_v2) AS encrypted_profile_rows,
  (SELECT count(*) FROM public.expense_payment_preferences WHERE active) AS legacy_active_profiles,
  (SELECT count(*) FROM public.expense_repayments WHERE payment_preference_snapshot IS NOT NULL) AS legacy_plaintext_snapshots,
  (SELECT count(*) FROM public.expense_repayments WHERE payment_profile_encrypted_snapshot IS NOT NULL) AS encrypted_snapshot_rows,
  (SELECT count(*) FROM public.expense_payment_profiles_v2
    WHERE NOT public.expense_valid_payment_envelope(encrypted_details)) AS invalid_envelope_rows;
