-- SQL130 forward-only recovery inventory -- READ ONLY.
-- This never drops, updates, remaps or discloses booking/workflow content.

BEGIN;
SET TRANSACTION READ ONLY;

WITH target_relations(name) AS (
  VALUES
    ('booking_workflows'), ('booking_workflow_versions'),
    ('booking_workflow_states'), ('booking_workflow_transitions'),
    ('booking_workflow_mutations')
), installed_relations AS (
  SELECT
    target.name,
    relation.oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM target_relations AS target
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || target.name)
), relation_counts AS (
  SELECT
    installed.name,
    CASE WHEN installed.oid IS NULL THEN NULL ELSE
      ((pg_catalog.xpath(
        '/table/row/row_count/text()',
        pg_catalog.query_to_xml(
          pg_catalog.format(
            'SELECT pg_catalog.count(*) AS row_count FROM %I.%I',
            'public', installed.name
          ),
          false,
          false,
          ''
        )
      ))[1]::text)::bigint
    END AS row_count
  FROM installed_relations AS installed
), booking_counts AS (
  SELECT
    relation.relname,
    ((pg_catalog.xpath(
      '/table/row/row_count/text()',
      pg_catalog.query_to_xml(
        pg_catalog.format(
          'SELECT pg_catalog.count(*) AS row_count FROM %I.%I',
          'public', relation.relname
        ),
        false,
        false,
        ''
      )
    ))[1]::text)::bigint AS row_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relname IN (
      'booking_services', 'booking_requests', 'booking_messages', 'booking_events'
    )
), workflow_functions AS (
  SELECT
    procedure_row.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) || ')' AS signature,
    procedure_row.prosecdef,
    pg_catalog.pg_get_userbyid(procedure_row.proowner) AS owner_name,
    pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AS service_execute,
    pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AS browser_execute
  FROM pg_catalog.pg_proc AS procedure_row
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_row.pronamespace
  WHERE namespace.nspname = 'public'
    AND (
      procedure_row.proname LIKE 'booking_workflow_%'
      OR procedure_row.proname IN (
        'booking_provider_read_workflow', 'booking_provider_ensure_workflow_draft',
        'booking_provider_save_workflow_draft',
        'booking_provider_publish_workflow_draft', 'booking_transition_request',
        'booking_cancel_request_with_reason'
      )
    )
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', installed.name,
      'installed', installed.oid IS NOT NULL,
      'owner', installed.owner_name,
      'rls', installed.relrowsecurity,
      'forceRls', installed.relforcerowsecurity,
      'rowCount', relation_counts.row_count
    ) ORDER BY installed.name)
    FROM installed_relations AS installed
    JOIN relation_counts ON relation_counts.name = installed.name
  ), '[]'::jsonb) AS workflow_relations,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'signature', function_row.signature,
      'securityDefiner', function_row.prosecdef,
      'owner', function_row.owner_name,
      'serviceExecute', function_row.service_execute,
      'browserExecute', function_row.browser_execute
    ) ORDER BY function_row.signature)
    FROM workflow_functions AS function_row
  ), '[]'::jsonb) AS workflow_functions,
  (SELECT row_count FROM booking_counts WHERE relname = 'booking_services') AS service_rows,
  (SELECT row_count FROM booking_counts WHERE relname = 'booking_requests') AS request_rows,
  (SELECT row_count FROM booking_counts WHERE relname = 'booking_messages') AS message_rows,
  (SELECT row_count FROM booking_counts WHERE relname = 'booking_events') AS event_rows,
  'Disable the app-side workflow rollout, preserve all booking/workflow/event rows, and prepare a separately reviewed next-numbered forward-only corrective migration.'::text
    AS forward_only_recovery_instruction;

ROLLBACK;
