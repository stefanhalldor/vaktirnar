-- SQL157: Per-link Event expense visibility with additive V2 RPCs.
-- Existing and omitted visibility is fail-closed as participants_only.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';
SELECT pg_catalog.pg_advisory_xact_lock(157157);

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'teskeid_event_sql157_executor_mismatch';
  END IF;

  IF pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_mutation_requests'
     ) IS NULL
     OR pg_catalog.to_regclass('public.expense_claim_disputes') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_private_scope_v3(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
      ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_activity(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_link_management(uuid,uuid)'
     ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_immutable_history()'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_expense_link_integrity_trigger()'
      ) IS NULL
      OR pg_catalog.to_regprocedure(
        'public.teskeid_event_guard_receipt_mutation()'
      ) IS NULL
      OR pg_catalog.to_regrole('postgres') IS NULL
      OR pg_catalog.to_regrole('anon') IS NULL
      OR pg_catalog.to_regrole('authenticated') IS NULL
      OR pg_catalog.to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_sql157_prerequisite_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid =
      'public.teskeid_event_expense_links'::pg_catalog.regclass
      AND attribute.attname = 'visibility'
      AND NOT attribute.attisdropped
  )
     OR pg_catalog.to_regclass(
       'public.teskeid_event_sql157_install_baseline'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_activity_v2(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_sql157_target_exists';
  END IF;

  -- Pin every callable/predecessor definition that SQL157 trusts. This is an
  -- executable canonical-register check, not merely an existence check.
  IF NOT (
    WITH expected(
      signature, exact_arguments, source_hash, language_name, volatility,
      return_type, returns_set, argument_defaults, service_execute
    ) AS (VALUES
      ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
       '712497ed70ba83a63008b2cf58fbaff3', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
      ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
       '6b0a2f8699784b1064d4e222938257f9', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
      ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_link_to_event boolean, p_payload jsonb',
       '22425321bf1c82698f5739f24111c068', 'plpgsql', 'v', 'pg_catalog.jsonb', false, 0, true),
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
      ('public.teskeid_event_immutable_history()',
       '',
       'f50c07cc5132e30f93aad4e5bdde806c', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
      ('public.teskeid_event_guard_receipt_mutation()',
       '',
       'abbca6ba554f3a1d0d4d71b9918d2abd', 'plpgsql', 'v', 'pg_catalog.trigger', false, 0, false),
      ('public.teskeid_event_expense_link_integrity_trigger()',
       '',
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
      ('public.teskeid_event_assert_financial_actor(uuid)',
       'p_actor_id uuid',
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
       '3083103976aa8cb3780937b9da1be236', 'sql', 'i', 'pg_catalog.text', false, 0, true)
    ), attested AS (
      SELECT expected.*, function_row.*,
        language_row.lanname AS actual_language_name
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = function_row.prolang
    )
    SELECT pg_catalog.count(*) = 29
      AND COALESCE(pg_catalog.bool_and(
        attested.oid IS NOT NULL
        AND attested.prokind = 'f'
        AND attested.provolatile::text = attested.volatility
        AND attested.proretset = attested.returns_set
        AND attested.prorettype = pg_catalog.to_regtype(attested.return_type)
        AND pg_catalog.pg_get_function_result(attested.oid) = CASE
          WHEN attested.signature =
            'public.expense_group_balances(uuid,boolean)'
            THEN 'TABLE(member_id uuid, currency text, amount_minor bigint)'
          ELSE pg_catalog.replace(attested.return_type, 'pg_catalog.', '')
        END
        AND attested.prosecdef = (
          attested.signature <> 'public.normalize_email_canonical(text)'
        )
        AND NOT attested.proleakproof
        AND attested.proisstrict = (
          attested.signature = 'public.normalize_email_canonical(text)'
        )
        AND attested.proparallel = CASE
          WHEN attested.signature = 'public.normalize_email_canonical(text)'
            THEN 's'::"char" ELSE 'u'::"char" END
        AND attested.pronargdefaults = attested.argument_defaults
        AND attested.actual_language_name = attested.language_name
        AND pg_catalog.pg_get_function_arguments(attested.oid) =
              attested.exact_arguments
        AND pg_catalog.pg_get_userbyid(attested.proowner) = 'postgres'
        AND attested.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.md5(pg_catalog.replace(
              attested.prosrc, E'\r\n', E'\n'
            )) = attested.source_hash
        AND (
          SELECT pg_catalog.count(*) = 1
          FROM pg_catalog.pg_proc AS overload
          WHERE overload.pronamespace = attested.pronamespace
            AND overload.proname = attested.proname
        )
        AND pg_catalog.has_function_privilege(
              'service_role', attested.oid, 'EXECUTE'
            ) = attested.service_execute
        AND (
          SELECT pg_catalog.count(*) =
            CASE WHEN attested.service_execute THEN 2 ELSE 1 END
          FROM pg_catalog.aclexplode(COALESCE(
            attested.proacl,
            pg_catalog.acldefault('f', attested.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type = 'EXECUTE'
            AND privilege.grantor = attested.proowner
            AND NOT privilege.is_grantable
            AND (
              privilege.grantee = attested.proowner
              OR (attested.service_execute
                AND grantee.rolname = 'service_role')
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            attested.proacl,
            pg_catalog.acldefault('f', attested.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantor <> attested.proowner
             OR privilege.is_grantable
             OR privilege.grantee = 0
             OR (
               privilege.grantee <> attested.proowner
               AND grantee.rolname IS DISTINCT FROM 'service_role'
             )
             OR (
               grantee.rolname = 'service_role'
               AND NOT attested.service_execute
             )
        )
      ), false)
    FROM attested
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_function_contract_drift';
  END IF;

  -- The link table is a private, forced-RLS ledger. SQL157 must not be used to
  -- repair or silently inherit any weakened relation/column grants.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE relation.oid =
      'public.teskeid_event_expense_links'::pg_catalog.regclass
      AND namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
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
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND attribute.attacl IS NOT NULL
      )
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
            THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE privilege.grantee = relation.relowner
          AND privilege.grantor = relation.relowner
          AND NOT privilege.is_grantable
          AND privilege.privilege_type IN (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
            'REFERENCES', 'TRIGGER', 'MAINTAIN'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE privilege.grantee <> relation.relowner
           OR privilege.grantor <> relation.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
             'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_relation_security_drift';
  END IF;

  -- New V2 receipts contain Event/Expense IDs and publication state. The
  -- existing receipt ledger must remain just as private and immutable as the
  -- link ledger before SQL157 is allowed to add new operation shapes.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE relation.oid =
      'public.teskeid_event_mutation_requests'::pg_catalog.regclass
      AND namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
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
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
            THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE privilege.grantee = relation.relowner
          AND privilege.grantor = relation.relowner
          AND NOT privilege.is_grantable
          AND privilege.privilege_type IN (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
            'REFERENCES', 'TRIGGER', 'MAINTAIN'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE privilege.grantee <> relation.relowner
           OR privilege.grantor <> relation.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
             'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
      )
  )
     OR (
       SELECT pg_catalog.array_agg(
         attribute.attname::text ORDER BY attribute.attnum
       )
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid =
         'public.teskeid_event_mutation_requests'::pg_catalog.regclass
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     ) <> ARRAY[
       'actor_user_id', 'request_id', 'operation', 'fingerprint', 'result',
       'created_at', 'completed_at'
     ]::text[]
     OR NOT (
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
         ON attribute.attrelid =
           'public.teskeid_event_mutation_requests'::pg_catalog.regclass
        AND attribute.attname = expected.column_name
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
       LEFT JOIN pg_catalog.pg_attrdef AS default_row
         ON default_row.adrelid = attribute.attrelid
        AND default_row.adnum = attribute.attnum
     )
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_constraint AS constraint_row
         WHERE constraint_row.conrelid =
           'public.teskeid_event_mutation_requests'::pg_catalog.regclass
           AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')) <> 5
     OR NOT (
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
           AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(
               pg_catalog.pg_get_constraintdef(constraint_row.oid),
               '::[a-z0-9_]+(\[\])?', '', 'g'
             ), '[[:space:]()''"]', '', 'g'
           ), 'public.', '')) = expected.exact_definition
         ), false)
       FROM expected
       LEFT JOIN pg_catalog.pg_constraint AS constraint_row
         ON constraint_row.conrelid =
           'public.teskeid_event_mutation_requests'::pg_catalog.regclass
        AND constraint_row.conname = expected.constraint_name
     )
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_trigger AS trigger_row
         WHERE trigger_row.tgrelid =
           'public.teskeid_event_mutation_requests'::pg_catalog.regclass
           AND NOT trigger_row.tgisinternal) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid =
         'public.teskeid_event_mutation_requests'::pg_catalog.regclass
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
         AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
           pg_catalog.regexp_replace(pg_catalog.regexp_replace(
             pg_catalog.pg_get_triggerdef(trigger_row.oid),
             '::[a-z0-9_]+(\[\])?', '', 'g'
           ), '[[:space:]()''"]', '', 'g'), 'public.', ''
         ))) = '848754f56bd8a534919b139b3f0cc458'
         AND NOT trigger_row.tgisinternal
     ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_receipt_contract_drift';
  END IF;

  IF NOT (
    WITH expected(
      column_name, ordinal_position, type_name, is_not_null, default_expr
    ) AS (VALUES
      ('event_id', 1, 'uuid', true, NULL::text),
      ('group_id', 2, 'uuid', true, NULL::text),
      ('expense_id', 3, 'uuid', true, NULL::text),
      ('linked_by_user_id', 4, 'uuid', false, NULL::text),
      ('link_revision', 5, 'bigint', true, '1'),
      ('linked_at', 6, 'timestamp with time zone', true, 'now()')
    )
    SELECT pg_catalog.count(attribute.attnum) = 6
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
      ON attribute.attrelid =
           'public.teskeid_event_expense_links'::pg_catalog.regclass
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute.attrelid
     AND default_row.adnum = attribute.attnum
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_column_drift';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        'public.teskeid_event_expense_links'::pg_catalog.regclass
        AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')) <> 6
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname = 'teskeid_event_expense_links_pkey'
         AND constraint_row.contype = 'p'
         AND constraint_row.convalidated
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.conkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['event_id', 'expense_id']::text[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname = 'teskeid_event_expense_links_scope_key'
         AND constraint_row.contype = 'u'
         AND constraint_row.convalidated
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.conkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['event_id', 'group_id', 'expense_id']::text[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname = 'teskeid_event_expense_links_event_fk'
         AND constraint_row.contype = 'f'
         AND constraint_row.convalidated
         AND constraint_row.confrelid = 'public.teskeid_events'::pg_catalog.regclass
         AND constraint_row.confdeltype = 'c'
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.conkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['event_id']::text[]
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.confkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.confrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['id']::text[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname = 'teskeid_event_expense_links_expense_fk'
         AND constraint_row.contype = 'f'
         AND constraint_row.convalidated
         AND constraint_row.confrelid = 'public.expenses'::pg_catalog.regclass
         AND constraint_row.confdeltype = 'r'
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.conkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['group_id', 'expense_id']::text[]
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.confkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.confrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['group_id', 'id']::text[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname = 'teskeid_event_expense_links_actor_fk'
         AND constraint_row.contype = 'f'
         AND constraint_row.convalidated
         AND constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
         AND constraint_row.confdeltype = 'n'
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.conkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['linked_by_user_id']::text[]
         AND ARRAY(
           SELECT attribute.attname::text
           FROM pg_catalog.unnest(constraint_row.confkey)
             WITH ORDINALITY AS key_column(attnum, ordinal)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = constraint_row.confrelid
            AND attribute.attnum = key_column.attnum
           ORDER BY key_column.ordinal
         ) = ARRAY['id']::text[]
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND constraint_row.conname =
           'teskeid_event_expense_links_revision_check'
         AND constraint_row.contype = 'c'
         AND constraint_row.convalidated
         AND pg_catalog.regexp_replace(pg_catalog.lower(
           pg_catalog.pg_get_constraintdef(constraint_row.oid)
         ), '[[:space:]()]', '', 'g') = 'checklink_revision=1'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_constraint_drift';
  END IF;

  IF NOT EXISTS (
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
  )
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_index AS index_row
         WHERE index_row.indrelid =
           'public.teskeid_event_expense_links'::pg_catalog.regclass
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conindid = index_row.indexrelid
           )) <> 1 THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_index_drift';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
        'public.teskeid_event_expense_links'::pg_catalog.regclass
        AND NOT trigger_row.tgisinternal) <> 2
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       JOIN pg_catalog.pg_proc AS function_row
         ON function_row.oid = trigger_row.tgfoid
       JOIN pg_catalog.pg_namespace AS function_namespace
         ON function_namespace.oid = function_row.pronamespace
       JOIN pg_catalog.pg_constraint AS trigger_constraint
         ON trigger_constraint.oid = trigger_row.tgconstraint
       WHERE trigger_row.tgrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND trigger_row.tgname =
           'teskeid_event_expense_links_integrity_deferred'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgtype = 21
         AND trigger_row.tgenabled = 'O'
         AND function_namespace.nspname = 'public'
         AND function_row.proname =
           'teskeid_event_expense_link_integrity_trigger'
         AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = ''
         AND trigger_constraint.contype = 't'
         AND trigger_constraint.condeferrable
         AND trigger_constraint.condeferred
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       JOIN pg_catalog.pg_proc AS function_row
         ON function_row.oid = trigger_row.tgfoid
       JOIN pg_catalog.pg_namespace AS function_namespace
         ON function_namespace.oid = function_row.pronamespace
       WHERE trigger_row.tgrelid =
         'public.teskeid_event_expense_links'::pg_catalog.regclass
         AND trigger_row.tgname =
           'teskeid_event_expense_links_immutable_guard'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgtype = 19
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgconstraint = 0
         AND function_namespace.nspname = 'public'
         AND function_row.proname = 'teskeid_event_immutable_history'
         AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = ''
     ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_trigger_drift';
  END IF;

  IF (
    SELECT COALESCE(pg_catalog.array_agg(
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
  ) <> ARRAY[
    'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
    'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
    'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
  ]::text[]
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS function_row
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = function_row.pronamespace
       WHERE namespace.nspname = 'public'
         AND function_row.prokind = 'f'
         AND function_row.prosrc ~*
           'update[[:space:]]+public[.]teskeid_event_expense_links'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_writer_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    LEFT JOIN public.expense_groups AS group_row ON group_row.id = link.group_id
    LEFT JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    WHERE link.link_revision <> 1
       OR group_row.id IS NULL
       OR group_row.kind <> 'one_off'
       OR expense.id IS NULL
       OR (SELECT pg_catalog.count(*)
           FROM public.expenses AS group_expense
           WHERE group_expense.group_id = link.group_id) <> 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql157_link_revision_drift';
  END IF;
END;
$preflight$;

-- Freeze the two relations SQL157 itself snapshots/mutates. The protected
-- Expense digest below is a read-only tripwire; rollout still requires the
-- write-quiescence gate documented in the validation README.
LOCK TABLE public.teskeid_event_expense_links IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_mutation_requests IN SHARE MODE;

-- Recovery stores only pinned predecessor function bodies and install metadata.
-- It is private operational metadata, never an application visibility sidecar.
CREATE TABLE public.teskeid_event_sql157_install_baseline (
  singleton                    boolean PRIMARY KEY DEFAULT true,
  owner_create_source          text NOT NULL,
  attendee_create_source       text NOT NULL,
  wrapper_create_source        text NOT NULL,
  installed_link_count         bigint NOT NULL,
  installed_link_digest        text NOT NULL,
  installed_request_count      bigint NOT NULL,
  installed_request_digest     text NOT NULL,
  installed_protected_digest   text NOT NULL,
  activity_v1_hash             text NOT NULL,
  management_v1_hash           text NOT NULL,
  attach_v1_hash               text NOT NULL,
  installed_at                 timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT teskeid_event_sql157_baseline_singleton CHECK (singleton),
  CONSTRAINT teskeid_event_sql157_baseline_digest_check CHECK (
    installed_link_digest ~ '^[0-9a-f]{32}$'
    AND installed_request_digest ~ '^[0-9a-f]{32}$'
    AND installed_protected_digest ~ '^[0-9a-f]{32}$'
    AND activity_v1_hash ~ '^[0-9a-f]{32}$'
    AND management_v1_hash ~ '^[0-9a-f]{32}$'
    AND attach_v1_hash ~ '^[0-9a-f]{32}$'
  )
);
ALTER TABLE public.teskeid_event_sql157_install_baseline
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_sql157_install_baseline
  FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teskeid_event_sql157_install_baseline
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.teskeid_event_sql157_install_baseline (
  singleton, owner_create_source, attendee_create_source,
  wrapper_create_source,
  installed_link_count, installed_link_digest,
  installed_request_count, installed_request_digest,
  installed_protected_digest,
  activity_v1_hash, management_v1_hash, attach_v1_hash
)
SELECT true,
  (SELECT function_row.prosrc
   FROM pg_catalog.pg_proc AS function_row
   WHERE function_row.oid = pg_catalog.to_regprocedure(
     'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'
   )),
  (SELECT function_row.prosrc
   FROM pg_catalog.pg_proc AS function_row
   WHERE function_row.oid = pg_catalog.to_regprocedure(
     'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
   )),
  (SELECT function_row.prosrc
   FROM pg_catalog.pg_proc AS function_row
   WHERE function_row.oid = pg_catalog.to_regprocedure(
     'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
   )),
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_expense_links),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
     pg_catalog.jsonb_build_array(
       link.event_id, link.group_id, link.expense_id, link.linked_by_user_id,
       link.link_revision, link.linked_at
     ) ORDER BY link.event_id, link.expense_id
   ), '[]'::jsonb)::text)
   FROM public.teskeid_event_expense_links AS link),
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_mutation_requests),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
     pg_catalog.to_jsonb(request_row)
     ORDER BY request_row.actor_user_id, request_row.request_id
   ), '[]'::jsonb)::text)
   FROM public.teskeid_event_mutation_requests AS request_row),
  pg_catalog.md5(pg_catalog.jsonb_build_object(
    'groups', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(group_row) ORDER BY group_row.id
    ), '[]'::jsonb)
      FROM public.expense_groups AS group_row
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = group_row.id
      )),
    'members', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(member_row) ORDER BY member_row.group_id, member_row.id
    ), '[]'::jsonb)
      FROM public.expense_group_members AS member_row
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = member_row.group_id
      )),
    'expenses', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(expense) ORDER BY expense.group_id, expense.id
    ), '[]'::jsonb)
      FROM public.expenses AS expense
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = expense.group_id
      )),
    'payments', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(payment)
      ORDER BY payment.group_id, payment.expense_id, payment.member_id
    ), '[]'::jsonb)
      FROM public.expense_payments AS payment
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = payment.group_id
      )),
    'shares', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(share_row)
      ORDER BY share_row.group_id, share_row.expense_id, share_row.member_id
    ), '[]'::jsonb)
      FROM public.expense_shares AS share_row
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = share_row.group_id
      )),
    'obligations', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(obligation) ORDER BY obligation.group_id, obligation.id
    ), '[]'::jsonb)
      FROM public.expense_obligations AS obligation
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = obligation.group_id
      )),
    'repayments', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(repayment) ORDER BY repayment.group_id, repayment.id
    ), '[]'::jsonb)
      FROM public.expense_repayments AS repayment
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = repayment.group_id
      )),
    'repayment_allocations', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(allocation)
      ORDER BY allocation.group_id, allocation.repayment_id,
        allocation.obligation_id
    ), '[]'::jsonb)
      FROM public.expense_repayment_allocations AS allocation
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = allocation.group_id
      )),
    'activity', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(activity)
      ORDER BY activity.group_id, activity.sequence_no, activity.id
    ), '[]'::jsonb)
      FROM public.expense_activity AS activity
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = activity.group_id
      )),
    'revisions', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(revision)
      ORDER BY revision.group_id, revision.sequence_no, revision.id
    ), '[]'::jsonb)
      FROM public.expense_revisions AS revision
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = revision.group_id
      )),
    'identity_bindings', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(binding)
      ORDER BY binding.group_id, binding.member_id, binding.id
    ), '[]'::jsonb)
      FROM public.expense_member_identity_bindings AS binding
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = binding.group_id
      )),
    'claim_disputes', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(dispute)
      ORDER BY dispute.group_id, dispute.expense_id, dispute.member_id, dispute.id
    ), '[]'::jsonb)
      FROM public.expense_claim_disputes AS dispute
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = dispute.group_id
      )),
    'participant_sources', (SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(source_row)
      ORDER BY source_row.group_id, source_row.expense_id,
        source_row.event_guest_id, source_row.expense_member_id
    ), '[]'::jsonb)
      FROM public.teskeid_event_expense_participant_sources AS source_row
      WHERE EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.group_id = source_row.group_id
      ))
  )::text),
  pg_catalog.md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity(uuid,uuid)'
  ))),
  pg_catalog.md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_link_management(uuid,uuid)'
  ))),
  pg_catalog.md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
    'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
  )));

ALTER TABLE public.teskeid_event_expense_links
  ADD COLUMN visibility text NOT NULL DEFAULT 'participants_only',
  DROP CONSTRAINT teskeid_event_expense_links_revision_check,
  ADD CONSTRAINT teskeid_event_expense_links_visibility_check
    CHECK (visibility IN ('participants_only', 'all_event')),
  ADD CONSTRAINT teskeid_event_expense_links_revision_check
    CHECK (link_revision >= 1);

CREATE FUNCTION public.teskeid_event_guard_expense_link_visibility_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.link_revision = 9223372036854775807 THEN
    RAISE EXCEPTION 'teskeid_event_link_revision_exhausted';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.expense_id IS DISTINCT FROM OLD.expense_id
     OR NEW.linked_by_user_id IS DISTINCT FROM OLD.linked_by_user_id
     OR NEW.linked_at IS DISTINCT FROM OLD.linked_at
     OR NEW.visibility IS NOT DISTINCT FROM OLD.visibility
     OR NEW.visibility NOT IN ('participants_only', 'all_event')
     OR NEW.link_revision IS DISTINCT FROM OLD.link_revision + 1 THEN
    RAISE EXCEPTION 'teskeid_event_history_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER teskeid_event_expense_links_immutable_guard
  ON public.teskeid_event_expense_links;
CREATE TRIGGER teskeid_event_expense_links_immutable_guard
  BEFORE UPDATE ON public.teskeid_event_expense_links
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_guard_expense_link_visibility_update();

-- Preserve both V1 create entry points and their response bytes. The optional
-- payload key participates in each existing request fingerprint; omitted means
-- participants_only.
CREATE OR REPLACE FUNCTION public.teskeid_event_create_tagged_expense(
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
  v_linked_recipient_email text;
  v_linked_user_ids uuid[] := ARRAY[]::uuid[];
  v_guest_link_probe jsonb := '[]'::jsonb;
  v_relationship_probe jsonb := '[]'::jsonb;
  v_serialization_email_snapshot jsonb := '{}'::jsonb;
  v_locked_serialization_email_snapshot jsonb := '{}'::jsonb;
  v_prelinked_email_snapshot jsonb := '{}'::jsonb;
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_recipient_emails text[] := ARRAY[]::text[];
  v_recipient_email text;
  v_authoritative_display_name text;
  v_mapping_found boolean;
  v_resolved_members jsonb := '[]'::jsonb;
  v_event_invitations jsonb := '[]'::jsonb;
  v_all_invitations jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_canonical_result jsonb;
  v_result jsonb;
  v_replay_group public.expense_groups%ROWTYPE;
  v_replay_expense public.expenses%ROWTYPE;
  v_replay_link public.teskeid_event_expense_links%ROWTYPE;
  v_replay_role text;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR (p_payload - ARRAY[
       'title', 'total_minor', 'currency', 'incurred_on', 'category', 'note',
       'split_method', 'one_off_members', 'payments', 'shares', 'obligations',
       'participant_invitations', 'event_guest_members', 'event_visibility'
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
     OR (
       p_payload ? 'event_visibility'
       AND (
         pg_catalog.jsonb_typeof(p_payload->'event_visibility') <> 'string'
         OR p_payload->>'event_visibility'
              NOT IN ('participants_only', 'all_event')
       )
     )
     OR pg_catalog.jsonb_typeof(p_payload->'one_off_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'one_off_members')
          NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'payments') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'payments') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'shares') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'shares') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'obligations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'obligations') > 50
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
    BEGIN
      IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
         OR (v_replay->>'group_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR (v_replay->>'expense_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
      END IF;
      v_group_id := (v_replay->>'group_id')::uuid;
      v_expense_id := (v_replay->>'expense_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
    END;

    -- A lost-response replay is byte-stable, but historical creator/linker
    -- identity is never authority. Follow the mutation lock order and re-prove
    -- the exact current Expense, Event and link before returning the receipt.
    SELECT group_row.* INTO v_replay_group
    FROM public.expense_groups AS group_row
    WHERE group_row.id = v_group_id
    FOR UPDATE;
    SELECT expense.* INTO v_replay_expense
    FROM public.expenses AS expense
    WHERE expense.id = v_expense_id
      AND expense.group_id = v_group_id
    FOR UPDATE;
    SELECT event_row.* INTO v_event
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
    FOR UPDATE;
    SELECT link.* INTO v_replay_link
    FROM public.teskeid_event_expense_links AS link
    WHERE link.expense_id = v_expense_id
    FOR UPDATE;
    v_replay_role := public.expense_active_member_role(
      p_actor_id, v_group_id
    );
    IF v_replay_group.id IS NULL
       OR v_replay_group.kind <> 'one_off'
       OR v_replay_group.status = 'closed'
       OR v_replay_expense.id IS NULL
       OR v_replay_expense.status <> 'active'
       OR (
         v_replay_expense.created_by IS DISTINCT FROM p_actor_id
         AND COALESCE(v_replay_role, '') NOT IN ('owner', 'admin')
       )
       OR (SELECT pg_catalog.count(*)
           FROM public.expenses AS group_expense
           WHERE group_expense.group_id = v_group_id) <> 1
       OR v_event.id IS NULL
       OR v_event.owner_user_id <> p_actor_id
       OR v_replay_link.event_id IS NULL
       OR v_replay_link.event_id <> p_event_id
       OR v_replay_link.group_id <> v_group_id THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    PERFORM public.teskeid_event_assert_expense_link(
      p_event_id, v_group_id, v_expense_id
    );
    RETURN v_replay;
  END IF;

  -- Probe every mapped guest without a row lock, then lock all currently
  -- linked recipient identities in UUID order before the Event. The exact
  -- guest/link set is revalidated after the canonical Event -> guest locks.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'event_guest_id', guest.id,
    'linked_user_id', guest.linked_user_id,
    'source_kind', guest.source_kind,
    'email_canonical', guest.email_canonical
  ) ORDER BY guest.id), '[]'::jsonb)
  INTO v_guest_link_probe
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
   AND guest.status = 'active'
  JOIN pg_catalog.jsonb_array_elements(
    p_payload->'event_guest_members'
  ) AS mapping(value)
    ON guest.id = (mapping.value->>'event_guest_id')::uuid
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id;
  IF pg_catalog.jsonb_array_length(v_guest_link_probe)
       <> pg_catalog.jsonb_array_length(
            p_payload->'event_guest_members'
          ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relationship_id', relationship.id,
    'linked_user_id', relationship.counterpart_user_id
  ) ORDER BY relationship.id), '[]'::jsonb)
  INTO v_relationship_probe
  FROM pg_catalog.jsonb_array_elements(
    p_payload->'participant_invitations'
  ) AS invitation(value)
  JOIN public.relationships AS relationship
    ON relationship.id = (invitation.value->>'relationship_id')::uuid
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id IS NOT NULL
   AND relationship.counterpart_user_id <> p_actor_id
  WHERE invitation.value ? 'relationship_id';
  IF pg_catalog.jsonb_array_length(v_relationship_probe) <> (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'participant_invitations'
    ) AS invitation(value)
    WHERE invitation.value ? 'relationship_id'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT linked_recipient.user_id ORDER BY linked_recipient.user_id
  ), ARRAY[]::uuid[])
  INTO v_linked_user_ids
  FROM (
    SELECT (probe.value->>'linked_user_id')::uuid AS user_id
    FROM pg_catalog.jsonb_array_elements(v_guest_link_probe) AS probe(value)
    WHERE probe.value->>'linked_user_id' IS NOT NULL
    UNION ALL
    SELECT (probe.value->>'linked_user_id')::uuid AS user_id
    FROM pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
  ) AS linked_recipient;

  -- Probe confirmed linked-account emails without locks only to derive the
  -- canonical 9702 set. The private helper later acquires sorted 9602 + auth
  -- FOR SHARE and the exact snapshot must match or the transaction aborts.
  SELECT COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    public.normalize_email_canonical(account.email)
    ORDER BY account.id
  ), '{}'::jsonb), COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    CASE WHEN account.email_confirmed_at IS NOT NULL
      THEN public.normalize_email_canonical(account.email) ELSE NULL END
    ORDER BY account.id
  ), '{}'::jsonb)
  INTO v_serialization_email_snapshot, v_prelinked_email_snapshot
  FROM auth.users AS account
  WHERE account.id = ANY(v_linked_user_ids);

  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT recipient.email ORDER BY recipient.email
  ), ARRAY[]::text[])
  INTO v_recipient_emails
  FROM (
    SELECT public.normalize_email_canonical(
      invitation.value->>'recipient_email'
    ) AS email
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'participant_invitations'
    ) AS invitation(value)
    WHERE invitation.value ? 'recipient_email'
    UNION ALL
    SELECT probe.value->>'email_canonical' AS email
    FROM pg_catalog.jsonb_array_elements(v_guest_link_probe) AS probe(value)
    WHERE probe.value->>'source_kind' = 'manual_email'
      AND probe.value->>'linked_user_id' IS NULL
    UNION ALL
    SELECT linked_email.value AS email
    FROM pg_catalog.jsonb_each_text(v_serialization_email_snapshot)
      AS linked_email(key, value)
  ) AS recipient
  WHERE recipient.email IS NOT NULL;
  FOREACH v_recipient_email IN ARRAY v_recipient_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email, 9702)
    );
  END LOOP;

  -- SQL110 takes 11002 before any Expense group lock. Pre-acquire the same
  -- sorted recipient set before 9602/auth so a mixed payload cannot hold a
  -- relationship identity lock while waiting on a raw-email invitation lock.
  FOREACH v_recipient_email IN ARRAY v_recipient_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email, 11002)
    );
  END LOOP;

  v_linked_email_snapshot :=
    public.teskeid_event_attendance_lock_user_emails(v_linked_user_ids);
  IF v_linked_email_snapshot IS DISTINCT FROM v_prelinked_email_snapshot THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    public.normalize_email_canonical(account.email)
    ORDER BY account.id
  ), '{}'::jsonb)
  INTO v_locked_serialization_email_snapshot
  FROM auth.users AS account
  WHERE account.id = ANY(v_linked_user_ids);
  IF v_locked_serialization_email_snapshot IS DISTINCT FROM
       v_serialization_email_snapshot THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  PERFORM relationship.id
  FROM public.relationships AS relationship
  JOIN pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
    ON relationship.id = (probe.value->>'relationship_id')::uuid
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id =
     (probe.value->>'linked_user_id')::uuid
  ORDER BY relationship.id
  FOR SHARE OF relationship;
  IF NOT FOUND AND pg_catalog.jsonb_array_length(v_relationship_probe) > 0 THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.relationships AS relationship
    JOIN pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
      ON relationship.id = (probe.value->>'relationship_id')::uuid
     AND relationship.owner_id = p_actor_id
     AND relationship.counterpart_user_id =
       (probe.value->>'linked_user_id')::uuid
  ) <> pg_catalog.jsonb_array_length(v_relationship_probe) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
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

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'event_guest_members'
    ) AS mapping(value)
    JOIN public.teskeid_event_guests AS current_guest
      ON current_guest.event_id = p_event_id
     AND current_guest.id = (mapping.value->>'event_guest_id')::uuid
    LEFT JOIN pg_catalog.jsonb_array_elements(v_guest_link_probe)
      AS probe(value)
      ON probe.value->>'event_guest_id' = current_guest.id::text
    WHERE current_guest.status <> 'active'
       OR probe.value IS NULL
       OR current_guest.linked_user_id IS DISTINCT FROM
          (probe.value->>'linked_user_id')::uuid
       OR current_guest.source_kind IS DISTINCT FROM
          probe.value->>'source_kind'
       OR current_guest.email_canonical IS DISTINCT FROM
          NULLIF(probe.value->>'email_canonical', '')
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

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

      IF v_guest.linked_user_id IS NOT NULL
         AND v_guest.source_kind IN ('manual_name', 'manual_email') THEN
        -- Event identity consent is not Expense consent. Keep the financial
        -- member one-off/user_id NULL, but invite the currently confirmed
        -- canonical account email through the normal Expense flow.
        v_linked_recipient_email := v_linked_email_snapshot
          ->> v_guest.linked_user_id::text;
        IF v_linked_recipient_email IS NULL THEN
          RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
        END IF;
        v_event_invitations := v_event_invitations
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'member_id', v_member_id,
            'recipient_email', v_linked_recipient_email
          ));
      ELSIF v_guest.source_kind = 'manual_email' THEN
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
    v_linked_recipient_email := NULL;
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
    event_id, group_id, expense_id, linked_by_user_id, visibility
  ) VALUES (
    p_event_id, v_group_id, v_expense_id, p_actor_id,
    COALESCE(p_payload->>'event_visibility', 'participants_only')
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

CREATE OR REPLACE FUNCTION public.teskeid_event_create_tagged_expense_for_actor(
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
  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_member jsonb;
  v_member_id uuid;
  v_guest_id uuid;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_mapping_found boolean;
  v_members jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_expense_id uuid;
  v_inner_request_id uuid;
  v_group_id uuid;
  v_created jsonb;
  v_result jsonb;
  v_replay_group public.expense_groups%ROWTYPE;
  v_replay_expense public.expenses%ROWTYPE;
  v_replay_link public.teskeid_event_expense_links%ROWTYPE;
  v_replay_role text;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF EXISTS (
    SELECT 1 FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id AND event_row.owner_user_id = p_actor_id
  ) THEN
    RETURN public.teskeid_event_create_tagged_expense(
      p_actor_id, p_request_id, p_event_id, p_expected_roster_revision, p_payload
    );
  END IF;
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_expected_roster_revision < 1
     OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR (
       p_payload ? 'event_visibility'
       AND (
         pg_catalog.jsonb_typeof(p_payload->'event_visibility') <> 'string'
         OR p_payload->>'event_visibility'
              NOT IN ('participants_only', 'all_event')
       )
     )
     OR NOT (p_payload ?& ARRAY[
       'title','total_minor','currency','incurred_on','category','note',
       'split_method','one_off_members','payments','shares','obligations',
       'participant_invitations','event_guest_members'
     ]::text[])
     OR pg_catalog.jsonb_typeof(p_payload->'one_off_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'one_off_members') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'payments') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'shares') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'obligations') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'participant_invitations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'participant_invitations') <> 0
     OR pg_catalog.jsonb_typeof(p_payload->'event_guest_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'event_guest_members') > 48 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id, 'expectedRosterRevision', p_expected_roster_revision,
    'payload', p_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_tagged_expense_for_actor', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN
    BEGIN
      IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
         OR (v_replay->>'group_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR (v_replay->>'expense_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
      END IF;
      v_group_id := (v_replay->>'group_id')::uuid;
      v_expense_id := (v_replay->>'expense_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
    END;

    SELECT group_row.* INTO v_replay_group
    FROM public.expense_groups AS group_row
    WHERE group_row.id = v_group_id
    FOR UPDATE;
    SELECT expense.* INTO v_replay_expense
    FROM public.expenses AS expense
    WHERE expense.id = v_expense_id
      AND expense.group_id = v_group_id
    FOR UPDATE;
    SELECT event_row.* INTO v_event
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
    FOR UPDATE;
    SELECT membership.* INTO v_membership
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_event_guests AS self_guest
      ON self_guest.event_id = membership.event_id
     AND self_guest.id = membership.event_guest_id
     AND self_guest.status = 'active'
     AND self_guest.linked_user_id = membership.user_id
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = membership.accepted_invitation_id
     AND invitation.event_id = membership.event_id
     AND invitation.event_guest_id = membership.event_guest_id
     AND invitation.accepted_user_id = membership.user_id
     AND invitation.status = 'accepted'
    WHERE membership.event_id = p_event_id
      AND membership.user_id = p_actor_id
    FOR SHARE OF membership, self_guest, invitation;
    SELECT link.* INTO v_replay_link
    FROM public.teskeid_event_expense_links AS link
    WHERE link.expense_id = v_expense_id
    FOR UPDATE;
    v_replay_role := public.expense_active_member_role(
      p_actor_id, v_group_id
    );
    IF v_replay_group.id IS NULL
       OR v_replay_group.kind <> 'one_off'
       OR v_replay_group.status = 'closed'
       OR v_replay_expense.id IS NULL
       OR v_replay_expense.status <> 'active'
       OR (
         v_replay_expense.created_by IS DISTINCT FROM p_actor_id
         AND COALESCE(v_replay_role, '') NOT IN ('owner', 'admin')
       )
       OR (SELECT pg_catalog.count(*)
           FROM public.expenses AS group_expense
           WHERE group_expense.group_id = v_group_id) <> 1
       OR v_event.id IS NULL
       OR v_event.owner_user_id = p_actor_id
       OR v_membership.event_id IS NULL
       OR v_replay_link.event_id IS NULL
       OR v_replay_link.event_id <> p_event_id
       OR v_replay_link.group_id <> v_group_id THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    PERFORM public.teskeid_event_assert_expense_link(
      p_event_id, v_group_id, v_expense_id
    );
    RETURN v_replay;
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF v_event.id IS NULL OR v_event.owner_user_id = p_actor_id THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_event_guests AS self_guest
    ON self_guest.event_id = membership.event_id
   AND self_guest.id = membership.event_guest_id
   AND self_guest.status = 'active'
   AND self_guest.linked_user_id = membership.user_id
  WHERE membership.event_id = p_event_id AND membership.user_id = p_actor_id;
  IF v_membership.event_id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  PERFORM guest.id FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id AND guest.status = 'active'
  ORDER BY guest.id FOR SHARE;
  PERFORM invitation.id FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = v_membership.accepted_invitation_id
    AND invitation.event_id = p_event_id
    AND invitation.accepted_user_id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM membership.event_id
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.user_id = p_actor_id
    AND membership.event_guest_id = v_membership.event_guest_id
    AND membership.accepted_invitation_id = v_membership.accepted_invitation_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  FOR v_member IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
      WITH ORDINALITY AS item(value, ordinal) ORDER BY item.ordinal
  LOOP
    BEGIN v_member_id := (v_member->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END;
    SELECT (mapping.value->>'event_guest_id')::uuid, true
    INTO v_guest_id, v_mapping_found
    FROM pg_catalog.jsonb_array_elements(p_payload->'event_guest_members') AS mapping(value)
    WHERE mapping.value->>'member_id' = v_member_id::text;
    IF COALESCE(v_mapping_found, false) THEN
      SELECT guest.* INTO v_guest FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = p_event_id AND guest.id = v_guest_id
        AND guest.status = 'active'
        AND guest.id <> v_membership.event_guest_id;
      IF v_guest.id IS NULL THEN RAISE EXCEPTION 'teskeid_event_roster_conflict'; END IF;
      v_members := v_members || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_member_id, 'user_id', NULL,
          'display_name', COALESCE(public.teskeid_event_attendance_safe_guest_label(
            v_guest.source_kind, v_guest.display_name_snapshot, v_guest.linked_user_id
          ), 'Gestur'),
          'role', 'member', 'status', 'active'
        )
      );
      v_sources := v_sources || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('event_guest_id', v_guest_id, 'member_id', v_member_id)
      );
    ELSE
      v_members := v_members || pg_catalog.jsonb_build_array(v_member);
    END IF;
    v_guest := NULL; v_guest_id := NULL; v_mapping_found := false;
  END LOOP;
  IF pg_catalog.jsonb_array_length(v_sources)
       <> pg_catalog.jsonb_array_length(p_payload->'event_guest_members') THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  v_expense_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense-inner-request:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_created := public.expense_create_expense_with_participants(
    p_actor_id, v_inner_request_id, v_expense_id, NULL,
    p_payload->>'title', (p_payload->>'total_minor')::bigint,
    p_payload->>'currency', (p_payload->>'incurred_on')::date,
    p_payload->>'category', p_payload->>'note', p_payload->>'split_method',
    v_members, p_payload->'payments', p_payload->'shares',
    p_payload->'obligations', '[]'::jsonb
  );
  v_group_id := (v_created->>'group_id')::uuid;
  INSERT INTO public.teskeid_event_expense_links(
    event_id, group_id, expense_id, linked_by_user_id, visibility
  ) VALUES (
    p_event_id, v_group_id, v_expense_id, p_actor_id,
    COALESCE(p_payload->>'event_visibility', 'participants_only')
  );
  INSERT INTO public.teskeid_event_expense_participant_sources(
    event_id, group_id, expense_id, event_guest_id, expense_member_id
  ) SELECT p_event_id, v_group_id, v_expense_id,
      (source.value->>'event_guest_id')::uuid,
      (source.value->>'member_id')::uuid
    FROM pg_catalog.jsonb_array_elements(v_sources) AS source(value);
  PERFORM public.teskeid_event_assert_expense_link(p_event_id, v_group_id, v_expense_id);
  v_result := pg_catalog.jsonb_build_object(
    'group_id', v_group_id, 'expense_id', v_expense_id,
    'invitation_ids', '[]'::jsonb
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

-- Preserve the public SQL141 wrapper contract while ensuring its own
-- idempotency receipt cannot bypass current Event/Expense/link authority.
CREATE OR REPLACE FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_link_to_event boolean,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_result jsonb;
  v_group_id uuid;
  v_expense_id uuid;
  v_import_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_source record;
  v_mapping jsonb;
  v_owner_user_id uuid;
  v_owner_participant_id uuid;
  v_financial_version bigint;
  v_replay_group public.expense_groups%ROWTYPE;
  v_replay_expense public.expenses%ROWTYPE;
  v_replay_event public.teskeid_events%ROWTYPE;
  v_replay_link public.teskeid_event_expense_links%ROWTYPE;
  v_replay_role text;
  v_has_event_authority boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_expected_roster_revision < 1
     OR p_link_to_event IS NULL OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR (
       p_payload ? 'event_organizer_members'
       AND (
         pg_catalog.jsonb_typeof(p_payload->'event_organizer_members') <> 'array'
         OR pg_catalog.jsonb_array_length(p_payload->'event_organizer_members') > 1
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'linkToEvent', p_link_to_event,
    'payload', p_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_expense_from_event', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN
    BEGIN
      IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
         OR NOT (v_replay ?& ARRAY['group_id', 'expense_id']::text[])
         OR pg_catalog.jsonb_typeof(v_replay->'group_id') <> 'string'
         OR pg_catalog.jsonb_typeof(v_replay->'expense_id') <> 'string'
         OR (v_replay->>'group_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR (v_replay->>'expense_id')
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
      END IF;
      v_group_id := (v_replay->>'group_id')::uuid;
      v_expense_id := (v_replay->>'expense_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
    END;

    -- The wrapper owns a separate receipt from the inner create RPC. Re-prove
    -- its exact current authority directly so that this top-level replay cannot
    -- return before the inner mutation boundary is reached.
    SELECT group_row.* INTO v_replay_group
    FROM public.expense_groups AS group_row
    WHERE group_row.id = v_group_id
    FOR UPDATE;
    SELECT expense.* INTO v_replay_expense
    FROM public.expenses AS expense
    WHERE expense.id = v_expense_id
      AND expense.group_id = v_group_id
    FOR UPDATE;
    SELECT event_row.* INTO v_replay_event
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
    FOR UPDATE;

    v_has_event_authority :=
      v_replay_event.id IS NOT NULL
      AND v_replay_event.owner_user_id = p_actor_id;
    IF NOT v_has_event_authority THEN
      PERFORM membership.event_id
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS self_guest
        ON self_guest.event_id = membership.event_id
       AND self_guest.id = membership.event_guest_id
       AND self_guest.status = 'active'
       AND self_guest.linked_user_id = membership.user_id
      JOIN public.teskeid_event_guest_invitations AS invitation
        ON invitation.id = membership.accepted_invitation_id
       AND invitation.event_id = membership.event_id
       AND invitation.event_guest_id = membership.event_guest_id
       AND invitation.accepted_user_id = membership.user_id
       AND invitation.status = 'accepted'
      WHERE membership.event_id = p_event_id
        AND membership.user_id = p_actor_id
      FOR SHARE OF membership, self_guest, invitation;
      v_has_event_authority := FOUND;
    END IF;

    SELECT link.* INTO v_replay_link
    FROM public.teskeid_event_expense_links AS link
    WHERE link.expense_id = v_expense_id
    FOR UPDATE;
    v_replay_role := public.expense_active_member_role(
      p_actor_id, v_group_id
    );
    IF v_replay_group.id IS NULL
       OR v_replay_group.kind <> 'one_off'
       OR v_replay_group.status = 'closed'
       OR v_replay_expense.id IS NULL
       OR v_replay_expense.status <> 'active'
       OR (
         v_replay_expense.created_by IS DISTINCT FROM p_actor_id
         AND COALESCE(v_replay_role, '') NOT IN ('owner', 'admin')
       )
       OR (SELECT pg_catalog.count(*)
           FROM public.expenses AS group_expense
           WHERE group_expense.group_id = v_group_id) <> 1
       OR EXISTS (
         SELECT 1
         FROM public.teskeid_event_expense_participant_sources AS source
         WHERE source.event_id = p_event_id
           AND source.group_id = v_group_id
           AND source.expense_id = v_expense_id
       )
       OR NOT v_has_event_authority
       OR (
         p_link_to_event
         AND (
           v_replay_link.event_id IS NULL
           OR v_replay_link.event_id <> p_event_id
           OR v_replay_link.group_id <> v_group_id
         )
       )
       OR (
         NOT p_link_to_event
         AND v_replay_link.event_id IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    IF p_link_to_event THEN
      PERFORM public.teskeid_event_assert_expense_link(
        p_event_id, v_group_id, v_expense_id
      );
    END IF;
    RETURN v_replay;
  END IF;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-independent-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_result := public.teskeid_event_create_tagged_expense_for_actor(
    p_actor_id, v_inner_request_id, p_event_id,
    p_expected_roster_revision, p_payload - 'event_organizer_members'
  );
  v_group_id := (v_result->>'group_id')::uuid;
  v_expense_id := (v_result->>'expense_id')::uuid;

  FOR v_source IN
    SELECT source.expense_member_id, source.event_guest_id,
      guest.linked_user_id
    FROM public.teskeid_event_expense_participant_sources AS source
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = source.event_id
     AND guest.id = source.event_guest_id
     AND guest.status = 'active'
     AND guest.linked_user_id IS NOT NULL
    JOIN public.teskeid_event_attendance_memberships AS membership
      ON membership.event_id = guest.event_id
     AND membership.event_guest_id = guest.id
     AND membership.user_id = guest.linked_user_id
    JOIN public.teskeid_event_guest_invitations AS accepted_invitation
      ON accepted_invitation.id = membership.accepted_invitation_id
     AND accepted_invitation.event_id = membership.event_id
     AND accepted_invitation.event_guest_id = membership.event_guest_id
     AND accepted_invitation.accepted_user_id = membership.user_id
     AND accepted_invitation.status = 'accepted'
    WHERE source.event_id = p_event_id
      AND source.group_id = v_group_id
      AND source.expense_id = v_expense_id
    ORDER BY source.expense_member_id
  LOOP
    PERFORM public.expense_apply_identity_binding(
      p_actor_id, v_group_id, v_source.expense_member_id,
      v_source.linked_user_id, 'event_guest', NULL,
      p_event_id, v_source.event_guest_id, false
    );
    SELECT v_import_invitation_ids || COALESCE(
      pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
      ARRAY[]::uuid[]
    ) INTO v_import_invitation_ids
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.group_id = v_group_id
      AND invitation.member_id = v_source.expense_member_id
      AND invitation.status = 'pending';
  END LOOP;

  IF p_payload ? 'event_organizer_members' THEN
    SELECT event_row.owner_user_id INTO v_owner_user_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id;
    v_owner_participant_id := public.teskeid_event_uuid_from_text(
      'teskeid-event-owner-participant:' || p_event_id::text
    );
    FOR v_mapping IN
      SELECT value FROM pg_catalog.jsonb_array_elements(
        p_payload->'event_organizer_members'
      )
    LOOP
      IF pg_catalog.jsonb_typeof(v_mapping) <> 'object'
         OR (v_mapping - ARRAY['member_id','event_participant_id']::text[]) <> '{}'::jsonb
         OR (v_mapping->>'event_participant_id')::uuid <> v_owner_participant_id
         OR v_owner_user_id IS NULL OR v_owner_user_id = p_actor_id
         OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.jsonb_array_elements(
             p_payload->'one_off_members'
           ) AS member(value)
           WHERE member.value->>'id' = v_mapping->>'member_id'
         ) THEN
        RAISE EXCEPTION 'teskeid_event_roster_conflict';
      END IF;
      PERFORM public.expense_apply_identity_binding(
        p_actor_id, v_group_id, (v_mapping->>'member_id')::uuid,
        v_owner_user_id, 'event_organizer', NULL,
        p_event_id, v_owner_participant_id, false
      );
    END LOOP;
  END IF;

  DELETE FROM public.recent_events AS recent
  WHERE recent.source = 'expenses'
    AND recent.entity_type = 'expense_member_invitation'
    AND recent.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_activity AS activity
  WHERE activity.entity_type = 'expense_member_invitation'
    AND activity.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = ANY(v_import_invitation_ids);

  v_result := pg_catalog.jsonb_set(
    v_result, '{invitation_ids}', COALESCE((
      SELECT pg_catalog.jsonb_agg(candidate.value ORDER BY candidate.ordinal)
      FROM pg_catalog.jsonb_array_elements_text(
        COALESCE(v_result->'invitation_ids', '[]'::jsonb)
      ) WITH ORDINALITY AS candidate(value, ordinal)
      WHERE candidate.value::uuid <> ALL(v_import_invitation_ids)
    ), '[]'::jsonb), true
  );
  DELETE FROM public.teskeid_event_expense_participant_sources AS source
  WHERE source.event_id = p_event_id
    AND source.group_id = v_group_id
    AND source.expense_id = v_expense_id;
  IF NOT p_link_to_event THEN
    DELETE FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = p_event_id
      AND link.group_id = v_group_id
      AND link.expense_id = v_expense_id;
  END IF;
  SELECT group_row.financial_version INTO v_financial_version
  FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'financial_version', v_financial_version
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

-- Canonical Event-read visibility. SQL153 V3 is the only Event read-authority
-- decision here. It is deliberately not reused by any mutation below.
CREATE FUNCTION public.teskeid_event_get_expense_activity_v2(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_revalidated_scope jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  -- V3 remains the canonical session/claim authority. Because it is VOLATILE,
  -- call it before the read projection and then re-prove its exact returned
  -- owner/attendee evidence inside the projection snapshot below.
  v_scope := public.teskeid_event_private_scope_v3(
    p_actor_id, p_event_id
  );

  -- This entire projection is one data-producing SQL statement. Under READ
  -- COMMITTED the revalidated Event authority, visibility, summaries and actor
  -- positions therefore share one snapshot.
  WITH scope_evidence AS MATERIALIZED (
    SELECT v_scope AS value
    WHERE pg_catalog.jsonb_typeof(v_scope) = 'object'
      AND v_scope - ARRAY[
        'viewer_role', 'event_guest_id', 'identity_generation'
      ]::text[] = '{}'::jsonb
  ), scope AS MATERIALIZED (
    SELECT evidence.value
    FROM scope_evidence AS evidence
    WHERE (
      evidence.value->>'viewer_role' = 'owner'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'event_guest_id'
      ) = 'null'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'identity_generation'
      ) = 'null'
      AND EXISTS (
        SELECT 1
        FROM public.teskeid_events AS event_row
        WHERE event_row.id = p_event_id
          AND event_row.owner_user_id = p_actor_id
      )
    ) OR (
      evidence.value->>'viewer_role' = 'attendee'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'event_guest_id'
      ) = 'string'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'identity_generation'
      ) = 'string'
      AND EXISTS (
        SELECT 1
        FROM public.teskeid_events AS event_row
        JOIN public.teskeid_event_participations AS participation
          ON participation.event_id = event_row.id
         AND participation.recipient_user_id = p_actor_id
         AND participation.access_state = 'active'
         AND participation.event_guest_id::text =
               evidence.value->>'event_guest_id'
         AND participation.identity_generation::text =
               evidence.value->>'identity_generation'
        JOIN public.teskeid_event_guests AS guest
          ON guest.event_id = participation.event_id
         AND guest.id = participation.event_guest_id
         AND guest.status = 'active'
        JOIN public.teskeid_event_participation_rsvp_v3 AS decision
          ON decision.event_id = participation.event_id
         AND decision.event_guest_id = participation.event_guest_id
         AND decision.identity_generation =
               participation.identity_generation
         AND decision.decision_version = participation.rsvp_version
        WHERE event_row.id = p_event_id
          AND event_row.owner_user_id <> p_actor_id
      )
    )
  ), visible_candidates AS MATERIALIZED (
    -- Hidden participants-only rows are removed before any title, amount,
    -- count, balance or repayment projection can observe their Expense data.
    SELECT link.event_id, link.group_id, link.expense_id, link.linked_at
    FROM scope
    JOIN public.teskeid_event_expense_links AS link
      ON link.event_id = p_event_id
    WHERE scope.value IS NOT NULL
      AND (
        link.visibility = 'all_event'
        OR (
          link.visibility = 'participants_only'
          AND EXISTS (
            SELECT 1
            FROM public.expense_group_members AS actor_member
            WHERE actor_member.group_id = link.group_id
              AND actor_member.user_id = p_actor_id
              AND actor_member.status = 'active'
              AND NOT EXISTS (
                SELECT 1
                FROM public.expense_claim_disputes AS dispute
                WHERE dispute.group_id = link.group_id
                  AND dispute.expense_id = link.expense_id
                  AND dispute.member_id = actor_member.id
                  AND dispute.disputed_user_id = p_actor_id
                  AND dispute.status = 'disputed'
              )
          )
        )
      )
    ORDER BY link.linked_at DESC, link.expense_id DESC
    LIMIT 101
  ), visible_count AS MATERIALIZED (
    SELECT pg_catalog.count(*)::integer AS value
    FROM visible_candidates
  ), projectable_candidates AS MATERIALIZED (
    SELECT candidate.*
    FROM visible_candidates AS candidate
    CROSS JOIN visible_count
    WHERE visible_count.value BETWEEN 1 AND 100
  ), visible_detail AS MATERIALIZED (
    -- Every visible candidate contributes exactly one detail row, including a
    -- broken candidate. Broken visible data fails the whole projection closed.
    SELECT candidate.group_id, candidate.expense_id,
      expense.title, expense.total_minor, expense.currency,
      expense.incurred_on, expense.created_at,
      COALESCE(
        group_row.id IS NOT NULL
        AND group_row.kind = 'one_off'
        AND expense.id IS NOT NULL
        AND expense.status = 'active'
        AND expense.total_minor BETWEEN 1 AND 9007199254740991
        AND group_expense_stats.item_count = 1
        AND payment_stats.item_count BETWEEN 1 AND 50
        AND payment_stats.amount_total = expense.total_minor,
        false
      ) AS is_valid
    FROM projectable_candidates AS candidate
    LEFT JOIN public.expense_groups AS group_row
      ON group_row.id = candidate.group_id
    LEFT JOIN public.expenses AS expense
      ON expense.group_id = candidate.group_id
     AND expense.id = candidate.expense_id
    LEFT JOIN LATERAL (
      SELECT pg_catalog.count(*) AS item_count
      FROM public.expenses AS group_expense
      WHERE group_expense.group_id = candidate.group_id
    ) AS group_expense_stats ON true
    LEFT JOIN LATERAL (
      SELECT pg_catalog.count(*) AS item_count,
        COALESCE(pg_catalog.sum(payment.amount_minor), 0) AS amount_total
      FROM public.expense_payments AS payment
      WHERE payment.group_id = candidate.group_id
        AND payment.expense_id = candidate.expense_id
    ) AS payment_stats ON true
  ), detail_gate AS MATERIALIZED (
    SELECT visible_count.value AS visible_count,
      COALESCE(pg_catalog.bool_or(NOT detail.is_valid), false) AS has_invalid
    FROM visible_count
    LEFT JOIN visible_detail AS detail ON true
    GROUP BY visible_count.value
  ), projection_gate AS MATERIALIZED (
    SELECT scope.value AS scope, detail_gate.visible_count,
      detail_gate.has_invalid,
      detail_gate.visible_count BETWEEN 1 AND 100
        AND NOT detail_gate.has_invalid AS can_project
    FROM scope
    CROSS JOIN detail_gate
  ), expenses_json AS MATERIALIZED (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'title', detail.title,
        'total_minor', detail.total_minor,
        'currency', detail.currency
      ) ORDER BY detail.incurred_on DESC, detail.created_at DESC,
        detail.expense_id DESC
    ) FILTER (WHERE gate.can_project AND detail.is_valid), '[]'::jsonb) AS value
    FROM projection_gate AS gate
    LEFT JOIN visible_detail AS detail
      ON gate.can_project AND detail.is_valid
  ), position_inputs AS MATERIALIZED (
    -- Event visibility never creates a financial position. Only the actor's
    -- exact active, undisputed Expense membership reaches balance projection.
    SELECT detail.group_id, detail.expense_id, detail.currency,
      actor_member.id AS actor_member_id
    FROM projection_gate AS gate
    JOIN visible_detail AS detail
      ON gate.can_project AND detail.is_valid
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = detail.group_id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = detail.group_id
        AND dispute.expense_id = detail.expense_id
        AND dispute.member_id = actor_member.id
        AND dispute.disputed_user_id = p_actor_id
        AND dispute.status = 'disputed'
    )
  ), position_contributions AS MATERIALIZED (
    SELECT input.currency,
      COALESCE(balance.amount_minor, 0::numeric) AS amount_minor,
      EXISTS (
        SELECT 1
        FROM public.expense_repayments AS repayment
        WHERE repayment.group_id = input.group_id
          AND repayment.currency = input.currency
          AND repayment.status = 'reported'
          AND input.actor_member_id IN (
            repayment.from_member_id, repayment.to_member_id
          )
      ) AS pending
    FROM position_inputs AS input
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        pg_catalog.sum(group_balance.amount_minor), 0
      )::numeric AS amount_minor
      FROM public.expense_group_balances(
        input.group_id, false
      ) AS group_balance
      WHERE group_balance.member_id = input.actor_member_id
        AND group_balance.currency = input.currency
    ) AS balance ON true
  ), position_rows AS MATERIALIZED (
    SELECT contribution.currency,
      pg_catalog.sum(contribution.amount_minor) AS actor_balance,
      pg_catalog.bool_or(contribution.pending) AS pending
    FROM position_contributions AS contribution
    GROUP BY contribution.currency
  ), position_gate AS MATERIALIZED (
    SELECT COALESCE(pg_catalog.bool_or(
      NOT position.pending
      AND (
        position.actor_balance > 9007199254740991
        OR position.actor_balance < -9007199254740991
      )
    ), false) AS has_overflow
    FROM position_rows AS position
  ), positions_json AS MATERIALIZED (
    SELECT CASE WHEN position_gate.has_overflow THEN '[]'::jsonb
      ELSE COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'currency', position.currency,
          'state', CASE
            WHEN position.pending THEN 'pending'
            WHEN position.actor_balance < 0 THEN 'owes'
            WHEN position.actor_balance > 0 THEN 'owed'
            ELSE 'zero'
          END,
          'amount_minor', CASE
            WHEN position.pending THEN 0
            ELSE pg_catalog.abs(position.actor_balance)::bigint
          END
        ) ORDER BY position.currency
      ) FILTER (WHERE position.currency IS NOT NULL), '[]'::jsonb)
    END AS value
    FROM position_gate
    LEFT JOIN position_rows AS position
      ON NOT position_gate.has_overflow
    GROUP BY position_gate.has_overflow
  )
  SELECT gate.scope,
    CASE
      WHEN gate.scope IS NULL THEN NULL
      WHEN gate.visible_count > 100 OR gate.has_invalid
        OR position_gate.has_overflow THEN pg_catalog.jsonb_build_object(
          'status', 'unavailable', 'expenses', '[]'::jsonb,
          'positions', '[]'::jsonb
        )
      WHEN gate.visible_count = 0 THEN pg_catalog.jsonb_build_object(
        'status', 'none', 'expenses', '[]'::jsonb,
        'positions', '[]'::jsonb
      )
      ELSE pg_catalog.jsonb_build_object(
        'status', 'ready', 'expenses', expenses_json.value,
        'positions', positions_json.value
      )
    END
  INTO v_revalidated_scope, v_result
  FROM projection_gate AS gate
  CROSS JOIN expenses_json
  CROSS JOIN position_gate
  CROSS JOIN positions_json;

  IF v_revalidated_scope IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_link_management_v2(
  p_actor_id uuid,
  p_expense_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_current_event jsonb;
  v_events jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense
  JOIN public.expense_groups AS group_row
    ON group_row.id = expense.group_id
   AND group_row.kind = 'one_off'
   AND group_row.status <> 'closed'
  WHERE expense.id = p_expense_id
    AND expense.status = 'active'
    AND (
      expense.created_by = p_actor_id
      OR public.expense_active_member_role(p_actor_id, expense.group_id)
           IN ('owner', 'admin')
    )
    AND (
      SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
      WHERE group_expense.group_id = expense.group_id
    ) = 1;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', CASE WHEN event_row.owner_user_id = p_actor_id OR EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = event_row.id
        AND membership.user_id = p_actor_id
    ) THEN event_row.name ELSE NULL END,
    'can_open', event_row.owner_user_id = p_actor_id OR EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = event_row.id
        AND membership.user_id = p_actor_id
    ),
    'visibility', link.visibility,
    'link_revision', link.link_revision::text
  ) INTO v_current_event
  FROM public.teskeid_event_expense_links AS link
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  WHERE link.expense_id = p_expense_id
    AND link.group_id = v_group_id;

  IF v_current_event IS NULL THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id', candidate.id,
      'name', candidate.name,
      'roster_revision', candidate.roster_revision::text,
      'viewer_role', candidate.viewer_role
    ) ORDER BY candidate.created_at DESC, candidate.id DESC), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT event_row.id, event_row.name, event_row.roster_revision,
        event_row.created_at,
        CASE WHEN event_row.owner_user_id = p_actor_id
          THEN 'owner' ELSE 'attendee' END AS viewer_role
      FROM public.teskeid_events AS event_row
      WHERE event_row.owner_user_id = p_actor_id
         OR EXISTS (
           SELECT 1
           FROM public.teskeid_event_attendance_memberships AS membership
           JOIN public.teskeid_event_guests AS guest
             ON guest.event_id = membership.event_id
            AND guest.id = membership.event_guest_id
            AND guest.status = 'active'
            AND guest.linked_user_id = membership.user_id
           WHERE membership.event_id = event_row.id
             AND membership.user_id = p_actor_id
         )
      ORDER BY event_row.created_at DESC, event_row.id DESC
      LIMIT 100
    ) AS candidate;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'current_event', v_current_event,
    'events', v_events
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_attach_expense_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_event_id uuid,
  p_expected_financial_version bigint,
  p_expected_roster_revision bigint,
  p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_existing public.teskeid_event_expense_links%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_event_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_visibility IS NULL
     OR p_visibility NOT IN ('participants_only', 'all_event') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'eventId', p_event_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'expectedRosterRevision', p_expected_roster_revision,
    'visibility', p_visibility
  )::text);
  -- Acquire the canonical actor/idempotency locks before any Expense row lock,
  -- but do not return a replay until current authority is re-proven below.
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_attach_expense_v2',
    v_fingerprint, true
  );

  SELECT expense.group_id INTO v_expense.group_id
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.group_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off'
     OR v_group.status = 'closed'
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND COALESCE(v_role, '') NOT IN ('owner', 'admin'))
     OR (SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
         WHERE group_expense.group_id = v_group.id) <> 1 THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF v_event.id IS NULL
     OR (
       v_event.owner_user_id <> p_actor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.teskeid_event_attendance_memberships AS membership
         JOIN public.teskeid_event_guests AS guest
           ON guest.event_id = membership.event_id
          AND guest.id = membership.event_guest_id
          AND guest.status = 'active'
          AND guest.linked_user_id = membership.user_id
         WHERE membership.event_id = p_event_id
           AND membership.user_id = p_actor_id
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

  -- Re-prove current exact Expense and Event-context authority before a lost-
  -- response replay. Expected versions stay after replay so a legitimate retry
  -- remains byte-stable after its own successful mutation.
  SELECT link.* INTO v_existing
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id
  FOR UPDATE;
  IF v_replay IS NOT NULL THEN
    IF v_existing.event_id IS NULL
       OR v_existing.event_id <> p_event_id
       OR v_existing.group_id <> v_group.id THEN
      RAISE EXCEPTION 'teskeid_event_link_conflict';
    END IF;
    PERFORM public.teskeid_event_assert_expense_link(
      p_event_id, v_group.id, p_expense_id
    );
    RETURN v_replay;
  END IF;
  IF v_group.financial_version <> p_expected_financial_version THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

  IF v_existing.event_id IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  INSERT INTO public.teskeid_event_expense_links(
    event_id, group_id, expense_id, linked_by_user_id, link_revision, visibility
  ) VALUES (
    p_event_id, v_group.id, p_expense_id, p_actor_id, 1, p_visibility
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_existing;
  IF v_existing.event_id IS NULL OR v_existing.link_revision <> 1 THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  PERFORM public.teskeid_event_assert_expense_link(
    p_event_id, v_group.id, p_expense_id
  );
  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id,
    'event_id', p_event_id,
    'visibility', v_existing.visibility,
    'link_revision', v_existing.link_revision::text
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_set_expense_visibility(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_expected_event_id uuid,
  p_expected_link_revision bigint,
  p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_link public.teskeid_event_expense_links%ROWTYPE;
  v_role text;
  v_previous_visibility text;
  v_previous_revision bigint;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_expected_event_id IS NULL OR p_expected_link_revision IS NULL
     OR p_expected_link_revision < 1 OR p_visibility IS NULL
     OR p_visibility NOT IN ('participants_only', 'all_event') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id,
    'expectedEventId', p_expected_event_id,
    'expectedLinkRevision', p_expected_link_revision,
    'visibility', p_visibility
  )::text);
  -- Acquire canonical actor/idempotency locks first, while deferring any replay
  -- response until exact current Expense/Event/link authority is re-proven.
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_set_expense_visibility',
    v_fingerprint, true
  );

  -- Derive and prove the exact Expense authority before observing whether an
  -- Event link exists. Generic callers must not gain a link-existence oracle.
  SELECT expense.group_id INTO v_group.id
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group.id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off'
     OR v_group.status = 'closed'
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND COALESCE(v_role, '') NOT IN ('owner', 'admin'))
     OR (SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
         WHERE group_expense.group_id = v_group.id) <> 1 THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_expected_event_id
  FOR UPDATE;
  IF v_event.id IS NULL OR (
    v_event.owner_user_id <> p_actor_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = p_expected_event_id
        AND membership.user_id = p_actor_id
    )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

  SELECT link.* INTO v_link
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id
  FOR UPDATE;
  IF v_link.event_id IS NULL
     OR v_link.event_id <> p_expected_event_id
     OR v_link.group_id <> v_group.id THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;

  -- A replay is valid only while the actor still has exact authority over the
  -- Expense and its current Event context. Revision comparison follows replay
  -- so the operation's own increment cannot invalidate a lost-response retry.
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_link.link_revision <> p_expected_link_revision THEN
    RAISE EXCEPTION 'teskeid_event_link_revision_conflict';
  END IF;

  v_previous_visibility := v_link.visibility;
  v_previous_revision := v_link.link_revision;
  IF v_link.visibility <> p_visibility THEN
    UPDATE public.teskeid_event_expense_links AS link
    SET visibility = p_visibility,
        link_revision = link.link_revision + 1
    WHERE link.event_id = v_link.event_id
      AND link.group_id = v_link.group_id
      AND link.expense_id = v_link.expense_id
      AND link.link_revision = v_previous_revision
    RETURNING link.* INTO v_link;
    IF v_link.link_revision IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_link_revision_conflict';
    END IF;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id,
    'event_id', p_expected_event_id,
    'previous_visibility', v_previous_visibility,
    'visibility', v_link.visibility,
    'previous_link_revision', v_previous_revision::text,
    'link_revision', v_link.link_revision::text
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

ALTER TABLE public.teskeid_event_sql157_install_baseline OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_expense_link_visibility_update()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_activity_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.teskeid_event_guard_expense_link_visibility_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_get_expense_activity_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_get_expense_activity_v2(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)
  TO service_role;

COMMENT ON COLUMN public.teskeid_event_expense_links.visibility IS
  'Event projection policy: participants_only (default/private) or all_event.';

COMMIT;
