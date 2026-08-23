-- Read-only SQL148 postflight. Every boolean and postconditions_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH target_expected(signature, expected_md5) AS (
  VALUES
    ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
      'a31fc1caa0cf009e4daad9c3e3ed1875'),
    ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
      'ae418825a7d7f8ebe056272dde9448fd')
), target_checks AS (
  SELECT
    pg_catalog.count(procedure_row.oid) = 2 AS functions_exist_ok,
    pg_catalog.count(procedure_row.oid) = 2 AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
        = expected.expected_md5
      AND procedure_row.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
      AND procedure_row.provolatile = 's'
      AND procedure_row.prosecdef
      AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
    ) AS function_shape_exact_ok,
    pg_catalog.count(procedure_row.oid) = 2 AND pg_catalog.bool_and(
      pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantee NOT IN (procedure_row.proowner, service_role.oid)
      )
    ) AS function_acl_exact_ok
  FROM target_expected AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  JOIN pg_catalog.pg_roles AS service_role
    ON service_role.rolname = 'service_role'
), protected_expected(signature, expected_md5) AS (
  VALUES
    ('public.teskeid_event_assert_actor(uuid)',
      '9dd7c34f6cc6c78131e7ebbb9a718ea4'),
    ('public.teskeid_event_uuid_from_text(text)',
      '27229cbc71c621e5a8592265b07f874d'),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
      '2377be525ed29f2d4bc26d453fa8cf51')
), protected_checks AS (
  SELECT pg_catalog.count(procedure_row.oid) = 3 AND pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
      = expected.expected_md5
    AND owner_role.rolname = 'postgres'
    AND procedure_row.prosecdef
    AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
    AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
  ) AS protected_catalog_unchanged_ok
  FROM protected_expected AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), required_columns(relation_name, column_name, type_name) AS (
  VALUES
    ('public.teskeid_events', 'id', 'uuid'),
    ('public.teskeid_events', 'owner_user_id', 'uuid'),
    ('public.teskeid_events', 'name', 'text'),
    ('public.teskeid_events', 'roster_revision', 'bigint'),
    ('public.teskeid_events', 'created_at', 'timestamp with time zone'),
    ('public.teskeid_event_guests', 'id', 'uuid'),
    ('public.teskeid_event_guests', 'event_id', 'uuid'),
    ('public.teskeid_event_guests', 'status', 'text'),
    ('public.teskeid_event_guests', 'position', 'smallint'),
    ('public.teskeid_event_guests', 'source_kind', 'text'),
    ('public.teskeid_event_guests', 'display_name_snapshot', 'text'),
    ('public.teskeid_event_guests', 'linked_user_id', 'uuid'),
    ('public.teskeid_event_attendance_memberships', 'event_id', 'uuid'),
    ('public.teskeid_event_attendance_memberships', 'event_guest_id', 'uuid'),
    ('public.teskeid_event_attendance_memberships', 'user_id', 'uuid'),
    ('public.teskeid_event_attendance_memberships', 'accepted_at', 'timestamp with time zone'),
    ('public.profiles', 'id', 'uuid'),
    ('public.profiles', 'display_name', 'text')
), column_checks AS (
  SELECT pg_catalog.count(attribute_row.attnum) = 18
    AND pg_catalog.bool_and(
      attribute_row.atttypid = pg_catalog.to_regtype(required.type_name)
      AND NOT attribute_row.attisdropped
    ) AS relation_dependency_shape_ok
  FROM required_columns AS required
  LEFT JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = pg_catalog.to_regclass(required.relation_name)
   AND attribute_row.attname = required.column_name
   AND attribute_row.attnum > 0
), source_shape AS (
  SELECT
    (SELECT procedure_row.prosrc FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)'
      )) AS list_source,
    (SELECT procedure_row.prosrc FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_get_person_source_roster_v1(uuid,uuid)'
      )) AS roster_source
), behavior_checks AS (
  SELECT
    list_source ~ 'teskeid_event_assert_actor[(]p_actor_id[)]'
      AND roster_source ~ 'teskeid_event_assert_actor[(]p_actor_id[)]'
      AND list_source !~ 'assert_financial_actor'
      AND roster_source !~ 'assert_financial_actor' AS event_only_authority_ok,
    list_source ~ 'self_guest[.]status[[:space:]]*=[[:space:]]*''active'''
      AND list_source ~ 'self_guest[.]linked_user_id[[:space:]]*=[[:space:]]*p_actor_id'
      AND roster_source ~ 'self_guest[.]status[[:space:]]*=[[:space:]]*''active'''
      AND roster_source ~ 'self_guest[.]linked_user_id[[:space:]]*=[[:space:]]*p_actor_id'
      AS attendee_isolation_ok,
    list_source !~ '(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)'
      AND roster_source !~ '(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)'
      AND list_source !~ 'expense_'
      AND roster_source !~ 'expense_' AS browse_only_ok,
    roster_source ~ 'source_kind[[:space:]]*=[[:space:]]*''manual_email''[[:space:]]+AND[[:space:]]+guest[.]linked_user_id[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN[[:space:]]+NULL'
      AND roster_source ~ 'unlinked_guest'
      AND roster_source !~ 'email_canonical'
      AND roster_source !~ 'relationship_id' AS projection_privacy_ok
  FROM source_shape
), relation_checks AS (
  SELECT
    COALESCE((SELECT relation.relrowsecurity AND relation.relforcerowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = 'public.teskeid_events'::pg_catalog.regclass), false)
      AND COALESCE((SELECT relation.relrowsecurity AND relation.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation
        WHERE relation.oid = 'public.teskeid_event_guests'::pg_catalog.regclass), false)
      AND COALESCE((SELECT relation.relrowsecurity AND relation.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation
        WHERE relation.oid = 'public.teskeid_event_attendance_memberships'::pg_catalog.regclass), false)
      AS rls_posture_ok,
    pg_catalog.to_regclass('public.teskeid_events_owner_created_idx') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests_active_position_uidx') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_attendance_memberships_user_idx') IS NOT NULL
      AS supporting_indexes_ok
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  target_checks.*,
  protected_checks.*,
  column_checks.*,
  behavior_checks.*,
  relation_checks.*,
  target_checks.functions_exist_ok
    AND target_checks.function_shape_exact_ok
    AND target_checks.function_acl_exact_ok
    AND protected_checks.protected_catalog_unchanged_ok
    AND column_checks.relation_dependency_shape_ok
    AND behavior_checks.event_only_authority_ok
    AND behavior_checks.attendee_isolation_ok
    AND behavior_checks.browse_only_ok
    AND behavior_checks.projection_privacy_ok
    AND relation_checks.rls_posture_ok
    AND relation_checks.supporting_indexes_ok AS postconditions_ok
FROM target_checks
CROSS JOIN protected_checks
CROSS JOIN column_checks
CROSS JOIN behavior_checks
CROSS JOIN relation_checks;

ROLLBACK;
