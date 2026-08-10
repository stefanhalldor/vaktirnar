-- SQL120 advertiser-foundation postflight — READ ONLY.
-- Run only after Stebbi has separately applied SQL120. Share the complete
-- single result row. Every *_ok value must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_tables(table_name) AS (
  VALUES
    ('business_profiles'),
    ('advertiser_creatives'),
    ('advertiser_audit_events')
), table_state AS (
  SELECT relation.oid, relation.relname AS table_name,
    relation.relowner, relation.relrowsecurity, relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), table_acl AS (
  SELECT table_row.table_name,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM table_state AS table_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = table_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), column_acl AS (
  SELECT table_row.table_name, attribute.attname AS column_name,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM table_state AS table_row
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = table_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attacl IS NOT NULL
), expected_columns(table_name, column_name, udt_name, is_nullable) AS (
  VALUES
    ('business_profiles', 'id', 'uuid', 'NO'),
    ('business_profiles', 'space_id', 'uuid', 'NO'),
    ('business_profiles', 'created_by', 'uuid', 'YES'),
    ('business_profiles', 'revision', 'int4', 'NO'),
    ('business_profiles', 'slug', 'text', 'NO'),
    ('business_profiles', 'display_name', 'text', 'NO'),
    ('business_profiles', 'description', 'text', 'YES'),
    ('business_profiles', 'website_url', 'text', 'YES'),
    ('business_profiles', 'archived_at', 'timestamptz', 'YES'),
    ('business_profiles', 'created_at', 'timestamptz', 'NO'),
    ('business_profiles', 'updated_at', 'timestamptz', 'NO'),
    ('advertiser_creatives', 'id', 'uuid', 'NO'),
    ('advertiser_creatives', 'space_id', 'uuid', 'NO'),
    ('advertiser_creatives', 'business_profile_id', 'uuid', 'NO'),
    ('advertiser_creatives', 'revision', 'int4', 'NO'),
    ('advertiser_creatives', 'placement', 'text', 'NO'),
    ('advertiser_creatives', 'headline', 'text', 'NO'),
    ('advertiser_creatives', 'body', 'text', 'NO'),
    ('advertiser_creatives', 'cta_label', 'text', 'NO'),
    ('advertiser_creatives', 'destination_url', 'text', 'NO'),
    ('advertiser_creatives', 'review_status', 'text', 'NO'),
    ('advertiser_creatives', 'delivery_status', 'text', 'NO'),
    ('advertiser_creatives', 'submitted_snapshot', 'jsonb', 'YES'),
    ('advertiser_creatives', 'approved_snapshot', 'jsonb', 'YES'),
    ('advertiser_creatives', 'approved_revision', 'int4', 'YES'),
    ('advertiser_creatives', 'submitted_at', 'timestamptz', 'YES'),
    ('advertiser_creatives', 'reviewed_by', 'uuid', 'YES'),
    ('advertiser_creatives', 'reviewed_at', 'timestamptz', 'YES'),
    ('advertiser_creatives', 'review_note', 'text', 'YES'),
    ('advertiser_creatives', 'created_at', 'timestamptz', 'NO'),
    ('advertiser_creatives', 'updated_at', 'timestamptz', 'NO'),
    ('advertiser_audit_events', 'id', 'uuid', 'NO'),
    ('advertiser_audit_events', 'creative_id', 'uuid', 'NO'),
    ('advertiser_audit_events', 'creative_revision', 'int4', 'NO'),
    ('advertiser_audit_events', 'command_scope', 'text', 'NO'),
    ('advertiser_audit_events', 'request_action', 'text', 'NO'),
    ('advertiser_audit_events', 'event_type', 'text', 'NO'),
    ('advertiser_audit_events', 'actor_user_id', 'uuid', 'YES'),
    ('advertiser_audit_events', 'idempotency_key', 'uuid', 'NO'),
    ('advertiser_audit_events', 'note', 'text', 'YES'),
    ('advertiser_audit_events', 'snapshot', 'jsonb', 'NO'),
    ('advertiser_audit_events', 'created_at', 'timestamptz', 'NO')
), actual_columns AS (
  SELECT column_row.table_name::text AS table_name,
    column_row.column_name::text AS column_name,
    column_row.udt_name::text AS udt_name,
    column_row.is_nullable::text AS is_nullable
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), expected_constraints(table_name, constraint_name) AS (
  VALUES
    ('business_profiles', 'business_profiles_pkey'),
    ('business_profiles', 'business_profiles_revision_check'),
    ('business_profiles', 'business_profiles_slug_check'),
    ('business_profiles', 'business_profiles_display_name_check'),
    ('business_profiles', 'business_profiles_description_check'),
    ('business_profiles', 'business_profiles_website_url_check'),
    ('business_profiles', 'business_profiles_space_fk'),
    ('business_profiles', 'business_profiles_created_by_fk'),
    ('business_profiles', 'business_profiles_slug_key'),
    ('business_profiles', 'business_profiles_space_id_id_key'),
    ('advertiser_creatives', 'advertiser_creatives_pkey'),
    ('advertiser_creatives', 'advertiser_creatives_revision_check'),
    ('advertiser_creatives', 'advertiser_creatives_placement_check'),
    ('advertiser_creatives', 'advertiser_creatives_headline_check'),
    ('advertiser_creatives', 'advertiser_creatives_body_check'),
    ('advertiser_creatives', 'advertiser_creatives_cta_label_check'),
    ('advertiser_creatives', 'advertiser_creatives_destination_url_check'),
    ('advertiser_creatives', 'advertiser_creatives_review_status_check'),
    ('advertiser_creatives', 'advertiser_creatives_delivery_status_check'),
    ('advertiser_creatives', 'advertiser_creatives_review_snapshot_check'),
    ('advertiser_creatives', 'advertiser_creatives_active_review_check'),
    ('advertiser_creatives', 'advertiser_creatives_review_note_check'),
    ('advertiser_creatives', 'advertiser_creatives_profile_fk'),
    ('advertiser_creatives', 'advertiser_creatives_reviewer_fk'),
    ('advertiser_creatives', 'advertiser_creatives_space_id_id_key'),
    ('advertiser_audit_events', 'advertiser_audit_events_pkey'),
    ('advertiser_audit_events', 'advertiser_audit_events_creative_revision_check'),
    ('advertiser_audit_events', 'advertiser_audit_events_command_contract_check'),
    ('advertiser_audit_events', 'advertiser_audit_events_note_check'),
    ('advertiser_audit_events', 'advertiser_audit_events_snapshot_check'),
    ('advertiser_audit_events', 'advertiser_audit_events_creative_fk'),
    ('advertiser_audit_events', 'advertiser_audit_events_actor_fk'),
    ('advertiser_audit_events', 'advertiser_audit_events_idempotency_key')
), actual_constraints AS (
  SELECT relation.relname AS table_name,
    constraint_row.conname AS constraint_name,
    constraint_row.contype,
    constraint_row.confdeltype,
    constraint_row.convalidated,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), expected_indexes(index_name) AS (
  VALUES
    ('business_profiles_pkey'),
    ('business_profiles_slug_key'),
    ('business_profiles_space_id_id_key'),
    ('business_profiles_space_active_idx'),
    ('advertiser_creatives_pkey'),
    ('advertiser_creatives_space_id_id_key'),
    ('advertiser_creatives_profile_idx'),
    ('advertiser_creatives_review_queue_idx'),
    ('advertiser_one_active_per_placement_idx'),
    ('advertiser_audit_events_pkey'),
    ('advertiser_audit_events_idempotency_key'),
    ('advertiser_audit_creative_time_idx')
), actual_indexes AS (
  SELECT index_row.indexname AS index_name
  FROM pg_catalog.pg_indexes AS index_row
  WHERE index_row.schemaname = 'public'
    AND index_row.tablename IN (
      SELECT expected.table_name FROM expected_tables AS expected
    )
), expected_fks(table_name, constraint_name, delete_type) AS (
  VALUES
    ('business_profiles', 'business_profiles_space_fk', 'c'),
    ('business_profiles', 'business_profiles_created_by_fk', 'n'),
    ('advertiser_creatives', 'advertiser_creatives_profile_fk', 'c'),
    ('advertiser_creatives', 'advertiser_creatives_reviewer_fk', 'n'),
    ('advertiser_audit_events', 'advertiser_audit_events_creative_fk', 'c'),
    ('advertiser_audit_events', 'advertiser_audit_events_actor_fk', 'n')
), expected_functions(signature, service_role_execute) AS (
  VALUES
    ('public.advertiser_assert_owner(uuid,uuid)', false),
    ('public.advertiser_upsert_business_profile(uuid,uuid,uuid,integer,text,text,text,text)', true),
    ('public.advertiser_upsert_creative(uuid,uuid,uuid,uuid,integer,text,text,text,text,text)', true),
    ('public.advertiser_owner_transition(uuid,uuid,uuid,integer,text,uuid)', true),
    ('public.advertiser_admin_review(uuid,uuid,integer,text,text,uuid)', true),
    ('public.advertiser_resolve_public(text)', true),
    ('public.advertiser_audit_immutable()', false)
), function_state AS (
  SELECT expected.signature, expected.service_role_execute,
    procedure.oid, procedure.proname, procedure.proowner,
    procedure.prosecdef, procedure.prosrc,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature)
), function_acl AS (
  SELECT procedure.proname,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'advertiser_assert_owner',
      'advertiser_upsert_business_profile',
      'advertiser_upsert_creative',
      'advertiser_owner_transition',
      'advertiser_admin_review',
      'advertiser_resolve_public',
      'advertiser_audit_immutable'
    )
), feature_constraint AS (
  SELECT constraint_row.convalidated,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
), trigger_state AS (
  SELECT trigger_row.tgname,
    pg_catalog.pg_get_triggerdef(trigger_row.oid) AS definition
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.advertiser_audit_events')
    AND NOT trigger_row.tgisinternal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 3 FROM table_state) AS tables_ok,
  NOT EXISTS (
    SELECT expected.* FROM expected_columns AS expected
    EXCEPT SELECT actual.* FROM actual_columns AS actual
  )
    AND NOT EXISTS (
      SELECT actual.* FROM actual_columns AS actual
      EXCEPT SELECT expected.* FROM expected_columns AS expected
    ) AS exact_column_contract_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.constraint_name
    FROM expected_constraints AS expected
    EXCEPT
    SELECT actual.table_name, actual.constraint_name
    FROM actual_constraints AS actual
    WHERE actual.convalidated
  )
    AND NOT EXISTS (
      SELECT actual.table_name, actual.constraint_name
      FROM actual_constraints AS actual
      EXCEPT
      SELECT expected.table_name, expected.constraint_name
      FROM expected_constraints AS expected
    ) AS exact_validated_constraints_ok,
  NOT EXISTS (
    SELECT expected.index_name FROM expected_indexes AS expected
    EXCEPT SELECT actual.index_name FROM actual_indexes AS actual
  )
    AND NOT EXISTS (
      SELECT actual.index_name FROM actual_indexes AS actual
      EXCEPT SELECT expected.index_name FROM expected_indexes AS expected
    ) AS exact_indexes_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.constraint_name, expected.delete_type
    FROM expected_fks AS expected
    EXCEPT
    SELECT actual.table_name, actual.constraint_name, actual.confdeltype::text
    FROM actual_constraints AS actual
    WHERE actual.contype = 'f' AND actual.convalidated
  )
    AND (SELECT pg_catalog.count(*) FROM actual_constraints WHERE contype = 'f') = 6
    AS exact_foreign_key_lifecycle_ok,
  NOT EXISTS (
    SELECT 1 FROM table_state
    WHERE NOT relrowsecurity OR NOT relforcerowsecurity
  ) AS force_rls_ok,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (SELECT present.oid FROM table_state AS present)
  ) AS default_deny_no_policies_ok,
  NOT EXISTS (
    SELECT 1 FROM table_acl AS privilege
    WHERE privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  )
    AND NOT EXISTS (
      SELECT 1 FROM column_acl AS privilege
      WHERE privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AS no_browser_table_or_column_grants_ok,
  (SELECT pg_catalog.count(*) = 3
      AND pg_catalog.count(*) FILTER (WHERE privilege_type = 'SELECT') = 3
      AND pg_catalog.count(*) FILTER (WHERE privilege_type <> 'SELECT') = 0
   FROM table_acl AS privilege
   WHERE privilege.grantee = 'service_role')
    AND NOT EXISTS (
      SELECT 1 FROM column_acl AS privilege
      WHERE privilege.grantee = 'service_role'
        AND privilege.privilege_type <> 'SELECT'
    ) AS service_role_select_only_ok,
  COALESCE((
    SELECT role.rolsuper OR role.rolbypassrls
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
  ), false) AS service_role_bypasses_rls_ok,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'S'
      AND (
        relation.relname LIKE 'advertiser%'
        OR relation.relname LIKE 'business_profiles%'
      )
  ) AS no_direct_sequence_grants_ok,
  (SELECT pg_catalog.count(*) = 7
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 7
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(fixed_empty_search_path)
   FROM function_state) AS function_security_ok,
  (SELECT pg_catalog.count(*) = 7
   FROM pg_catalog.pg_proc AS procedure
   JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname IN (
       'advertiser_assert_owner',
       'advertiser_upsert_business_profile',
       'advertiser_upsert_creative',
       'advertiser_owner_transition',
       'advertiser_admin_review',
       'advertiser_resolve_public',
       'advertiser_audit_immutable'
     )) AS exact_function_overloads_ok,
  NOT EXISTS (
    SELECT 1 FROM function_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) AS no_browser_function_execute_ok,
  NOT EXISTS (
    SELECT 1
    FROM function_state AS state
    WHERE state.oid IS NULL
       OR state.service_role_execute IS DISTINCT FROM
          pg_catalog.has_function_privilege('service_role', state.oid, 'EXECUTE')
  ) AS service_role_function_scope_ok,
  (SELECT pg_catalog.count(*) = 5
   FROM function_acl
   WHERE grantee = 'service_role' AND privilege_type = 'EXECUTE')
    AS exact_service_role_function_grants_ok,
  (SELECT pg_catalog.count(*) = 3
      AND pg_catalog.count(DISTINCT table_state.relowner) = 1
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
   FROM table_state
   JOIN pg_catalog.pg_roles AS role ON role.oid = table_state.relowner)
    AND (SELECT pg_catalog.count(*) = 7
        AND pg_catalog.count(DISTINCT function_state.proowner) = 1
        AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
      FROM function_state
      JOIN pg_catalog.pg_roles AS role ON role.oid = function_state.proowner
      WHERE function_state.oid IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM table_state
      CROSS JOIN function_state
      WHERE function_state.oid IS NOT NULL
        AND function_state.proowner <> table_state.relowner
    ) AS object_owner_bypasses_rls_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(convalidated)
      AND pg_catalog.bool_and(
        pg_catalog.strpos(definition, pg_catalog.quote_literal('kviss')) > 0
      )
      AND pg_catalog.bool_and(
        pg_catalog.strpos(definition, pg_catalog.quote_literal('auglysandi')) > 0
      )
   FROM feature_constraint) AS exact_auglysandi_feature_constraint_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(definition LIKE '%BEFORE UPDATE%')
      AND pg_catalog.bool_and(definition NOT LIKE '%DELETE%')
   FROM trigger_state
   WHERE tgname = 'advertiser_audit_immutable_guard')
    AND (SELECT pg_catalog.count(*) = 1 FROM trigger_state)
    AS update_only_audit_immutability_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.advertiser_owner_transition(%'
      AND prosrc LIKE '%command_scope <> ''owner''%'
      AND prosrc LIKE '%request_action <> p_action%'
      AND prosrc LIKE '%actor_user_id IS DISTINCT FROM p_actor_id%'
      AND prosrc LIKE '%creative_revision <> p_expected_revision%'
      AND prosrc LIKE '%advertiser_idempotency_conflict%'
  )
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.advertiser_admin_review(%'
        AND prosrc LIKE '%command_scope <> ''admin''%'
        AND prosrc LIKE '%request_action <> p_decision%'
        AND prosrc LIKE '%actor_user_id IS DISTINCT FROM p_reviewer_id%'
        AND prosrc LIKE '%creative_revision <> p_expected_revision%'
        AND prosrc LIKE '%note IS DISTINCT FROM NULLIF(pg_catalog.btrim(p_note), '''')%'
        AND prosrc LIKE '%advertiser_idempotency_conflict%'
    ) AS semantic_idempotency_guards_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature = 'public.advertiser_audit_immutable()'
      AND prosrc LIKE '%OLD.actor_user_id IS NOT NULL%'
      AND prosrc LIKE '%NEW.actor_user_id IS NULL%'
      AND prosrc LIKE '%to_jsonb(NEW) - ''actor_user_id''%'
      AND prosrc LIKE '%to_jsonb(OLD) - ''actor_user_id''%'
      AND prosrc LIKE '%RETURN NEW%'
      AND prosrc LIKE '%advertiser_audit_immutable%'
  ) AS exact_audit_actor_redaction_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature = 'public.advertiser_resolve_public(text)'
      AND prosrc LIKE '%approved_revision = creative.revision%'
      AND prosrc LIKE '%approved_snapshot = creative.submitted_snapshot%'
      AND prosrc LIKE '%membership.role = ''owner''%'
      AND prosrc LIKE '%entitlement.feature_key = ''auglysandi''%'
  ) AS approved_snapshot_and_owner_eligibility_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.advertiser_upsert_business_profile(%'
      AND prosrc LIKE '%p_expected_revision IS NULL%'
      AND prosrc LIKE '%review_status = ''draft''%'
      AND prosrc LIKE '%delivery_status = ''paused''%'
  )
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.advertiser_upsert_creative(%'
        AND prosrc LIKE '%p_expected_revision IS NULL%'
        AND prosrc LIKE '%review_status <> ''pending''%'
    )
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.advertiser_admin_review(%'
        AND prosrc LIKE '%review_status = ''pending''%'
        AND prosrc LIKE '%approved_snapshot = creative.submitted_snapshot%'
        AND prosrc LIKE '%approved_revision = creative.revision%'
    ) AS rpc_revision_and_payload_guards_ok,
  (SELECT pg_catalog.count(*) FROM public.business_profiles) AS business_profile_rows,
  (SELECT pg_catalog.count(*) FROM public.advertiser_creatives) AS creative_rows,
  (SELECT pg_catalog.count(*) FROM public.advertiser_audit_events) AS audit_event_rows,
  (SELECT pg_catalog.count(*)
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.pid <> pg_catalog.pg_backend_pid()
     AND activity.datname = pg_catalog.current_database()
     AND activity.xact_start IS NOT NULL
     AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

ROLLBACK;
