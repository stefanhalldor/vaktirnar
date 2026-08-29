-- SQL165 recovery: restore only the exact predecessor function source.
-- Requires separate operator approval. It changes no user rows.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(104165);

DO $validate$
DECLARE
  v_function_oid oid;
  v_function_body text;
  v_contract_exact boolean;
  v_function_acl_exact boolean;
  v_wrapper_contract_exact boolean;
  v_wrapper_acl_exact boolean;
  v_wrapper_source_exact boolean;
  v_wrapper_base_call_exact boolean;
  v_share_foreign_keys_exact boolean;
  v_inbound_share_foreign_key_count_exact boolean;
  v_public_schema_acl_exact boolean;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql165_recovery_target_mismatch';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  );

  SELECT routine.prosrc,
    routine.prokind = 'f'
      AND routine.pronargs = 15
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.prosecdef
      AND routine.provolatile = 'v'
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_payments jsonb, p_shares jsonb'
      AS contract_exact
  INTO v_function_body, v_contract_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_function_oid;

  WITH
  role_oids AS MATERIALIZED (
    SELECT
      pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ),
  expected_function_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT roles.postgres_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
    UNION ALL
    SELECT roles.service_role_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
  ),
  function_acl_rows AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege_row
    WHERE routine.oid = v_function_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM function_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM function_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM function_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM function_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT routine.proacl IS NOT NULL
        AND routine.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, routine.oid, 'EXECUTE'
        )
      FROM pg_catalog.pg_proc AS routine WHERE routine.oid = v_function_oid
    ), false),
    false
  )
  INTO v_function_acl_exact
  FROM role_oids AS roles;

  SELECT
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and(
      wrapper.prokind = 'f' AND wrapper.pronargs = 17
      AND wrapper.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT wrapper.proretset AND wrapper.provolatile = 'v'
      AND wrapper.prosecdef AND NOT wrapper.proisstrict
      AND NOT wrapper.proleakproof AND wrapper.proparallel = 'u'
      AND wrapper.pronargdefaults = 0 AND wrapper.proargdefaults IS NULL
      AND wrapper.proallargtypes IS NULL AND wrapper.proargmodes IS NULL
      AND wrapper.proconfig = ARRAY['search_path=""']::text[]
      AND wrapper_language.lanname = 'plpgsql'
      AND wrapper.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(wrapper.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(wrapper.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_new_participant_invitations jsonb, p_removed_member_ids uuid[], p_payments jsonb, p_shares jsonb'
    ), false),
    COALESCE(pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(wrapper.prosrc, E'\r\n', E'\n'))
        = 'c3a1ab7746d50ed552c625bbc95efbab'
    ), false),
    COALESCE(pg_catalog.bool_and(
      pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'v_result := public.expense_update_expense(', ''
        )) = pg_catalog.length('v_result := public.expense_update_expense(')
      AND pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'public.expense_update_expense(', ''
        )) = pg_catalog.length('public.expense_update_expense(')
      AND pg_catalog.to_regprocedure(
        'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
      ) = v_function_oid
    ), false)
  INTO v_wrapper_contract_exact, v_wrapper_source_exact, v_wrapper_base_call_exact
  FROM pg_catalog.pg_proc AS wrapper
  JOIN pg_catalog.pg_language AS wrapper_language
    ON wrapper_language.oid = wrapper.prolang
  WHERE wrapper.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
  );

  WITH
  role_oids AS MATERIALIZED (
    SELECT
      pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ),
  expected_function_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT roles.postgres_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
    UNION ALL
    SELECT roles.service_role_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
  ),
  wrapper_acl_rows AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS wrapper
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      wrapper.proacl, pg_catalog.acldefault('f', wrapper.proowner)
    )) AS privilege_row
    WHERE wrapper.oid = pg_catalog.to_regprocedure(
      'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
    )
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM wrapper_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM wrapper_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM wrapper_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM wrapper_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT wrapper.proacl IS NOT NULL
        AND wrapper.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, wrapper.oid, 'EXECUTE'
        )
      FROM pg_catalog.pg_proc AS wrapper
      WHERE wrapper.oid = pg_catalog.to_regprocedure(
        'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
      )
    ), false),
    false
  )
  INTO v_wrapper_acl_exact
  FROM role_oids AS roles;

  SELECT pg_catalog.count(*) = 2
      AND COALESCE(pg_catalog.bool_and(
        constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.confdeltype = 'r'
        AND constraint_row.confupdtype = 'a'
        AND constraint_row.confmatchtype = 's'
        AND constraint_row.confrelid = 'public.expense_shares'::pg_catalog.regclass
        AND ARRAY(
          SELECT attribute.attname::text
          FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ordinal)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.confrelid AND attribute.attnum = key.attnum
          ORDER BY key.ordinal
        ) = ARRAY['expense_id', 'member_id']::text[]
        AND (
          (constraint_row.conname = 'expense_share_collaborators_expense_share_fk'
            AND constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
            AND ARRAY(
              SELECT attribute.attname::text
              FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
              JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
              ORDER BY key.ordinal
            ) = ARRAY['expense_id', 'share_member_id']::text[])
          OR
          (constraint_row.conname = 'expense_member_invitations_shared_share_fk'
            AND constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
            AND ARRAY(
              SELECT attribute.attname::text
              FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
              JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
              ORDER BY key.ordinal
            ) = ARRAY['shared_expense_id', 'shared_share_member_id']::text[])
        )
      ), false),
    (
      SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.pg_constraint AS inbound_constraint
      WHERE inbound_constraint.contype = 'f'
        AND inbound_constraint.confrelid = 'public.expense_shares'::pg_catalog.regclass
    )
  INTO v_share_foreign_keys_exact, v_inbound_share_foreign_key_count_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE (
    (constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_share_collaborators_expense_share_fk')
    OR
    (constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_member_invitations_shared_share_fk')
  );

  WITH
  expected_schema_acl(grantee, privilege_type) AS (
    VALUES
      ('PUBLIC'::text, 'USAGE'::text),
      ('pg_database_owner', 'CREATE'),
      ('pg_database_owner', 'USAGE'),
      ('postgres', 'USAGE'),
      ('anon', 'USAGE'),
      ('authenticated', 'USAGE'),
      ('service_role', 'USAGE')
  ),
  schema_acl_rows AS MATERIALIZED (
    SELECT COALESCE(grantee_role.rolname, 'PUBLIC')::text AS grantee,
      privilege_row.privilege_type,
      grantor_role.rolname AS grantor,
      privilege_row.is_grantable
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS privilege_row
    LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege_row.grantee
    LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = privilege_row.grantor
    WHERE namespace.nspname = 'public'
  )
  SELECT COALESCE(
    (SELECT pg_catalog.pg_get_userbyid(namespace.nspowner) = 'pg_database_owner'
       AND namespace.nspacl IS NOT NULL
     FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspname = 'public')
    AND (SELECT pg_catalog.count(*) FROM schema_acl_rows) = 7
    AND NOT EXISTS (SELECT grantee, privilege_type FROM schema_acl_rows
      EXCEPT SELECT grantee, privilege_type FROM expected_schema_acl)
    AND NOT EXISTS (SELECT grantee, privilege_type FROM expected_schema_acl
      EXCEPT SELECT grantee, privilege_type FROM schema_acl_rows)
    AND NOT EXISTS (SELECT 1 FROM schema_acl_rows
      WHERE grantor IS DISTINCT FROM 'pg_database_owner' OR is_grantable),
    false
  )
  INTO v_public_schema_acl_exact;

  IF v_function_oid IS NULL
     OR v_function_body IS NULL
     OR NOT COALESCE(v_contract_exact, false)
     OR pg_catalog.md5(pg_catalog.replace(v_function_body, E'\r\n', E'\n'))
       <> '30ba02f3b79d2c7a9387ee504d198d12'
     OR NOT COALESCE(v_function_acl_exact, false)
     OR NOT COALESCE(v_wrapper_contract_exact, false)
     OR NOT COALESCE(v_wrapper_acl_exact, false)
     OR NOT COALESCE(v_wrapper_source_exact, false)
     OR NOT COALESCE(v_wrapper_base_call_exact, false)
     OR NOT COALESCE(v_share_foreign_keys_exact, false)
     OR NOT COALESCE(v_inbound_share_foreign_key_count_exact, false)
     OR NOT COALESCE(v_public_schema_acl_exact, false) THEN
    RAISE EXCEPTION 'expense_sql165_recovery_target_mismatch';
  END IF;
END;
$validate$;

REVOKE EXECUTE ON FUNCTION public.expense_update_expense(
  uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb
) FROM service_role;

DO $recovery$
DECLARE
  v_oid oid;
  v_body text;
  v_recovered_body text;
  v_predecessor_hash constant text := '675891833b4bb9aeb130f74da94994b3';
  v_target_hash constant text := '30ba02f3b79d2c7a9387ee504d198d12';
  v_old_gate constant text := $old_gate$  v_before_snapshot := public.expense_build_revision_snapshot(v_group_id, p_expense_id);$old_gate$;
  v_new_gate constant text := $new_gate$  IF NOT p_preserve_shares THEN
    PERFORM share.member_id
    FROM public.expense_shares AS share
    WHERE share.expense_id = p_expense_id
    ORDER BY share.member_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.expense_shares AS obsolete_share
      WHERE obsolete_share.expense_id = p_expense_id
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_shares) AS submitted(value)
          WHERE (submitted.value->>'member_id')::uuid = obsolete_share.member_id
        )
        AND (
          EXISTS (
            SELECT 1
            FROM public.expense_share_collaborators AS collaborator_reference
            WHERE collaborator_reference.expense_id = obsolete_share.expense_id
              AND collaborator_reference.share_member_id = obsolete_share.member_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.expense_member_invitations AS invitation_reference
            WHERE invitation_reference.shared_expense_id = obsolete_share.expense_id
              AND invitation_reference.shared_share_member_id = obsolete_share.member_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'expense_share_has_durable_reference';
    END IF;
  END IF;

  v_before_snapshot := public.expense_build_revision_snapshot(v_group_id, p_expense_id);$new_gate$;
  v_old_mutation constant text := $old_mutation$  IF NOT p_preserve_shares THEN
    DELETE FROM public.expense_shares AS share WHERE share.expense_id = p_expense_id;
    INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)
    SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
    FROM jsonb_array_elements(p_shares) AS item;
  END IF;$old_mutation$;
  v_new_mutation constant text := $new_mutation$  IF NOT p_preserve_shares THEN
    UPDATE public.expense_shares AS share
    SET amount_minor = (submitted.value->>'amount_minor')::bigint
    FROM jsonb_array_elements(p_shares) AS submitted(value)
    WHERE share.expense_id = p_expense_id
      AND share.member_id = (submitted.value->>'member_id')::uuid;

    INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)
    SELECT v_group_id, p_expense_id,
      (submitted.value->>'member_id')::uuid,
      (submitted.value->>'amount_minor')::bigint
    FROM jsonb_array_elements(p_shares) AS submitted(value)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.expense_shares AS current_share
        WHERE current_share.expense_id = p_expense_id
          AND current_share.member_id = (submitted.value->>'member_id')::uuid
      );

    DELETE FROM public.expense_shares AS share
    WHERE share.expense_id = p_expense_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_shares) AS submitted(value)
        WHERE (submitted.value->>'member_id')::uuid = share.member_id
      );
  END IF;$new_mutation$;
BEGIN
  v_oid := pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  );
  SELECT routine.prosrc INTO v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_oid;
  IF v_body IS NULL
     OR pg_catalog.md5(pg_catalog.replace(v_body, E'\r\n', E'\n')) <> v_target_hash
     OR pg_catalog.strpos(v_body, v_new_gate) = 0
     OR pg_catalog.strpos(v_body, v_new_mutation) = 0 THEN
    RAISE EXCEPTION 'expense_sql165_recovery_target_mismatch';
  END IF;

  v_recovered_body := pg_catalog.replace(
    pg_catalog.replace(v_body, v_new_gate, v_old_gate),
    v_new_mutation,
    v_old_mutation
  );
  IF pg_catalog.md5(pg_catalog.replace(v_recovered_body, E'\r\n', E'\n')) <> v_predecessor_hash THEN
    RAISE EXCEPTION 'expense_sql165_recovery_source_mismatch';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.expense_update_expense(p_actor_id uuid,p_request_id uuid,p_expense_id uuid,p_expected_financial_version bigint,p_title text,p_total_minor bigint,p_currency text,p_incurred_on date,p_category text,p_note text,p_split_method text,p_preserve_shares boolean,p_new_guest_members jsonb,p_payments jsonb,p_shares jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',
    v_recovered_body
  );
  IF pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  ) IS DISTINCT FROM v_oid THEN
    RAISE EXCEPTION 'expense_sql165_recovery_identity_mismatch';
  END IF;
END;
$recovery$;

GRANT EXECUTE ON FUNCTION public.expense_update_expense(
  uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb
) TO service_role;

DO $postcondition$
DECLARE
  v_function_oid oid;
  v_function_body text;
  v_contract_exact boolean;
  v_function_acl_exact boolean;
  v_wrapper_contract_exact boolean;
  v_wrapper_acl_exact boolean;
  v_wrapper_source_exact boolean;
  v_wrapper_base_call_exact boolean;
  v_share_foreign_keys_exact boolean;
  v_inbound_share_foreign_key_count_exact boolean;
  v_public_schema_acl_exact boolean;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql165_recovery_postcondition_failed';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  );

  SELECT routine.prosrc,
    routine.prokind = 'f'
      AND routine.pronargs = 15
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.prosecdef
      AND routine.provolatile = 'v'
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_payments jsonb, p_shares jsonb'
      AS contract_exact
  INTO v_function_body, v_contract_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_function_oid;

  WITH
  role_oids AS MATERIALIZED (
    SELECT
      pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ),
  expected_function_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT roles.postgres_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
    UNION ALL
    SELECT roles.service_role_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
  ),
  function_acl_rows AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege_row
    WHERE routine.oid = v_function_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM function_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM function_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM function_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM function_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT routine.proacl IS NOT NULL
        AND routine.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, routine.oid, 'EXECUTE'
        )
      FROM pg_catalog.pg_proc AS routine WHERE routine.oid = v_function_oid
    ), false),
    false
  )
  INTO v_function_acl_exact
  FROM role_oids AS roles;

  SELECT
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and(
      wrapper.prokind = 'f' AND wrapper.pronargs = 17
      AND wrapper.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT wrapper.proretset AND wrapper.provolatile = 'v'
      AND wrapper.prosecdef AND NOT wrapper.proisstrict
      AND NOT wrapper.proleakproof AND wrapper.proparallel = 'u'
      AND wrapper.pronargdefaults = 0 AND wrapper.proargdefaults IS NULL
      AND wrapper.proallargtypes IS NULL AND wrapper.proargmodes IS NULL
      AND wrapper.proconfig = ARRAY['search_path=""']::text[]
      AND wrapper_language.lanname = 'plpgsql'
      AND wrapper.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(wrapper.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(wrapper.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_new_participant_invitations jsonb, p_removed_member_ids uuid[], p_payments jsonb, p_shares jsonb'
    ), false),
    COALESCE(pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(wrapper.prosrc, E'\r\n', E'\n'))
        = 'c3a1ab7746d50ed552c625bbc95efbab'
    ), false),
    COALESCE(pg_catalog.bool_and(
      pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'v_result := public.expense_update_expense(', ''
        )) = pg_catalog.length('v_result := public.expense_update_expense(')
      AND pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'public.expense_update_expense(', ''
        )) = pg_catalog.length('public.expense_update_expense(')
      AND pg_catalog.to_regprocedure(
        'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
      ) = v_function_oid
    ), false)
  INTO v_wrapper_contract_exact, v_wrapper_source_exact, v_wrapper_base_call_exact
  FROM pg_catalog.pg_proc AS wrapper
  JOIN pg_catalog.pg_language AS wrapper_language
    ON wrapper_language.oid = wrapper.prolang
  WHERE wrapper.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
  );

  WITH
  role_oids AS MATERIALIZED (
    SELECT
      pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ),
  expected_function_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT roles.postgres_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
    UNION ALL
    SELECT roles.service_role_oid, roles.postgres_oid, 'EXECUTE'::text, false
    FROM role_oids AS roles
  ),
  wrapper_acl_rows AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS wrapper
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      wrapper.proacl, pg_catalog.acldefault('f', wrapper.proowner)
    )) AS privilege_row
    WHERE wrapper.oid = pg_catalog.to_regprocedure(
      'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
    )
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM wrapper_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM wrapper_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM wrapper_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM wrapper_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT wrapper.proacl IS NOT NULL
        AND wrapper.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, wrapper.oid, 'EXECUTE'
        )
      FROM pg_catalog.pg_proc AS wrapper
      WHERE wrapper.oid = pg_catalog.to_regprocedure(
        'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
      )
    ), false),
    false
  )
  INTO v_wrapper_acl_exact
  FROM role_oids AS roles;

  SELECT pg_catalog.count(*) = 2
      AND COALESCE(pg_catalog.bool_and(
        constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.confdeltype = 'r'
        AND constraint_row.confupdtype = 'a'
        AND constraint_row.confmatchtype = 's'
        AND constraint_row.confrelid = 'public.expense_shares'::pg_catalog.regclass
        AND ARRAY(
          SELECT attribute.attname::text
          FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ordinal)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.confrelid AND attribute.attnum = key.attnum
          ORDER BY key.ordinal
        ) = ARRAY['expense_id', 'member_id']::text[]
        AND (
          (constraint_row.conname = 'expense_share_collaborators_expense_share_fk'
            AND constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
            AND ARRAY(
              SELECT attribute.attname::text
              FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
              JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
              ORDER BY key.ordinal
            ) = ARRAY['expense_id', 'share_member_id']::text[])
          OR
          (constraint_row.conname = 'expense_member_invitations_shared_share_fk'
            AND constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
            AND ARRAY(
              SELECT attribute.attname::text
              FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
              JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
              ORDER BY key.ordinal
            ) = ARRAY['shared_expense_id', 'shared_share_member_id']::text[])
        )
      ), false),
    (
      SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.pg_constraint AS inbound_constraint
      WHERE inbound_constraint.contype = 'f'
        AND inbound_constraint.confrelid = 'public.expense_shares'::pg_catalog.regclass
    )
  INTO v_share_foreign_keys_exact, v_inbound_share_foreign_key_count_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE (
    (constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_share_collaborators_expense_share_fk')
    OR
    (constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_member_invitations_shared_share_fk')
  );

  WITH
  expected_schema_acl(grantee, privilege_type) AS (
    VALUES
      ('PUBLIC'::text, 'USAGE'::text),
      ('pg_database_owner', 'CREATE'),
      ('pg_database_owner', 'USAGE'),
      ('postgres', 'USAGE'),
      ('anon', 'USAGE'),
      ('authenticated', 'USAGE'),
      ('service_role', 'USAGE')
  ),
  schema_acl_rows AS MATERIALIZED (
    SELECT COALESCE(grantee_role.rolname, 'PUBLIC')::text AS grantee,
      privilege_row.privilege_type,
      grantor_role.rolname AS grantor,
      privilege_row.is_grantable
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS privilege_row
    LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege_row.grantee
    LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = privilege_row.grantor
    WHERE namespace.nspname = 'public'
  )
  SELECT COALESCE(
    (SELECT pg_catalog.pg_get_userbyid(namespace.nspowner) = 'pg_database_owner'
       AND namespace.nspacl IS NOT NULL
     FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspname = 'public')
    AND (SELECT pg_catalog.count(*) FROM schema_acl_rows) = 7
    AND NOT EXISTS (SELECT grantee, privilege_type FROM schema_acl_rows
      EXCEPT SELECT grantee, privilege_type FROM expected_schema_acl)
    AND NOT EXISTS (SELECT grantee, privilege_type FROM expected_schema_acl
      EXCEPT SELECT grantee, privilege_type FROM schema_acl_rows)
    AND NOT EXISTS (SELECT 1 FROM schema_acl_rows
      WHERE grantor IS DISTINCT FROM 'pg_database_owner' OR is_grantable),
    false
  )
  INTO v_public_schema_acl_exact;

  IF v_function_oid IS NULL
     OR v_function_body IS NULL
     OR NOT COALESCE(v_contract_exact, false)
     OR pg_catalog.md5(pg_catalog.replace(v_function_body, E'\r\n', E'\n'))
       <> '675891833b4bb9aeb130f74da94994b3'
     OR NOT COALESCE(v_function_acl_exact, false)
     OR NOT COALESCE(v_wrapper_contract_exact, false)
     OR NOT COALESCE(v_wrapper_acl_exact, false)
     OR NOT COALESCE(v_wrapper_source_exact, false)
     OR NOT COALESCE(v_wrapper_base_call_exact, false)
     OR NOT COALESCE(v_share_foreign_keys_exact, false)
     OR NOT COALESCE(v_inbound_share_foreign_key_count_exact, false)
     OR NOT COALESCE(v_public_schema_acl_exact, false) THEN
    RAISE EXCEPTION 'expense_sql165_recovery_postcondition_failed';
  END IF;
END;
$postcondition$;

COMMIT;
