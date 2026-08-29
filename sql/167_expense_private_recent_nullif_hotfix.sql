-- SQL167 MIGRATION: correct one deferred private-recent NULLIF runtime-resolution defect.
-- Body-only helper hotfix. No Expense, Relationship, activity or table data is changed.
-- The effective latest-function manifest preserves SQL141/149/151/163/166 history.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(104167);

DO $migration$
DECLARE
  v_helper_oid oid;
  v_post_oid oid;
  v_helper_body text;
  v_target_body text;
  v_post_body text;
  v_apply_body text;
  v_dispute_body text;
  v_mutation_body text;
  v_discovery_body text;
  v_contracts_exact boolean;
  v_acl_exact boolean;
  v_boundaries_exact boolean;
  v_post_contracts_exact boolean;
  v_post_acl_exact boolean;
  v_post_boundaries_exact boolean;
  v_boundary_before text;
  v_boundary_after text;
  v_invalid_count integer;
  v_corrected_count integer;
  v_predecessor_hash constant text := '46a55ef53d35e1385cce6b9689705856';
  v_target_hash constant text := 'd87efae16a77f09eb82ca8ec2a1fca35';
  v_apply_hash constant text := '819b2e024aac1e00c7e14145b0d6b373';
  v_dispute_hash constant text := '7e6426c8e43efa3bb7d725bf6b1c807c';
  v_mutation_hash constant text := '257e4ad0dc53277b984272baadd8a3bf';
  v_discovery_hash constant text := 'd97158cb09a138b962382747c6badbca';
  v_invalid_token constant text := 'pg_catalog.nullif(';
  v_corrected_token constant text := 'NULLIF(';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql167_executor_mismatch';
  END IF;

  v_helper_oid := pg_catalog.to_regprocedure(
    'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
  );
  IF v_helper_oid IS NULL THEN
    RAISE EXCEPTION 'expense_sql167_partial_or_predecessor_drift';
  END IF;

  SELECT routine.prosrc INTO v_helper_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_helper_oid;

  SELECT routine.prosrc INTO v_apply_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
  );
  SELECT routine.prosrc INTO v_dispute_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
  );
  SELECT routine.prosrc INTO v_mutation_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'
  );
  SELECT routine.prosrc INTO v_discovery_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_get_relationship_identity_management_v1(uuid,uuid)'
  );

  WITH expected(
    signature, argument_names, arguments, result_type, volatility,
    source_hash, service_execute
  ) AS MATERIALIZED (
    VALUES
      ('public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)',
       ARRAY['p_group_id','p_actor_id','p_recipient_user_ids','p_event_type','p_expense_id','p_expense_title']::text[],
       'p_group_id uuid, p_actor_id uuid, p_recipient_user_ids uuid[], p_event_type text, p_expense_id uuid, p_expense_title text',
       'uuid', 'v'::"char", NULL::text, false),
      ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
       ARRAY['p_actor_id','p_group_id','p_member_id','p_target_user_id','p_proof_kind','p_relationship_id','p_event_id','p_event_participant_id','p_cancel_pending_invitations']::text[],
       'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
       'bigint', 'v'::"char", v_apply_hash, false),
      ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
       ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_expected_financial_version']::text[],
       'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
       'jsonb', 'v'::"char", v_dispute_hash, true),
      ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',
       ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_relationship_id','p_expected_financial_version']::text[],
       'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_relationship_id uuid, p_expected_financial_version bigint',
       'jsonb', 'v'::"char", v_mutation_hash, true),
      ('public.expense_get_relationship_identity_management_v1(uuid,uuid)',
       ARRAY['p_actor_id','p_expense_id']::text[],
       'p_actor_id uuid, p_expense_id uuid',
       'jsonb', 's'::"char", v_discovery_hash, true)
  ), checked AS MATERIALIZED (
    SELECT expected.*, routine.oid, routine.prosrc,
      routine.prokind = 'f'
      AND routine.pronargs = pg_catalog.cardinality(expected.argument_names)
      AND routine.proargnames = expected.argument_names
      AND pg_catalog.pg_get_function_arguments(routine.oid) = expected.arguments
      AND routine.prorettype = expected.result_type::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = expected.volatility
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND (expected.source_hash IS NULL OR pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      )) = expected.source_hash) AS metadata_exact
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  )
  SELECT COALESCE(
    pg_catalog.count(oid) = 5
      AND pg_catalog.bool_and(metadata_exact)
      AND (pg_catalog.length(v_apply_body) - pg_catalog.length(pg_catalog.replace(
        v_apply_body, 'public.expense_record_private_recent(', ''
      ))) / pg_catalog.length('public.expense_record_private_recent(') = 1
      AND (pg_catalog.length(v_dispute_body) - pg_catalog.length(pg_catalog.replace(
        v_dispute_body, 'public.expense_record_private_recent(', ''
      ))) / pg_catalog.length('public.expense_record_private_recent(') = 1,
    false
  ) INTO v_contracts_exact
  FROM checked;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected(function_oid, service_execute) AS MATERIALIZED (
    VALUES
      (pg_catalog.to_regprocedure('public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'), false),
      (pg_catalog.to_regprocedure('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'), false),
      (pg_catalog.to_regprocedure('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'), true),
      (pg_catalog.to_regprocedure('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'), true),
      (pg_catalog.to_regprocedure('public.expense_get_relationship_identity_management_v1(uuid,uuid)'), true)
  ), expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT expected.function_oid, roles.postgres_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected CROSS JOIN roles
    UNION ALL
    SELECT expected.function_oid, roles.service_role_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected CROSS JOIN roles WHERE expected.service_execute
  ), actual_acl AS MATERIALIZED (
    SELECT routine.oid AS function_oid, acl.grantee, acl.grantor,
      acl.privilege_type, acl.is_grantable
    FROM expected
    JOIN pg_catalog.pg_proc AS routine ON routine.oid = expected.function_oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
  ), effective_acl AS MATERIALIZED (
    SELECT expected.function_oid,
      pg_catalog.has_function_privilege(
        roles.service_role_oid, expected.function_oid, 'EXECUTE'
      ) = expected.service_execute AS service_exact,
      NOT pg_catalog.has_function_privilege(
        roles.anon_oid, expected.function_oid, 'EXECUTE'
      ) AS anon_denied,
      NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, expected.function_oid, 'EXECUTE'
      ) AS authenticated_denied
    FROM expected CROSS JOIN roles
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 8
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 8
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected_row.* FROM expected_acl AS expected_row)
      AND NOT EXISTS (SELECT expected_row.* FROM expected_acl AS expected_row
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND (SELECT pg_catalog.count(*) = 5
        AND pg_catalog.bool_and(service_exact AND anon_denied AND authenticated_denied)
        FROM effective_acl),
    false
  ) INTO v_acl_exact
  FROM roles;

  WITH expected_relation(signature, service_privileges) AS MATERIALIZED (
    VALUES
      ('public.expense_activity'::text, ARRAY['SELECT']::text[]),
      ('public.expense_activity_audience'::text, ARRAY[]::text[]),
      ('public.recent_events'::text, ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[])
  ), relation_check AS MATERIALIZED (
    SELECT expected.*, class_row.oid, class_row.relacl, class_row.relowner,
      class_row.relkind, class_row.relrowsecurity, class_row.relforcerowsecurity
    FROM expected_relation AS expected
    LEFT JOIN pg_catalog.pg_class AS class_row
      ON class_row.oid = pg_catalog.to_regclass(expected.signature)
  ), expected_acl(relation_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT relation.oid, owner_acl.grantee, owner_acl.grantor,
      owner_acl.privilege_type, owner_acl.is_grantable
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.acldefault('r', relation.relowner)
    ) AS owner_acl
    WHERE owner_acl.grantee = relation.relowner
    UNION ALL
    SELECT relation.oid, pg_catalog.to_regrole('service_role')::oid,
      pg_catalog.to_regrole('postgres')::oid, privilege_name, false
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.unnest(relation.service_privileges) AS privilege_name
  ), actual_acl AS MATERIALIZED (
    SELECT relation.oid AS relation_oid, acl.grantee, acl.grantor,
      acl.privilege_type, acl.is_grantable
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      relation.relacl, pg_catalog.acldefault('r', relation.relowner)
    )) AS acl
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(oid) = 3
      AND pg_catalog.bool_and(relkind = 'r')
      AND pg_catalog.bool_and(relrowsecurity)
      AND pg_catalog.bool_and(NOT relforcerowsecurity)
      AND pg_catalog.bool_and(relowner = pg_catalog.to_regrole('postgres')::oid)
      FROM relation_check)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      JOIN relation_check AS relation ON relation.oid = policy.polrelid
    )
    AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
      EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
    AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
      EXCEPT ALL SELECT actual.* FROM actual_acl AS actual),
    false
  ) INTO v_boundaries_exact;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', class_row.oid::text,
      'acl', class_row.relacl::text,
      'rls', class_row.relrowsecurity,
      'force_rls', class_row.relforcerowsecurity,
      'policy', policy.polname,
      'command', policy.polcmd,
      'roles', policy.polroles::text,
      'qual', policy.polqual::text,
      'with_check', policy.polwithcheck::text
    ) ORDER BY class_row.oid, policy.polname
  ), '[]'::jsonb)::text) INTO v_boundary_before
  FROM pg_catalog.pg_class AS class_row
  LEFT JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = class_row.oid
  WHERE class_row.oid IN (
    pg_catalog.to_regclass('public.expense_activity'),
    pg_catalog.to_regclass('public.expense_activity_audience'),
    pg_catalog.to_regclass('public.recent_events')
  );

  v_invalid_count := (pg_catalog.length(v_helper_body)
    - pg_catalog.length(pg_catalog.replace(v_helper_body, v_invalid_token, '')))
    / pg_catalog.length(v_invalid_token);
  v_corrected_count := (pg_catalog.length(v_helper_body)
    - pg_catalog.length(pg_catalog.replace(v_helper_body, v_corrected_token, '')))
    / pg_catalog.length(v_corrected_token);

  IF NOT COALESCE(v_contracts_exact, false)
    OR NOT COALESCE(v_acl_exact, false)
    OR NOT COALESCE(v_boundaries_exact, false)
    OR pg_catalog.md5(pg_catalog.replace(v_apply_body, E'\r\n', E'\n')) <> v_apply_hash
    OR pg_catalog.md5(pg_catalog.replace(v_dispute_body, E'\r\n', E'\n')) <> v_dispute_hash
    OR pg_catalog.md5(pg_catalog.replace(v_mutation_body, E'\r\n', E'\n')) <> v_mutation_hash
    OR pg_catalog.md5(pg_catalog.replace(v_discovery_body, E'\r\n', E'\n')) <> v_discovery_hash
  THEN
    RAISE EXCEPTION 'expense_sql167_partial_or_predecessor_drift';
  END IF;

  IF pg_catalog.md5(pg_catalog.replace(v_helper_body, E'\r\n', E'\n')) = v_target_hash
    AND v_invalid_count = 0 AND v_corrected_count = 1
  THEN
    RETURN;
  END IF;

  IF pg_catalog.md5(pg_catalog.replace(v_helper_body, E'\r\n', E'\n')) <> v_predecessor_hash
    OR v_invalid_count <> 1 OR v_corrected_count <> 0
  THEN
    RAISE EXCEPTION 'expense_sql167_partial_or_predecessor_drift';
  END IF;

  v_target_body := pg_catalog.replace(v_helper_body, v_invalid_token, v_corrected_token);
  IF pg_catalog.md5(pg_catalog.replace(v_target_body, E'\r\n', E'\n')) <> v_target_hash
    OR pg_catalog.replace(v_target_body, v_corrected_token, v_invalid_token)
      IS DISTINCT FROM v_helper_body
  THEN
    RAISE EXCEPTION 'expense_sql167_target_derivation_failed';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.expense_record_private_recent(p_group_id uuid,p_actor_id uuid,p_recipient_user_ids uuid[],p_event_type text,p_expense_id uuid,p_expense_title text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '', v_target_body
  );
  ALTER FUNCTION public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)
    OWNER TO postgres;
  REVOKE ALL ON FUNCTION public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)
    FROM PUBLIC, anon, authenticated, service_role;

  v_post_oid := pg_catalog.to_regprocedure(
    'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
  );
  SELECT routine.prosrc INTO v_post_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_post_oid;

  WITH expected(
    signature, argument_names, arguments, result_type, volatility,
    source_hash, service_execute, direct_helper_calls
  ) AS MATERIALIZED (
    VALUES
      ('public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)',
       ARRAY['p_group_id','p_actor_id','p_recipient_user_ids','p_event_type','p_expense_id','p_expense_title']::text[],
       'p_group_id uuid, p_actor_id uuid, p_recipient_user_ids uuid[], p_event_type text, p_expense_id uuid, p_expense_title text',
       'uuid', 'v'::"char", v_target_hash, false, 0),
      ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
       ARRAY['p_actor_id','p_group_id','p_member_id','p_target_user_id','p_proof_kind','p_relationship_id','p_event_id','p_event_participant_id','p_cancel_pending_invitations']::text[],
       'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
       'bigint', 'v'::"char", v_apply_hash, false, 1),
      ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
       ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_expected_financial_version']::text[],
       'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
       'jsonb', 'v'::"char", v_dispute_hash, true, 1),
      ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',
       ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_relationship_id','p_expected_financial_version']::text[],
       'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_relationship_id uuid, p_expected_financial_version bigint',
       'jsonb', 'v'::"char", v_mutation_hash, true, 0),
      ('public.expense_get_relationship_identity_management_v1(uuid,uuid)',
       ARRAY['p_actor_id','p_expense_id']::text[],
       'p_actor_id uuid, p_expense_id uuid',
       'jsonb', 's'::"char", v_discovery_hash, true, 0)
  ), checked AS MATERIALIZED (
    SELECT expected.*, routine.oid,
      routine.prokind = 'f'
      AND routine.pronargs = pg_catalog.cardinality(expected.argument_names)
      AND routine.proargnames = expected.argument_names
      AND pg_catalog.pg_get_function_arguments(routine.oid) = expected.arguments
      AND routine.prorettype = expected.result_type::pg_catalog.regtype
      AND NOT routine.proretset AND routine.provolatile = expected.volatility
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      )) = expected.source_hash
      AND (pg_catalog.length(routine.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          routine.prosrc, 'public.expense_record_private_recent(', ''
        ))) / pg_catalog.length('public.expense_record_private_recent(')
          = expected.direct_helper_calls AS exact
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  )
  SELECT COALESCE(
    pg_catalog.count(oid) = 5 AND pg_catalog.bool_and(exact), false
  ) INTO v_post_contracts_exact
  FROM checked;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected(function_oid, service_execute) AS MATERIALIZED (
    VALUES
      (pg_catalog.to_regprocedure('public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'), false),
      (pg_catalog.to_regprocedure('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'), false),
      (pg_catalog.to_regprocedure('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'), true),
      (pg_catalog.to_regprocedure('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'), true),
      (pg_catalog.to_regprocedure('public.expense_get_relationship_identity_management_v1(uuid,uuid)'), true)
  ), expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT expected.function_oid, roles.postgres_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected CROSS JOIN roles
    UNION ALL
    SELECT expected.function_oid, roles.service_role_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected CROSS JOIN roles WHERE expected.service_execute
  ), actual_acl AS MATERIALIZED (
    SELECT routine.oid AS function_oid, acl.grantee, acl.grantor,
      acl.privilege_type, acl.is_grantable
    FROM expected
    JOIN pg_catalog.pg_proc AS routine ON routine.oid = expected.function_oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
  ), effective_acl AS MATERIALIZED (
    SELECT expected.function_oid,
      pg_catalog.has_function_privilege(
        roles.service_role_oid, expected.function_oid, 'EXECUTE'
      ) = expected.service_execute AS service_exact,
      NOT pg_catalog.has_function_privilege(
        roles.anon_oid, expected.function_oid, 'EXECUTE'
      ) AS anon_denied,
      NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, expected.function_oid, 'EXECUTE'
      ) AS authenticated_denied
    FROM expected CROSS JOIN roles
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 8
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 8
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected_row.* FROM expected_acl AS expected_row)
      AND NOT EXISTS (SELECT expected_row.* FROM expected_acl AS expected_row
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND (SELECT pg_catalog.count(*) = 5
        AND pg_catalog.bool_and(service_exact AND anon_denied AND authenticated_denied)
        FROM effective_acl), false
  ) INTO v_post_acl_exact
  FROM roles;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'relation', class_row.oid::text,
      'acl', class_row.relacl::text,
      'rls', class_row.relrowsecurity,
      'force_rls', class_row.relforcerowsecurity,
      'policy', policy.polname,
      'command', policy.polcmd,
      'roles', policy.polroles::text,
      'qual', policy.polqual::text,
      'with_check', policy.polwithcheck::text
    ) ORDER BY class_row.oid, policy.polname
  ), '[]'::jsonb)::text) INTO v_boundary_after
  FROM pg_catalog.pg_class AS class_row
  LEFT JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = class_row.oid
  WHERE class_row.oid IN (
    pg_catalog.to_regclass('public.expense_activity'),
    pg_catalog.to_regclass('public.expense_activity_audience'),
    pg_catalog.to_regclass('public.recent_events')
  );
  WITH expected_relation(signature, service_privileges) AS MATERIALIZED (
    VALUES
      ('public.expense_activity'::text, ARRAY['SELECT']::text[]),
      ('public.expense_activity_audience'::text, ARRAY[]::text[]),
      ('public.recent_events'::text, ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[])
  ), relation_check AS MATERIALIZED (
    SELECT expected.*, class_row.oid, class_row.relacl, class_row.relowner,
      class_row.relkind, class_row.relrowsecurity, class_row.relforcerowsecurity
    FROM expected_relation AS expected
    LEFT JOIN pg_catalog.pg_class AS class_row
      ON class_row.oid = pg_catalog.to_regclass(expected.signature)
  ), expected_acl(relation_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT relation.oid, owner_acl.grantee, owner_acl.grantor,
      owner_acl.privilege_type, owner_acl.is_grantable
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.acldefault('r', relation.relowner)
    ) AS owner_acl
    WHERE owner_acl.grantee = relation.relowner
    UNION ALL
    SELECT relation.oid, pg_catalog.to_regrole('service_role')::oid,
      pg_catalog.to_regrole('postgres')::oid, privilege_name, false
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.unnest(relation.service_privileges) AS privilege_name
  ), actual_acl AS MATERIALIZED (
    SELECT relation.oid AS relation_oid, acl.grantee, acl.grantor,
      acl.privilege_type, acl.is_grantable
    FROM relation_check AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      relation.relacl, pg_catalog.acldefault('r', relation.relowner)
    )) AS acl
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(oid) = 3
      AND pg_catalog.bool_and(relkind = 'r')
      AND pg_catalog.bool_and(relrowsecurity)
      AND pg_catalog.bool_and(NOT relforcerowsecurity)
      AND pg_catalog.bool_and(relowner = pg_catalog.to_regrole('postgres')::oid)
      FROM relation_check)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      JOIN relation_check AS relation ON relation.oid = policy.polrelid
    )
    AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
      EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
    AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
      EXCEPT ALL SELECT actual.* FROM actual_acl AS actual), false
  ) INTO v_post_boundaries_exact;

  IF v_post_oid IS DISTINCT FROM v_helper_oid
    OR NOT COALESCE(v_post_contracts_exact, false)
    OR NOT COALESCE(v_post_acl_exact, false)
    OR NOT COALESCE(v_post_boundaries_exact, false)
    OR v_boundary_after IS DISTINCT FROM v_boundary_before
    OR pg_catalog.md5(pg_catalog.replace(v_post_body, E'\r\n', E'\n')) <> v_target_hash
    OR pg_catalog.strpos(v_post_body, v_invalid_token) <> 0
    OR (pg_catalog.length(v_post_body)
      - pg_catalog.length(pg_catalog.replace(v_post_body, v_corrected_token, '')))
      / pg_catalog.length(v_corrected_token) <> 1
  THEN
    RAISE EXCEPTION 'expense_sql167_postcondition_failed';
  END IF;
END;
$migration$;

COMMIT;
