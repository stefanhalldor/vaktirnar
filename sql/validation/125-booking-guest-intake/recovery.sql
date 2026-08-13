-- SQL125 booking guest-intake recovery probe -- READ ONLY.
-- SQL125 is forward-only. This inventories retained history and installed
-- artifacts before a separately reviewed corrective migration is designed.

BEGIN;
SET TRANSACTION READ ONLY;

WITH booking_relations AS (
  SELECT
    relation.oid,
    relation.relname,
    relation.relkind,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname LIKE 'booking_%'
), booking_functions AS (
  SELECT
    procedure.oid,
    procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')' AS signature,
    procedure.prosecdef,
    pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname LIKE 'booking_%'
), booking_relation_counts AS (
  SELECT
    relation.relname,
    ((pg_catalog.xpath(
      '/table/row/row_count/text()',
      pg_catalog.query_to_xml(
        pg_catalog.format(
          'SELECT pg_catalog.count(*) AS row_count FROM %I.%I',
          'public',
          relation.relname
        ),
        false,
        false,
        ''
      )
    ))[1]::text)::bigint AS row_count
  FROM booking_relations AS relation
  WHERE relation.relkind IN ('r', 'p')
    AND relation.relname IN (
      'booking_services',
      'booking_requests',
      'booking_access_members',
      'booking_capability_sessions',
      'booking_messages',
      'booking_events'
    )
), booking_policies AS (
  SELECT policy.polname, relation.relname
  FROM pg_catalog.pg_policy AS policy
  JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'booking_services',
      'booking_requests',
      'booking_access_members',
      'booking_capability_sessions',
      'booking_messages',
      'booking_events'
    )
), feature_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name', relation.relname,
        'kind', relation.relkind,
        'owner', relation.owner_name,
        'rls', relation.relrowsecurity,
        'forceRls', relation.relforcerowsecurity
      ) ORDER BY relation.relname
    )
    FROM booking_relations AS relation
  ), '[]'::jsonb) AS installed_booking_relations,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'signature', function_row.signature,
        'securityDefiner', function_row.prosecdef,
        'owner', function_row.owner_name
      ) ORDER BY function_row.signature
    )
    FROM booking_functions AS function_row
  ), '[]'::jsonb) AS installed_booking_functions,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table', policy.relname,
        'policy', policy.polname
      ) ORDER BY policy.relname, policy.polname
    )
    FROM booking_policies AS policy
  ), '[]'::jsonb) AS booking_policies,
  (SELECT definition FROM feature_constraint) AS feature_constraint_definition,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_services')
    AS service_rows,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_requests')
    AS request_rows,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_access_members')
    AS member_rows,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_capability_sessions')
    AS capability_session_rows,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_messages')
    AS message_rows,
  (SELECT row_count FROM booking_relation_counts WHERE relname = 'booking_events')
    AS event_rows,
  'Do not drop or rewrite booking history. Disable app rollout and prepare a new forward-only migration.'::text
    AS forward_only_recovery_instruction;

ROLLBACK;
