-- SQL168 POSTFLIGHT: read-only exact lifecycle, ACL, RLS, index, trigger and dependency verification.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
         pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
         pg_catalog.to_regrole('anon')::oid AS anon_oid,
         pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), expected_direct_draft_writer(signature, source_hash) AS MATERIALIZED (
  VALUES
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', '4c55e9caaabb3a287dfa06ed55ab1fe7'),
    ('public.expense_delete_private_draft(uuid,uuid)', '767759a756a52c8b90a57af6de1b9a6f'),
    ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'),
    ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'a1bba12665e8651121bac578d7e936d4'),
    ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', '732375dc60f72f95f8232677b2ae0f89'),
    ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', '2a7bbc7fda11f3393a55171e56bf3614'),
    ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', 'd8cd26c2d1b07475de60846222e6734a'),
    ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', 'b25d37dd096e08a402161c1301c23fc8')
), actual_direct_draft_writer AS MATERIALIZED (
  SELECT pg_catalog.format(
    '%I.%I(%s)', namespace_row.nspname, routine.proname,
    pg_catalog.replace(pg_catalog.oidvectortypes(routine.proargtypes), ' ', '')
  ) AS signature,
  pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
  routine.proowner = roles.postgres_oid
    AND routine.prosecdef
    AND pg_catalog.has_function_privilege(roles.service_role_oid, routine.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege(roles.anon_oid, routine.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege(roles.authenticated_oid, routine.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      WHERE acl.grantor <> roles.postgres_oid
         OR acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
         OR acl.grantee NOT IN (roles.postgres_oid, roles.service_role_oid)
  ) AS metadata_acl_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = routine.pronamespace
  CROSS JOIN roles
  WHERE namespace_row.nspname = 'public'
    AND routine.prosrc ~* '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public[.]expense_private_drafts'
), writer_state AS MATERIALIZED (
  SELECT NOT EXISTS (
      SELECT actual.signature FROM actual_direct_draft_writer AS actual
      EXCEPT ALL
      SELECT expected.signature FROM expected_direct_draft_writer AS expected
    ) AND NOT EXISTS (
      SELECT expected.signature FROM expected_direct_draft_writer AS expected
      EXCEPT ALL
      SELECT actual.signature FROM actual_direct_draft_writer AS actual
    ) AND COALESCE((
      SELECT pg_catalog.bool_and(
        actual.metadata_acl_exact AND actual.source_hash = expected.source_hash
      )
      FROM actual_direct_draft_writer AS actual
      JOIN expected_direct_draft_writer AS expected USING (signature)
    ), false) AS exact
), expected_functions(
  signature, argument_names, arguments, result_type, volatility,
  language_name, source_hash, service_execute, default_count
) AS MATERIALIZED (
  VALUES
    ('public.expense_edit_revision_allocation_digest_v1(uuid)',
      ARRAY['p_expense_id']::text[], 'p_expense_id uuid', 'text', 's'::"char",
      'sql', '5d9768dccdd9a7a34d853541772aefdf', false, 0),
    ('public.expense_settlement_eligible_balances_v1(uuid,boolean)',
      ARRAY['p_group_id','p_include_reported','member_id','currency','amount_minor']::text[],
      'p_group_id uuid, p_include_reported boolean DEFAULT false',
      'TABLE(member_id uuid, currency text, amount_minor bigint)', 's'::"char",
      'plpgsql', 'b58245a47cc0c8e306a8769afa508687', false, 1),
    ('public.expense_simplified_settlement(uuid,text,boolean)',
      ARRAY['p_group_id','p_currency','p_include_reported','from_member_id','to_member_id','amount_minor','currency']::text[],
      'p_group_id uuid, p_currency text, p_include_reported boolean DEFAULT true',
      'TABLE(from_member_id uuid, to_member_id uuid, amount_minor bigint, currency text)', 's'::"char",
      'plpgsql', '3481fb2e9253cf72ef162688c7942945', false, 1),
    ('public.expense_can_open_edit_revision_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[], 'p_actor_id uuid, p_expense_id uuid',
      'text', 's'::"char", 'plpgsql', '35244913794fd372184e6ad1fc0b7d02', false, 0),
    ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_group_id']::text[], 'p_actor_id uuid, p_group_id uuid',
      'jsonb', 's'::"char", 'plpgsql', '0c6e7aa35c5ba4627b635511e94d5e8a', true, 0),
    ('public.expense_guard_edit_revision_expense_lifecycle_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '9027aed7ed47617145af8c3bbced1fc4', false, 0),
    ('public.expense_guard_edit_revision_group_lifecycle_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '534fe5f74b82ce934f9a2868e247ceff', false, 0),
    ('public.expense_guard_edit_revision_member_authority_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '2d375364b1cc9e056923dbff3803c1b1', false, 0),
    ('public.expense_guard_repayment_confirmation_eligibility_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', 'ce37d2e99e222f0356125c9ca26ed72f', false, 0),
    ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      ARRAY['p_actor_id','p_context_type','p_group_id','p_expense_id']::text[],
      'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid',
      'void', 'v'::"char", 'plpgsql', 'e85b65c38a577ab33f1072173ac8353b', false, 0),
    ('public.expense_list_visible_shared_drafts(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid',
      'jsonb', 'v'::"char", 'plpgsql', 'dbaaca458c70ee18aa36c35864e9ade8', true, 0),
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      ARRAY['p_actor_id','p_draft_id','p_context_type','p_group_id','p_expense_id','p_current_step','p_payload','p_expected_version','draft_id','draft_version','saved_at']::text[],
      'p_actor_id uuid, p_draft_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid, p_current_step text, p_payload jsonb, p_expected_version bigint DEFAULT NULL::bigint',
      'TABLE(draft_id uuid, draft_version bigint, saved_at timestamp with time zone)', 'v'::"char",
      'plpgsql', '4c55e9caaabb3a287dfa06ed55ab1fe7', true, 1),
    ('public.expense_delete_private_draft(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[], 'p_actor_id uuid, p_draft_id uuid',
      'boolean', 'v'::"char", 'plpgsql', '767759a756a52c8b90a57af6de1b9a6f', true, 0),
    ('public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[], 'p_actor_id uuid, p_draft_id uuid',
      'jsonb', 's'::"char", 'plpgsql', '0bf01ffb0b90cf8078da4b8dcd65629c', true, 0),
    ('public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '3314017996b86c4cda29ef1c3b36a1f2', true, 0),
    ('public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '1ef4e7a8fc1e412918406b7b8fc31917', true, 0),
    ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_mode','p_draft_id','p_payload']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_mode text, p_draft_id uuid, p_payload jsonb',
      'jsonb', 'v'::"char", 'plpgsql', '732375dc60f72f95f8232677b2ae0f89', true, 0),
    ('public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[], 'p_actor_id uuid, p_expense_id uuid',
      'jsonb', 's'::"char", 'plpgsql', '4c67a8fb156d01ba72d2559e68d1416f', true, 0),
    ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', 'b25d37dd096e08a402161c1301c23fc8', true, 0),
    ('public.expense_get_edit_revision_state_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[], 'p_actor_id uuid, p_expense_id uuid',
      'jsonb', 's'::"char", 'plpgsql', 'f26cc24ab01e5b923cc986ca8b19d9c4', true, 0),
    ('public.expense_list_visible_edit_revisions_v1(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid',
      'jsonb', 's'::"char", 'plpgsql', '8a0ddb900e607429bec043c920755b80', true, 0),
    ('public.expense_get_shared_edit_revision_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_publication_id']::text[], 'p_actor_id uuid, p_publication_id uuid',
      'jsonb', 's'::"char", 'plpgsql', '82349ff16af2b4885581ac90f454d3a3', true, 0),
    ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '2a7bbc7fda11f3393a55171e56bf3614', true, 0),
    ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version','p_expected_publication_version','p_expected_financial_version','p_proposal']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_expected_financial_version bigint, p_proposal jsonb',
      'jsonb', 'v'::"char", 'plpgsql', 'd8cd26c2d1b07475de60846222e6734a', true, 0)
), functions AS MATERIALIZED (
  SELECT expected.*, routine.oid, routine.prosrc, routine.proowner,
         pg_catalog.pg_get_function_identity_arguments(routine.oid)
           AS identity_arguments,
         pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_md5,
         routine.oid IS NOT NULL
           AND routine.prokind = 'f'
           AND COALESCE(routine.proargnames, ARRAY[]::text[]) = expected.argument_names
           AND pg_catalog.pg_get_function_arguments(routine.oid) = expected.arguments
           AND pg_catalog.pg_get_function_result(routine.oid) = expected.result_type
           AND routine.provolatile = expected.volatility
           AND routine.prosecdef AND NOT routine.proisstrict
           AND NOT routine.proleakproof AND routine.proparallel = 'u'
           AND routine.pronargdefaults = expected.default_count
           AND routine.proconfig = CASE WHEN expected.signature IN (
             'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
             'public.expense_delete_private_draft(uuid,uuid)'
           ) THEN ARRAY['search_path=pg_catalog, public']::text[]
           ELSE ARRAY['search_path=""']::text[] END
           AND language_row.lanname = expected.language_name
           AND routine.proowner = roles.postgres_oid AS metadata_exact
  FROM expected_functions AS expected
  CROSS JOIN roles
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS (
  SELECT function_row.oid, roles.postgres_oid, roles.postgres_oid,
         'EXECUTE'::text, false
  FROM functions AS function_row CROSS JOIN roles
  UNION ALL
  SELECT function_row.oid, roles.service_role_oid, roles.postgres_oid,
         'EXECUTE'::text, false
  FROM functions AS function_row CROSS JOIN roles
  WHERE function_row.service_execute
), actual_acl AS (
  SELECT function_row.oid AS function_oid, acl.grantee, acl.grantor,
         acl.privilege_type, acl.is_grantable
  FROM functions AS function_row
  JOIN pg_catalog.pg_proc AS routine ON routine.oid = function_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS acl
), function_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 24
           AND pg_catalog.bool_and(metadata_exact)
           AND pg_catalog.bool_and(source_md5 = source_hash) AS contract_exact,
         NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
           EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
           AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
           EXCEPT ALL SELECT actual.* FROM actual_acl AS actual) AS acl_exact,
         pg_catalog.bool_and(
           pg_catalog.has_function_privilege(
             roles.service_role_oid, functions.oid, 'EXECUTE'
           ) = functions.service_execute
           AND NOT pg_catalog.has_function_privilege(
             roles.anon_oid, functions.oid, 'EXECUTE'
           )
           AND NOT pg_catalog.has_function_privilege(
             roles.authenticated_oid, functions.oid, 'EXECUTE'
           )
         ) AS effective_acl_exact,
         pg_catalog.bool_and(
           EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
             WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
               AND dependency.objid = functions.oid
               AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
               AND dependency.refobjid = pg_catalog.to_regnamespace('public'))
           AND (functions.language_name = 'sql' OR EXISTS (
             SELECT 1 FROM pg_catalog.pg_depend AS dependency
             JOIN pg_catalog.pg_language AS language_row
               ON language_row.oid = dependency.refobjid
             WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
               AND dependency.objid = functions.oid
               AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
               AND language_row.lanname = functions.language_name))
           AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
             WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
               AND dependency.objid = functions.oid AND dependency.deptype = 'e')
         ) AS direct_dependencies_exact
  FROM functions CROSS JOIN roles
), relation_state AS MATERIALIZED (
  SELECT relation.oid, relation.relowner, relation.relkind,
         relation.relrowsecurity, relation.relforcerowsecurity,
         pg_catalog.count(attribute.attnum) FILTER (
           WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
         ) = 9 AS column_count_exact,
         pg_catalog.array_agg(attribute.attname ORDER BY attribute.attnum) FILTER (
           WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
         ) = ARRAY[
           'draft_id','expense_id','group_id','actor_user_id','mode',
           'base_financial_version','base_allocation_digest','opened_at','updated_at'
         ]::name[] AS column_order_exact
  FROM pg_catalog.pg_class AS relation
  LEFT JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
  WHERE relation.oid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
  GROUP BY relation.oid, relation.relowner, relation.relkind,
           relation.relrowsecurity, relation.relforcerowsecurity
), column_definition_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 9 AND pg_catalog.bool_and(
    CASE attribute.attname
      WHEN 'draft_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'expense_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'group_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'actor_user_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'mode' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'base_financial_version' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'bigint'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'base_allocation_digest' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'opened_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
        AND attribute.attnotnull
        AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = 'now()'
      WHEN 'updated_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
        AND attribute.attnotnull
        AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = 'now()'
      ELSE false
    END
  ) AS exact
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute.attrelid
   AND default_row.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
), relation_acl AS MATERIALIZED (
  SELECT acl.*
  FROM relation_state AS state
  JOIN pg_catalog.pg_class AS relation ON relation.oid = state.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    relation.relacl, pg_catalog.acldefault('r', relation.relowner)
  )) AS acl
), relation_contract AS MATERIALIZED (
  SELECT state.oid IS NOT NULL AND state.relkind = 'r'
           AND state.relowner = roles.postgres_oid
           AND state.relrowsecurity AND state.relforcerowsecurity
           AND state.column_count_exact AND state.column_order_exact
           AND column_definition_contract.exact
           AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS policy
             WHERE policy.polrelid = state.oid)
           AND NOT EXISTS (SELECT 1 FROM relation_acl AS acl
             WHERE acl.grantee <> roles.postgres_oid
                OR acl.grantor <> roles.postgres_oid OR acl.is_grantable)
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conrelid = state.oid
               AND constraint_row.convalidated
               AND NOT constraint_row.condeferrable) = 10
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conrelid = state.oid AND constraint_row.contype = 'p') = 1
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conrelid = state.oid AND constraint_row.contype = 'u') = 2
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conrelid = state.oid AND constraint_row.contype = 'f') = 4
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS constraint_row
             WHERE constraint_row.conrelid = state.oid AND constraint_row.contype = 'c') = 3
         AS exact
  FROM relation_state AS state CROSS JOIN roles
  CROSS JOIN column_definition_contract
), constraint_definition_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 10
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_pkey'
      AND constraint_row.contype = 'p'
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]) = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_expense_id_key'
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (expense_id)') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_context_unique'
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'UNIQUE (draft_id, expense_id, group_id, actor_user_id)') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_mode_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK ((mode = ANY (ARRAY[''private''::text, ''shared''::text])))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_version_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK (((base_financial_version >= 0) AND (base_financial_version <= ''9007199254740991''::bigint)))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_digest_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK ((base_allocation_digest ~ ''^[0-9a-f]{32}$''::text))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_draft_id_fkey'
      AND constraint_row.confrelid = pg_catalog.to_regclass('public.expense_private_drafts')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
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
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_actor_user_id_fkey'
      AND constraint_row.confrelid = pg_catalog.to_regclass('auth.users')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'actor_user_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
    AND pg_catalog.bool_and(constraint_row.convalidated
      AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred)
    AS constraint_definitions_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
), index_contract AS MATERIALIZED (
  SELECT pg_catalog.to_regclass(
    'public.expense_private_drafts_one_open_edit_per_expense_idx'
  ) IS NULL AS exact
), expected_trigger(trigger_name, relation_oid, function_oid, update_columns) AS (
  VALUES
    ('expense_tes24_edit_expense_lifecycle_guard',
      pg_catalog.to_regclass('public.expenses'),
      pg_catalog.to_regprocedure('public.expense_guard_edit_revision_expense_lifecycle_v1()'), ARRAY[]::name[]),
    ('expense_tes24_edit_group_lifecycle_guard',
      pg_catalog.to_regclass('public.expense_groups'),
      pg_catalog.to_regprocedure('public.expense_guard_edit_revision_group_lifecycle_v1()'), ARRAY['status']::name[]),
    ('expense_tes24_edit_member_authority_guard',
      pg_catalog.to_regclass('public.expense_group_members'),
      pg_catalog.to_regprocedure('public.expense_guard_edit_revision_member_authority_v1()'), ARRAY['role','status','user_id']::name[]),
    ('expense_tes24_repayment_confirmation_guard',
      pg_catalog.to_regclass('public.expense_repayments'),
      pg_catalog.to_regprocedure('public.expense_guard_repayment_confirmation_eligibility_v1()'), ARRAY['status']::name[])
), trigger_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 4
    AND pg_catalog.bool_and(NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgdeferrable AND NOT trigger_row.tginitdeferred
      AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
      AND pg_catalog.octet_length(trigger_row.tgargs) = 0
      AND trigger_row.tgrelid = expected.relation_oid
      AND trigger_row.tgfoid = expected.function_oid
      AND trigger_row.tgtype = 19
      AND COALESCE((SELECT pg_catalog.array_agg(attribute.attname ORDER BY attribute.attname)
        FROM pg_catalog.unnest(trigger_row.tgattr::smallint[]) AS trigger_attribute(attnum)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = trigger_row.tgrelid
         AND attribute.attnum = trigger_attribute.attnum
      ), ARRAY[]::name[]) = expected.update_columns) AS trigger_update_columns_exact
  FROM expected_trigger AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
), repayment_acl_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) FILTER (
    WHERE grant_row.grantee <> 'postgres'
      AND grant_row.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER')
  )::integer AS unexpected_repayment_dml_grant_count
  FROM information_schema.role_table_grants AS grant_row
  WHERE grant_row.table_schema = 'public'
    AND grant_row.table_name = 'expense_repayments'
), lifecycle_state AS MATERIALIZED (
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.expense_edit_revision_bindings AS binding
    LEFT JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
    WHERE draft.id IS NULL
       OR draft.context_type IS DISTINCT FROM 'edit'
       OR draft.expense_id IS DISTINCT FROM binding.expense_id
       OR draft.group_id IS DISTINCT FROM binding.group_id
       OR draft.actor_user_id IS DISTINCT FROM binding.actor_user_id
  ) AND NOT EXISTS (
    SELECT binding.expense_id
    FROM public.expense_edit_revision_bindings AS binding
    GROUP BY binding.expense_id
    HAVING pg_catalog.count(*) > 1
  ) AS exact
), predecessor_contract AS MATERIALIZED (
  SELECT
    (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
     FROM pg_catalog.pg_proc AS routine
     WHERE routine.oid = pg_catalog.to_regprocedure(
       'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
     )) = '30ba02f3b79d2c7a9387ee504d198d12'
    AND (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
     FROM pg_catalog.pg_proc AS routine
     WHERE routine.oid = pg_catalog.to_regprocedure(
       'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
     )) = 'c3a1ab7746d50ed552c625bbc95efbab' AS exact
), public_schema_contract AS MATERIALIZED (
  SELECT pg_catalog.has_schema_privilege(roles.service_role_oid, 'public', 'USAGE')
       AND NOT pg_catalog.has_schema_privilege(roles.service_role_oid, 'public', 'CREATE')
       AND pg_catalog.has_schema_privilege(roles.anon_oid, 'public', 'USAGE')
       AND NOT pg_catalog.has_schema_privilege(roles.anon_oid, 'public', 'CREATE')
       AND pg_catalog.has_schema_privilege(roles.authenticated_oid, 'public', 'USAGE')
       AND NOT pg_catalog.has_schema_privilege(roles.authenticated_oid, 'public', 'CREATE')
       AS exact
  FROM roles
)
SELECT function_state.contract_exact AS functions_exact,
       function_state.acl_exact AND function_state.effective_acl_exact AS acl_exact,
       function_state.direct_dependencies_exact,
       relation_contract.exact AS binding_relation_exact,
       constraint_definition_contract.constraint_definitions_exact,
       COALESCE((SELECT pg_catalog.bool_and(exact) FROM index_contract), false)
         AS index_exact,
       COALESCE((SELECT trigger_update_columns_exact FROM trigger_contract), false)
         AS settlement_trigger_exact,
       repayment_acl_contract.unexpected_repayment_dml_grant_count,
       lifecycle_state.exact AS lifecycle_state_exact,
       predecessor_contract.exact AS predecessor_exact,
       public_schema_contract.exact AS public_schema_acl_exact,
       writer_state.exact AS pass_writer_manifest,
       CASE WHEN writer_state.exact
         THEN 'WRITER_MANIFEST_EXACT' ELSE 'STOP_WRITER_DRIFT' END
         AS writer_classification,
       function_state.contract_exact
         AND function_state.acl_exact AND function_state.effective_acl_exact
         AND function_state.direct_dependencies_exact
         AND relation_contract.exact
         AND constraint_definition_contract.constraint_definitions_exact
         AND COALESCE((SELECT pg_catalog.bool_and(exact) FROM index_contract), false)
         AND COALESCE((SELECT trigger_update_columns_exact FROM trigger_contract), false)
         AND repayment_acl_contract.unexpected_repayment_dml_grant_count = 0
         AND lifecycle_state.exact AND predecessor_contract.exact
         AND public_schema_contract.exact
         AND writer_state.exact AS postconditions_ok
FROM function_state
CROSS JOIN relation_contract
CROSS JOIN constraint_definition_contract
CROSS JOIN lifecycle_state
CROSS JOIN predecessor_contract
CROSS JOIN repayment_acl_contract
CROSS JOIN public_schema_contract
CROSS JOIN writer_state;

ROLLBACK;
