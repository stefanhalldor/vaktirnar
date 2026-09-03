-- SQL168 PREFLIGHT: read-only TES-24 lifecycle, settlement-lock and predecessor gate.
BEGIN TRANSACTION READ ONLY;

DO $dynamic_state$
DECLARE
  v_unbound_count integer := 0;
BEGIN
  IF pg_catalog.to_regclass('public.expense_edit_revision_bindings') IS NOT NULL THEN
    EXECUTE $query$
      SELECT pg_catalog.count(*)::integer
      FROM public.expense_private_drafts AS draft
      LEFT JOIN public.expense_edit_revision_bindings AS binding
        ON binding.draft_id = draft.id
      WHERE draft.context_type = 'edit' AND binding.draft_id IS NULL
    $query$ INTO v_unbound_count;
  ELSE
    SELECT pg_catalog.count(*)::integer INTO v_unbound_count
    FROM public.expense_private_drafts AS draft
    WHERE draft.context_type = 'edit';
  END IF;
  PERFORM pg_catalog.set_config(
    'teskeid.sql168_unbound_edit_count', v_unbound_count::text, true
  );
END;
$dynamic_state$;

WITH required_function(signature, source_hash, expected_config, expected_service_execute) AS (
  VALUES
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      'e655a802f4fe1cd5f98b2f0d22815178',
      ARRAY['search_path=pg_catalog, public']::text[], true),
    ('public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)',
      'c3a1ab7746d50ed552c625bbc95efbab',
      ARRAY['search_path=""']::text[], true),
    ('public.expense_begin_request(uuid,uuid,text,text)',
      'd8631d60cc2f0df56dd9e958537db2a7',
      ARRAY['search_path=""']::text[], false),
    ('public.expense_finish_request(uuid,uuid,jsonb)',
      '194c5812642b4aaaafe888bc0ba5aa29',
      ARRAY['search_path=""']::text[], false)
), expected_direct_draft_writer(
  signature, predecessor_source_hash, target_source_hash, is_new_candidate
) AS (
  VALUES
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'e655a802f4fe1cd5f98b2f0d22815178', '4c55e9caaabb3a287dfa06ed55ab1fe7', false),
    ('public.expense_delete_private_draft(uuid,uuid)', '6cb30e799507447b2f73a977a7cc437e', '767759a756a52c8b90a57af6de1b9a6f', false),
    ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088', '14ac1abc9046fea4812ac652a9b96088', false),
    ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'a1bba12665e8651121bac578d7e936d4', 'a1bba12665e8651121bac578d7e936d4', false),
    ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', NULL, '732375dc60f72f95f8232677b2ae0f89', true),
    ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', NULL, '2a7bbc7fda11f3393a55171e56bf3614', true),
    ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', NULL, 'd8cd26c2d1b07475de60846222e6734a', true),
    ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', NULL, 'b25d37dd096e08a402161c1301c23fc8', true)
), actual_direct_draft_writer AS (
  SELECT pg_catalog.format(
    '%I.%I(%s)', namespace_row.nspname, routine.proname,
    pg_catalog.replace(pg_catalog.oidvectortypes(routine.proargtypes), ' ', '')
  ) AS signature,
  pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
  routine.proowner = pg_catalog.to_regrole('postgres')::oid
    AND routine.prosecdef
    AND pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      WHERE acl.grantor <> pg_catalog.to_regrole('postgres')::oid
         OR acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
         OR acl.grantee NOT IN (
           pg_catalog.to_regrole('postgres')::oid,
           pg_catalog.to_regrole('service_role')::oid
         )
    ) AS metadata_acl_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = routine.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND routine.prosrc ~* '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public[.]expense_private_drafts'
), writer_state AS (
  SELECT
    (SELECT pg_catalog.count(*)::integer
     FROM actual_direct_draft_writer AS actual
     WHERE NOT EXISTS (
       SELECT 1 FROM expected_direct_draft_writer AS expected
       WHERE expected.signature = actual.signature
     )) AS unexpected_writer_count,
    (SELECT pg_catalog.count(*)::integer
     FROM expected_direct_draft_writer AS expected
     WHERE NOT expected.is_new_candidate AND NOT EXISTS (
       SELECT 1 FROM actual_direct_draft_writer AS actual
       WHERE actual.signature = expected.signature
     )) AS missing_predecessor_writer_count,
    (SELECT pg_catalog.count(*)::integer
     FROM expected_direct_draft_writer AS expected
     WHERE NOT EXISTS (
       SELECT 1 FROM actual_direct_draft_writer AS actual
       WHERE actual.signature = expected.signature
     )) AS missing_installed_writer_count,
    (SELECT pg_catalog.count(*)::integer
     FROM actual_direct_draft_writer AS actual
     JOIN expected_direct_draft_writer AS expected
       ON expected.signature = actual.signature
     WHERE expected.is_new_candidate) AS target_writer_candidate_count,
    COALESCE((
      SELECT pg_catalog.bool_and(
        actual.metadata_acl_exact
          AND actual.source_hash = expected.predecessor_source_hash
      )
      FROM actual_direct_draft_writer AS actual
      JOIN expected_direct_draft_writer AS expected USING (signature)
      WHERE NOT expected.is_new_candidate
    ), false) AS predecessor_metadata_acl_exact,
    COALESCE((
      SELECT pg_catalog.bool_and(
        actual.metadata_acl_exact
          AND actual.source_hash = expected.target_source_hash
      )
      FROM actual_direct_draft_writer AS actual
      JOIN expected_direct_draft_writer AS expected USING (signature)
    ), false) AS installed_metadata_acl_exact
), function_contract AS (
  SELECT required_function.signature,
         procedure.oid IS NOT NULL AS target_exists,
         pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
         pg_catalog.pg_get_function_result(procedure.oid) AS function_result,
         procedure.proconfig,
         procedure.proconfig = required_function.expected_config AS search_path_exact,
         procedure.prosecdef,
         procedure.provolatile,
         language.lanname,
         owner_role.rolname AS owner_name,
         pg_catalog.md5(pg_catalog.replace(procedure.prosrc, E'\r\n', E'\n'))
           AS source_md5,
         required_function.source_hash,
         required_function.expected_service_execute,
         pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
           AS service_role_execute,
         NOT pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
           AS anon_revoked,
         NOT pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
           AS authenticated_revoked
  FROM required_function
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(required_function.signature)
  LEFT JOIN pg_catalog.pg_language AS language ON language.oid = procedure.prolang
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
), function_acl AS (
  SELECT function_row.signature, acl.grantee, acl.grantor,
         acl.privilege_type, acl.is_grantable
  FROM function_contract AS function_row
  JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(function_row.signature)
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
  )) AS acl
), expected_function_acl AS (
  SELECT required_function.signature,
         pg_catalog.to_regrole('postgres')::oid AS grantee,
         pg_catalog.to_regrole('postgres')::oid AS grantor,
         'EXECUTE'::text AS privilege_type,
         false AS is_grantable
  FROM required_function
  UNION ALL
  SELECT required_function.signature,
         pg_catalog.to_regrole('service_role')::oid AS grantee,
         pg_catalog.to_regrole('postgres')::oid AS grantor,
         'EXECUTE'::text AS privilege_type,
         false AS is_grantable
  FROM required_function
  WHERE required_function.expected_service_execute
), function_acl_state AS (
  SELECT NOT EXISTS (
           SELECT signature, grantee, grantor, privilege_type, is_grantable
           FROM function_acl
           EXCEPT ALL
           SELECT signature, grantee, grantor, privilege_type, is_grantable
           FROM expected_function_acl
         )
         AND NOT EXISTS (
           SELECT signature, grantee, grantor, privilege_type, is_grantable
           FROM expected_function_acl
           EXCEPT ALL
           SELECT signature, grantee, grantor, privilege_type, is_grantable
           FROM function_acl
         )
         AND (
           SELECT pg_catalog.count(*) = 4
             AND COALESCE(pg_catalog.bool_and(
               service_role_execute = expected_service_execute
               AND anon_revoked IS TRUE
               AND authenticated_revoked IS TRUE
             ), false)
           FROM function_contract
         ) AS exact
), function_dependency_state AS (
  SELECT pg_catalog.count(*) = 4
       AND pg_catalog.bool_and(
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = procedure.oid
             AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
             AND dependency.refobjid = pg_catalog.to_regnamespace('public')
         )
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           JOIN pg_catalog.pg_language AS language
             ON language.oid = dependency.refobjid
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = procedure.oid
             AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
             AND language.lanname = 'plpgsql'
         )
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = procedure.oid AND dependency.deptype = 'e'
         )
       ) AS exact
  FROM function_contract AS function_row
  JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(function_row.signature)
), function_source_metadata_state AS (
  SELECT pg_catalog.count(*) = 4
       AND COALESCE(pg_catalog.bool_and(
         target_exists AND search_path_exact AND source_md5 = source_hash
         AND prosecdef AND provolatile = 'v' AND lanname = 'plpgsql'
         AND owner_name = 'postgres'
       ), false) AS exact
  FROM function_contract
), predecessor_state AS (
  SELECT function_source_metadata_state.exact
     AND function_acl_state.exact
     AND function_dependency_state.exact AS exact
  FROM function_source_metadata_state
  CROSS JOIN function_acl_state
  CROSS JOIN function_dependency_state
), replacement_predecessor_state AS (
  SELECT
    (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
     FROM pg_catalog.pg_proc AS routine
     WHERE routine.oid = pg_catalog.to_regprocedure(
       'public.expense_simplified_settlement(uuid,text,boolean)'
     )) = 'fe9016a12b1ac987b3b00f314c800c89'
    AND
    (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
     FROM pg_catalog.pg_proc AS routine
     WHERE routine.oid = pg_catalog.to_regprocedure(
       'public.expense_list_visible_shared_drafts(uuid)'
     )) = '59b01785320ce254fb4ac7d6168709bc' AS exact
), expected_target_function(signature, source_hash, is_new_candidate) AS (
  VALUES
    ('public.expense_edit_revision_allocation_digest_v1(uuid)',
      '5d9768dccdd9a7a34d853541772aefdf', true),
    ('public.expense_settlement_eligible_balances_v1(uuid,boolean)',
      'b58245a47cc0c8e306a8769afa508687', true),
    ('public.expense_simplified_settlement(uuid,text,boolean)',
      '3481fb2e9253cf72ef162688c7942945', false),
    ('public.expense_can_open_edit_revision_v1(uuid,uuid)',
      '35244913794fd372184e6ad1fc0b7d02', true),
    ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
      '0c6e7aa35c5ba4627b635511e94d5e8a', true),
    ('public.expense_guard_edit_revision_expense_lifecycle_v1()',
      '9027aed7ed47617145af8c3bbced1fc4', true),
    ('public.expense_guard_edit_revision_group_lifecycle_v1()',
      '534fe5f74b82ce934f9a2868e247ceff', true),
    ('public.expense_guard_edit_revision_member_authority_v1()',
      '2d375364b1cc9e056923dbff3803c1b1', true),
    ('public.expense_guard_repayment_confirmation_eligibility_v1()',
      'ce37d2e99e222f0356125c9ca26ed72f', true),
    ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      'e85b65c38a577ab33f1072173ac8353b', false),
    ('public.expense_list_visible_shared_drafts(uuid)',
      'dbaaca458c70ee18aa36c35864e9ade8', false),
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      '4c55e9caaabb3a287dfa06ed55ab1fe7', false),
    ('public.expense_delete_private_draft(uuid,uuid)',
      '767759a756a52c8b90a57af6de1b9a6f', false),
    ('public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
      '0bf01ffb0b90cf8078da4b8dcd65629c', true),
    ('public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      '3314017996b86c4cda29ef1c3b36a1f2', true),
    ('public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      '1ef4e7a8fc1e412918406b7b8fc31917', true),
    ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)',
      '732375dc60f72f95f8232677b2ae0f89', true),
    ('public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
      '4c67a8fb156d01ba72d2559e68d1416f', true),
    ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)',
      'b25d37dd096e08a402161c1301c23fc8', true),
    ('public.expense_get_edit_revision_state_v1(uuid,uuid)',
      'f26cc24ab01e5b923cc986ca8b19d9c4', true),
    ('public.expense_list_visible_edit_revisions_v1(uuid)',
      '8a0ddb900e607429bec043c920755b80', true),
    ('public.expense_get_shared_edit_revision_v1(uuid,uuid)',
      '82349ff16af2b4885581ac90f454d3a3', true),
    ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)',
      '2a7bbc7fda11f3393a55171e56bf3614', true),
    ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)',
      'd8cd26c2d1b07475de60846222e6734a', true)
), target_function_contract AS (
  SELECT expected.signature, procedure.oid, procedure.proowner,
         procedure.prokind, procedure.prosecdef, procedure.proconfig,
         procedure.provolatile, procedure.proisstrict, procedure.proleakproof,
         procedure.proparallel, procedure.pronargdefaults,
         language_row.lanname AS language_name,
         pg_catalog.md5(pg_catalog.replace(procedure.prosrc, E'\r\n', E'\n'))
           AS source_md5,
         expected.source_hash, expected.is_new_candidate
  FROM expected_target_function AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure.prolang
), target_state AS (
  SELECT pg_catalog.count(*) = 24
       AND pg_catalog.bool_and(
         oid IS NOT NULL AND source_md5 = source_hash
       ) AS target_functions_exact,
       (pg_catalog.count(*) FILTER (
         WHERE oid IS NOT NULL AND is_new_candidate
       ))::integer AS new_target_function_candidate_count,
       pg_catalog.count(*) FILTER (
         WHERE oid IS NOT NULL AND is_new_candidate
       ) > 0 AS any_new_target_function
  FROM target_function_contract
), target_metadata_acl_dependencies_state AS (
  SELECT pg_catalog.count(*) = 24 AND pg_catalog.bool_and(
    function_row.oid IS NOT NULL
    AND function_row.proowner = pg_catalog.to_regrole('postgres')::oid
    AND function_row.prokind = 'f'
    AND function_row.prosecdef
    AND NOT function_row.proisstrict
    AND NOT function_row.proleakproof
    AND function_row.proparallel = 'u'
    AND function_row.pronargdefaults = CASE
      WHEN function_row.signature IN (
        'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
        'public.expense_settlement_eligible_balances_v1(uuid,boolean)',
        'public.expense_simplified_settlement(uuid,text,boolean)'
      ) THEN 1 ELSE 0 END
    AND function_row.language_name = CASE
      WHEN function_row.signature =
        'public.expense_edit_revision_allocation_digest_v1(uuid)'
        THEN 'sql' ELSE 'plpgsql' END
    AND function_row.provolatile = CASE
      WHEN function_row.signature IN (
        'public.expense_edit_revision_allocation_digest_v1(uuid)',
        'public.expense_settlement_eligible_balances_v1(uuid,boolean)',
        'public.expense_simplified_settlement(uuid,text,boolean)',
        'public.expense_can_open_edit_revision_v1(uuid,uuid)',
        'public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
        'public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
        'public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
        'public.expense_get_edit_revision_state_v1(uuid,uuid)',
        'public.expense_list_visible_edit_revisions_v1(uuid)',
        'public.expense_get_shared_edit_revision_v1(uuid,uuid)'
      ) THEN 's'::"char" ELSE 'v'::"char" END
    AND function_row.proconfig = CASE WHEN function_row.signature IN (
      'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      'public.expense_delete_private_draft(uuid,uuid)'
    ) THEN ARRAY['search_path=pg_catalog, public']::text[]
    ELSE ARRAY['search_path=""']::text[] END
    AND pg_catalog.has_function_privilege(
      'service_role', function_row.oid, 'EXECUTE'
    ) = (function_row.signature IN (
      'public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
      'public.expense_list_visible_shared_drafts(uuid)',
      'public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
      'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      'public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      'public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)',
      'public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
      'public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)',
      'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      'public.expense_delete_private_draft(uuid,uuid)',
      'public.expense_get_edit_revision_state_v1(uuid,uuid)',
      'public.expense_list_visible_edit_revisions_v1(uuid)',
      'public.expense_get_shared_edit_revision_v1(uuid,uuid)',
      'public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)',
      'public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)'
    ))
    AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS routine
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      WHERE routine.oid = function_row.oid
        AND (acl.grantor <> pg_catalog.to_regrole('postgres')::oid
          OR acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
          OR (acl.grantee <> pg_catalog.to_regrole('postgres')::oid
            AND (function_row.signature NOT IN (
              'public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
              'public.expense_list_visible_shared_drafts(uuid)',
              'public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
              'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
              'public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
              'public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)',
              'public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
              'public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)',
              'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
              'public.expense_delete_private_draft(uuid,uuid)',
              'public.expense_get_edit_revision_state_v1(uuid,uuid)',
              'public.expense_list_visible_edit_revisions_v1(uuid)',
              'public.expense_get_shared_edit_revision_v1(uuid,uuid)',
              'public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)',
              'public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)'
            ) OR acl.grantee <> pg_catalog.to_regrole('service_role')::oid)))
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = function_row.oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = function_row.oid AND dependency.deptype = 'e'
    )
  ) AS target_metadata_acl_dependencies_exact
  FROM target_function_contract AS function_row
), expected_relation(relation_oid, force_rls) AS (
  VALUES
    (pg_catalog.to_regclass('public.expense_private_drafts'), true),
    (pg_catalog.to_regclass('public.expense_unconfirmed_publications'), true),
    (pg_catalog.to_regclass('public.expense_repayments'), false)
), relation_contract AS (
  SELECT expected_relation.relation_oid, expected_relation.force_rls,
         class.relname, class.relrowsecurity, class.relforcerowsecurity,
         owner_role.rolname AS owner_name
  FROM expected_relation
  LEFT JOIN pg_catalog.pg_class AS class ON class.oid = expected_relation.relation_oid
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class.relowner
), binding_relation_state AS (
  SELECT class_row.oid IS NOT NULL
    AND class_row.relkind = 'r'
    AND class_row.relowner = pg_catalog.to_regrole('postgres')::oid
    AND class_row.relrowsecurity AND class_row.relforcerowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy_row
      WHERE policy_row.polrelid = class_row.oid
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl, pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
      WHERE acl.grantee <> class_row.relowner
        OR acl.grantor <> class_row.relowner OR acl.is_grantable
    )
    AND (SELECT pg_catalog.count(*) = 9
      AND pg_catalog.array_agg(attribute.attname ORDER BY attribute.attnum) = ARRAY[
        'draft_id','expense_id','group_id','actor_user_id','mode',
        'base_financial_version','base_allocation_digest','opened_at','updated_at'
      ]::name[]
      AND pg_catalog.bool_and(attribute.attnotnull)
      AND pg_catalog.bool_and(
        CASE attribute.attname
          WHEN 'draft_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
          WHEN 'expense_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
          WHEN 'group_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
          WHEN 'actor_user_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
          WHEN 'mode' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
          WHEN 'base_financial_version' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'bigint'
          WHEN 'base_allocation_digest' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
          WHEN 'opened_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
          WHEN 'updated_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
          ELSE false
        END
      )
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = class_row.oid
        AND attribute.attnum > 0 AND NOT attribute.attisdropped)
    AND (SELECT pg_catalog.count(*) = 2
      AND pg_catalog.bool_and(attribute.attname IN ('opened_at','updated_at')
        AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = 'now()')
      FROM pg_catalog.pg_attrdef AS default_row
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = default_row.adrelid
       AND attribute.attnum = default_row.adnum
      WHERE default_row.adrelid = class_row.oid)
    AND (SELECT pg_catalog.count(*) = 10
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'p') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'u') = 2
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'f') = 4
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'c') = 3
      AND pg_catalog.bool_and(constraint_row.convalidated
        AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred)
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_pkey'
        AND constraint_row.contype = 'p'
        AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]) = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_expense_id_key'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (expense_id)') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_context_unique'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
          'UNIQUE (draft_id, expense_id, group_id, actor_user_id)') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_expense_id_fkey'
        AND constraint_row.confrelid = pg_catalog.to_regclass('public.expenses')
        AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.conrelid AND attname = 'expense_id')]::smallint[]
        AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
        AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
        AND constraint_row.confdeltype = 'r') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_group_id_fkey'
        AND constraint_row.confrelid = pg_catalog.to_regclass('public.expense_groups')
        AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.conrelid AND attname = 'group_id')]::smallint[]
        AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
        AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
        AND constraint_row.confdeltype = 'r') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_draft_id_fkey'
        AND constraint_row.confrelid = pg_catalog.to_regclass('public.expense_private_drafts')
        AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]
        AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
        AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
        AND constraint_row.confdeltype = 'r') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_actor_user_id_fkey'
        AND constraint_row.confrelid = pg_catalog.to_regclass('auth.users')
        AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.conrelid AND attname = 'actor_user_id')]::smallint[]
        AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
          WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
        AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
        AND constraint_row.confdeltype = 'r') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_mode_check'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
          'CHECK ((mode = ANY (ARRAY[''private''::text, ''shared''::text])))') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_version_check'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
          'CHECK (((base_financial_version >= 0) AND (base_financial_version <= ''9007199254740991''::bigint)))') = 1
      AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_digest_check'
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
          'CHECK ((base_allocation_digest ~ ''^[0-9a-f]{32}$''::text))') = 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = class_row.oid) AS binding_relation_exact
  FROM pg_catalog.pg_class AS class_row
  WHERE class_row.oid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
), legacy_state AS (
  SELECT pg_catalog.count(*)::integer AS legacy_edit_draft_count,
         COALESCE(pg_catalog.current_setting(
           'teskeid.sql168_unbound_edit_count', true
         ), '0')::integer AS unbound_edit_draft_count
  FROM public.expense_private_drafts AS draft
  WHERE draft.context_type = 'edit'
), candidate_state AS (
  SELECT pg_catalog.to_regclass(
           'public.expense_edit_revision_bindings'
         ) IS NOT NULL AS binding_candidate_present,
         target_state.new_target_function_candidate_count,
         target_state.any_new_target_function,
         pg_catalog.to_regclass(
           'public.expense_private_drafts_one_open_edit_per_expense_idx'
         ) IS NOT NULL AS index_candidate_present,
         (SELECT pg_catalog.count(*)::integer
          FROM pg_catalog.pg_trigger AS trigger_row
          WHERE trigger_row.tgname IN (
            'expense_tes24_edit_expense_lifecycle_guard',
            'expense_tes24_edit_group_lifecycle_guard',
            'expense_tes24_edit_member_authority_guard',
            'expense_tes24_repayment_confirmation_guard'
          )) AS trigger_candidate_count
  FROM target_state
), installed AS (
  SELECT candidate_state.binding_candidate_present
      OR candidate_state.any_new_target_function
      OR candidate_state.index_candidate_present
      OR candidate_state.trigger_candidate_count > 0 AS exact_candidate
  FROM candidate_state
), index_state AS (
  SELECT index_row.indisunique, index_row.indisvalid, index_row.indisready,
         index_row.indislive,
         pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) AS predicate,
         pg_catalog.pg_get_indexdef(index_row.indexrelid, 1, true) AS indexed_column,
         access_method.amname, table_namespace.nspname, table_class.relname
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_row.indexrelid
  JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_class.relnamespace
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
  WHERE index_class.relname = 'expense_private_drafts_one_open_edit_per_expense_idx'
    AND table_class.relname = 'expense_private_drafts'
), expected_trigger(trigger_name, relation_oid, function_oid, update_columns) AS (
  VALUES
    ('expense_tes24_edit_expense_lifecycle_guard', pg_catalog.to_regclass('public.expenses'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_expense_lifecycle_v1()'), ARRAY[]::name[]),
    ('expense_tes24_edit_group_lifecycle_guard', pg_catalog.to_regclass('public.expense_groups'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_group_lifecycle_v1()'), ARRAY['status']::name[]),
    ('expense_tes24_edit_member_authority_guard', pg_catalog.to_regclass('public.expense_group_members'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_member_authority_v1()'), ARRAY['role','status','user_id']::name[]),
    ('expense_tes24_repayment_confirmation_guard', pg_catalog.to_regclass('public.expense_repayments'), pg_catalog.to_regprocedure('public.expense_guard_repayment_confirmation_eligibility_v1()'), ARRAY['status']::name[])
), trigger_state AS (
  SELECT pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
    NOT trigger_row.tgisinternal AND trigger_row.tgenabled = 'O'
    AND trigger_row.tgtype = 19
    AND NOT trigger_row.tgdeferrable AND NOT trigger_row.tginitdeferred
    AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
    AND pg_catalog.octet_length(trigger_row.tgargs) = 0
    AND trigger_row.tgrelid = expected.relation_oid
    AND trigger_row.tgfoid = expected.function_oid
    AND COALESCE((SELECT pg_catalog.array_agg(attribute.attname ORDER BY attribute.attname)
      FROM pg_catalog.unnest(trigger_row.tgattr::smallint[]) AS trigger_attribute(attnum)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = trigger_row.tgrelid
       AND attribute.attnum = trigger_attribute.attnum
    ), ARRAY[]::name[]) = expected.update_columns
  ) AS exact
  FROM expected_trigger AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
), repayment_acl_state AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE grant_row.grantee <> 'postgres'
      AND grant_row.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER')
  )::integer AS unexpected_repayment_dml_grant_count
  FROM information_schema.role_table_grants AS grant_row
  WHERE grant_row.table_schema = 'public'
    AND grant_row.table_name = 'expense_repayments'
), public_schema_acl_state AS (
  SELECT pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege('anon', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
    AS exact
)
SELECT legacy_state.legacy_edit_draft_count,
       legacy_state.unbound_edit_draft_count,
       true AS pass_legacy_rows_preserved_inert,
       (SELECT pg_catalog.bool_and(target_exists) FROM function_contract)
         AS pass_predecessor_functions,
       (SELECT pg_catalog.bool_and(search_path_exact) FROM function_contract)
         AS pass_predecessor_search_path,
       (SELECT exact FROM function_source_metadata_state)
         AS pass_predecessor_source_and_metadata,
       (SELECT exact FROM function_acl_state) AS pass_predecessor_acl,
       (SELECT exact FROM function_dependency_state)
         AS pass_predecessor_dependencies,
       predecessor_state.exact AS pass_predecessor_source_and_acl,
       replacement_predecessor_state.exact AS pass_replacement_predecessor_source,
       (SELECT pg_catalog.count(*) = 3
            AND pg_catalog.bool_and(
              relation_oid IS NOT NULL
              AND relrowsecurity
              AND relforcerowsecurity = force_rls
              AND owner_name = 'postgres'
            ) FROM relation_contract)
         AS pass_security_relations,
       target_state.target_functions_exact,
       COALESCE((SELECT target_metadata_acl_dependencies_exact
         FROM target_metadata_acl_dependencies_state), false)
         AS target_metadata_acl_dependencies_exact,
       COALESCE((SELECT binding_relation_exact FROM binding_relation_state), false)
         AS binding_relation_exact,
       COALESCE((SELECT exact FROM trigger_state), false)
         AS trigger_update_columns_exact,
       candidate_state.binding_candidate_present,
       candidate_state.new_target_function_candidate_count,
       candidate_state.index_candidate_present,
       candidate_state.trigger_candidate_count,
       repayment_acl_state.unexpected_repayment_dml_grant_count,
       public_schema_acl_state.exact AS public_schema_acl_exact,
       writer_state.unexpected_writer_count = 0
         AND (
           (writer_state.missing_predecessor_writer_count = 0
             AND writer_state.target_writer_candidate_count = 0
             AND writer_state.predecessor_metadata_acl_exact)
           OR
           (writer_state.missing_installed_writer_count = 0
             AND writer_state.installed_metadata_acl_exact)
         )
         AS pass_writer_manifest,
       writer_state.missing_predecessor_writer_count,
       writer_state.missing_installed_writer_count,
       writer_state.target_writer_candidate_count,
       writer_state.predecessor_metadata_acl_exact,
       writer_state.installed_metadata_acl_exact,
       CASE
         WHEN writer_state.unexpected_writer_count = 0
           AND writer_state.missing_installed_writer_count = 0
           AND writer_state.installed_metadata_acl_exact
           THEN 'WRITER_INSTALLED_EXACT'
         WHEN writer_state.unexpected_writer_count = 0
           AND writer_state.missing_predecessor_writer_count = 0
           AND writer_state.target_writer_candidate_count = 0
           AND writer_state.predecessor_metadata_acl_exact
           THEN 'WRITER_PREDECESSOR_EXACT'
         ELSE 'STOP_WRITER_DRIFT' END
         AS writer_classification,
       CASE
         WHEN installed.exact_candidate
           AND target_state.target_functions_exact
           AND COALESCE((SELECT target_metadata_acl_dependencies_exact
             FROM target_metadata_acl_dependencies_state), false)
           AND COALESCE((SELECT binding_relation_exact FROM binding_relation_state), false)
            AND NOT candidate_state.index_candidate_present
           AND COALESCE((SELECT exact FROM trigger_state), false)
           AND repayment_acl_state.unexpected_repayment_dml_grant_count = 0
            AND public_schema_acl_state.exact
            AND writer_state.unexpected_writer_count = 0
            AND writer_state.missing_installed_writer_count = 0
            AND writer_state.installed_metadata_acl_exact
            THEN 'EXACT_INSTALLED'
          WHEN NOT installed.exact_candidate
            AND predecessor_state.exact
           AND replacement_predecessor_state.exact
           AND repayment_acl_state.unexpected_repayment_dml_grant_count = 0
            AND public_schema_acl_state.exact
            AND writer_state.unexpected_writer_count = 0
            AND writer_state.missing_predecessor_writer_count = 0
            AND writer_state.target_writer_candidate_count = 0
            AND writer_state.predecessor_metadata_acl_exact
            THEN 'ABSENT_READY'
          ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
       END AS installation_state
FROM legacy_state
CROSS JOIN candidate_state
CROSS JOIN installed
CROSS JOIN predecessor_state
CROSS JOIN replacement_predecessor_state
CROSS JOIN target_state
CROSS JOIN repayment_acl_state
CROSS JOIN public_schema_acl_state
CROSS JOIN writer_state;

ROLLBACK;
