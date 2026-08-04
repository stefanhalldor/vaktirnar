-- SQL97 postflight — READ ONLY.
-- Run only after SQL97 reports success. Expected: all *_ok values true;
-- lifecycle_violations=0; browser grants=0; service-role direct writes=0.

WITH expected_functions(name) AS (
  VALUES
    ('expense_update_expense'),
    ('expense_link_guest_member_email'),
    ('expense_get_my_member_invitations'),
    ('expense_sync_my_member_invitation_events'),
    ('expense_terminalize_member_invitations'),
    ('expense_reserve_member_invitation_send'),
    ('expense_update_member_invitation_delivery'),
    ('expense_respond_member_invitation'),
    ('expense_cancel_member_invitation')
),
present_functions AS (
  SELECT DISTINCT procedure.proname
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
),
new_table AS (
  SELECT relation.relrowsecurity
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'expense_member_invitations'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  to_regclass('public.expense_member_invitations') IS NOT NULL AS invitation_table_ok,
  coalesce((SELECT relrowsecurity FROM new_table), false) AS invitation_rls_ok,
  NOT EXISTS (
    SELECT 1 FROM expected_functions
    WHERE expected_functions.name NOT IN (SELECT proname FROM present_functions)
  ) AS functions_ok,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'relationship_sources'
      AND constraint_row.conname = 'relationship_sources_source_type_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) LIKE '%loans%expenses%'
  ) AS relationship_source_constraint_ok,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'expense_activity'
      AND constraint_row.conname = 'expense_activity_event_type_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
        LIKE '%expense_member_invitation_received%'
  ) AS activity_constraint_ok,
  (SELECT count(*) FROM public.expense_member_invitations
    WHERE (status = 'pending' AND recipient_email_canonical IS NULL)
       OR (status = 'pending' AND expires_at <= now())
       OR (status <> 'pending' AND recipient_email_canonical IS NOT NULL))
    AS lifecycle_violations,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_invitations'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_table_grants,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_invitations'
      AND grantee = 'service_role'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
    AS service_role_direct_writes,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name IN (SELECT name FROM expected_functions)
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_function_execute,
  (SELECT count(*) FROM public.expense_member_invitations) AS invitation_rows,
  (SELECT count(*) FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'expense%') AS expense_table_count,
  (SELECT count(DISTINCT procedure.proname)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public' AND procedure.proname LIKE 'expense_%')
    AS expense_function_count;
