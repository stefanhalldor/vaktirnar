-- SQL177 PREFLIGHT: classify the exact predecessor or already-installed catalog without mutations.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH expected_predecessors(signature, source_hash) AS (VALUES
  ('public.expense_can_open_edit_revision_v1(uuid,uuid)', '35244913794fd372184e6ad1fc0b7d02'),
  ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', '0c6e7aa35c5ba4627b635511e94d5e8a'),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'e85b65c38a577ab33f1072173ac8353b'),
  ('public.expense_get_edit_revision_state_v1(uuid,uuid)', 'f26cc24ab01e5b923cc986ca8b19d9c4'),
  ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', '578aecf4b838c85b9d70ad4748ea4f6e'),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', '4332f4ccfd5e58f2e17ebe9389c13311'),
  ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', '65270072a4d257dcdb650cf1715b324f'),
  ('public.teskeid_event_get_expense_activity_v3(uuid,uuid)', 'ff9ce0a060d5e7c713907881da621f70')
), expected_targets(signature, source_hash, volatility, service_execute) AS (VALUES
  ('public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)', '167b94bba5a026ace42be0170932e2cd', 's'::"char", false),
  ('public.expense_can_open_edit_revision_v1(uuid,uuid)', '6af21a74dc87da961818814734d5596d', 's'::"char", false),
  ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', 'ceb16d2aaf29fc2e9bd057aeba69e376', 's'::"char", true),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', '58e08589a18db2a20ff406d22b98ba91', 'v'::"char", false),
  ('public.expense_get_edit_revision_state_v1(uuid,uuid)', '4033c7f15a7e0dcf9eef6f827d002e02', 's'::"char", true),
  ('public.expense_guard_edit_revision_financial_mutation_v1()', '247667a7aa6450800ab1f6f0ac612d0a', 'v'::"char", false),
  ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', 'e29788e5ab52bd15ac05427065168886', 'v'::"char", true),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', '832083d8dde3c68e56115991f2d29b8e', 'v'::"char", true),
  ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', 'f890668e54cad0eec483a06f87ad635c', 'v'::"char", true),
  ('public.teskeid_event_get_expense_activity_v3(uuid,uuid)', '54eea919f2990d0d69dbbc03884e6b69', 'v'::"char", true)
), prerequisite_state AS MATERIALIZED (
  SELECT
    pg_catalog.to_regclass('public.expense_edit_revision_bindings') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_private_drafts') IS NOT NULL
      AND pg_catalog.to_regclass('public.expenses') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_groups') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_repayments') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NOT NULL
      AS prerequisites_exact,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_edit_revision_bindings AS binding
      JOIN public.expenses AS expense
        ON expense.id = binding.expense_id
       AND expense.group_id = binding.group_id
      WHERE binding.actor_user_id IS DISTINCT FROM expense.created_by
    ) AS noncreator_bindings_absent
), predecessor_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.source_hash
  ) IS TRUE), false)
  AND pg_catalog.to_regprocedure(
    'public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)'
  ) IS NULL
  AND pg_catalog.to_regprocedure(
    'public.expense_guard_edit_revision_financial_mutation_v1()'
  ) IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'expense_sql177_repayment_edit_lock',
      'expense_sql177_settlement_item_edit_lock'
    )
      AND NOT trigger_row.tgisinternal
  ) AS predecessor_sources_exact
  FROM expected_predecessors AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
), target_function_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.source_hash
    AND routine.prokind = 'f'
    AND routine.provolatile = expected.volatility
    AND NOT routine.proisstrict
    AND routine.prosecdef
    AND routine.proconfig = ARRAY['search_path=""']::text[]
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND language_row.lanname = 'plpgsql'
    AND (
      SELECT pg_catalog.array_agg(
        pg_catalog.pg_get_userbyid(acl.grantee)::text ORDER BY
          pg_catalog.pg_get_userbyid(acl.grantee)::text
      ) FILTER (WHERE acl.privilege_type = 'EXECUTE')
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
    ) = CASE WHEN expected.service_execute
      THEN ARRAY['postgres','service_role']::text[]
      ELSE ARRAY['postgres']::text[] END
  ) IS TRUE), false) AS target_functions_exact
  FROM expected_targets AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), target_trigger_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and(
      trigger_row.oid IS NOT NULL
      AND trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
      -- Exact row/before/event bitmask: 1 + 2 + 4 + 8 + 16.
      AND trigger_row.tgtype = 31
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.expense_guard_edit_revision_financial_mutation_v1()'
      )
      AND trigger_row.tgnargs = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgattr = ''::pg_catalog.int2vector
      AND trigger_row.tgconstraint = 0
      AND NOT trigger_row.tgdeferrable
      AND NOT trigger_row.tginitdeferred
    ), false) AS target_triggers_exact
  FROM (VALUES
    ('expense_sql177_repayment_edit_lock', 'public.expense_repayments'),
    ('expense_sql177_settlement_item_edit_lock', 'public.expense_settlement_batch_items')
  ) AS expected(trigger_name, relation_name)
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
), classified AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    prerequisite_state.prerequisites_exact,
    prerequisite_state.noncreator_bindings_absent,
    predecessor_state.predecessor_sources_exact,
    target_function_state.target_functions_exact
      AND target_trigger_state.target_triggers_exact AS targets_exact
  FROM prerequisite_state
  CROSS JOIN predecessor_state
  CROSS JOIN target_function_state
  CROSS JOIN target_trigger_state
)
SELECT executor_ok,
  prerequisites_exact,
  noncreator_bindings_absent,
  predecessor_sources_exact,
  targets_exact,
  CASE
    WHEN targets_exact THEN 'EXACT_INSTALLED'
    WHEN predecessor_sources_exact THEN 'PREDECESSOR_READY'
    ELSE 'DRIFT_STOP'
  END AS installation_state,
  executor_ok
    AND prerequisites_exact
    AND noncreator_bindings_absent
    AND (predecessor_sources_exact OR targets_exact) AS operator_state_ok
FROM classified;

ROLLBACK;
