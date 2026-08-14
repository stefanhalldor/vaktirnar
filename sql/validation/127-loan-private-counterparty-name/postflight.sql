-- SQL127 loan private-counterparty-name postflight -- READ ONLY.
-- Run after sql/127_loan_private_counterparty_name.sql and, where the target's
-- default privileges granted service_role direct trigger-function execution,
-- sql/128_loan_private_counterparty_trigger_acl.sql. Share the complete single
-- result row. Every *_ok value must be true;
-- private_name_rows is informational; transactions_older_than_five_minutes
-- should be 0 before release validation.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_functions(function_name, identity_arguments, security_definer, service_execute) AS (
  VALUES
    ('create_loan_with_counterparty_name', 'uuid, text, text, date, date, text, text, uuid', true,  true),
    ('set_loan_counterparty_name',         'uuid, uuid, text',                                  true,  true),
    ('loan_clear_private_counterparty_name_on_invitation', '',                                 false, false),
    ('get_my_loans',                       'uuid',                                               false, true)
), function_state AS (
  SELECT
    expected.*,
    procedure_row.oid,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    procedure_row.prosrc,
    procedure_row.proargnames,
    pg_catalog.pg_get_function_result(procedure_row.oid) AS function_result,
    pg_catalog.pg_get_userbyid(procedure_row.proowner) AS owner_name,
    owner_role.rolbypassrls AS owner_bypasses_rls
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
   AND procedure_row.proname = expected.function_name
   AND pg_catalog.oidvectortypes(procedure_row.proargtypes)
       = expected.identity_arguments
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), overload_state AS (
  SELECT
    expected.function_name,
    pg_catalog.count(procedure_row.oid)::integer AS overload_count
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
   AND procedure_row.proname = expected.function_name
  GROUP BY expected.function_name
), table_state AS (
  SELECT
    relation.oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass('public.loan_items')
    AND relation.relkind = 'r'
), column_state AS (
  SELECT
    column_row.udt_name,
    column_row.is_nullable,
    column_row.column_default
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name = 'loan_items'
    AND column_row.column_name = 'creator_counterparty_name'
), constraint_state AS (
  SELECT
    constraint_row.convalidated,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.loan_items')
    AND constraint_row.conname = 'loan_items_creator_counterparty_name_check'
    AND constraint_row.contype = 'c'
), trigger_state AS (
  SELECT
    trigger_row.tgenabled,
    trigger_row.tgtype,
    trigger_row.tgfoid,
    trigger_row.tgisinternal
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.loan_invitations')
    AND trigger_row.tgname = 'loan_clear_private_counterparty_name_on_invitation'
    AND NOT trigger_row.tgisinternal
), source_state AS (
  SELECT
    function_name,
    pg_catalog.regexp_replace(COALESCE(prosrc, ''), '\s+', ' ', 'g') AS normalized_source,
    COALESCE(proargnames, ARRAY[]::text[]) AS all_argument_names
  FROM function_state
), private_data_state AS (
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE item.creator_counterparty_name IS NOT NULL
    )::bigint AS private_name_rows,
    pg_catalog.count(*) FILTER (
      WHERE item.creator_counterparty_name IS NOT NULL
        AND (
          item.creator_counterparty_name IS DISTINCT FROM pg_catalog.btrim(item.creator_counterparty_name)
          OR pg_catalog.char_length(item.creator_counterparty_name) NOT BETWEEN 1 AND 120
        )
    )::bigint AS invalid_private_name_rows,
    pg_catalog.count(*) FILTER (
      WHERE item.creator_counterparty_name IS NOT NULL
        AND NOT (
          item.created_by IS NOT NULL
          AND (
            (item.created_by = item.lender_user_id AND item.borrower_user_id IS NULL)
            OR
            (item.created_by = item.borrower_user_id AND item.lender_user_id IS NULL)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.loan_invitations AS invitation
            WHERE invitation.loan_id = item.id
          )
        )
    )::bigint AS invalid_private_name_state_rows
  FROM public.loan_items AS item
), old_transactions AS (
  SELECT pg_catalog.count(*)::bigint AS count
  FROM pg_catalog.pg_stat_activity AS activity
  WHERE activity.datname = pg_catalog.current_database()
    AND activity.pid <> pg_catalog.pg_backend_pid()
    AND activity.xact_start IS NOT NULL
    AND activity.xact_start < pg_catalog.now() - interval '5 minutes'
), checks AS (
  SELECT
    EXISTS (SELECT 1 FROM table_state) AS loan_items_table_ok,
    COALESCE((SELECT relrowsecurity FROM table_state), false) AS loan_items_rls_enabled_ok,
    (
      SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(udt_name = 'text')
        AND pg_catalog.bool_and(is_nullable = 'YES')
        AND pg_catalog.bool_and(column_default IS NULL)
      FROM column_state
    ) AS exact_private_name_column_ok,
    (
      SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(convalidated)
        AND pg_catalog.bool_and(definition ILIKE '%creator_counterparty_name IS NULL%')
        AND pg_catalog.bool_and(definition ILIKE '%btrim(creator_counterparty_name)%')
        AND pg_catalog.bool_and(definition ILIKE '%char_length(creator_counterparty_name)%')
        AND pg_catalog.bool_and(definition ILIKE '%120%')
      FROM constraint_state
    ) AS validated_private_name_constraint_ok,
    NOT pg_catalog.has_table_privilege('anon', 'public.loan_items', 'SELECT')
      AND NOT pg_catalog.has_table_privilege('anon', 'public.loan_items', 'INSERT')
      AND NOT pg_catalog.has_table_privilege('anon', 'public.loan_items', 'UPDATE')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.loan_items', 'SELECT')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.loan_items', 'INSERT')
      AND NOT pg_catalog.has_table_privilege('authenticated', 'public.loan_items', 'UPDATE')
      AND NOT pg_catalog.has_column_privilege('anon', 'public.loan_items', 'creator_counterparty_name', 'SELECT')
      AND NOT pg_catalog.has_column_privilege('authenticated', 'public.loan_items', 'creator_counterparty_name', 'SELECT')
      AS no_browser_private_name_access_ok,
    (
      SELECT pg_catalog.count(*) = 4
        AND pg_catalog.bool_and(oid IS NOT NULL)
      FROM function_state
    ) AS exact_functions_present_ok,
    (
      SELECT pg_catalog.bool_and(overload_count = 1)
      FROM overload_state
    ) AS exact_function_overloads_ok,
    (
      SELECT pg_catalog.bool_and(
        oid IS NOT NULL
        AND prosecdef = security_definer
        AND COALESCE(proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
        AND (NOT security_definer OR COALESCE(owner_bypasses_rls, false))
      )
      FROM function_state
    ) AS exact_function_security_ok,
    (
      SELECT pg_catalog.bool_and(
        oid IS NOT NULL
        AND NOT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
      )
      FROM function_state
    ) AS no_browser_function_execute_ok,
    (
      SELECT pg_catalog.bool_and(
        oid IS NOT NULL
        AND pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE') = service_execute
      )
      FROM function_state
    ) AS exact_service_role_function_execute_ok,
    (
      SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(tgenabled = 'O')
        AND pg_catalog.bool_and(tgtype = 5)
        AND pg_catalog.bool_and(NOT tgisinternal)
        AND pg_catalog.bool_and(
          tgfoid = pg_catalog.to_regprocedure(
            'public.loan_clear_private_counterparty_name_on_invitation()'
          )
        )
      FROM trigger_state
    ) AS exact_invitation_clear_trigger_ok,
    EXISTS (
      SELECT 1
      FROM source_state
      WHERE function_name = 'create_loan_with_counterparty_name'
        AND normalized_source LIKE '%FROM public.create_loan(%'
        AND normalized_source LIKE '%NULL,%p_request_id%'
        AND normalized_source LIKE '%v_existing IS NOT NULL AND v_existing IS DISTINCT FROM v_name%'
        AND normalized_source LIKE '%WHERE li.id = v_loan_id AND li.created_by = p_actor_id FOR UPDATE%'
    ) AS atomic_name_only_create_contract_ok,
    EXISTS (
      SELECT 1
      FROM source_state
      WHERE function_name = 'set_loan_counterparty_name'
        AND normalized_source LIKE '%v_loan.created_by IS DISTINCT FROM p_actor_id%'
        AND normalized_source LIKE '%already_has_party%'
        AND normalized_source LIKE '%already_has_invitation%'
        AND normalized_source LIKE '%FOR UPDATE%'
    ) AS creator_only_set_contract_ok,
    EXISTS (
      SELECT 1
      FROM source_state
      WHERE function_name = 'loan_clear_private_counterparty_name_on_invitation'
        AND normalized_source LIKE '%SET creator_counterparty_name = NULL%'
        AND normalized_source LIKE '%WHERE id = NEW.loan_id%'
    ) AS invitation_clears_private_name_contract_ok,
    EXISTS (
      SELECT 1
      FROM source_state
      WHERE function_name = 'get_my_loans'
        AND normalized_source LIKE '%CASE WHEN item.created_by = p_actor_id THEN item.creator_counterparty_name END%'
        AND pg_catalog.split_part(normalized_source, 'UNION ALL', 2)
              NOT LIKE '%creator_counterparty_name%'
        AND NOT ('creator_counterparty_name' = ANY(all_argument_names))
    ) AS creator_only_projection_contract_ok,
    (SELECT invalid_private_name_rows = 0 FROM private_data_state)
      AS private_name_values_valid_ok,
    (SELECT invalid_private_name_state_rows = 0 FROM private_data_state)
      AS private_name_exclusive_state_ok
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  checks.loan_items_table_ok,
  checks.loan_items_rls_enabled_ok,
  checks.exact_private_name_column_ok,
  checks.validated_private_name_constraint_ok,
  checks.no_browser_private_name_access_ok,
  checks.exact_functions_present_ok,
  checks.exact_function_overloads_ok,
  checks.exact_function_security_ok,
  checks.no_browser_function_execute_ok,
  checks.exact_service_role_function_execute_ok,
  checks.exact_invitation_clear_trigger_ok,
  checks.atomic_name_only_create_contract_ok,
  checks.creator_only_set_contract_ok,
  checks.invitation_clears_private_name_contract_ok,
  checks.creator_only_projection_contract_ok,
  checks.private_name_values_valid_ok,
  checks.private_name_exclusive_state_ok,
  (
    SELECT pg_catalog.jsonb_object_agg(
      function_name,
      pg_catalog.jsonb_build_object(
        'signature', identity_arguments,
        'expected', service_execute,
        'actual', COALESCE(
          pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE'),
          false
        )
      )
      ORDER BY function_name
    )
    FROM function_state
  ) AS service_role_function_execute_state,
  data_state.private_name_rows,
  old_transactions.count AS transactions_older_than_five_minutes,
  (
    checks.loan_items_table_ok
    AND checks.loan_items_rls_enabled_ok
    AND checks.exact_private_name_column_ok
    AND checks.validated_private_name_constraint_ok
    AND checks.no_browser_private_name_access_ok
    AND checks.exact_functions_present_ok
    AND checks.exact_function_overloads_ok
    AND checks.exact_function_security_ok
    AND checks.no_browser_function_execute_ok
    AND checks.exact_service_role_function_execute_ok
    AND checks.exact_invitation_clear_trigger_ok
    AND checks.atomic_name_only_create_contract_ok
    AND checks.creator_only_set_contract_ok
    AND checks.invitation_clears_private_name_contract_ok
    AND checks.creator_only_projection_contract_ok
    AND checks.private_name_values_valid_ok
    AND checks.private_name_exclusive_state_ok
  ) AS postconditions_ok
FROM checks
CROSS JOIN private_data_state AS data_state
CROSS JOIN old_transactions;

ROLLBACK;
