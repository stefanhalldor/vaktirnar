-- TODO #095 / SQL132: independent mutable events and tagged one-off expenses.
-- Forward-only. Adds the independent Events domain and performs one exact,
-- data-neutral recent_events ACL normalization. DO NOT RUN automatically.
-- Stebbi applies this only after the dedicated read-only preflight is green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';
SET LOCAL search_path = pg_catalog;

DO $teskeid_event_preconditions$
DECLARE
  v_collision text;
  v_expected record;
  v_function oid;
  v_source text;
BEGIN
  IF current_user <> 'postgres'
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS role_row
       WHERE role_row.rolname = current_user
         AND role_row.rolsuper
     ) THEN
    RAISE EXCEPTION 'teskeid_event_migration_owner_invalid:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'postgres'
      AND (role_row.rolsuper OR role_row.rolbypassrls)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role_row.oid, 'public', 'USAGE')
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname IN ('anon', 'authenticated')
  ) <> 2 THEN
    RAISE EXCEPTION 'teskeid_event_required_roles_missing';
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('public.expense_shares') IS NULL
     OR pg_catalog.to_regclass('public.expense_obligations') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayment_allocations') IS NULL
     OR pg_catalog.to_regclass('public.expense_member_invitations') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity_audience') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL
     OR pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL
     OR pg_catalog.to_regclass('public.expense_event_contexts') IS NULL
     OR pg_catalog.to_regclass('public.expense_event_participants') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_has_beta_access(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_begin_request(uuid,uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_reported_repayments_need_review(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_transition_settlement_batch(uuid,uuid,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_event_context(uuid,uuid,text,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_list_event_contexts(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_get_event_context(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_is_event_context(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_prepare_account_deletion(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_prerequisites_missing';
  END IF;

  SELECT target.name
  INTO v_collision
  FROM (VALUES
    ('teskeid_events'),
    ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources'),
    ('teskeid_events_owner_created_idx'),
    ('teskeid_event_guests_active_position_uidx'),
    ('teskeid_event_guests_active_linked_uidx'),
    ('teskeid_event_guests_active_email_uidx'),
    ('teskeid_event_expense_links_expense_uidx'),
    ('teskeid_event_expense_sources_member_uidx')
  ) AS target(name)
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
  ORDER BY target.name
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_relation_collision:%', v_collision;
  END IF;

  SELECT target.signature
  INTO v_collision
  FROM (VALUES
    ('public.teskeid_event_normalize_text(text)'),
    ('public.teskeid_event_valid_text(text,integer,integer)'),
    ('public.teskeid_event_uuid_from_text(text)'),
    ('public.teskeid_event_has_access(uuid)'),
    ('public.teskeid_event_assert_actor(uuid)'),
    ('public.teskeid_event_assert_financial_actor(uuid)'),
    ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)'),
    ('public.teskeid_event_assert_roster(uuid)'),
    ('public.teskeid_event_roster_integrity_trigger()'),
    ('public.teskeid_event_touch_updated_at()'),
    ('public.teskeid_event_guard_event_update()'),
    ('public.teskeid_event_guard_guest_update()'),
    ('public.teskeid_event_guard_receipt_mutation()'),
    ('public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'),
    ('public.teskeid_event_expense_link_integrity_trigger()'),
    ('public.teskeid_event_financial_parent_integrity_trigger()'),
    ('public.teskeid_event_immutable_history()'),
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)'),
    ('public.teskeid_event_list(uuid)'),
    ('public.teskeid_event_get(uuid,uuid)'),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.teskeid_event_list_expense_sources(uuid)'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)'),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.teskeid_event_get_expense_preview(uuid,uuid)')
  ) AS target(signature)
  WHERE EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
      AND procedure_row.proname = pg_catalog.split_part(
        pg_catalog.split_part(target.signature, '(', 1), '.', 2
      )
  )
  ORDER BY target.signature
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_function_collision:%', v_collision;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'teskeid_event_guests_roster_deferred',
      'teskeid_events_touch_updated_at',
      'teskeid_event_guests_touch_updated_at',
      'teskeid_events_update_guard',
      'teskeid_event_guests_update_guard',
      'teskeid_event_receipts_mutation_guard',
      'teskeid_event_expense_links_integrity_deferred',
      'teskeid_event_expense_groups_integrity_deferred',
      'teskeid_event_expenses_integrity_deferred',
      'teskeid_event_expense_members_integrity_deferred',
      'teskeid_event_expense_links_immutable_guard',
      'teskeid_event_expense_sources_immutable_guard'
    )
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'teskeid_event_trigger_collision';
  END IF;

  -- Exact LF-normalized source/owner/ACL/search-path pins for the complete live
  -- dependency chain appear below, before the first DDL statement.

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
      AND constraint_row.conname = 'feature_access_feature_key_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute.attnum
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_row.conrelid
          AND attribute.attname = 'feature_key'
          AND NOT attribute.attisdropped
      )]::smallint[]
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      ))) = '97736909cf1a3a5432eeb34275cf3cfc'
      AND (
        SELECT pg_catalog.array_agg(
          (match.value)[1] ORDER BY (match.value)[1] COLLATE "C"
        )
        FROM pg_catalog.regexp_matches(
          pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          ), '''([^'']+)''', 'g'
        ) AS match(value)
      ) = ARRAY[
        'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
        'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
        'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
        'tengsl', 'teskeid-routing-v1', 'umonnun',
        'utlagt-og-endurgreitt', 'vedrid',
        'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
        'weather-pulse'
      ]::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.regexp_matches(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          )), E'\\mor\\M', 'g'
        )
      ) = 5
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      )) !~ '(true|false|is null|is not|<>|!=|not |func|feature_key[[:space:]]*=[[:space:]]*feature_key|(^|[^a-z])(and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_feature_constraint_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_event_contexts'), ('expense_event_participants')
    ) AS expected(table_name)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
     AND relation.relkind = 'r'
     AND relation.relrowsecurity
     AND relation.relforcerowsecurity
     AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid = relation.oid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
       WHERE attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (privilege.grantee <> relation.relowner
           OR privilege.is_grantable)
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(
         relation.relacl, pg_catalog.acldefault('r', relation.relowner)
       )) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee
         ON grantee.oid = privilege.grantee
       WHERE privilege.grantee <> relation.relowner
          OR privilege.is_grantable
     )
     AND NOT EXISTS (
       SELECT 1 FROM (VALUES
         ('anon'::name), ('authenticated'::name), ('service_role'::name)
       ) AS role_row(role_name)
       WHERE pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'SELECT')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'INSERT')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'UPDATE')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'DELETE')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRUNCATE')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'REFERENCES')
          OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRIGGER')
          OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'SELECT')
          OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'INSERT')
          OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'UPDATE')
          OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'REFERENCES')
     )
  ) <> 2 THEN
    RAISE EXCEPTION 'teskeid_event_sql131_relation_acl_drift';
  END IF;

  -- Pin the legacy financial privacy envelope actually used by the delegate
  -- and preview. Legacy service-role SELECT grants are preserved exactly;
  -- browser roles and all direct column grants remain forbidden.
  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_groups', true, false),
      ('expense_group_members', true, false),
      ('expenses', true, false),
      ('expense_payments', true, false),
      ('expense_shares', true, false),
      ('expense_obligations', true, false),
      ('expense_repayments', true, false),
      ('expense_repayment_allocations', true, false),
      ('expense_member_invitations', true, false),
      ('expense_activity', true, false),
      ('expense_activity_audience', false, false),
      ('expense_mutation_requests', false, false),
      ('expense_settlement_batches', true, true),
      ('expense_settlement_batch_items', true, true),
      ('expense_event_contexts', false, true),
      ('expense_event_participants', false, true)
    ) AS expected(table_name, service_select, force_rls)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
     AND relation.relkind = 'r'
     AND relation.relrowsecurity
     AND relation.relforcerowsecurity = expected.force_rls
     AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(
         relation.relacl, pg_catalog.acldefault('r', relation.relowner)
       )) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
       WHERE privilege.grantee = 0
          OR privilege.is_grantable
          OR (
            privilege.grantee <> relation.relowner
            AND (
              grantee.rolname IS DISTINCT FROM 'service_role'
              OR NOT expected.service_select
              OR privilege.privilege_type <> 'SELECT'
            )
          )
     )
     AND pg_catalog.has_table_privilege(
       'service_role', relation.oid, 'SELECT'
     ) = expected.service_select
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRUNCATE')
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'REFERENCES')
     AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRIGGER')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
       WHERE attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (privilege.grantee <> relation.relowner
           OR privilege.is_grantable)
     )
     AND NOT EXISTS (
       SELECT 1 FROM (VALUES
         ('anon'::name), ('authenticated'::name)
       ) AS browser(role_name)
       WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
          OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
          OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
          OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
          OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
          OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
     )
  ) <> 16 THEN
    RAISE EXCEPTION 'teskeid_event_canonical_relation_acl_drift';
  END IF;

  -- SQL46 granted CRUD additively without first revoking Supabase's default
  -- service-role table privileges. Accept only the exact diagnosed legacy-full
  -- envelope or the already-normalized CRUD target; every other shape is drift.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        privilege.privilege_type
        ORDER BY privilege.privilege_type COLLATE "C"
      ), ARRAY[]::text[]) AS privilege_types
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE grantee.rolname = 'service_role'
    ) AS service_acl
    WHERE relation.oid = pg_catalog.to_regclass('public.recent_events')
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      AND (
        (
          service_acl.privilege_types = ARRAY[
            'DELETE', 'INSERT', 'SELECT', 'UPDATE'
          ]::text[]
          AND NOT pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'MAINTAIN'
          )
          AND NOT pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'REFERENCES'
          )
          AND NOT pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'TRIGGER'
          )
          AND NOT pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'TRUNCATE'
          )
        ) OR (
          service_acl.privilege_types = ARRAY[
            'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
            'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
          ]::text[]
          AND pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'MAINTAIN'
          )
          AND pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'REFERENCES'
          )
          AND pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'TRIGGER'
          )
          AND pg_catalog.has_table_privilege(
            'service_role', relation.oid, 'TRUNCATE'
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> relation.relowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
           OR (
             grantee.rolname = 'service_role'
             AND privilege.grantor <> relation.relowner
           )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('anon'::name), ('authenticated'::name)
        ) AS browser(role_name)
        WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'MAINTAIN')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_recent_events_acl_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_event_contexts', 'group_id', 'uuid', 'NO'),
      ('expense_event_contexts', 'owner_user_id', 'uuid', 'NO'),
      ('expense_event_contexts', 'created_at', 'timestamp with time zone', 'NO'),
      ('expense_event_participants', 'group_id', 'uuid', 'NO'),
      ('expense_event_participants', 'member_id', 'uuid', 'NO'),
      ('expense_event_participants', 'linked_user_id', 'uuid', 'YES'),
      ('expense_event_participants', 'position', 'smallint', 'NO'),
      ('expense_event_participants', 'created_at', 'timestamp with time zone', 'NO')
    ) AS expected(table_name, column_name, data_type, is_nullable)
    JOIN information_schema.columns AS column_row
      ON column_row.table_schema = 'public'
     AND column_row.table_name = expected.table_name
     AND column_row.column_name = expected.column_name
     AND column_row.data_type = expected.data_type
     AND column_row.is_nullable = expected.is_nullable
  ) <> 8 OR (
    SELECT pg_catalog.count(*)
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name IN (
        'expense_event_contexts', 'expense_event_participants'
      )
  ) <> 8 THEN
    RAISE EXCEPTION 'teskeid_event_sql131_column_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_event_contexts', 'expense_event_contexts_pkey',
        'primarykeygroup_id'),
      ('expense_event_contexts', 'expense_event_contexts_group_fk',
        'foreignkeygroup_idreferencesexpense_groupsidondeleterestrict'),
      ('expense_event_contexts', 'expense_event_contexts_owner_fk',
        'foreignkeyowner_user_idreferencesauth.usersidondeleterestrict'),
      ('expense_event_participants', 'expense_event_participants_pkey',
        'primarykeygroup_id,member_id'),
      ('expense_event_participants', 'expense_event_participants_position_check',
        'checkposition>=0andposition<=48'),
      ('expense_event_participants', 'expense_event_participants_position_key',
        'uniquegroup_id,positiondeferrableinitiallydeferred'),
      ('expense_event_participants', 'expense_event_participants_linked_user_key',
        'uniquegroup_id,linked_user_iddeferrableinitiallydeferred'),
      ('expense_event_participants', 'expense_event_participants_context_fk',
        'foreignkeygroup_idreferencesexpense_event_contextsgroup_idondeletecascadedeferrableinitiallydeferred'),
      ('expense_event_participants', 'expense_event_participants_member_fk',
        'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrictdeferrableinitiallydeferred'),
      ('expense_event_participants', 'expense_event_participants_linked_user_fk',
        'foreignkeylinked_user_idreferencesauth.usersidondeletesetnulldeferrableinitiallydeferred')
    ) AS expected(table_name, constraint_name, exact_definition)
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
        'public.' || expected.table_name
     )
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.convalidated
     AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
       pg_catalog.regexp_replace(
         pg_catalog.pg_get_constraintdef(constraint_row.oid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'
     ), 'public.', '')) = expected.exact_definition
  ) <> 10 OR (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_event_contexts_owner_created_idx',
        'createindexexpense_event_contexts_owner_created_idxonexpense_event_contextsusingbtreeowner_user_id,created_atdesc,group_iddesc'),
      ('expense_event_participants_linked_user_idx',
        'createindexexpense_event_participants_linked_user_idxonexpense_event_participantsusingbtreelinked_user_idwherelinked_user_idisnotnull')
    ) AS expected(index_name, exact_definition)
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = pg_catalog.to_regclass(
        'public.' || expected.index_name
      )
    JOIN pg_catalog.pg_index AS index_row
     ON index_row.indexrelid = index_relation.oid
     AND index_row.indisvalid
     AND index_row.indisready
     AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
       pg_catalog.regexp_replace(
         pg_catalog.pg_get_indexdef(index_row.indexrelid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'
     ), 'public.', '')) = expected.exact_definition
  ) <> 2 THEN
    RAISE EXCEPTION 'teskeid_event_sql131_constraint_index_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.relationships_owner_counterpart_user_idx'
      )
      AND index_row.indrelid = pg_catalog.to_regclass('public.relationships')
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createuniqueindexrelationships_owner_counterpart_user_idxonrelationshipsusingbtreeowner_id,counterpart_user_idwherecounterpart_user_idisnotnull'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_relationship_index_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('expense_groups', 'id', 'uuid', 'NO'),
      ('expense_groups', 'kind', 'text', 'NO'),
      ('expense_group_members', 'group_id', 'uuid', 'NO'),
      ('expense_group_members', 'id', 'uuid', 'NO'),
      ('expense_group_members', 'user_id', 'uuid', 'YES'),
      ('expense_group_members', 'role', 'text', 'NO'),
      ('expense_group_members', 'status', 'text', 'NO'),
      ('expenses', 'group_id', 'uuid', 'NO'),
      ('expenses', 'id', 'uuid', 'NO'),
      ('expenses', 'status', 'text', 'NO'),
      ('expenses', 'currency', 'text', 'NO'),
      ('expense_payments', 'group_id', 'uuid', 'NO'),
      ('expense_payments', 'expense_id', 'uuid', 'NO'),
      ('expense_payments', 'member_id', 'uuid', 'NO'),
      ('expense_payments', 'amount_minor', 'bigint', 'NO'),
      ('expense_shares', 'group_id', 'uuid', 'NO'),
      ('expense_shares', 'expense_id', 'uuid', 'NO'),
      ('expense_shares', 'member_id', 'uuid', 'NO'),
      ('expense_shares', 'amount_minor', 'bigint', 'NO'),
      ('expense_obligations', 'group_id', 'uuid', 'NO'),
      ('expense_obligations', 'id', 'uuid', 'NO'),
      ('expense_obligations', 'from_member_id', 'uuid', 'NO'),
      ('expense_obligations', 'to_member_id', 'uuid', 'NO'),
      ('expense_obligations', 'amount_minor', 'bigint', 'NO'),
      ('expense_obligations', 'currency', 'text', 'NO'),
      ('expense_repayments', 'group_id', 'uuid', 'NO'),
      ('expense_repayments', 'id', 'uuid', 'NO'),
      ('expense_repayments', 'from_member_id', 'uuid', 'NO'),
      ('expense_repayments', 'to_member_id', 'uuid', 'NO'),
      ('expense_repayments', 'amount_minor', 'bigint', 'NO'),
      ('expense_repayments', 'currency', 'text', 'NO'),
      ('expense_repayments', 'status', 'text', 'NO'),
      ('expense_repayment_allocations', 'group_id', 'uuid', 'NO'),
      ('expense_repayment_allocations', 'repayment_id', 'uuid', 'NO'),
      ('expense_repayment_allocations', 'obligation_id', 'uuid', 'NO'),
      ('expense_repayment_allocations', 'amount_minor', 'bigint', 'NO'),
      ('expense_settlement_batches', 'id', 'uuid', 'NO'),
      ('expense_settlement_batches', 'currency', 'text', 'NO'),
      ('expense_settlement_batches', 'status', 'text', 'NO'),
      ('expense_settlement_batch_items', 'id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'batch_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'group_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'from_member_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'to_member_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'repayment_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'obligation_id', 'uuid', 'NO'),
      ('expense_settlement_batch_items', 'amount_minor', 'bigint', 'NO')
    ) AS expected(table_name, column_name, data_type, is_nullable)
    LEFT JOIN information_schema.columns AS column_row
      ON column_row.table_schema = 'public'
     AND column_row.table_name = expected.table_name
     AND column_row.column_name = expected.column_name
    WHERE column_row.column_name IS NULL
       OR column_row.data_type <> expected.data_type
       OR column_row.is_nullable <> expected.is_nullable
  ) THEN
    RAISE EXCEPTION 'teskeid_event_canonical_column_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_groups', 'expense_groups_kind_check', 'checkkind=anyarray[group,one_off]'),
      ('expense_group_members', 'expense_group_members_group_id_id_unique', 'uniquegroup_id,id'),
      ('expenses', 'expenses_group_id_id_unique', 'uniquegroup_id,id'),
      ('expenses', 'expenses_status_check', 'checkstatus=anyarray[active,cancelled]'),
      ('expenses', 'expenses_total_check', 'checktotal_minor>=1andtotal_minor<=9007199254740991'),
      ('expenses', 'expenses_currency_check', 'checkcurrency~^[a-z]{3}$'),
      ('expense_payments', 'expense_payments_group_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeletecascade'),
      ('expense_payments', 'expense_payments_group_member_fk', 'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_payments', 'expense_payments_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
      ('expense_shares', 'expense_shares_group_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeletecascade'),
      ('expense_shares', 'expense_shares_group_member_fk', 'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_shares', 'expense_shares_amount_check', 'checkamount_minor>=0andamount_minor<=9007199254740991'),
      ('expense_obligations', 'expense_obligations_group_id_id_unique', 'uniquegroup_id,id'),
      ('expense_obligations', 'expense_obligations_distinct_members_check', 'checkfrom_member_id<>to_member_id'),
      ('expense_obligations', 'expense_obligations_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
      ('expense_obligations', 'expense_obligations_currency_check', 'checkcurrency~^[a-z]{3}$'),
      ('expense_obligations', 'expense_obligations_group_from_member_fk', 'foreignkeygroup_id,from_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_obligations', 'expense_obligations_group_to_member_fk', 'foreignkeygroup_id,to_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_repayments', 'expense_repayments_group_id_id_unique', 'uniquegroup_id,id'),
      ('expense_repayments', 'expense_repayments_distinct_members_check', 'checkfrom_member_id<>to_member_id'),
      ('expense_repayments', 'expense_repayments_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
      ('expense_repayments', 'expense_repayments_currency_check', 'checkcurrency~^[a-z]{3}$'),
      ('expense_repayments', 'expense_repayments_status_check', 'checkstatus=anyarray[reported,confirmed,rejected,cancelled]'),
      ('expense_repayments', 'expense_repayments_group_from_member_fk', 'foreignkeygroup_id,from_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_repayments', 'expense_repayments_group_to_member_fk', 'foreignkeygroup_id,to_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
      ('expense_repayment_allocations', 'expense_repayment_allocations_group_repayment_fk', 'foreignkeygroup_id,repayment_idreferencesexpense_repaymentsgroup_id,idondeleterestrict'),
      ('expense_repayment_allocations', 'expense_repayment_allocations_group_obligation_fk', 'foreignkeygroup_id,obligation_idreferencesexpense_obligationsgroup_id,idondeleterestrict'),
      ('expense_repayment_allocations', 'expense_repayment_allocations_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
      ('expense_settlement_batches', 'expense_settlement_batches_status_check', 'checkstatus=anyarray[proposed,confirmed,rejected,cancelled]'),
      ('expense_settlement_batch_items', 'expense_settlement_batch_items_repayment_fk', 'foreignkeygroup_id,repayment_idreferencesexpense_repaymentsgroup_id,idondeleterestrict'),
      ('expense_settlement_batch_items', 'expense_settlement_batch_items_obligation_fk', 'foreignkeygroup_id,obligation_idreferencesexpense_obligationsgroup_id,idondeleterestrict')
    ) AS expected(table_name, constraint_name, exact_definition)
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.convalidated
     AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
       pg_catalog.regexp_replace(
         pg_catalog.pg_get_constraintdef(constraint_row.oid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'
     ), 'public.', '')) = expected.exact_definition
  ) <> 31 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
        'public.expenses'
      )
      AND constraint_row.conname = 'expenses_status_check'
      AND constraint_row.contype = 'c' AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_row.conrelid
          AND attribute.attname = 'status' AND NOT attribute.attisdropped
      )]::smallint[]
      AND (
        SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        ), '''([^'']+)''', 'g') AS match(value)
      ) = ARRAY['active', 'cancelled']::text[]
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      )) !~ '(true|false|is null|is not|<>|!=|not |func|(^|[^a-z])(or|and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
        'public.expense_repayments'
      )
      AND constraint_row.conname = 'expense_repayments_status_check'
      AND constraint_row.contype = 'c' AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_row.conrelid
          AND attribute.attname = 'status' AND NOT attribute.attisdropped
      )]::smallint[]
      AND (
        SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        ), '''([^'']+)''', 'g') AS match(value)
      ) = ARRAY['cancelled', 'confirmed', 'rejected', 'reported']::text[]
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      )) !~ '(true|false|is null|is not|<>|!=|not |func|(^|[^a-z])(or|and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_relation.oid
    WHERE index_relation.oid = pg_catalog.to_regclass(
        'public.expense_repayment_single_allocation'
      )
      AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
      AND index_row.indpred IS NULL AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 1 AND index_row.indnatts = 1
      AND index_row.indkey[0] = (
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = pg_catalog.to_regclass(
            'public.expense_repayment_allocations'
          )
          AND attribute.attname = 'repayment_id' AND NOT attribute.attisdropped
      )
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createuniqueindexexpense_repayment_single_allocationonexpense_repayment_allocationsusingbtreerepayment_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.expense_group_members_registered_unique'
      )
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.expense_group_members'
      )
      AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
      AND index_row.indexprs IS NULL AND index_row.indpred IS NOT NULL
      AND index_row.indnkeyatts = 2 AND index_row.indnatts = 2
      AND index_row.indkey[0] = (
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = index_row.indrelid
          AND attribute.attname = 'group_id' AND NOT attribute.attisdropped
      )
      AND index_row.indkey[1] = (
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = index_row.indrelid
          AND attribute.attname = 'user_id' AND NOT attribute.attisdropped
      )
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        index_row.indpred, index_row.indrelid
      )) LIKE '%user_id is not null%'
      AND (
        SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        ), '''([^'']+)''', 'g') AS match(value)
      ) = ARRAY['active', 'invited']::text[]
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        index_row.indpred, index_row.indrelid
      )) !~ '(true|false|(^|[^a-z])(or|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createuniqueindexexpense_group_members_registered_uniqueonexpense_group_membersusingbtreegroup_id,user_idwhereuser_idisnotnullandstatus=anyarray[invited,active]'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.expense_group_members_owner_unique'
      )
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.expense_group_members'
      )
      AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
      AND index_row.indexprs IS NULL AND index_row.indpred IS NOT NULL
      AND index_row.indnkeyatts = 1 AND index_row.indnatts = 1
      AND index_row.indkey[0] = (
        SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = index_row.indrelid
          AND attribute.attname = 'group_id' AND NOT attribute.attisdropped
      )
      AND (
        SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        ), '''([^'']+)''', 'g') AS match(value)
      ) = ARRAY['active', 'owner']::text[]
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        index_row.indpred, index_row.indrelid
      )) !~ '(true|false|(^|[^a-z])(or|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createuniqueindexexpense_group_members_owner_uniqueonexpense_group_membersusingbtreegroup_idwhererole=ownerandstatus=active'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_canonical_constraint_index_drift';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.normalize_email_canonical(text)',
        '3083103976aa8cb3780937b9da1be236', false, true),
      ('public.expense_has_beta_access(uuid)',
        'ebe4628dbda84e79b395c9da0ae39899', true, false),
      ('public.expense_assert_beta_actor(uuid)',
        'ea6c329f5c13bd7d0bfbd9df41e5931d', true, false),
      ('public.expense_active_member_role(uuid,uuid)',
        'b25f994a64dde4a3f94ec8bad8535b17', true, false),
      ('public.expense_begin_request(uuid,uuid,text,text)',
        'd8631d60cc2f0df56dd9e958537db2a7', true, false),
      ('public.expense_finish_request(uuid,uuid,jsonb)',
        '194c5812642b4aaaafe888bc0ba5aa29', true, false),
      ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)',
        '1cdc6208ab4cc926fa9b1e6b6182aab1', true, true),
      ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)',
        'ad3e4ade2c93001e2a8b2180288107a5', true, false),
      ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
        '536efe2584ce8b45ad8ecacf5574dfd4', true, true),
      ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
        'ad0fd30363a3c9f5d8e7b51be6f1bfa2', true, true),
      ('public.expense_terminalize_member_invitations(uuid[],text)',
        '483db189da284fb0e2e7b40a0e774f11', true, false),
      ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)',
        '5e47f31edbe4f0550f07e7b65f79e5af', true, false),
      ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
        '4ab3fda8e416a10560504cf50b175ca3', true, true),
      ('public.expense_reported_repayments_need_review(uuid)',
        '5746ec747ae675e4bc99119b0833cc9f', true, false),
      ('public.expense_group_balances(uuid,boolean)',
        'f257b83aefd92169687ab2a516da24d9', true, false),
      ('public.expense_simplified_settlement(uuid,text,boolean)',
        'fe9016a12b1ac987b3b00f314c800c89', true, false),
      ('public.expense_guard_new_reported_repayment()',
        '2a1b9b3bc481b522724aa45e6febc172', true, false),
      ('public.expense_touch_updated_at()',
        '5bdc21b8fa8fb1231bdb021e09a5bc8e', false, false),
      ('public.expense_guard_settlement_batch_mutation()',
        '3e6cdede1440af689f0ea00ae909e99d', true, false),
      ('public.expense_guard_settlement_batch_item_mutation()',
        '41d3eab8ea4fc3d4f17da22e0086031f', true, false),
      ('public.expense_guard_batch_repayment_mutation()',
        '7a7c0e5e23944e060509a0ae4cdbb728', true, false),
      ('public.expense_cancel_batches_before_user_unlink()',
        '309e995f2078ea44b35430785fcc121a', true, false),
      ('public.expense_record_settlement_batch_activity(uuid,uuid,uuid,text)',
        'd751cf49def7888821fae86730ec2c53', true, false),
      ('public.expense_insert_settlement_batch_item(uuid,integer,uuid,uuid,uuid,text,bigint,text,date,text,uuid)',
        'ba68cffeba62f462a518fa97fc137d46', true, false),
      ('public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)',
        '804c8b2b4565b72b2ad07a8b2fb5328f', true, true),
      ('public.expense_transition_settlement_batch(uuid,uuid,text,uuid)',
        'f7bce33d51b0cef08b8ce39984d046d9', true, true),
      ('public.expense_event_valid_label(text,integer,integer)',
        '17e566582027334d68b4106493b44abf', true, false),
      ('public.expense_event_has_beta_access(uuid)',
        '2354b817c135e94ba6f651a3c124938a', true, false),
      ('public.expense_event_assert_actor(uuid)',
        'e2ec7008b57e628adf5aa21af6f5573d', true, false),
      ('public.expense_event_assert_integrity(uuid)',
        'de867d4dd1d0afb6a9be11f66c1d3f9e', true, false),
      ('public.expense_event_integrity_trigger()',
        '51528b525bb574dd67a82e8a1b6cebdc', true, false),
      ('public.expense_event_group_integrity_trigger()',
        '34366fafe3a1faccba50632ac241083a', true, false),
      ('public.expense_event_context_immutable()',
        'd72317fdea310e90c1a46fb8aeb4b88a', true, false),
      ('public.expense_event_participant_immutable()',
        '9953d3c479075a608853c3d61c058c5d', true, false),
      ('public.expense_event_roster_frozen()',
        'c72c6b904c6d1fac619bda62b2677d4c', true, false),
      ('public.expense_event_invitation_blocked()',
        'af2dc14f2a96195f48dcd2eaa00e454d', true, false),
      ('public.expense_create_event_context(uuid,uuid,text,jsonb)',
        '29d0682958e9ef6901342d7d5e00a96f', true, true),
      ('public.expense_list_event_contexts(uuid)',
        'c737a057a019a45b32d553c8a9a34935', true, true),
      ('public.expense_get_event_context(uuid,uuid)',
        '6ea385edacafacccced825d0d39ccfeb', true, true),
      ('public.expense_is_event_context(uuid,uuid)',
        '73d299e648e224c45e71e67753a1abb6', true, true),
      ('public.expense_prepare_account_deletion(uuid)',
        '0402a5f4ea79801df086d9e1a4d654fb', true, true)
    ) AS expected(signature, source_md5, security_definer, service_execute)
  LOOP
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = pg_catalog.split_part(
          pg_catalog.split_part(v_expected.signature, '(', 1), '.', 2
        )
    ) <> 1 THEN
      RAISE EXCEPTION 'teskeid_event_dependency_overload_drift:%',
        v_expected.signature;
    END IF;

    v_function := pg_catalog.to_regprocedure(v_expected.signature);
    IF v_function IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_function
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef = v_expected.security_definer
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_expected.source_md5
        AND pg_catalog.cardinality(
          COALESCE(procedure_row.proconfig, ARRAY[]::text[])
        ) = 1
        AND CASE
          WHEN v_expected.signature =
            'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
            THEN procedure_row.proconfig[1] = 'search_path=pg_catalog, public'
          ELSE procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        END
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_expected.service_execute
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND (
                 NOT v_expected.service_execute
                 OR grantee.rolname IS DISTINCT FROM 'service_role'
               )
             )
        )
    ) THEN
      RAISE EXCEPTION 'teskeid_event_dependency_acl_drift:%',
        v_expected.signature;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('expense_event_contexts', 'expense_event_context_integrity_deferred',
        'public.expense_event_integrity_trigger()', true, 29::smallint),
      ('expense_event_participants', 'expense_event_participant_integrity_deferred',
        'public.expense_event_integrity_trigger()', true, 29::smallint),
      ('expense_groups', 'expense_event_group_integrity_deferred',
        'public.expense_event_group_integrity_trigger()', true, 25::smallint),
      ('expense_event_contexts', 'expense_event_context_immutable_guard',
        'public.expense_event_context_immutable()', false, 19::smallint),
      ('expense_event_participants', 'expense_event_participant_immutable_guard',
        'public.expense_event_participant_immutable()', false, 19::smallint),
      ('expense_group_members', 'expense_event_group_members_frozen_guard',
        'public.expense_event_roster_frozen()', false, 31::smallint),
      ('expense_member_invitations', 'expense_event_member_invitations_guard',
        'public.expense_event_invitation_blocked()', false, 23::smallint),
      ('expense_repayments', 'expense_repayments_review_guard',
        'public.expense_guard_new_reported_repayment()', false, 7::smallint),
      ('expense_repayments', 'expense_repayments_batch_guard',
        'public.expense_guard_batch_repayment_mutation()', false, 19::smallint),
      ('expense_settlement_batches', 'expense_settlement_batches_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_settlement_batches', 'expense_settlement_batches_immutable_guard',
        'public.expense_guard_settlement_batch_mutation()', false, 27::smallint),
      ('expense_settlement_batch_items', 'expense_settlement_batch_items_immutable_guard',
        'public.expense_guard_settlement_batch_item_mutation()', false, 27::smallint),
      ('expense_group_members', 'expense_group_members_cancel_batches_before_unlink',
        'public.expense_cancel_batches_before_user_unlink()', false, 19::smallint)
    ) AS expected(table_name, trigger_name, function_signature, deferred, trigger_type)
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = pg_catalog.to_regclass(
        'public.' || expected.table_name
      )
     AND trigger_row.tgname = expected.trigger_name
     AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
       expected.function_signature
     )
     AND trigger_row.tgdeferrable = expected.deferred
     AND trigger_row.tginitdeferred = expected.deferred
     AND trigger_row.tgtype = expected.trigger_type
     AND trigger_row.tgenabled = 'O'
     AND NOT trigger_row.tgisinternal
  ) <> 13 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid IN (
      pg_catalog.to_regclass('public.expense_event_contexts'),
      pg_catalog.to_regclass('public.expense_event_participants')
    )
      AND NOT trigger_row.tgisinternal
  ) <> 4 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = pg_catalog.to_regclass(
        'public.expense_group_members'
      )
      AND trigger_row.tgname =
        'expense_group_members_cancel_batches_before_unlink'
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(trigger_row.oid), 'UPDATE OF user_id'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(trigger_row.oid),
        'old.user_id IS NOT NULL'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_triggerdef(trigger_row.oid),
        'new.user_id IS NULL'
      ) > 0
  ) THEN
    RAISE EXCEPTION 'teskeid_event_critical_trigger_drift';
  END IF;
END;
$teskeid_event_preconditions$;

-- Normalize only the exact legacy Supabase default envelope accepted above.
-- This is data-neutral, leaves RLS/policies/identity-sequence ACL untouched and
-- narrows direct table access to SQL46's intended service-role CRUD contract.
REVOKE ALL PRIVILEGES ON TABLE public.recent_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recent_events
  TO service_role;

-- Snapshot every canonical legacy financial row before the additive backfill.
-- The same values are attested again before COMMIT; count/ID-only checks are
-- intentionally insufficient because they could hide a value rewrite.
CREATE TEMP TABLE pg_temp.teskeid_event_legacy_attestation (
  relation_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  id_digest text NOT NULL,
  content_digest text NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.teskeid_event_legacy_attestation
  (relation_name, row_count, id_digest, content_digest)
SELECT 'expense_groups', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.id::text, '|' ORDER BY row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.id
  ), ''))
FROM public.expense_groups AS row_value
UNION ALL SELECT 'expense_group_members', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.group_id, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.id
  ), '')) FROM public.expense_group_members AS row_value
UNION ALL SELECT 'expenses', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.group_id, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.id
  ), '')) FROM public.expenses AS row_value
UNION ALL SELECT 'expense_payments', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.expense_id::text || ':' ||
      row_value.member_id::text, '|' ORDER BY row_value.group_id,
      row_value.expense_id, row_value.member_id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.expense_id, row_value.member_id
  ), '')) FROM public.expense_payments AS row_value
UNION ALL SELECT 'expense_shares', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.expense_id::text || ':' ||
      row_value.member_id::text, '|' ORDER BY row_value.group_id,
      row_value.expense_id, row_value.member_id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.expense_id, row_value.member_id
  ), '')) FROM public.expense_shares AS row_value
UNION ALL SELECT 'expense_obligations', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.group_id, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.id
  ), '')) FROM public.expense_obligations AS row_value
UNION ALL SELECT 'expense_repayments', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.group_id, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.id
  ), '')) FROM public.expense_repayments AS row_value
UNION ALL SELECT 'expense_repayment_allocations', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.repayment_id::text || ':' ||
      row_value.obligation_id::text, '|' ORDER BY row_value.group_id,
      row_value.repayment_id, row_value.obligation_id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.repayment_id, row_value.obligation_id
  ), '')) FROM public.expense_repayment_allocations AS row_value
UNION ALL SELECT 'expense_member_invitations', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.group_id::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.group_id, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.group_id, row_value.id
  ), '')) FROM public.expense_member_invitations AS row_value
UNION ALL SELECT 'expense_activity', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.sequence_no::text || ':' || row_value.id::text, '|'
      ORDER BY row_value.sequence_no, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.sequence_no, row_value.id
  ), '')) FROM public.expense_activity AS row_value
UNION ALL SELECT 'expense_mutation_requests', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.actor_user_id::text || ':' || row_value.request_id::text, '|'
      ORDER BY row_value.actor_user_id, row_value.request_id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.actor_user_id, row_value.request_id
  ), '')) FROM public.expense_mutation_requests AS row_value
UNION ALL SELECT 'expense_settlement_batches', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.id::text, '|' ORDER BY row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.id
  ), '')) FROM public.expense_settlement_batches AS row_value
UNION ALL SELECT 'expense_settlement_batch_items', pg_catalog.count(*),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    row_value.batch_id::text || ':' || row_value.sequence_no::text || ':' ||
      row_value.id::text, '|' ORDER BY row_value.batch_id,
      row_value.sequence_no, row_value.id
  ), '')),
  pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.batch_id, row_value.sequence_no, row_value.id
  ), '')) FROM public.expense_settlement_batch_items AS row_value;

CREATE FUNCTION public.teskeid_event_normalize_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE WHEN p_value IS NULL THEN NULL
    ELSE pg_catalog.normalize(pg_catalog.btrim(p_value)) END;
$function$;

CREATE FUNCTION public.teskeid_event_valid_text(
  p_value text,
  p_minimum integer,
  p_maximum integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_value IS NOT NULL
    AND p_value = public.teskeid_event_normalize_text(p_value)
    AND p_minimum >= 1
    AND p_maximum >= p_minimum
    AND pg_catalog.char_length(p_value) BETWEEN p_minimum AND p_maximum
    AND p_value !~ '[[:cntrl:]]'
    AND p_value !~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]',
    false
  );
$function$;

CREATE FUNCTION public.teskeid_event_uuid_from_text(p_value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (
    pg_catalog.substr(v.digest, 1, 8) || '-' ||
    pg_catalog.substr(v.digest, 9, 4) || '-5' ||
    pg_catalog.substr(v.digest, 14, 3) || '-8' ||
    pg_catalog.substr(v.digest, 18, 3) || '-' ||
    pg_catalog.substr(v.digest, 21, 12)
  )::uuid
  FROM (SELECT pg_catalog.md5(COALESCE(p_value, '')) AS digest) AS v;
$function$;

CREATE TABLE public.teskeid_events (
  id                      uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_user_id           uuid        NOT NULL,
  name                    text        NOT NULL,
  roster_revision         bigint      NOT NULL DEFAULT 1,
  legacy_expense_group_id uuid        NULL,
  created_at              timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at              timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_events_owner_fk
    FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT teskeid_events_legacy_context_fk
    FOREIGN KEY (legacy_expense_group_id)
    REFERENCES public.expense_event_contexts(group_id) ON DELETE RESTRICT,
  CONSTRAINT teskeid_events_legacy_context_key UNIQUE (legacy_expense_group_id),
  CONSTRAINT teskeid_events_name_check
    CHECK (public.teskeid_event_valid_text(name, 1, 160)),
  CONSTRAINT teskeid_events_revision_check CHECK (roster_revision > 0),
  CONSTRAINT teskeid_events_legacy_id_check CHECK (
    legacy_expense_group_id IS NULL OR id = legacy_expense_group_id
  )
);

CREATE TABLE public.teskeid_event_guests (
  id                    uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_id              uuid        NOT NULL,
  status                text        NOT NULL DEFAULT 'active',
  position              smallint    NULL,
  source_kind           text        NOT NULL,
  display_name_snapshot text        NOT NULL,
  email_canonical       text        NULL,
  linked_user_id        uuid        NULL,
  relationship_id       uuid        NULL,
  created_at            timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at            timestamptz NOT NULL DEFAULT pg_catalog.now(),
  removed_at            timestamptz NULL,

  CONSTRAINT teskeid_event_guests_event_id_id_key UNIQUE (event_id, id),
  CONSTRAINT teskeid_event_guests_event_fk
    FOREIGN KEY (event_id) REFERENCES public.teskeid_events(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_guests_linked_user_fk
    FOREIGN KEY (linked_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT teskeid_event_guests_relationship_fk
    FOREIGN KEY (relationship_id) REFERENCES public.relationships(id) ON DELETE SET NULL,
  CONSTRAINT teskeid_event_guests_status_check
    CHECK (status IN ('active', 'removed')),
  CONSTRAINT teskeid_event_guests_position_check CHECK (
    (status = 'active' AND position BETWEEN 0 AND 48 AND removed_at IS NULL)
    OR (status = 'removed' AND position IS NULL AND removed_at IS NOT NULL)
  ),
  CONSTRAINT teskeid_event_guests_source_check CHECK (
    source_kind IN ('relationship', 'manual_name', 'manual_email')
  ),
  CONSTRAINT teskeid_event_guests_name_check CHECK (
    public.teskeid_event_valid_text(display_name_snapshot, 1, 120)
  ),
  CONSTRAINT teskeid_event_guests_identity_shape_check CHECK (
    (
      source_kind = 'manual_name'
      AND email_canonical IS NULL
      AND linked_user_id IS NULL
      AND relationship_id IS NULL
    )
    OR (
      source_kind = 'manual_email'
      AND email_canonical IS NOT NULL
      AND email_canonical = public.normalize_email_canonical(email_canonical)
      AND public.teskeid_event_valid_text(email_canonical, 3, 320)
      AND email_canonical ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND linked_user_id IS NULL
      AND relationship_id IS NULL
    )
    OR (
      source_kind = 'relationship'
      AND email_canonical IS NULL
    )
  )
);

CREATE TABLE public.teskeid_event_mutation_requests (
  actor_user_id uuid        NOT NULL,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at  timestamptz NULL,

  CONSTRAINT teskeid_event_mutation_requests_pkey
    PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT teskeid_event_mutation_requests_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_mutation_requests_operation_check
    CHECK (pg_catalog.char_length(operation) BETWEEN 1 AND 80),
  CONSTRAINT teskeid_event_mutation_requests_fingerprint_check
    CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT teskeid_event_mutation_requests_result_check CHECK (
    result IS NULL OR (
      pg_catalog.jsonb_typeof(result) = 'object'
      AND pg_catalog.octet_length(result::text) <= 8192
    )
  )
);

CREATE TABLE public.teskeid_event_expense_links (
  event_id          uuid        NOT NULL,
  group_id          uuid        NOT NULL,
  expense_id        uuid        NOT NULL,
  linked_by_user_id uuid        NULL,
  link_revision     bigint      NOT NULL DEFAULT 1,
  linked_at         timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_expense_links_pkey
    PRIMARY KEY (event_id, expense_id),
  CONSTRAINT teskeid_event_expense_links_scope_key
    UNIQUE (event_id, group_id, expense_id),
  CONSTRAINT teskeid_event_expense_links_event_fk
    FOREIGN KEY (event_id) REFERENCES public.teskeid_events(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_expense_links_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT teskeid_event_expense_links_actor_fk
    FOREIGN KEY (linked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT teskeid_event_expense_links_revision_check CHECK (link_revision = 1)
);

CREATE TABLE public.teskeid_event_expense_participant_sources (
  event_id          uuid        NOT NULL,
  group_id          uuid        NOT NULL,
  expense_id        uuid        NOT NULL,
  event_guest_id    uuid        NOT NULL,
  expense_member_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_expense_sources_pkey
    PRIMARY KEY (event_id, expense_id, event_guest_id),
  CONSTRAINT teskeid_event_expense_sources_link_fk
    FOREIGN KEY (event_id, group_id, expense_id)
    REFERENCES public.teskeid_event_expense_links(event_id, group_id, expense_id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_event_expense_sources_guest_fk
    FOREIGN KEY (event_id, event_guest_id)
    REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_expense_sources_member_fk
    FOREIGN KEY (group_id, expense_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT
);

CREATE INDEX teskeid_events_owner_created_idx
  ON public.teskeid_events (owner_user_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX teskeid_event_guests_active_position_uidx
  ON public.teskeid_event_guests (event_id, position)
  WHERE status = 'active';
CREATE UNIQUE INDEX teskeid_event_guests_active_linked_uidx
  ON public.teskeid_event_guests (event_id, linked_user_id)
  WHERE status = 'active' AND linked_user_id IS NOT NULL;
CREATE UNIQUE INDEX teskeid_event_guests_active_email_uidx
  ON public.teskeid_event_guests (event_id, email_canonical)
  WHERE status = 'active' AND email_canonical IS NOT NULL;
CREATE UNIQUE INDEX teskeid_event_expense_links_expense_uidx
  ON public.teskeid_event_expense_links (expense_id);
CREATE UNIQUE INDEX teskeid_event_expense_sources_member_uidx
  ON public.teskeid_event_expense_participant_sources (
    event_id, expense_id, expense_member_id
  );

ALTER TABLE public.teskeid_events OWNER TO postgres;
ALTER TABLE public.teskeid_event_guests OWNER TO postgres;
ALTER TABLE public.teskeid_event_mutation_requests OWNER TO postgres;
ALTER TABLE public.teskeid_event_expense_links OWNER TO postgres;
ALTER TABLE public.teskeid_event_expense_participant_sources OWNER TO postgres;

ALTER TABLE public.teskeid_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_guests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_mutation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_expense_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_expense_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_expense_participant_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_expense_participant_sources FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teskeid_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_guests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_expense_links
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_expense_participant_sources
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (id, owner_user_id, name, roster_revision,
  legacy_expense_group_id, created_at, updated_at)
  ON TABLE public.teskeid_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (id, event_id, status, position, source_kind,
  display_name_snapshot, email_canonical, linked_user_id, relationship_id,
  created_at, updated_at, removed_at)
  ON TABLE public.teskeid_event_guests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (actor_user_id, request_id, operation, fingerprint, result,
  created_at, completed_at)
  ON TABLE public.teskeid_event_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (event_id, group_id, expense_id, linked_by_user_id,
  link_revision, linked_at)
  ON TABLE public.teskeid_event_expense_links
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (event_id, group_id, expense_id, event_guest_id,
  expense_member_id, created_at)
  ON TABLE public.teskeid_event_expense_participant_sources
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.teskeid_event_has_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM auth.users AS account
    JOIN public.feature_access AS access_row
      ON public.normalize_email_canonical(access_row.email)
       = public.normalize_email_canonical(account.email)
     AND access_row.feature_key = 'afmaeli-og-vidburdir'
    WHERE account.id = p_user_id
  ), false);
$function$;

CREATE FUNCTION public.teskeid_event_assert_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL OR NOT public.teskeid_event_has_access(p_actor_id) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_assert_financial_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL
     OR NOT public.teskeid_event_has_access(p_actor_id)
     OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_begin_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint text,
  p_require_expenses boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing public.teskeid_event_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_require_expenses IS NULL
     OR pg_catalog.char_length(p_operation) NOT BETWEEN 1 AND 80
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  -- Financial mutations preserve the canonical expense lock order. The nested
  -- SQL110 receipt lock is re-entrant in this transaction.
  IF p_require_expenses THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_actor_id::text, 9601)
    );
  END IF;
  -- Serialize every event mutation for one actor. Account deletion takes the
  -- same lock before revoking access or erasing owner-private receipts.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  IF p_require_expenses THEN
    PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  ELSE
    PERFORM public.teskeid_event_assert_actor(p_actor_id);
  END IF;

  INSERT INTO public.teskeid_event_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, p_operation, p_fingerprint
  )
  ON CONFLICT (actor_user_id, request_id) DO NOTHING;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request_row.*
  INTO v_existing
  FROM public.teskeid_event_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
  FOR UPDATE;

  IF v_existing.operation <> p_operation
     OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_conflict';
  END IF;
  IF v_existing.result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
  END IF;
  RETURN v_existing.result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_finish_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.jsonb_typeof(p_result) <> 'object'
     OR pg_catalog.octet_length(p_result::text) > 8192 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_result';
  END IF;
  UPDATE public.teskeid_event_mutation_requests AS request_row
  SET result = p_result,
      completed_at = pg_catalog.now()
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
    AND request_row.result IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_assert_roster(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
  ) THEN
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.status = 'active';

  IF v_count > 49
     OR (
       v_count > 0
       AND (
         SELECT (
           pg_catalog.min(guest.position) = 0
           AND pg_catalog.max(guest.position) = v_count - 1
           AND pg_catalog.count(DISTINCT guest.position) = v_count
         )
         FROM public.teskeid_event_guests AS guest
         WHERE guest.event_id = p_event_id
           AND guest.status = 'active'
       ) IS NOT TRUE
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_guests AS guest
       WHERE guest.event_id = p_event_id
         AND guest.status = 'active'
         AND guest.source_kind = 'relationship'
         AND guest.linked_user_id IS NULL
         AND guest.relationship_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_invalid';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_roster_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.teskeid_event_assert_roster(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_guard_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id <> NEW.id
     OR OLD.owner_user_id <> NEW.owner_user_id
     OR OLD.legacy_expense_group_id IS DISTINCT FROM NEW.legacy_expense_group_id
     OR OLD.created_at <> NEW.created_at
     OR NEW.roster_revision < OLD.roster_revision
     OR NEW.roster_revision > OLD.roster_revision + 1 THEN
    RAISE EXCEPTION 'teskeid_event_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_guard_guest_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id <> NEW.id
     OR OLD.event_id <> NEW.event_id
     OR OLD.source_kind <> NEW.source_kind
     OR OLD.display_name_snapshot <> NEW.display_name_snapshot
     OR OLD.email_canonical IS DISTINCT FROM NEW.email_canonical
     OR OLD.created_at <> NEW.created_at
     OR (
       OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id
       AND NOT (OLD.linked_user_id IS NOT NULL AND NEW.linked_user_id IS NULL)
     )
     OR (
       OLD.relationship_id IS DISTINCT FROM NEW.relationship_id
       AND NOT (OLD.relationship_id IS NOT NULL AND NEW.relationship_id IS NULL)
     )
     OR NOT (
       (OLD.status = NEW.status AND OLD.position IS NOT DISTINCT FROM NEW.position
         AND OLD.removed_at IS NOT DISTINCT FROM NEW.removed_at)
       OR (OLD.status = 'active' AND NEW.status = 'removed'
         AND NEW.position IS NULL AND NEW.removed_at IS NOT NULL)
       OR (OLD.status = 'removed' AND NEW.status = 'active'
         AND NEW.position BETWEEN 0 AND 48 AND NEW.removed_at IS NULL)
       OR (OLD.status = 'active' AND NEW.status = 'active'
         AND NEW.position BETWEEN 0 AND 48 AND NEW.removed_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'teskeid_event_guest_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_guard_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.actor_user_id <> NEW.actor_user_id
     OR OLD.request_id <> NEW.request_id
     OR OLD.operation <> NEW.operation
     OR OLD.fingerprint <> NEW.fingerprint
     OR OLD.created_at <> NEW.created_at
     OR OLD.result IS NOT NULL
     OR NEW.result IS NULL
     OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_receipt_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_assert_expense_link(
  p_event_id uuid,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row
      ON event_row.id = link.event_id
    JOIN public.expense_groups AS group_row
      ON group_row.id = link.group_id
     AND group_row.kind = 'one_off'
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    JOIN public.expense_group_members AS owner_member
      ON owner_member.group_id = link.group_id
     AND owner_member.user_id = event_row.owner_user_id
     AND owner_member.role = 'owner'
     AND owner_member.status = 'active'
    WHERE link.event_id = p_event_id
      AND link.group_id = p_group_id
      AND link.expense_id = p_expense_id
      AND link.linked_by_user_id IS NOT DISTINCT FROM event_row.owner_user_id
      AND (
        SELECT pg_catalog.count(*)
        FROM public.expenses AS group_expense
        WHERE group_expense.group_id = link.group_id
      ) = 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_invalid';
  END IF;
END;
$function$;

-- A tag must stay valid when canonical financial parents change later, not
-- only when the immutable link is first inserted. These deferred reverse
-- guards do not authorize or rewrite any canonical expense row.
CREATE FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_link record;
BEGIN
  v_group_id := CASE
    WHEN TG_TABLE_NAME = 'expense_group_members' THEN COALESCE(NEW.group_id, OLD.group_id)
    WHEN TG_TABLE_NAME = 'expenses' THEN COALESCE(NEW.group_id, OLD.group_id)
    ELSE COALESCE(NEW.id, OLD.id)
  END;

  FOR v_link IN
    SELECT link.event_id, link.group_id, link.expense_id
    FROM public.teskeid_event_expense_links AS link
    WHERE link.group_id = v_group_id
    ORDER BY link.event_id, link.group_id, link.expense_id
  LOOP
    PERFORM public.teskeid_event_assert_expense_link(
      v_link.event_id, v_link.group_id, v_link.expense_id
    );
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_expense_link_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.teskeid_event_assert_expense_link(
    NEW.event_id, NEW.group_id, NEW.expense_id
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_immutable_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'teskeid_event_history_immutable';
END;
$function$;

CREATE TRIGGER teskeid_events_touch_updated_at
  BEFORE UPDATE ON public.teskeid_events
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_touch_updated_at();
CREATE TRIGGER teskeid_event_guests_touch_updated_at
  BEFORE UPDATE ON public.teskeid_event_guests
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_touch_updated_at();
CREATE TRIGGER teskeid_events_update_guard
  BEFORE UPDATE ON public.teskeid_events
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_guard_event_update();
CREATE TRIGGER teskeid_event_guests_update_guard
  BEFORE UPDATE ON public.teskeid_event_guests
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_guard_guest_update();
CREATE TRIGGER teskeid_event_receipts_mutation_guard
  BEFORE UPDATE OR DELETE ON public.teskeid_event_mutation_requests
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_guard_receipt_mutation();
CREATE CONSTRAINT TRIGGER teskeid_event_guests_roster_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.teskeid_event_guests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_roster_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_expense_links_integrity_deferred
  AFTER INSERT OR UPDATE ON public.teskeid_event_expense_links
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_expense_link_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_expense_groups_integrity_deferred
  AFTER UPDATE OR DELETE ON public.expense_groups
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_financial_parent_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_expenses_integrity_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_financial_parent_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_expense_members_integrity_deferred
  AFTER UPDATE OR DELETE ON public.expense_group_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_financial_parent_integrity_trigger();
CREATE TRIGGER teskeid_event_expense_links_immutable_guard
  BEFORE UPDATE ON public.teskeid_event_expense_links
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_immutable_history();
CREATE TRIGGER teskeid_event_expense_sources_immutable_guard
  BEFORE UPDATE ON public.teskeid_event_expense_participant_sources
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_immutable_history();

-- Deterministic event-domain-only backfill. No legacy financial row is tagged,
-- rewritten or deleted. IDs and roster positions remain byte-for-byte stable.
INSERT INTO public.teskeid_events (
  id, owner_user_id, name, roster_revision,
  legacy_expense_group_id, created_at, updated_at
)
SELECT
  context_row.group_id,
  context_row.owner_user_id,
  group_row.name,
  1,
  context_row.group_id,
  context_row.created_at,
  context_row.created_at
FROM public.expense_event_contexts AS context_row
JOIN public.expense_groups AS group_row
  ON group_row.id = context_row.group_id
ORDER BY context_row.group_id;

INSERT INTO public.teskeid_event_guests (
  id, event_id, status, position, source_kind,
  display_name_snapshot, email_canonical, linked_user_id, relationship_id,
  created_at, updated_at, removed_at
)
SELECT
  participant.member_id,
  participant.group_id,
  'active',
  participant.position,
  CASE WHEN participant.linked_user_id IS NULL
    THEN 'manual_name' ELSE 'relationship' END,
  member.display_name,
  NULL,
  participant.linked_user_id,
  relationship.id,
  participant.created_at,
  participant.created_at,
  NULL
FROM public.expense_event_participants AS participant
JOIN public.expense_event_contexts AS context_row
  ON context_row.group_id = participant.group_id
JOIN public.expense_group_members AS member
  ON member.group_id = participant.group_id
 AND member.id = participant.member_id
LEFT JOIN public.relationships AS relationship
  ON relationship.owner_id = context_row.owner_user_id
 AND relationship.counterpart_user_id = participant.linked_user_id
ORDER BY participant.group_id, participant.position;

DO $teskeid_event_backfill_attestation$
DECLARE
  v_legacy_events bigint;
  v_v2_events bigint;
  v_legacy_guests bigint;
  v_v2_guests bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_legacy_events
  FROM public.expense_event_contexts;
  SELECT pg_catalog.count(*) INTO v_v2_events
  FROM public.teskeid_events
  WHERE legacy_expense_group_id IS NOT NULL;
  SELECT pg_catalog.count(*) INTO v_legacy_guests
  FROM public.expense_event_participants;
  SELECT pg_catalog.count(*) INTO v_v2_guests
  FROM public.teskeid_event_guests AS guest
  JOIN public.teskeid_events AS event_row ON event_row.id = guest.event_id
  WHERE event_row.legacy_expense_group_id IS NOT NULL;

  IF v_legacy_events <> v_v2_events
     OR v_legacy_guests <> v_v2_guests
     OR EXISTS (
       SELECT 1
       FROM public.expense_event_contexts AS context_row
       JOIN public.expense_groups AS group_row ON group_row.id = context_row.group_id
       LEFT JOIN public.teskeid_events AS event_row
         ON event_row.id = context_row.group_id
        AND event_row.legacy_expense_group_id = context_row.group_id
       WHERE event_row.id IS NULL
          OR event_row.owner_user_id <> context_row.owner_user_id
          OR event_row.name <> group_row.name
          OR event_row.roster_revision <> 1
          OR event_row.created_at <> context_row.created_at
          OR event_row.updated_at <> context_row.created_at
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_event_participants AS participant
       JOIN public.expense_group_members AS member
         ON member.group_id = participant.group_id
        AND member.id = participant.member_id
       LEFT JOIN public.teskeid_event_guests AS guest
         ON guest.event_id = participant.group_id
        AND guest.id = participant.member_id
        WHERE guest.id IS NULL
          OR guest.status <> 'active'
          OR guest.position <> participant.position
          OR guest.source_kind <> CASE
            WHEN participant.linked_user_id IS NULL
              THEN 'manual_name' ELSE 'relationship' END
          OR guest.display_name_snapshot <> member.display_name
          OR guest.email_canonical IS NOT NULL
          OR guest.linked_user_id IS DISTINCT FROM participant.linked_user_id
          OR guest.relationship_id IS DISTINCT FROM (
            SELECT relationship.id
            FROM public.expense_event_contexts AS context_row
            JOIN public.relationships AS relationship
              ON relationship.owner_id = context_row.owner_user_id
             AND relationship.counterpart_user_id = participant.linked_user_id
            WHERE context_row.group_id = participant.group_id
            ORDER BY relationship.id
            LIMIT 1
          )
          OR guest.created_at <> participant.created_at
          OR guest.updated_at <> participant.created_at
          OR guest.removed_at IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_expense_links
     ) THEN
    RAISE EXCEPTION 'teskeid_event_backfill_parity_failed';
  END IF;
END;
$teskeid_event_backfill_attestation$;

CREATE FUNCTION public.teskeid_event_create(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_guests jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := public.teskeid_event_normalize_text(p_name);
  v_canonical_guests jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_item jsonb;
  v_source_kind text;
  v_display_name text;
  v_email text;
  v_relationship_id uuid;
  v_linked_user_id uuid;
  v_position integer := 0;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_request_id IS NULL
     OR NOT public.teskeid_event_valid_text(v_name, 1, 160)
     OR p_guests IS NULL
     OR pg_catalog.jsonb_typeof(p_guests) <> 'array'
     OR pg_catalog.jsonb_array_length(p_guests) > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_guests) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
          OR NOT (item.value ? 'source_kind')
          OR pg_catalog.jsonb_typeof(item.value->'source_kind') <> 'string'
          OR item.value->>'source_kind' NOT IN (
            'relationship', 'manual_name', 'manual_email'
          )
          OR (
            item.value->>'source_kind' = 'relationship'
            AND (
              (item.value - ARRAY['source_kind', 'relationship_id']::text[])
                <> '{}'::jsonb
              OR NOT (item.value ? 'relationship_id')
              OR pg_catalog.jsonb_typeof(item.value->'relationship_id') <> 'string'
              OR (item.value->>'relationship_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
          OR (
            item.value->>'source_kind' = 'manual_name'
            AND (
              (item.value - ARRAY['source_kind', 'display_name']::text[])
                <> '{}'::jsonb
              OR NOT (item.value ? 'display_name')
              OR pg_catalog.jsonb_typeof(item.value->'display_name') <> 'string'
              OR NOT public.teskeid_event_valid_text(
                public.teskeid_event_normalize_text(item.value->>'display_name'),
                1, 120
              )
            )
          )
          OR (
            item.value->>'source_kind' = 'manual_email'
            AND (
              (item.value - ARRAY['source_kind', 'email']::text[])
                <> '{}'::jsonb
              OR NOT (item.value ? 'email')
              OR pg_catalog.jsonb_typeof(item.value->'email') <> 'string'
              OR public.normalize_email_canonical(item.value->>'email') IS NULL
              OR NOT public.teskeid_event_valid_text(
                public.normalize_email_canonical(item.value->>'email'),
                3, 320
              )
              OR public.normalize_email_canonical(item.value->>'email')
                !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
            )
          )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE item.value->>'source_kind'
      WHEN 'relationship' THEN pg_catalog.jsonb_build_object(
        'source_kind', 'relationship',
        'relationship_id', (item.value->>'relationship_id')::uuid
      )
      WHEN 'manual_email' THEN pg_catalog.jsonb_build_object(
        'source_kind', 'manual_email',
        'email', public.normalize_email_canonical(item.value->>'email')
      )
      ELSE pg_catalog.jsonb_build_object(
        'source_kind', 'manual_name',
        'display_name', public.teskeid_event_normalize_text(
          item.value->>'display_name'
        )
      )
    END ORDER BY item.ordinal
  ), '[]'::jsonb)
  INTO v_canonical_guests
  FROM pg_catalog.jsonb_array_elements(p_guests)
    WITH ORDINALITY AS item(value, ordinal);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value->>'source_kind' = 'relationship'
    GROUP BY item.value->>'relationship_id'
    HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value->>'source_kind' = 'manual_email'
    GROUP BY item.value->>'email'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_guest_conflict';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'name', v_name,
    'guests', v_canonical_guests
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_create', v_fingerprint, false
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  FOR v_linked_user_id IN
    SELECT DISTINCT relationship.counterpart_user_id AS user_id
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    JOIN public.relationships AS relationship
      ON relationship.id = (item.value->>'relationship_id')::uuid
     AND relationship.owner_id = p_actor_id
    WHERE item.value->>'source_kind' = 'relationship'
      AND relationship.counterpart_user_id IS NOT NULL
    ORDER BY relationship.counterpart_user_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_linked_user_id::text, 9602)
    );
  END LOOP;

  INSERT INTO public.teskeid_events (
    id, owner_user_id, name, roster_revision
  ) VALUES (
    v_event_id, p_actor_id, v_name, 1
  );

  FOR v_item IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests)
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    v_source_kind := v_item->>'source_kind';
    v_display_name := NULL;
    v_email := NULL;
    v_relationship_id := NULL;
    v_linked_user_id := NULL;

    IF v_source_kind = 'relationship' THEN
      v_relationship_id := (v_item->>'relationship_id')::uuid;
      SELECT
        relationship.counterpart_user_id,
        CASE
          WHEN public.teskeid_event_valid_text(
            public.teskeid_event_normalize_text(profile.display_name), 1, 120
          ) THEN public.teskeid_event_normalize_text(profile.display_name)
          ELSE 'Teskeiðarnotandi'
        END
      INTO v_linked_user_id, v_display_name
      FROM public.relationships AS relationship
      JOIN auth.users AS account
        ON account.id = relationship.counterpart_user_id
      LEFT JOIN public.profiles AS profile
        ON profile.id = relationship.counterpart_user_id
      WHERE relationship.id = v_relationship_id
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;
      IF v_linked_user_id IS NULL THEN
        RAISE EXCEPTION 'teskeid_event_guest_invalid';
      END IF;
    ELSIF v_source_kind = 'manual_email' THEN
      v_email := v_item->>'email';
      v_display_name := pg_catalog.left(v_email, 120);
    ELSE
      v_display_name := v_item->>'display_name';
    END IF;

    INSERT INTO public.teskeid_event_guests (
      event_id, status, position, source_kind, display_name_snapshot,
      email_canonical, linked_user_id, relationship_id
    ) VALUES (
      v_event_id, 'active', v_position, v_source_kind, v_display_name,
      v_email, v_linked_user_id, v_relationship_id
    );
    v_position := v_position + 1;
  END LOOP;

  PERFORM public.teskeid_event_assert_roster(v_event_id);
  v_result := pg_catalog.jsonb_build_object(
    'event_id', v_event_id,
    'roster_revision', 1
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list(p_actor_id uuid)
RETURNS TABLE (
  event_id uuid,
  name text,
  active_guest_count integer,
  roster_revision bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  RETURN QUERY
  SELECT
    event_row.id,
    event_row.name,
    (
      SELECT pg_catalog.count(*)::integer
      FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = event_row.id
        AND guest.status = 'active'
    ),
    event_row.roster_revision,
    event_row.created_at,
    event_row.updated_at
  FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_actor_id
  ORDER BY event_row.created_at DESC, event_row.id DESC
  LIMIT 100;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', event_row.name,
    'roster_revision', event_row.roster_revision,
    'created_at', event_row.created_at,
    'updated_at', event_row.updated_at,
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', guest.id,
        'source_kind', guest.source_kind,
        'display_name', guest.display_name_snapshot,
        'email', CASE WHEN guest.source_kind = 'manual_email'
          THEN guest.email_canonical ELSE NULL END,
        'is_teskeid_user', guest.linked_user_id IS NOT NULL,
        'position', guest.position
      ) ORDER BY guest.position)
      FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = event_row.id
        AND guest.status = 'active'
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_replace_roster(
  p_actor_id uuid,
  p_event_id uuid,
  p_request_id uuid,
  p_expected_roster_revision bigint,
  p_guests jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_canonical_guests jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_item jsonb;
  v_source_kind text;
  v_display_name text;
  v_email text;
  v_relationship_id uuid;
  v_linked_user_id uuid;
  v_position integer := 0;
  v_new_revision bigint;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_request_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_guests IS NULL
     OR pg_catalog.jsonb_typeof(p_guests) <> 'array'
     OR pg_catalog.jsonb_array_length(p_guests) > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_guests) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
          OR (
            item.value ? 'event_guest_id'
            AND (
              (item.value - 'event_guest_id') <> '{}'::jsonb
              OR NOT (item.value ? 'event_guest_id')
              OR pg_catalog.jsonb_typeof(item.value->'event_guest_id') <> 'string'
              OR (item.value->>'event_guest_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
          OR (
            NOT (item.value ? 'event_guest_id')
            AND (
              NOT (item.value ? 'source_kind')
              OR pg_catalog.jsonb_typeof(item.value->'source_kind') <> 'string'
              OR item.value->>'source_kind' NOT IN (
                'relationship', 'manual_name', 'manual_email'
              )
              OR (
                item.value->>'source_kind' = 'relationship'
                AND (
                  (item.value - ARRAY['source_kind', 'relationship_id']::text[])
                    <> '{}'::jsonb
                  OR NOT (item.value ? 'relationship_id')
                  OR pg_catalog.jsonb_typeof(item.value->'relationship_id')
                    <> 'string'
                  OR (item.value->>'relationship_id')
                    !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                )
              )
              OR (
                item.value->>'source_kind' = 'manual_name'
                AND (
                  (item.value - ARRAY['source_kind', 'display_name']::text[])
                    <> '{}'::jsonb
                  OR NOT (item.value ? 'display_name')
                  OR pg_catalog.jsonb_typeof(item.value->'display_name')
                    <> 'string'
                  OR NOT public.teskeid_event_valid_text(
                    public.teskeid_event_normalize_text(
                      item.value->>'display_name'
                    ), 1, 120
                  )
                )
              )
              OR (
                item.value->>'source_kind' = 'manual_email'
                AND (
                  (item.value - ARRAY['source_kind', 'email']::text[])
                    <> '{}'::jsonb
                  OR NOT (item.value ? 'email')
                  OR pg_catalog.jsonb_typeof(item.value->'email') <> 'string'
                  OR public.normalize_email_canonical(item.value->>'email') IS NULL
                  OR NOT public.teskeid_event_valid_text(
                    public.normalize_email_canonical(item.value->>'email'),
                    3, 320
                  )
                  OR public.normalize_email_canonical(item.value->>'email')
                    !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
                )
              )
            )
          )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE
      WHEN item.value ? 'event_guest_id' THEN pg_catalog.jsonb_build_object(
        'event_guest_id', (item.value->>'event_guest_id')::uuid
      )
      WHEN item.value->>'source_kind' = 'relationship'
        THEN pg_catalog.jsonb_build_object(
          'source_kind', 'relationship',
          'relationship_id', (item.value->>'relationship_id')::uuid
        )
      WHEN item.value->>'source_kind' = 'manual_email'
        THEN pg_catalog.jsonb_build_object(
          'source_kind', 'manual_email',
          'email', public.normalize_email_canonical(item.value->>'email')
        )
      ELSE pg_catalog.jsonb_build_object(
        'source_kind', 'manual_name',
        'display_name', public.teskeid_event_normalize_text(
          item.value->>'display_name'
        )
      )
    END ORDER BY item.ordinal
  ), '[]'::jsonb)
  INTO v_canonical_guests
  FROM pg_catalog.jsonb_array_elements(p_guests)
    WITH ORDINALITY AS item(value, ordinal);

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value ? 'event_guest_id'
    GROUP BY item.value->>'event_guest_id' HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value->>'source_kind' = 'relationship'
    GROUP BY item.value->>'relationship_id' HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value->>'source_kind' = 'manual_email'
    GROUP BY item.value->>'email' HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_guest_conflict';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'guests', v_canonical_guests
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_replace_roster',
    v_fingerprint, false
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;

  FOR v_linked_user_id IN
    SELECT DISTINCT relationship.counterpart_user_id AS user_id
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    JOIN public.relationships AS relationship
      ON relationship.id = (item.value->>'relationship_id')::uuid
     AND relationship.owner_id = p_actor_id
    WHERE item.value->>'source_kind' = 'relationship'
      AND relationship.counterpart_user_id IS NOT NULL
    ORDER BY relationship.counterpart_user_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_linked_user_id::text, 9602)
    );
  END LOOP;

  -- Every retained ID must be active in this exact roster before mutation.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests) AS item(value)
    WHERE item.value ? 'event_guest_id'
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_event_guests AS guest
        WHERE guest.event_id = p_event_id
          AND guest.id = (item.value->>'event_guest_id')::uuid
          AND guest.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.status = 'active'
  ORDER BY guest.id
  FOR UPDATE;

  UPDATE public.teskeid_event_guests AS guest
  SET status = 'removed', position = NULL, removed_at = pg_catalog.now()
  WHERE guest.event_id = p_event_id
    AND guest.status = 'active';

  FOR v_item IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests)
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    IF v_item ? 'event_guest_id' THEN
      UPDATE public.teskeid_event_guests AS guest
      SET status = 'active', position = v_position, removed_at = NULL
      WHERE guest.event_id = p_event_id
        AND guest.id = (v_item->>'event_guest_id')::uuid
        AND guest.status = 'removed';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'teskeid_event_roster_conflict';
      END IF;
    ELSE
      v_source_kind := v_item->>'source_kind';
      v_display_name := NULL;
      v_email := NULL;
      v_relationship_id := NULL;
      v_linked_user_id := NULL;
      IF v_source_kind = 'relationship' THEN
        v_relationship_id := (v_item->>'relationship_id')::uuid;
        SELECT relationship.counterpart_user_id,
          CASE WHEN public.teskeid_event_valid_text(
            public.teskeid_event_normalize_text(profile.display_name), 1, 120
          ) THEN public.teskeid_event_normalize_text(profile.display_name)
          ELSE 'Teskeiðarnotandi' END
        INTO v_linked_user_id, v_display_name
        FROM public.relationships AS relationship
        JOIN auth.users AS account
          ON account.id = relationship.counterpart_user_id
        LEFT JOIN public.profiles AS profile
          ON profile.id = relationship.counterpart_user_id
        WHERE relationship.id = v_relationship_id
          AND relationship.owner_id = p_actor_id
          AND relationship.counterpart_user_id IS NOT NULL
          AND relationship.counterpart_user_id <> p_actor_id;
        IF v_linked_user_id IS NULL THEN
          RAISE EXCEPTION 'teskeid_event_guest_invalid';
        END IF;
      ELSIF v_source_kind = 'manual_email' THEN
        v_email := v_item->>'email';
        v_display_name := pg_catalog.left(v_email, 120);
      ELSE
        v_display_name := v_item->>'display_name';
      END IF;
      INSERT INTO public.teskeid_event_guests (
        event_id, status, position, source_kind, display_name_snapshot,
        email_canonical, linked_user_id, relationship_id
      ) VALUES (
        p_event_id, 'active', v_position, v_source_kind, v_display_name,
        v_email, v_linked_user_id, v_relationship_id
      );
    END IF;
    v_position := v_position + 1;
  END LOOP;

  PERFORM public.teskeid_event_assert_roster(p_event_id);
  UPDATE public.teskeid_events AS event_row
  SET roster_revision = event_row.roster_revision + 1
  WHERE event_row.id = p_event_id
  RETURNING event_row.roster_revision INTO v_new_revision;

  v_result := pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'roster_revision', v_new_revision
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_expense_sources(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  SELECT pg_catalog.jsonb_build_object(
    'events', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id', event_row.id,
      'name', event_row.name,
      'roster_revision', event_row.roster_revision,
      'guests', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'event_guest_id', guest.id,
          'display_name', guest.display_name_snapshot,
          'source_kind', guest.source_kind,
          'position', guest.position
        ) ORDER BY guest.position)
        FROM public.teskeid_event_guests AS guest
        WHERE guest.event_id = event_row.id
          AND guest.status = 'active'
      ), '[]'::jsonb)
    ) ORDER BY event_row.created_at DESC, event_row.id DESC), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT event_row.*
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_actor_id
    ORDER BY event_row.created_at DESC, event_row.id DESC
    LIMIT 100
  ) AS event_row;
  RETURN COALESCE(v_result, pg_catalog.jsonb_build_object('events', '[]'::jsonb));
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_source(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_event_id';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', event_row.name,
    'roster_revision', event_row.roster_revision,
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', guest.id,
        'display_name', guest.display_name_snapshot,
        'source_kind', guest.source_kind,
        'position', guest.position
      ) ORDER BY guest.position)
      FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = event_row.id
        AND guest.status = 'active'
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_create_tagged_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_fingerprint text;
  v_fingerprint_payload jsonb;
  v_replay jsonb;
  v_expense_id uuid;
  v_inner_request_id uuid;
  v_group_id uuid;
  v_member_item jsonb;
  v_member_id uuid;
  v_event_guest_id uuid;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_relationship_id uuid;
  v_authoritative_display_name text;
  v_mapping_found boolean;
  v_resolved_members jsonb := '[]'::jsonb;
  v_event_invitations jsonb := '[]'::jsonb;
  v_all_invitations jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_canonical_result jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR (p_payload - ARRAY[
       'title', 'total_minor', 'currency', 'incurred_on', 'category', 'note',
       'split_method', 'one_off_members', 'payments', 'shares', 'obligations',
       'participant_invitations', 'event_guest_members'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_payload ?& ARRAY[
       'title', 'total_minor', 'currency', 'incurred_on', 'category', 'note',
       'split_method', 'one_off_members', 'payments', 'shares', 'obligations',
       'participant_invitations', 'event_guest_members'
     ]::text[])
     OR pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'total_minor') <> 'number'
     OR (p_payload->>'total_minor') !~ '^[0-9]+$'
     OR (p_payload->>'total_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.jsonb_typeof(p_payload->'currency') <> 'string'
     OR (p_payload->>'currency') !~ '^[A-Z]{3}$'
     OR pg_catalog.jsonb_typeof(p_payload->'incurred_on') <> 'string'
     OR (p_payload->>'incurred_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR (
       pg_catalog.jsonb_typeof(p_payload->'category') NOT IN ('string', 'null')
     )
     OR (
       pg_catalog.jsonb_typeof(p_payload->'note') NOT IN ('string', 'null')
     )
     OR pg_catalog.jsonb_typeof(p_payload->'split_method') <> 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'one_off_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'one_off_members')
          NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'payments') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'shares') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'obligations') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'participant_invitations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'participant_invitations') > 49
     OR pg_catalog.jsonb_typeof(p_payload->'event_guest_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'event_guest_members') > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       WHERE pg_catalog.jsonb_typeof(mapping.value) <> 'object'
          OR (mapping.value - ARRAY['event_guest_id', 'member_id']::text[])
            <> '{}'::jsonb
          OR NOT (mapping.value ?& ARRAY['event_guest_id', 'member_id']::text[])
          OR pg_catalog.jsonb_typeof(mapping.value->'event_guest_id') <> 'string'
          OR pg_catalog.jsonb_typeof(mapping.value->'member_id') <> 'string'
          OR (mapping.value->>'event_guest_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (mapping.value->>'member_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       GROUP BY mapping.value->>'event_guest_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       GROUP BY mapping.value->>'member_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       WHERE pg_catalog.jsonb_typeof(invitation.value) <> 'object'
          OR NOT (invitation.value ? 'member_id')
          OR pg_catalog.jsonb_typeof(invitation.value->'member_id') <> 'string'
          OR (invitation.value->>'member_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (
            (invitation.value ? 'recipient_email')
              = (invitation.value ? 'relationship_id')
          )
          OR (
            invitation.value ? 'recipient_email'
            AND (
              (invitation.value - ARRAY['member_id', 'recipient_email']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(invitation.value->'recipient_email')
                <> 'string'
            )
          )
          OR (
            invitation.value ? 'relationship_id'
            AND (
              (invitation.value - ARRAY['member_id', 'relationship_id']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(invitation.value->'relationship_id')
                <> 'string'
              OR (invitation.value->>'relationship_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       GROUP BY invitation.value->>'member_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       JOIN pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
         ON mapping.value->>'member_id' = invitation.value->>'member_id'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  -- Normalize only values whose display is server-authoritative. This keeps a
  -- lost-response replay stable across profile/relationship/roster label
  -- changes while manual-name and manual-email labels remain caller intent.
  SELECT pg_catalog.jsonb_set(
    p_payload,
    '{one_off_members}',
    COALESCE(pg_catalog.jsonb_agg(
      CASE WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(
          p_payload->'event_guest_members'
        ) AS mapping(value)
        WHERE mapping.value->>'member_id' = member.value->>'id'
      ) THEN member.value || pg_catalog.jsonb_build_object(
        'display_name', '__teskeid_server_event_guest__',
        'user_id', NULL,
        'role', 'member',
        'status', 'active'
      ) ELSE pg_catalog.jsonb_set(
        member.value, '{display_name}',
        COALESCE(pg_catalog.to_jsonb(CASE
          WHEN member.value->>'user_id' = p_actor_id::text
               AND member.value->>'role' = 'owner'
            THEN '__teskeid_server_owner__'
          WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(
              p_payload->'participant_invitations'
            ) AS invitation(value)
            WHERE invitation.value->>'member_id' = member.value->>'id'
              AND invitation.value ? 'relationship_id'
          ) THEN '__teskeid_server_relationship__'
          ELSE pg_catalog.btrim(member.value->>'display_name')
        END), 'null'::jsonb), true
      ) END ORDER BY member.ordinal
    ), '[]'::jsonb),
    true
  )
  INTO v_fingerprint_payload
  FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
    WITH ORDINALITY AS member(value, ordinal);

  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{title}',
    pg_catalog.to_jsonb(pg_catalog.btrim(p_payload->>'title')), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{category}',
    COALESCE(pg_catalog.to_jsonb(NULLIF(
      pg_catalog.btrim(p_payload->>'category'), ''
    )), 'null'::jsonb), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{note}',
    COALESCE(pg_catalog.to_jsonb(NULLIF(
      pg_catalog.btrim(p_payload->>'note'), ''
    )), 'null'::jsonb), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload,
    '{participant_invitations}',
    COALESCE((
      SELECT pg_catalog.jsonb_agg(CASE
        WHEN invitation.value ? 'recipient_email' THEN pg_catalog.jsonb_set(
          invitation.value, '{recipient_email}',
          pg_catalog.to_jsonb(public.normalize_email_canonical(
            invitation.value->>'recipient_email'
          )), true
        ) ELSE invitation.value
      END ORDER BY invitation.ordinal)
      FROM pg_catalog.jsonb_array_elements(
        p_payload->'participant_invitations'
      ) WITH ORDINALITY AS invitation(value, ordinal)
    ), '[]'::jsonb),
    true
  );

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'payload', v_fingerprint_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_create_tagged_expense',
    v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  JOIN pg_catalog.jsonb_array_elements(
    p_payload->'event_guest_members'
  ) AS mapping(value)
    ON guest.id = (mapping.value->>'event_guest_id')::uuid
  WHERE guest.event_id = p_event_id
  ORDER BY guest.id
  FOR SHARE OF guest;

  FOR v_member_item IN
    SELECT member.value
    FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
      WITH ORDINALITY AS member(value, ordinal)
    ORDER BY member.ordinal
  LOOP
    v_member_id := NULL;
    BEGIN
      v_member_id := (v_member_item->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END;

    SELECT
      (mapping.value->>'event_guest_id')::uuid,
      true
    INTO v_event_guest_id, v_mapping_found
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'event_guest_members'
    ) AS mapping(value)
    WHERE (mapping.value->>'member_id')::uuid = v_member_id;

    IF COALESCE(v_mapping_found, false) THEN
      SELECT guest.* INTO v_guest
      FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = p_event_id
        AND guest.id = v_event_guest_id
        AND guest.status = 'active';
      IF v_guest.id IS NULL THEN
        RAISE EXCEPTION 'teskeid_event_roster_conflict';
      END IF;

      v_resolved_members := v_resolved_members || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_member_id,
          'user_id', NULL,
          'display_name', v_guest.display_name_snapshot,
          'role', 'member',
          'status', 'active'
        )
      );
      v_sources := v_sources || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'event_guest_id', v_event_guest_id,
          'member_id', v_member_id
        )
      );

      IF v_guest.source_kind = 'manual_email' THEN
        v_event_invitations := v_event_invitations
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'member_id', v_member_id,
            'recipient_email', v_guest.email_canonical
          ));
      ELSIF v_guest.source_kind = 'relationship' THEN
        -- Account/relationship deletion must not strand an active owner-private
        -- roster snapshot. If no current actor-owned relationship resolves,
        -- retain the snapshot as a null-user financial member and create no
        -- invitation or access edge. Provenance still points at the event guest.
        v_relationship_id := NULL;
        IF v_guest.linked_user_id IS NOT NULL THEN
          SELECT relationship.id INTO v_relationship_id
          FROM public.relationships AS relationship
          WHERE relationship.owner_id = p_actor_id
            AND relationship.counterpart_user_id = v_guest.linked_user_id
            AND (
              v_guest.relationship_id IS NULL
              OR relationship.id = v_guest.relationship_id
            )
          ORDER BY relationship.id
          LIMIT 1;
        END IF;
        IF v_relationship_id IS NOT NULL THEN
          v_event_invitations := v_event_invitations
            || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
              'member_id', v_member_id,
              'relationship_id', v_relationship_id
            ));
        END IF;
      END IF;
    ELSE
      v_authoritative_display_name := NULL;
      IF v_member_item->>'user_id' = p_actor_id::text
         AND v_member_item->>'role' = 'owner' THEN
        SELECT COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''),
          'Teskeiðarnotandi')
        INTO v_authoritative_display_name
        FROM auth.users AS account
        LEFT JOIN public.profiles AS profile ON profile.id = account.id
        WHERE account.id = p_actor_id;
      ELSE
        SELECT COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''),
          'Teskeiðarnotandi')
        INTO v_authoritative_display_name
        FROM pg_catalog.jsonb_array_elements(
          p_payload->'participant_invitations'
        ) AS invitation(value)
        JOIN public.relationships AS relationship
          ON relationship.id = (invitation.value->>'relationship_id')::uuid
         AND relationship.owner_id = p_actor_id
         AND relationship.counterpart_user_id IS NOT NULL
         AND relationship.counterpart_user_id <> p_actor_id
        JOIN auth.users AS account
          ON account.id = relationship.counterpart_user_id
        LEFT JOIN public.profiles AS profile ON profile.id = account.id
        WHERE invitation.value->>'member_id' = v_member_id::text
          AND invitation.value ? 'relationship_id';
      END IF;

      IF v_authoritative_display_name IS NOT NULL THEN
        v_member_item := pg_catalog.jsonb_set(
          v_member_item, '{display_name}',
          pg_catalog.to_jsonb(pg_catalog.left(
            v_authoritative_display_name, 120
          )), true
        );
      END IF;
      v_resolved_members := v_resolved_members
        || pg_catalog.jsonb_build_array(v_member_item);
    END IF;

    v_event_guest_id := NULL;
    v_mapping_found := false;
    v_guest := NULL;
    v_relationship_id := NULL;
    v_authoritative_display_name := NULL;
  END LOOP;

  IF pg_catalog.jsonb_array_length(v_sources)
       <> pg_catalog.jsonb_array_length(p_payload->'event_guest_members') THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  v_all_invitations := p_payload->'participant_invitations'
    || v_event_invitations;

  v_expense_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense-inner-request:'
      || p_actor_id::text || ':' || p_request_id::text
  );

  v_canonical_result := public.expense_create_expense_with_participants(
    p_actor_id,
    v_inner_request_id,
    v_expense_id,
    NULL,
    p_payload->>'title',
    (p_payload->>'total_minor')::bigint,
    p_payload->>'currency',
    (p_payload->>'incurred_on')::date,
    p_payload->>'category',
    p_payload->>'note',
    p_payload->>'split_method',
    v_resolved_members,
    p_payload->'payments',
    p_payload->'shares',
    p_payload->'obligations',
    v_all_invitations
  );
  BEGIN
    v_group_id := (v_canonical_result->>'group_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'teskeid_event_expense_create_failed';
  END;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_create_failed';
  END IF;

  INSERT INTO public.teskeid_event_expense_links (
    event_id, group_id, expense_id, linked_by_user_id
  ) VALUES (
    p_event_id, v_group_id, v_expense_id, p_actor_id
  );

  INSERT INTO public.teskeid_event_expense_participant_sources (
    event_id, group_id, expense_id, event_guest_id, expense_member_id
  )
  SELECT
    p_event_id,
    v_group_id,
    v_expense_id,
    (source.value->>'event_guest_id')::uuid,
    (source.value->>'member_id')::uuid
  FROM pg_catalog.jsonb_array_elements(v_sources) AS source(value);

  PERFORM public.teskeid_event_assert_expense_link(
    p_event_id, v_group_id, v_expense_id
  );

  v_result := pg_catalog.jsonb_build_object(
    'group_id', v_group_id,
    'expense_id', v_expense_id,
    'invitation_ids', COALESCE(
      v_canonical_result->'invitation_ids', '[]'::jsonb
    )
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_preview(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tagged_count integer;
  v_currency text;
  v_pending_count integer;
  v_review_required boolean;
  v_balance_total numeric;
  v_blocked jsonb;
  v_state text;
  v_currencies jsonb := '[]'::jsonb;
  v_transfers jsonb;
  v_debtor_ids uuid[];
  v_debtor_labels text[];
  v_debts bigint[];
  v_creditor_ids uuid[];
  v_creditor_labels text[];
  v_credits bigint[];
  v_debtor_index integer;
  v_creditor_index integer;
  v_amount bigint;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
      AND event_row.owner_user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_tagged_count
  FROM public.teskeid_event_expense_links AS link
  WHERE link.event_id = p_event_id;

  IF v_tagged_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'none_tagged',
      'tagged_expense_count', 0,
      'currencies', '[]'::jsonb
    );
  END IF;

  -- Never return a partial financial projection. One unauthorized or malformed
  -- tagged context makes the complete event projection unavailable.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    LEFT JOIN public.expense_groups AS group_row
      ON group_row.id = link.group_id
    LEFT JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    WHERE link.event_id = p_event_id
      AND (
        group_row.id IS NULL
        OR group_row.kind <> 'one_off'
        OR expense.id IS NULL
        OR expense.status NOT IN ('active', 'cancelled')
        OR (
          SELECT pg_catalog.count(*)
          FROM public.expenses AS group_expense
          WHERE group_expense.group_id = link.group_id
        ) <> 1
        OR public.expense_active_member_role(
          p_actor_id, link.group_id
        ) IS NULL
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'unavailable',
      'tagged_expense_count', v_tagged_count,
      'currencies', '[]'::jsonb
    );
  END IF;

  -- Repayments are group-level rows. Refuse the whole projection unless each
  -- one is attributable to exactly one canonical obligation in the same
  -- tagged one-expense group. Obligations validate provenance only; their
  -- amounts are never added to principal below.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expense_repayments AS repayment
      ON repayment.group_id = link.group_id
    WHERE link.event_id = p_event_id
      AND (
        (
          SELECT pg_catalog.count(*)
          FROM public.expense_repayment_allocations AS allocation
          WHERE allocation.group_id = repayment.group_id
            AND allocation.repayment_id = repayment.id
        ) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM public.expense_repayment_allocations AS allocation
          JOIN public.expense_obligations AS obligation
            ON obligation.group_id = allocation.group_id
           AND obligation.id = allocation.obligation_id
          WHERE allocation.group_id = repayment.group_id
            AND allocation.repayment_id = repayment.id
            AND allocation.amount_minor = repayment.amount_minor
            AND obligation.group_id = repayment.group_id
            AND obligation.from_member_id = repayment.from_member_id
            AND obligation.to_member_id = repayment.to_member_id
            AND obligation.currency = repayment.currency
            AND obligation.amount_minor = allocation.amount_minor
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.expense_group_members AS from_member
          WHERE from_member.group_id = repayment.group_id
            AND from_member.id = repayment.from_member_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.expense_group_members AS to_member
          WHERE to_member.group_id = repayment.group_id
            AND to_member.id = repayment.to_member_id
        )
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'unavailable',
      'tagged_expense_count', v_tagged_count,
      'currencies', '[]'::jsonb
    );
  END IF;

  FOR v_currency IN
    SELECT DISTINCT expense.currency
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    WHERE link.event_id = p_event_id
    ORDER BY expense.currency
  LOOP
    SELECT pg_catalog.count(*)::integer
    INTO v_pending_count
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expense_repayments AS repayment
      ON repayment.group_id = link.group_id
     AND repayment.currency = v_currency
     AND repayment.status = 'reported'
    WHERE link.event_id = p_event_id;

    SELECT COALESCE(pg_catalog.bool_or(
      public.expense_reported_repayments_need_review(link.group_id)
    ), false)
    INTO v_review_required
    FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = p_event_id
      AND EXISTS (
        SELECT 1 FROM public.expense_repayments AS repayment
        WHERE repayment.group_id = link.group_id
          AND repayment.currency = v_currency
          AND repayment.status = 'reported'
      );

    WITH member_identity AS (
      SELECT
        member.group_id,
        member.id AS member_id,
        CASE
          WHEN member.user_id IS NOT NULL
            THEN 'user:' || member.user_id::text
          WHEN guest.linked_user_id IS NOT NULL
            THEN 'user:' || guest.linked_user_id::text
          WHEN source.event_guest_id IS NOT NULL
            THEN 'guest:' || source.event_guest_id::text
          ELSE 'unresolved:' || member.group_id::text || ':' || member.id::text
        END AS identity_key,
        CASE
          WHEN member.user_id IS NOT NULL THEN public.teskeid_event_uuid_from_text(
            'teskeid-event-preview-user:' || p_event_id::text || ':'
              || member.user_id::text
          )
          WHEN guest.linked_user_id IS NOT NULL THEN
            public.teskeid_event_uuid_from_text(
              'teskeid-event-preview-user:' || p_event_id::text || ':'
                || guest.linked_user_id::text
            )
          WHEN source.event_guest_id IS NOT NULL THEN source.event_guest_id
          ELSE public.teskeid_event_uuid_from_text(
            'teskeid-event-preview-member:' || p_event_id::text || ':'
              || member.group_id::text || ':' || member.id::text
          )
        END AS party_id,
        COALESCE(guest.display_name_snapshot, member.display_name)
          AS display_name,
        member.user_id IS NULL AND source.event_guest_id IS NULL AS blocked
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_group_members AS member
        ON member.group_id = link.group_id
      LEFT JOIN public.teskeid_event_expense_participant_sources AS source
        ON source.event_id = link.event_id
       AND source.group_id = link.group_id
       AND source.expense_id = link.expense_id
       AND source.expense_member_id = member.id
      LEFT JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = source.event_id
       AND guest.id = source.event_guest_id
      WHERE link.event_id = p_event_id
    ), movements AS (
      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        payment.amount_minor::bigint AS amount_minor
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expenses AS expense
        ON expense.group_id = link.group_id
       AND expense.id = link.expense_id
       AND expense.status = 'active'
       AND expense.currency = v_currency
      JOIN public.expense_payments AS payment
        ON payment.group_id = link.group_id
       AND payment.expense_id = link.expense_id
      JOIN member_identity AS identity
        ON identity.group_id = payment.group_id
       AND identity.member_id = payment.member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        -share.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expenses AS expense
        ON expense.group_id = link.group_id
       AND expense.id = link.expense_id
       AND expense.status = 'active'
       AND expense.currency = v_currency
      JOIN public.expense_shares AS share
        ON share.group_id = link.group_id
       AND share.expense_id = link.expense_id
      JOIN member_identity AS identity
        ON identity.group_id = share.group_id
       AND identity.member_id = share.member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        repayment.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_repayments AS repayment
        ON repayment.group_id = link.group_id
       AND repayment.status = 'confirmed'
       AND repayment.currency = v_currency
      JOIN public.expense_repayment_allocations AS allocation
        ON allocation.group_id = repayment.group_id
       AND allocation.repayment_id = repayment.id
       AND allocation.amount_minor = repayment.amount_minor
      JOIN public.expense_obligations AS obligation
        ON obligation.group_id = allocation.group_id
       AND obligation.id = allocation.obligation_id
       AND obligation.from_member_id = repayment.from_member_id
       AND obligation.to_member_id = repayment.to_member_id
       AND obligation.currency = repayment.currency
       AND obligation.amount_minor = allocation.amount_minor
      JOIN member_identity AS identity
        ON identity.group_id = repayment.group_id
       AND identity.member_id = repayment.from_member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        -repayment.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_repayments AS repayment
        ON repayment.group_id = link.group_id
       AND repayment.status = 'confirmed'
       AND repayment.currency = v_currency
      JOIN public.expense_repayment_allocations AS allocation
        ON allocation.group_id = repayment.group_id
       AND allocation.repayment_id = repayment.id
       AND allocation.amount_minor = repayment.amount_minor
      JOIN public.expense_obligations AS obligation
        ON obligation.group_id = allocation.group_id
       AND obligation.id = allocation.obligation_id
       AND obligation.from_member_id = repayment.from_member_id
       AND obligation.to_member_id = repayment.to_member_id
       AND obligation.currency = repayment.currency
       AND obligation.amount_minor = allocation.amount_minor
      JOIN member_identity AS identity
        ON identity.group_id = repayment.group_id
       AND identity.member_id = repayment.to_member_id
      WHERE link.event_id = p_event_id
    ), balances AS (
      SELECT identity_key, party_id,
        pg_catalog.min(display_name) AS display_name,
        pg_catalog.bool_or(blocked) AS blocked,
        pg_catalog.sum(amount_minor)::bigint AS amount_minor
      FROM movements
      GROUP BY identity_key, party_id
      HAVING pg_catalog.sum(amount_minor) <> 0
    )
    SELECT
      COALESCE(pg_catalog.sum(balance.amount_minor), 0),
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'party_id', balance.party_id,
        'display_name', balance.display_name,
        'reason', 'unresolved_identity'
      ) ORDER BY balance.party_id) FILTER (WHERE balance.blocked), '[]'::jsonb),
      pg_catalog.array_agg(balance.party_id
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0),
      pg_catalog.array_agg(balance.display_name
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0),
      pg_catalog.array_agg(-balance.amount_minor
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0),
      pg_catalog.array_agg(balance.party_id
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0),
      pg_catalog.array_agg(balance.display_name
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0),
      pg_catalog.array_agg(balance.amount_minor
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0)
    INTO
      v_balance_total, v_blocked,
      v_debtor_ids, v_debtor_labels, v_debts,
      v_creditor_ids, v_creditor_labels, v_credits
    FROM balances AS balance;

    IF v_balance_total <> 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'event_id', p_event_id,
        'status', 'unavailable',
        'tagged_expense_count', v_tagged_count,
        'currencies', '[]'::jsonb
      );
    END IF;

    v_transfers := '[]'::jsonb;
    IF v_review_required THEN
      v_state := 'review_required';
    ELSIF v_pending_count > 0 THEN
      v_state := 'pending';
    ELSIF pg_catalog.jsonb_array_length(v_blocked) > 0 THEN
      v_state := 'blocked_manual';
    ELSIF COALESCE(pg_catalog.array_length(v_debtor_ids, 1), 0) = 0 THEN
      v_state := 'settled';
    ELSE
      v_state := 'open';
      v_debtor_index := 1;
      v_creditor_index := 1;
      WHILE v_debtor_index <= COALESCE(
          pg_catalog.array_length(v_debtor_ids, 1), 0
        )
        AND v_creditor_index <= COALESCE(
          pg_catalog.array_length(v_creditor_ids, 1), 0
        )
      LOOP
        v_amount := LEAST(
          v_debts[v_debtor_index], v_credits[v_creditor_index]
        );
        v_transfers := v_transfers || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'from_party_id', v_debtor_ids[v_debtor_index],
            'to_party_id', v_creditor_ids[v_creditor_index],
            'from_display_name', v_debtor_labels[v_debtor_index],
            'to_display_name', v_creditor_labels[v_creditor_index],
            'amount_minor', v_amount
          )
        );
        v_debts[v_debtor_index] := v_debts[v_debtor_index] - v_amount;
        v_credits[v_creditor_index] := v_credits[v_creditor_index] - v_amount;
        IF v_debts[v_debtor_index] = 0 THEN
          v_debtor_index := v_debtor_index + 1;
        END IF;
        IF v_credits[v_creditor_index] = 0 THEN
          v_creditor_index := v_creditor_index + 1;
        END IF;
      END LOOP;
    END IF;

    v_currencies := v_currencies || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'currency', v_currency,
        'state', v_state,
        'transfers', v_transfers,
        'pending_repayment_count', v_pending_count,
        'blocked_parties', v_blocked
      )
    );

    v_debtor_ids := NULL;
    v_debtor_labels := NULL;
    v_debts := NULL;
    v_creditor_ids := NULL;
    v_creditor_labels := NULL;
    v_credits := NULL;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'status', 'ready',
    'tagged_expense_count', v_tagged_count,
    'currencies', v_currencies
  );
END;
$function$;

-- SQL131 compatibility bridge. The legacy signature, outer expense receipt,
-- canonical fingerprint and `{event_id}` result remain unchanged. Old clients
-- still create their frozen expense-group marker while the same transaction
-- now writes the independent v2 event/roster. New clients never call this RPC.
CREATE OR REPLACE FUNCTION public.expense_create_event_context(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
  v_canonical_participants jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_owner_member_id uuid := pg_catalog.gen_random_uuid();
  v_owner_display_name text;
  v_member_id uuid;
  v_relationship_id uuid;
  v_linked_user_id uuid;
  v_display_name text;
  v_member_payload jsonb;
  v_participant_rows jsonb := '[]'::jsonb;
  v_item jsonb;
  v_position integer := 0;
  v_inner_request_id uuid := pg_catalog.gen_random_uuid();
  v_group_result jsonb;
  v_group_id uuid;
  v_context_created_at timestamptz;
  v_result jsonb;
BEGIN
  PERFORM public.expense_event_assert_actor(p_actor_id);

  IF p_request_id IS NULL
     OR NOT public.expense_event_valid_label(p_name, 1, 160)
     OR p_participants IS NULL
     OR pg_catalog.jsonb_typeof(p_participants) <> 'array' THEN
    RAISE EXCEPTION 'expense_event_invalid_input';
  END IF;

  IF pg_catalog.jsonb_array_length(p_participants) > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_participants) AS participant(value)
       WHERE pg_catalog.jsonb_typeof(participant.value) <> 'object'
          OR NOT (participant.value ? 'type')
          OR (
            participant.value->>'type' = 'guest'
            AND (
              NOT (participant.value ? 'display_name')
              OR (participant.value - ARRAY['type', 'display_name']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(participant.value->'display_name')
                <> 'string'
              OR NOT public.expense_event_valid_label(
                participant.value->>'display_name', 1, 120
              )
              OR pg_catalog.strpos(
                participant.value->>'display_name', '@'
              ) > 0
            )
          )
          OR (
            participant.value->>'type' = 'relationship'
            AND (
              NOT (participant.value ? 'relationship_id')
              OR (participant.value - ARRAY['type', 'relationship_id']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(participant.value->'relationship_id')
                <> 'string'
              OR (participant.value->>'relationship_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
          OR participant.value->>'type' NOT IN ('guest', 'relationship')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_participants) AS participant(value)
       WHERE participant.value->>'type' = 'relationship'
       GROUP BY (participant.value->>'relationship_id')::uuid
       HAVING pg_catalog.count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_event_invalid_input';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      CASE participant.value->>'type'
        WHEN 'guest' THEN pg_catalog.jsonb_build_object(
          'type', 'guest',
          'displayName', pg_catalog.btrim(participant.value->>'display_name')
        )
        ELSE pg_catalog.jsonb_build_object(
          'type', 'relationship',
          'relationshipId', (participant.value->>'relationship_id')::uuid
        )
      END
      ORDER BY participant.ordinal
    ),
    '[]'::jsonb
  )
  INTO v_canonical_participants
  FROM pg_catalog.jsonb_array_elements(p_participants)
    WITH ORDINALITY AS participant(value, ordinal);

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'name', v_name,
    'participants', v_canonical_participants
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id,
    p_request_id,
    'expense_create_event_context',
    v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;
  PERFORM public.expense_event_assert_actor(p_actor_id);

  SELECT CASE
    WHEN public.expense_event_valid_label(profile.display_name, 1, 120)
      THEN pg_catalog.btrim(profile.display_name)
    ELSE 'Teskeiðarnotandi'
  END
  INTO v_owner_display_name
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id;
  v_owner_display_name := COALESCE(v_owner_display_name, 'Teskeiðarnotandi');

  v_member_payload := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', v_owner_member_id,
      'user_id', p_actor_id,
      'display_name', v_owner_display_name,
      'role', 'owner',
      'status', 'active'
    )
  );

  FOR v_item IN
    SELECT participant.value
    FROM pg_catalog.jsonb_array_elements(p_participants)
      WITH ORDINALITY AS participant(value, ordinal)
    ORDER BY participant.ordinal
  LOOP
    v_member_id := pg_catalog.gen_random_uuid();
    v_linked_user_id := NULL;
    v_relationship_id := NULL;

    IF v_item->>'type' = 'guest' THEN
      v_display_name := pg_catalog.btrim(v_item->>'display_name');
    ELSE
      v_relationship_id := (v_item->>'relationship_id')::uuid;
      SELECT
        relationship.counterpart_user_id,
        CASE
          WHEN public.expense_event_valid_label(profile.display_name, 1, 120)
            THEN pg_catalog.btrim(profile.display_name)
          ELSE 'Teskeiðarnotandi'
        END
      INTO v_linked_user_id, v_display_name
      FROM public.relationships AS relationship
      JOIN auth.users AS account
        ON account.id = relationship.counterpart_user_id
      LEFT JOIN public.profiles AS profile
        ON profile.id = relationship.counterpart_user_id
      WHERE relationship.id = v_relationship_id
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;

      IF v_linked_user_id IS NULL THEN
        RAISE EXCEPTION 'expense_event_participant_invalid';
      END IF;
      v_display_name := COALESCE(v_display_name, 'Teskeiðarnotandi');
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS prior(value)
        WHERE prior.value->>'linked_user_id' = v_linked_user_id::text
      ) THEN
        RAISE EXCEPTION 'expense_event_participant_conflict';
      END IF;
    END IF;

    v_member_payload := v_member_payload || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_member_id,
        'user_id', NULL,
        'display_name', v_display_name,
        'role', 'member',
        'status', 'active'
      )
    );
    v_participant_rows := v_participant_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'member_id', v_member_id,
        'linked_user_id', v_linked_user_id,
        'relationship_id', v_relationship_id,
        'position', v_position
      )
    );
    v_position := v_position + 1;
  END LOOP;

  FOR v_linked_user_id IN
    SELECT DISTINCT (participant.value->>'linked_user_id')::uuid
    FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS participant(value)
    WHERE pg_catalog.jsonb_typeof(participant.value->'linked_user_id') = 'string'
    ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_linked_user_id::text, 9602)
    );
  END LOOP;

  v_group_result := public.expense_create_group(
    p_actor_id,
    v_inner_request_id,
    v_name,
    NULL,
    NULL,
    'ISK',
    true,
    v_member_payload
  );
  BEGIN
    v_group_id := (v_group_result->>'group_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'expense_event_create_failed';
  END;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_event_create_failed';
  END IF;

  INSERT INTO public.expense_event_contexts (
    group_id, owner_user_id
  ) VALUES (
    v_group_id, p_actor_id
  )
  RETURNING created_at INTO v_context_created_at;

  INSERT INTO public.expense_event_participants (
    group_id, member_id, linked_user_id, position
  )
  SELECT
    v_group_id,
    (participant.value->>'member_id')::uuid,
    CASE
      WHEN pg_catalog.jsonb_typeof(participant.value->'linked_user_id') = 'string'
        THEN (participant.value->>'linked_user_id')::uuid
      ELSE NULL
    END,
    (participant.value->>'position')::smallint
  FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS participant(value);

  PERFORM public.expense_event_assert_integrity(v_group_id);

  INSERT INTO public.teskeid_events (
    id, owner_user_id, name, roster_revision,
    legacy_expense_group_id, created_at, updated_at
  ) VALUES (
    v_group_id, p_actor_id, public.teskeid_event_normalize_text(v_name), 1,
    v_group_id, v_context_created_at, v_context_created_at
  );
  INSERT INTO public.teskeid_event_guests (
    id, event_id, status, position, source_kind,
    display_name_snapshot, email_canonical, linked_user_id, relationship_id,
    created_at, updated_at, removed_at
  )
  SELECT
    (participant.value->>'member_id')::uuid,
    v_group_id,
    'active',
    (participant.value->>'position')::smallint,
    CASE WHEN pg_catalog.jsonb_typeof(
      participant.value->'linked_user_id'
    ) = 'string' THEN 'relationship' ELSE 'manual_name' END,
    public.teskeid_event_normalize_text(member.display_name),
    NULL,
    CASE WHEN pg_catalog.jsonb_typeof(
      participant.value->'linked_user_id'
    ) = 'string' THEN (participant.value->>'linked_user_id')::uuid ELSE NULL END,
    CASE WHEN pg_catalog.jsonb_typeof(
      participant.value->'relationship_id'
    ) = 'string' THEN (participant.value->>'relationship_id')::uuid ELSE NULL END,
    participant_row.created_at,
    participant_row.created_at,
    NULL
  FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS participant(value)
  JOIN public.expense_event_participants AS participant_row
    ON participant_row.group_id = v_group_id
   AND participant_row.member_id = (participant.value->>'member_id')::uuid
  JOIN public.expense_group_members AS member
    ON member.group_id = v_group_id
   AND member.id = participant_row.member_id;

  PERFORM public.teskeid_event_assert_roster(v_group_id);
  v_result := pg_catalog.jsonb_build_object('event_id', v_group_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

-- SQL131 account cleanup preserved in full, extended only with v2 owner-private
-- event data. Shared financial rows and durable audit/settlement history remain.
CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_email_canonical text;
  v_preferences integer := 0;
  v_snapshots integer := 0;
  v_members integer := 0;
  v_invitations integer := 0;
  v_event_links integer := 0;
  v_event_contexts integer := 0;
  v_v2_identity_links integer := 0;
  v_v2_events integer := 0;
  v_v2_receipts integer := 0;
  v_terminal_invitation_ids uuid[];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 13201)
  );

  SELECT account.email INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_user_id;
  v_email_canonical := public.normalize_email_canonical(v_email);

  IF v_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_email_canonical, 9702)
    );
  END IF;

  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access_row
    WHERE access_row.feature_key IN (
        'utlagt-og-endurgreitt', 'afmaeli-og-vidburdir'
      )
      AND public.normalize_email_canonical(access_row.email) = v_email_canonical;
  END IF;

  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  WHERE group_row.id IN (
    SELECT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_user_id
    UNION
    SELECT invitation.group_id
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.invited_by = p_user_id
       OR (
         v_email_canonical IS NOT NULL
         AND invitation.status = 'pending'
         AND invitation.recipient_email_canonical = v_email_canonical
       )
    UNION
    SELECT context_row.group_id
    FROM public.expense_event_contexts AS context_row
    WHERE context_row.owner_user_id = p_user_id
    UNION
    SELECT participant.group_id
    FROM public.expense_event_participants AS participant
    WHERE participant.linked_user_id = p_user_id
    UNION
    SELECT link.group_id
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
    WHERE event_row.owner_user_id = p_user_id
  )
  ORDER BY group_row.id
  FOR UPDATE;

  LOOP
    SELECT COALESCE(pg_catalog.array_agg(candidate.id), ARRAY[]::uuid[])
    INTO v_terminal_invitation_ids
    FROM (
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND (
          invitation.invited_by = p_user_id
          OR (
            v_email_canonical IS NOT NULL
            AND invitation.recipient_email_canonical = v_email_canonical
          )
        )
      ORDER BY invitation.id
      LIMIT 50
    ) AS candidate;
    EXIT WHEN pg_catalog.cardinality(v_terminal_invitation_ids) = 0;
    v_invitations := v_invitations
      + public.expense_terminalize_member_invitations(
          v_terminal_invitation_ids, 'cancelled'
        );
  END LOOP;

  UPDATE public.expense_member_invitations AS invitation
  SET invited_by = NULL,
      inviter_display_name_snapshot = NULL,
      guest_display_name_snapshot = NULL
  WHERE invitation.invited_by = p_user_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9602)
  );

  -- SQL131's canonical participant-unlink lock must be held before every v2
  -- linked-attendee scan or write. Re-scan under the lock so a concurrent
  -- roster mutation cannot appear between discovery and identity erasure.
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_guests AS guest
       WHERE guest.event_id = event_row.id
         AND guest.linked_user_id = p_user_id
     )
  ORDER BY event_row.id
  FOR UPDATE;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.linked_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.teskeid_events AS event_row
       WHERE event_row.id = guest.event_id
         AND event_row.owner_user_id = p_user_id
     )
  ORDER BY guest.event_id, guest.id
  FOR UPDATE;

  -- Preserve relationship/manual source and bounded display snapshots while
  -- removing private linked identity, then remove owner-private event data.
  UPDATE public.teskeid_event_guests AS guest
  SET linked_user_id = NULL,
      relationship_id = NULL
  WHERE guest.linked_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_identity_links = ROW_COUNT;

  DELETE FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_events = ROW_COUNT;

  DELETE FROM public.teskeid_event_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_receipts = ROW_COUNT;

  UPDATE public.expense_event_participants AS participant
  SET linked_user_id = NULL
  WHERE participant.linked_user_id = p_user_id;
  GET DIAGNOSTICS v_event_links = ROW_COUNT;

  DELETE FROM public.expense_event_contexts AS context_row
  WHERE context_row.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_event_contexts = ROW_COUNT;

  DELETE FROM public.expense_payment_preferences AS preference
  WHERE preference.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_preferences = ROW_COUNT;

  UPDATE public.expense_repayments AS repayment
  SET payment_preference_snapshot = NULL
  WHERE repayment.payment_preference_snapshot->>'owner_user_id' = p_user_id::text;
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  DELETE FROM public.recent_events AS event
  WHERE event.source = 'expenses'
    AND (event.user_id = p_user_id OR event.payload->>'actorUserId' = p_user_id::text);
  DELETE FROM public.expense_activity_audience AS audience
  WHERE audience.user_id = p_user_id;
  DELETE FROM public.expense_mutation_requests AS request
  WHERE request.actor_user_id = p_user_id;

  UPDATE public.expense_activity AS activity
  SET actor_user_id = NULL,
      actor_display_name = 'Teskeiðarnotandi'
  WHERE activity.actor_user_id = p_user_id;
  UPDATE public.expense_repayments AS repayment
  SET reported_by = NULL
  WHERE repayment.reported_by = p_user_id;
  UPDATE public.expenses AS expense
  SET created_by = NULL
  WHERE expense.created_by = p_user_id;
  UPDATE public.expense_groups AS group_row
  SET created_by = NULL
  WHERE group_row.created_by = p_user_id;

  UPDATE public.expense_group_members AS member
  SET user_id = NULL,
      status = CASE
        WHEN member.status IN ('invited', 'declined') THEN 'removed'
        ELSE member.status
      END
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'preferences_removed', v_preferences,
    'snapshots_removed', v_snapshots,
    'parties_unlinked', v_members,
    'invitations_scrubbed', v_invitations,
    'event_identity_links_unlinked', v_event_links,
    'event_contexts_removed', v_event_contexts,
    'v2_event_identity_links_unlinked', v_v2_identity_links,
    'v2_events_removed', v_v2_events,
    'v2_event_receipts_removed', v_v2_receipts
  );
END;
$function$;

DO $teskeid_event_financial_content_attestation$
DECLARE
  v_expected record;
  v_count bigint;
  v_digest text;
BEGIN
  FOR v_expected IN
    SELECT * FROM pg_temp.teskeid_event_legacy_attestation
    ORDER BY relation_name
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT count(*)::bigint, md5(COALESCE(string_agg(to_jsonb(row_value)::text, %L ORDER BY to_jsonb(row_value)::text), %L)) FROM public.%I AS row_value',
      '|', '', v_expected.relation_name
    ) INTO v_count, v_digest;

    -- The baseline uses stable primary/sequence ordering. Since every jsonb row
    -- is unique under those keys, a second canonical json ordering must produce
    -- the same row multiset even though the concatenation order differs. Compare
    -- an order-independent digest as an additional exact multiset attestation.
    IF v_count <> v_expected.row_count THEN
      RAISE EXCEPTION 'teskeid_event_financial_row_count_changed:%',
        v_expected.relation_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
    WHERE event_row.legacy_expense_group_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'teskeid_event_legacy_expense_auto_tagged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.teskeid_event_legacy_attestation AS baseline
    JOIN LATERAL (
      SELECT CASE baseline.relation_name
        WHEN 'expense_groups' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.id::text, '|' ORDER BY row_value.id
          ), '')) FROM public.expense_groups AS row_value
        )
        WHEN 'expense_group_members' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_group_members AS row_value
        )
        WHEN 'expenses' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expenses AS row_value
        )
        WHEN 'expense_payments' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.expense_id::text || ':' ||
              row_value.member_id::text, '|' ORDER BY row_value.group_id,
              row_value.expense_id, row_value.member_id
          ), '')) FROM public.expense_payments AS row_value
        )
        WHEN 'expense_shares' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.expense_id::text || ':' ||
              row_value.member_id::text, '|' ORDER BY row_value.group_id,
              row_value.expense_id, row_value.member_id
          ), '')) FROM public.expense_shares AS row_value
        )
        WHEN 'expense_obligations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_obligations AS row_value
        )
        WHEN 'expense_repayments' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_repayments AS row_value
        )
        WHEN 'expense_repayment_allocations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.repayment_id::text || ':' ||
              row_value.obligation_id::text, '|' ORDER BY row_value.group_id,
              row_value.repayment_id, row_value.obligation_id
          ), '')) FROM public.expense_repayment_allocations AS row_value
        )
        WHEN 'expense_member_invitations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.group_id::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_member_invitations AS row_value
        )
        WHEN 'expense_activity' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.sequence_no::text || ':' || row_value.id::text, '|'
              ORDER BY row_value.sequence_no, row_value.id
          ), '')) FROM public.expense_activity AS row_value
        )
        WHEN 'expense_mutation_requests' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.actor_user_id::text || ':' || row_value.request_id::text, '|'
              ORDER BY row_value.actor_user_id, row_value.request_id
          ), '')) FROM public.expense_mutation_requests AS row_value
        )
        WHEN 'expense_settlement_batches' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.id::text, '|' ORDER BY row_value.id
          ), '')) FROM public.expense_settlement_batches AS row_value
        )
        WHEN 'expense_settlement_batch_items' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            row_value.batch_id::text || ':' || row_value.sequence_no::text || ':' ||
              row_value.id::text, '|' ORDER BY row_value.batch_id,
              row_value.sequence_no, row_value.id
          ), '')) FROM public.expense_settlement_batch_items AS row_value
        )
      END AS id_digest
    ) AS current_digest ON true
    WHERE current_digest.id_digest IS DISTINCT FROM baseline.id_digest
  ) THEN
    RAISE EXCEPTION 'teskeid_event_financial_ids_changed';
  END IF;

  -- Repeat the exact original order-specific digests, not only counts.
  IF EXISTS (
    SELECT 1
    FROM pg_temp.teskeid_event_legacy_attestation AS baseline
    JOIN LATERAL (
      SELECT CASE baseline.relation_name
        WHEN 'expense_groups' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.id
          ), '')) FROM public.expense_groups AS row_value
        )
        WHEN 'expense_group_members' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_group_members AS row_value
        )
        WHEN 'expenses' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expenses AS row_value
        )
        WHEN 'expense_payments' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.expense_id,
                row_value.member_id
          ), '')) FROM public.expense_payments AS row_value
        )
        WHEN 'expense_shares' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.expense_id,
                row_value.member_id
          ), '')) FROM public.expense_shares AS row_value
        )
        WHEN 'expense_obligations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_obligations AS row_value
        )
        WHEN 'expense_repayments' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_repayments AS row_value
        )
        WHEN 'expense_repayment_allocations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.repayment_id,
                row_value.obligation_id
          ), '')) FROM public.expense_repayment_allocations AS row_value
        )
        WHEN 'expense_member_invitations' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.group_id, row_value.id
          ), '')) FROM public.expense_member_invitations AS row_value
        )
        WHEN 'expense_activity' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.sequence_no, row_value.id
          ), '')) FROM public.expense_activity AS row_value
        )
        WHEN 'expense_mutation_requests' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.actor_user_id, row_value.request_id
          ), '')) FROM public.expense_mutation_requests AS row_value
        )
        WHEN 'expense_settlement_batches' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|' ORDER BY row_value.id
          ), '')) FROM public.expense_settlement_batches AS row_value
        )
        WHEN 'expense_settlement_batch_items' THEN (
          SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
            pg_catalog.to_jsonb(row_value)::text, '|'
              ORDER BY row_value.batch_id, row_value.sequence_no, row_value.id
          ), '')) FROM public.expense_settlement_batch_items AS row_value
        )
      END AS content_digest
    ) AS current_digest ON true
    WHERE current_digest.content_digest IS DISTINCT FROM baseline.content_digest
  ) THEN
    RAISE EXCEPTION 'teskeid_event_financial_content_changed';
  END IF;
END;
$teskeid_event_financial_content_attestation$;

ALTER FUNCTION public.teskeid_event_normalize_text(text) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_valid_text(text,integer,integer) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_uuid_from_text(text) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_has_access(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_actor(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_financial_actor(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_finish_request(uuid,uuid,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_roster(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_roster_integrity_trigger() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_touch_updated_at() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_event_update() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_guest_update() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_receipt_mutation() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_expense_link_integrity_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_immutable_history() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create(uuid,uuid,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_expense_sources(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_source(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.expense_prepare_account_deletion(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_normalize_text(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_valid_text(text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_uuid_from_text(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_has_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_financial_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_begin_request(
  uuid,uuid,text,text,boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_finish_request(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_roster(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_roster_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_event_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_guest_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_receipt_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_expense_link_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_immutable_history()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.teskeid_event_create(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_replace_roster(
  uuid,uuid,uuid,bigint,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list_expense_sources(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_create_tagged_expense(
  uuid,uuid,uuid,bigint,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.teskeid_event_create(uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_replace_roster(
  uuid,uuid,uuid,bigint,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list_expense_sources(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_tagged_expense(
  uuid,uuid,uuid,bigint,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_prepare_account_deletion(uuid)
  TO service_role;

DO $teskeid_event_recent_events_acl_attestation$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        privilege.privilege_type
        ORDER BY privilege.privilege_type COLLATE "C"
      ), ARRAY[]::text[]) AS privilege_types
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE grantee.rolname = 'service_role'
    ) AS service_acl
    WHERE relation.oid = pg_catalog.to_regclass('public.recent_events')
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND service_acl.privilege_types = ARRAY[
        'DELETE', 'INSERT', 'SELECT', 'UPDATE'
      ]::text[]
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      AND NOT pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'MAINTAIN'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'REFERENCES'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'TRIGGER'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'TRUNCATE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> relation.relowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
           OR (
             grantee.rolname = 'service_role'
             AND privilege.grantor <> relation.relowner
           )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('anon'::name), ('authenticated'::name)
        ) AS browser(role_name)
        WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'MAINTAIN')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_recent_events_acl_normalization_failed';
  END IF;
END;
$teskeid_event_recent_events_acl_attestation$;

COMMENT ON TABLE public.teskeid_events IS
  'Owner-private mutable events. They are not expense groups or financial access contexts.';
COMMENT ON TABLE public.teskeid_event_guests IS
  'Owner-private event roster snapshots. Membership grants no event or expense access and creates no debt.';
COMMENT ON TABLE public.teskeid_event_expense_links IS
  'Non-authorizing immutable metadata linking one independent event to one canonical one-off expense.';
COMMENT ON TABLE public.teskeid_event_expense_participant_sources IS
  'Immutable authoritative provenance from an event guest to its exact canonical expense member snapshot.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid) IS
  'Read-only live projection. Obligations are never added to principal and no Phase C settlement write is performed.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid) IS
  'Exact owner-only expense-source lookup; requires Events and Expenses access.';

COMMIT;
