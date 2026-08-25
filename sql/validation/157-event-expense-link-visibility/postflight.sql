BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH expected_functions(
  signature, exact_arguments, source_hash, language_name, volatility,
  return_type, returns_set, argument_defaults, service_execute
) AS (VALUES
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
   'a30f4dff7aa3d616476da29c82e1b177', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
   '719a00f72fccbfac3f5f2cb778c2accb', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_link_to_event boolean, p_payload jsonb',
   'eca30a044e0406a755fb02399070c3f8', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_get_expense_activity(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   '18e145ca9e417df099190e27ca6e5015', 'plpgsql', 's', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_get_expense_link_management(uuid,uuid)',
   'p_actor_id uuid, p_expense_id uuid',
   'e43782e5d047748ec0f08ef7706e2c82', 'plpgsql', 's', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint',
   '52b33d784e4d471b1bece631e8a39da3', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_assert_expense_link(uuid,uuid,uuid)',
   'p_event_id uuid, p_group_id uuid, p_expense_id uuid',
   '45cd53f615941bb7d195d1dc30502db7', 'plpgsql', 'v', 'pg_catalog.void', false, 0, false),
  ('public.teskeid_event_immutable_history()', '',
   'f50c07cc5132e30f93aad4e5bdde806c', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
  ('public.teskeid_event_guard_receipt_mutation()', '',
   'abbca6ba554f3a1d0d4d71b9918d2abd', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
  ('public.teskeid_event_expense_link_integrity_trigger()', '',
   'c6b3f6dfb4e4220558e2c9316f728a7c', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
  ('public.teskeid_event_private_scope_v3(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   'df104d5af3896804c7b8ef3321d191c8', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, false),
  ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   '41487888c688c3280904d78772443b07', 'plpgsql', 'v', 'integer', false, 0, false),
  ('public.teskeid_event_assert_session_actor(uuid)', 'p_actor_id uuid',
   '30238c0def94d573fd8265fd94da0757', 'plpgsql', 's', 'pg_catalog.void', false, 0, false),
  ('public.teskeid_event_assert_actor(uuid)', 'p_actor_id uuid',
   '9dd7c34f6cc6c78131e7ebbb9a718ea4', 'plpgsql', 's', 'pg_catalog.void', false, 0, false),
  ('public.teskeid_event_has_access(uuid)', 'p_user_id uuid',
   '7b69311a107381a1891da01c32780f5f', 'sql', 's', 'boolean', false, 0, false),
  ('public.teskeid_event_private_valid_canonical_email_v2(text)',
   'p_value text',
   '3e64bc04485bc06cc544f59f46a2fb0e', 'sql', 'i', 'boolean', false, 0, false),
  ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
   'p_invitation_ids uuid[], p_status text',
   'a2a85bca2a456177ab67b7817dc6e19d', 'plpgsql', 'v', 'integer', false, 0, false),
  ('public.teskeid_event_assert_financial_actor(uuid)', 'p_actor_id uuid',
   '7f6ced4f5e7472aff27d9a6d5c624355', 'plpgsql', 's', 'pg_catalog.void', false, 0, false),
  ('public.expense_has_beta_access(uuid)', 'p_user_id uuid',
   'ebe4628dbda84e79b395c9da0ae39899', 'sql', 's', 'boolean', false, 0, false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)',
   'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean',
   '4e70b62a5fa28cfe2b884d703935a16c', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_result jsonb',
   'eaa006157dc5377e0ae1f8979651f8aa', 'plpgsql', 'v', 'pg_catalog.void', false, 0, false),
  ('public.expense_active_member_role(uuid,uuid)',
   'p_actor_id uuid, p_group_id uuid',
   'b25f994a64dde4a3f94ec8bad8535b17', 'sql', 's', 'pg_catalog.text', false, 0, false),
  ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
   'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
   '819b2e024aac1e00c7e14145b0d6b373', 'plpgsql', 'v', 'bigint', false, 0, false),
  ('public.expense_group_balances(uuid,boolean)',
   'p_group_id uuid, p_include_reported boolean DEFAULT false',
   'f257b83aefd92169687ab2a516da24d9', 'sql', 's', 'pg_catalog.record', true, 1, false),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_participant_invitations jsonb DEFAULT ''[]''::jsonb',
   '5da34435052493c4c993bc88e82a72dd', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 1, true),
  ('public.teskeid_event_attendance_lock_user_emails(uuid[])',
   'p_user_ids uuid[]',
   'a746f7835eba9f759e6ae8af0d51f46f', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, false),
  ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
   'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
   '2377be525ed29f2d4bc26d453fa8cf51', 'plpgsql', 's', 'pg_catalog.text', false, 0, false),
  ('public.teskeid_event_uuid_from_text(text)', 'p_value text',
   '27229cbc71c621e5a8592265b07f874d', 'sql', 'i', 'pg_catalog.uuid', false, 0, false),
  ('public.normalize_email_canonical(text)', 'p_email text',
   '3083103976aa8cb3780937b9da1be236', 'sql', 'i', 'pg_catalog.text', false, 0, true),
  ('public.teskeid_event_guard_expense_link_visibility_update()', '',
   '9db3caac3b319f9f5aa61abae8485b0b', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
  ('public.teskeid_event_get_expense_activity_v2(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   'd5422fcda5e1ce93aeb08a4f2c9db91a', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)',
   'p_actor_id uuid, p_expense_id uuid',
   '7ab39825d58918dfc99ebb01b53128ec', 'plpgsql', 's', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text',
   '279be97e3295b9d2ae6f2457bf106d6a', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
  ('public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_event_id uuid, p_expected_link_revision bigint, p_visibility text',
   'bbc8506eee80ab50c3a4479ec33b4fed', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true)
), function_catalog AS (
  SELECT expected_functions.*, function_row.*,
    language_row.lanname AS actual_language_name
  FROM expected_functions
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected_functions.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), function_contract AS (
  SELECT pg_catalog.count(*) = 34
    AND COALESCE(pg_catalog.bool_and(
      function_catalog.oid IS NOT NULL
      AND function_catalog.prokind = 'f'
      AND function_catalog.provolatile::text = function_catalog.volatility
      AND function_catalog.proretset = function_catalog.returns_set
      AND function_catalog.prorettype =
            pg_catalog.to_regtype(function_catalog.return_type)
      AND pg_catalog.pg_get_function_result(function_catalog.oid) = CASE
        WHEN function_catalog.signature =
          'public.expense_group_balances(uuid,boolean)'
          THEN 'TABLE(member_id uuid, currency text, amount_minor bigint)'
        ELSE pg_catalog.replace(function_catalog.return_type, 'pg_catalog.', '')
      END
      AND function_catalog.prosecdef = (
        function_catalog.signature <> 'public.normalize_email_canonical(text)'
      )
      AND NOT function_catalog.proleakproof
      AND function_catalog.proisstrict = (
        function_catalog.signature = 'public.normalize_email_canonical(text)'
      )
      AND function_catalog.proparallel = CASE
        WHEN function_catalog.signature = 'public.normalize_email_canonical(text)'
          THEN 's'::"char" ELSE 'u'::"char" END
      AND function_catalog.pronargdefaults = function_catalog.argument_defaults
      AND function_catalog.actual_language_name = function_catalog.language_name
      AND pg_catalog.pg_get_function_arguments(function_catalog.oid) =
            function_catalog.exact_arguments
      AND pg_catalog.pg_get_userbyid(function_catalog.proowner) = 'postgres'
      AND function_catalog.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.md5(pg_catalog.replace(
            function_catalog.prosrc, E'\r\n', E'\n'
          )) = function_catalog.source_hash
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_catalog.pronamespace
          AND overload.proname = function_catalog.proname
      )
      AND pg_catalog.has_function_privilege(
            'service_role', function_catalog.oid, 'EXECUTE'
          ) = function_catalog.service_execute
      AND (
        SELECT pg_catalog.count(*) =
          CASE WHEN function_catalog.service_execute THEN 2 ELSE 1 END
        FROM pg_catalog.aclexplode(COALESCE(
          function_catalog.proacl,
          pg_catalog.acldefault('f', function_catalog.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_catalog.proowner
          AND NOT privilege.is_grantable
          AND (privilege.grantee = function_catalog.proowner
            OR (function_catalog.service_execute
              AND grantee.rolname = 'service_role'))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_catalog.proacl,
          pg_catalog.acldefault('f', function_catalog.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_catalog.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (privilege.grantee <> function_catalog.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role')
           OR (grantee.rolname = 'service_role'
             AND NOT function_catalog.service_execute)
      )
    ), false) AS functions_exact
  FROM function_catalog
), relation_expected(relation_oid, expected_columns) AS (VALUES
  (pg_catalog.to_regclass('public.teskeid_event_expense_links'), ARRAY[
    'event_id', 'group_id', 'expense_id', 'linked_by_user_id',
    'link_revision', 'linked_at', 'visibility'
  ]::name[]),
  (pg_catalog.to_regclass('public.teskeid_event_mutation_requests'), ARRAY[
    'actor_user_id', 'request_id', 'operation', 'fingerprint', 'result',
    'created_at', 'completed_at'
  ]::name[]),
  (pg_catalog.to_regclass('public.teskeid_event_sql157_install_baseline'), ARRAY[
    'singleton', 'owner_create_source', 'attendee_create_source',
    'wrapper_create_source',
    'installed_link_count', 'installed_link_digest',
    'installed_request_count', 'installed_request_digest',
    'installed_protected_digest', 'activity_v1_hash', 'management_v1_hash',
    'attach_v1_hash', 'installed_at'
  ]::name[])
), relation_contract AS (
  SELECT pg_catalog.count(relation.oid) = 3
    AND COALESCE(pg_catalog.bool_and(
      relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND (SELECT pg_catalog.array_agg(attribute.attname ORDER BY attribute.attnum)
           FROM pg_catalog.pg_attribute AS attribute
           WHERE attribute.attrelid = relation.oid
             AND attribute.attnum > 0
             AND NOT attribute.attisdropped) = relation_expected.expected_columns
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND attribute.attacl IS NOT NULL
      )
      AND (SELECT pg_catalog.count(*) = 7 + CASE
             WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
               THEN 1 ELSE 0 END
           FROM pg_catalog.aclexplode(COALESCE(
             relation.relacl, pg_catalog.acldefault('r', relation.relowner)
           )) AS privilege
           WHERE privilege.grantee = relation.relowner
             AND privilege.grantor = relation.relowner
             AND NOT privilege.is_grantable
             AND privilege.privilege_type IN (
               'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
               'REFERENCES', 'TRIGGER', 'MAINTAIN'
             ))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE privilege.grantee <> relation.relowner
           OR privilege.grantor <> relation.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
             'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
      )
    ), false) AS relations_private_exact,
    (
      WITH expected(
        column_name, ordinal_position, type_name, is_not_null, default_expr
      ) AS (VALUES
        ('event_id', 1, 'uuid', true, NULL::text),
        ('group_id', 2, 'uuid', true, NULL::text),
        ('expense_id', 3, 'uuid', true, NULL::text),
        ('linked_by_user_id', 4, 'uuid', false, NULL::text),
        ('link_revision', 5, 'bigint', true, '1'),
        ('linked_at', 6, 'timestamp with time zone', true, 'now()'),
        ('visibility', 7, 'text', true, '''participants_only''::text')
      )
      SELECT pg_catalog.count(attribute.attnum) = 7
        AND COALESCE(pg_catalog.bool_and(
          attribute.attnum = expected.ordinal_position
          AND pg_catalog.format_type(
            attribute.atttypid, attribute.atttypmod
          ) = expected.type_name
          AND attribute.attnotnull = expected.is_not_null
          AND attribute.attidentity = ''
          AND attribute.attgenerated = ''
          AND pg_catalog.pg_get_expr(
            default_row.adbin, default_row.adrelid
          ) IS NOT DISTINCT FROM expected.default_expr
        ), false)
      FROM expected
      LEFT JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = pg_catalog.to_regclass(
             'public.teskeid_event_expense_links'
           )
       AND attribute.attname = expected.column_name
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      LEFT JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute.attrelid
       AND default_row.adnum = attribute.attnum
    ) AS link_columns_exact,
    (
      WITH expected(
        column_name, ordinal_position, type_name, is_not_null, default_expr
      ) AS (VALUES
        ('singleton', 1, 'boolean', true, 'true'),
        ('owner_create_source', 2, 'text', true, NULL::text),
        ('attendee_create_source', 3, 'text', true, NULL::text),
        ('wrapper_create_source', 4, 'text', true, NULL::text),
        ('installed_link_count', 5, 'bigint', true, NULL::text),
        ('installed_link_digest', 6, 'text', true, NULL::text),
        ('installed_request_count', 7, 'bigint', true, NULL::text),
        ('installed_request_digest', 8, 'text', true, NULL::text),
        ('installed_protected_digest', 9, 'text', true, NULL::text),
        ('activity_v1_hash', 10, 'text', true, NULL::text),
        ('management_v1_hash', 11, 'text', true, NULL::text),
        ('attach_v1_hash', 12, 'text', true, NULL::text),
        ('installed_at', 13, 'timestamp with time zone', true, 'now()')
      )
      SELECT pg_catalog.count(attribute.attnum) = 13
        AND COALESCE(pg_catalog.bool_and(
          attribute.attnum = expected.ordinal_position
          AND pg_catalog.format_type(
            attribute.atttypid, attribute.atttypmod
          ) = expected.type_name
          AND attribute.attnotnull = expected.is_not_null
          AND attribute.attidentity = ''
          AND attribute.attgenerated = ''
          AND pg_catalog.pg_get_expr(
            default_row.adbin, default_row.adrelid
          ) IS NOT DISTINCT FROM expected.default_expr
        ), false)
      FROM expected
      LEFT JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = pg_catalog.to_regclass(
             'public.teskeid_event_sql157_install_baseline'
           )
       AND attribute.attname = expected.column_name
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      LEFT JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute.attrelid
       AND default_row.adnum = attribute.attnum
    ) AS baseline_columns_exact
  FROM relation_expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = relation_expected.relation_oid
), receipt_contract AS (
  SELECT
    (
      WITH expected(
        column_name, ordinal_position, type_name, is_not_null, default_expr
      ) AS (VALUES
        ('actor_user_id', 1, 'uuid', true, NULL::text),
        ('request_id', 2, 'uuid', true, NULL::text),
        ('operation', 3, 'text', true, NULL::text),
        ('fingerprint', 4, 'text', true, NULL::text),
        ('result', 5, 'jsonb', false, NULL::text),
        ('created_at', 6, 'timestamp with time zone', true, 'now()'),
        ('completed_at', 7, 'timestamp with time zone', false, NULL::text)
      )
      SELECT pg_catalog.count(attribute.attnum) = 7
        AND COALESCE(pg_catalog.bool_and(
          attribute.attnum = expected.ordinal_position
          AND pg_catalog.format_type(
            attribute.atttypid, attribute.atttypmod
          ) = expected.type_name
          AND attribute.attnotnull = expected.is_not_null
          AND attribute.attidentity = ''
          AND attribute.attgenerated = ''
          AND pg_catalog.pg_get_expr(
            default_row.adbin, default_row.adrelid
          ) IS NOT DISTINCT FROM expected.default_expr
        ), false)
      FROM expected
      LEFT JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = pg_catalog.to_regclass(
             'public.teskeid_event_mutation_requests'
           )
       AND attribute.attname = expected.column_name
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      LEFT JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute.attrelid
       AND default_row.adnum = attribute.attnum
    ) AS receipt_columns_exact,
    (
      WITH expected(constraint_name, exact_definition) AS (VALUES
        ('teskeid_event_mutation_requests_pkey',
         'primarykeyactor_user_id,request_id'),
        ('teskeid_event_mutation_requests_actor_fk',
         'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
        ('teskeid_event_mutation_requests_operation_check',
         'checkchar_lengthoperation>=1andchar_lengthoperation<=80'),
        ('teskeid_event_mutation_requests_fingerprint_check',
         'checkfingerprint~^[0-9a-f]{32}$'),
        ('teskeid_event_mutation_requests_result_check',
         'checkresultisnullorjsonb_typeofresult=objectandoctet_lengthresult<=8192')
      )
      SELECT pg_catalog.count(constraint_row.oid) = 5
        AND COALESCE(pg_catalog.bool_and(
          constraint_row.convalidated
          AND NOT constraint_row.condeferrable
          AND NOT constraint_row.condeferred
          AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(constraint_row.oid),
              '::[a-z0-9_]+(\[\])?', '', 'g'
            ), '[[:space:]()''"]', '', 'g'
          ), 'public.', '')) = expected.exact_definition
        ), false)
      FROM expected
      LEFT JOIN pg_catalog.pg_constraint AS constraint_row
        ON constraint_row.conrelid = pg_catalog.to_regclass(
             'public.teskeid_event_mutation_requests'
           )
       AND constraint_row.conname = expected.constraint_name
      WHERE (SELECT pg_catalog.count(*)
             FROM pg_catalog.pg_constraint AS actual
             WHERE actual.conrelid = pg_catalog.to_regclass(
               'public.teskeid_event_mutation_requests'
             )
               AND actual.contype IN ('c', 'f', 'p', 'u', 'x')) = 5
    ) AS receipt_constraints_exact,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass(
        'public.teskeid_event_mutation_requests'
      )
        AND trigger_row.tgname = 'teskeid_event_receipts_mutation_guard'
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'public.teskeid_event_guard_receipt_mutation()'
        )
        AND trigger_row.tgtype = 27
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgconstraint = 0
        AND trigger_row.tgnargs = 0
        AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
        AND trigger_row.tgqual IS NULL
        AND NOT trigger_row.tgisinternal
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
          pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            pg_catalog.pg_get_triggerdef(trigger_row.oid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'), 'public.', ''
        ))) = '848754f56bd8a534919b139b3f0cc458'
        AND (SELECT pg_catalog.count(*)
             FROM pg_catalog.pg_trigger AS actual
             WHERE actual.tgrelid = trigger_row.tgrelid
               AND NOT actual.tgisinternal) = 1
    ) AS receipt_trigger_exact
), constraint_catalog AS (
  SELECT constraint_row.*,
    ARRAY(SELECT attribute.attname::text
      FROM pg_catalog.unnest(constraint_row.conkey)
        WITH ORDINALITY AS key_column(attnum, ordinal)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = constraint_row.conrelid
       AND attribute.attnum = key_column.attnum
      ORDER BY key_column.ordinal) AS local_columns,
    ARRAY(SELECT attribute.attname::text
      FROM pg_catalog.unnest(constraint_row.confkey)
        WITH ORDINALITY AS key_column(attnum, ordinal)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = constraint_row.confrelid
       AND attribute.attnum = key_column.attnum
      ORDER BY key_column.ordinal) AS referenced_columns
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
    'public.teskeid_event_expense_links'::pg_catalog.regclass
    AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')
), constraint_contract AS (
  SELECT pg_catalog.count(*) = 7
    AND COALESCE(pg_catalog.bool_and(
      constraint_catalog.convalidated
      AND NOT constraint_catalog.condeferrable
      AND NOT constraint_catalog.condeferred
      AND CASE constraint_catalog.conname
        WHEN 'teskeid_event_expense_links_pkey' THEN
          constraint_catalog.contype = 'p'
          AND constraint_catalog.local_columns =
            ARRAY['event_id', 'expense_id']::text[]
        WHEN 'teskeid_event_expense_links_scope_key' THEN
          constraint_catalog.contype = 'u'
          AND constraint_catalog.local_columns =
            ARRAY['event_id', 'group_id', 'expense_id']::text[]
        WHEN 'teskeid_event_expense_links_event_fk' THEN
          constraint_catalog.contype = 'f'
          AND constraint_catalog.local_columns = ARRAY['event_id']::text[]
          AND constraint_catalog.confrelid =
            'public.teskeid_events'::pg_catalog.regclass
          AND constraint_catalog.referenced_columns = ARRAY['id']::text[]
          AND constraint_catalog.confupdtype = 'a'
          AND constraint_catalog.confdeltype = 'c'
        WHEN 'teskeid_event_expense_links_expense_fk' THEN
          constraint_catalog.contype = 'f'
          AND constraint_catalog.local_columns =
            ARRAY['group_id', 'expense_id']::text[]
          AND constraint_catalog.confrelid = 'public.expenses'::pg_catalog.regclass
          AND constraint_catalog.referenced_columns =
            ARRAY['group_id', 'id']::text[]
          AND constraint_catalog.confupdtype = 'a'
          AND constraint_catalog.confdeltype = 'r'
        WHEN 'teskeid_event_expense_links_actor_fk' THEN
          constraint_catalog.contype = 'f'
          AND constraint_catalog.local_columns =
            ARRAY['linked_by_user_id']::text[]
          AND constraint_catalog.confrelid = 'auth.users'::pg_catalog.regclass
          AND constraint_catalog.referenced_columns = ARRAY['id']::text[]
          AND constraint_catalog.confupdtype = 'a'
          AND constraint_catalog.confdeltype = 'n'
        WHEN 'teskeid_event_expense_links_visibility_check' THEN
          constraint_catalog.contype = 'c'
          AND pg_catalog.regexp_replace(pg_catalog.lower(
            pg_catalog.pg_get_constraintdef(constraint_catalog.oid)
          ), '[[:space:]()'']', '', 'g') =
            'checkvisibility=anyarray[participants_only::text,all_event::text]'
        WHEN 'teskeid_event_expense_links_revision_check' THEN
          constraint_catalog.contype = 'c'
          AND pg_catalog.regexp_replace(pg_catalog.lower(
            pg_catalog.pg_get_constraintdef(constraint_catalog.oid)
          ), '[[:space:]()]', '', 'g') = 'checklink_revision>=1'
        ELSE false
      END
    ), false) AS link_constraints_exact
  FROM constraint_catalog
), index_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_row.indrelid =
      'public.teskeid_event_expense_links'::pg_catalog.regclass
      AND index_relation.relname =
        'teskeid_event_expense_links_expense_uidx'
      AND index_row.indisunique
      AND NOT index_row.indisprimary
      AND NOT index_row.indisexclusion
      AND index_row.indimmediate
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND NOT index_row.indcheckxmin
      AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident
      AND NOT index_row.indnullsnotdistinct
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND access_method.amname = 'btree'
      AND pg_catalog.pg_get_userbyid(index_relation.relowner) = 'postgres'
      AND index_relation.reltablespace = 0
      AND index_relation.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) = 0
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid) =
        'CREATE UNIQUE INDEX teskeid_event_expense_links_expense_uidx ON public.teskeid_event_expense_links USING btree (expense_id)'
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(index_row.indkey)
          WITH ORDINALITY AS key_column(attnum, ordinal)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = index_row.indrelid
         AND attribute.attnum = key_column.attnum
        WHERE key_column.ordinal <= index_row.indnkeyatts
        ORDER BY key_column.ordinal
      ) = ARRAY['expense_id']::text[]
      AND ARRAY(
        SELECT namespace.nspname::text || '.' || operator_class.opcname::text
        FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
          AS key_opclass(opclass_oid, ordinal)
        JOIN pg_catalog.pg_opclass AS operator_class
          ON operator_class.oid = key_opclass.opclass_oid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = operator_class.opcnamespace
        ORDER BY key_opclass.ordinal
      ) = ARRAY['pg_catalog.uuid_ops']::text[]
      AND ARRAY(
        SELECT COALESCE(collation_row.collname, '')::text
        FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
          AS key_collation(collation_oid, ordinal)
        LEFT JOIN pg_catalog.pg_collation AS collation_row
          ON collation_row.oid = key_collation.collation_oid
        ORDER BY key_collation.ordinal
      ) = ARRAY['']::text[]
      AND ARRAY(
        SELECT option_value::smallint
        FROM pg_catalog.unnest(index_row.indoption) WITH ORDINALITY
          AS key_option(option_value, ordinal)
        ORDER BY key_option.ordinal
      ) = ARRAY[0]::smallint[]
  ) AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_index AS index_row
         WHERE index_row.indrelid =
           'public.teskeid_event_expense_links'::pg_catalog.regclass
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conindid = index_row.indexrelid
           )) = 1 AS link_expense_unique_index_exact
), trigger_catalog AS (
  SELECT trigger_row.*, function_row.proname AS function_name,
    function_namespace.nspname AS function_schema,
    pg_catalog.pg_get_function_identity_arguments(function_row.oid)
      AS function_arguments,
    trigger_constraint.contype AS trigger_constraint_type,
    trigger_constraint.condeferrable,
    trigger_constraint.condeferred
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  LEFT JOIN pg_catalog.pg_constraint AS trigger_constraint
    ON trigger_constraint.oid = trigger_row.tgconstraint
  WHERE trigger_row.tgrelid =
    'public.teskeid_event_expense_links'::pg_catalog.regclass
    AND NOT trigger_row.tgisinternal
), trigger_contract AS (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and(
      trigger_catalog.tgenabled = 'O'
      AND trigger_catalog.function_schema = 'public'
      AND trigger_catalog.function_arguments = ''
      AND CASE trigger_catalog.tgname
        WHEN 'teskeid_event_expense_links_integrity_deferred' THEN
          trigger_catalog.tgtype = 21
          AND trigger_catalog.function_name =
            'teskeid_event_expense_link_integrity_trigger'
          AND trigger_catalog.trigger_constraint_type = 't'
          AND trigger_catalog.condeferrable
          AND trigger_catalog.condeferred
        WHEN 'teskeid_event_expense_links_immutable_guard' THEN
          trigger_catalog.tgtype = 19
          AND trigger_catalog.function_name =
            'teskeid_event_guard_expense_link_visibility_update'
          AND trigger_catalog.tgconstraint = 0
        ELSE false
      END
    ), false) AS link_triggers_exact
  FROM trigger_catalog
), writer_contract AS (
  SELECT
    (SELECT COALESCE(pg_catalog.array_agg(
       function_row.oid::pg_catalog.regprocedure::text
       ORDER BY (function_row.oid::pg_catalog.regprocedure::text)
         COLLATE pg_catalog."C"
     ), ARRAY[]::text[])
     FROM pg_catalog.pg_proc AS function_row
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = function_row.pronamespace
     WHERE namespace.nspname = 'public'
       AND function_row.prokind = 'f'
       AND function_row.prosrc ~*
         'insert[[:space:]]+into[[:space:]]+public[.]teskeid_event_expense_links'
    ) = ARRAY[
      'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
      'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)',
      'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
    ]::text[] AS insert_writer_set_exact,
    (SELECT COALESCE(pg_catalog.array_agg(
       function_row.oid::pg_catalog.regprocedure::text
       ORDER BY (function_row.oid::pg_catalog.regprocedure::text)
         COLLATE pg_catalog."C"
     ), ARRAY[]::text[])
     FROM pg_catalog.pg_proc AS function_row
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = function_row.pronamespace
     WHERE namespace.nspname = 'public'
       AND function_row.prokind = 'f'
       AND function_row.prosrc ~*
         'update[[:space:]]+public[.]teskeid_event_expense_links'
    ) = ARRAY[
      'public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)'
    ]::text[] AS update_writer_set_exact
), linked_groups AS MATERIALIZED (
  SELECT DISTINCT link.group_id
  FROM public.teskeid_event_expense_links AS link
), data_state AS (
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_links AS link
      WHERE link.visibility IS NULL
         OR link.visibility NOT IN ('participants_only', 'all_event')
         OR link.link_revision < 1
    ) AS link_values_valid,
    (SELECT pg_catalog.count(*)
     FROM public.teskeid_event_sql157_install_baseline) = 1
      AS baseline_singleton,
    (SELECT pg_catalog.count(*)
     FROM public.teskeid_event_expense_links) AS link_count,
    (SELECT pg_catalog.count(*)
     FROM public.teskeid_event_expense_links
     WHERE visibility = 'participants_only') AS participants_only_count,
    (SELECT pg_catalog.count(*)
     FROM public.teskeid_event_expense_links
     WHERE visibility = 'all_event') AS all_event_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
       pg_catalog.jsonb_build_array(
         link.event_id, link.group_id, link.expense_id, link.linked_by_user_id,
         link.link_revision, link.linked_at
       ) ORDER BY link.event_id, link.expense_id
     ), '[]'::jsonb)::text)
     FROM public.teskeid_event_expense_links AS link) AS link_digest,
    (SELECT pg_catalog.count(*)
     FROM public.teskeid_event_mutation_requests) AS request_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
       pg_catalog.to_jsonb(request_row)
       ORDER BY request_row.actor_user_id, request_row.request_id
     ), '[]'::jsonb)::text)
     FROM public.teskeid_event_mutation_requests AS request_row)
       AS request_digest,
    pg_catalog.md5(pg_catalog.jsonb_build_object(
      'groups', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(group_row) ORDER BY group_row.id
      ), '[]'::jsonb) FROM public.expense_groups AS group_row
        JOIN linked_groups ON linked_groups.group_id = group_row.id),
      'members', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(member_row)
        ORDER BY member_row.group_id, member_row.id
      ), '[]'::jsonb) FROM public.expense_group_members AS member_row
        JOIN linked_groups ON linked_groups.group_id = member_row.group_id),
      'expenses', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(expense) ORDER BY expense.group_id, expense.id
      ), '[]'::jsonb) FROM public.expenses AS expense
        JOIN linked_groups ON linked_groups.group_id = expense.group_id),
      'payments', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(payment)
        ORDER BY payment.group_id, payment.expense_id, payment.member_id
      ), '[]'::jsonb) FROM public.expense_payments AS payment
        JOIN linked_groups ON linked_groups.group_id = payment.group_id),
      'shares', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(share_row)
        ORDER BY share_row.group_id, share_row.expense_id, share_row.member_id
      ), '[]'::jsonb) FROM public.expense_shares AS share_row
        JOIN linked_groups ON linked_groups.group_id = share_row.group_id),
      'obligations', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(obligation)
        ORDER BY obligation.group_id, obligation.id
      ), '[]'::jsonb) FROM public.expense_obligations AS obligation
        JOIN linked_groups ON linked_groups.group_id = obligation.group_id),
      'repayments', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(repayment) ORDER BY repayment.group_id, repayment.id
      ), '[]'::jsonb) FROM public.expense_repayments AS repayment
        JOIN linked_groups ON linked_groups.group_id = repayment.group_id),
      'repayment_allocations', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(allocation)
        ORDER BY allocation.group_id, allocation.repayment_id,
          allocation.obligation_id
      ), '[]'::jsonb) FROM public.expense_repayment_allocations AS allocation
        JOIN linked_groups ON linked_groups.group_id = allocation.group_id),
      'activity', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(activity)
        ORDER BY activity.group_id, activity.sequence_no, activity.id
      ), '[]'::jsonb) FROM public.expense_activity AS activity
        JOIN linked_groups ON linked_groups.group_id = activity.group_id),
      'revisions', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(revision)
        ORDER BY revision.group_id, revision.sequence_no, revision.id
      ), '[]'::jsonb) FROM public.expense_revisions AS revision
        JOIN linked_groups ON linked_groups.group_id = revision.group_id),
      'identity_bindings', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(binding)
        ORDER BY binding.group_id, binding.member_id, binding.id
      ), '[]'::jsonb) FROM public.expense_member_identity_bindings AS binding
        JOIN linked_groups ON linked_groups.group_id = binding.group_id),
      'claim_disputes', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(dispute)
        ORDER BY dispute.group_id, dispute.expense_id, dispute.member_id,
          dispute.id
      ), '[]'::jsonb) FROM public.expense_claim_disputes AS dispute
        JOIN linked_groups ON linked_groups.group_id = dispute.group_id),
      'participant_sources', (SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(source_row)
        ORDER BY source_row.group_id, source_row.expense_id,
          source_row.event_guest_id, source_row.expense_member_id
      ), '[]'::jsonb)
        FROM public.teskeid_event_expense_participant_sources AS source_row
        JOIN linked_groups ON linked_groups.group_id = source_row.group_id)
    )::text) AS protected_digest
), comparison AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql157_install_baseline AS baseline
    CROSS JOIN data_state
    WHERE baseline.singleton
      AND pg_catalog.md5(pg_catalog.replace(
        baseline.owner_create_source, E'\r\n', E'\n'
      )) = '712497ed70ba83a63008b2cf58fbaff3'
      AND pg_catalog.md5(pg_catalog.replace(
        baseline.attendee_create_source, E'\r\n', E'\n'
      )) = '6b0a2f8699784b1064d4e222938257f9'
      AND pg_catalog.md5(pg_catalog.replace(
        baseline.wrapper_create_source, E'\r\n', E'\n'
      )) = '22425321bf1c82698f5739f24111c068'
      AND baseline.installed_link_count = data_state.link_count
      AND baseline.installed_link_digest = data_state.link_digest
      AND baseline.installed_request_count = data_state.request_count
      AND baseline.installed_request_digest = data_state.request_digest
      AND baseline.installed_protected_digest = data_state.protected_digest
      AND baseline.activity_v1_hash = pg_catalog.md5(
        pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
          'public.teskeid_event_get_expense_activity(uuid,uuid)'
        )))
      AND baseline.management_v1_hash = pg_catalog.md5(
        pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
          'public.teskeid_event_get_expense_link_management(uuid,uuid)'
        )))
      AND baseline.attach_v1_hash = pg_catalog.md5(
        pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
          'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
        )))
  ) AS baseline_data_and_v1_exact
)
SELECT function_contract.*, relation_contract.*, receipt_contract.*,
  constraint_contract.*,
  index_contract.*,
  trigger_contract.*, writer_contract.*, data_state.*, comparison.*,
  (function_contract.functions_exact
   AND relation_contract.relations_private_exact
   AND relation_contract.link_columns_exact
   AND relation_contract.baseline_columns_exact
   AND receipt_contract.receipt_columns_exact
   AND receipt_contract.receipt_constraints_exact
   AND receipt_contract.receipt_trigger_exact
   AND constraint_contract.link_constraints_exact
   AND index_contract.link_expense_unique_index_exact
   AND trigger_contract.link_triggers_exact
   AND writer_contract.insert_writer_set_exact
   AND writer_contract.update_writer_set_exact
   AND data_state.link_values_valid
   AND data_state.baseline_singleton
   AND data_state.participants_only_count = data_state.link_count
   AND data_state.all_event_count = 0
   AND comparison.baseline_data_and_v1_exact) AS postconditions_ok
FROM function_contract
CROSS JOIN relation_contract
CROSS JOIN receipt_contract
CROSS JOIN constraint_contract
CROSS JOIN index_contract
CROSS JOIN trigger_contract
CROSS JOIN writer_contract
CROSS JOIN data_state
CROSS JOIN comparison;

ROLLBACK;
