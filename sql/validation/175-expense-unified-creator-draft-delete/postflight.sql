-- SQL175 postflight: 100% catalog-read-only.
-- It never reads an application row and never invokes the runtime mutation.
WITH roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), expected_predecessor(signature, source_hash, service_execute) AS MATERIALIZED (
  VALUES
    ('public.expense_has_beta_access(uuid)', 'ebe4628dbda84e79b395c9da0ae39899', false),
    ('public.expense_assert_beta_actor(uuid)', 'ea6c329f5c13bd7d0bfbd9df41e5931d', false),
    ('public.expense_begin_request(uuid,uuid,text,text)', 'd8631d60cc2f0df56dd9e958537db2a7', false),
    ('public.expense_finish_request(uuid,uuid,jsonb)', '194c5812642b4aaaafe888bc0ba5aa29', false),
    ('public.expense_identity_request_id(text,uuid)', '496d1e1dd94d149cf607198c9271a25d', false),
    ('public.teskeid_event_assert_session_actor(uuid)', '30238c0def94d573fd8265fd94da0757', false),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'eaa006157dc5377e0ae1f8979651f8aa', false),
    ('public.expense_sql159_amount_minor(text,text,boolean)', '5a4124296ff7e6f19d42342815be8109', false),
    ('public.expense_sql159_probe_event_id(uuid,uuid)', '7600bd78711a0296ef545e0595c788b1', false),
    ('public.expense_sql159_event_scope_read_only(uuid,uuid)', '4ba9308ba12eef6405ed24916bc0bb74', false),
    ('public.expense_sql159_event_scope_allows(uuid,uuid)', '0be29be5cda2d34bf41dc2f67e0afa2e', false),
    ('public.expense_sql159_audience_allows(uuid,uuid)', '9c4af07a07906c4dac6f06da94b42b37', false),
    ('public.expense_sql159_guard_private_draft_delete()', 'cd349b0ef1810c51deb229ae64eade33', false),
    ('public.expense_validate_finalization_expense_reference()', '3124b6233c3045627463f49487a49c59', false),
    ('public.expense_sql159_snapshot_is_valid(uuid)', 'af4b9f8a5f0b422956fc1d664021baff', false),
    ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)', 'e75a609fc4f231b0cfda3d5fb2679d9b', false),
    ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', '9d703deec837fbffed4add9cf8b97b56', false),
    ('public.expense_list_group_shared_drafts(uuid,uuid)', '0a06c9d47c9c17dad77c715fbef50d55', true),
    ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', '4332f4ccfd5e58f2e17ebe9389c13311', true),
    ('public.expense_get_shared_draft_detail(uuid,uuid)', '51a607ab9bc5e5ad5a19f4b9d96aa00b', true),
    ('public.expense_get_own_delete_capability(uuid,uuid)', 'ffbd530e2f759d85809a34045ac15a1e', true),
    ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', '41bc44fc718a17fc4fc8c0777e0a0a67', true),
    ('public.expense_hard_delete_receipt_shape_known(text,jsonb)', 'edb8a21d01ffdbbb8e9aa2b94c7c2594', false),
    ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', '9def695d70fc38b63011cb2bd12e2e67', false)
), observed_predecessor AS MATERIALIZED (
  SELECT expected.*, routine.*, language_row.lanname,
    owner_role.rolname AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      routine.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash
  FROM expected_predecessor AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
), predecessor_acl AS MATERIALIZED (
  SELECT observed.signature,
    pg_catalog.count(*) = CASE
        WHEN observed.service_execute THEN 2 ELSE 1 END
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        privilege_row.grantor = roles.postgres_oid
          AND privilege_row.privilege_type = 'EXECUTE'
          AND NOT privilege_row.is_grantable
          AND (
            privilege_row.grantee = roles.postgres_oid
            OR (observed.service_execute
              AND privilege_row.grantee = roles.service_role_oid)
          )
      ), false)), false)
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, observed.oid, 'EXECUTE'
      ) = observed.service_execute
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, observed.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, observed.oid, 'EXECUTE'
      ) AS acl_exact
  FROM observed_predecessor AS observed
  CROSS JOIN roles
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    observed.proacl, pg_catalog.acldefault('f', observed.proowner)
  )) AS privilege_row
  WHERE observed.oid IS NOT NULL
  GROUP BY observed.signature, observed.service_execute, observed.oid,
    roles.postgres_oid, roles.service_role_oid,
    roles.anon_oid, roles.authenticated_oid
), predecessor_state AS MATERIALIZED (
  SELECT pg_catalog.count(observed.oid) = 24
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.actual_source_hash = observed.source_hash
      ), false)), false) AS predecessor_sources_exact,
    pg_catalog.count(observed.oid) = 24
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.prokind = 'f'
          AND observed.proargmodes IS NULL
          AND pg_catalog.pg_get_function_arguments(observed.oid) = CASE
            WHEN observed.signature = 'public.expense_has_beta_access(uuid)'
              THEN 'p_user_id uuid'
            WHEN observed.signature = 'public.expense_assert_beta_actor(uuid)'
              THEN 'p_actor_id uuid'
            WHEN observed.signature = 'public.expense_begin_request(uuid,uuid,text,text)'
              THEN 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text'
            WHEN observed.signature = 'public.expense_finish_request(uuid,uuid,jsonb)'
              THEN 'p_actor_id uuid, p_request_id uuid, p_result jsonb'
            WHEN observed.signature = 'public.expense_identity_request_id(text,uuid)'
              THEN 'p_scope text, p_request_id uuid'
            WHEN observed.signature = 'public.teskeid_event_assert_session_actor(uuid)'
              THEN 'p_actor_id uuid'
            WHEN observed.signature = 'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
              THEN 'p_actor_id uuid, p_request_id uuid, p_result jsonb'
            WHEN observed.signature = 'public.expense_sql159_amount_minor(text,text,boolean)'
              THEN 'p_raw text, p_currency text, p_allow_zero boolean'
            WHEN observed.signature = 'public.expense_sql159_probe_event_id(uuid,uuid)'
              THEN 'p_actor_id uuid, p_draft_id uuid'
            WHEN observed.signature IN (
              'public.expense_sql159_event_scope_read_only(uuid,uuid)',
              'public.expense_sql159_event_scope_allows(uuid,uuid)',
              'public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)'
            ) THEN 'p_actor_id uuid, p_event_id uuid'
            WHEN observed.signature = 'public.expense_sql159_audience_allows(uuid,uuid)'
              THEN 'p_actor_id uuid, p_draft_id uuid'
            WHEN observed.signature IN (
              'public.expense_sql159_guard_private_draft_delete()',
              'public.expense_validate_finalization_expense_reference()'
            )
              THEN ''
            WHEN observed.signature = 'public.expense_sql159_snapshot_is_valid(uuid)'
              THEN 'p_draft_id uuid'
            WHEN observed.signature = 'public.expense_sql159_private_event_summary(uuid,uuid,uuid)'
              THEN 'p_actor_id uuid, p_draft_id uuid, p_event_id uuid'
            WHEN observed.signature = 'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
              THEN 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean'
            WHEN observed.signature = 'public.expense_list_group_shared_drafts(uuid,uuid)'
              THEN 'p_actor_id uuid, p_group_id uuid'
            WHEN observed.signature = 'public.expense_get_shared_draft_detail(uuid,uuid)'
              THEN 'p_actor_id uuid, p_publication_id uuid'
            WHEN observed.signature = 'public.expense_get_own_delete_capability(uuid,uuid)'
              THEN 'p_actor_id uuid, p_expense_id uuid'
            WHEN observed.signature = 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)'
              THEN 'p_actor_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_request_id uuid'
            WHEN observed.signature = 'public.expense_hard_delete_receipt_shape_known(text,jsonb)'
              THEN 'p_operation text, p_result jsonb'
            WHEN observed.signature = 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'
              THEN 'p_expense_id uuid, p_group_id uuid, p_one_off boolean, p_invitation_ids uuid[]'
          END
          AND pg_catalog.pg_get_function_result(observed.oid) = CASE
            WHEN observed.signature IN (
              'public.expense_has_beta_access(uuid)',
              'public.expense_sql159_event_scope_allows(uuid,uuid)',
              'public.expense_sql159_audience_allows(uuid,uuid)',
              'public.expense_sql159_snapshot_is_valid(uuid)',
              'public.expense_hard_delete_receipt_shape_known(text,jsonb)',
              'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'
            ) THEN 'boolean'
            WHEN observed.signature IN (
              'public.expense_assert_beta_actor(uuid)',
              'public.expense_finish_request(uuid,uuid,jsonb)',
              'public.teskeid_event_assert_session_actor(uuid)',
              'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
            ) THEN 'void'
            WHEN observed.signature IN (
              'public.expense_identity_request_id(text,uuid)',
              'public.expense_sql159_probe_event_id(uuid,uuid)'
            ) THEN 'uuid'
            WHEN observed.signature = 'public.expense_sql159_amount_minor(text,text,boolean)'
              THEN 'bigint'
            WHEN observed.signature IN (
              'public.expense_sql159_guard_private_draft_delete()',
              'public.expense_validate_finalization_expense_reference()'
            )
              THEN 'trigger'
            ELSE 'jsonb'
          END
          AND NOT observed.proretset
          AND observed.provolatile = CASE
            WHEN observed.signature IN (
              'public.expense_identity_request_id(text,uuid)',
              'public.expense_sql159_amount_minor(text,text,boolean)',
              'public.expense_hard_delete_receipt_shape_known(text,jsonb)'
            ) THEN 'i'::"char"
            WHEN observed.signature IN (
              'public.expense_has_beta_access(uuid)',
              'public.expense_assert_beta_actor(uuid)',
              'public.teskeid_event_assert_session_actor(uuid)',
              'public.expense_sql159_probe_event_id(uuid,uuid)',
              'public.expense_sql159_event_scope_read_only(uuid,uuid)',
              'public.expense_sql159_event_scope_allows(uuid,uuid)',
              'public.expense_sql159_audience_allows(uuid,uuid)',
              'public.expense_sql159_snapshot_is_valid(uuid)',
              'public.expense_sql159_private_event_summary(uuid,uuid,uuid)',
              'public.expense_get_own_delete_capability(uuid,uuid)',
              'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'
            ) THEN 's'::"char"
            ELSE 'v'::"char"
          END
          AND observed.prosecdef = (
            observed.signature <>
              'public.expense_sql159_amount_minor(text,text,boolean)'
          )
          AND NOT observed.proisstrict
          AND NOT observed.proleakproof
          AND observed.proparallel = 'u'::"char"
          AND observed.pronargdefaults = 0
          AND observed.proargdefaults IS NULL
          AND observed.proallargtypes IS NULL
          AND observed.provariadic = 0::oid
          AND observed.proconfig = ARRAY['search_path=""']::text[]
          AND observed.owner_name = 'postgres'
          AND observed.lanname = CASE WHEN observed.signature IN (
            'public.expense_has_beta_access(uuid)',
            'public.expense_identity_request_id(text,uuid)',
            'public.expense_sql159_audience_allows(uuid,uuid)',
            'public.expense_sql159_snapshot_is_valid(uuid)',
            'public.expense_hard_delete_receipt_shape_known(text,jsonb)'
          ) THEN 'sql' ELSE 'plpgsql' END
          AND (
            SELECT pg_catalog.count(*) = 1
            FROM pg_catalog.pg_proc AS overload
            WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
              AND overload.proname = observed.proname
          )
      ), false)), false) AS predecessor_contracts_exact,
    pg_catalog.count(acl.signature) = 24
      AND COALESCE(pg_catalog.bool_and(
        COALESCE(acl.acl_exact, false)
      ), false)
      AS predecessor_entry_acls_exact
  FROM observed_predecessor AS observed
  LEFT JOIN predecessor_acl AS acl ON acl.signature = observed.signature
), expected_relation(relation_schema, relation_name, force_rls) AS MATERIALIZED (
  VALUES
    ('public','expense_groups',false),
    ('public','expense_group_members',false),
    ('public','expense_private_drafts',true),
    ('public','expense_private_draft_tombstones',true),
    ('public','expense_unconfirmed_publications',true),
    ('public','expense_unconfirmed_publication_parties',true),
    ('public','expense_unconfirmed_publication_audience',true),
    ('public','expense_unconfirmed_finalizations',true),
    ('public','expense_mutation_requests',false),
    ('public','teskeid_event_mutation_requests',true)
), observed_relation AS MATERIALIZED (
  SELECT expected.*, relation.oid, relation.relowner,
    relation.relkind, relation.relrowsecurity, relation.relforcerowsecurity
  FROM expected_relation AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = pg_catalog.to_regnamespace(expected.relation_schema)
   AND relation.relname = expected.relation_name
), relation_state AS MATERIALIZED (
  SELECT pg_catalog.count(observed.oid) = 10
      AND pg_catalog.to_regclass('auth.users') IS NOT NULL
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.relkind = 'r'
          AND observed.relrowsecurity
          AND observed.relforcerowsecurity = observed.force_rls
          AND observed.relowner = roles.postgres_oid
      ), false)), false) AS relation_contracts_exact
  FROM observed_relation AS observed
  CROSS JOIN roles
), expected_constraint(
  relation_name, constraint_name, constraint_type, definition_hash
) AS MATERIALIZED (
  VALUES
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
), observed_constraint AS MATERIALIZED (
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
  FROM expected_constraint AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
), constraint_state AS MATERIALIZED (
  SELECT pg_catalog.count(observed.oid) = 52
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.actual_type = observed.constraint_type
          AND observed.convalidated
          AND NOT observed.condeferrable
          AND NOT observed.condeferred
          AND NOT observed.connoinherit
          AND observed.actual_definition_hash = observed.definition_hash
      ), false)), false)
      AND (
        SELECT pg_catalog.count(*) = 52
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
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS obsolete_constraint
        WHERE obsolete_constraint.conrelid =
          'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
          AND obsolete_constraint.conname =
            'expense_unconfirmed_finalizations_expense_fk'
      ) AS relation_constraints_exact
  FROM observed_constraint AS observed
), expected_private_relation(relation_name) AS MATERIALIZED (
  VALUES
    ('expense_private_drafts'),
    ('expense_private_draft_tombstones'),
    ('expense_unconfirmed_publications'),
    ('expense_unconfirmed_publication_parties'),
    ('expense_unconfirmed_publication_audience'),
    ('expense_unconfirmed_finalizations'),
    ('expense_mutation_requests'),
    ('teskeid_event_mutation_requests')
), private_relation_state AS MATERIALIZED (
  SELECT pg_catalog.count(relation.oid) = 8
      AND NOT EXISTS (
        SELECT 1
        FROM expected_private_relation AS checked
        JOIN pg_catalog.pg_class AS target
          ON target.relnamespace = pg_catalog.to_regnamespace('public')
         AND target.relname = checked.relation_name
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
          target.relacl, pg_catalog.acldefault('r', target.relowner)
        )) AS privilege_row
        WHERE privilege_row.grantee <> target.relowner
           OR privilege_row.grantor <> target.relowner
           OR privilege_row.is_grantable
      )
      AND NOT EXISTS (
        SELECT 1
        FROM expected_private_relation AS checked
        CROSS JOIN (VALUES
          ('anon'), ('authenticated'), ('service_role')
        ) AS checked_role(role_name)
        WHERE pg_catalog.has_table_privilege(
          checked_role.role_name,
          'public.' || checked.relation_name,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
      ) AS private_relation_acls_exact
  FROM expected_private_relation AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = pg_catalog.to_regnamespace('public')
   AND relation.relname = expected.relation_name
), delete_trigger_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        trigger_row.tgrelid =
          'public.expense_private_drafts'::pg_catalog.regclass
          AND trigger_row.tgtype = 11
          AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
            'public.expense_sql159_guard_private_draft_delete()'
          )
          AND trigger_row.tgenabled = 'O'
          AND NOT trigger_row.tgisinternal
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
      ), false)), false)
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_trigger AS delete_trigger
        WHERE delete_trigger.tgrelid =
          pg_catalog.to_regclass('public.expense_private_drafts')
          AND NOT delete_trigger.tgisinternal
          AND (delete_trigger.tgtype::integer & 8) = 8
      ) AS delete_trigger_exact
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid =
      pg_catalog.to_regclass('public.expense_private_drafts')
    AND trigger_row.tgname = 'expense_sql159_private_draft_delete_guard'
), sql173_finalization_guard_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        trigger_row.tgrelid =
          'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
          AND trigger_row.tgtype = 23
          AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
            'public.expense_validate_finalization_expense_reference()'
          )
          AND trigger_row.tgenabled = 'O'
          AND NOT trigger_row.tgisinternal
          AND trigger_row.tgconstraint = 0
          AND NOT trigger_row.tgdeferrable
          AND NOT trigger_row.tginitdeferred
          AND trigger_row.tgnargs = 0
          AND pg_catalog.octet_length(trigger_row.tgargs) = 0
          AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 2
          AND COALESCE((
            SELECT pg_catalog.array_agg(
              attribute.attname::text ORDER BY attribute.attname
            )
            FROM pg_catalog.unnest(trigger_row.tgattr::smallint[])
              AS trigger_attribute(attnum)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = trigger_row.tgrelid
             AND attribute.attnum = trigger_attribute.attnum
          ), ARRAY[]::text[]) = ARRAY['expense_id','group_id']::text[]
          AND trigger_row.tgqual IS NULL
          AND trigger_row.tgoldtable IS NULL
          AND trigger_row.tgnewtable IS NULL
      ), false)), false) AS sql173_finalization_guard_exact
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid =
      pg_catalog.to_regclass('public.expense_unconfirmed_finalizations')
    AND trigger_row.tgname =
      'expense_unconfirmed_finalizations_expense_reference_guard'
), expected_target(
  function_name, signature, argument_names, exact_arguments,
  volatility, service_execute, source_hash
) AS MATERIALIZED (
  VALUES
    ('expense_sql175_private_group_summary',
      'public.expense_sql175_private_group_summary(uuid,uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id','p_group_id']::text[],
      'p_actor_id uuid, p_draft_id uuid, p_group_id uuid',
      's'::"char", false, '0f6cac7b817e25d7f61ebf8a923e69d2'),
    ('expense_sql175_begin_event_delete_request',
      'public.expense_sql175_begin_event_delete_request(uuid,uuid,text)',
      ARRAY['p_actor_id','p_request_id','p_fingerprint']::text[],
      'p_actor_id uuid, p_request_id uuid, p_fingerprint text',
      'v'::"char", false, 'ea3732c799f6737cb9dbbe7aebc02a36'),
    ('expense_list_group_creation_drafts_v1',
      'public.expense_list_group_creation_drafts_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_group_id']::text[],
      'p_actor_id uuid, p_group_id uuid',
      'v'::"char", true, '578aecf4b838c85b9d70ad4748ea4f6e'),
    ('teskeid_event_get_expense_pre_active_v2',
      'public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)',
      ARRAY['p_actor_id','p_event_id']::text[],
      'p_actor_id uuid, p_event_id uuid',
      'v'::"char", true, '65270072a4d257dcdb650cf1715b324f'),
    ('expense_get_shared_draft_management_target_v1',
      'public.expense_get_shared_draft_management_target_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_publication_id']::text[],
      'p_actor_id uuid, p_publication_id uuid',
      's'::"char", true, '6c5bc595cf9610550dfdd6b1741870c2'),
    ('expense_get_own_creation_draft_delete_capability_v1',
      'public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[],
      'p_actor_id uuid, p_draft_id uuid',
      's'::"char", true, '26b15255fc401c05eb7808917698fe30'),
    ('expense_delete_own_creation_draft_v1',
      'public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)',
      ARRAY['p_actor_id','p_request_id','p_draft_id','p_expected_draft_version','p_expected_publication_version']::text[],
      'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint',
      'v'::"char", true, '4ba7b3a6be41204ec3807c63e37bdeb4')
), observed_target AS MATERIALIZED (
  SELECT expected.*, routine.*, language_row.lanname,
    owner_role.rolname AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      routine.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash
  FROM expected_target AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
), target_acl AS MATERIALIZED (
  SELECT observed.signature,
    pg_catalog.count(*) = CASE
        WHEN observed.service_execute THEN 2 ELSE 1 END
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        privilege_row.grantor = roles.postgres_oid
          AND privilege_row.privilege_type = 'EXECUTE'
          AND NOT privilege_row.is_grantable
          AND (
            privilege_row.grantee = roles.postgres_oid
            OR (observed.service_execute
              AND privilege_row.grantee = roles.service_role_oid)
          )
      ), false)), false)
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, observed.oid, 'EXECUTE'
      ) = observed.service_execute
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, observed.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, observed.oid, 'EXECUTE'
      ) AS acl_exact
  FROM observed_target AS observed
  CROSS JOIN roles
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    observed.proacl, pg_catalog.acldefault('f', observed.proowner)
  )) AS privilege_row
  WHERE observed.oid IS NOT NULL
  GROUP BY observed.signature, observed.service_execute, observed.oid,
    roles.postgres_oid, roles.service_role_oid,
    roles.anon_oid, roles.authenticated_oid
), target_dependency AS MATERIALIZED (
  SELECT observed.signature,
    pg_catalog.count(*) = 2
      AND pg_catalog.count(*) FILTER (
        WHERE dependency.refclassid =
            'pg_catalog.pg_namespace'::pg_catalog.regclass
          AND dependency.refobjid = pg_catalog.to_regnamespace('public')
      ) = 1
      AND pg_catalog.count(*) FILTER (
        WHERE dependency.refclassid =
            'pg_catalog.pg_language'::pg_catalog.regclass
          AND dependency.refobjid = observed.prolang
      ) = 1
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = observed.oid
          AND dependency.objsubid = 0
          AND dependency.refobjsubid = 0
          AND dependency.deptype = 'n'::"char"
      ), false)), false) AS dependencies_exact
  FROM observed_target AS observed
  JOIN pg_catalog.pg_depend AS dependency
    ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
   AND dependency.objid = observed.oid
  GROUP BY observed.signature, observed.oid, observed.prolang
), target_state AS MATERIALIZED (
  SELECT (
      SELECT pg_catalog.count(*) = 0
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
        AND routine.proname IN (
          SELECT expected.function_name FROM expected_target AS expected
        )
    ) AS targets_absent,
    pg_catalog.count(observed.oid) = 7
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.prokind = 'f'
          AND observed.proargnames = observed.argument_names
          AND observed.proargmodes IS NULL
          AND pg_catalog.pg_get_function_arguments(observed.oid)
            = observed.exact_arguments
          AND pg_catalog.pg_get_function_result(observed.oid) = 'jsonb'
          AND observed.prorettype = 'jsonb'::pg_catalog.regtype
          AND NOT observed.proretset
          AND observed.provolatile = observed.volatility
          AND observed.prosecdef
          AND NOT observed.proisstrict
          AND NOT observed.proleakproof
          AND observed.proparallel = 'u'::"char"
          AND observed.pronargdefaults = 0
          AND observed.proargdefaults IS NULL
          AND observed.proallargtypes IS NULL
          AND observed.provariadic = 0::oid
          AND observed.procost = 100
          AND observed.prorows = 0
          AND observed.prosupport = 0::oid
          AND observed.protrftypes IS NULL
          AND observed.probin IS NULL
          AND observed.prosqlbody IS NULL
          AND observed.proconfig = ARRAY['search_path=""']::text[]
          AND observed.lanname = 'plpgsql'
          AND observed.owner_name = 'postgres'
      ), false)), false) AS target_contracts_exact,
    pg_catalog.count(observed.oid) = 7
      AND COALESCE(pg_catalog.bool_and(COALESCE((
        observed.actual_source_hash = observed.source_hash
      ), false)), false) AS target_sources_exact,
    pg_catalog.count(acl.signature) = 7
      AND COALESCE(pg_catalog.bool_and(
        COALESCE(acl.acl_exact, false)
      ), false)
      AS target_acls_exact,
    pg_catalog.count(dependency.signature) = 7
      AND COALESCE(pg_catalog.bool_and(
        COALESCE(dependency.dependencies_exact, false)
      ), false) AS target_dependencies_exact,
    (
      SELECT pg_catalog.count(*) = 7
        AND pg_catalog.count(DISTINCT routine.proname) = 7
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
        AND routine.proname IN (
          SELECT expected.function_name FROM expected_target AS expected
        )
    ) AS target_overloads_exact
  FROM observed_target AS observed
  LEFT JOIN target_acl AS acl ON acl.signature = observed.signature
  LEFT JOIN target_dependency AS dependency
    ON dependency.signature = observed.signature
), classified AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
      AS executor_ok,
    relation_state.relation_contracts_exact,
    constraint_state.relation_constraints_exact,
    private_relation_state.private_relation_acls_exact,
    predecessor_state.predecessor_sources_exact,
    predecessor_state.predecessor_contracts_exact,
    predecessor_state.predecessor_entry_acls_exact,
    delete_trigger_state.delete_trigger_exact,
    sql173_finalization_guard_state.sql173_finalization_guard_exact,
    target_state.*,
    relation_state.relation_contracts_exact
      AND constraint_state.relation_constraints_exact
      AND private_relation_state.private_relation_acls_exact
      AND predecessor_state.predecessor_sources_exact
      AND predecessor_state.predecessor_contracts_exact
      AND predecessor_state.predecessor_entry_acls_exact
      AND delete_trigger_state.delete_trigger_exact
      AND sql173_finalization_guard_state.sql173_finalization_guard_exact
        AS prerequisites_exact,
    target_state.target_contracts_exact
      AND target_state.target_sources_exact
      AND target_state.target_acls_exact
      AND target_state.target_dependencies_exact
      AND target_state.target_overloads_exact AS targets_exact
  FROM relation_state
  CROSS JOIN constraint_state
  CROSS JOIN private_relation_state
  CROSS JOIN predecessor_state
  CROSS JOIN delete_trigger_state
  CROSS JOIN sql173_finalization_guard_state
  CROSS JOIN target_state
), final AS MATERIALIZED (
  SELECT classified.*,
    CASE
      WHEN prerequisites_exact AND targets_absent
        THEN 'PREDECESSOR_READY'
      WHEN prerequisites_exact AND targets_exact
        THEN 'EXACT_INSTALLED'
      ELSE 'DRIFT_STOP'
    END AS installation_state
  FROM classified
)
SELECT executor_ok, relation_contracts_exact, relation_constraints_exact,
  private_relation_acls_exact, predecessor_sources_exact,
  predecessor_contracts_exact, predecessor_entry_acls_exact,
  delete_trigger_exact, sql173_finalization_guard_exact,
  target_overloads_exact, target_contracts_exact, target_sources_exact,
  target_acls_exact, target_dependencies_exact,
  targets_absent, targets_exact, prerequisites_exact,
  installation_state,
  executor_ok AND prerequisites_exact AND targets_exact
    AND installation_state = 'EXACT_INSTALLED' AS postconditions_ok
FROM final;
