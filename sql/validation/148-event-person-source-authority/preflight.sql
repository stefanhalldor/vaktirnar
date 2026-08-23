-- Read-only SQL148 preflight. Every boolean and prerequisites_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH protected_expected(signature, expected_md5, expected_volatility) AS (
  VALUES
    ('public.teskeid_event_assert_actor(uuid)',
      '9dd7c34f6cc6c78131e7ebbb9a718ea4', 's'),
    ('public.teskeid_event_uuid_from_text(text)',
      '27229cbc71c621e5a8592265b07f874d', 'i'),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
      '2377be525ed29f2d4bc26d453fa8cf51', 's')
), protected_checks AS (
  SELECT
    pg_catalog.count(procedure_row.oid) = 3 AS protected_functions_exist_ok,
    pg_catalog.count(procedure_row.oid) = 3 AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
        = expected.expected_md5
      AND procedure_row.provolatile::text = expected.expected_volatility
      AND procedure_row.prosecdef
      AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
    ) AS protected_functions_exact_ok
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
), relation_checks AS (
  SELECT
    pg_catalog.to_regclass('public.teskeid_events') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NOT NULL
      AND pg_catalog.to_regclass('public.profiles') IS NOT NULL AS relations_ok,
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
), checks AS (
  SELECT
    pg_catalog.current_setting('server_version_num')::integer >= 150000 AS server_version_ok,
    current_user IN ('postgres', 'supabase_admin') AS executor_ok,
    relation_checks.*,
    column_checks.*,
    protected_checks.*,
    pg_catalog.to_regprocedure(
      'public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)'
    ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_person_source_roster_v1(uuid,uuid)'
      ) IS NULL AS targets_clear
  FROM relation_checks CROSS JOIN column_checks CROSS JOIN protected_checks
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  checks.*,
  checks.server_version_ok
    AND checks.executor_ok
    AND checks.relations_ok
    AND checks.relation_dependency_shape_ok
    AND checks.rls_posture_ok
    AND checks.supporting_indexes_ok
    AND checks.protected_functions_exist_ok
    AND checks.protected_functions_exact_ok
    AND checks.targets_clear AS prerequisites_ok
FROM checks;

ROLLBACK;
