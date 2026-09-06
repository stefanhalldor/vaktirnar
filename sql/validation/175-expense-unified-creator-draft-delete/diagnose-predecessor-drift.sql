-- SQL175 DIAGNOSTIC: expand only constraint and predecessor-contract drift.
--
-- This query is 100% pg_catalog read-only. It never reads an application row,
-- invokes an application function, changes catalog state, or calls a delete RPC.
-- It returns only mismatching catalog fields plus unexpected/count evidence.
WITH expected_predecessor(
  signature,
  function_name,
  expected_arguments,
  expected_result,
  expected_volatility,
  expected_security_definer,
  expected_language
) AS MATERIALIZED (
  VALUES
    ('public.expense_has_beta_access(uuid)',
      'expense_has_beta_access', 'p_user_id uuid', 'boolean', 's', true, 'sql'),
    ('public.expense_assert_beta_actor(uuid)',
      'expense_assert_beta_actor', 'p_actor_id uuid', 'void', 's', true, 'plpgsql'),
    ('public.expense_begin_request(uuid,uuid,text,text)',
      'expense_begin_request',
      'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',
      'jsonb', 'v', true, 'plpgsql'),
    ('public.expense_finish_request(uuid,uuid,jsonb)',
      'expense_finish_request',
      'p_actor_id uuid, p_request_id uuid, p_result jsonb',
      'void', 'v', true, 'plpgsql'),
    ('public.expense_identity_request_id(text,uuid)',
      'expense_identity_request_id', 'p_scope text, p_request_id uuid',
      'uuid', 'i', true, 'sql'),
    ('public.teskeid_event_assert_session_actor(uuid)',
      'teskeid_event_assert_session_actor', 'p_actor_id uuid',
      'void', 's', true, 'plpgsql'),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)',
      'teskeid_event_finish_request',
      'p_actor_id uuid, p_request_id uuid, p_result jsonb',
      'void', 'v', true, 'plpgsql'),
    ('public.expense_sql159_amount_minor(text,text,boolean)',
      'expense_sql159_amount_minor',
      'p_raw text, p_currency text, p_allow_zero boolean',
      'bigint', 'i', false, 'plpgsql'),
    ('public.expense_sql159_probe_event_id(uuid,uuid)',
      'expense_sql159_probe_event_id', 'p_actor_id uuid, p_draft_id uuid',
      'uuid', 's', true, 'plpgsql'),
    ('public.expense_sql159_event_scope_read_only(uuid,uuid)',
      'expense_sql159_event_scope_read_only',
      'p_actor_id uuid, p_event_id uuid', 'jsonb', 's', true, 'plpgsql'),
    ('public.expense_sql159_event_scope_allows(uuid,uuid)',
      'expense_sql159_event_scope_allows',
      'p_actor_id uuid, p_event_id uuid', 'boolean', 's', true, 'plpgsql'),
    ('public.expense_sql159_audience_allows(uuid,uuid)',
      'expense_sql159_audience_allows',
      'p_actor_id uuid, p_draft_id uuid', 'boolean', 's', true, 'sql'),
    ('public.expense_sql159_guard_private_draft_delete()',
      'expense_sql159_guard_private_draft_delete',
      '', 'trigger', 'v', true, 'plpgsql'),
    ('public.expense_validate_finalization_expense_reference()',
      'expense_validate_finalization_expense_reference',
      '', 'trigger', 'v', true, 'plpgsql'),
    ('public.expense_sql159_snapshot_is_valid(uuid)',
      'expense_sql159_snapshot_is_valid',
      'p_draft_id uuid', 'boolean', 's', true, 'sql'),
    ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)',
      'expense_sql159_private_event_summary',
      'p_actor_id uuid, p_draft_id uuid, p_event_id uuid',
      'jsonb', 's', true, 'plpgsql'),
    ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)',
      'expense_sql159_normalize_private_draft',
      'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean',
      'jsonb', 'v', true, 'plpgsql'),
    ('public.expense_list_group_shared_drafts(uuid,uuid)',
      'expense_list_group_shared_drafts',
      'p_actor_id uuid, p_group_id uuid', 'jsonb', 'v', true, 'plpgsql'),
    ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)',
      'teskeid_event_get_expense_pre_active_v1',
      'p_actor_id uuid, p_event_id uuid', 'jsonb', 'v', true, 'plpgsql'),
    ('public.expense_get_shared_draft_detail(uuid,uuid)',
      'expense_get_shared_draft_detail',
      'p_actor_id uuid, p_publication_id uuid',
      'jsonb', 'v', true, 'plpgsql'),
    ('public.expense_get_own_delete_capability(uuid,uuid)',
      'expense_get_own_delete_capability',
      'p_actor_id uuid, p_expense_id uuid', 'jsonb', 's', true, 'plpgsql'),
    ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)',
      'expense_delete_own_unsettled_expense',
      'p_actor_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_request_id uuid',
      'jsonb', 'v', true, 'plpgsql'),
    ('public.expense_hard_delete_receipt_shape_known(text,jsonb)',
      'expense_hard_delete_receipt_shape_known',
      'p_operation text, p_result jsonb', 'boolean', 'i', true, 'sql'),
    ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])',
      'expense_hard_delete_receipts_classified',
      'p_expense_id uuid, p_group_id uuid, p_one_off boolean, p_invitation_ids uuid[]',
      'boolean', 's', true, 'plpgsql')
), observed_predecessor AS MATERIALIZED (
  SELECT expected.*,
    routine.oid,
    routine.prokind::text AS actual_kind,
    routine.proargmodes::text AS actual_argmodes,
    pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
    pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
    routine.proretset AS actual_returns_set,
    routine.provolatile::text AS actual_volatility,
    routine.prosecdef AS actual_security_definer,
    routine.proisstrict AS actual_strict,
    routine.proleakproof AS actual_leakproof,
    routine.proparallel::text AS actual_parallel,
    routine.pronargdefaults AS actual_default_count,
    routine.proargdefaults IS NULL AS actual_argdefaults_null,
    routine.proallargtypes IS NULL AS actual_allargtypes_null,
    routine.provariadic AS actual_variadic,
    pg_catalog.array_to_string(routine.proconfig, ',') AS actual_proconfig,
    owner_role.rolname AS actual_owner,
    language_row.lanname AS actual_language,
    (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = expected.function_name
    ) AS actual_overload_count
  FROM expected_predecessor AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), predecessor_mismatch AS MATERIALIZED (
  SELECT 'predecessor_contract'::text AS category,
    observed.signature AS object_name,
    field_check.check_name,
    field_check.expected_value,
    field_check.actual_value,
    NULL::text AS actual_detail
  FROM observed_predecessor AS observed
  CROSS JOIN LATERAL (
    VALUES
      ('exists', 'true', (observed.oid IS NOT NULL)::text,
        true),
      ('kind', 'f', observed.actual_kind,
        observed.oid IS NOT NULL),
      ('argmodes', '<null>', COALESCE(observed.actual_argmodes, '<null>'),
        observed.oid IS NOT NULL),
      ('arguments', observed.expected_arguments, observed.actual_arguments,
        observed.oid IS NOT NULL),
      ('result', observed.expected_result, observed.actual_result,
        observed.oid IS NOT NULL),
      ('returns_set', 'false', observed.actual_returns_set::text,
        observed.oid IS NOT NULL),
      ('volatility', observed.expected_volatility,
        observed.actual_volatility, observed.oid IS NOT NULL),
      ('security_definer', observed.expected_security_definer::text,
        observed.actual_security_definer::text, observed.oid IS NOT NULL),
      ('strict', (observed.signature =
          'public.expense_identity_request_id(text,uuid)')::text,
        observed.actual_strict::text,
        observed.oid IS NOT NULL),
      ('leakproof', 'false', observed.actual_leakproof::text,
        observed.oid IS NOT NULL),
      ('parallel', 'u', observed.actual_parallel,
        observed.oid IS NOT NULL),
      ('default_count', '0', observed.actual_default_count::text,
        observed.oid IS NOT NULL),
      ('argdefaults_null', 'true', observed.actual_argdefaults_null::text,
        observed.oid IS NOT NULL),
      ('allargtypes_null', 'true', observed.actual_allargtypes_null::text,
        observed.oid IS NOT NULL),
      ('variadic_oid', '0', observed.actual_variadic::text,
        observed.oid IS NOT NULL),
      ('proconfig', 'search_path=""',
        COALESCE(observed.actual_proconfig, '<null>'),
        observed.oid IS NOT NULL),
      ('owner', 'postgres', observed.actual_owner,
        observed.oid IS NOT NULL),
      ('language', observed.expected_language, observed.actual_language,
        observed.oid IS NOT NULL),
      ('overload_count', '1', observed.actual_overload_count::text,
        true)
  ) AS field_check(
    check_name, expected_value, actual_value, applies
  )
  WHERE field_check.applies
    AND field_check.expected_value IS DISTINCT FROM field_check.actual_value
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
), observed_expected_constraint AS MATERIALIZED (
  SELECT expected.*,
    constraint_row.oid,
    constraint_row.contype::text AS actual_type,
    constraint_row.convalidated AS actual_validated,
    constraint_row.condeferrable AS actual_deferrable,
    constraint_row.condeferred AS actual_deferred,
    constraint_row.connoinherit AS actual_noinherit,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS actual_definition,
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
), expected_constraint_mismatch AS MATERIALIZED (
  SELECT 'relation_constraint'::text AS category,
    observed.relation_name || '.' || observed.constraint_name AS object_name,
    field_check.check_name,
    field_check.expected_value,
    field_check.actual_value,
    CASE WHEN field_check.check_name = 'definition_hash'
      THEN observed.actual_definition ELSE NULL::text END AS actual_detail
  FROM observed_expected_constraint AS observed
  CROSS JOIN LATERAL (
    VALUES
      ('exists', 'true', (observed.oid IS NOT NULL)::text,
        true),
      ('type', observed.constraint_type, observed.actual_type,
        observed.oid IS NOT NULL),
      ('validated', 'true', observed.actual_validated::text,
        observed.oid IS NOT NULL),
      ('deferrable', 'false', observed.actual_deferrable::text,
        observed.oid IS NOT NULL),
      ('deferred', 'false', observed.actual_deferred::text,
        observed.oid IS NOT NULL),
      ('noinherit', (observed.constraint_type IN ('p', 'u', 'f'))::text,
        observed.actual_noinherit::text,
        observed.oid IS NOT NULL),
      ('definition_hash', observed.definition_hash,
        observed.actual_definition_hash, observed.oid IS NOT NULL)
  ) AS field_check(
    check_name, expected_value, actual_value, applies
  )
  WHERE field_check.applies
    AND field_check.expected_value IS DISTINCT FROM field_check.actual_value
), protected_relation(relation_name) AS MATERIALIZED (
  VALUES
    ('expense_private_drafts'),
    ('expense_unconfirmed_publications'),
    ('expense_unconfirmed_publication_parties'),
    ('expense_unconfirmed_publication_audience'),
    ('expense_unconfirmed_finalizations'),
    ('expense_private_draft_tombstones'),
    ('expense_mutation_requests'),
    ('teskeid_event_mutation_requests')
), actual_protected_constraint AS MATERIALIZED (
  SELECT relation.relname AS relation_name,
    constraint_row.conname AS constraint_name,
    constraint_row.contype::text AS actual_type,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS actual_definition,
    pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_row.oid),
        '::[a-z0-9_.]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'),
      'public.', ''
    ))) AS actual_definition_hash
  FROM protected_relation AS protected
  JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = pg_catalog.to_regnamespace('public')
   AND relation.relname = protected.relation_name
  JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = relation.oid
   AND constraint_row.contype IN ('c','f','p','u','x')
), unexpected_constraint AS MATERIALIZED (
  SELECT 'relation_constraint'::text AS category,
    actual.relation_name || '.' || actual.constraint_name AS object_name,
    CASE WHEN actual.relation_name = 'expense_unconfirmed_finalizations'
        AND actual.constraint_name =
          'expense_unconfirmed_finalizations_expense_fk'
      THEN 'obsolete_constraint_present'
      ELSE 'unexpected_constraint' END AS check_name,
    '<absent>'::text AS expected_value,
    actual.actual_type || ':' || actual.actual_definition_hash AS actual_value,
    actual.actual_definition AS actual_detail
  FROM actual_protected_constraint AS actual
  LEFT JOIN expected_constraint AS expected
    ON expected.relation_name = actual.relation_name
   AND expected.constraint_name = actual.constraint_name
  WHERE expected.constraint_name IS NULL
), constraint_count_mismatch AS MATERIALIZED (
  SELECT 'relation_constraint'::text AS category,
    '<eight protected relations>'::text AS object_name,
    'constraint_count'::text AS check_name,
    '52'::text AS expected_value,
    pg_catalog.count(*)::text AS actual_value,
    NULL::text AS actual_detail
  FROM actual_protected_constraint
  HAVING pg_catalog.count(*) <> 52
), all_mismatch AS MATERIALIZED (
  SELECT * FROM predecessor_mismatch
  UNION ALL
  SELECT * FROM expected_constraint_mismatch
  UNION ALL
  SELECT * FROM unexpected_constraint
  UNION ALL
  SELECT * FROM constraint_count_mismatch
)
SELECT category, object_name, check_name,
  expected_value, actual_value, actual_detail
FROM all_mismatch
ORDER BY category, object_name, check_name;
