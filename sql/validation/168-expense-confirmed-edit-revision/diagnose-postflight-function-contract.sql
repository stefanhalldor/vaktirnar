-- SQL168 DIAGNOSTIC: read-only, privacy-safe postflight function-contract mismatch evidence.
-- Run only after a SQL168 postflight result reports function or dependency drift.
-- Output is limited to public function signatures and boolean contract flags.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid
), expected_functions(
  signature, argument_names, arguments, result_type, volatility,
  language_name, source_hash, default_count
) AS MATERIALIZED (
  VALUES
    ('public.expense_edit_revision_allocation_digest_v1(uuid)',
      ARRAY['p_expense_id']::text[], 'p_expense_id uuid', 'text', 's'::"char",
      'sql', '5d9768dccdd9a7a34d853541772aefdf', 0),
    ('public.expense_settlement_eligible_balances_v1(uuid,boolean)',
      ARRAY['p_group_id','p_include_reported','member_id','currency','amount_minor']::text[],
      'p_group_id uuid, p_include_reported boolean DEFAULT false',
      'TABLE(member_id uuid, currency text, amount_minor bigint)', 's'::"char",
      'plpgsql', 'b58245a47cc0c8e306a8769afa508687', 1),
    ('public.expense_simplified_settlement(uuid,text,boolean)',
      ARRAY['p_group_id','p_currency','p_include_reported','from_member_id','to_member_id','amount_minor','currency']::text[],
      'p_group_id uuid, p_currency text, p_include_reported boolean DEFAULT true',
      'TABLE(from_member_id uuid, to_member_id uuid, amount_minor bigint, currency text)', 's'::"char",
      'plpgsql', '3481fb2e9253cf72ef162688c7942945', 1),
    ('public.expense_can_open_edit_revision_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[],
      'p_actor_id uuid, p_expense_id uuid', 'text', 's'::"char",
      'plpgsql', '35244913794fd372184e6ad1fc0b7d02', 0),
    ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_group_id']::text[],
      'p_actor_id uuid, p_group_id uuid', 'jsonb', 's'::"char",
      'plpgsql', '0c6e7aa35c5ba4627b635511e94d5e8a', 0),
    ('public.expense_guard_edit_revision_expense_lifecycle_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '9027aed7ed47617145af8c3bbced1fc4', 0),
    ('public.expense_guard_edit_revision_group_lifecycle_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '534fe5f74b82ce934f9a2868e247ceff', 0),
    ('public.expense_guard_edit_revision_member_authority_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', '2d375364b1cc9e056923dbff3803c1b1', 0),
    ('public.expense_guard_repayment_confirmation_eligibility_v1()',
      ARRAY[]::text[], '', 'trigger', 'v'::"char",
      'plpgsql', 'ce37d2e99e222f0356125c9ca26ed72f', 0),
    ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      ARRAY['p_actor_id','p_context_type','p_group_id','p_expense_id']::text[],
      'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid',
      'void', 'v'::"char", 'plpgsql', 'e85b65c38a577ab33f1072173ac8353b', 0),
    ('public.expense_list_visible_shared_drafts(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid', 'jsonb', 'v'::"char",
      'plpgsql', 'dbaaca458c70ee18aa36c35864e9ade8', 0),
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      ARRAY['p_actor_id','p_draft_id','p_context_type','p_group_id','p_expense_id','p_current_step','p_payload','p_expected_version','draft_id','draft_version','saved_at']::text[],
      'p_actor_id uuid, p_draft_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid, p_current_step text, p_payload jsonb, p_expected_version bigint DEFAULT NULL::bigint',
      'TABLE(draft_id uuid, draft_version bigint, saved_at timestamp with time zone)', 'v'::"char",
      'plpgsql', '4c55e9caaabb3a287dfa06ed55ab1fe7', 1),
    ('public.expense_delete_private_draft(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[],
      'p_actor_id uuid, p_draft_id uuid', 'boolean', 'v'::"char",
      'plpgsql', '767759a756a52c8b90a57af6de1b9a6f', 0),
    ('public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[],
      'p_actor_id uuid, p_draft_id uuid', 'jsonb', 's'::"char",
      'plpgsql', '0bf01ffb0b90cf8078da4b8dcd65629c', 0),
    ('public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '3314017996b86c4cda29ef1c3b36a1f2', 0),
    ('public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '1ef4e7a8fc1e412918406b7b8fc31917', 0),
    ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_mode','p_draft_id','p_payload']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_mode text, p_draft_id uuid, p_payload jsonb',
      'jsonb', 'v'::"char", 'plpgsql', '732375dc60f72f95f8232677b2ae0f89', 0),
    ('public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[],
      'p_actor_id uuid, p_expense_id uuid', 'jsonb', 's'::"char",
      'plpgsql', '4c67a8fb156d01ba72d2559e68d1416f', 0),
    ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', 'b25d37dd096e08a402161c1301c23fc8', 0),
    ('public.expense_get_edit_revision_state_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_expense_id']::text[],
      'p_actor_id uuid, p_expense_id uuid', 'jsonb', 's'::"char",
      'plpgsql', 'f26cc24ab01e5b923cc986ca8b19d9c4', 0),
    ('public.expense_list_visible_edit_revisions_v1(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid', 'jsonb', 's'::"char",
      'plpgsql', '8a0ddb900e607429bec043c920755b80', 0),
    ('public.expense_get_shared_edit_revision_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_publication_id']::text[],
      'p_actor_id uuid, p_publication_id uuid', 'jsonb', 's'::"char",
      'plpgsql', '82349ff16af2b4885581ac90f454d3a3', 0),
    ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'jsonb', 'v'::"char", 'plpgsql', '2a7bbc7fda11f3393a55171e56bf3614', 0),
    ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)',
      ARRAY['p_actor_id','p_request_id','p_expense_id','p_draft_id','p_expected_draft_version','p_expected_publication_version','p_expected_financial_version','p_proposal']::text[],
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_expected_financial_version bigint, p_proposal jsonb',
      'jsonb', 'v'::"char", 'plpgsql', 'd8cd26c2d1b07475de60846222e6734a', 0)
), catalog_state AS MATERIALIZED (
  SELECT expected.*,
         routine.oid,
         routine.proargnames,
         routine.provolatile,
         routine.proowner,
         routine.prosecdef,
         routine.proisstrict,
         routine.proleakproof,
         routine.proparallel,
         routine.pronargdefaults,
         routine.proconfig,
         language_row.lanname AS actual_language_name,
         pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
         pg_catalog.pg_get_function_result(routine.oid) AS actual_result_type,
         pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
           AS actual_source_hash
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), evaluated AS MATERIALIZED (
  SELECT catalog_state.signature,
         catalog_state.language_name,
         catalog_state.oid IS NOT NULL AS target_exists,
         catalog_state.oid IS NOT NULL
           AND COALESCE(catalog_state.proargnames, ARRAY[]::text[])
             = catalog_state.argument_names AS argument_names_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.actual_arguments = catalog_state.arguments
             AS arguments_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.actual_result_type = catalog_state.result_type
             AS result_type_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.provolatile = catalog_state.volatility
             AS volatility_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.actual_language_name = catalog_state.language_name
             AS language_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.proowner = roles.postgres_oid
           AND catalog_state.prosecdef
           AND NOT catalog_state.proisstrict
           AND NOT catalog_state.proleakproof
           AND catalog_state.proparallel = 'u' AS security_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.proconfig = CASE WHEN catalog_state.signature IN (
             'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
             'public.expense_delete_private_draft(uuid,uuid)'
           ) THEN ARRAY['search_path=pg_catalog, public']::text[]
           ELSE ARRAY['search_path=""']::text[] END AS search_path_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.pronargdefaults = catalog_state.default_count
             AS default_count_exact,
         catalog_state.oid IS NOT NULL
           AND catalog_state.actual_source_hash = catalog_state.source_hash
             AS source_hash_exact,
         catalog_state.oid IS NOT NULL AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = catalog_state.oid
             AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
             AND dependency.refobjid = pg_catalog.to_regnamespace('public')
         ) AS namespace_dependency_exact,
         catalog_state.oid IS NOT NULL AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           JOIN pg_catalog.pg_language AS dependency_language
             ON dependency_language.oid = dependency.refobjid
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = catalog_state.oid
             AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
             AND dependency_language.lanname = catalog_state.language_name
         ) AS language_dependency_present,
         catalog_state.oid IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend AS dependency
           WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
             AND dependency.objid = catalog_state.oid
             AND dependency.deptype = 'e'
         ) AS extension_dependency_absent
  FROM catalog_state CROSS JOIN roles
), result AS MATERIALIZED (
  SELECT evaluated.*,
         target_exists
           AND argument_names_exact AND arguments_exact AND result_type_exact
           AND volatility_exact AND language_exact AND security_exact
           AND search_path_exact AND default_count_exact AND source_hash_exact
             AS metadata_exact,
         namespace_dependency_exact
           AND (language_name = 'sql' OR language_dependency_present)
           AND extension_dependency_absent AS direct_dependencies_exact
  FROM evaluated
)
SELECT pg_catalog.count(*) OVER () AS mismatched_function_count,
       24::integer AS expected_function_count,
       signature,
       target_exists,
       argument_names_exact,
       arguments_exact,
       result_type_exact,
       volatility_exact,
       language_exact,
       security_exact,
       search_path_exact,
       default_count_exact,
       source_hash_exact,
       namespace_dependency_exact,
       language_dependency_present,
       extension_dependency_absent,
       metadata_exact,
       direct_dependencies_exact
FROM result
WHERE NOT metadata_exact OR NOT direct_dependencies_exact
ORDER BY signature;

ROLLBACK;
