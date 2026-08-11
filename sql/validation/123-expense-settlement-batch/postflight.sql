-- SQL123 bilateral settlement batch postflight — READ ONLY.
-- Run only after separately approved application of SQL123. Every *_ok must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH target_functions AS (
  SELECT procedure.oid, procedure.proname, procedure.proowner,
    procedure.prosecdef, procedure.prosrc,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      ) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid IN (
    pg_catalog.to_regprocedure(
      'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.expense_transition_settlement_batch(uuid,uuid,text,uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    )
  )
), target_tables AS (
  SELECT relation.relname, relation.relrowsecurity, relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid IN (
    pg_catalog.to_regclass('public.expense_settlement_batches'),
    pg_catalog.to_regclass('public.expense_settlement_batch_items')
  )
), target_acl AS (
  SELECT function_row.proname, COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM target_functions AS function_row
  JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = function_row.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), required_triggers(
  trigger_name, relation_id, function_id, trigger_type
) AS (
  VALUES
    ('expense_settlement_batches_immutable_guard',
      pg_catalog.to_regclass('public.expense_settlement_batches'),
      pg_catalog.to_regprocedure('public.expense_guard_settlement_batch_mutation()'),
      27::smallint),
    ('expense_settlement_batch_items_immutable_guard',
      pg_catalog.to_regclass('public.expense_settlement_batch_items'),
      pg_catalog.to_regprocedure('public.expense_guard_settlement_batch_item_mutation()'),
      27::smallint),
    ('expense_repayments_batch_guard',
      pg_catalog.to_regclass('public.expense_repayments'),
      pg_catalog.to_regprocedure('public.expense_guard_batch_repayment_mutation()'),
      19::smallint),
    ('expense_payment_profiles_v2_owner_lock',
      pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
      pg_catalog.to_regprocedure('public.expense_lock_payment_profile_owner()'),
      31::smallint),
    ('expense_group_members_cancel_batches_before_unlink',
      pg_catalog.to_regclass('public.expense_group_members'),
      pg_catalog.to_regprocedure('public.expense_cancel_batches_before_user_unlink()'),
      19::smallint),
    ('expense_repayments_encrypted_snapshot',
      pg_catalog.to_regclass('public.expense_repayments'),
      pg_catalog.to_regprocedure('public.expense_attach_encrypted_payment_snapshot()'),
      7::smallint)
), missing_triggers AS (
  SELECT required.trigger_name
  FROM required_triggers AS required
  LEFT JOIN pg_catalog.pg_trigger AS present
    ON present.tgname = required.trigger_name
   AND present.tgrelid = required.relation_id
   AND present.tgfoid = required.function_id
   AND present.tgtype = required.trigger_type
   AND present.tgenabled = 'O'
   AND NOT present.tgisinternal
  WHERE present.oid IS NULL
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 2 FROM target_tables) AS tables_present_ok,
  (SELECT pg_catalog.count(*) = 2
      AND pg_catalog.bool_and(relrowsecurity AND relforcerowsecurity)
    FROM target_tables) AS force_rls_ok,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (
        'expense_settlement_batches', 'expense_settlement_batch_items'
      )
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS no_browser_table_grants_ok,
  (SELECT pg_catalog.count(*) = 3
      AND pg_catalog.bool_and(prosecdef AND fixed_empty_search_path)
    FROM target_functions) AS function_security_ok,
  NOT EXISTS (
    SELECT 1 FROM target_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) AS no_browser_rpc_execute_ok,
  (SELECT pg_catalog.count(*) = 3 FROM target_acl
    WHERE grantee = 'service_role' AND privilege_type = 'EXECUTE')
    AS exact_service_role_rpc_execute_ok,
  NOT EXISTS (SELECT 1 FROM missing_triggers) AS required_triggers_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(trigger_name ORDER BY trigger_name) FROM missing_triggers),
    '[]'::jsonb
  ) AS missing_required_triggers,
  COALESCE((
    SELECT pg_catalog.bool_and(
      function_row.prosrc LIKE '%expense_reported_repayments_need_review%'
      AND function_row.prosrc LIKE '%expected_profile_version%'
      AND function_row.prosrc LIKE '%expected_profile_state_token%'
      AND function_row.prosrc LIKE '%p_anchor_from_member_id%'
    )
    FROM target_functions AS function_row
    WHERE function_row.proname = 'expense_propose_settlement_batch'
  ), false) AS proposal_stale_state_contract_ok,
  COALESCE((
    SELECT pg_catalog.bool_and(
      function_row.prosrc LIKE '%expense_reported_repayments_need_review%'
      AND function_row.prosrc LIKE '%expense_settlement_batch_transition_invalid%'
    )
    FROM target_functions AS function_row
    WHERE function_row.proname = 'expense_transition_settlement_batch'
  ), false) AS confirmation_review_contract_ok,
  COALESCE((
    SELECT pg_catalog.bool_and(
      function_row.prosrc LIKE '%''state_token''%'
      AND function_row.prosrc LIKE '%payload_fingerprint%'
      AND function_row.prosrc LIKE '%expense_simplified_settlement%'
    )
    FROM target_functions AS function_row
    WHERE function_row.proname = 'expense_resolve_payment_profile_v2'
  ), false) AS payment_profile_state_token_contract_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.expense_repayments AS repayment
    WHERE NOT (
      (
        repayment.settlement_batch_id IS NULL
        AND repayment.settlement_method IS NULL
        AND repayment.settlement_sequence IS NULL
      )
      OR (
        repayment.settlement_batch_id IS NOT NULL
        AND repayment.settlement_method IS NOT NULL
        AND repayment.settlement_sequence IS NOT NULL
      )
    )
  ) AS repayment_metadata_rows_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.expense_settlement_batches AS batch
    WHERE batch.status = 'proposed'
      AND (batch.proposed_by_user_id IS NULL OR batch.counterparty_user_id IS NULL)
  ) AS proposed_batch_identity_ok,
  (SELECT pg_catalog.count(*) FROM public.expense_settlement_batches)
    AS settlement_batch_rows,
  (SELECT pg_catalog.count(*) FROM public.expense_settlement_batch_items)
    AS settlement_batch_item_rows;

ROLLBACK;
