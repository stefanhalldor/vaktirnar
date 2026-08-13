-- SQL125 booking guest-intake postflight -- READ ONLY.
-- Run only after Stebbi has separately applied SQL125. Share the complete
-- single result row; every *_ok value must be true before app rollout.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_tables(table_name, column_count, constraint_count) AS (
  VALUES
    ('booking_services', 18, 14),
    ('booking_requests', 34, 25),
    ('booking_access_members', 11, 10),
    ('booking_capability_sessions', 8, 7),
    ('booking_messages', 12, 12),
    ('booking_events', 13, 12)
), table_state AS (
  SELECT
    expected.table_name,
    expected.column_count,
    expected.constraint_count,
    relation.oid,
    relation.relowner,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM expected_tables AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = pg_catalog.to_regnamespace('public')
   AND relation.relname = expected.table_name
   AND relation.relkind = 'r'
), actual_column_counts AS (
  SELECT column_row.table_name, pg_catalog.count(*)::integer AS column_count
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
  GROUP BY column_row.table_name
), critical_columns(table_name, column_name, udt_name, is_nullable) AS (
  VALUES
    ('booking_services', 'space_id', 'uuid', 'NO'),
    ('booking_services', 'business_profile_id', 'uuid', 'NO'),
    ('booking_services', 'signed_in_discount_bps', 'int4', 'YES'),
    ('booking_requests', 'space_id', 'uuid', 'YES'),
    ('booking_requests', 'business_profile_id', 'uuid', 'YES'),
    ('booking_requests', 'service_id', 'uuid', 'YES'),
    ('booking_requests', 'service_id_snapshot', 'uuid', 'NO'),
    ('booking_requests', 'business_profile_slug_snapshot', 'text', 'NO'),
    ('booking_requests', 'provider_name_snapshot', 'text', 'NO'),
    ('booking_requests', 'service_title_snapshot', 'text', 'NO'),
    ('booking_requests', 'provider_timezone', 'text', 'NO'),
    ('booking_requests', 'eligible_discount_bps', 'int4', 'YES'),
    ('booking_requests', 'applied_discount_bps', 'int4', 'YES'),
    ('booking_requests', 'contact_email', 'text', 'NO'),
    ('booking_requests', 'contact_message', 'text', 'NO'),
    ('booking_requests', 'guest_capability_hash', 'text', 'YES'),
    ('booking_requests', 'create_request_id', 'uuid', 'NO'),
    ('booking_requests', 'request_fingerprint', 'text', 'NO'),
    ('booking_access_members', 'canonical_email', 'text', 'NO'),
    ('booking_access_members', 'role', 'text', 'NO'),
    ('booking_access_members', 'status', 'text', 'NO'),
    ('booking_capability_sessions', 'session_token_hash', 'text', 'NO'),
    ('booking_capability_sessions', 'access_version', 'int4', 'NO'),
    ('booking_messages', 'sender_key', 'text', 'NO'),
    ('booking_messages', 'capability_session_id', 'uuid', 'YES'),
    ('booking_messages', 'author_name_snapshot', 'text', 'YES'),
    ('booking_messages', 'body', 'text', 'NO'),
    ('booking_events', 'event_type', 'text', 'NO'),
    ('booking_events', 'operation_fingerprint', 'text', 'NO'),
    ('booking_events', 'event_data', 'jsonb', 'NO')
), actual_columns AS (
  SELECT
    column_row.table_name::text,
    column_row.column_name::text,
    column_row.udt_name::text,
    column_row.is_nullable::text
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), constraint_state AS (
  SELECT
    relation.relname AS table_name,
    constraint_row.conname,
    constraint_row.contype,
    constraint_row.confdeltype,
    constraint_row.confmatchtype,
    constraint_row.convalidated,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), actual_constraint_counts AS (
  SELECT state.table_name, pg_catalog.count(*)::integer AS constraint_count
  FROM constraint_state AS state
  GROUP BY state.table_name
), table_acl AS (
  SELECT
    table_row.table_name,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM table_state AS table_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = table_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), column_acl AS (
  SELECT
    table_row.table_name,
    attribute.attname AS column_name,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM table_state AS table_row
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = table_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attacl IS NOT NULL
), access_roles(role_name) AS (
  VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
), table_effective_privileges AS (
  SELECT
    table_row.table_name,
    access_role.role_name,
    privilege_name,
    pg_catalog.has_table_privilege(
      access_role.role_name,
      table_row.oid,
      privilege_name
    ) AS has_privilege
  FROM table_state AS table_row
  CROSS JOIN access_roles AS access_role
  CROSS JOIN pg_catalog.unnest(ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]::text[]) AS privilege_row(privilege_name)
), column_effective_privileges AS (
  SELECT
    table_row.table_name,
    access_role.role_name,
    privilege_name,
    pg_catalog.has_any_column_privilege(
      access_role.role_name,
      table_row.oid,
      privilege_name
    ) AS has_privilege
  FROM table_state AS table_row
  CROSS JOIN access_roles AS access_role
  CROSS JOIN pg_catalog.unnest(ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
  ]::text[]) AS privilege_row(privilege_name)
), expected_indexes(index_name) AS (
  VALUES
    ('booking_services_pkey'),
    ('booking_services_space_profile_id_key'),
    ('booking_services_one_active_profile_idx'),
    ('booking_services_last_idempotency_key_idx'),
    ('booking_services_public_idx'),
    ('booking_requests_pkey'),
    ('booking_requests_public_id_key'),
    ('booking_requests_create_request_id_key'),
    ('booking_requests_provider_created_idx'),
    ('booking_access_members_pkey'),
    ('booking_access_members_request_email_key'),
    ('booking_access_members_active_idx'),
    ('booking_capability_sessions_pkey'),
    ('booking_capability_sessions_token_hash_key'),
    ('booking_capability_sessions_request_idx'),
    ('booking_messages_pkey'),
    ('booking_messages_client_message_key'),
    ('booking_messages_idempotency_key'),
    ('booking_messages_request_time_idx'),
    ('booking_events_pkey'),
    ('booking_events_idempotency_key'),
    ('booking_events_request_time_idx')
), actual_indexes AS (
  SELECT index_row.indexname AS index_name
  FROM pg_catalog.pg_indexes AS index_row
  WHERE index_row.schemaname = 'public'
    AND index_row.tablename IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), expected_functions(signature, service_role_execute) AS (
  VALUES
    ('public.booking_canonical_email(text)', false),
    ('public.booking_provider_allowed(uuid,uuid)', false),
    ('public.booking_assert_provider(uuid,uuid)', false),
    ('public.booking_authorize_request(uuid,uuid,text)', false),
    ('public.booking_events_immutable()', false),
    ('public.booking_request_projection(uuid,text,text)', false),
    ('public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)', true),
    ('public.booking_resolve_public(text)', true),
    ('public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)', true),
    ('public.booking_resolve_create_replay(uuid,text,uuid,text,text,text,text,date,time without time zone,text)', true),
    ('public.booking_exchange_capability(uuid,text,text,timestamp with time zone)', true),
    ('public.booking_read_request(uuid,uuid,text)', true),
    ('public.booking_list_messages(uuid,uuid,text,timestamp with time zone,uuid,integer)', true),
    ('public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer)', true),
    ('public.booking_provider_list_services(uuid,uuid)', true),
    ('public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)', true),
    ('public.booking_send_message(uuid,uuid,text,text,uuid,uuid)', true),
    ('public.booking_cancel_request(uuid,uuid,text,integer,uuid)', true),
    ('public.booking_claim_request(uuid,uuid,text,integer,text[],uuid)', true),
    ('public.booking_manage_member(uuid,uuid,integer,text,text,uuid)', true)
), function_state AS (
  SELECT
    expected.signature,
    expected.service_role_execute,
    procedure.oid,
    procedure.prosecdef,
    procedure.prosrc,
    pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature)
), function_acl AS (
  SELECT
    procedure.oid,
    procedure.proname,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE namespace.nspname = 'public'
    AND procedure.proname LIKE 'booking_%'
), function_effective_privileges AS (
  SELECT
    state.signature,
    state.service_role_execute,
    access_role.role_name,
    pg_catalog.has_function_privilege(
      access_role.role_name,
      state.oid,
      'EXECUTE'
    ) AS has_execute
  FROM function_state AS state
  CROSS JOIN access_roles AS access_role
), feature_constraint AS (
  SELECT
    constraint_row.convalidated,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
), trigger_state AS (
  SELECT
    trigger_row.tgname,
    trigger_row.tgtype,
    trigger_row.tgenabled,
    trigger_row.tgfoid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.booking_events')
    AND NOT trigger_row.tgisinternal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  (SELECT pg_catalog.count(*) = 6
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 6
      AND pg_catalog.bool_and(relrowsecurity)
      AND pg_catalog.bool_and(relforcerowsecurity)
      AND pg_catalog.bool_and(owner_name = 'postgres')
   FROM table_state) AS exact_private_tables_force_rls_owner_ok,
  NOT EXISTS (
    SELECT 1
    FROM expected_tables AS expected
    LEFT JOIN actual_column_counts AS actual USING (table_name)
    WHERE actual.column_count IS DISTINCT FROM expected.column_count
  ) AS exact_table_column_counts_ok,
  NOT EXISTS (
    SELECT expected.* FROM critical_columns AS expected
    EXCEPT SELECT actual.* FROM actual_columns AS actual
  ) AS critical_column_types_and_nullability_ok,
  NOT EXISTS (
    SELECT 1
    FROM expected_tables AS expected
    LEFT JOIN actual_constraint_counts AS actual USING (table_name)
    WHERE actual.constraint_count IS DISTINCT FROM expected.constraint_count
  )
    AND NOT EXISTS (SELECT 1 FROM constraint_state WHERE NOT convalidated)
    AS exact_validated_constraint_counts_ok,
  NOT EXISTS (
    SELECT expected.index_name FROM expected_indexes AS expected
    EXCEPT SELECT actual.index_name FROM actual_indexes AS actual
  )
    AND NOT EXISTS (
      SELECT actual.index_name FROM actual_indexes AS actual
      EXCEPT SELECT expected.index_name FROM expected_indexes AS expected
    ) AS exact_indexes_ok,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (SELECT present.oid FROM table_state AS present)
  ) AS default_deny_no_policies_ok,
  NOT EXISTS (
    SELECT 1 FROM table_acl AS privilege
    WHERE privilege.grantee <> 'postgres'
  )
    AND NOT EXISTS (
      SELECT 1 FROM column_acl AS privilege
      WHERE privilege.grantee <> 'postgres'
    )
    AND NOT EXISTS (
      SELECT 1 FROM table_effective_privileges AS privilege
      WHERE privilege.has_privilege IS DISTINCT FROM false
    )
    AND NOT EXISTS (
      SELECT 1 FROM column_effective_privileges AS privilege
      WHERE privilege.has_privilege IS DISTINCT FROM false
    ) AS exact_no_non_owner_table_column_privileges_ok,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE table_name = 'booking_services'
      AND conname = 'booking_services_profile_fk'
      AND contype = 'f'
      AND confdeltype = 'c'
      AND definition LIKE '%FOREIGN KEY (space_id, business_profile_id)%'
      AND definition LIKE '%business_profiles(space_id, id)%'
  ) AS business_profile_composite_fk_ok,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE table_name = 'booking_requests'
      AND conname = 'booking_requests_service_fk'
      AND contype = 'f'
      AND confdeltype = 'n'
      AND confmatchtype = 'f'
      AND definition LIKE '%MATCH FULL ON DELETE SET NULL%'
  )
    AND EXISTS (
      SELECT 1 FROM constraint_state
      WHERE table_name = 'booking_events'
        AND conname = 'booking_events_request_fk'
        AND contype = 'f'
        AND confdeltype = 'r'
    ) AS history_retention_foreign_keys_ok,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE table_name = 'booking_requests'
      AND conname = 'booking_requests_contact_email_check'
      AND definition LIKE '%254%'
  )
    AND EXISTS (
      SELECT 1 FROM constraint_state
      WHERE table_name = 'booking_access_members'
        AND conname = 'booking_access_members_email_check'
        AND definition LIKE '%booking_canonical_email%IS NOT NULL%'
    ) AS exact_254_email_contract_ok,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE table_name = 'booking_requests'
      AND conname = 'booking_requests_capability_state_check'
      AND definition LIKE '%access_mode = ''link''%applied_discount_bps IS NULL%'
  ) AS guest_cannot_receive_create_discount_ok,
  (SELECT pg_catalog.count(*) = 20
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 20
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(fixed_empty_search_path)
      AND pg_catalog.bool_and(owner_name = 'postgres')
   FROM function_state) AS exact_function_security_owner_search_path_ok,
  (SELECT pg_catalog.count(*) = 20
   FROM pg_catalog.pg_proc AS procedure
   JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname LIKE 'booking_%') AS exact_function_overloads_ok,
  NOT EXISTS (
    SELECT 1 FROM function_effective_privileges AS privilege
    WHERE privilege.role_name IN ('anon', 'authenticated')
      AND privilege.has_execute IS DISTINCT FROM false
  ) AS no_browser_function_execute_ok,
  NOT EXISTS (
    SELECT 1 FROM function_effective_privileges AS privilege
    WHERE privilege.role_name = 'service_role'
      AND privilege.has_execute IS DISTINCT FROM privilege.service_role_execute
  )
    AND NOT EXISTS (
      SELECT 1 FROM function_acl AS privilege
      LEFT JOIN function_state AS state ON state.oid = privilege.oid
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee <> 'postgres'
        AND NOT (
          privilege.grantee = 'service_role'
          AND state.service_role_execute IS true
        )
    )
    AND (SELECT pg_catalog.count(*) = 14
         FROM function_acl AS privilege
         WHERE privilege.grantee = 'service_role'
           AND privilege.privilege_type = 'EXECUTE')
    AS exact_service_role_function_allowlist_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(convalidated)
      AND pg_catalog.bool_and(
        pg_catalog.strpos(definition, pg_catalog.quote_literal('auglysandi')) > 0
      )
      AND pg_catalog.bool_and(
        pg_catalog.strpos(definition, pg_catalog.quote_literal('bokanir')) > 0
      )
   FROM feature_constraint) AS feature_key_union_contains_bokanir_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(tgname = 'booking_events_immutable_guard')
      AND pg_catalog.bool_and((tgtype & 2) = 2)
      AND pg_catalog.bool_and((tgtype & 8) = 8)
      AND pg_catalog.bool_and((tgtype & 16) = 16)
      AND pg_catalog.bool_and((tgtype & 4) = 0)
      AND pg_catalog.bool_and(tgenabled <> 'D')
   FROM trigger_state) AS immutable_event_trigger_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_create_request(%'
      AND pg_catalog.strpos(prosrc, 'create_request_id = p_request_id') > 0
      AND pg_catalog.strpos(prosrc, 'check_and_increment_ip_rate_limit') > 0
      AND pg_catalog.strpos(prosrc, 'create_request_id = p_request_id') <
          pg_catalog.strpos(prosrc, 'check_and_increment_ip_rate_limit')
      AND prosrc LIKE '%booking_rate_limited%'
      AND prosrc LIKE '%INSERT INTO public.booking_access_members%''owner''%''active''%'
  ) AS replay_before_rate_and_signed_owner_atomic_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_resolve_create_replay(%'
      AND prosrc LIKE '%service_id_snapshot%'
      AND prosrc LIKE '%request_fingerprint IS DISTINCT FROM v_fingerprint%'
      AND prosrc LIKE '%booking_idempotency_conflict%'
      AND prosrc LIKE '%IF NOT FOUND THEN RETURN NULL%'
  ) AS provider_state_independent_create_replay_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_exchange_capability(%'
      AND prosrc LIKE '%FOR UPDATE%'
      AND prosrc LIKE '%DELETE FROM public.booking_capability_sessions%'
      AND prosrc LIKE '%>= 16%'
      AND prosrc LIKE '%booking_messages%'
      AND prosrc LIKE '%booking_events%'
  ) AS bounded_multi_browser_capability_sessions_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_claim_request(%'
      AND prosrc LIKE '%v_service_discount := v_request.eligible_discount_bps%'
      AND prosrc NOT LIKE '%SELECT service.signed_in_discount_bps%'
      AND prosrc LIKE '%SET revoked_at = pg_catalog.now()%'
      AND prosrc LIKE '%v_request.status <> ''requested''%'
  ) AS one_way_claim_frozen_discount_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature = 'public.booking_request_projection(uuid,text,text)'
      AND prosrc LIKE '%p_access_kind = ''member''%'
      AND prosrc LIKE '%p_member_role = ''owner''%'
      AND prosrc LIKE '%''members'', v_members%'
      AND prosrc LIKE '%profile.slug INTO v_current_profile_slug%'
      AND prosrc LIKE '%profile.archived_at IS NULL%'
      AND prosrc LIKE '%COALESCE(%business_profile_slug_snapshot%'
  ) AS owner_only_members_and_current_canonical_slug_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_send_message(%'
      AND prosrc LIKE '%guest:link:%access_version%'
      AND prosrc LIKE '%Replay lookup deliberately ignores mutable sender_key%'
      AND prosrc LIKE '%v_author_name := NULL%'
      AND prosrc LIKE '%v_author_name ~ ''[[:cntrl:]]''%'
      AND prosrc LIKE '%booking_message_rate_limited%'
  )
    AND EXISTS (
      SELECT 1 FROM constraint_state
      WHERE table_name = 'booking_messages'
        AND conname = 'booking_messages_client_message_key'
        AND definition LIKE '%UNIQUE (booking_request_id, client_message_id)%'
        AND definition NOT LIKE '%sender_key%'
    )
    AND EXISTS (
      SELECT 1 FROM constraint_state
      WHERE table_name = 'booking_messages'
        AND conname = 'booking_messages_idempotency_key'
        AND definition LIKE '%UNIQUE (booking_request_id, idempotency_key)%'
        AND definition NOT LIKE '%sender_key%'
    ) AS message_replay_across_guest_member_transition_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature = 'public.booking_authorize_request(uuid,uuid,text)'
      AND pg_catalog.strpos(prosrc, 'booking_provider_allowed(p_actor_user_id, v_request.space_id)') > 0
      AND pg_catalog.strpos(prosrc, 'booking_provider_allowed(p_actor_user_id, v_request.space_id)') <
          pg_catalog.strpos(prosrc, 'v_request.access_mode = ''members''')
  )
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.booking_manage_member(%'
        AND prosrc LIKE '%member.id = p_target_selector::uuid%'
        AND prosrc LIKE '%v_target_email := v_target_member.canonical_email%'
        AND prosrc LIKE '%Provider identity has global precedence%'
        AND pg_catalog.strpos(prosrc, 'event_row.idempotency_key = p_idempotency_key') <
            pg_catalog.strpos(prosrc, 'Provider identity has global precedence')
    ) AS entitled_provider_precedence_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_cancel_request(%'
      AND prosrc LIKE '%guest:link:%access_version%'
      AND prosrc LIKE '%''actorPrincipal'', v_actor_principal%'
      AND prosrc NOT LIKE '%''actorSessionId'', v_access.capability_session_id%'
      AND prosrc LIKE '%response arrived, while the same verified user%'
      AND prosrc LIKE '%''replayed'', true%'
  ) AS cancel_replay_stable_bearer_principal_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_exchange_capability(%'
      AND prosrc LIKE '%message.capability_session_id = stale_session.id%'
      AND prosrc LIKE '%event_row.actor_session_id = stale_session.id%'
      AND prosrc LIKE '%session_row.revoked_at IS NULL%'
      AND prosrc LIKE '%session_row.expires_at > pg_catalog.now()%'
      AND prosrc LIKE '%history never exhausts future link access%'
  ) AS live_session_cap_preserves_audit_history_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.booking_manage_member(%'
      AND prosrc LIKE '%booking_last_owner%'
      AND prosrc LIKE '%Self-revoke is intentionally outside the MVP%'
      AND prosrc LIKE '%p_action = ''revoke'' AND v_target_email = v_actor_email%'
      AND prosrc LIKE '%RAISE EXCEPTION ''booking_invalid_input''%'
  ) AS last_owner_guard_and_no_self_revoke_ok,
  (SELECT pg_catalog.count(*) FROM public.booking_services) AS service_rows,
  (SELECT pg_catalog.count(*) FROM public.booking_requests) AS request_rows,
  (SELECT pg_catalog.count(*) FROM public.booking_access_members) AS member_rows,
  (SELECT pg_catalog.count(*) FROM public.booking_capability_sessions) AS capability_session_rows,
  (SELECT pg_catalog.count(*) FROM public.booking_messages) AS message_rows,
  (SELECT pg_catalog.count(*) FROM public.booking_events) AS event_rows,
  (SELECT pg_catalog.count(*)
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.pid <> pg_catalog.pg_backend_pid()
     AND activity.datname = pg_catalog.current_database()
     AND activity.xact_start IS NOT NULL
     AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

ROLLBACK;
