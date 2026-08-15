-- SQL130 customizable booking workflows postflight -- READ ONLY.
-- Require postconditions_ok=true and compare the four row counts with preflight.

BEGIN;
SET TRANSACTION READ ONLY;

WITH RECURSIVE expected_relations(name) AS (
  VALUES
    ('booking_workflows'), ('booking_workflow_versions'),
    ('booking_workflow_states'), ('booking_workflow_transitions'),
    ('booking_workflow_mutations')
), relation_contract AS (
  SELECT
    pg_catalog.count(relation.oid) = 5
      AND pg_catalog.bool_and(
        relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      ) AS rls_force_owner_ok,
    pg_catalog.bool_and(NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation.oid
    )) AS no_policies_ok,
    pg_catalog.bool_and(
      NOT EXISTS (
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
      )
    ) AS no_effective_table_privileges_ok
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
  GROUP BY ()
), column_acl AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.column_privileges AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (SELECT name FROM expected_relations)
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) AND NOT EXISTS (
    SELECT 1
    FROM expected_relations AS expected
    CROSS JOIN (VALUES
      ('anon'::name), ('authenticated'::name), ('service_role'::name)
    ) AS role(role_name)
    WHERE pg_catalog.has_any_column_privilege(
      role.role_name,
      pg_catalog.to_regclass('public.' || expected.name),
      'SELECT'
    ) OR pg_catalog.has_any_column_privilege(
      role.role_name,
      pg_catalog.to_regclass('public.' || expected.name),
      'INSERT'
    ) OR pg_catalog.has_any_column_privilege(
      role.role_name,
      pg_catalog.to_regclass('public.' || expected.name),
      'UPDATE'
    ) OR pg_catalog.has_any_column_privilege(
      role.role_name,
      pg_catalog.to_regclass('public.' || expected.name),
      'REFERENCES'
    )
  ) AS no_column_privileges_ok
), expected_constraints(table_name, constraint_name, constraint_type, tokens) AS (
  VALUES
    ('booking_workflows', 'booking_workflows_scope_service_id_key', 'u',
      ARRAY['UNIQUE', 'space_id', 'business_profile_id', 'service_id_snapshot', 'id']),
    ('booking_workflow_versions', 'booking_workflow_versions_workflow_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflows', 'space_id', 'business_profile_id', 'workflow_id', 'ON DELETE RESTRICT']),
    ('booking_workflow_versions', 'booking_workflow_versions_scope_id_status_key', 'u',
      ARRAY['UNIQUE', 'space_id', 'business_profile_id', 'workflow_id', 'id', 'status']),
    ('booking_workflow_versions', 'booking_workflow_versions_publish_check', 'c',
      ARRAY['published_at', 'graph_fingerprint', 'published']),
    ('booking_workflow_states', 'booking_workflow_states_version_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_versions', 'workflow_version_id', 'ON DELETE RESTRICT']),
    ('booking_workflow_states', 'booking_workflow_states_label_source_check', 'c',
      ARRAY['system_label_key', 'provider_label', 'customer_label']),
    ('booking_workflow_states', 'booking_workflow_states_sort_key', 'u',
      ARRAY['UNIQUE', 'workflow_version_id', 'sort_order', 'DEFERRABLE']),
    ('booking_workflow_transitions', 'booking_workflow_transitions_no_self_check', 'c',
      ARRAY['from_state_id', 'to_state_id']),
    ('booking_workflow_transitions', 'booking_workflow_transitions_from_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_states', 'workflow_version_id', 'from_state_id', 'ON DELETE RESTRICT']),
    ('booking_workflow_transitions', 'booking_workflow_transitions_to_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_states', 'workflow_version_id', 'to_state_id', 'ON DELETE RESTRICT']),
    ('booking_services', 'booking_services_workflow_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflows', 'service_id_snapshot', 'workflow_id', 'ON DELETE RESTRICT']),
    ('booking_services', 'booking_services_active_workflow_version_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_versions', 'active_workflow_version_id', 'active_workflow_version_status', 'ON DELETE RESTRICT']),
    ('booking_services', 'booking_services_active_version_status_check', 'c',
      ARRAY['active_workflow_version_status', 'published']),
    ('booking_requests', 'booking_requests_workflow_live_scope_check', 'c',
      ARRAY['service_id', 'service_id_snapshot', 'workflow_space_id', 'workflow_business_profile_id']),
    ('booking_requests', 'booking_requests_cancellation_reason_check', 'c',
      ARRAY['cancellation_reason IS NOT NULL', 'legacy_unspecified']),
    ('booking_requests', 'booking_requests_workflow_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflows', 'service_id_snapshot', 'workflow_id', 'ON DELETE RESTRICT']),
    ('booking_requests', 'booking_requests_workflow_version_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_versions', 'workflow_version_id', 'workflow_version_status', 'ON DELETE RESTRICT']),
    ('booking_requests', 'booking_requests_workflow_version_status_check', 'c',
      ARRAY['workflow_version_status', 'published']),
    ('booking_requests', 'booking_requests_workflow_state_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_states', 'workflow_state_id', 'ON DELETE RESTRICT']),
    ('booking_events', 'booking_events_workflow_shape_check', 'c',
      ARRAY['workflow_state_changed', 'from_workflow_state_id', 'to_workflow_state_id']),
    ('booking_events', 'booking_events_cancellation_reason_check', 'c',
      ARRAY['request_cancelled', 'cancellation_reason', 'legacy_unspecified']),
    ('booking_events', 'booking_events_from_workflow_state_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_states', 'from_workflow_state_id', 'MATCH FULL', 'ON DELETE RESTRICT']),
    ('booking_events', 'booking_events_to_workflow_state_fk', 'f',
      ARRAY['FOREIGN KEY', 'booking_workflow_states', 'to_workflow_state_id', 'MATCH FULL', 'ON DELETE RESTRICT'])
), constraint_contract AS (
  SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND constraint_row.contype::text = expected.constraint_type
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(expected.tokens) AS token
        WHERE pg_catalog.strpos(
          pg_catalog.pg_get_constraintdef(constraint_row.oid), token
        ) = 0
      )
    ) AS critical_constraints_ok
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND constraint_row.conname = expected.constraint_name
), expected_indexes(index_name, predicate_token) AS (
  VALUES
    ('booking_workflow_versions_one_draft_idx', 'status'),
    ('booking_workflow_states_one_initial_idx', 'is_initial'),
    ('booking_workflow_states_one_confirmed_idx', 'semantic_kind')
), index_contract AS (
  SELECT pg_catalog.count(index_relation.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      index_state.indisunique
      AND index_state.indisvalid
      AND index_state.indpred IS NOT NULL
      AND pg_catalog.strpos(
        pg_catalog.pg_get_indexdef(index_relation.oid), expected.predicate_token
      ) > 0
    ) AS critical_partial_unique_indexes_ok
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = pg_catalog.to_regclass('public.' || expected.index_name)
  LEFT JOIN pg_catalog.pg_index AS index_state ON index_state.indexrelid = index_relation.oid
), expected_functions(signature, service_execute) AS (
  VALUES
    ('public.booking_workflow_version_immutable()', false),
    ('public.booking_workflow_graph_mutable()', false),
    ('public.booking_workflow_mutation_immutable()', false),
    ('public.booking_workflow_graph_fingerprint(uuid)', false),
    ('public.booking_workflow_input_fingerprint(jsonb)', false),
    ('public.booking_validate_workflow_version(uuid)', false),
    ('public.booking_provision_default_workflow(uuid,uuid,uuid,uuid)', false),
    ('public.booking_assign_default_workflow_on_service_insert()', false),
    ('public.booking_assign_workflow_on_request_insert()', false),
    ('public.booking_workflow_graph_projection(uuid)', false),
    ('public.booking_provider_read_workflow(uuid,uuid,uuid)', true),
    ('public.booking_provider_ensure_workflow_draft(uuid,uuid,uuid,integer,uuid)', true),
    ('public.booking_provider_save_workflow_draft(uuid,uuid,uuid,uuid,integer,jsonb,uuid)', true),
    ('public.booking_provider_publish_workflow_draft(uuid,uuid,uuid,uuid,integer,uuid)', true),
    ('public.booking_transition_request(uuid,uuid,uuid,integer,uuid)', true),
    ('public.booking_cancel_request_with_reason(uuid,uuid,text,integer,uuid,text)', true),
    ('public.booking_request_projection(uuid,text,text)', false),
    ('public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer)', true),
    ('public.booking_provider_list_services(uuid,uuid)', true),
    ('public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer)', true),
    ('public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)', true)
), function_contract AS (
  SELECT
    pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        procedure_row.prosecdef
        AND procedure_row.prorettype IN (
          pg_catalog.to_regtype('pg_catalog.jsonb'),
          pg_catalog.to_regtype('pg_catalog.text'),
          pg_catalog.to_regtype('pg_catalog.void'),
          pg_catalog.to_regtype('pg_catalog.trigger'),
          pg_catalog.to_regtype('pg_catalog.record')
        )
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
      ) AS sql130_function_acl_owner_ok
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), old_bypass_contract AS (
  SELECT
    NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.booking_cancel_request(uuid,uuid,text,integer,uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.booking_cancel_request(uuid,uuid,text,integer,uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.booking_cancel_request(uuid,uuid,text,integer,uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)',
      'EXECUTE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
      ) AS privilege
      WHERE procedure_row.oid IN (
        pg_catalog.to_regprocedure(
          'public.booking_cancel_request(uuid,uuid,text,integer,uuid)'
        ),
        pg_catalog.to_regprocedure(
          'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)'
        )
      )
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ) AS old_callable_bypasses_revoked_ok
), sensitive_overload_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_row.proname IN (
        'booking_cancel_request',
        'booking_cancel_request_with_reason',
        'booking_provider_list_requests'
      )
      AND procedure_row.oid NOT IN (
        pg_catalog.to_regprocedure(
          'public.booking_cancel_request(uuid,uuid,text,integer,uuid)'
        ),
        pg_catalog.to_regprocedure(
          'public.booking_cancel_request_with_reason(uuid,uuid,text,integer,uuid,text)'
        ),
        pg_catalog.to_regprocedure(
          'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)'
        ),
        pg_catalog.to_regprocedure(
          'public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer)'
        )
      )
  ) AS no_unexpected_sensitive_overloads_ok
), sql129_functions AS (
  SELECT
    procedure_row.oid,
    procedure_row.proname,
    procedure_row.prosrc,
    procedure_row.prosecdef,
    procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.jsonb') AS returns_jsonb,
    pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres' AS owner_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS search_path_ok,
    pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AS effective_acl_ok,
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
    ) AS raw_acl_ok
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
  SELECT pg_catalog.count(*) = 2
    AND pg_catalog.bool_and(
      prosecdef AND returns_jsonb AND owner_ok AND search_path_ok
      AND effective_acl_ok AND raw_acl_ok
    )
    AND pg_catalog.bool_or(
      proname = 'booking_create_request_for_contact_owner'
      AND pg_catalog.strpos(prosrc, 'public.booking_create_request') > 0
      AND pg_catalog.strpos(
        prosrc,
        $needle$COALESCE((v_result ->> 'created')::boolean, false)$needle$
      ) > 0
    ) AS sql129_chain_ok
  FROM sql129_functions
), service_health AS (
  SELECT
    pg_catalog.count(*) AS service_rows,
    pg_catalog.count(*) FILTER (
      WHERE workflow.id IS NULL OR active_version.id IS NULL
    ) AS invalid_active_scope,
    pg_catalog.count(DISTINCT workflow.id) = pg_catalog.count(*)
      AND pg_catalog.count(DISTINCT active_version.id) = pg_catalog.count(*)
      AS one_default_workflow_version_per_service,
    pg_catalog.bool_and(
      active_version.version_number = 1
      AND active_version.status = 'published'
      AND (
        SELECT pg_catalog.count(*) = 5
          AND pg_catalog.count(*) FILTER (WHERE state.is_initial) = 1
          AND pg_catalog.count(*) FILTER (WHERE state.semantic_kind = 'confirmed') = 1
          AND pg_catalog.count(*) FILTER (WHERE state.system_label_key IN (
            'new_request', 'under_review', 'waiting_customer',
            'waiting_provider', 'confirmed'
          )) = 5
        FROM public.booking_workflow_states AS state
        WHERE state.workflow_version_id = active_version.id
      )
      AND (
        SELECT pg_catalog.count(*) = 10
        FROM public.booking_workflow_transitions AS edge
        WHERE edge.workflow_version_id = active_version.id
      )
      AND NOT EXISTS (
        SELECT expected.from_key, expected.to_key
        FROM (VALUES
          ('new_request', 'under_review'),
          ('under_review', 'waiting_customer'),
          ('under_review', 'waiting_provider'),
          ('under_review', 'confirmed'),
          ('waiting_customer', 'waiting_provider'),
          ('waiting_customer', 'under_review'),
          ('waiting_customer', 'confirmed'),
          ('waiting_provider', 'waiting_customer'),
          ('waiting_provider', 'under_review'),
          ('waiting_provider', 'confirmed')
        ) AS expected(from_key, to_key)
        EXCEPT
        SELECT source.logical_key, target.logical_key
        FROM public.booking_workflow_transitions AS edge
        JOIN public.booking_workflow_states AS source ON source.id = edge.from_state_id
        JOIN public.booking_workflow_states AS target ON target.id = edge.to_state_id
        WHERE edge.workflow_version_id = active_version.id
      )
    ) AS default_graphs_ok
  FROM public.booking_services AS service
  LEFT JOIN public.booking_workflows AS workflow
    ON workflow.id = service.workflow_id
   AND workflow.space_id = service.space_id
   AND workflow.business_profile_id = service.business_profile_id
   AND workflow.service_id_snapshot = service.id
  LEFT JOIN public.booking_workflow_versions AS active_version
    ON active_version.id = service.active_workflow_version_id
   AND active_version.workflow_id = service.workflow_id
   AND active_version.space_id = service.space_id
   AND active_version.business_profile_id = service.business_profile_id
   AND active_version.status = 'published'
), request_health AS (
  SELECT
    pg_catalog.count(*) AS request_rows,
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NULL
         OR request_row.business_profile_id IS NULL
         OR request_row.service_id IS NULL
    ) AS null_scope,
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NOT NULL AND service.id IS NULL
    ) AS missing_live_service,
    pg_catalog.count(*) FILTER (
      WHERE state.id IS NULL
         OR workflow.id IS NULL
         OR request_row.workflow_version_status <> 'published'
         OR request_row.workflow_space_id IS NULL
         OR request_row.workflow_business_profile_id IS NULL
         OR request_row.workflow_id IS NULL
         OR request_row.workflow_version_id IS NULL
         OR request_row.workflow_state_id IS NULL
    ) AS unpinned_or_cross_scope,
    pg_catalog.count(*) FILTER (
      WHERE (request_row.status = 'requested' AND request_row.cancellation_reason IS NOT NULL)
         OR (request_row.status = 'cancelled' AND (
           request_row.cancellation_reason IS NULL
           OR request_row.cancellation_reason NOT IN (
             'customer_cancelled', 'provider_unavailable', 'other', 'legacy_unspecified'
           )
         ))
    ) AS invalid_cancellation_reason
  FROM public.booking_requests AS request_row
  LEFT JOIN public.booking_services AS service
    ON service.id = request_row.service_id
   AND service.space_id = request_row.space_id
   AND service.business_profile_id = request_row.business_profile_id
  LEFT JOIN public.booking_workflow_states AS state
    ON state.id = request_row.workflow_state_id
   AND state.workflow_version_id = request_row.workflow_version_id
   AND state.workflow_id = request_row.workflow_id
   AND state.space_id = request_row.workflow_space_id
   AND state.business_profile_id = request_row.workflow_business_profile_id
  LEFT JOIN public.booking_workflows AS workflow
    ON workflow.id = request_row.workflow_id
   AND workflow.space_id = request_row.workflow_space_id
   AND workflow.business_profile_id = request_row.workflow_business_profile_id
   AND workflow.service_id_snapshot = request_row.service_id_snapshot
), version_stats AS (
  SELECT
    version_row.id,
    pg_catalog.count(DISTINCT state.id) AS state_count,
    pg_catalog.count(DISTINCT edge.from_state_id::text || ':' || edge.to_state_id::text)
      AS edge_count,
    pg_catalog.count(DISTINCT state.id) FILTER (WHERE state.is_initial) AS initial_count,
    pg_catalog.count(DISTINCT state.id) FILTER (
      WHERE state.semantic_kind = 'confirmed'
    ) AS confirmed_count,
    pg_catalog.min(state.sort_order) AS sort_min,
    pg_catalog.max(state.sort_order) AS sort_max,
    pg_catalog.count(DISTINCT edge.from_state_id) FILTER (
      WHERE source.semantic_kind = 'confirmed'
    ) AS confirmed_outgoing
  FROM public.booking_workflow_versions AS version_row
  LEFT JOIN public.booking_workflow_states AS state
    ON state.workflow_version_id = version_row.id
  LEFT JOIN public.booking_workflow_transitions AS edge
    ON edge.workflow_version_id = version_row.id
  LEFT JOIN public.booking_workflow_states AS source ON source.id = edge.from_state_id
  GROUP BY version_row.id
), reachable(version_id, state_id) AS (
  SELECT state.workflow_version_id, state.id
  FROM public.booking_workflow_states AS state
  WHERE state.is_initial
  UNION
  SELECT edge.workflow_version_id, edge.to_state_id
  FROM public.booking_workflow_transitions AS edge
  JOIN reachable
    ON reachable.version_id = edge.workflow_version_id
   AND reachable.state_id = edge.from_state_id
), graph_health AS (
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM version_stats AS stats
      WHERE stats.state_count NOT BETWEEN 1 AND 20
         OR stats.edge_count > 100
         OR stats.initial_count <> 1
         OR stats.confirmed_count <> 1
         OR stats.sort_min <> 0
         OR stats.sort_max <> stats.state_count - 1
         OR stats.confirmed_outgoing <> 0
         OR (SELECT pg_catalog.count(*) FROM reachable
             WHERE reachable.version_id = stats.id) <> stats.state_count
    ) AS all_graphs_valid,
    NOT EXISTS (
      SELECT workflow_id
      FROM public.booking_workflow_versions
      WHERE status = 'draft'
      GROUP BY workflow_id HAVING pg_catalog.count(*) > 1
    ) AS at_most_one_draft_ok
), event_health AS (
  SELECT
    pg_catalog.count(*) AS event_rows,
    pg_catalog.count(*) FILTER (
      WHERE (event_row.event_type = 'workflow_state_changed') IS DISTINCT FROM (
        event_row.workflow_version_id IS NOT NULL
        AND event_row.from_workflow_state_id IS NOT NULL
        AND event_row.to_workflow_state_id IS NOT NULL
      )
      OR (event_row.event_type = 'request_cancelled') IS DISTINCT FROM (
        event_row.cancellation_reason IS NOT NULL
      )
    ) AS invalid_event_rows
  FROM public.booking_events AS event_row
), expected_triggers(table_name, trigger_name, function_signature, trigger_type) AS (
  VALUES
    ('booking_services', 'booking_services_assign_default_workflow',
      'public.booking_assign_default_workflow_on_service_insert()', 7),
    ('booking_requests', 'booking_requests_assign_workflow',
      'public.booking_assign_workflow_on_request_insert()', 7),
    ('booking_workflow_versions', 'booking_workflow_versions_immutable_guard',
      'public.booking_workflow_version_immutable()', 27),
    ('booking_workflow_states', 'booking_workflow_states_mutable_guard',
      'public.booking_workflow_graph_mutable()', 31),
    ('booking_workflow_transitions', 'booking_workflow_transitions_mutable_guard',
      'public.booking_workflow_graph_mutable()', 31),
    ('booking_workflow_mutations', 'booking_workflow_mutations_immutable_guard',
      'public.booking_workflow_mutation_immutable()', 27),
    ('booking_events', 'booking_events_immutable_guard',
      'public.booking_events_immutable()', 27)
), trigger_health AS (
  SELECT pg_catalog.count(trigger_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(expected.function_signature)
      AND trigger_row.tgtype = expected.trigger_type
    ) AS immutability_and_pin_triggers_ok
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND trigger_row.tgname = expected.trigger_name
), counts AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.booking_messages) AS message_rows
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  service_health.service_rows,
  request_health.request_rows,
  event_health.event_rows,
  counts.message_rows,
  request_health.null_scope,
  request_health.missing_live_service,
  request_health.unpinned_or_cross_scope,
  request_health.invalid_cancellation_reason,
  event_health.invalid_event_rows,
  relation_contract.rls_force_owner_ok,
  relation_contract.no_policies_ok,
  relation_contract.no_effective_table_privileges_ok,
  column_acl.no_column_privileges_ok,
  constraint_contract.critical_constraints_ok,
  index_contract.critical_partial_unique_indexes_ok,
  function_contract.sql130_function_acl_owner_ok,
  old_bypass_contract.old_callable_bypasses_revoked_ok,
  sensitive_overload_contract.no_unexpected_sensitive_overloads_ok,
  sql129_contract.sql129_chain_ok,
  service_health.one_default_workflow_version_per_service,
  service_health.default_graphs_ok,
  graph_health.all_graphs_valid,
  graph_health.at_most_one_draft_ok,
  trigger_health.immutability_and_pin_triggers_ok,
  service_health.invalid_active_scope = 0
    AND request_health.null_scope = 0
    AND request_health.missing_live_service = 0
    AND request_health.unpinned_or_cross_scope = 0
    AND request_health.invalid_cancellation_reason = 0
    AND event_health.invalid_event_rows = 0
    AND relation_contract.rls_force_owner_ok
    AND relation_contract.no_policies_ok
    AND relation_contract.no_effective_table_privileges_ok
    AND column_acl.no_column_privileges_ok
    AND constraint_contract.critical_constraints_ok
    AND index_contract.critical_partial_unique_indexes_ok
    AND function_contract.sql130_function_acl_owner_ok
    AND old_bypass_contract.old_callable_bypasses_revoked_ok
    AND sensitive_overload_contract.no_unexpected_sensitive_overloads_ok
    AND sql129_contract.sql129_chain_ok
    AND service_health.one_default_workflow_version_per_service
    AND COALESCE(service_health.default_graphs_ok, true)
    AND graph_health.all_graphs_valid
    AND graph_health.at_most_one_draft_ok
    AND trigger_health.immutability_and_pin_triggers_ok
    AS postconditions_ok
FROM service_health CROSS JOIN request_health CROSS JOIN event_health
CROSS JOIN relation_contract CROSS JOIN column_acl CROSS JOIN constraint_contract
CROSS JOIN index_contract CROSS JOIN function_contract
CROSS JOIN old_bypass_contract CROSS JOIN sensitive_overload_contract
CROSS JOIN sql129_contract CROSS JOIN graph_health
CROSS JOIN trigger_health CROSS JOIN counts;

ROLLBACK;
