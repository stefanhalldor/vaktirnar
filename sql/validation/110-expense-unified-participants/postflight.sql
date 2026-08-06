-- READ ONLY. Run after SQL110 and share the single result row with Codex.
WITH target_functions(name) AS (VALUES
  ('expense_create_unified_participant_invitation'),
  ('expense_create_expense_with_participants'),('expense_update_expense_with_participants'),
  ('expense_invite_existing_participant'),('expense_add_participant'),
  ('expense_get_scoped_member_invitation'),('expense_reserve_scoped_member_invitation_send'),
  ('expense_respond_scoped_member_invitation')
), target_oids AS (
  SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN target_functions t ON t.name=p.proname WHERE n.nspname='public'
)
SELECT current_database() AS database_name, now() AS checked_at,
  (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='expense_member_invitations'
    AND column_name IN ('participant_source','relationship_id')) AS columns_ok,
  (SELECT count(*)=8 FROM target_oids) AS functions_ok,
  (SELECT count(*)-8 FROM target_oids) AS unexpected_target_overloads,
  NOT EXISTS(SELECT 1 FROM target_oids o JOIN pg_proc p ON p.oid=o.oid
    WHERE NOT p.prosecdef OR coalesce(array_to_string(p.proconfig,','),'') NOT LIKE '%search_path=%') AS security_configuration_ok,
  EXISTS(SELECT 1 FROM pg_constraint WHERE conname='expense_member_invitations_template_check'
    AND pg_get_constraintdef(oid) LIKE '%v2%') AS template_v2_ok,
  EXISTS(SELECT 1 FROM pg_constraint WHERE conname='expense_member_invitations_participant_source_check') AS source_constraint_ok,
  NOT EXISTS(SELECT 1 FROM target_oids o JOIN pg_proc p ON p.oid=o.oid
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    JOIN pg_roles r ON r.oid=a.grantee
    WHERE r.rolname IN ('anon','authenticated') AND a.privilege_type='EXECUTE') AS browser_execute_grants_ok,
  NOT EXISTS(SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='expense_member_invitations'
      AND grantee IN ('anon','authenticated')) AS browser_table_grants_ok,
  (SELECT count(*)=7 FROM target_oids o JOIN pg_proc p ON p.oid=o.oid
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    JOIN pg_roles r ON r.oid=a.grantee
    WHERE r.rolname='service_role' AND a.privilege_type='EXECUTE') AS service_role_execute_ok,
  NOT has_function_privilege('service_role',
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)','EXECUTE') AS private_helper_execute_ok,
  NOT EXISTS(SELECT 1 FROM public.expense_member_invitations
    WHERE (participant_source='relationship') IS DISTINCT FROM (relationship_id IS NOT NULL)) AS lifecycle_ok,
  (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
    AND xact_start < now()-interval '5 minutes') AS transactions_older_than_five_minutes;
