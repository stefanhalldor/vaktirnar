BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
constants AS MATERIALIZED (
  SELECT
    '46a55ef53d35e1385cce6b9689705856'::text AS predecessor_hash,
    'd87efae16a77f09eb82ca8ec2a1fca35'::text AS target_hash,
    '819b2e024aac1e00c7e14145b0d6b373'::text AS apply_hash,
    '7e6426c8e43efa3bb7d725bf6b1c807c'::text AS dispute_hash,
    '257e4ad0dc53277b984272baadd8a3bf'::text AS mutation_hash,
    'd97158cb09a138b962382747c6badbca'::text AS discovery_hash,
    'pg_catalog.nullif('::text AS invalid_token,
    'NULLIF('::text AS corrected_token
), roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), expected_functions(
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
     'bigint', 'v'::"char", '819b2e024aac1e00c7e14145b0d6b373', false),
    ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
     ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_expected_financial_version']::text[],
     'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
     'jsonb', 'v'::"char", '7e6426c8e43efa3bb7d725bf6b1c807c', true),
    ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',
     ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_relationship_id','p_expected_financial_version']::text[],
     'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_relationship_id uuid, p_expected_financial_version bigint',
     'jsonb', 'v'::"char", '257e4ad0dc53277b984272baadd8a3bf', true),
    ('public.expense_get_relationship_identity_management_v1(uuid,uuid)',
     ARRAY['p_actor_id','p_expense_id']::text[],
     'p_actor_id uuid, p_expense_id uuid',
     'jsonb', 's'::"char", 'd97158cb09a138b962382747c6badbca', true)
), functions AS MATERIALIZED (
  SELECT expected.*, routine.oid, routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_md5,
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
      AND routine.proowner = roles.postgres_oid AS metadata_exact
  FROM expected_functions AS expected
  CROSS JOIN roles
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), helper AS MATERIALIZED (
  SELECT * FROM functions
  WHERE signature = 'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
), caller_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2
    AND pg_catalog.bool_and(metadata_exact AND source_md5 = source_hash)
    AND pg_catalog.bool_and(
      (pg_catalog.length(prosrc) - pg_catalog.length(pg_catalog.replace(
        prosrc, 'public.expense_record_private_recent(', ''
      ))) / pg_catalog.length('public.expense_record_private_recent(') = 1
    ) AS exact
  FROM functions
  WHERE signature IN (
    'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
    'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
  )
), protected_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2
    AND pg_catalog.bool_and(metadata_exact AND source_md5 = source_hash) AS exact
  FROM functions
  WHERE signature IN (
    'public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',
    'public.expense_get_relationship_identity_management_v1(uuid,uuid)'
  )
), expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT function_row.oid, roles.postgres_oid, roles.postgres_oid,
    'EXECUTE'::text, false
  FROM functions AS function_row CROSS JOIN roles
  UNION ALL
  SELECT function_row.oid, roles.service_role_oid, roles.postgres_oid,
    'EXECUTE'::text, false
  FROM functions AS function_row CROSS JOIN roles
  WHERE function_row.service_execute
), actual_acl AS MATERIALIZED (
  SELECT routine.oid AS function_oid, acl.grantee, acl.grantor,
    acl.privilege_type, acl.is_grantable
  FROM functions AS expected
  JOIN pg_catalog.pg_proc AS routine ON routine.oid = expected.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS acl
), effective_acl AS MATERIALIZED (
  SELECT function_row.oid,
    pg_catalog.has_function_privilege(
      roles.service_role_oid, function_row.oid, 'EXECUTE'
    ) = function_row.service_execute AS service_exact,
    NOT pg_catalog.has_function_privilege(
      roles.anon_oid, function_row.oid, 'EXECUTE'
    ) AS anon_denied,
    NOT pg_catalog.has_function_privilege(
      roles.authenticated_oid, function_row.oid, 'EXECUTE'
    ) AS authenticated_denied
  FROM functions AS function_row CROSS JOIN roles
), acl_contract AS MATERIALIZED (
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_acl) = 8
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 8
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND (SELECT pg_catalog.count(*) = 5
        AND pg_catalog.bool_and(service_exact AND anon_denied AND authenticated_denied)
        FROM effective_acl), false
  ) AS exact
), expected_relations(signature, service_privileges) AS MATERIALIZED (
  VALUES
    ('public.expense_activity'::text, ARRAY['SELECT']::text[]),
    ('public.expense_activity_audience'::text, ARRAY[]::text[]),
    ('public.recent_events'::text, ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[])
), relations AS MATERIALIZED (
  SELECT expected.*, class_row.oid, class_row.relacl, class_row.relowner,
    class_row.relkind, class_row.relrowsecurity, class_row.relforcerowsecurity
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected.signature)
), expected_relation_acl(relation_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT relation.oid, owner_acl.grantee, owner_acl.grantor,
    owner_acl.privilege_type, owner_acl.is_grantable
  FROM relations AS relation CROSS JOIN roles
  CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.acldefault('r', relation.relowner)
    ) AS owner_acl
  WHERE owner_acl.grantee = relation.relowner
  UNION ALL
  SELECT relation.oid, roles.service_role_oid, roles.postgres_oid, privilege_name, false
  FROM relations AS relation CROSS JOIN roles
  CROSS JOIN LATERAL pg_catalog.unnest(relation.service_privileges) AS privilege_name
), actual_relation_acl AS MATERIALIZED (
  SELECT relation.oid AS relation_oid, acl.grantee, acl.grantor,
    acl.privilege_type, acl.is_grantable
  FROM relations AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    relation.relacl, pg_catalog.acldefault('r', relation.relowner)
  )) AS acl
), boundary_contract AS MATERIALIZED (
  SELECT COALESCE(
    (SELECT pg_catalog.count(oid) = 3
      AND pg_catalog.bool_and(relkind = 'r')
      AND pg_catalog.bool_and(relrowsecurity)
      AND pg_catalog.bool_and(NOT relforcerowsecurity)
      AND pg_catalog.bool_and(relowner = roles.postgres_oid)
      FROM relations CROSS JOIN roles)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      JOIN relations AS relation ON relation.oid = policy.polrelid
    )
    AND NOT EXISTS (SELECT actual.* FROM actual_relation_acl AS actual
      EXCEPT ALL SELECT expected.* FROM expected_relation_acl AS expected)
    AND NOT EXISTS (SELECT expected.* FROM expected_relation_acl AS expected
      EXCEPT ALL SELECT actual.* FROM actual_relation_acl AS actual), false
  ) AS exact
), state AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    COALESCE((SELECT metadata_exact FROM helper), false) AS helper_contract_exact,
    COALESCE((SELECT exact FROM caller_contract), false) AS direct_callers_exact,
    COALESCE((SELECT exact FROM protected_contract), false) AS protected_functions_exact,
    COALESCE((SELECT exact FROM acl_contract), false) AS acl_exact,
    COALESCE((SELECT exact FROM boundary_contract), false) AS security_boundaries_exact,
    COALESCE((SELECT source_md5 = constants.predecessor_hash FROM helper), false)
      AS predecessor_source_exact,
    COALESCE((SELECT source_md5 = constants.target_hash FROM helper), false)
      AS target_source_exact,
    COALESCE((SELECT (pg_catalog.length(prosrc)
      - pg_catalog.length(pg_catalog.replace(prosrc, constants.invalid_token, '')))
      / pg_catalog.length(constants.invalid_token) FROM helper), 0) AS invalid_token_count,
    COALESCE((SELECT (pg_catalog.length(prosrc)
      - pg_catalog.length(pg_catalog.replace(prosrc, constants.corrected_token, '')))
      / pg_catalog.length(constants.corrected_token) FROM helper), 0) AS corrected_token_count
  FROM constants
)
SELECT executor_ok, helper_contract_exact, direct_callers_exact,
  protected_functions_exact, acl_exact, security_boundaries_exact,
  predecessor_source_exact, target_source_exact,
  invalid_token_count, corrected_token_count,
  CASE
    WHEN executor_ok AND helper_contract_exact AND direct_callers_exact
      AND protected_functions_exact AND acl_exact AND security_boundaries_exact
      AND predecessor_source_exact AND NOT target_source_exact
      AND invalid_token_count = 1 AND corrected_token_count = 0
      THEN 'PREDECESSOR_READY'
    WHEN executor_ok AND helper_contract_exact AND direct_callers_exact
      AND protected_functions_exact AND acl_exact AND security_boundaries_exact
      AND target_source_exact AND NOT predecessor_source_exact
      AND invalid_token_count = 0 AND corrected_token_count = 1
      THEN 'EXACT_INSTALLED'
    ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
  END AS installation_state
FROM state;

ROLLBACK;
