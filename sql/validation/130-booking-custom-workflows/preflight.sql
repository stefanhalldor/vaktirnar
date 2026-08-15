-- SQL130 customizable booking workflows preflight -- READ ONLY.
-- Run only on the explicitly selected database and share the complete row.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')
), role_contract AS (
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE present.oid IS NULL
    ) = 0 AS required_roles_ok,
    COALESCE(pg_catalog.bool_or(
      present.rolname = current_user
      AND (present.rolname = 'postgres' OR present.rolsuper)
    ), false) AS execution_role_ok
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present ON present.rolname = required.role_name
), dependencies AS (
  SELECT
    pg_catalog.to_regclass('public.booking_services') IS NOT NULL AS services_ok,
    pg_catalog.to_regclass('public.booking_requests') IS NOT NULL AS requests_ok,
    pg_catalog.to_regclass('public.booking_events') IS NOT NULL AS events_ok,
    pg_catalog.to_regclass('public.booking_messages') IS NOT NULL AS messages_ok,
    pg_catalog.to_regclass('public.booking_access_members') IS NOT NULL AS members_ok,
    pg_catalog.to_regclass('public.booking_capability_sessions') IS NOT NULL AS sessions_ok,
    pg_catalog.to_regclass('auth.users') IS NOT NULL AS auth_users_ok,
    pg_catalog.to_regprocedure('public.booking_assert_provider(uuid,uuid)') IS NOT NULL
      AS provider_guard_ok,
    pg_catalog.to_regprocedure('public.booking_authorize_request(uuid,uuid,text)') IS NOT NULL
      AS request_guard_ok,
    pg_catalog.to_regprocedure('public.booking_events_immutable()') IS NOT NULL
      AS event_guard_ok,
    pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NOT NULL
      AS contact_phone_guard_ok,
    pg_catalog.to_regprocedure('public.booking_request_projection(uuid,text,text)') IS NOT NULL
      AS request_projection_ok,
    pg_catalog.to_regprocedure(
      'public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer)'
    ) IS NOT NULL AS list_events_ok,
    pg_catalog.to_regprocedure('public.booking_provider_list_services(uuid,uuid)') IS NOT NULL
      AS provider_services_ok,
    pg_catalog.to_regprocedure(
      'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)'
    ) IS NOT NULL AS provider_requests_ok,
    pg_catalog.to_regprocedure(
      'public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)'
    ) IS NOT NULL AS upsert_service_ok,
    pg_catalog.to_regprocedure(
      'public.booking_cancel_request(uuid,uuid,text,integer,uuid)'
    ) IS NOT NULL AS old_cancel_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.booking_requests')
        AND trigger_row.tgname = 'booking_requests_require_contact_phone'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled <> 'D'
    ) AS sql126_trigger_ok
), baseline_relations(name) AS (
  VALUES
    ('booking_services'), ('booking_requests'), ('booking_access_members'),
    ('booking_capability_sessions'), ('booking_messages'), ('booking_events')
), baseline_relation_contract AS (
  SELECT
    pg_catalog.count(relation.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy AS policy
          WHERE policy.polrelid = relation.oid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
          ) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE privilege.grantee = 0
             OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (VALUES
            ('anon'::name), ('authenticated'::name), ('service_role'::name)
          ) AS role(role_name)
          WHERE pg_catalog.has_table_privilege(role.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'UPDATE')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'DELETE')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'TRUNCATE')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'REFERENCES')
             OR pg_catalog.has_table_privilege(role.role_name, relation.oid, 'TRIGGER')
             OR pg_catalog.has_any_column_privilege(role.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_any_column_privilege(role.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_any_column_privilege(role.role_name, relation.oid, 'UPDATE')
             OR pg_catalog.has_any_column_privilege(role.role_name, relation.oid, 'REFERENCES')
        )
      ) AS baseline_private_tables_ok
  FROM baseline_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
), baseline_functions(signature, service_execute) AS (
  VALUES
    ('public.booking_provider_allowed(uuid,uuid)', false),
    ('public.booking_assert_provider(uuid,uuid)', false),
    ('public.booking_authorize_request(uuid,uuid,text)', false),
    ('public.booking_events_immutable()', false),
    ('public.booking_require_contact_phone()', false),
    ('public.booking_request_projection(uuid,text,text)', false),
    ('public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer)', true),
    ('public.booking_provider_list_services(uuid,uuid)', true),
    ('public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)', true),
    ('public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)', true),
    ('public.booking_cancel_request(uuid,uuid,text,integer,uuid)', true)
), baseline_function_contract AS (
  SELECT pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      procedure_row.prosecdef
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
        = expected.service_execute
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
        ) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantee <> procedure_row.proowner
          AND (
            NOT expected.service_execute
            OR grantee.rolname IS DISTINCT FROM 'service_role'
            OR privilege.is_grantable
          )
      )
    ) AS baseline_function_acl_owner_ok
  FROM baseline_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), baseline_trigger_contract AS (
  SELECT pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.booking_require_contact_phone()'
      )
      AND trigger_row.tgtype = 7
    ) AS sql126_trigger_binding_ok
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.booking_requests')
    AND trigger_row.tgname = 'booking_requests_require_contact_phone'
), sql129_functions AS (
  SELECT
    procedure_row.oid,
    procedure_row.proname,
    procedure_row.prosecdef,
    procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.jsonb') AS returns_jsonb,
    pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres' AS owner_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS search_path_ok,
    pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AS service_execute,
    NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AS browser_denied,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
      ) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee <> procedure_row.proowner
        AND (
          grantee.rolname IS DISTINCT FROM 'service_role'
          OR privilege.is_grantable
        )
    ) AS exact_raw_acl
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid IN (
    pg_catalog.to_regprocedure(
      'public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
    ),
    pg_catalog.to_regprocedure(
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
    )
  )
), sql129_contract AS (
  SELECT
    pg_catalog.count(*) = 2
      AND pg_catalog.bool_and(
        prosecdef AND returns_jsonb AND owner_ok AND search_path_ok
        AND service_execute AND browser_denied AND exact_raw_acl
      ) AS functions_ok,
    COALESCE(pg_catalog.bool_or(
      proname = 'booking_create_request_for_contact_owner'
      AND pg_catalog.strpos(
        (SELECT source.prosrc FROM pg_catalog.pg_proc AS source WHERE source.oid = sql129_functions.oid),
        'public.booking_create_request'
      ) > 0
      AND pg_catalog.strpos(
        (SELECT source.prosrc FROM pg_catalog.pg_proc AS source WHERE source.oid = sql129_functions.oid),
        $needle$COALESCE((v_result ->> 'created')::boolean, false)$needle$
      ) > 0
    ), false) AS delegation_ok
  FROM sql129_functions
), target_relations(name) AS (
  VALUES
    ('booking_workflows'),
    ('booking_workflow_versions'),
    ('booking_workflow_states'),
    ('booking_workflow_transitions'),
    ('booking_workflow_mutations')
), relation_collisions AS (
  SELECT COALESCE(pg_catalog.array_agg(name ORDER BY name), ARRAY[]::text[]) AS names
  FROM target_relations
  WHERE pg_catalog.to_regclass('public.' || name) IS NOT NULL
), column_collisions AS (
  SELECT COALESCE(pg_catalog.array_agg(
    column_row.table_name || '.' || column_row.column_name
    ORDER BY column_row.table_name, column_row.ordinal_position
  ), ARRAY[]::text[]) AS names
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND (
      (column_row.table_name = 'booking_services' AND column_row.column_name IN (
        'workflow_id', 'active_workflow_version_id', 'active_workflow_version_status'
      ))
      OR (column_row.table_name = 'booking_requests' AND column_row.column_name IN (
        'workflow_space_id', 'workflow_business_profile_id', 'workflow_id',
        'workflow_version_id', 'workflow_version_status', 'workflow_state_id',
        'cancellation_reason'
      ))
      OR (column_row.table_name = 'booking_events' AND column_row.column_name IN (
        'workflow_version_id', 'from_workflow_state_id', 'to_workflow_state_id',
        'cancellation_reason'
      ))
    )
), function_collisions AS (
  SELECT COALESCE(pg_catalog.array_agg(
    procedure_row.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) || ')'
    ORDER BY procedure_row.proname, procedure_row.oid
  ), ARRAY[]::text[]) AS names
  FROM pg_catalog.pg_proc AS procedure_row
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_row.pronamespace
  WHERE namespace.nspname = 'public'
    AND (
      procedure_row.proname IN (
        'booking_workflow_version_immutable', 'booking_workflow_graph_mutable',
        'booking_workflow_mutation_immutable', 'booking_workflow_graph_fingerprint',
        'booking_workflow_input_fingerprint', 'booking_validate_workflow_version',
        'booking_provision_default_workflow',
        'booking_assign_default_workflow_on_service_insert',
        'booking_assign_workflow_on_request_insert',
        'booking_workflow_graph_projection', 'booking_provider_read_workflow',
        'booking_provider_ensure_workflow_draft',
        'booking_provider_save_workflow_draft',
        'booking_provider_publish_workflow_draft', 'booking_transition_request',
        'booking_cancel_request_with_reason'
      )
      OR procedure_row.oid = pg_catalog.to_regprocedure(
        'public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer)'
      )
    )
), baseline AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.booking_services) AS service_rows,
    (SELECT pg_catalog.count(*) FROM public.booking_requests) AS request_rows,
    (SELECT pg_catalog.count(*) FROM public.booking_events) AS event_rows,
    (SELECT pg_catalog.count(*) FROM public.booking_messages) AS message_rows
), scope_health AS (
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NULL
         OR request_row.business_profile_id IS NULL
         OR request_row.service_id IS NULL
    ) AS null_scope,
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NOT NULL AND service.id IS NULL
    ) AS missing_live_service,
    pg_catalog.count(*) FILTER (
      WHERE request_row.service_id IS NOT NULL
        AND request_row.service_id_snapshot IS DISTINCT FROM request_row.service_id
    ) AS orphan_or_cross_scope
  FROM public.booking_requests AS request_row
  LEFT JOIN public.booking_services AS service
    ON service.space_id = request_row.space_id
   AND service.business_profile_id = request_row.business_profile_id
   AND service.id = request_row.service_id
), cancellation_health AS (
  SELECT pg_catalog.count(*) AS inconsistent_rows
  FROM public.booking_requests AS request_row
  WHERE (request_row.status = 'cancelled') IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.booking_events AS event_row
    WHERE event_row.booking_request_id = request_row.id
      AND event_row.event_type = 'request_cancelled'
  )
), contract AS (
  SELECT
    role_contract.*,
    dependencies.*,
    baseline_relation_contract.baseline_private_tables_ok,
    baseline_function_contract.baseline_function_acl_owner_ok,
    baseline_trigger_contract.sql126_trigger_binding_ok,
    sql129_contract.functions_ok AS sql129_functions_ok,
    sql129_contract.delegation_ok AS sql129_delegation_ok,
    relation_collisions.names AS relation_collisions,
    column_collisions.names AS column_collisions,
    function_collisions.names AS function_collisions,
    baseline.*,
    scope_health.*,
    cancellation_health.inconsistent_rows AS cancellation_inconsistent
  FROM role_contract CROSS JOIN dependencies CROSS JOIN baseline_relation_contract
  CROSS JOIN baseline_function_contract CROSS JOIN baseline_trigger_contract
  CROSS JOIN sql129_contract
  CROSS JOIN relation_collisions CROSS JOIN column_collisions
  CROSS JOIN function_collisions CROSS JOIN baseline CROSS JOIN scope_health
  CROSS JOIN cancellation_health
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  service_rows,
  request_rows,
  event_rows,
  message_rows,
  null_scope,
  missing_live_service,
  orphan_or_cross_scope,
  cancellation_inconsistent,
  relation_collisions,
  column_collisions,
  function_collisions,
  sql129_functions_ok,
  sql129_delegation_ok,
  baseline_private_tables_ok,
  baseline_function_acl_owner_ok,
  sql126_trigger_binding_ok,
  required_roles_ok AND execution_role_ok
    AND services_ok AND requests_ok AND events_ok AND messages_ok
    AND members_ok AND sessions_ok
    AND auth_users_ok AND provider_guard_ok AND request_guard_ok AND event_guard_ok
    AND contact_phone_guard_ok AND request_projection_ok AND list_events_ok
    AND provider_services_ok AND provider_requests_ok AND upsert_service_ok
    AND old_cancel_ok AND sql126_trigger_ok
    AND baseline_private_tables_ok AND baseline_function_acl_owner_ok
    AND sql126_trigger_binding_ok
    AND sql129_functions_ok AND sql129_delegation_ok
    AND pg_catalog.cardinality(relation_collisions) = 0
    AND pg_catalog.cardinality(column_collisions) = 0
    AND pg_catalog.cardinality(function_collisions) = 0
    AND null_scope = 0 AND missing_live_service = 0
    AND orphan_or_cross_scope = 0 AND cancellation_inconsistent = 0
    AS prerequisites_ok
FROM contract;

ROLLBACK;
