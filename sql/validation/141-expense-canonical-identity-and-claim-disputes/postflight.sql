-- SQL141 read-only postflight. Release only when postconditions_ok is true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH target_relations AS (
  SELECT relation_name, relation_oid
  FROM (VALUES
    ('expense_member_identity_bindings'::text,
      pg_catalog.to_regclass('public.expense_member_identity_bindings')),
    ('expense_claim_disputes'::text,
      pg_catalog.to_regclass('public.expense_claim_disputes'))
  ) AS expected(relation_name, relation_oid)
), expected_functions AS (
  SELECT * FROM (VALUES
    ('public.expense_identity_request_id(text,uuid)',
      '496d1e1dd94d149cf607198c9271a25d', 'sql', 'i', true, 'uuid', false, 0),
    ('public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)',
      '46a55ef53d35e1385cce6b9689705856', 'plpgsql', 'v', false, 'uuid', false, 0),
    ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
      '819b2e024aac1e00c7e14145b0d6b373', 'plpgsql', 'v', false, 'bigint', false, 0),
    ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      '5da34435052493c4c993bc88e82a72dd', 'plpgsql', 'v', false, 'jsonb', false, 1),
    ('public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)',
      'c3a1ab7746d50ed552c625bbc95efbab', 'plpgsql', 'v', false, 'jsonb', false, 0),
    ('public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)',
      '9b619be434e5e7a80d6dbfbf7c3d2169', 'plpgsql', 'v', false, 'jsonb', false, 2),
    ('public.expense_add_share_collaborator(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid)',
      'd85ba01c7635bffed9f47a0581715e93', 'plpgsql', 'v', false, 'jsonb', false, 2),
    ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
      '22425321bf1c82698f5739f24111c068', 'plpgsql', 'v', false, 'jsonb', false, 0),
    ('public.expense_get_event_identity_candidates(uuid,uuid)',
      '5ae2424f6b365dc7e4643f536ab5475b', 'plpgsql', 's', false, 'jsonb', false, 0),
    ('public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)',
      '9eb4943bc94e75c705a01fa79de528ba', 'plpgsql', 'v', false, 'jsonb', false, 0),
    ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
      '7e6426c8e43efa3bb7d725bf6b1c807c', 'plpgsql', 'v', false, 'jsonb', false, 0),
    ('public.expense_get_claim_context(uuid,uuid)',
      'acb7f9e644b219b923fa946dfa4da7b8', 'plpgsql', 's', false, 'jsonb', false, 0),
    ('public.expense_guard_disputed_settlement()',
      'b8eea82fe916bfa90226bd8857543d69', 'plpgsql', 'v', false, 'trigger', false, 0),
    ('public.expense_resolve_recent_targets(uuid,uuid[])',
      'cc80a8425fde2ca8014f98b49772cc26', 'plpgsql', 's', false, 'record', true, 0)
  ) AS contract(
    signature, body_md5, language_name, volatility, is_strict,
    result_type, returns_set, argument_defaults
  )
), relation_contract AS (
  SELECT pg_catalog.count(*) = 2
      AND pg_catalog.bool_and(class_row.relrowsecurity)
      AND pg_catalog.bool_and(class_row.relforcerowsecurity)
      AND pg_catalog.bool_and(owner_role.rolname = 'postgres')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        JOIN target_relations AS target ON target.relation_oid = policy.polrelid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM target_relations AS target
        JOIN pg_catalog.pg_class AS target_class ON target_class.oid = target.relation_oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
          target_class.relacl,
          pg_catalog.acldefault('r', target_class.relowner)
        )) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
        WHERE acl.grantee = 0
           OR COALESCE(grantee_role.rolname, '') IN ('anon', 'authenticated', 'service_role')
      ) AS ok
  FROM target_relations AS target
  JOIN pg_catalog.pg_class AS class_row ON class_row.oid = target.relation_oid
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class_row.relowner
), function_body_contract AS (
  SELECT pg_catalog.count(*) = 14
      AND pg_catalog.bool_and(
        pg_catalog.md5(pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'))
          = expected.body_md5
        AND language_row.lanname = expected.language_name
        AND function_row.provolatile = expected.volatility::"char"
        AND function_row.proisstrict = expected.is_strict
        AND function_row.prorettype = expected.result_type::pg_catalog.regtype
        AND function_row.proretset = expected.returns_set
        AND function_row.pronargdefaults = expected.argument_defaults
        AND function_row.proparallel = 'u'
        AND NOT function_row.proleakproof
        AND function_row.prosecdef
        AND owner_role.rolname = 'postgres'
        AND pg_catalog.cardinality(COALESCE(
          function_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
      ) AS ok
  FROM expected_functions AS expected
  JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = function_row.proowner
), function_contract AS (
  SELECT
    pg_catalog.to_regprocedure('public.expense_identity_request_id(text,uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_get_event_identity_candidates(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_get_claim_context(uuid,uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_guard_disputed_settlement()') IS NOT NULL
      AS functions_exist,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
      WHERE function_row.oid IN (
        pg_catalog.to_regprocedure('public.expense_identity_request_id(text,uuid)'),
        pg_catalog.to_regprocedure(
          'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
        ),
        pg_catalog.to_regprocedure(
          'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
        ),
        pg_catalog.to_regprocedure('public.expense_guard_disputed_settlement()')
      )
        AND (acl.grantee = 0
          OR COALESCE(grantee_role.rolname, '') IN ('anon', 'authenticated', 'service_role'))
        AND acl.privilege_type = 'EXECUTE'
    ) AS helpers_private,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid IN (
        pg_catalog.to_regprocedure(
          'public.expense_get_event_identity_candidates(uuid,uuid)'
        ),
        pg_catalog.to_regprocedure(
          'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
        ),
        pg_catalog.to_regprocedure(
          'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
        ),
        pg_catalog.to_regprocedure('public.expense_get_claim_context(uuid,uuid)'),
        pg_catalog.to_regprocedure(
          'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
        ),
        pg_catalog.to_regprocedure(
          'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
        ),
        pg_catalog.to_regprocedure('public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)'),
        pg_catalog.to_regprocedure(
          'public.expense_add_share_collaborator(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid)'
        ),
        pg_catalog.to_regprocedure(
          'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
        ),
        pg_catalog.to_regprocedure('public.expense_resolve_recent_targets(uuid,uuid[])')
      )
        AND (NOT pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE'))
    ) AS public_rpc_acl_ok
), trigger_contract AS (
  SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(trigger_row.tgenabled = 'O')
      AND pg_catalog.bool_and(trigger_row.tgfoid =
        pg_catalog.to_regprocedure('public.expense_guard_disputed_settlement()'))
      AND pg_catalog.bool_and(pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
        LIKE 'CREATE TRIGGER expense_repayments_dispute_guard BEFORE INSERT OR UPDATE%')
      AS ok
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.expense_repayments'::pg_catalog.regclass
    AND trigger_row.tgname = 'expense_repayments_dispute_guard'
    AND NOT trigger_row.tgisinternal
), shape_contract AS (
  SELECT
    COALESCE((
      SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
          LIKE '%status = ''disputed''::text%'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
          NOT LIKE '%resolved%'
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.expense_claim_disputes'::pg_catalog.regclass
        AND constraint_row.conname = 'expense_claim_disputes_status_check'
    ), false) AS dispute_only,
    (SELECT pg_catalog.count(*) FROM public.expense_member_identity_bindings)
      AS identity_binding_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_claim_disputes)
      AS dispute_rows,
    EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_participant_sources
    ) AS historical_participant_sources_present,
    COALESCE(pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.expense_get_event_identity_candidates(uuid,uuid)'
      )
    ), 'teskeid_event_expense_participant_sources') = 0, false)
      AND COALESCE(pg_catalog.strpos(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
        )
      ), 'teskeid_event_expense_participant_sources') = 0, false)
      AS historical_participant_sources_ignored_ok
), activity_contract AS (
  SELECT pg_catalog.count(*) = 2 AS ok
  FROM (VALUES ('expense_identity_bound'::text), ('expense_claim_disputed'::text)) AS expected(event_type)
  WHERE EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.expense_activity'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_activity_event_type_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true) LIKE
        '%' || expected.event_type || '%'
  )
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  COALESCE(relation_contract.ok, false) AS private_relations_ok,
  COALESCE(function_body_contract.ok, false) AS functions_exact_ok,
  function_contract.functions_exist,
  function_contract.helpers_private,
  function_contract.public_rpc_acl_ok,
  COALESCE(trigger_contract.ok, false) AS settlement_guard_ok,
  shape_contract.dispute_only,
  shape_contract.identity_binding_rows,
  shape_contract.dispute_rows,
  shape_contract.historical_participant_sources_present,
  shape_contract.historical_participant_sources_ignored_ok,
  activity_contract.ok AS activity_contract_ok,
  COALESCE(relation_contract.ok, false)
    AND COALESCE(function_body_contract.ok, false)
    AND function_contract.functions_exist
    AND function_contract.helpers_private
    AND function_contract.public_rpc_acl_ok
    AND COALESCE(trigger_contract.ok, false)
    AND shape_contract.dispute_only
    AND shape_contract.historical_participant_sources_ignored_ok
    AND activity_contract.ok AS postconditions_ok
FROM relation_contract, function_body_contract, function_contract,
  trigger_contract, shape_contract, activity_contract;
ROLLBACK;
