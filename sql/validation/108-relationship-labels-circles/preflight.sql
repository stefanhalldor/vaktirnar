-- SQL108 preflight. 100% read-only.
WITH required_relations(name) AS (
  VALUES ('relationships'), ('relationship_tags'), ('expense_groups'),
    ('expense_group_members'), ('feature_access')
), missing AS (
  SELECT name FROM required_relations WHERE to_regclass('public.' || name) IS NULL
), unexpected_tags AS (
  SELECT count(*)::int AS count FROM public.relationship_tags
  WHERE tag NOT IN ('unclassified', 'family', 'friends', 'recipients')
), target_functions AS (
  SELECT count(*)::int AS count
  FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public' AND procedure.proname IN (
    'relationship_save_label', 'relationship_set_label_assignment', 'relationship_delete_label',
    'relationship_create_circle', 'relationship_invite_to_circle', 'relationship_respond_circle_invitation',
    'relationship_remove_circle_member', 'relationship_leave_circle',
    'relationship_transfer_circle_ownership', 'relationship_archive_circle',
    'expense_create_expense_with_circle_context'
  )
), old_transactions AS (
  SELECT count(*)::int AS count FROM pg_stat_activity
  WHERE xact_start IS NOT NULL AND now() - xact_start > interval '5 minutes'
)
SELECT current_database() AS database_name, current_user AS database_user, now() AS checked_at,
  NOT EXISTS (SELECT 1 FROM missing) AS prerequisites_ok,
  coalesce((SELECT jsonb_agg(name ORDER BY name) FROM missing), '[]'::jsonb) AS missing_required_relations,
  to_regclass('public.relationship_circles') IS NOT NULL AS already_applied,
  (SELECT count FROM target_functions) AS existing_target_functions,
  (SELECT count FROM unexpected_tags) AS unexpected_legacy_tags,
  (SELECT count(*) FROM public.relationships) AS relationship_rows,
  (SELECT count(*) FROM public.relationship_tags WHERE tag <> 'unclassified') AS visible_legacy_tag_rows,
  (SELECT count FROM old_transactions) AS transactions_older_than_five_minutes;
