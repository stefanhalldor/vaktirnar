-- SQL108 postflight. 100% read-only.
WITH expected_tables(name) AS (VALUES
  ('relationship_label_definitions'), ('relationship_label_assignments'),
  ('relationship_circles'), ('relationship_circle_members'),
  ('relationship_circle_invitations'), ('relationship_circle_events'),
  ('relationship_circle_expense_contexts'), ('relationship_mutation_requests')
), table_state AS (
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (SELECT name FROM expected_tables)
), grants AS (
  SELECT count(*) FILTER (WHERE grantee IN ('PUBLIC', 'anon', 'authenticated'))::int AS browser_grants,
    count(*) FILTER (WHERE grantee = 'service_role' AND privilege_type <> 'SELECT')::int AS service_role_writes
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name IN (SELECT name FROM expected_tables)
), orphan_labels AS (
  SELECT count(*)::int AS count FROM public.relationship_label_assignments AS assignment
  LEFT JOIN public.relationship_label_definitions AS label ON label.id = assignment.label_id AND label.owner_id = assignment.owner_id
  LEFT JOIN public.relationships AS relationship ON relationship.id = assignment.relationship_id AND relationship.owner_id = assignment.owner_id
  WHERE label.id IS NULL OR relationship.id IS NULL
), circle_violations AS (
  SELECT count(*)::int AS count FROM public.relationship_circles AS circle
  WHERE circle.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.relationship_circle_members AS member
    WHERE member.circle_id = circle.id AND member.role = 'owner' AND member.status = 'active'
  )
), function_state AS (
  SELECT count(*)::int AS count, bool_and(procedure.prosecdef) AS security_definer_ok,
    bool_and(coalesce(array_to_string(procedure.proconfig, ','), '') LIKE '%search_path=%') AS search_path_ok
  FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public' AND procedure.proname IN (
    'relationship_save_label', 'relationship_set_label_assignment', 'relationship_delete_label',
    'relationship_create_circle', 'relationship_invite_to_circle', 'relationship_respond_circle_invitation',
    'relationship_remove_circle_member', 'relationship_leave_circle',
    'relationship_transfer_circle_ownership', 'relationship_archive_circle',
    'expense_create_expense_with_circle_context'
  )
), invitation_violations AS (
  SELECT count(*)::int AS count FROM public.relationship_circle_invitations AS invitation
  WHERE (invitation.status = 'pending') IS DISTINCT FROM (invitation.responded_at IS NULL)
)
SELECT current_database() AS database_name, now() AS checked_at,
  (SELECT count(*) = 8 FROM table_state) AS tables_ok,
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM table_state) AS rls_force_ok,
  (SELECT browser_grants FROM grants) AS browser_table_grants,
  (SELECT service_role_writes FROM grants) AS service_role_direct_writes,
  (SELECT count = 11 AND security_definer_ok AND search_path_ok FROM function_state) AS functions_ok,
  (SELECT count FROM orphan_labels) AS orphan_label_assignments,
  (SELECT count FROM circle_violations) AS circle_owner_violations,
  (SELECT count FROM invitation_violations) AS invitation_lifecycle_violations,
  (SELECT count(*) FROM public.relationship_label_definitions) AS label_rows,
  (SELECT count(*) FROM public.relationship_label_assignments) AS label_assignment_rows,
  (SELECT count(*) FROM public.relationship_circles) AS circle_rows,
  (SELECT count(*) FROM public.relationship_circle_invitations) AS invitation_rows,
  (SELECT count(*) FROM public.relationship_circle_expense_contexts) AS expense_context_rows;
