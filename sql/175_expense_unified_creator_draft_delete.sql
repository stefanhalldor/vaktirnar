-- SQL175 MIGRATION: unified creator-owned creation-draft deletion and routing.
--
-- Installation is application-data-nondestructive. It adds service-role-only
-- functions and never calls the runtime delete mutation. Actual deletion can
-- happen only through an authenticated server action which calls the reviewed
-- mutation for one exact creator-owned non-edit draft after UI confirmation.

BEGIN;

DO $sql175_preflight$
DECLARE
  v_name text;
  v_signature text;
  v_existing oid;
  v_overload_count integer;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql175_executor_mismatch';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(159159) THEN
    RAISE EXCEPTION 'expense_sql175_sql159_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(168168) THEN
    RAISE EXCEPTION 'expense_sql175_sql168_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(173, 107) THEN
    RAISE EXCEPTION 'expense_sql175_sql173_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(175, 107) THEN
    RAISE EXCEPTION 'expense_sql175_lock_unavailable';
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expense_private_drafts') IS NULL
     OR pg_catalog.to_regclass('public.expense_private_draft_tombstones') IS NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties') IS NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience') IS NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_finalizations') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_mutation_requests') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_identity_request_id(text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_has_beta_access(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_session_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_finish_request(uuid,uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_amount_minor(text,text,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_probe_event_id(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_event_scope_read_only(uuid,uuid)') IS NULL
      OR pg_catalog.to_regprocedure('public.expense_sql159_event_scope_allows(uuid,uuid)') IS NULL
      OR pg_catalog.to_regprocedure('public.expense_sql159_guard_private_draft_delete()') IS NULL
      OR pg_catalog.to_regprocedure('public.expense_validate_finalization_expense_reference()') IS NULL
      OR pg_catalog.to_regprocedure('public.expense_sql159_snapshot_is_valid(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_private_event_summary(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_audience_allows(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_list_group_shared_drafts(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_get_shared_draft_detail(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_get_own_delete_capability(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipt_shape_known(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'expense_sql175_prerequisite_missing';
  END IF;

  IF pg_catalog.to_regrole('postgres') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL
     OR pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('expense_private_drafts', true),
         ('expense_private_draft_tombstones', true),
         ('expense_unconfirmed_publications', true),
         ('expense_unconfirmed_publication_parties', true),
         ('expense_unconfirmed_publication_audience', true),
         ('expense_unconfirmed_finalizations', true),
         ('expense_mutation_requests', false),
         ('teskeid_event_mutation_requests', true)
       ) AS expected(relation_name, force_rls)
       LEFT JOIN pg_catalog.pg_class AS relation
         ON relation.relnamespace = pg_catalog.to_regnamespace('public')
        AND relation.relname = expected.relation_name
        AND relation.relkind = 'r'
       WHERE relation.oid IS NULL
           OR NOT relation.relrowsecurity
           OR relation.relforcerowsecurity IS DISTINCT FROM expected.force_rls
          OR relation.relowner <>
            pg_catalog.to_regrole('postgres')::oid
     )
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('expense_private_drafts'),
         ('expense_private_draft_tombstones'),
         ('expense_unconfirmed_publications'),
         ('expense_unconfirmed_publication_parties'),
         ('expense_unconfirmed_publication_audience'),
         ('expense_unconfirmed_finalizations'),
         ('expense_mutation_requests'),
         ('teskeid_event_mutation_requests')
       ) AS expected(relation_name)
       CROSS JOIN (VALUES
         ('anon'), ('authenticated'), ('service_role')
       ) AS checked(role_name)
       WHERE pg_catalog.has_table_privilege(
         checked.role_name,
         'public.' || expected.relation_name,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       )
     )
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('expense_private_drafts'),
         ('expense_private_draft_tombstones'),
         ('expense_unconfirmed_publications'),
         ('expense_unconfirmed_publication_parties'),
         ('expense_unconfirmed_publication_audience'),
         ('expense_unconfirmed_finalizations'),
         ('expense_mutation_requests'),
         ('teskeid_event_mutation_requests')
       ) AS expected(relation_name)
       JOIN pg_catalog.pg_class AS relation
         ON relation.relnamespace = pg_catalog.to_regnamespace('public')
        AND relation.relname = expected.relation_name
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         relation.relacl,
         pg_catalog.acldefault('r', relation.relowner)
       )) AS privilege_row
       WHERE privilege_row.grantee <> relation.relowner
          OR privilege_row.grantor <> relation.relowner
          OR privilege_row.is_grantable
     ) THEN
    RAISE EXCEPTION 'expense_sql175_private_relation_acl_drift';
  END IF;

  IF EXISTS (
    WITH expected(
      signature, exact_arguments, result_type, language_name,
      volatility, security_definer, service_execute
    ) AS (VALUES
      ('public.expense_has_beta_access(uuid)', 'p_user_id uuid', 'boolean', 'sql', 's'::"char", true, false),
      ('public.expense_assert_beta_actor(uuid)', 'p_actor_id uuid', 'void', 'plpgsql', 's'::"char", true, false),
      ('public.expense_begin_request(uuid,uuid,text,text)', 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text', 'jsonb', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', 'void', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_identity_request_id(text,uuid)', 'p_scope text, p_request_id uuid', 'uuid', 'sql', 'i'::"char", true, false),
      ('public.teskeid_event_assert_session_actor(uuid)', 'p_actor_id uuid', 'void', 'plpgsql', 's'::"char", true, false),
      ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', 'void', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_sql159_amount_minor(text,text,boolean)', 'p_raw text, p_currency text, p_allow_zero boolean', 'bigint', 'plpgsql', 'i'::"char", false, false),
      ('public.expense_sql159_probe_event_id(uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid', 'uuid', 'plpgsql', 's'::"char", true, false),
      ('public.expense_sql159_event_scope_read_only(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'jsonb', 'plpgsql', 's'::"char", true, false),
      ('public.expense_sql159_event_scope_allows(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'boolean', 'plpgsql', 's'::"char", true, false),
      ('public.expense_sql159_audience_allows(uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid', 'boolean', 'sql', 's'::"char", true, false),
      ('public.expense_sql159_guard_private_draft_delete()', '', 'trigger', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_validate_finalization_expense_reference()', '', 'trigger', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_sql159_snapshot_is_valid(uuid)', 'p_draft_id uuid', 'boolean', 'sql', 's'::"char", true, false),
      ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid, p_event_id uuid', 'jsonb', 'plpgsql', 's'::"char", true, false),
      ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean', 'jsonb', 'plpgsql', 'v'::"char", true, false),
      ('public.expense_list_group_shared_drafts(uuid,uuid)', 'p_actor_id uuid, p_group_id uuid', 'jsonb', 'plpgsql', 'v'::"char", true, true),
      ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'jsonb', 'plpgsql', 'v'::"char", true, true),
      ('public.expense_get_shared_draft_detail(uuid,uuid)', 'p_actor_id uuid, p_publication_id uuid', 'jsonb', 'plpgsql', 'v'::"char", true, true),
      ('public.expense_get_own_delete_capability(uuid,uuid)', 'p_actor_id uuid, p_expense_id uuid', 'jsonb', 'plpgsql', 's'::"char", true, true),
      ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', 'p_actor_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_request_id uuid', 'jsonb', 'plpgsql', 'v'::"char", true, true),
      ('public.expense_hard_delete_receipt_shape_known(text,jsonb)', 'p_operation text, p_result jsonb', 'boolean', 'sql', 'i'::"char", true, false),
      ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', 'p_expense_id uuid, p_group_id uuid, p_one_off boolean, p_invitation_ids uuid[]', 'boolean', 'plpgsql', 's'::"char", true, false)
    ), observed AS (
      SELECT expected.*, routine.*, language_row.lanname,
        owner_role.rolname AS owner_name
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = routine.prolang
      LEFT JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = routine.proowner
    )
    SELECT 1
    FROM observed
    WHERE observed.oid IS NULL
       OR observed.prokind <> 'f'
       OR observed.proargmodes IS NOT NULL
       OR pg_catalog.pg_get_function_arguments(observed.oid)
            <> observed.exact_arguments
       OR pg_catalog.pg_get_function_result(observed.oid)
            <> observed.result_type
       OR observed.proretset
       OR observed.provolatile <> observed.volatility
       OR observed.prosecdef <> observed.security_definer
       OR observed.proisstrict <> (
         observed.signature =
           'public.expense_identity_request_id(text,uuid)'
       )
       OR observed.proleakproof
       OR observed.proparallel <> 'u'::"char"
       OR observed.pronargdefaults <> 0
       OR observed.proargdefaults IS NOT NULL
       OR observed.proallargtypes IS NOT NULL
       OR observed.provariadic <> 0::oid
       OR observed.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR observed.owner_name <> 'postgres'
       OR observed.lanname <> observed.language_name
       OR (SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_proc AS overload
           WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
             AND overload.proname = observed.proname) <> 1
       OR NOT COALESCE((
         SELECT pg_catalog.count(*) = CASE
              WHEN observed.service_execute THEN 2 ELSE 1 END
            AND COALESCE(pg_catalog.bool_and(
              privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
                AND privilege_row.privilege_type = 'EXECUTE'
                AND NOT privilege_row.is_grantable
                AND (
                  privilege_row.grantee = pg_catalog.to_regrole('postgres')::oid
                  OR (observed.service_execute
                    AND privilege_row.grantee =
                      pg_catalog.to_regrole('service_role')::oid)
                )
            ), false)
            AND pg_catalog.has_function_privilege(
              'service_role', observed.oid, 'EXECUTE'
            ) = observed.service_execute
            AND NOT pg_catalog.has_function_privilege(
              'anon', observed.oid, 'EXECUTE'
            )
            AND NOT pg_catalog.has_function_privilege(
              'authenticated', observed.oid, 'EXECUTE'
            )
         FROM pg_catalog.aclexplode(COALESCE(
           observed.proacl,
           pg_catalog.acldefault('f', observed.proowner)
         )) AS privilege_row
       ), false)
  ) THEN
    RAISE EXCEPTION 'expense_sql175_predecessor_contract_drift';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name, constraint_name, constraint_type, definition_hash
    ) AS (VALUES
      ('expense_private_drafts','expense_private_drafts_pkey','p','90276e02fff47d56621d4ea4039fa4fd'),
      ('expense_private_drafts','expense_private_drafts_actor_user_id_fkey','f','6131c774862c10a823af7ba6b1192b8d'),
      ('expense_private_drafts','expense_private_drafts_group_id_fkey','f','35f71f87f4c6935a3b2c242f762c042c'),
      ('expense_private_drafts','expense_private_drafts_expense_id_fkey','f','5212c48bec242b83ad76218474d90cfb'),
      ('expense_private_drafts','expense_private_drafts_context_check','c','298cff15b5e4555d2b172d6e7cebca23'),
      ('expense_private_drafts','expense_private_drafts_step_check','c','9dd0e3a22f90f62e433db0dd8c536f5f'),
      ('expense_private_drafts','expense_private_drafts_payload_object_check','c','e4ddb50ca35a267137e5c21489f88d65'),
      ('expense_private_drafts','expense_private_drafts_payload_size_check','c','accea80cac564844298f0a0431844a64'),
      ('expense_private_drafts','expense_private_drafts_version_check','c','35567299fd50adc0542a878abdce8f10'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_publication_id_key','u','299874551546e95df22927e50a98350a'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_user_id_fkey','f','6131c774862c10a823af7ba6b1192b8d'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_version_check','c','06df78963f5b85fd5119e0b0f046b157'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_fingerprint_check','c','4f083a158631f785bc6a0d80da7a50b3'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_live_shape_check','c','feee2a41f0ffaae0b17c966d660c804b'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_draft_key','u','de010360de522ead901612079bd112cf'),
      ('expense_unconfirmed_publications','expense_unconfirmed_publications_state_key','u','24c66752643fdfdaf8333c17ebe8f1c2'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_pkey','p','ae43fa301373d86b446562e766acca67'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_publication_fk','f','b4817f9bc9ee70340911f3dc82ff216d'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_ordinal_check','c','29fcaccc806d7e7dae4130650fc9f1da'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_hash_check','c','bcbbd6c398d4dd152b167a0b8b82a13b'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_label_check','c','39da63c81460709caffeb3b1a9b4f159'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_role_check','c','c941a5a6597966b25666fc54a43a17ea'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_amount_check','c','9a5302a8cd82042e954105a8b84463e3'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_key_unique','u','0797e8937169ed322e56da55209e37c7'),
      ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_identity_unique','u','e81d903ad2a973cadd577542c9ba1c4b'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_draft_id_fkey','f','d9a73347b00b2e4ba22165b8afdf6b4e'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_pkey','p','6bb27bfdc4529fa0d9c8f148c49ec4b2'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_identity_unique','u','e81d903ad2a973cadd577542c9ba1c4b'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_party_fk','f','7a47b08171b7247c594ca55a565520a7'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_identity_check','c','fc2d8f9c7aa8ff5068025422891ef8b7'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_kind_check','c','14764ac5e0aa930916e3b0e6817ccea2'),
      ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_binding_check','c','8257d6a11ecd11d48ea373a0f1d2b25a'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_request_unique','u','aba99b1d3b6e40fb0fb7e0449b044d43'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_unique','u','320a55b0bde8f2082187edbb93c238b3'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_contract_check','c','cc4075fa603396888e3fe646825a14fd'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_version_check','c','0c5bb09cd99c5ea49bef7de08471b9a8'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_publication_shape_check','c','30f36a0ab41468ec7ffc388ea3a33c09'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_fingerprint_check','c','f06dbe92905760569b3aa59b160b63fb'),
      ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_invitation_check','c','e4589f0560cdca40d4e8b6588776f520'),
      ('expense_private_draft_tombstones','expense_private_draft_tombstones_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
      ('expense_mutation_requests','expense_mutation_requests_pkey','p','35ca4084e928106e54024474e8a6e200'),
      ('expense_mutation_requests','expense_mutation_requests_actor_user_id_fkey','f','6131c774862c10a823af7ba6b1192b8d'),
      ('expense_mutation_requests','expense_mutation_requests_operation_check','c','6d2babc66bba1c40f338d85f864d2a36'),
      ('expense_mutation_requests','expense_mutation_requests_fingerprint_check','c','db81247a30fe80e62823c7ae4ceccec2'),
      ('expense_mutation_requests','expense_mutation_requests_result_check','c','be791716d443b6c9f0227171c38f4038'),
      ('teskeid_event_mutation_requests','teskeid_event_mutation_requests_pkey','p','35ca4084e928106e54024474e8a6e200'),
      ('teskeid_event_mutation_requests','teskeid_event_mutation_requests_actor_fk','f','6131c774862c10a823af7ba6b1192b8d'),
      ('teskeid_event_mutation_requests','teskeid_event_mutation_requests_operation_check','c','6d2babc66bba1c40f338d85f864d2a36'),
      ('teskeid_event_mutation_requests','teskeid_event_mutation_requests_fingerprint_check','c','db81247a30fe80e62823c7ae4ceccec2'),
      ('teskeid_event_mutation_requests','teskeid_event_mutation_requests_result_check','c','948769d97541a5d3057a005960fa0868')
    ), observed AS (
      SELECT expected.*, constraint_row.oid,
        constraint_row.contype::text AS actual_type,
        constraint_row.convalidated, constraint_row.condeferrable,
        constraint_row.condeferred, constraint_row.connoinherit,
        pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
          pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            pg_catalog.pg_get_constraintdef(constraint_row.oid),
            '::[a-z0-9_.]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'),
          'public.', ''
        ))) AS actual_definition_hash
      FROM expected
      LEFT JOIN pg_catalog.pg_constraint AS constraint_row
        ON constraint_row.conrelid = pg_catalog.to_regclass(
          'public.' || expected.relation_name
        )
       AND constraint_row.conname = expected.constraint_name
    )
    SELECT 1 FROM observed
    WHERE observed.oid IS NULL
       OR observed.actual_type <> observed.constraint_type
       OR NOT observed.convalidated
       OR observed.condeferrable
       OR observed.condeferred
       OR observed.connoinherit <> (
         observed.constraint_type IN ('p', 'u', 'f')
       )
       OR observed.actual_definition_hash <> observed.definition_hash
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid = ANY(ARRAY[
      pg_catalog.to_regclass('public.expense_private_drafts'),
      pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
      pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
      pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
      pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
      pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
      pg_catalog.to_regclass('public.expense_mutation_requests'),
      pg_catalog.to_regclass('public.teskeid_event_mutation_requests')
    ]::oid[])
      AND actual.contype IN ('c','f','p','u','x')
  ) <> 52 OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS obsolete_constraint
    WHERE obsolete_constraint.conrelid =
      'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
      AND obsolete_constraint.conname =
        'expense_unconfirmed_finalizations_expense_fk'
  ) THEN
    RAISE EXCEPTION 'expense_sql175_relation_constraint_drift';
  END IF;

  -- SQL174 and the confirmed-Expense SQL173 contract are immutable
  -- predecessors. SQL175 deliberately adds a disjoint creation-draft path.
  IF (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_has_beta_access(uuid)'::pg_catalog.regprocedure)
        <> 'ebe4628dbda84e79b395c9da0ae39899'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_assert_beta_actor(uuid)'::pg_catalog.regprocedure)
        <> 'ea6c329f5c13bd7d0bfbd9df41e5931d'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_begin_request(uuid,uuid,text,text)'::pg_catalog.regprocedure)
        <> 'd8631d60cc2f0df56dd9e958537db2a7'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_finish_request(uuid,uuid,jsonb)'::pg_catalog.regprocedure)
        <> '194c5812642b4aaaafe888bc0ba5aa29'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_identity_request_id(text,uuid)'::pg_catalog.regprocedure)
        <> '496d1e1dd94d149cf607198c9271a25d'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_assert_session_actor(uuid)'::pg_catalog.regprocedure)
        <> '30238c0def94d573fd8265fd94da0757'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_finish_request(uuid,uuid,jsonb)'::pg_catalog.regprocedure)
        <> 'eaa006157dc5377e0ae1f8979651f8aa'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_amount_minor(text,text,boolean)'::pg_catalog.regprocedure)
        <> '5a4124296ff7e6f19d42342815be8109'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_probe_event_id(uuid,uuid)'::pg_catalog.regprocedure)
        <> '7600bd78711a0296ef545e0595c788b1'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_event_scope_read_only(uuid,uuid)'::pg_catalog.regprocedure)
        <> '4ba9308ba12eef6405ed24916bc0bb74'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_event_scope_allows(uuid,uuid)'::pg_catalog.regprocedure)
        <> '0be29be5cda2d34bf41dc2f67e0afa2e'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_audience_allows(uuid,uuid)'::pg_catalog.regprocedure)
        <> '9c4af07a07906c4dac6f06da94b42b37'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_snapshot_is_valid(uuid)'::pg_catalog.regprocedure)
        <> 'af4b9f8a5f0b422956fc1d664021baff'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_private_event_summary(uuid,uuid,uuid)'::pg_catalog.regprocedure)
        <> 'e75a609fc4f231b0cfda3d5fb2679d9b'
      OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = 'public.expense_sql159_guard_private_draft_delete()'::pg_catalog.regprocedure)
        <> 'cd349b0ef1810c51deb229ae64eade33'
      OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = 'public.expense_validate_finalization_expense_reference()'::pg_catalog.regprocedure)
        <> '3124b6233c3045627463f49487a49c59'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'::pg_catalog.regprocedure)
        <> '9d703deec837fbffed4add9cf8b97b56'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_get_own_delete_capability(uuid,uuid)'::pg_catalog.regprocedure)
        <> 'ffbd530e2f759d85809a34045ac15a1e'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)'::pg_catalog.regprocedure)
        <> '41bc44fc718a17fc4fc8c0777e0a0a67'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipt_shape_known(text,jsonb)'::pg_catalog.regprocedure)
        <> 'edb8a21d01ffdbbb8e9aa2b94c7c2594'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'::pg_catalog.regprocedure)
        <> '9def695d70fc38b63011cb2bd12e2e67'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_list_group_shared_drafts(uuid,uuid)'::pg_catalog.regprocedure)
        <> '0a06c9d47c9c17dad77c715fbef50d55'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)'::pg_catalog.regprocedure)
        <> '4332f4ccfd5e58f2e17ebe9389c13311'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_get_shared_draft_detail(uuid,uuid)'::pg_catalog.regprocedure)
        <> '51a607ab9bc5e5ad5a19f4b9d96aa00b' THEN
    RAISE EXCEPTION 'expense_sql175_predecessor_source_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.expense_private_drafts'::pg_catalog.regclass
      AND trigger_row.tgname = 'expense_sql159_private_draft_delete_guard'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgtype = 11
      AND trigger_row.tgfoid = 'public.expense_sql159_guard_private_draft_delete()'::pg_catalog.regprocedure
      AND trigger_row.tgconstraint = 0
      AND trigger_row.tgnargs = 0
      AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_triggerdef(trigger_row.oid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createtriggerexpense_sql159_private_draft_delete_guardbeforedeleteonexpense_private_draftsforeachrowexecutefunctionexpense_sql159_guard_private_draft_delete'
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS delete_trigger
    WHERE delete_trigger.tgrelid =
      'public.expense_private_drafts'::pg_catalog.regclass
      AND NOT delete_trigger.tgisinternal
      AND (delete_trigger.tgtype::integer & 8) = 8
  ) <> 1 THEN
    RAISE EXCEPTION 'expense_sql175_delete_trigger_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
        'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
      AND trigger_row.tgname =
        'expense_unconfirmed_finalizations_expense_reference_guard'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgtype = 23
      AND trigger_row.tgfoid =
        'public.expense_validate_finalization_expense_reference()'::pg_catalog.regprocedure
      AND trigger_row.tgconstraint = 0
      AND NOT trigger_row.tgdeferrable
      AND NOT trigger_row.tginitdeferred
      AND trigger_row.tgnargs = 0
      AND pg_catalog.octet_length(trigger_row.tgargs) = 0
      AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 2
      AND (
        SELECT pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attname)
        FROM pg_catalog.unnest(trigger_row.tgattr::smallint[])
          AS trigger_attribute(attnum)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = trigger_row.tgrelid
         AND attribute.attnum = trigger_attribute.attnum
      ) = ARRAY['expense_id','group_id']::text[]
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
  ) THEN
    RAISE EXCEPTION 'expense_sql175_sql173_finalization_guard_drift';
  END IF;

  FOR v_name, v_signature IN
    SELECT * FROM (VALUES
      ('expense_sql175_private_group_summary', 'public.expense_sql175_private_group_summary(uuid,uuid,uuid)'),
      ('expense_sql175_begin_event_delete_request', 'public.expense_sql175_begin_event_delete_request(uuid,uuid,text)'),
      ('expense_get_own_creation_draft_delete_capability_v1', 'public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)'),
      ('expense_delete_own_creation_draft_v1', 'public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)'),
      ('expense_list_group_creation_drafts_v1', 'public.expense_list_group_creation_drafts_v1(uuid,uuid)'),
      ('teskeid_event_get_expense_pre_active_v2', 'public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)'),
      ('expense_get_shared_draft_management_target_v1', 'public.expense_get_shared_draft_management_target_v1(uuid,uuid)')
    ) AS expected(name, signature)
  LOOP
    SELECT pg_catalog.count(*)::integer INTO v_overload_count
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
      AND routine.proname = v_name;
    v_existing := pg_catalog.to_regprocedure(v_signature);
    IF v_overload_count NOT IN (0, 1)
       OR (v_overload_count = 1 AND v_existing IS NULL) THEN
      RAISE EXCEPTION 'expense_sql175_target_overload_drift:%', v_name;
    END IF;
    IF v_existing IS NOT NULL AND (
      SELECT pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = v_existing
    ) IS DISTINCT FROM (
      CASE v_name
        WHEN 'expense_sql175_private_group_summary'
          THEN '0f6cac7b817e25d7f61ebf8a923e69d2'
        WHEN 'expense_sql175_begin_event_delete_request'
          THEN 'ea3732c799f6737cb9dbbe7aebc02a36'
        WHEN 'expense_get_own_creation_draft_delete_capability_v1'
          THEN '26b15255fc401c05eb7808917698fe30'
        WHEN 'expense_delete_own_creation_draft_v1'
          THEN '4ba7b3a6be41204ec3807c63e37bdeb4'
        WHEN 'expense_list_group_creation_drafts_v1'
          THEN '578aecf4b838c85b9d70ad4748ea4f6e'
        WHEN 'teskeid_event_get_expense_pre_active_v2'
          THEN '65270072a4d257dcdb650cf1715b324f'
        WHEN 'expense_get_shared_draft_management_target_v1'
          THEN '6c5bc595cf9610550dfdd6b1741870c2'
      END
    ) THEN
      RAISE EXCEPTION 'expense_sql175_target_source_drift:%', v_name;
    END IF;
  END LOOP;
END;
$sql175_preflight$;

-- Tolerant author-only summary for a private reusable-group draft. Partial
-- form input remains nullable and no payload or person data leaves this helper.
CREATE OR REPLACE FUNCTION public.expense_sql175_private_group_summary(
  p_actor_id uuid,
  p_draft_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_title text;
  v_currency text;
  v_total_minor bigint;
  v_incurred_on date;
BEGIN
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
    AND draft.context_type = 'group'
    AND draft.group_id = p_group_id
    AND draft.expense_id IS NULL;
  IF v_draft.id IS NULL
     OR v_draft.version NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.jsonb_typeof(v_draft.payload) <> 'object' THEN
    RAISE EXCEPTION 'expense_creation_draft_not_found';
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'title') = 'string'
     AND pg_catalog.char_length(pg_catalog.btrim(v_draft.payload->>'title'))
       BETWEEN 1 AND 200 THEN
    v_title := pg_catalog.btrim(v_draft.payload->>'title');
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'currency') = 'string'
     AND v_draft.payload->>'currency'
       IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK') THEN
    v_currency := v_draft.payload->>'currency';
  END IF;
  IF v_currency IS NOT NULL
     AND pg_catalog.jsonb_typeof(v_draft.payload->'total') = 'string' THEN
    BEGIN
      v_total_minor := public.expense_sql159_amount_minor(
        v_draft.payload->>'total', v_currency, false
      );
    EXCEPTION WHEN OTHERS THEN
      -- An incomplete autosave is still listable; malformed partial input is
      -- represented as a null summary value and never exposed verbatim.
      v_total_minor := NULL;
    END;
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'incurredOn') = 'string'
     AND v_draft.payload->>'incurredOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    BEGIN
      v_incurred_on := (v_draft.payload->>'incurredOn')::date;
      IF pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD')
         <> v_draft.payload->>'incurredOn' THEN
        v_incurred_on := NULL;
      END IF;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      v_incurred_on := NULL;
    END;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'draft_version', v_draft.version,
    'title', v_title,
    'total_minor', v_total_minor,
    'currency', v_currency,
    'incurred_on', CASE WHEN v_incurred_on IS NULL THEN NULL
      ELSE pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD') END,
    'allocation_state', 'incomplete'
  );
END;
$function$;

-- Event-side idempotency gate for deletion only. Unlike an Event content
-- mutation, deleting an actor's own draft does not require current Events
-- entitlement. It still takes the canonical expense -> Event actor locks and
-- retains a completed, PII-free Event receipt in the same transaction.
CREATE OR REPLACE FUNCTION public.expense_sql175_begin_event_delete_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing public.teskeid_event_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_fingerprint IS NULL
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_invalid_input';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  IF NOT EXISTS (
       SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
     ) OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_not_allowed';
  END IF;
  INSERT INTO public.teskeid_event_mutation_requests(
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id,
    'expense_sql175_delete_gate_v1', p_fingerprint
  )
  ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF FOUND THEN
    RETURN NULL;
  END IF;
  SELECT request_row.* INTO v_existing
  FROM public.teskeid_event_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
  FOR UPDATE;
  IF v_existing.operation <> 'expense_sql175_delete_gate_v1'
     OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_receipt_conflict';
  END IF;
  IF v_existing.result IS NULL THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_receipt_incomplete';
  END IF;
  RETURN v_existing.result;
END;
$function$;

-- New versioned group reader. SQL159's strict v1 response remains untouched,
-- so either app or SQL can roll out first without breaking an older parser.
CREATE OR REPLACE FUNCTION public.expense_list_group_creation_drafts_v1(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate record;
  v_shared record;
  v_private public.expense_private_drafts%ROWTYPE;
  v_summary jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF p_actor_id IS NULL OR p_group_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'none', 'rows', '[]'::jsonb
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF NOT EXISTS (
    SELECT 1
    FROM public.expense_groups AS group_row
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = group_row.id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE group_row.id = p_group_id
      AND group_row.status = 'active'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'none', 'rows', '[]'::jsonb
    );
  END IF;

  FOR v_candidate IN
    SELECT candidate.*
    FROM (
      SELECT 'shared'::text AS row_kind,
        publication.draft_id,
        publication.publication_id,
        publication.updated_at
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.is_live
        AND publication.context_type = 'group'
        AND publication.group_id = p_group_id
        AND public.expense_sql159_audience_allows(
          p_actor_id, publication.draft_id
        )
      UNION ALL
      SELECT 'private'::text AS row_kind,
        draft.id AS draft_id,
        NULL::uuid AS publication_id,
        draft.updated_at
      FROM public.expense_private_drafts AS draft
      WHERE draft.actor_user_id = p_actor_id
        AND draft.context_type = 'group'
        AND draft.group_id = p_group_id
        AND draft.expense_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS publication
          WHERE publication.draft_id = draft.id
            AND publication.is_live
        )
    ) AS candidate
    ORDER BY candidate.updated_at DESC,
      candidate.publication_id DESC NULLS LAST,
      candidate.draft_id DESC
    LIMIT 101
  LOOP
    v_count := v_count + 1;
    IF v_count > 100 THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1,
        'status', 'unavailable',
        'rows', '[]'::jsonb
      );
    END IF;
    IF v_candidate.row_kind = 'shared' THEN
      SELECT publication.*,
        draft.version AS current_draft_version
      INTO v_shared
      FROM public.expense_unconfirmed_publications AS publication
      JOIN public.expense_private_drafts AS draft
        ON draft.id = publication.draft_id
       AND draft.actor_user_id = publication.actor_user_id
      WHERE publication.draft_id = v_candidate.draft_id
        AND publication.publication_id = v_candidate.publication_id
        AND publication.is_live
        AND publication.context_type = 'group'
        AND publication.group_id = p_group_id
        AND public.expense_sql159_audience_allows(
          p_actor_id, publication.draft_id
        )
      FOR SHARE OF publication, draft;
      IF v_shared.draft_id IS NULL
         OR NOT public.expense_sql159_snapshot_is_valid(
           v_shared.draft_id
         ) THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'shared_draft',
          'publication_id', v_shared.publication_id,
          'publication_version', v_shared.publication_version,
          'title', v_shared.title,
          'total_minor', v_shared.total_minor,
          'currency', v_shared.currency,
          'incurred_on', pg_catalog.to_char(
            v_shared.incurred_on, 'YYYY-MM-DD'
          ),
          'allocation_state', v_shared.allocation_state,
          'viewer_role', CASE WHEN v_shared.actor_user_id = p_actor_id
            THEN 'author' ELSE 'participant' END,
          'detail_target', CASE WHEN v_shared.actor_user_id = p_actor_id
            THEN pg_catalog.jsonb_build_object(
              'kind', 'private_draft', 'draft_id', v_shared.draft_id
            ) ELSE pg_catalog.jsonb_build_object(
              'kind', 'shared_draft',
              'publication_id', v_shared.publication_id
            ) END
        )
      );
    ELSE
      v_private := NULL;
      SELECT draft.* INTO v_private
      FROM public.expense_private_drafts AS draft
      WHERE draft.id = v_candidate.draft_id
        AND draft.actor_user_id = p_actor_id
        AND draft.context_type = 'group'
        AND draft.group_id = p_group_id
        AND draft.expense_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS publication
          WHERE publication.draft_id = draft.id
            AND publication.is_live
        )
      FOR SHARE OF draft;
      IF v_private.id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_summary := public.expense_sql175_private_group_summary(
        p_actor_id, v_private.id, p_group_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'private_draft',
          'draft_id', v_private.id,
          'draft_version', v_private.version,
          'title', v_summary->'title',
          'total_minor', v_summary->'total_minor',
          'currency', v_summary->'currency',
          'incurred_on', v_summary->'incurred_on',
          'allocation_state', 'incomplete',
          'viewer_role', 'author',
          'detail_target', pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_private.id
          )
        )
      );
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'unavailable',
    'rows', '[]'::jsonb
  );
END;
$function$;

-- Additive Event projection. It reuses the frozen SQL159 v1 visibility and
-- summary contract, changing only exact-author targets to the private editor.
CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_pre_active_v2(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source jsonb;
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_author_draft_id uuid;
BEGIN
  v_source := public.teskeid_event_get_expense_pre_active_v1(
    p_actor_id, p_event_id
  );
  IF pg_catalog.jsonb_typeof(v_source) <> 'object'
     OR v_source - ARRAY['contract_version','status','rows']::text[]
       <> '{}'::jsonb
     OR NOT (v_source ?& ARRAY['contract_version','status','rows']::text[])
     OR v_source->>'contract_version' <> '1'
     OR v_source->>'status' NOT IN ('ready','none','unavailable')
     OR pg_catalog.jsonb_typeof(v_source->'rows') <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 2,
      'status', 'unavailable',
      'rows', '[]'::jsonb
    );
  END IF;
  IF v_source->>'status' <> 'ready' THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 2,
      'status', v_source->>'status',
      'rows', '[]'::jsonb
    );
  END IF;

  FOR v_row IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_source->'rows')
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    IF v_row->>'lifecycle_state' = 'shared_draft'
       AND pg_catalog.jsonb_typeof(v_row->'detail_target') = 'object'
       AND v_row->'detail_target'->>'kind' = 'shared_draft'
       AND v_row->'detail_target'->>'publication_id'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_author_draft_id := NULL;
      SELECT publication.draft_id INTO v_author_draft_id
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.publication_id
          = (v_row->'detail_target'->>'publication_id')::uuid
        AND publication.actor_user_id = p_actor_id
        AND publication.is_live
        AND publication.event_id = p_event_id
        AND publication.link_to_event
      FOR SHARE OF publication;
      IF v_author_draft_id IS NOT NULL THEN
        v_row := pg_catalog.jsonb_set(
          v_row,
          ARRAY['detail_target']::text[],
          pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_author_draft_id
          ),
          false
        );
      END IF;
    END IF;
    v_rows := v_rows || pg_catalog.jsonb_build_array(v_row);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 2,
    'status', 'ready',
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 2,
    'status', 'unavailable',
    'rows', '[]'::jsonb
  );
END;
$function$;

-- Dedicated direct-/drog authority lookup. The existing detail reader remains
-- unchanged; this exact server-owned target lets only the author redirect to
-- the editor while participant viewers stay on the read-only publication.
CREATE OR REPLACE FUNCTION public.expense_get_shared_draft_management_target_v1(
  p_actor_id uuid,
  p_publication_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_publication_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  JOIN public.expense_private_drafts AS draft
    ON draft.id = publication.draft_id
   AND draft.actor_user_id = publication.actor_user_id
   AND draft.context_type IN ('one_off', 'group')
   AND draft.expense_id IS NULL
  WHERE publication.publication_id = p_publication_id
    AND publication.is_live
    AND public.expense_sql159_audience_allows(
      p_actor_id, publication.draft_id
    );
  IF v_publication.draft_id IS NULL
     OR NOT public.expense_sql159_snapshot_is_valid(
       v_publication.draft_id
     ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  IF v_publication.actor_user_id = p_actor_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1,
      'status', 'ready',
      'viewer_role', 'author',
      'detail_target', pg_catalog.jsonb_build_object(
        'kind', 'private_draft', 'draft_id', v_publication.draft_id
      )
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'viewer_role', 'participant',
    'detail_target', pg_catalog.jsonb_build_object(
      'kind', 'shared_draft',
      'publication_id', v_publication.publication_id
    )
  );
END;
$function$;

-- Exact creator-only capability. Edit drafts are intentionally invisible here:
-- their confirmed Expense keeps using SQL173's blocked-capability contract.
CREATE OR REPLACE FUNCTION public.expense_get_own_creation_draft_delete_capability_v1(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found', 'visible', false
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_draft_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found', 'visible', false
    );
  END IF;
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id;
  IF v_draft.id IS NULL
     OR v_draft.context_type NOT IN ('one_off', 'group')
     OR v_draft.expense_id IS NOT NULL
     OR v_draft.version NOT BETWEEN 1 AND 9007199254740991 THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found', 'visible', false
    );
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id;
  IF v_publication.draft_id IS NOT NULL AND (
    v_publication.actor_user_id IS DISTINCT FROM p_actor_id
    OR v_publication.publication_version NOT BETWEEN 1 AND 9007199254740991
    OR v_publication.publication_version = 9007199254740991
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found', 'visible', false
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'visible', true,
    'allowed', true,
    'subject', CASE WHEN COALESCE(v_publication.is_live, false)
      THEN 'shared_draft' ELSE 'private_draft' END,
    'draft_id', v_draft.id,
    'context_type', v_draft.context_type,
    'group_id', v_draft.group_id,
    'expected_draft_version', v_draft.version,
    'expected_publication_version', v_publication.publication_version
  );
END;
$function$;

-- Atomic runtime mutation. SQL installation never invokes this function.
-- SQL159's BEFORE DELETE trigger owns the durable draft tombstone, child-row
-- cleanup and retained publication-generation bump.
CREATE OR REPLACE FUNCTION public.expense_delete_own_creation_draft_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event_id uuid;
  v_locked_event_id uuid;
  v_event_request_id uuid;
  v_event_fingerprint text;
  v_event_replay jsonb;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_subject text;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR (p_expected_publication_version IS NOT NULL
       AND p_expected_publication_version NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_invalid_input';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(175, 107);
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'expectedDraftVersion', p_expected_draft_version,
    'expectedPublicationVersion', p_expected_publication_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_delete_own_creation_draft_v1', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
       OR v_replay - ARRAY[
         'contract_version','state','deleted','draft_id','subject',
         'group_id','event_id'
       ]::text[] <> '{}'::jsonb
       OR NOT (v_replay ?& ARRAY[
         'contract_version','state','deleted','draft_id','subject',
         'group_id','event_id'
       ]::text[])
       OR pg_catalog.jsonb_typeof(v_replay->'contract_version') <> 'number'
       OR v_replay->>'contract_version' <> '1'
       OR pg_catalog.jsonb_typeof(v_replay->'state') <> 'string'
       OR v_replay->>'state' <> 'deleted'
       OR pg_catalog.jsonb_typeof(v_replay->'deleted') <> 'boolean'
       OR v_replay->>'deleted' <> 'true'
       OR pg_catalog.jsonb_typeof(v_replay->'draft_id') <> 'string'
       OR v_replay->>'draft_id' <> p_draft_id::text
       OR pg_catalog.jsonb_typeof(v_replay->'subject') <> 'string'
       OR v_replay->>'subject' NOT IN ('private_draft','shared_draft')
       OR (v_replay->'group_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'group_id') <> 'string'
         OR v_replay->>'group_id'
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ))
       OR (v_replay->'event_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'event_id') <> 'string'
         OR v_replay->>'event_id'
           !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ))
       OR (v_replay->'group_id' <> 'null'::jsonb
         AND v_replay->'event_id' <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'expense_creation_draft_delete_replay_invalid';
    END IF;
    RETURN v_replay;
  END IF;

  v_event_id := public.expense_sql159_probe_event_id(p_actor_id, p_draft_id);
  IF v_event_id IS NOT NULL THEN
    v_event_request_id := public.expense_identity_request_id(
      'expense-sql175-delete-event-gate-v1', p_request_id
    );
    v_event_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'operation', 'expense_delete_own_creation_draft_v1',
      'outerFingerprint', v_fingerprint,
      'eventId', v_event_id
    )::text);
    v_event_replay := public.expense_sql175_begin_event_delete_request(
      p_actor_id, v_event_request_id, v_event_fingerprint
    );
    IF v_event_replay IS NOT NULL THEN
      RAISE EXCEPTION 'expense_creation_draft_delete_receipt_conflict';
    END IF;
  END IF;

  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL
     OR v_draft.context_type NOT IN ('one_off', 'group')
     OR v_draft.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_not_allowed';
  END IF;
  IF v_draft.version <> p_expected_draft_version THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;
  v_locked_event_id := public.expense_sql159_probe_event_id(
    p_actor_id, p_draft_id
  );
  IF v_locked_event_id IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;

  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
  FOR UPDATE;
  IF v_publication.draft_id IS NULL THEN
    IF p_expected_publication_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
    END IF;
  ELSIF v_publication.actor_user_id IS DISTINCT FROM p_actor_id
     OR p_expected_publication_version IS NULL
     OR v_publication.publication_version <> p_expected_publication_version
     OR v_publication.publication_version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;
  PERFORM 1
  FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id
  ORDER BY party.ordinal
  FOR UPDATE;
  PERFORM 1
  FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id
  ORDER BY audience.user_id
  FOR UPDATE;

  -- A durable finalization is authoritative lifecycle evidence even if an
  -- already-corrupt/legacy state also contains the old draft row. Canonical
  -- finalization holds this draft lock before inserting the receipt, so this
  -- fail-closed probe cannot race that path.
  IF EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.draft_id = p_draft_id
  ) THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_not_allowed';
  END IF;

  IF v_publication.is_live
     AND v_publication.event_id IS DISTINCT FROM v_locked_event_id THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;
  v_subject := CASE WHEN COALESCE(v_publication.is_live, false)
    THEN 'shared_draft' ELSE 'private_draft' END;

  DELETE FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
    AND draft.version = p_expected_draft_version
    AND draft.context_type IN ('one_off', 'group')
    AND draft.expense_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.expense_private_drafts AS draft
       WHERE draft.id = p_draft_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.expense_private_draft_tombstones AS tombstone
       WHERE tombstone.draft_id = p_draft_id
     )
     OR EXISTS (
       SELECT 1 FROM public.expense_unconfirmed_publication_parties AS party
       WHERE party.draft_id = p_draft_id
     )
     OR EXISTS (
       SELECT 1 FROM public.expense_unconfirmed_publication_audience AS audience
       WHERE audience.draft_id = p_draft_id
     )
     OR (
       v_publication.draft_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.expense_unconfirmed_publications AS publication
         WHERE publication.draft_id = p_draft_id
       )
     )
     OR (
       v_publication.draft_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.expense_unconfirmed_publications AS publication
         WHERE publication.draft_id = p_draft_id
           AND publication.publication_id = v_publication.publication_id
           AND publication.actor_user_id = p_actor_id
           AND publication.publication_version
             = p_expected_publication_version + 1
           AND NOT publication.is_live
           AND publication.source_draft_version IS NULL
           AND publication.shareable_fingerprint IS NULL
           AND publication.authority_fingerprint IS NULL
           AND publication.context_type IS NULL
           AND publication.group_id IS NULL
           AND publication.event_id IS NULL
           AND publication.event_roster_revision IS NULL
           AND publication.link_to_event IS NULL
           AND publication.visibility IS NULL
           AND publication.title IS NULL
           AND publication.total_minor IS NULL
           AND publication.currency IS NULL
           AND publication.incurred_on IS NULL
           AND publication.allocation_state IS NULL
           AND publication.published_at IS NOT NULL
           AND publication.withdrawn_at IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'expense_creation_draft_delete_conflict';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'state', 'deleted',
    'deleted', true,
    'draft_id', p_draft_id,
    'subject', v_subject,
    'group_id', v_draft.group_id,
    'event_id', v_locked_event_id
  );
  IF v_event_request_id IS NOT NULL THEN
    PERFORM public.teskeid_event_finish_request(
      p_actor_id, v_event_request_id, v_result
    );
  END IF;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_sql175_private_group_summary(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql175_begin_event_delete_request(uuid,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)
  OWNER TO postgres;
ALTER FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_shared_draft_management_target_v1(uuid,uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_sql175_private_group_summary(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_sql175_begin_event_delete_request(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_shared_draft_management_target_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_shared_draft_management_target_v1(uuid,uuid)
  TO service_role;

COMMENT ON FUNCTION public.expense_sql175_private_group_summary(uuid,uuid,uuid) IS
  'SQL175 internal PII-free tolerant summary for one exact author-owned reusable-group creation draft.';
COMMENT ON FUNCTION public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid) IS
  'SQL175 exact creator-only non-edit creation-draft delete capability. Service boundary only.';
COMMENT ON FUNCTION public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint) IS
  'SQL175 runtime-only creator deletion for one exact non-edit creation draft with request replay and draft/publication CAS.';
COMMENT ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid) IS
  'SQL175 additive reusable-group projection for private and shared creation drafts with authoritative detail targets.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid) IS
  'SQL175 additive Event pre-active projection; exact authors receive private editor targets.';
COMMENT ON FUNCTION public.expense_get_shared_draft_management_target_v1(uuid,uuid) IS
  'SQL175 exact server-owned management target for a visible live shared creation draft.';

DO $sql175_postflight$
DECLARE
  v_expected record;
  v_routine record;
  v_acl_ok boolean;
  v_dependency_ok boolean;
  v_overload_count integer;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.expense_sql175_private_group_summary(uuid,uuid,uuid)', ARRAY['p_actor_id','p_draft_id','p_group_id']::text[], 's'::"char", false, '0f6cac7b817e25d7f61ebf8a923e69d2'),
      ('public.expense_sql175_begin_event_delete_request(uuid,uuid,text)', ARRAY['p_actor_id','p_request_id','p_fingerprint']::text[], 'v'::"char", false, 'ea3732c799f6737cb9dbbe7aebc02a36'),
      ('public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)', ARRAY['p_actor_id','p_draft_id']::text[], 's'::"char", true, '26b15255fc401c05eb7808917698fe30'),
      ('public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)', ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[], 'v'::"char", true, '4ba7b3a6be41204ec3807c63e37bdeb4'),
      ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', ARRAY['p_actor_id','p_group_id']::text[], 'v'::"char", true, '578aecf4b838c85b9d70ad4748ea4f6e'),
      ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', ARRAY['p_actor_id','p_event_id']::text[], 'v'::"char", true, '65270072a4d257dcdb650cf1715b324f'),
      ('public.expense_get_shared_draft_management_target_v1(uuid,uuid)', ARRAY['p_actor_id','p_publication_id']::text[], 's'::"char", true, '6c5bc595cf9610550dfdd6b1741870c2')
    ) AS expected(signature, argument_names, volatility, service_execute, source_hash)
  LOOP
    SELECT pg_catalog.count(*)::integer INTO v_overload_count
    FROM pg_catalog.pg_proc AS overload
    WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
      AND overload.proname = pg_catalog.split_part(
        pg_catalog.split_part(v_expected.signature, '.', 2), '(', 1
      );
    SELECT routine.*, owner_role.rolname AS owner_name,
      language_row.lanname AS language_name
    INTO v_routine
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    WHERE routine.oid = v_expected.signature::pg_catalog.regprocedure;
    IF v_overload_count <> 1
       OR v_routine.oid IS NULL
       OR v_routine.prokind <> 'f'
       OR v_routine.proargnames IS DISTINCT FROM v_expected.argument_names
       OR v_routine.proargmodes IS NOT NULL
       OR v_routine.prorettype <> 'jsonb'::pg_catalog.regtype
       OR v_routine.proretset
       OR v_routine.provolatile <> v_expected.volatility
       OR NOT v_routine.prosecdef
       OR v_routine.proisstrict
       OR v_routine.proleakproof
       OR v_routine.proparallel <> 'u'::"char"
       OR v_routine.pronargdefaults <> 0
       OR v_routine.proargdefaults IS NOT NULL
       OR v_routine.proallargtypes IS NOT NULL
       OR v_routine.provariadic <> 0::oid
       OR v_routine.procost <> 100
       OR v_routine.prorows <> 0
       OR v_routine.prosupport <> 0::oid
       OR v_routine.protrftypes IS NOT NULL
       OR v_routine.probin IS NOT NULL
       OR v_routine.prosqlbody IS NOT NULL
       OR v_routine.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR v_routine.owner_name <> 'postgres'
       OR v_routine.language_name <> 'plpgsql'
       OR pg_catalog.md5(pg_catalog.replace(
         v_routine.prosrc, E'\r\n', E'\n'
       )) <> v_expected.source_hash THEN
      RAISE EXCEPTION 'expense_sql175_function_contract_drift:%', v_expected.signature;
    END IF;
    SELECT pg_catalog.count(*) = CASE
          WHEN v_expected.service_execute THEN 2 ELSE 1 END
        AND COALESCE(pg_catalog.bool_and(
          privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
            AND privilege_row.privilege_type = 'EXECUTE'
            AND NOT privilege_row.is_grantable
            AND (
              privilege_row.grantee = pg_catalog.to_regrole('postgres')::oid
              OR (
                v_expected.service_execute
                AND privilege_row.grantee =
                  pg_catalog.to_regrole('service_role')::oid
              )
            )
        ), false)
        AND pg_catalog.has_function_privilege(
          'postgres', v_routine.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          'service_role', v_routine.oid, 'EXECUTE'
        ) = v_expected.service_execute
        AND NOT pg_catalog.has_function_privilege(
          'anon', v_routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', v_routine.oid, 'EXECUTE'
        )
    INTO v_acl_ok
    FROM pg_catalog.aclexplode(COALESCE(
      v_routine.proacl,
      pg_catalog.acldefault('f', v_routine.proowner)
    )) AS privilege_row;
    IF NOT v_acl_ok THEN
      RAISE EXCEPTION 'expense_sql175_function_acl_drift:%', v_expected.signature;
    END IF;

    SELECT pg_catalog.count(*) = 2
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid =
              'pg_catalog.pg_namespace'::pg_catalog.regclass
            AND dependency.refobjid = pg_catalog.to_regnamespace('public')
        ) = 1
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid =
              'pg_catalog.pg_language'::pg_catalog.regclass
            AND dependency.refobjid = v_routine.prolang
        ) = 1
        AND COALESCE(pg_catalog.bool_and(
          dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = v_routine.oid
            AND dependency.objsubid = 0
            AND dependency.refobjsubid = 0
            AND dependency.deptype = 'n'::"char"
        ), false)
    INTO v_dependency_ok
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_routine.oid;
    IF NOT v_dependency_ok THEN
      RAISE EXCEPTION 'expense_sql175_function_dependency_drift:%', v_expected.signature;
    END IF;
  END LOOP;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid =
           'public.expense_private_drafts'::pg_catalog.regclass
         AND trigger_row.tgname = 'expense_sql159_private_draft_delete_guard'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 11
         AND trigger_row.tgfoid =
           'public.expense_sql159_guard_private_draft_delete()'::pg_catalog.regprocedure
         AND trigger_row.tgconstraint = 0
         AND trigger_row.tgnargs = 0
         AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
         AND trigger_row.tgqual IS NULL
         AND trigger_row.tgoldtable IS NULL
         AND trigger_row.tgnewtable IS NULL
     ) OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS delete_trigger
       WHERE delete_trigger.tgrelid =
         'public.expense_private_drafts'::pg_catalog.regclass
         AND NOT delete_trigger.tgisinternal
         AND (delete_trigger.tgtype::integer & 8) = 8
     ) <> 1 THEN
    RAISE EXCEPTION 'expense_sql175_delete_trigger_drift';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS obsolete_constraint
       WHERE obsolete_constraint.conrelid =
         'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
         AND obsolete_constraint.conname =
           'expense_unconfirmed_finalizations_expense_fk'
     ) OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid =
           'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
         AND trigger_row.tgname =
           'expense_unconfirmed_finalizations_expense_reference_guard'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 23
         AND trigger_row.tgfoid =
           'public.expense_validate_finalization_expense_reference()'::pg_catalog.regprocedure
         AND trigger_row.tgconstraint = 0
         AND NOT trigger_row.tgdeferrable
         AND NOT trigger_row.tginitdeferred
         AND trigger_row.tgnargs = 0
         AND pg_catalog.octet_length(trigger_row.tgargs) = 0
         AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 2
         AND (
           SELECT pg_catalog.array_agg(
             attribute.attname::text ORDER BY attribute.attname
           )
           FROM pg_catalog.unnest(trigger_row.tgattr::smallint[])
             AS trigger_attribute(attnum)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = trigger_row.tgrelid
            AND attribute.attnum = trigger_attribute.attnum
         ) = ARRAY['expense_id','group_id']::text[]
         AND trigger_row.tgqual IS NULL
         AND trigger_row.tgoldtable IS NULL
         AND trigger_row.tgnewtable IS NULL
     ) THEN
    RAISE EXCEPTION 'expense_sql175_sql173_finalization_guard_drift';
  END IF;

  -- Freeze the confirmed-delete implementation and its receipt classifiers.
  IF (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_has_beta_access(uuid)'::pg_catalog.regprocedure)
        <> 'ebe4628dbda84e79b395c9da0ae39899'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_assert_beta_actor(uuid)'::pg_catalog.regprocedure)
        <> 'ea6c329f5c13bd7d0bfbd9df41e5931d'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_begin_request(uuid,uuid,text,text)'::pg_catalog.regprocedure)
        <> 'd8631d60cc2f0df56dd9e958537db2a7'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_finish_request(uuid,uuid,jsonb)'::pg_catalog.regprocedure)
        <> '194c5812642b4aaaafe888bc0ba5aa29'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_identity_request_id(text,uuid)'::pg_catalog.regprocedure)
        <> '496d1e1dd94d149cf607198c9271a25d'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_assert_session_actor(uuid)'::pg_catalog.regprocedure)
        <> '30238c0def94d573fd8265fd94da0757'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_finish_request(uuid,uuid,jsonb)'::pg_catalog.regprocedure)
        <> 'eaa006157dc5377e0ae1f8979651f8aa'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_amount_minor(text,text,boolean)'::pg_catalog.regprocedure)
        <> '5a4124296ff7e6f19d42342815be8109'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_probe_event_id(uuid,uuid)'::pg_catalog.regprocedure)
        <> '7600bd78711a0296ef545e0595c788b1'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_event_scope_read_only(uuid,uuid)'::pg_catalog.regprocedure)
        <> '4ba9308ba12eef6405ed24916bc0bb74'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_event_scope_allows(uuid,uuid)'::pg_catalog.regprocedure)
        <> '0be29be5cda2d34bf41dc2f67e0afa2e'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_audience_allows(uuid,uuid)'::pg_catalog.regprocedure)
        <> '9c4af07a07906c4dac6f06da94b42b37'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_snapshot_is_valid(uuid)'::pg_catalog.regprocedure)
        <> 'af4b9f8a5f0b422956fc1d664021baff'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_sql159_private_event_summary(uuid,uuid,uuid)'::pg_catalog.regprocedure)
        <> 'e75a609fc4f231b0cfda3d5fb2679d9b'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'::pg_catalog.regprocedure)
        <> '9d703deec837fbffed4add9cf8b97b56'
      OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = 'public.expense_sql159_guard_private_draft_delete()'::pg_catalog.regprocedure)
        <> 'cd349b0ef1810c51deb229ae64eade33'
      OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = 'public.expense_validate_finalization_expense_reference()'::pg_catalog.regprocedure)
        <> '3124b6233c3045627463f49487a49c59'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_get_own_delete_capability(uuid,uuid)'::pg_catalog.regprocedure)
        <> 'ffbd530e2f759d85809a34045ac15a1e'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)'::pg_catalog.regprocedure)
        <> '41bc44fc718a17fc4fc8c0777e0a0a67'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipt_shape_known(text,jsonb)'::pg_catalog.regprocedure)
        <> 'edb8a21d01ffdbbb8e9aa2b94c7c2594'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'::pg_catalog.regprocedure)
        <> '9def695d70fc38b63011cb2bd12e2e67'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_list_group_shared_drafts(uuid,uuid)'::pg_catalog.regprocedure)
        <> '0a06c9d47c9c17dad77c715fbef50d55'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)'::pg_catalog.regprocedure)
        <> '4332f4ccfd5e58f2e17ebe9389c13311'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_get_shared_draft_detail(uuid,uuid)'::pg_catalog.regprocedure)
        <> '51a607ab9bc5e5ad5a19f4b9d96aa00b' THEN
    RAISE EXCEPTION 'expense_sql175_preserved_contract_drift';
  END IF;
END;
$sql175_postflight$;

COMMIT;
