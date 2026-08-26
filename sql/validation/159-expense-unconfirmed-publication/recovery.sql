-- SQL159 revoke-only recovery.
-- HARD STOP: first prove every app instance has stopped calling these RPCs.
-- This transaction retains all schema objects, rows, triggers and old writers.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';
SELECT pg_catalog.pg_advisory_xact_lock(159159);

DO $recovery_gate$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql159_recovery_executor_mismatch';
  END IF;

  IF pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'expense_sql159_recovery_role_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    WHERE relation_row.oid = pg_catalog.to_regclass(
            'public.expense_sql159_install_baseline'
          )
      AND relation_row.relkind = 'r'
      AND relation_row.relrowsecurity
      AND relation_row.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation_row.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation_row.oid
      )
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
            WHEN pg_catalog.current_setting('server_version_num')::integer
              >= 170000 THEN 1 ELSE 0 END
          AND COALESCE(pg_catalog.bool_and(
            privilege_row.grantee = relation_row.relowner
            AND privilege_row.grantor = relation_row.relowner
            AND NOT privilege_row.is_grantable
            AND privilege_row.privilege_type IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'
            )
          ), false)
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS privilege_row
      )
  ) THEN
    RAISE EXCEPTION 'expense_sql159_recovery_baseline_mismatch';
  END IF;

  IF (
    WITH expected(
      signature, exact_arguments, source_hash, volatility
    ) AS (VALUES
      (
        'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)',
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_split_confirmed boolean',
        '14ac1abc9046fea4812ac652a9b96088', 'v'::"char"
      ),
      (
        'public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)',
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
        'ca805bbd38dbd013e1c034e0049432ec', 'v'::"char"
      ),
      (
        'public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)',
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
        '9d440591ad52a108f3e6a5212722c1fa', 'v'::"char"
      ),
      (
        'public.expense_get_private_draft_publication_lifecycle(uuid,uuid)',
        'p_actor_id uuid, p_draft_id uuid',
        '16fd85b239a880a4c0c12c3b0a078151', 's'::"char"
      ),
      (
        'public.expense_list_visible_shared_drafts(uuid)',
        'p_actor_id uuid',
        '59b01785320ce254fb4ac7d6168709bc', 'v'::"char"
      ),
      (
        'public.expense_get_shared_draft_detail(uuid,uuid)',
        'p_actor_id uuid, p_publication_id uuid',
        '51a607ab9bc5e5ad5a19f4b9d96aa00b', 'v'::"char"
      ),
      (
        'public.expense_list_group_shared_drafts(uuid,uuid)',
        'p_actor_id uuid, p_group_id uuid',
        '0a06c9d47c9c17dad77c715fbef50d55', 'v'::"char"
      ),
      (
        'public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid',
        '4332f4ccfd5e58f2e17ebe9389c13311', 'v'::"char"
      )
    ), target_catalog AS (
      SELECT expected.*, function_row.oid, function_row.pronamespace,
        function_row.proname, function_row.prokind,
        function_row.prorettype, function_row.proretset,
        function_row.prosecdef, function_row.provolatile,
        function_row.proisstrict, function_row.proleakproof,
        function_row.proparallel, function_row.pronargdefaults,
        function_row.proconfig, function_row.proowner,
        function_row.proacl, function_row.prosrc,
        language_row.lanname
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = function_row.prolang
    )
    SELECT pg_catalog.count(*) = 8
      AND COALESCE(pg_catalog.bool_and(
        target_catalog.oid IS NOT NULL
        AND target_catalog.prokind = 'f'
        AND target_catalog.prorettype =
              'pg_catalog.jsonb'::pg_catalog.regtype
        AND NOT target_catalog.proretset
        AND target_catalog.prosecdef
        AND target_catalog.provolatile = target_catalog.volatility
        AND NOT target_catalog.proisstrict
        AND NOT target_catalog.proleakproof
        AND target_catalog.proparallel = 'u'
        AND target_catalog.pronargdefaults = 0
        AND target_catalog.proconfig = ARRAY['search_path=""']::text[]
        AND target_catalog.lanname = 'plpgsql'
        AND pg_catalog.pg_get_userbyid(target_catalog.proowner) = 'postgres'
        AND pg_catalog.pg_get_function_arguments(target_catalog.oid) =
              target_catalog.exact_arguments
        AND pg_catalog.md5(pg_catalog.replace(
              target_catalog.prosrc, E'\r\n', E'\n'
            )) = target_catalog.source_hash
        AND (
          SELECT pg_catalog.count(*) = 1
          FROM pg_catalog.pg_proc AS overload_row
          WHERE overload_row.pronamespace = target_catalog.pronamespace
            AND overload_row.proname = target_catalog.proname
        )
        AND (
          SELECT pg_catalog.count(*) = 2
          FROM pg_catalog.aclexplode(COALESCE(
            target_catalog.proacl,
            pg_catalog.acldefault('f', target_catalog.proowner)
          )) AS privilege_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_row
            ON grantee_row.oid = privilege_row.grantee
          WHERE privilege_row.privilege_type = 'EXECUTE'
            AND privilege_row.grantor = target_catalog.proowner
            AND NOT privilege_row.is_grantable
            AND (
              privilege_row.grantee = target_catalog.proowner
              OR grantee_row.rolname = 'service_role'
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            target_catalog.proacl,
            pg_catalog.acldefault('f', target_catalog.proowner)
          )) AS privilege_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_row
            ON grantee_row.oid = privilege_row.grantee
          WHERE privilege_row.privilege_type <> 'EXECUTE'
             OR privilege_row.grantor <> target_catalog.proowner
             OR privilege_row.is_grantable
             OR privilege_row.grantee = 0
             OR (
               privilege_row.grantee <> target_catalog.proowner
               AND grantee_row.rolname IS DISTINCT FROM 'service_role'
             )
        )
      ), false)
    FROM target_catalog
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql159_recovery_target_mismatch';
  END IF;

  IF (
    WITH expected(signature, source_hash, expected_config) AS (VALUES
      (
        'public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
        '536efe2584ce8b45ad8ecacf5574dfd4',
        ARRAY['search_path=""']::text[]
      ),
      (
        'public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)',
        '648ea05ac92e58e79e66c8cb34267f3d',
        ARRAY['search_path=pg_catalog, public']::text[]
      ),
      (
        'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
        'ad0fd30363a3c9f5d8e7b51be6f1bfa2',
        ARRAY['search_path=pg_catalog, public']::text[]
      ),
      (
        'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
        '5da34435052493c4c993bc88e82a72dd',
        ARRAY['search_path=""']::text[]
      ),
      (
        'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
        'eca30a044e0406a755fb02399070c3f8',
        ARRAY['search_path=""']::text[]
      ),
      (
        'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
        'a30f4dff7aa3d616476da29c82e1b177',
        ARRAY['search_path=""']::text[]
      ),
      (
        'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
        '719a00f72fccbfac3f5f2cb778c2accb',
        ARRAY['search_path=""']::text[]
      )
    ), predecessor_catalog AS (
      SELECT expected.*, function_row.oid, function_row.pronamespace,
        function_row.proname, function_row.prokind,
        function_row.prorettype, function_row.proretset,
        function_row.prosecdef, function_row.provolatile,
        function_row.proowner, function_row.proacl,
        function_row.proconfig, function_row.prosrc,
        language_row.lanname
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = function_row.prolang
    )
    SELECT pg_catalog.count(*) = 7
      AND COALESCE(pg_catalog.bool_and(
        predecessor_catalog.oid IS NOT NULL
        AND predecessor_catalog.prokind = 'f'
        AND predecessor_catalog.prorettype =
              'pg_catalog.jsonb'::pg_catalog.regtype
        AND NOT predecessor_catalog.proretset
        AND predecessor_catalog.prosecdef
        AND predecessor_catalog.provolatile = 'v'
        AND predecessor_catalog.proconfig =
              predecessor_catalog.expected_config
        AND predecessor_catalog.lanname = 'plpgsql'
        AND pg_catalog.pg_get_userbyid(predecessor_catalog.proowner) =
              'postgres'
        AND pg_catalog.md5(pg_catalog.replace(
              predecessor_catalog.prosrc, E'\r\n', E'\n'
            )) = predecessor_catalog.source_hash
        AND (
          SELECT pg_catalog.count(*) = 1
          FROM pg_catalog.pg_proc AS overload_row
          WHERE overload_row.pronamespace =
                predecessor_catalog.pronamespace
            AND overload_row.proname = predecessor_catalog.proname
        )
        AND (
          SELECT pg_catalog.count(*) = 2
          FROM pg_catalog.aclexplode(COALESCE(
            predecessor_catalog.proacl,
            pg_catalog.acldefault('f', predecessor_catalog.proowner)
          )) AS privilege_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_row
            ON grantee_row.oid = privilege_row.grantee
          WHERE privilege_row.privilege_type = 'EXECUTE'
            AND privilege_row.grantor = predecessor_catalog.proowner
            AND NOT privilege_row.is_grantable
            AND (
              privilege_row.grantee = predecessor_catalog.proowner
              OR grantee_row.rolname = 'service_role'
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            predecessor_catalog.proacl,
            pg_catalog.acldefault('f', predecessor_catalog.proowner)
          )) AS privilege_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_row
            ON grantee_row.oid = privilege_row.grantee
          WHERE privilege_row.privilege_type <> 'EXECUTE'
             OR privilege_row.grantor <> predecessor_catalog.proowner
             OR privilege_row.is_grantable
             OR privilege_row.grantee = 0
             OR (
               privilege_row.grantee <> predecessor_catalog.proowner
               AND grantee_row.rolname IS DISTINCT FROM 'service_role'
             )
        )
      ), false)
    FROM predecessor_catalog
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql159_recovery_predecessor_mismatch';
  END IF;
END;
$recovery_gate$;

REVOKE EXECUTE ON FUNCTION
  public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean),
  public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_get_private_draft_publication_lifecycle(uuid,uuid),
  public.expense_list_visible_shared_drafts(uuid),
  public.expense_get_shared_draft_detail(uuid,uuid),
  public.expense_list_group_shared_drafts(uuid,uuid),
  public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
FROM service_role;

DO $recovery_postcondition$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'),
      ('public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)'),
      ('public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)'),
      ('public.expense_get_private_draft_publication_lifecycle(uuid,uuid)'),
      ('public.expense_list_visible_shared_drafts(uuid)'),
      ('public.expense_get_shared_draft_detail(uuid,uuid)'),
      ('public.expense_list_group_shared_drafts(uuid,uuid)'),
      ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)')
    ) AS expected(signature)
    LEFT JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
    WHERE function_row.oid IS NULL
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )) AS privilege_row
         WHERE privilege_row.privilege_type = 'EXECUTE'
           AND privilege_row.grantor = function_row.proowner
           AND NOT privilege_row.is_grantable
           AND privilege_row.grantee = function_row.proowner
       ) <> 1
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           function_row.proacl,
           pg_catalog.acldefault('f', function_row.proowner)
         )) AS privilege_row
         WHERE privilege_row.privilege_type <> 'EXECUTE'
            OR privilege_row.grantor <> function_row.proowner
            OR privilege_row.is_grantable
            OR privilege_row.grantee = 0
            OR privilege_row.grantee <> function_row.proowner
       )
  ) THEN
    RAISE EXCEPTION 'expense_sql159_recovery_acl_revoke_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
      ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)'),
      ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'),
      ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'),
      ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'),
      ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'),
      ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)')
    ) AS expected(signature)
    JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
    WHERE EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege_row
      JOIN pg_catalog.pg_roles AS grantee_row
        ON grantee_row.oid = privilege_row.grantee
      WHERE privilege_row.privilege_type = 'EXECUTE'
        AND privilege_row.grantor = function_row.proowner
        AND NOT privilege_row.is_grantable
        AND grantee_row.rolname = 'service_role'
    )
  ) <> 7 THEN
    RAISE EXCEPTION 'expense_sql159_recovery_predecessor_access_changed';
  END IF;
END;
$recovery_postcondition$;

COMMIT;
