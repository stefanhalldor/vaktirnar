-- SQL124 settlement proposal review guard preflight — READ ONLY.
-- Run only after SQL123 postflight. Every *_ok value must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH proposal AS (
  SELECT procedure.oid, procedure.proowner, procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig, procedure.prosrc
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
  )
), proposal_state AS (
  SELECT
    pg_catalog.count(*) = 1 AS proposal_function_ok,
    COALESCE(pg_catalog.bool_and(
      procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
    ), false) AS proposal_security_ok,
    COALESCE(pg_catalog.bool_and(
      owner_role.rolname = 'postgres'
    ), false) AS proposal_owner_ok,
    COALESCE(pg_catalog.bool_and(
      procedure.prosrc LIKE '%p_anchor_from_member_id%'
      AND procedure.prosrc LIKE '%expected_profile_state_token%'
      AND procedure.prosrc LIKE '%FULL JOIN pg_temp.expense_batch_current_contexts%'
      AND procedure.prosrc LIKE '%v_affected_group_ids IS NULL%'
      AND procedure.prosrc LIKE '%UPDATE public.expense_groups AS group_row%'
      AND procedure.prosrc NOT LIKE '%expense_reported_repayments_need_review%'
    ), false) AS unapplied_sql123_body_ok
  FROM proposal AS procedure
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure.proowner
), proposal_acl AS (
  SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM proposal AS procedure
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      (SELECT target.proacl
       FROM pg_catalog.pg_proc AS target
       WHERE target.oid = procedure.oid),
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role
    ON role.oid = privilege.grantee
), acl_state AS (
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM proposal_acl
      WHERE privilege_type = 'EXECUTE'
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AS no_browser_rpc_execute_ok,
    (SELECT pg_catalog.count(*)
      FROM proposal_acl
      WHERE privilege_type = 'EXECUTE'
        AND grantee = 'service_role'
    ) = 1 AS exact_service_role_rpc_execute_ok,
    NOT EXISTS (
      SELECT 1
      FROM proposal_acl
      WHERE privilege_type = 'EXECUTE'
        AND grantee NOT IN ('postgres', 'service_role')
    ) AS no_unexpected_rpc_execute_ok
), data_state AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.expense_settlement_batches)
      AS settlement_batch_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_settlement_batch_items)
      AS settlement_batch_item_rows
), dependency_state AS (
  SELECT
    pg_catalog.to_regclass('public.expense_settlement_batches') IS NOT NULL
      AS batch_table_ok,
    pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NOT NULL
      AS item_table_ok,
    pg_catalog.to_regprocedure(
      'public.expense_reported_repayments_need_review(uuid)'
    ) IS NOT NULL AS review_function_ok,
    NOT EXISTS (
      SELECT required.role_name
      FROM (VALUES
        ('postgres'), ('service_role'), ('anon'), ('authenticated')
      ) AS required(role_name)
      LEFT JOIN pg_catalog.pg_roles AS role
        ON role.rolname = required.role_name
      WHERE role.oid IS NULL
    ) AS required_roles_ok
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  dependency.batch_table_ok,
  dependency.item_table_ok,
  dependency.review_function_ok,
  proposal.proposal_function_ok,
  proposal.proposal_security_ok,
  proposal.proposal_owner_ok,
  proposal.unapplied_sql123_body_ok,
  acl.no_browser_rpc_execute_ok,
  acl.exact_service_role_rpc_execute_ok,
  acl.no_unexpected_rpc_execute_ok,
  dependency.required_roles_ok,
  data.settlement_batch_rows,
  data.settlement_batch_item_rows,
  (
    dependency.batch_table_ok
    AND dependency.item_table_ok
    AND dependency.review_function_ok
    AND proposal.proposal_function_ok
    AND proposal.proposal_security_ok
    AND proposal.proposal_owner_ok
    AND proposal.unapplied_sql123_body_ok
    AND acl.no_browser_rpc_execute_ok
    AND acl.exact_service_role_rpc_execute_ok
    AND acl.no_unexpected_rpc_execute_ok
    AND dependency.required_roles_ok
    AND data.settlement_batch_rows = 0
    AND data.settlement_batch_item_rows = 0
  ) AS prerequisites_ok
FROM proposal_state AS proposal
CROSS JOIN acl_state AS acl
CROSS JOIN data_state AS data
CROSS JOIN dependency_state AS dependency;

ROLLBACK;
