-- SQL180 READ-ONLY POSTFLIGHT: require the exact installed SQL180 contract.
-- Catalog-only: no actor input and no application or receipt data is read.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH expected_prerequisite_relations(name) AS (VALUES
  ('expense_private_drafts'),
  ('expense_unconfirmed_publications'),
  ('expense_unconfirmed_publication_parties'),
  ('expense_unconfirmed_publication_audience'),
  ('expense_groups'),
  ('expense_group_members'),
  ('expenses'),
  ('expense_shares'),
  ('expense_payments')
), expected_prerequisite_functions(signature, definition_md5) AS (VALUES
  ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)',
    '14ac1abc9046fea4812ac652a9b96088'),
  ('public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)',
    'ca805bbd38dbd013e1c034e0049432ec'),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
    '58e08589a18db2a20ff406d22b98ba91'),
  ('public.expense_sql159_snapshot_is_valid(uuid)', NULL),
  ('public.expense_sql159_audience_allows(uuid,uuid)', NULL),
  ('public.expense_identity_request_id(text,uuid)', NULL),
  ('public.teskeid_event_assert_session_actor(uuid)', NULL),
  ('public.expense_assert_beta_actor(uuid)', NULL),
  ('public.expense_begin_request(uuid,uuid,text,text)', NULL),
  ('public.expense_finish_request(uuid,uuid,jsonb)', NULL),
  ('public.expense_delete_private_draft(uuid,uuid)', NULL)
), expected_targets(
  signature, old_md5, new_md5, volatility, security_definer, language_name,
  service_execute
) AS (VALUES
  ('public.expense_sql179_minor_text(bigint,text)',
    '379f360d7be9502060cd03bdca791b96', '379f360d7be9502060cd03bdca791b96', 'i'::"char", false, 'sql', false),
  ('public.expense_sql179_validate_extraction(jsonb)',
    'f8a772e5ae855cdcd8f167d56a5aa812', '5656641568455b6d2d12e5c7bdb7fbb0', 'i'::"char", false, 'sql', false),
  ('public.expense_sql179_sync_party_handles(uuid)',
    '5e858c9ad4b1322b50665df0baf7d2be', '5e858c9ad4b1322b50665df0baf7d2be', 'v'::"char", true, 'plpgsql', false),
  ('public.expense_sql179_actor_party_id(uuid,uuid)',
    '9a9d5c58f3e9535ba6f5ca9b9ebdd88e', '9a9d5c58f3e9535ba6f5ca9b9ebdd88e', 's'::"char", true, 'plpgsql', false),
  ('public.expense_receipt_prepare_upload_v1(uuid,uuid,uuid,uuid,text,text,bigint)',
    '3cbfa169848fd8d3b8d6efddc596bd2e', '3cbfa169848fd8d3b8d6efddc596bd2e', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_get_pending_upload_v1(uuid,uuid,uuid)',
    '64912329e3f252dd4115835e50fce6be', '64912329e3f252dd4115835e50fce6be', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_retry_extraction_v1(uuid,uuid)',
    '92973ca1a8b00647a937b0fcc88ebb8a', '92973ca1a8b00647a937b0fcc88ebb8a', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_apply_extraction_v1(uuid,uuid,uuid,uuid,text,bigint,text,jsonb)',
    '0e7c39fd3adf6c6e29d844390aa8ea92', 'dcd646c70b9432a37fce5833d41fc71e', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_review_v1(uuid,uuid,uuid,bigint,text,text,date,bigint,jsonb)',
    'ea559fcfa29e25917eaa15d9eaeac25c', '27862d1d7db66b074ed4702ac0b849b5', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_get_receipt_split_v1(uuid,uuid,uuid)',
    '9db8a967e8871021af92833bc6b975e8', 'fcd89fcce4959abfe6722de45e5143df', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_claim_item_v1(uuid,uuid,uuid,bigint,uuid,uuid,bigint)',
    '0f30213fe1aff135b4e5d2d67505be6e', 'd58a60029a0b68bcf0d6889ddfa8c05b', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_delete_claim_v1(uuid,uuid,uuid,bigint,uuid)',
    '43f483be0f583a0c465f2a82ab983fb2', '43f483be0f583a0c465f2a82ab983fb2', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_finalize_private_draft_v2(uuid,uuid,uuid,bigint,bigint,bigint,boolean)',
    '0f23c2605fc2e6d93368c7d7655903ae', '80102d9fb1cecd1d48c4d557b7ea0297', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_get_image_target_v1(uuid,uuid,uuid,uuid)',
    'a1c459b840fc5a7e054a3730faa3f585', 'a1c459b840fc5a7e054a3730faa3f585', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_begin_delete_v1(uuid,uuid,uuid,text)',
    '885b243cf83a6a649570861da031d64c', '885b243cf83a6a649570861da031d64c', 'v'::"char", true, 'plpgsql', true),
  ('public.expense_receipt_complete_delete_v1(uuid,uuid,uuid,text)',
    '6ca7a64c34a0027d75bb6e8490e95b56', '6ca7a64c34a0027d75bb6e8490e95b56', 'v'::"char", true, 'plpgsql', true)
), expected_relations(relation_name, column_names) AS (VALUES
  ('expense_receipt_splits', ARRAY[
    'draft_id','actor_user_id','upload_id','phase','object_path','original_filename',
    'declared_mime_type','declared_size_bytes','verified_mime_type',
    'verified_size_bytes','content_sha256','currency','title','incurred_on',
    'receipt_total_minor','version','raw_deleted_at','confirmed_group_id',
    'confirmed_expense_id','delete_scope','phase_before_delete','created_at','updated_at'
  ]::text[]),
  ('expense_receipt_items', ARRAY[
    'draft_id','id','ordinal','kind','description','quantity_milli','total_minor',
    'confidence_basis_points','needs_review'
  ]::text[]),
  ('expense_receipt_claims', ARRAY[
    'draft_id','item_id','id','actor_party_id','beneficiary_party_id',
    'quantity_milli','created_at'
  ]::text[]),
  ('expense_receipt_party_handles', ARRAY[
    'draft_id','id','identity_token_hash','created_at'
  ]::text[]),
  ('expense_receipt_finalizations', ARRAY[
    'draft_id','actor_user_id','request_id','original_draft_version',
    'original_publication_version','original_receipt_version','result','created_at'
  ]::text[])
), prerequisite_state AS MATERIALIZED (
  SELECT
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    pg_catalog.to_regclass('storage.buckets') IS NOT NULL
    AND COALESCE(pg_catalog.bool_and((
      pg_catalog.to_regclass('public.' || expected.name) IS NOT NULL
    ) IS TRUE), false)
    AND (
      SELECT COALESCE(pg_catalog.bool_and((
        routine.oid IS NOT NULL
        AND (required.definition_md5 IS NULL OR pg_catalog.md5(
          pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')
        ) = required.definition_md5)
      ) IS TRUE), false)
      FROM expected_prerequisite_functions AS required
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(required.signature)
    ) AS prerequisites_exact
  FROM expected_prerequisite_relations AS expected
), predecessor_function_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.old_md5
    AND routine.prokind = 'f'
    AND routine.provolatile = expected.volatility
    AND NOT routine.proisstrict
    AND routine.prosecdef = expected.security_definer
    AND routine.proconfig = ARRAY['search_path=""']::text[]
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND language_row.lanname = expected.language_name
    AND (NOT expected.service_execute OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS required_role
      WHERE required_role.rolname = 'service_role'
    ))
    AND (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        acl.grantor::text, acl.grantee::text, acl.privilege_type,
        acl.is_grantable
      ) ORDER BY acl.grantor, acl.grantee, acl.privilege_type,
        acl.is_grantable), '[]'::jsonb)
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
    ) = (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        exact_acl.grantor::text, exact_acl.grantee::text,
        exact_acl.privilege_type, exact_acl.is_grantable
      ) ORDER BY exact_acl.grantor, exact_acl.grantee,
        exact_acl.privilege_type, exact_acl.is_grantable), '[]'::jsonb)
      FROM (
        SELECT acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
        FROM pg_catalog.aclexplode(
          pg_catalog.acldefault('f', routine.proowner)
        ) AS acl
        WHERE acl.grantee = routine.proowner
        UNION ALL
        SELECT routine.proowner, role_row.oid, 'EXECUTE'::text, false
        FROM pg_catalog.pg_roles AS role_row
        WHERE expected.service_execute AND role_row.rolname = 'service_role'
      ) AS exact_acl
    )
  ) IS TRUE), false)
  AND (
    SELECT pg_catalog.count(*) = 16
    FROM pg_catalog.pg_proc AS candidate
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = candidate.pronamespace
    WHERE namespace.nspname = 'public'
      AND candidate.proname IN (
        SELECT pg_catalog.split_part(
          pg_catalog.split_part(signature, '.', 2), '(', 1
        ) FROM expected_targets
      )
  ) AS predecessor_functions_exact
  FROM expected_targets AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), target_function_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.new_md5
    AND routine.prokind = 'f'
    AND routine.provolatile = expected.volatility
    AND NOT routine.proisstrict
    AND routine.prosecdef = expected.security_definer
    AND routine.proconfig = ARRAY['search_path=""']::text[]
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND language_row.lanname = expected.language_name
    AND (NOT expected.service_execute OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS required_role
      WHERE required_role.rolname = 'service_role'
    ))
    AND (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        acl.grantor::text, acl.grantee::text, acl.privilege_type,
        acl.is_grantable
      ) ORDER BY acl.grantor, acl.grantee, acl.privilege_type,
        acl.is_grantable), '[]'::jsonb)
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
    ) = (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        exact_acl.grantor::text, exact_acl.grantee::text,
        exact_acl.privilege_type, exact_acl.is_grantable
      ) ORDER BY exact_acl.grantor, exact_acl.grantee,
        exact_acl.privilege_type, exact_acl.is_grantable), '[]'::jsonb)
      FROM (
        SELECT acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
        FROM pg_catalog.aclexplode(
          pg_catalog.acldefault('f', routine.proowner)
        ) AS acl
        WHERE acl.grantee = routine.proowner
        UNION ALL
        SELECT routine.proowner, role_row.oid, 'EXECUTE'::text, false
        FROM pg_catalog.pg_roles AS role_row
        WHERE expected.service_execute AND role_row.rolname = 'service_role'
      ) AS exact_acl
    )
  ) IS TRUE), false)
  AND (
    SELECT pg_catalog.count(*) = 16
    FROM pg_catalog.pg_proc AS candidate
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = candidate.pronamespace
    WHERE namespace.nspname = 'public'
      AND candidate.proname IN (
        SELECT pg_catalog.split_part(
          pg_catalog.split_part(signature, '.', 2), '(', 1
        ) FROM expected_targets
      )
  ) AS target_functions_exact
  FROM expected_targets AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), target_relation_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    relation.oid IS NOT NULL
    AND relation.relkind = 'r'
    AND relation.relrowsecurity
    AND relation.relforcerowsecurity
    AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy WHERE policy.polrelid = relation.oid
    )
    AND (
      SELECT pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attnum)
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = relation.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) = expected.column_names
    AND (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        acl.grantor::text, acl.grantee::text, acl.privilege_type,
        acl.is_grantable
      ) ORDER BY acl.grantor, acl.grantee, acl.privilege_type,
        acl.is_grantable), '[]'::jsonb)
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS acl
    ) = (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        acl.grantor::text, acl.grantee::text, acl.privilege_type,
        acl.is_grantable
      ) ORDER BY acl.grantor, acl.grantee, acl.privilege_type,
        acl.is_grantable), '[]'::jsonb)
      FROM pg_catalog.aclexplode(
        pg_catalog.acldefault('r', relation.relowner)
      ) AS acl
    )
  ) IS TRUE), false) AS target_relations_exact
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
), target_trigger_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 0 AS target_triggers_exact
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE NOT trigger_row.tgisinternal
    AND trigger_row.tgrelid IN (
      SELECT pg_catalog.to_regclass('public.' || relation_name)
      FROM expected_relations
    )
), target_bucket_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    bucket.id = 'expense-receipts-private'
    AND bucket.name = 'expense-receipts-private'
    AND NOT bucket.public
    AND bucket.file_size_limit = 10485760
    AND bucket.allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
  ) IS TRUE), false) AND pg_catalog.count(*) = 1 AS target_bucket_exact
  FROM storage.buckets AS bucket
  WHERE bucket.id = 'expense-receipts-private'
), target_catalog_relation_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation.relname::text, relation.relkind::text, relation.relpersistence::text,
    relation.relreplident::text, relation.relrowsecurity, relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner)::text,
    COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      pg_catalog.pg_get_userbyid(acl.grantee)::text, acl.privilege_type,
      acl.is_grantable
    ) ORDER BY pg_catalog.pg_get_userbyid(acl.grantee)::text,
      acl.privilege_type, acl.is_grantable)
    FROM pg_catalog.aclexplode(COALESCE(
      relation.relacl, pg_catalog.acldefault('r', relation.relowner)
    )) AS acl), '[]'::jsonb)
  ) ORDER BY relation.relname::text), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (SELECT relation_name FROM expected_relations)
), target_catalog_column_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation.relname::text, attribute.attnum, attribute.attname::text,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
    attribute.attnotnull, attribute.attidentity::text, attribute.attgenerated::text,
    attribute.atthasdef,
    pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, false)
  ) ORDER BY relation.relname::text, attribute.attnum), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute.attrelid AND default_row.adnum = attribute.attnum
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (SELECT relation_name FROM expected_relations)
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
), target_catalog_constraint_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation.relname::text, constraint_row.conname::text,
    constraint_row.contype::text, constraint_row.condeferrable,
    constraint_row.condeferred, constraint_row.convalidated,
    constraint_row.connoinherit, constraint_row.conislocal,
    constraint_row.coninhcount,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
  ) ORDER BY relation.relname::text, constraint_row.conname::text), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (SELECT relation_name FROM expected_relations)
), target_catalog_index_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation.relname::text, index_relation.relname::text, access_method.amname::text,
    index_row.indisunique, index_row.indisprimary, index_row.indisexclusion,
    index_row.indimmediate, index_row.indisclustered, index_row.indisvalid,
    index_row.indisready, index_row.indislive, index_row.indisreplident,
    index_row.indnkeyatts, index_row.indnatts,
    pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
  ) ORDER BY relation.relname::text, index_relation.relname::text), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (SELECT relation_name FROM expected_relations)
), target_catalog_function_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    namespace.nspname::text, routine.proname::text,
    pg_catalog.pg_get_function_identity_arguments(routine.oid),
    pg_catalog.pg_get_function_result(routine.oid), routine.prokind::text,
    routine.provolatile::text, routine.proisstrict, routine.prosecdef,
    routine.proleakproof, routine.proparallel::text,
    pg_catalog.pg_get_userbyid(routine.proowner)::text,
    language_row.lanname::text, routine.proconfig,
    pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'),
    COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      pg_catalog.pg_get_userbyid(acl.grantee)::text, acl.privilege_type,
      acl.is_grantable
    ) ORDER BY pg_catalog.pg_get_userbyid(acl.grantee)::text,
      acl.privilege_type, acl.is_grantable)
    FROM pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl), '[]'::jsonb)
  ) ORDER BY routine.proname::text,
    pg_catalog.pg_get_function_identity_arguments(routine.oid)), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE namespace.nspname = 'public'
    AND routine.proname IN (
      SELECT pg_catalog.split_part(pg_catalog.split_part(signature, '.', 2), '(', 1)
      FROM expected_targets
    )
), target_catalog_bucket_contract AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    bucket.id, bucket.name, bucket.public, bucket.file_size_limit,
    bucket.allowed_mime_types
  ) ORDER BY bucket.id), '[]'::jsonb) AS value
  FROM storage.buckets AS bucket
  WHERE bucket.id = 'expense-receipts-private'
), constraint_state AS MATERIALIZED (
  SELECT
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and((
      constraint_row.contype = 'c' AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred
      AND pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
          pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
          '::bigint', ''), '::text', ''), '''', ''), '[[:space:]()]', '', 'g'
      )) = 'total_minor>=-9007199254740991andtotal_minor<=9007199254740991andkind=itemandtotal_minor>0orkind<>item'
    ) IS TRUE), false) AS predecessor_constraint_exact,
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and((
      constraint_row.contype = 'c' AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred
      AND pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
          pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
          '::bigint', ''), '::text', ''), '''', ''), '[[:space:]()]', '', 'g'
      )) = 'total_minor>=-9007199254740991andtotal_minor<=9007199254740991andkind=itemandtotal_minor>=0orkind<>item'
    ) IS TRUE), false) AS target_constraint_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.expense_receipt_items')
    AND constraint_row.conname = 'expense_receipt_items_total_check'
), target_catalog_state AS MATERIALIZED (
  SELECT COALESCE(
    pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ) ~ '^teskeid:sql179:catalog-v1:[0-9]+:[0-9a-f]{32}$'
    AND pg_catalog.split_part(pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ), ':', 4) = pg_catalog.current_setting('server_version_num')
    AND pg_catalog.split_part(pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ), ':', 5) = pg_catalog.md5(pg_catalog.jsonb_build_object(
      'contract_version', 1,
      'relations', target_catalog_relation_contract.value,
      'columns', target_catalog_column_contract.value,
      'constraints', target_catalog_constraint_contract.value,
      'indexes', target_catalog_index_contract.value,
      'functions', target_catalog_function_contract.value,
      'bucket', target_catalog_bucket_contract.value
    )::text), false
  ) AS predecessor_catalog_exact,
  COALESCE(
    pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ) ~ '^teskeid:sql180:catalog-v1:[0-9]+:[0-9a-f]{32}$'
    AND pg_catalog.split_part(pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ), ':', 4) = pg_catalog.current_setting('server_version_num')
    AND pg_catalog.split_part(pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    ), ':', 5) = pg_catalog.md5(pg_catalog.jsonb_build_object(
      'contract_version', 1,
      'relations', target_catalog_relation_contract.value,
      'columns', target_catalog_column_contract.value,
      'constraints', target_catalog_constraint_contract.value,
      'indexes', target_catalog_index_contract.value,
      'functions', target_catalog_function_contract.value,
      'bucket', target_catalog_bucket_contract.value
    )::text), false
  ) AS target_catalog_exact
  FROM target_catalog_relation_contract
  CROSS JOIN target_catalog_column_contract
  CROSS JOIN target_catalog_constraint_contract
  CROSS JOIN target_catalog_index_contract
  CROSS JOIN target_catalog_function_contract
  CROSS JOIN target_catalog_bucket_contract
), classified AS (
  SELECT prerequisite_state.executor_ok,
    prerequisite_state.prerequisites_exact,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS required_role
      WHERE required_role.rolname = 'service_role'
    ) AS service_role_exists,
    predecessor_function_state.predecessor_functions_exact,
    target_function_state.target_functions_exact,
    target_relation_state.target_relations_exact,
    target_trigger_state.target_triggers_exact,
    target_bucket_state.target_bucket_exact,
    constraint_state.predecessor_constraint_exact,
    constraint_state.target_constraint_exact,
    target_catalog_state.predecessor_catalog_exact,
    target_catalog_state.target_catalog_exact,
    predecessor_function_state.predecessor_functions_exact
      AND target_relation_state.target_relations_exact
      AND target_trigger_state.target_triggers_exact
      AND target_bucket_state.target_bucket_exact
      AND constraint_state.predecessor_constraint_exact
      AND target_catalog_state.predecessor_catalog_exact AS predecessor_exact,
    target_function_state.target_functions_exact
      AND target_relation_state.target_relations_exact
      AND target_trigger_state.target_triggers_exact
      AND target_bucket_state.target_bucket_exact
      AND constraint_state.target_constraint_exact
      AND target_catalog_state.target_catalog_exact AS targets_exact
  FROM prerequisite_state
  CROSS JOIN predecessor_function_state
  CROSS JOIN target_function_state
  CROSS JOIN target_relation_state
  CROSS JOIN target_trigger_state
  CROSS JOIN target_bucket_state
  CROSS JOIN constraint_state
  CROSS JOIN target_catalog_state
)
SELECT executor_ok, prerequisites_exact, service_role_exists,
  predecessor_functions_exact, target_functions_exact,
  target_relations_exact, target_triggers_exact, target_bucket_exact,
  predecessor_constraint_exact, target_constraint_exact,
  predecessor_catalog_exact, target_catalog_exact,
  predecessor_exact, targets_exact,
  CASE WHEN targets_exact THEN 'EXACT_INSTALLED' ELSE 'DRIFT_STOP' END AS installation_state,
  executor_ok AND prerequisites_exact AND service_role_exists
    AND targets_exact AS postconditions_ok
FROM classified;

ROLLBACK;
