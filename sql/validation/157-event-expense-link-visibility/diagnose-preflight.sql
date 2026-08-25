BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

-- SQL157 catalog-only diagnosis for a failed preflight.
-- This query never reads application rows and never returns function source.
-- Function implementations are represented only by normalized MD5 hashes.
WITH executor_contract AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok
), expected_functions(
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
), function_catalog AS (
  SELECT expected_functions.*,
    function_row.oid AS function_oid,
    function_row.pronamespace,
    function_row.proname,
    function_row.prokind,
    function_row.provolatile,
    function_row.proretset,
    function_row.prorettype,
    function_row.prosecdef,
    function_row.proleakproof,
    function_row.proisstrict,
    function_row.proparallel,
    function_row.pronargdefaults,
    function_row.proowner,
    function_row.proconfig,
    function_row.proacl,
    function_row.prosrc,
    language_row.lanname AS actual_language_name
  FROM expected_functions
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid =
      pg_catalog.to_regprocedure(expected_functions.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), function_observed AS (
  SELECT function_catalog.*,
    function_catalog.function_oid::pg_catalog.regprocedure::text
      AS actual_signature,
    pg_catalog.pg_get_function_arguments(function_catalog.function_oid)
      AS actual_arguments,
    pg_catalog.md5(pg_catalog.replace(
      function_catalog.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash,
    pg_catalog.format_type(function_catalog.prorettype, NULL)
      AS actual_return_type,
    pg_catalog.pg_get_function_result(function_catalog.function_oid)
      AS actual_result,
    pg_catalog.pg_get_userbyid(function_catalog.proowner) AS actual_owner,
    (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = overload.pronamespace
      WHERE namespace.nspname = pg_catalog.split_part(
              pg_catalog.split_part(function_catalog.signature, '(', 1),
              '.', 1
            )
        AND overload.proname = pg_catalog.split_part(
              pg_catalog.split_part(function_catalog.signature, '(', 1),
              '.', 2
            )
    ) AS actual_overload_count,
    CASE
      WHEN function_catalog.function_oid IS NULL
        OR service_role.oid IS NULL THEN false
      ELSE pg_catalog.has_function_privilege(
        service_role.oid, function_catalog.function_oid, 'EXECUTE'
      )
    END AS actual_service_execute,
    CASE WHEN function_catalog.function_oid IS NULL THEN '[]'::pg_catalog.jsonb
      ELSE (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantee', CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
              ELSE pg_catalog.pg_get_userbyid(privilege.grantee) END,
            'grantor', pg_catalog.pg_get_userbyid(privilege.grantor),
            'privilege_type', privilege.privilege_type,
            'is_grantable', privilege.is_grantable
          ) ORDER BY privilege.grantee, privilege.privilege_type
        ), '[]'::pg_catalog.jsonb)
        FROM pg_catalog.aclexplode(COALESCE(
          function_catalog.proacl,
          pg_catalog.acldefault('f', function_catalog.proowner)
        )) AS privilege
      )
    END AS actual_acl
  FROM function_catalog
  LEFT JOIN pg_catalog.pg_roles AS service_role
    ON service_role.rolname = 'service_role'
), function_checks_raw AS (
  SELECT function_observed.*,
    function_observed.function_oid IS NOT NULL AS exists_ok,
    COALESCE(function_observed.prokind = 'f', false) AS kind_ok,
    COALESCE(
      function_observed.provolatile::text = function_observed.volatility,
      false
    ) AS volatility_ok,
    COALESCE(
      function_observed.proretset = function_observed.returns_set, false
    ) AS returns_set_ok,
    COALESCE(
      function_observed.prorettype =
        pg_catalog.to_regtype(function_observed.return_type),
      false
    ) AS return_type_ok,
    COALESCE(
      function_observed.actual_result = CASE
        WHEN function_observed.signature =
          'public.expense_group_balances(uuid,boolean)'
          THEN 'TABLE(member_id uuid, currency text, amount_minor bigint)'
        ELSE pg_catalog.replace(
          function_observed.return_type, 'pg_catalog.', ''
        )
      END,
      false
    ) AS result_ok,
    COALESCE(
      function_observed.prosecdef = (
        function_observed.signature <>
          'public.normalize_email_canonical(text)'
      ), false
    ) AS security_definer_ok,
    COALESCE(NOT function_observed.proleakproof, false) AS leakproof_ok,
    COALESCE(
      function_observed.proisstrict = (
        function_observed.signature =
          'public.normalize_email_canonical(text)'
      ), false
    ) AS strict_ok,
    COALESCE(
      function_observed.proparallel = CASE
        WHEN function_observed.signature =
          'public.normalize_email_canonical(text)'
          THEN 's'::"char" ELSE 'u'::"char" END,
      false
    ) AS parallel_ok,
    COALESCE(
      function_observed.pronargdefaults =
        function_observed.argument_defaults,
      false
    ) AS defaults_ok,
    COALESCE(
      function_observed.actual_language_name =
        function_observed.language_name,
      false
    ) AS language_ok,
    COALESCE(
      function_observed.actual_arguments =
        function_observed.exact_arguments,
      false
    ) AS arguments_ok,
    COALESCE(function_observed.actual_owner = 'postgres', false) AS owner_ok,
    COALESCE(
      function_observed.proconfig = ARRAY['search_path=""']::text[],
      false
    ) AS config_ok,
    COALESCE(
      function_observed.actual_source_hash =
        function_observed.source_hash,
      false
    ) AS source_hash_ok,
    function_observed.actual_overload_count = 1 AS overload_count_ok,
    function_observed.actual_service_execute =
      function_observed.service_execute AS service_execute_ok,
    CASE WHEN function_observed.function_oid IS NULL THEN false ELSE
      (
        SELECT pg_catalog.count(*) = CASE
          WHEN function_observed.service_execute THEN 2 ELSE 1 END
        FROM pg_catalog.aclexplode(COALESCE(
          function_observed.proacl,
          pg_catalog.acldefault('f', function_observed.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_observed.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_observed.proowner
            OR (function_observed.service_execute
              AND grantee.rolname = 'service_role')
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_observed.proacl,
          pg_catalog.acldefault('f', function_observed.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_observed.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_observed.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
           OR (
             grantee.rolname = 'service_role'
             AND NOT function_observed.service_execute
           )
      )
    END AS acl_ok
  FROM function_observed
), function_checks AS (
  SELECT function_checks_raw.*,
    exists_ok AND kind_ok AND volatility_ok AND returns_set_ok
      AND return_type_ok AND result_ok AND security_definer_ok
      AND leakproof_ok AND strict_ok AND parallel_ok AND defaults_ok
      AND language_ok AND arguments_ok AND owner_ok AND config_ok
      AND source_hash_ok AND overload_count_ok AND service_execute_ok
      AND acl_ok AS contract_ok
  FROM function_checks_raw
), function_summary AS (
  SELECT
    pg_catalog.count(*)::integer AS expected_function_count,
    pg_catalog.count(*) FILTER (
      WHERE function_checks.function_oid IS NOT NULL
    )::integer AS present_function_count,
    pg_catalog.count(*) FILTER (
      WHERE NOT function_checks.contract_ok
    )::integer AS function_mismatch_count,
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'signature', function_checks.signature,
        'exists', function_checks.function_oid IS NOT NULL,
        'expected', pg_catalog.jsonb_build_object(
          'arguments', function_checks.exact_arguments,
          'source_hash', function_checks.source_hash,
          'language', function_checks.language_name,
          'volatility', function_checks.volatility,
          'return_type', function_checks.return_type,
          'returns_set', function_checks.returns_set,
          'argument_defaults', function_checks.argument_defaults,
          'owner', 'postgres',
          'config', ARRAY['search_path=""']::text[],
          'security_definer', function_checks.signature <>
            'public.normalize_email_canonical(text)',
          'leakproof', false,
          'strict', function_checks.signature =
            'public.normalize_email_canonical(text)',
          'parallel', CASE WHEN function_checks.signature =
            'public.normalize_email_canonical(text)' THEN 's' ELSE 'u' END,
          'overload_count', 1,
          'service_execute', function_checks.service_execute
        ),
        'actual', pg_catalog.jsonb_build_object(
          'signature', function_checks.actual_signature,
          'arguments', function_checks.actual_arguments,
          'source_hash', function_checks.actual_source_hash,
          'language', function_checks.actual_language_name,
          'volatility', function_checks.provolatile::text,
          'return_type', function_checks.actual_return_type,
          'result', function_checks.actual_result,
          'returns_set', function_checks.proretset,
          'argument_defaults', function_checks.pronargdefaults,
          'owner', function_checks.actual_owner,
          'config', function_checks.proconfig,
          'security_definer', function_checks.prosecdef,
          'leakproof', function_checks.proleakproof,
          'strict', function_checks.proisstrict,
          'parallel', function_checks.proparallel::text,
          'overload_count', function_checks.actual_overload_count,
          'service_execute', function_checks.actual_service_execute,
          'acl', function_checks.actual_acl
        ),
        'checks', pg_catalog.jsonb_build_object(
          'kind_ok', function_checks.kind_ok,
          'volatility_ok', function_checks.volatility_ok,
          'returns_set_ok', function_checks.returns_set_ok,
          'return_type_ok', function_checks.return_type_ok,
          'result_ok', function_checks.result_ok,
          'security_definer_ok', function_checks.security_definer_ok,
          'leakproof_ok', function_checks.leakproof_ok,
          'strict_ok', function_checks.strict_ok,
          'parallel_ok', function_checks.parallel_ok,
          'defaults_ok', function_checks.defaults_ok,
          'language_ok', function_checks.language_ok,
          'arguments_ok', function_checks.arguments_ok,
          'owner_ok', function_checks.owner_ok,
          'config_ok', function_checks.config_ok,
          'source_hash_ok', function_checks.source_hash_ok,
          'overload_count_ok', function_checks.overload_count_ok,
          'service_execute_ok', function_checks.service_execute_ok,
          'acl_ok', function_checks.acl_ok
        )
      ) ORDER BY function_checks.signature
    ) FILTER (WHERE NOT function_checks.contract_ok),
      '[]'::pg_catalog.jsonb) AS function_mismatches,
    pg_catalog.count(*) = 29
      AND COALESCE(pg_catalog.bool_and(function_checks.contract_ok), false)
      AS canonical_functions_exact_diagnostic
  FROM function_checks
), expected_constraints(
  constraint_name, constraint_type, local_columns, referenced_relation,
  referenced_columns, update_action, delete_action, normalized_definition
) AS (VALUES
  ('teskeid_event_expense_links_pkey', 'p',
   ARRAY['event_id', 'expense_id']::text[], NULL::text, NULL::text[],
   NULL::text, NULL::text, NULL::text),
  ('teskeid_event_expense_links_scope_key', 'u',
   ARRAY['event_id', 'group_id', 'expense_id']::text[], NULL::text,
   NULL::text[], NULL::text, NULL::text, NULL::text),
  ('teskeid_event_expense_links_event_fk', 'f',
   ARRAY['event_id']::text[], 'public.teskeid_events', ARRAY['id']::text[],
   'a', 'c', NULL::text),
  ('teskeid_event_expense_links_expense_fk', 'f',
   ARRAY['group_id', 'expense_id']::text[], 'public.expenses',
   ARRAY['group_id', 'id']::text[], 'a', 'r', NULL::text),
  ('teskeid_event_expense_links_actor_fk', 'f',
   ARRAY['linked_by_user_id']::text[], 'auth.users', ARRAY['id']::text[],
   'a', 'n', NULL::text),
  ('teskeid_event_expense_links_revision_check', 'c', ARRAY[]::text[],
   NULL::text, NULL::text[], NULL::text, NULL::text,
   'checklink_revision=1')
), actual_constraints AS (
  SELECT constraint_row.conname::text AS constraint_name,
    constraint_row.oid AS constraint_oid,
    constraint_row.contype::text AS constraint_type,
    constraint_row.convalidated,
    constraint_row.condeferrable,
    constraint_row.condeferred,
    ARRAY(
      SELECT attribute.attname::text
      FROM pg_catalog.unnest(constraint_row.conkey)
        WITH ORDINALITY AS key_column(attnum, ordinal)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = constraint_row.conrelid
       AND attribute.attnum = key_column.attnum
      ORDER BY key_column.ordinal
    ) AS local_columns,
    CASE WHEN constraint_row.confrelid = 0 THEN NULL::text
      ELSE constraint_row.confrelid::pg_catalog.regclass::text
    END AS referenced_relation,
    ARRAY(
      SELECT attribute.attname::text
      FROM pg_catalog.unnest(constraint_row.confkey)
        WITH ORDINALITY AS key_column(attnum, ordinal)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = constraint_row.confrelid
       AND attribute.attnum = key_column.attnum
      ORDER BY key_column.ordinal
    ) AS referenced_columns,
    constraint_row.confupdtype::text AS update_action,
    constraint_row.confdeltype::text AS delete_action,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition,
    pg_catalog.regexp_replace(pg_catalog.lower(
      pg_catalog.pg_get_constraintdef(constraint_row.oid)
    ), '[[:space:]()]', '', 'g') AS normalized_definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass(
    'public.teskeid_event_expense_links'
  )
    AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')
), constraint_checks_raw AS (
  SELECT
    COALESCE(
      expected_constraints.constraint_name,
      actual_constraints.constraint_name
    ) AS constraint_name,
    expected_constraints.constraint_name IS NOT NULL AS expected_present,
    actual_constraints.constraint_oid IS NOT NULL AS actual_present,
    expected_constraints.constraint_type AS expected_type,
    actual_constraints.constraint_type AS actual_type,
    expected_constraints.local_columns AS expected_local_columns,
    actual_constraints.local_columns AS actual_local_columns,
    expected_constraints.referenced_relation AS expected_reference,
    actual_constraints.referenced_relation AS actual_reference,
    expected_constraints.referenced_columns AS expected_reference_columns,
    actual_constraints.referenced_columns AS actual_reference_columns,
    expected_constraints.update_action AS expected_update_action,
    actual_constraints.update_action AS actual_update_action,
    expected_constraints.delete_action AS expected_delete_action,
    actual_constraints.delete_action AS actual_delete_action,
    expected_constraints.normalized_definition AS expected_definition,
    actual_constraints.normalized_definition AS actual_normalized_definition,
    actual_constraints.definition AS actual_definition,
    actual_constraints.convalidated,
    actual_constraints.condeferrable,
    actual_constraints.condeferred,
    CASE
      WHEN expected_constraints.constraint_name IS NULL
        OR actual_constraints.constraint_oid IS NULL THEN false
      ELSE actual_constraints.convalidated
        AND NOT actual_constraints.condeferrable
        AND NOT actual_constraints.condeferred
        AND CASE expected_constraints.constraint_name
          WHEN 'teskeid_event_expense_links_pkey' THEN
            actual_constraints.constraint_type = 'p'
            AND actual_constraints.local_columns =
              ARRAY['event_id', 'expense_id']::text[]
          WHEN 'teskeid_event_expense_links_scope_key' THEN
            actual_constraints.constraint_type = 'u'
            AND actual_constraints.local_columns =
              ARRAY['event_id', 'group_id', 'expense_id']::text[]
          WHEN 'teskeid_event_expense_links_event_fk' THEN
            actual_constraints.constraint_type = 'f'
            AND actual_constraints.local_columns = ARRAY['event_id']::text[]
            AND actual_constraints.referenced_relation =
              'public.teskeid_events'
            AND actual_constraints.referenced_columns = ARRAY['id']::text[]
            AND actual_constraints.update_action = 'a'
            AND actual_constraints.delete_action = 'c'
          WHEN 'teskeid_event_expense_links_expense_fk' THEN
            actual_constraints.constraint_type = 'f'
            AND actual_constraints.local_columns =
              ARRAY['group_id', 'expense_id']::text[]
            AND actual_constraints.referenced_relation = 'public.expenses'
            AND actual_constraints.referenced_columns =
              ARRAY['group_id', 'id']::text[]
            AND actual_constraints.update_action = 'a'
            AND actual_constraints.delete_action = 'r'
          WHEN 'teskeid_event_expense_links_actor_fk' THEN
            actual_constraints.constraint_type = 'f'
            AND actual_constraints.local_columns =
              ARRAY['linked_by_user_id']::text[]
            AND actual_constraints.referenced_relation = 'auth.users'
            AND actual_constraints.referenced_columns = ARRAY['id']::text[]
            AND actual_constraints.update_action = 'a'
            AND actual_constraints.delete_action = 'n'
          WHEN 'teskeid_event_expense_links_revision_check' THEN
            actual_constraints.constraint_type = 'c'
            AND actual_constraints.normalized_definition =
              'checklink_revision=1'
          ELSE false
        END
    END AS contract_ok
  FROM expected_constraints
  FULL OUTER JOIN actual_constraints
    ON actual_constraints.constraint_name =
      expected_constraints.constraint_name
), constraint_summary AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM actual_constraints)::integer
      AS actual_constraint_count,
    pg_catalog.count(*) FILTER (
      WHERE NOT constraint_checks_raw.contract_ok
    )::integer AS constraint_mismatch_count,
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'constraint_name', constraint_checks_raw.constraint_name,
        'status', CASE
          WHEN NOT constraint_checks_raw.expected_present THEN 'unexpected'
          WHEN NOT constraint_checks_raw.actual_present THEN 'missing'
          ELSE 'different'
        END,
        'expected', pg_catalog.jsonb_build_object(
          'type', constraint_checks_raw.expected_type,
          'validated', true,
          'deferrable', false,
          'initially_deferred', false,
          'local_columns', constraint_checks_raw.expected_local_columns,
          'referenced_relation', constraint_checks_raw.expected_reference,
          'referenced_columns',
            constraint_checks_raw.expected_reference_columns,
          'update_action', constraint_checks_raw.expected_update_action,
          'delete_action', constraint_checks_raw.expected_delete_action,
          'normalized_definition', constraint_checks_raw.expected_definition
        ),
        'actual', pg_catalog.jsonb_build_object(
          'type', constraint_checks_raw.actual_type,
          'validated', constraint_checks_raw.convalidated,
          'deferrable', constraint_checks_raw.condeferrable,
          'initially_deferred', constraint_checks_raw.condeferred,
          'local_columns', constraint_checks_raw.actual_local_columns,
          'referenced_relation', constraint_checks_raw.actual_reference,
          'referenced_columns',
            constraint_checks_raw.actual_reference_columns,
          'update_action', constraint_checks_raw.actual_update_action,
          'delete_action', constraint_checks_raw.actual_delete_action,
          'definition', constraint_checks_raw.actual_definition,
          'normalized_definition',
            constraint_checks_raw.actual_normalized_definition
        )
      ) ORDER BY constraint_checks_raw.constraint_name
    ) FILTER (WHERE NOT constraint_checks_raw.contract_ok),
      '[]'::pg_catalog.jsonb) AS constraint_mismatches,
    (SELECT pg_catalog.count(*) = 6 FROM actual_constraints)
      AND NOT EXISTS (
        SELECT 1 FROM constraint_checks_raw WHERE NOT contract_ok
      ) AS link_constraints_exact_diagnostic
  FROM constraint_checks_raw
), expected_writer_sets AS (
  SELECT ARRAY[
    'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
    'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
    'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
  ]::text[] AS expected_insert_writers,
  ARRAY[]::text[] AS expected_update_writers
), writer_functions AS (
  SELECT function_row.oid::pg_catalog.regprocedure::text AS signature,
    pg_catalog.md5(pg_catalog.replace(
      function_row.prosrc, E'\r\n', E'\n'
    )) AS source_hash,
    function_row.prosrc ~*
      'insert[[:space:]]+into[[:space:]]+public[.]teskeid_event_expense_links'
      AS inserts_link,
    function_row.prosrc ~*
      'update[[:space:]]+public[.]teskeid_event_expense_links'
      AS updates_link
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = function_row.pronamespace
  WHERE namespace.nspname = 'public'
    AND function_row.prokind = 'f'
    AND (
      function_row.prosrc ~*
        'insert[[:space:]]+into[[:space:]]+public[.]teskeid_event_expense_links'
      OR function_row.prosrc ~*
        'update[[:space:]]+public[.]teskeid_event_expense_links'
    )
), writer_sets AS (
  SELECT
    COALESCE(pg_catalog.array_agg(
      writer_functions.signature ORDER BY
        writer_functions.signature COLLATE pg_catalog."C"
    ) FILTER (WHERE writer_functions.inserts_link), ARRAY[]::text[])
      AS actual_insert_writers,
    COALESCE(pg_catalog.array_agg(
      writer_functions.signature ORDER BY
        writer_functions.signature COLLATE pg_catalog."C"
    ) FILTER (WHERE writer_functions.updates_link), ARRAY[]::text[])
      AS actual_update_writers,
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'signature', writer_functions.signature,
        'source_hash', writer_functions.source_hash,
        'inserts_link', writer_functions.inserts_link,
        'updates_link', writer_functions.updates_link
      ) ORDER BY writer_functions.signature COLLATE pg_catalog."C"
    ), '[]'::pg_catalog.jsonb) AS writer_details
  FROM writer_functions
), writer_summary AS (
  SELECT expected_writer_sets.expected_insert_writers,
    writer_sets.actual_insert_writers,
    expected_writer_sets.expected_update_writers,
    writer_sets.actual_update_writers,
    ARRAY(
      SELECT expected_signature
      FROM pg_catalog.unnest(
        expected_writer_sets.expected_insert_writers
      ) AS expected_signature
      WHERE NOT (
        expected_signature = ANY(writer_sets.actual_insert_writers)
      )
      ORDER BY expected_signature COLLATE pg_catalog."C"
    ) AS missing_insert_writers,
    ARRAY(
      SELECT actual_signature
      FROM pg_catalog.unnest(
        writer_sets.actual_insert_writers
      ) AS actual_signature
      WHERE NOT (
        actual_signature = ANY(expected_writer_sets.expected_insert_writers)
      )
      ORDER BY actual_signature COLLATE pg_catalog."C"
    ) AS unexpected_insert_writers,
    ARRAY(
      SELECT actual_signature
      FROM pg_catalog.unnest(
        writer_sets.actual_update_writers
      ) AS actual_signature
      ORDER BY actual_signature COLLATE pg_catalog."C"
    ) AS unexpected_update_writers,
    writer_sets.writer_details,
    writer_sets.actual_insert_writers =
      expected_writer_sets.expected_insert_writers
      AND writer_sets.actual_update_writers =
        expected_writer_sets.expected_update_writers
      AS link_writer_set_exact_diagnostic
  FROM expected_writer_sets
  CROSS JOIN writer_sets
)
SELECT executor_contract.executor_ok,
  current_user AS current_executor,
  session_user AS session_executor,
  pg_catalog.current_setting('server_version_num') AS server_version_num,
  function_summary.expected_function_count,
  function_summary.present_function_count,
  function_summary.function_mismatch_count,
  function_summary.function_mismatches,
  function_summary.canonical_functions_exact_diagnostic,
  constraint_summary.actual_constraint_count,
  constraint_summary.constraint_mismatch_count,
  constraint_summary.constraint_mismatches,
  constraint_summary.link_constraints_exact_diagnostic,
  writer_summary.expected_insert_writers,
  writer_summary.actual_insert_writers,
  writer_summary.missing_insert_writers,
  writer_summary.unexpected_insert_writers,
  writer_summary.expected_update_writers,
  writer_summary.actual_update_writers,
  writer_summary.unexpected_update_writers,
  writer_summary.writer_details,
  writer_summary.link_writer_set_exact_diagnostic
FROM executor_contract
CROSS JOIN function_summary
CROSS JOIN constraint_summary
CROSS JOIN writer_summary;

ROLLBACK;
