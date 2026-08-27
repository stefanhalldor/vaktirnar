-- SQL162 preflight. 100% read-only.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH expected_roles(role_name, expected_bypass_rls) AS (VALUES
  ('anon', false), ('authenticated', false), ('service_role', true)
), role_contract AS MATERIALIZED (
  SELECT pg_catalog.count(role_row.oid) = 3
    AND COALESCE(pg_catalog.bool_and(
      role_row.oid IS NOT NULL
      AND role_row.rolbypassrls = expected_roles.expected_bypass_rls
    ), false) AS roles_exact
  FROM expected_roles
  LEFT JOIN pg_catalog.pg_roles AS role_row
    ON role_row.rolname = expected_roles.role_name
), expected_relation_security(
  signature, expected_rls, expected_force, expected_policy_count,
  expected_nonowner_acl
) AS (VALUES
  ('public.expense_private_drafts',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publications',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publication_parties',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publication_audience',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_finalizations',true,true,0,ARRAY[]::text[]),
  ('public.expense_private_draft_tombstones',true,true,0,ARRAY[]::text[]),
  ('public.expense_groups',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_group_members',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expenses',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_payments',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_shares',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_obligations',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_repayments',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_repayment_allocations',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_mutation_requests',true,false,0,ARRAY[]::text[]),
  ('public.teskeid_events',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_guests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_mutation_requests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_attendance_memberships',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participations',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participation_rsvp_v3',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_expense_links',true,true,0,ARRAY[]::text[])
), relation_security_observed AS MATERIALIZED (
  SELECT expected_relation_security.*,
    relation.oid AS relation_oid,
    relation.relkind,
    relation.relpersistence,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relowner,
    relation.relacl,
    pg_catalog.pg_get_userbyid(relation.relowner) AS actual_owner,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_policy AS policy_row
     WHERE policy_row.polrelid = relation.oid) AS actual_policy_count,
    COALESCE((
      SELECT pg_catalog.array_agg(
        (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(privilege.grantee) END) || ':' ||
          privilege.privilege_type
        ORDER BY ((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(privilege.grantee) END) || ':' ||
          privilege.privilege_type) COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      WHERE privilege.grantee <> relation.relowner
    ), ARRAY[]::text[]) AS actual_nonowner_acl,
    NOT EXISTS (
      SELECT 1
      FROM (VALUES ('anon'), ('authenticated'), ('service_role'))
        AS checked_role(role_name)
      CROSS JOIN (VALUES
        ('SELECT', 0), ('INSERT', 0), ('UPDATE', 0), ('DELETE', 0),
        ('TRUNCATE', 0), ('REFERENCES', 0), ('TRIGGER', 0),
        ('MAINTAIN', 170000)
      ) AS checked_privilege(privilege_type, minimum_version)
      WHERE CASE
        WHEN pg_catalog.current_setting('server_version_num')::integer <
          checked_privilege.minimum_version THEN false
        ELSE pg_catalog.has_table_privilege(
            checked_role.role_name::name, relation.oid,
            checked_privilege.privilege_type
          ) IS DISTINCT FROM (
            (checked_role.role_name || ':' ||
              checked_privilege.privilege_type) = ANY(
                expected_relation_security.expected_nonowner_acl
              )
          )
        END
    ) AS effective_nonowner_acl_exact
  FROM expected_relation_security
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass(
      expected_relation_security.signature
    )
), relation_security_checks AS MATERIALIZED (
  SELECT relation_security_observed.*,
    COALESCE(
      relation_oid IS NOT NULL
      AND relkind = 'r'
      AND relpersistence = 'p'
      AND actual_owner = 'postgres'
      AND relrowsecurity = expected_rls
      AND relforcerowsecurity = expected_force
      AND actual_policy_count = expected_policy_count
      AND actual_nonowner_acl = expected_nonowner_acl
      AND effective_nonowner_acl_exact
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >=
            170000 THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation_security_observed.relacl,
          pg_catalog.acldefault('r', relation_security_observed.relowner)
        )) AS privilege
        WHERE privilege.grantee = relation_security_observed.relowner
          AND privilege.grantor = relation_security_observed.relowner
          AND NOT privilege.is_grantable
          AND privilege.privilege_type IN (
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
            'TRIGGER','MAINTAIN'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          relation_security_observed.relacl,
          pg_catalog.acldefault('r', relation_security_observed.relowner)
        )) AS privilege
        WHERE privilege.grantor <> relation_security_observed.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
             'TRIGGER','MAINTAIN'
           )
      ), false
    ) AS relation_exact
  FROM relation_security_observed
), relation_security_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 22
      AND COALESCE(pg_catalog.bool_and(relation_exact), false)
        AS relation_security_exact,
    pg_catalog.count(*)::integer AS relation_security_count,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'relation', signature,
      'expected_rls', expected_rls,
      'actual_rls', relrowsecurity,
      'expected_force', expected_force,
      'actual_force', relforcerowsecurity,
      'expected_policy_count', expected_policy_count,
      'actual_policy_count', actual_policy_count,
      'expected_nonowner_acl', expected_nonowner_acl,
      'actual_nonowner_acl', actual_nonowner_acl,
      'effective_nonowner_acl_exact', effective_nonowner_acl_exact,
      'exact', relation_exact
    ) ORDER BY signature COLLATE pg_catalog."C") AS relation_security_evidence
  FROM relation_security_checks
), expected_installed(
  signature, exact_arguments, source_hash, language_name, volatility,
  return_type, exact_config, service_execute
) AS (VALUES
  ('public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)', 'p_actor_id uuid, p_event_id uuid, p_expected_roster_revision bigint', '8b6a4c09987ab097352ff54e2e4bf1c6', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_list_expense_contexts_v1(uuid)', 'p_actor_id uuid', 'f5eeb1874518bd5952f7e8a6f92c26ea', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_get_expense_source_v3(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '9fdcb060bd933599b8f04fe42da27874', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'e6dc71178a96bb4f398d61b44b39c57a', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)', 'p_actor_id uuid, p_expense_id uuid', 'e154667946fb4756b433d6e632dc0575', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text', 'ed635a847824d8c5669af82c93c3c57d', 'plpgsql', 'v', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_expected_publication_is_live boolean, p_expected_event_id uuid, p_expected_event_roster_revision bigint, p_new_event_id uuid, p_new_event_roster_revision bigint', 'a1bba12665e8651121bac578d7e936d4', 'plpgsql', 'v', 'jsonb', ARRAY['search_path=""']::text[], true),
  ('public.expense_sql162_event_relation_tuple(jsonb)', 'p_payload jsonb', '0fa02c46d2b8b7c0c24506be5549743c', 'plpgsql', 'i', 'jsonb', ARRAY['search_path=""']::text[], false),
  ('public.expense_sql162_assert_event_context(uuid,uuid,bigint)', 'p_actor_id uuid, p_event_id uuid, p_expected_roster_revision bigint', 'c59811554d33da10a2a8a66040e484ac', 'plpgsql', 's', 'jsonb', ARRAY['search_path=""']::text[], false)
), installed_contract AS MATERIALIZED (
  SELECT pg_catalog.count(routine.oid) = 9
    AND COALESCE(pg_catalog.bool_and(
      routine.oid IS NOT NULL
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) = expected_installed.source_hash
      AND pg_catalog.pg_get_function_arguments(routine.oid) = expected_installed.exact_arguments
      AND pg_catalog.pg_get_function_result(routine.oid) = expected_installed.return_type
      AND language_row.lanname = expected_installed.language_name
      AND routine.provolatile::text = expected_installed.volatility
      AND NOT routine.proretset AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND routine.prosecdef
      AND routine.proconfig::text[] = expected_installed.exact_config
      AND (SELECT pg_catalog.count(*) = CASE
             WHEN expected_installed.service_execute THEN 2 ELSE 1
           END
           FROM pg_catalog.aclexplode(COALESCE(
             routine.proacl, pg_catalog.acldefault('f', routine.proowner)
           )) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
           WHERE privilege.privilege_type = 'EXECUTE'
             AND privilege.grantor = routine.proowner
             AND NOT privilege.is_grantable
             AND (privilege.grantee = routine.proowner OR (
               expected_installed.service_execute
               AND grantee_role.rolname = 'service_role'
             )))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> routine.proowner
           OR privilege.is_grantable OR privilege.grantee = 0
           OR (privilege.grantee <> routine.proowner AND (
             NOT expected_installed.service_execute
             OR grantee_role.rolname IS DISTINCT FROM 'service_role'
           ))
      )
    ), false) AS installed_functions_exact
  FROM expected_installed
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected_installed.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), frozen_predecessors(
  signature, exact_arguments, source_hash, language_name, volatility,
  return_type, is_strict, expected_config, service_execute
) AS (VALUES
  ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_split_confirmed boolean', '14ac1abc9046fea4812ac652a9b96088', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], true),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4332f4ccfd5e58f2e17ebe9389c13311', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], true),
  ('public.expense_active_member_role(uuid,uuid)', 'p_actor_id uuid, p_group_id uuid', 'b25f994a64dde4a3f94ec8bad8535b17', 'sql', 's', 'text', false, ARRAY['search_path=""']::text[], false),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid', 'aeb9b8246978d630fb69db9365a22f34', 'plpgsql', 'v', 'void', false, ARRAY['search_path=pg_catalog, public']::text[], false),
  ('public.expense_begin_request(uuid,uuid,text,text)', 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text', 'd8631d60cc2f0df56dd9e958537db2a7', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
  ('public.expense_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', '194c5812642b4aaaafe888bc0ba5aa29', 'plpgsql', 'v', 'void', false, ARRAY['search_path=""']::text[], false),
  ('public.expense_identity_request_id(text,uuid)', 'p_scope text, p_request_id uuid', '496d1e1dd94d149cf607198c9271a25d', 'sql', 'i', 'uuid', true, ARRAY['search_path=""']::text[], false),
  ('public.expense_sql159_event_scope_read_only(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4ba9308ba12eef6405ed24916bc0bb74', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], false),
  ('public.expense_sql159_event_scope_allows(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '0be29be5cda2d34bf41dc2f67e0afa2e', 'plpgsql', 's', 'boolean', false, ARRAY['search_path=""']::text[], false),
  ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean', '18a6e628bdb1d3c175b515541ab56787', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
  ('public.teskeid_event_assert_financial_actor(uuid)', 'p_actor_id uuid', '7f6ced4f5e7472aff27d9a6d5c624355', 'plpgsql', 's', 'void', false, ARRAY['search_path=""']::text[], false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean', '4e70b62a5fa28cfe2b884d703935a16c', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', 'eaa006157dc5377e0ae1f8979651f8aa', 'plpgsql', 'v', 'void', false, ARRAY['search_path=""']::text[], false),
  ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', 'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer', '25394edc6b084676921c3a65b1f19a8a', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], false),
  ('public.teskeid_event_private_normalize_shared_name_v2(text)', 'p_value text', 'd118ab08bc0346cdf31519344a2f65a7', 'sql', 'i', 'text', false, ARRAY['search_path=""']::text[], false)
), frozen_contract AS MATERIALIZED (
  SELECT pg_catalog.count(routine.oid) = 15
    AND COALESCE(pg_catalog.bool_and(
      routine.oid IS NOT NULL
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) = frozen_predecessors.source_hash
      AND pg_catalog.pg_get_function_arguments(routine.oid) = frozen_predecessors.exact_arguments
      AND pg_catalog.pg_get_function_result(routine.oid) = frozen_predecessors.return_type
      AND language_row.lanname = frozen_predecessors.language_name
      AND routine.provolatile::text = frozen_predecessors.volatility
      AND routine.proisstrict = frozen_predecessors.is_strict
      AND NOT routine.proretset AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND routine.prosecdef
      AND routine.proconfig::text[] = frozen_predecessors.expected_config
      AND (SELECT pg_catalog.count(*) = CASE
             WHEN frozen_predecessors.service_execute THEN 2 ELSE 1
           END
           FROM pg_catalog.aclexplode(COALESCE(
             routine.proacl, pg_catalog.acldefault('f', routine.proowner)
           )) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
           WHERE privilege.privilege_type = 'EXECUTE'
             AND privilege.grantor = routine.proowner
             AND NOT privilege.is_grantable
             AND (privilege.grantee = routine.proowner OR (
               frozen_predecessors.service_execute
               AND grantee_role.rolname = 'service_role'
             )))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> routine.proowner
           OR privilege.is_grantable OR privilege.grantee = 0
           OR (privilege.grantee <> routine.proowner AND (
             NOT frozen_predecessors.service_execute
             OR grantee_role.rolname IS DISTINCT FROM 'service_role'
           ))
      )
    ), false) AS frozen_predecessors_exact
  FROM frozen_predecessors
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(frozen_predecessors.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), replacement_predecessors(
  signature, exact_arguments, source_hash, volatility
) AS (VALUES
  ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text', '279be97e3295b9d2ae6f2457bf106d6a', 'v'),
  ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)', 'p_actor_id uuid, p_expense_id uuid', '7ab39825d58918dfc99ebb01b53128ec', 's'),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'aec7d0cf817826697338e74de645dc4e', 's')
), replacement_predecessor_contract AS MATERIALIZED (
  SELECT pg_catalog.count(routine.oid) = 3
    AND COALESCE(pg_catalog.bool_and(
      routine.oid IS NOT NULL
      AND pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      )) = replacement_predecessors.source_hash
      AND pg_catalog.pg_get_function_arguments(routine.oid)
        = replacement_predecessors.exact_arguments
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND language_row.lanname = 'plpgsql'
      AND routine.provolatile::text = replacement_predecessors.volatility
      AND NOT routine.proretset AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL AND NOT routine.proisstrict
      AND routine.prosecdef AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.proconfig::text[] = ARRAY['search_path=""']::text[]
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND (SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = routine.proowner
          AND NOT privilege.is_grantable
          AND (privilege.grantee = routine.proowner
            OR grantee_role.rolname = 'service_role'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> routine.proowner
           OR privilege.is_grantable OR privilege.grantee = 0
           OR (privilege.grantee <> routine.proowner
             AND grantee_role.rolname IS DISTINCT FROM 'service_role')
      )
    ), false) AS replacement_predecessors_exact
  FROM replacement_predecessors
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(
      replacement_predecessors.signature
    )
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), save_contract AS MATERIALIZED (
  SELECT
    COALESCE(pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) = 'aa7eb65be2210108d99736fa2f7d8b37'
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND routine.provolatile = 'v' AND routine.pronargdefaults = 1
      AND routine.proconfig::text[] = ARRAY['search_path=pg_catalog, public']::text[], false)
      AS predecessor_save_shape_exact,
    COALESCE(pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) = '59f7c91049839431bf068d58f8462673'
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND routine.provolatile = 'v' AND routine.pronargdefaults = 1
      AND routine.proconfig::text[] = ARRAY['search_path=pg_catalog, public']::text[], false)
      AS installed_save_shape_exact,
    COALESCE((SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantor = routine.proowner
        AND NOT privilege.is_grantable
        AND (privilege.grantee = routine.proowner
          OR grantee_role.rolname = 'service_role'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> routine.proowner
           OR privilege.is_grantable OR privilege.grantee = 0
           OR (privilege.grantee <> routine.proowner
             AND grantee_role.rolname IS DISTINCT FROM 'service_role')
      ), false) AS save_acl_exact
  FROM (VALUES (1)) AS singleton(marker)
  LEFT JOIN pg_catalog.pg_proc AS routine ON routine.oid = pg_catalog.to_regprocedure(
    'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
  )
), old_graph AS MATERIALIZED (
  SELECT membership.event_id, membership.user_id,
    membership.event_guest_id
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_events AS event_row
    ON event_row.id = membership.event_id
   AND event_row.owner_user_id <> membership.user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = membership.event_id
   AND guest.id = membership.event_guest_id
   AND guest.status = 'active'
   AND guest.linked_user_id = membership.user_id
), current_graph AS MATERIALIZED (
  SELECT participation.event_id,
    participation.recipient_user_id AS user_id,
    participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
   AND event_row.owner_user_id <> participation.recipient_user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
   AND decision.identity_generation = participation.identity_generation
   AND decision.decision_version = participation.rsvp_version
  WHERE participation.recipient_user_id IS NOT NULL
    AND participation.access_state = 'active'
), malformed_current AS MATERIALIZED (
  SELECT participation.event_id, participation.recipient_user_id,
    participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
   AND event_row.owner_user_id <> participation.recipient_user_id
  LEFT JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
   AND decision.identity_generation = participation.identity_generation
   AND decision.decision_version = participation.rsvp_version
  WHERE participation.recipient_user_id IS NOT NULL
    AND participation.access_state = 'active'
    AND (guest.id IS NULL OR decision.event_guest_id IS NULL)
), duplicate_current AS MATERIALIZED (
  SELECT current_row.event_id, current_row.user_id
  FROM current_graph AS current_row
  GROUP BY current_row.event_id, current_row.user_id
  HAVING pg_catalog.count(*) <> 1
), graph_evidence AS MATERIALIZED (
  SELECT
    (SELECT pg_catalog.count(*) FROM old_graph) AS old_graph_count,
    (SELECT pg_catalog.count(*) FROM current_graph) AS current_graph_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      old_row.event_id::text || '|' || old_row.user_id::text || '|' ||
        old_row.event_guest_id::text,
      E'\n' ORDER BY old_row.event_id, old_row.user_id,
        old_row.event_guest_id
    ), '')) FROM old_graph AS old_row) AS old_graph_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      current_row.event_id::text || '|' || current_row.user_id::text || '|' ||
        current_row.event_guest_id::text,
      E'\n' ORDER BY current_row.event_id, current_row.user_id,
        current_row.event_guest_id
    ), '')) FROM current_graph AS current_row) AS current_graph_digest,
    (SELECT pg_catalog.count(*) FROM (
      SELECT * FROM old_graph EXCEPT SELECT * FROM current_graph
    ) AS old_only) AS old_minus_current_count,
    (SELECT pg_catalog.count(*) FROM (
      SELECT * FROM current_graph EXCEPT SELECT * FROM old_graph
    ) AS current_only) AS current_minus_old_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      pg_catalog.md5(
        current_only.event_id::text || '|' || current_only.user_id::text ||
          '|' || current_only.event_guest_id::text
      ), E'\n' ORDER BY current_only.event_id, current_only.user_id,
        current_only.event_guest_id
    ), '')) FROM (
      SELECT * FROM current_graph EXCEPT SELECT * FROM old_graph
    ) AS current_only) AS current_minus_old_digest,
    (SELECT pg_catalog.count(*) FROM malformed_current)
      AS malformed_current_count,
    (SELECT pg_catalog.count(*) FROM duplicate_current)
      AS duplicate_current_identity_count,
    (SELECT pg_catalog.count(*)
     FROM current_graph AS current_row
     JOIN public.teskeid_events AS event_row
       ON event_row.id = current_row.event_id
      AND event_row.owner_user_id = current_row.user_id)
      AS owner_attendee_overlap_count
), target_state AS MATERIALIZED (
  SELECT
    pg_catalog.to_regprocedure(
      'public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)'
    ) AS attachable,
    pg_catalog.to_regprocedure(
      'public.teskeid_event_list_expense_contexts_v1(uuid)'
    ) AS contexts,
    pg_catalog.to_regprocedure(
      'public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)'
    ) AS relation_mutation,
    pg_catalog.to_regprocedure(
      'public.expense_sql162_event_relation_tuple(jsonb)'
    ) AS tuple_helper,
    pg_catalog.to_regprocedure(
      'public.expense_sql162_assert_event_context(uuid,uuid,bigint)'
    ) AS context_helper,
    pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_source_v3(uuid,uuid)'
    ) AS exact_source
), protected AS MATERIALIZED (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.expense_private_drafts)
      AS draft_count,
    (SELECT pg_catalog.count(*) FROM public.expense_unconfirmed_publications)
      AS publication_count,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_expense_links)
      AS link_count,
    (SELECT pg_catalog.count(*) FROM public.expenses) AS expense_count,
    (SELECT pg_catalog.count(*) FROM public.expense_unconfirmed_publication_parties)
      AS party_count,
    (SELECT pg_catalog.count(*) FROM public.expense_unconfirmed_publication_audience)
      AS audience_count,
    (SELECT pg_catalog.count(*) FROM public.expense_mutation_requests)
      AS expense_request_count,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_mutation_requests)
      AS event_request_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      draft.id::text || '|' || draft.actor_user_id::text || '|' ||
        draft.version::text,
      E'\n' ORDER BY draft.id
    ), '')) FROM public.expense_private_drafts AS draft) AS draft_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      publication.draft_id::text || '|' || publication.publication_id::text ||
        '|' || publication.publication_version::text || '|' ||
        publication.is_live::text,
      E'\n' ORDER BY publication.draft_id
    ), '')) FROM public.expense_unconfirmed_publications AS publication)
      AS publication_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      link.expense_id::text || '|' || link.event_id::text || '|' ||
        link.link_revision::text,
      E'\n' ORDER BY link.expense_id
    ), '')) FROM public.teskeid_event_expense_links AS link) AS link_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      party.draft_id::text || '|' || party.ordinal::text || '|' ||
        party.party_key_hash,
      E'\n' ORDER BY party.draft_id, party.ordinal
    ), '')) FROM public.expense_unconfirmed_publication_parties AS party)
      AS party_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      audience.draft_id::text || '|' || audience.user_id::text || '|' ||
        audience.audience_kind,
      E'\n' ORDER BY audience.draft_id, audience.user_id
    ), '')) FROM public.expense_unconfirmed_publication_audience AS audience)
      AS audience_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      request.actor_user_id::text || '|' || request.request_id::text || '|' ||
        request.operation || '|' || request.fingerprint,
      E'\n' ORDER BY request.actor_user_id, request.request_id
    ), '')) FROM public.expense_mutation_requests AS request)
      AS expense_request_digest,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      request.actor_user_id::text || '|' || request.request_id::text || '|' ||
        request.operation || '|' || request.fingerprint,
      E'\n' ORDER BY request.actor_user_id, request.request_id
    ), '')) FROM public.teskeid_event_mutation_requests AS request)
      AS event_request_digest
), protected_names(relation_name) AS (VALUES
  ('expense_private_drafts'),
  ('expense_unconfirmed_publications'),
  ('expense_unconfirmed_publication_parties'),
  ('expense_unconfirmed_publication_audience'),
  ('expense_groups'),
  ('expense_group_members'),
  ('expenses'),
  ('expense_payments'),
  ('expense_shares'),
  ('expense_obligations'),
  ('expense_repayments'),
  ('expense_repayment_allocations'),
  ('expense_unconfirmed_finalizations'),
  ('expense_private_draft_tombstones'),
  ('teskeid_event_expense_links'),
  ('expense_mutation_requests'),
  ('teskeid_event_mutation_requests')
), protected_rows AS MATERIALIZED (
  SELECT 'expense_private_drafts'::text AS relation_name,
    pg_catalog.md5(pg_catalog.to_jsonb(draft_row)::text) AS row_digest
  FROM public.expense_private_drafts AS draft_row
  UNION ALL SELECT 'expense_unconfirmed_publications',
    pg_catalog.md5(pg_catalog.to_jsonb(publication_row)::text)
  FROM public.expense_unconfirmed_publications AS publication_row
  UNION ALL SELECT 'expense_unconfirmed_publication_parties',
    pg_catalog.md5(pg_catalog.to_jsonb(party_row)::text)
  FROM public.expense_unconfirmed_publication_parties AS party_row
  UNION ALL SELECT 'expense_unconfirmed_publication_audience',
    pg_catalog.md5(pg_catalog.to_jsonb(audience_row)::text)
  FROM public.expense_unconfirmed_publication_audience AS audience_row
  UNION ALL SELECT 'expense_groups',
    pg_catalog.md5(pg_catalog.to_jsonb(group_row)::text)
  FROM public.expense_groups AS group_row
  UNION ALL SELECT 'expense_group_members',
    pg_catalog.md5(pg_catalog.to_jsonb(group_member_row)::text)
  FROM public.expense_group_members AS group_member_row
  UNION ALL SELECT 'expenses',
    pg_catalog.md5(pg_catalog.to_jsonb(expense_row)::text)
  FROM public.expenses AS expense_row
  UNION ALL SELECT 'expense_payments',
    pg_catalog.md5(pg_catalog.to_jsonb(payment_row)::text)
  FROM public.expense_payments AS payment_row
  UNION ALL SELECT 'expense_shares',
    pg_catalog.md5(pg_catalog.to_jsonb(share_row)::text)
  FROM public.expense_shares AS share_row
  UNION ALL SELECT 'expense_obligations',
    pg_catalog.md5(pg_catalog.to_jsonb(obligation_row)::text)
  FROM public.expense_obligations AS obligation_row
  UNION ALL SELECT 'expense_repayments',
    pg_catalog.md5(pg_catalog.to_jsonb(repayment_row)::text)
  FROM public.expense_repayments AS repayment_row
  UNION ALL SELECT 'expense_repayment_allocations',
    pg_catalog.md5(pg_catalog.to_jsonb(allocation_row)::text)
  FROM public.expense_repayment_allocations AS allocation_row
  UNION ALL SELECT 'expense_unconfirmed_finalizations',
    pg_catalog.md5(pg_catalog.to_jsonb(finalization_row)::text)
  FROM public.expense_unconfirmed_finalizations AS finalization_row
  UNION ALL SELECT 'expense_private_draft_tombstones',
    pg_catalog.md5(pg_catalog.to_jsonb(tombstone_row)::text)
  FROM public.expense_private_draft_tombstones AS tombstone_row
  UNION ALL SELECT 'teskeid_event_expense_links',
    pg_catalog.md5(pg_catalog.to_jsonb(link_row)::text)
  FROM public.teskeid_event_expense_links AS link_row
  UNION ALL SELECT 'expense_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(expense_request_row)::text)
  FROM public.expense_mutation_requests AS expense_request_row
  UNION ALL SELECT 'teskeid_event_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(event_request_row)::text)
  FROM public.teskeid_event_mutation_requests AS event_request_row
), protected_relation_evidence AS MATERIALIZED (
  SELECT protected_names.relation_name,
    pg_catalog.count(protected_rows.row_digest) AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      protected_rows.row_digest, E'\n'
      ORDER BY protected_rows.row_digest COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM protected_names
  LEFT JOIN protected_rows USING (relation_name)
  GROUP BY protected_names.relation_name
), protected_complete AS MATERIALIZED (
  SELECT pg_catalog.jsonb_object_agg(
      relation_name,
      pg_catalog.jsonb_build_object('count', row_count, 'digest', row_digest)
      ORDER BY relation_name COLLATE pg_catalog."C"
    ) AS protected_relation_evidence,
    pg_catalog.md5(pg_catalog.string_agg(
      relation_name || '|' || row_count::text || '|' || row_digest,
      E'\n' ORDER BY relation_name COLLATE pg_catalog."C"
    )) AS protected_baseline_token
  FROM protected_relation_evidence
), attest AS MATERIALIZED (
  SELECT
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    pg_catalog.current_setting('server_version_num')::integer >= 150000
      AS server_version_ok,
    pg_catalog.to_regprocedure(
      'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_sql159_event_scope_read_only(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_sql159_event_scope_allows(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)'
      ) IS NOT NULL AS predecessors_exist,
    target_state.attachable IS NULL
      AND target_state.contexts IS NULL
      AND target_state.relation_mutation IS NULL
      AND target_state.tuple_helper IS NULL
      AND target_state.context_helper IS NULL
      AND target_state.exact_source IS NULL AS targets_absent,
    target_state.attachable IS NOT NULL
      AND target_state.contexts IS NOT NULL
      AND target_state.relation_mutation IS NOT NULL
      AND target_state.tuple_helper IS NOT NULL
      AND target_state.context_helper IS NOT NULL
      AND target_state.exact_source IS NOT NULL
      AND installed_contract.installed_functions_exact
      AND save_contract.installed_save_shape_exact
      AND save_contract.save_acl_exact AS exact_installed,
    graph_evidence.old_minus_current_count = 0
      AS legacy_subset_current,
    graph_evidence.malformed_current_count = 0
      AND graph_evidence.duplicate_current_identity_count = 0
      AND graph_evidence.owner_attendee_overlap_count = 0
      AS current_graph_integrity_exact,
    graph_evidence.old_minus_current_count = 0
      AND graph_evidence.malformed_current_count = 0
      AND graph_evidence.duplicate_current_identity_count = 0
      AND graph_evidence.owner_attendee_overlap_count = 0
      AS attendance_authority_compatible
  FROM graph_evidence CROSS JOIN target_state CROSS JOIN installed_contract
    CROSS JOIN frozen_contract CROSS JOIN save_contract
    CROSS JOIN replacement_predecessor_contract
    CROSS JOIN role_contract
)
SELECT attest.executor_ok, attest.server_version_ok, role_contract.roles_exact,
  relation_security_contract.relation_security_exact,
  relation_security_contract.relation_security_count,
  relation_security_contract.relation_security_evidence,
  frozen_contract.frozen_predecessors_exact,
  save_contract.predecessor_save_shape_exact
    AND save_contract.save_acl_exact AS predecessor_save_exact,
  save_contract.installed_save_shape_exact
    AND save_contract.save_acl_exact AS installed_save_exact,
  save_contract.save_acl_exact,
  frozen_contract.frozen_predecessors_exact AS direct_dependencies_exact,
  attest.predecessors_exist, attest.targets_absent,
  attest.exact_installed,
  graph_evidence.old_graph_count, graph_evidence.current_graph_count,
  graph_evidence.old_graph_digest, graph_evidence.current_graph_digest,
  graph_evidence.old_minus_current_count,
  graph_evidence.current_minus_old_count,
  graph_evidence.current_minus_old_digest,
  graph_evidence.malformed_current_count,
  graph_evidence.duplicate_current_identity_count,
  graph_evidence.owner_attendee_overlap_count,
  attest.legacy_subset_current,
  attest.current_graph_integrity_exact,
  attest.attendance_authority_compatible,
  replacement_predecessor_contract.replacement_predecessors_exact,
  protected.draft_count, protected.draft_digest,
  protected.publication_count, protected.publication_digest,
  protected.link_count, protected.link_digest, protected.expense_count,
  protected.party_count, protected.party_digest,
  protected.audience_count, protected.audience_digest,
  protected.expense_request_count, protected.expense_request_digest,
  protected.event_request_count, protected.event_request_digest,
  protected_complete.protected_relation_evidence,
  protected_complete.protected_baseline_token,
  attest.exact_installed AND attest.attendance_authority_compatible
    AND frozen_contract.frozen_predecessors_exact
    AND relation_security_contract.relation_security_exact
      AS lost_response_safe,
  (attest.targets_absent AND save_contract.predecessor_save_shape_exact
      AND save_contract.save_acl_exact
      AND replacement_predecessor_contract.replacement_predecessors_exact
    OR attest.exact_installed)
    AND relation_security_contract.relation_security_exact
      AS operator_state_ok,
  attest.executor_ok AND attest.server_version_ok AND role_contract.roles_exact
    AND attest.predecessors_exist AND frozen_contract.frozen_predecessors_exact
    AND save_contract.predecessor_save_shape_exact
    AND save_contract.save_acl_exact
    AND replacement_predecessor_contract.replacement_predecessors_exact
    AND attest.targets_absent AND attest.attendance_authority_compatible
    AND relation_security_contract.relation_security_exact AS prerequisites_ok
FROM attest CROSS JOIN graph_evidence CROSS JOIN protected
  CROSS JOIN protected_complete
  CROSS JOIN role_contract CROSS JOIN frozen_contract CROSS JOIN save_contract
  CROSS JOIN replacement_predecessor_contract
  CROSS JOIN relation_security_contract;

COMMIT;
