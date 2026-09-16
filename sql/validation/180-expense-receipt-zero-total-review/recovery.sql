-- SQL180 RECOVERY: restore exact SQL179 functions after an operator-confirmed rollback decision.
-- Stop unless SQL180 is exact and no preserved zero-total items exist. Stebbi alone runs SQL.
BEGIN;
SET LOCAL search_path = '';
SET LOCAL lock_timeout = '5s';

DO $sql180_recovery_guard$
DECLARE
  v_executor_ok boolean;
  v_prerequisites_exact boolean;
  v_service_role_exists boolean;
  v_targets_exact boolean;
BEGIN
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
  SELECT executor_ok, prerequisites_exact, service_role_exists, targets_exact
  INTO v_executor_ok, v_prerequisites_exact, v_service_role_exists, v_targets_exact
  FROM classified;

  IF NOT COALESCE(v_executor_ok AND v_prerequisites_exact
    AND v_service_role_exists AND v_targets_exact, false) THEN
    RAISE EXCEPTION 'SQL180 recovery target catalog drift';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_receipt_items AS item
    WHERE item.kind = 'item' AND item.total_minor = 0
  ) THEN
    RAISE EXCEPTION 'SQL180 recovery blocked by preserved zero-total items';
  END IF;
END;
$sql180_recovery_guard$;

ALTER TABLE public.expense_receipt_items
  DROP CONSTRAINT expense_receipt_items_total_check;
ALTER TABLE public.expense_receipt_items
  ADD CONSTRAINT expense_receipt_items_total_check CHECK (
    total_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND ((kind = 'item' AND total_minor > 0) OR kind <> 'item')
  );
CREATE OR REPLACE FUNCTION public.expense_sql179_validate_extraction(p_extraction jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT coalesce(
    pg_catalog.jsonb_typeof(p_extraction) = 'object'
    AND p_extraction - ARRAY[
      'title', 'currency', 'incurred_on', 'receipt_total_minor', 'items'
    ]::text[] = '{}'::jsonb
    AND p_extraction ?& ARRAY[
      'title', 'currency', 'incurred_on', 'receipt_total_minor', 'items'
    ]
    AND pg_catalog.char_length(pg_catalog.btrim(p_extraction->>'title'))
      BETWEEN 1 AND 200
    AND p_extraction->>'currency' IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
    AND p_extraction->>'incurred_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND p_extraction->>'receipt_total_minor' ~ '^[0-9]+$'
    AND (p_extraction->>'receipt_total_minor')::numeric
      BETWEEN 1 AND 9007199254740991
    AND pg_catalog.jsonb_typeof(p_extraction->'items') = 'array'
    AND pg_catalog.jsonb_array_length(p_extraction->'items') BETWEEN 1 AND 100
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_extraction->'items') AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
         OR item.value - ARRAY[
           'kind', 'description', 'quantity_milli', 'total_minor',
           'confidence_basis_points', 'needs_review'
         ]::text[] <> '{}'::jsonb
         OR NOT (item.value ?& ARRAY[
           'kind', 'description', 'quantity_milli', 'total_minor',
           'confidence_basis_points', 'needs_review'
         ])
         OR item.value->>'kind' NOT IN ('item', 'discount', 'tax', 'tip')
         OR pg_catalog.char_length(pg_catalog.btrim(item.value->>'description'))
           NOT BETWEEN 1 AND 200
         OR item.value->>'quantity_milli' !~ '^[0-9]+$'
         OR (item.value->>'quantity_milli')::numeric NOT BETWEEN 1 AND 1000000
         OR (item.value->>'kind' <> 'item'
           AND item.value->>'quantity_milli' <> '1000')
         OR item.value->>'total_minor' !~ '^-?[0-9]+$'
         OR pg_catalog.abs((item.value->>'total_minor')::numeric)
           > 9007199254740991
         OR (item.value->>'kind' = 'item'
           AND (item.value->>'total_minor')::numeric <= 0)
         OR item.value->>'confidence_basis_points' !~ '^[0-9]+$'
         OR (item.value->>'confidence_basis_points')::numeric NOT BETWEEN 0 AND 10000
         OR pg_catalog.jsonb_typeof(item.value->'needs_review') <> 'boolean'
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.expense_receipt_apply_extraction_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_upload_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint,
  p_content_sha256 text,
  p_extraction jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_total bigint;
  v_currency text;
  v_title text;
  v_date date;
  v_item record;
  v_ordinal integer := 0;
  v_self_key text;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_upload_id IS NULL
     OR p_verified_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_verified_size_bytes NOT BETWEEN 1 AND 10485760
     OR p_content_sha256 !~ '^[0-9a-f]{64}$'
     OR NOT public.expense_sql179_validate_extraction(p_extraction) THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
    AND receipt.actor_user_id = p_actor_id
    AND receipt.upload_id = p_upload_id
    AND receipt.phase = 'extracting'
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL
     OR v_receipt.declared_mime_type <> p_verified_mime_type
     OR v_receipt.declared_size_bytes <> p_verified_size_bytes THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  SELECT member.value->>'key' INTO v_self_key
  FROM pg_catalog.jsonb_array_elements(v_draft.payload->'members') AS member(value)
  WHERE member.value->>'isSelf' = 'true';
  IF v_self_key IS NULL THEN RAISE EXCEPTION 'expense_receipt_invalid_draft'; END IF;
  v_total := (p_extraction->>'receipt_total_minor')::bigint;
  v_currency := p_extraction->>'currency';
  v_title := pg_catalog.btrim(p_extraction->>'title');
  v_date := (p_extraction->>'incurred_on')::date;
  DELETE FROM public.expense_receipt_items AS item WHERE item.draft_id = p_draft_id;
  FOR v_item IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_extraction->'items')
  LOOP
    v_ordinal := v_ordinal + 1;
    INSERT INTO public.expense_receipt_items(
      draft_id, ordinal, kind, description, quantity_milli, total_minor,
      confidence_basis_points, needs_review
    ) VALUES (
      p_draft_id, v_ordinal, v_item.value->>'kind',
      pg_catalog.btrim(v_item.value->>'description'),
      (v_item.value->>'quantity_milli')::bigint,
      (v_item.value->>'total_minor')::bigint,
      (v_item.value->>'confidence_basis_points')::integer,
      (v_item.value->>'needs_review')::boolean
    );
  END LOOP;
  UPDATE public.expense_private_drafts AS draft
  SET payload = pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              pg_catalog.jsonb_set(
                pg_catalog.jsonb_set(
                  pg_catalog.jsonb_set(
                    draft.payload, '{title}', pg_catalog.to_jsonb(v_title)
                  ),
                  '{currency}', pg_catalog.to_jsonb(v_currency)
                ),
                '{incurredOn}', pg_catalog.to_jsonb(pg_catalog.to_char(v_date, 'YYYY-MM-DD'))
              ),
              '{total}', pg_catalog.to_jsonb(
                public.expense_sql179_minor_text(v_total, v_currency)
              )
            ),
            '{splitMethod}', '"fixed"'::jsonb
          ),
          '{payments}', pg_catalog.jsonb_build_object(
            v_self_key, public.expense_sql179_minor_text(v_total, v_currency)
          )
        ),
        '{amounts}', pg_catalog.jsonb_build_object(
          v_self_key, public.expense_sql179_minor_text(v_total, v_currency)
        )
      ),
      version = draft.version + 1,
      updated_at = pg_catalog.now()
  WHERE draft.id = p_draft_id;
  UPDATE public.expense_receipt_splits AS receipt
  SET phase = 'review',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      content_sha256 = p_content_sha256,
      currency = v_currency,
      title = v_title,
      incurred_on = v_date,
      receipt_total_minor = v_total,
      version = receipt.version + 1,
      updated_at = pg_catalog.now()
  WHERE receipt.draft_id = p_draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'draft_id', p_draft_id,
    'receipt_version', v_receipt.version + 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_receipt_review_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_receipt_version bigint,
  p_title text,
  p_currency text,
  p_incurred_on date,
  p_receipt_total_minor bigint,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_item record;
  v_count integer;
  v_self_key text;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_receipt_version NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title, '')))
       NOT BETWEEN 1 AND 200
     OR p_currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
     OR p_incurred_on IS NULL
     OR p_receipt_total_minor NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.jsonb_typeof(p_items) <> 'array'
     OR pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
          OR item.value - ARRAY[
            'id', 'kind', 'description', 'quantity_milli', 'total_minor'
          ]::text[] <> '{}'::jsonb
          OR NOT (item.value ?& ARRAY[
            'id', 'kind', 'description', 'quantity_milli', 'total_minor'
          ])
          OR item.value->>'id'
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR item.value->>'kind' NOT IN ('item', 'discount', 'tax', 'tip')
          OR pg_catalog.char_length(pg_catalog.btrim(item.value->>'description'))
            NOT BETWEEN 1 AND 200
          OR item.value->>'quantity_milli' !~ '^[0-9]+$'
          OR (item.value->>'quantity_milli')::numeric NOT BETWEEN 1 AND 1000000
          OR (item.value->>'kind' <> 'item'
            AND item.value->>'quantity_milli' <> '1000')
          OR item.value->>'total_minor' !~ '^-?[0-9]+$'
          OR pg_catalog.abs((item.value->>'total_minor')::numeric)
            > 9007199254740991
          OR (item.value->>'kind' = 'item'
            AND (item.value->>'total_minor')::numeric <= 0)
     ) THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
  FOR UPDATE;
  IF coalesce(v_publication.is_live, false) THEN
    RAISE EXCEPTION 'expense_receipt_already_shared';
  END IF;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
    AND receipt.actor_user_id = p_actor_id
    AND receipt.phase = 'review'
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  IF v_receipt.version <> p_expected_receipt_version THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  SELECT member.value->>'key' INTO v_self_key
  FROM pg_catalog.jsonb_array_elements(v_draft.payload->'members') AS member(value)
  WHERE member.value->>'isSelf' = 'true';
  IF v_self_key IS NULL THEN RAISE EXCEPTION 'expense_receipt_invalid_draft'; END IF;
  SELECT pg_catalog.count(*) INTO v_count
  FROM public.expense_receipt_items AS item
  WHERE item.draft_id = p_draft_id;
  IF v_count <> pg_catalog.jsonb_array_length(p_items)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_items) AS supplied(value)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.expense_receipt_items AS current_item
         WHERE current_item.draft_id = p_draft_id
           AND current_item.id = (supplied.value->>'id')::uuid
       )
     )
     OR (
       SELECT pg_catalog.count(DISTINCT value->>'id')
       FROM pg_catalog.jsonb_array_elements(p_items)
     ) <> v_count THEN
    RAISE EXCEPTION 'expense_receipt_item_set_conflict';
  END IF;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    UPDATE public.expense_receipt_items AS item
    SET kind = v_item.value->>'kind',
        description = pg_catalog.btrim(v_item.value->>'description'),
        quantity_milli = (v_item.value->>'quantity_milli')::bigint,
        total_minor = (v_item.value->>'total_minor')::bigint,
        confidence_basis_points = 10000,
        needs_review = false
    WHERE item.draft_id = p_draft_id
      AND item.id = (v_item.value->>'id')::uuid;
  END LOOP;
  UPDATE public.expense_private_drafts AS draft
  SET payload = pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              pg_catalog.jsonb_set(
                pg_catalog.jsonb_set(
                  pg_catalog.jsonb_set(
                    draft.payload, '{title}',
                    pg_catalog.to_jsonb(pg_catalog.btrim(p_title))
                  ),
                  '{currency}', pg_catalog.to_jsonb(p_currency)
                ),
                '{incurredOn}',
                pg_catalog.to_jsonb(pg_catalog.to_char(p_incurred_on, 'YYYY-MM-DD'))
              ),
              '{total}', pg_catalog.to_jsonb(
                public.expense_sql179_minor_text(p_receipt_total_minor, p_currency)
              )
            ),
            '{splitMethod}', '"fixed"'::jsonb
          ),
          '{payments}', pg_catalog.jsonb_build_object(
            v_self_key,
            public.expense_sql179_minor_text(p_receipt_total_minor, p_currency)
          )
        ),
        '{amounts}', pg_catalog.jsonb_build_object(
          v_self_key,
          public.expense_sql179_minor_text(p_receipt_total_minor, p_currency)
        )
      ),
      version = draft.version + 1,
      updated_at = pg_catalog.now()
  WHERE draft.id = p_draft_id;
  DELETE FROM public.expense_receipt_claims AS claim WHERE claim.draft_id = p_draft_id;
  UPDATE public.expense_receipt_splits AS receipt
  SET currency = p_currency,
      title = pg_catalog.btrim(p_title),
      incurred_on = p_incurred_on,
      receipt_total_minor = p_receipt_total_minor,
      version = receipt.version + 1,
      updated_at = pg_catalog.now()
  WHERE receipt.draft_id = p_draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'draft_id', p_draft_id,
    'receipt_version', v_receipt.version + 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_receipt_split_v1(
  p_actor_id uuid,
  p_draft_id uuid DEFAULT NULL,
  p_publication_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_actor_party_id uuid;
  v_parties jsonb;
  v_items jsonb;
  v_claims jsonb;
  v_items_total bigint;
  v_all_claimed boolean;
BEGIN
  IF p_actor_id IS NULL OR (p_draft_id IS NULL) = (p_publication_id IS NULL) THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_draft_id IS NOT NULL THEN
    SELECT receipt.* INTO v_receipt
    FROM public.expense_receipt_splits AS receipt
    JOIN public.expense_private_drafts AS draft
      ON draft.id = receipt.draft_id
     AND draft.actor_user_id = p_actor_id
    WHERE receipt.draft_id = p_draft_id;
  ELSE
    SELECT publication.* INTO v_publication
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.publication_id = p_publication_id
      AND publication.is_live
      AND public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
      AND public.expense_sql159_snapshot_is_valid(publication.draft_id);
    IF v_publication.draft_id IS NOT NULL THEN
      SELECT receipt.* INTO v_receipt
      FROM public.expense_receipt_splits AS receipt
      WHERE receipt.draft_id = v_publication.draft_id;
    END IF;
  END IF;
  IF v_receipt.draft_id IS NULL
     OR (p_draft_id IS NOT NULL
       AND v_receipt.phase NOT IN ('uploading', 'extracting', 'review', 'deleting'))
     OR (p_publication_id IS NOT NULL AND v_receipt.phase <> 'review') THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
  END IF;
  IF v_receipt.phase <> 'deleting' THEN
    SELECT publication.* INTO v_publication
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.draft_id = v_receipt.draft_id
      AND publication.is_live
      AND public.expense_sql159_snapshot_is_valid(publication.draft_id);
  END IF;
  IF v_publication.draft_id IS NOT NULL THEN
    PERFORM public.expense_sql179_sync_party_handles(v_receipt.draft_id);
    v_actor_party_id := public.expense_sql179_actor_party_id(
      p_actor_id, v_receipt.draft_id
    );
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'token', handle.id,
      'display_name', party.display_name,
      'is_self', handle.id = v_actor_party_id
    ) ORDER BY party.ordinal
  ), '[]'::jsonb) INTO v_parties
  FROM public.expense_unconfirmed_publication_parties AS party
  JOIN public.expense_receipt_party_handles AS handle
    ON handle.draft_id = party.draft_id
   AND handle.identity_token_hash = party.identity_token_hash
  WHERE party.draft_id = v_receipt.draft_id
    AND party.is_participant
    AND v_publication.draft_id IS NOT NULL;
  SELECT coalesce(pg_catalog.sum(item.total_minor), 0),
    coalesce(pg_catalog.bool_and(
      item.kind <> 'item' OR coalesce(claimed.quantity_milli, 0)
        = item.quantity_milli
    ), false),
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'ordinal', item.ordinal,
        'kind', item.kind,
        'description', item.description,
        'quantity_milli', item.quantity_milli,
        'total_minor', item.total_minor,
        'claimable', item.kind = 'item',
        'claimed_quantity_milli', coalesce(claimed.quantity_milli, 0),
        'remaining_quantity_milli', CASE WHEN item.kind = 'item'
          THEN item.quantity_milli - coalesce(claimed.quantity_milli, 0)
          ELSE 0 END
      ) ORDER BY item.ordinal
    ), '[]'::jsonb)
  INTO v_items_total, v_all_claimed, v_items
  FROM public.expense_receipt_items AS item
  LEFT JOIN (
    SELECT claim.item_id, pg_catalog.sum(claim.quantity_milli) AS quantity_milli
    FROM public.expense_receipt_claims AS claim
    WHERE claim.draft_id = v_receipt.draft_id
    GROUP BY claim.item_id
  ) AS claimed ON claimed.item_id = item.id
  WHERE item.draft_id = v_receipt.draft_id;
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', claim.id,
      'item_id', claim.item_id,
      'actor_token', claim.actor_party_id,
      'beneficiary_token', claim.beneficiary_party_id,
      'quantity_milli', claim.quantity_milli,
      'created_at', claim.created_at
    ) ORDER BY claim.created_at, claim.id
  ), '[]'::jsonb) INTO v_claims
  FROM public.expense_receipt_claims AS claim
  WHERE claim.draft_id = v_receipt.draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'draft_id', v_receipt.draft_id,
    'publication_id', v_publication.publication_id,
    'receipt_version', v_receipt.version,
    'phase', CASE WHEN v_receipt.phase = 'deleting' THEN 'deleting'
      WHEN v_publication.draft_id IS NOT NULL THEN 'claiming'
      ELSE v_receipt.phase END,
    'delete_scope', v_receipt.delete_scope,
    'image_available', v_receipt.object_path IS NOT NULL
      AND v_receipt.phase <> 'deleting',
    'title', v_receipt.title,
    'incurred_on', CASE WHEN v_receipt.incurred_on IS NULL THEN NULL
      ELSE pg_catalog.to_char(v_receipt.incurred_on, 'YYYY-MM-DD') END,
    'currency', v_receipt.currency,
    'receipt_total_minor', v_receipt.receipt_total_minor,
    'items_total_minor', CASE WHEN v_receipt.currency IS NULL THEN NULL
      ELSE v_items_total END,
    'total_matches', v_receipt.receipt_total_minor IS NOT NULL
      AND v_receipt.receipt_total_minor = v_items_total,
    'all_claimed', v_all_claimed,
    'is_author', v_receipt.actor_user_id = p_actor_id,
    'can_claim', v_publication.draft_id IS NOT NULL
      AND v_actor_party_id IS NOT NULL,
    'parties', v_parties,
    'items', v_items,
    'claims', CASE WHEN v_receipt.phase = 'deleting' THEN '[]'::jsonb
      ELSE v_claims END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_receipt_claim_item_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_publication_id uuid,
  p_expected_receipt_version bigint,
  p_item_id uuid,
  p_beneficiary_token uuid,
  p_quantity_milli bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_candidate_draft_id uuid;
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_item public.expense_receipt_items%ROWTYPE;
  v_actor_party_id uuid;
  v_beneficiary_hash text;
  v_claimed bigint;
  v_claim_id uuid := pg_catalog.gen_random_uuid();
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_publication_id IS NULL
     OR p_expected_receipt_version NOT BETWEEN 1 AND 9007199254740991
     OR p_item_id IS NULL OR p_beneficiary_token IS NULL
     OR p_quantity_milli NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_receipt_claim_item_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_object(
      'publicationId', p_publication_id,
      'receiptVersion', p_expected_receipt_version,
      'itemId', p_item_id,
      'beneficiary', p_beneficiary_token,
      'quantityMilli', p_quantity_milli
    )::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT publication.draft_id INTO v_candidate_draft_id
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.publication_id = p_publication_id
    AND publication.is_live;
  IF v_candidate_draft_id IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_not_found';
  END IF;
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = v_candidate_draft_id
  FOR UPDATE;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.publication_id = p_publication_id
    AND publication.draft_id = v_candidate_draft_id
    AND publication.is_live
  FOR UPDATE;
  IF v_draft.id IS NULL OR v_publication.draft_id IS NULL
     OR NOT public.expense_sql159_audience_allows(p_actor_id, v_publication.draft_id)
     OR NOT public.expense_sql159_snapshot_is_valid(v_publication.draft_id) THEN
    RAISE EXCEPTION 'expense_receipt_not_found';
  END IF;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = v_publication.draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = v_publication.draft_id ORDER BY audience.user_id FOR UPDATE;
  PERFORM public.expense_sql179_sync_party_handles(v_publication.draft_id);
  v_actor_party_id := public.expense_sql179_actor_party_id(
    p_actor_id, v_publication.draft_id
  );
  SELECT handle.identity_token_hash INTO v_beneficiary_hash
  FROM public.expense_receipt_party_handles AS handle
  JOIN public.expense_unconfirmed_publication_parties AS party
    ON party.draft_id = handle.draft_id
   AND party.identity_token_hash = handle.identity_token_hash
   AND party.is_participant
  WHERE handle.draft_id = v_publication.draft_id
    AND handle.id = p_beneficiary_token;
  IF v_actor_party_id IS NULL OR v_beneficiary_hash IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_not_allowed';
  END IF;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = v_publication.draft_id
    AND receipt.phase = 'review'
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  IF v_receipt.version <> p_expected_receipt_version THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  SELECT item.* INTO v_item
  FROM public.expense_receipt_items AS item
  WHERE item.draft_id = v_receipt.draft_id
    AND item.id = p_item_id
    AND item.kind = 'item'
  FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  SELECT coalesce(pg_catalog.sum(claim.quantity_milli), 0)
  INTO v_claimed
  FROM public.expense_receipt_claims AS claim
  WHERE claim.draft_id = v_receipt.draft_id
    AND claim.item_id = p_item_id;
  IF v_claimed + p_quantity_milli > v_item.quantity_milli THEN
    RAISE EXCEPTION 'expense_receipt_claim_exceeds_remaining';
  END IF;
  INSERT INTO public.expense_receipt_claims(
    draft_id, item_id, id, actor_party_id, beneficiary_party_id, quantity_milli
  ) VALUES (
    v_receipt.draft_id, p_item_id, v_claim_id, v_actor_party_id,
    p_beneficiary_token, p_quantity_milli
  );
  UPDATE public.expense_receipt_splits AS receipt
  SET version = receipt.version + 1, updated_at = pg_catalog.now()
  WHERE receipt.draft_id = v_receipt.draft_id;
  v_result := pg_catalog.jsonb_build_object(
    'claim_id', v_claim_id,
    'receipt_version', v_receipt.version + 1
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_finalize_private_draft_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint,
  p_expected_receipt_version bigint,
  p_split_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_replay public.expense_receipt_finalizations%ROWTYPE;
  v_line_total bigint;
  v_claimable_total bigint;
  v_adjustment bigint;
  v_shares jsonb;
  v_amounts jsonb;
  v_payments jsonb;
  v_author_key text;
  v_new_draft_version bigint;
  v_new_publication_version bigint;
  v_share_result jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR p_split_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_unconfirmed_confirmation_required';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT finalization.* INTO v_replay
  FROM public.expense_receipt_finalizations AS finalization
  WHERE finalization.actor_user_id = p_actor_id
    AND finalization.request_id = p_request_id;
  IF v_replay.draft_id IS NOT NULL THEN
    IF v_replay.draft_id IS DISTINCT FROM p_draft_id
       OR v_replay.original_draft_version IS DISTINCT FROM p_expected_draft_version
       OR v_replay.original_publication_version
         IS DISTINCT FROM p_expected_publication_version
       OR v_replay.original_receipt_version
         IS DISTINCT FROM p_expected_receipt_version THEN
      RAISE EXCEPTION 'expense_unconfirmed_request_conflict';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.expense_groups AS group_row
      JOIN public.expense_group_members AS member
        ON member.group_id = group_row.id
       AND member.user_id = p_actor_id
       AND member.status = 'active'
      JOIN public.expenses AS expense
        ON expense.group_id = group_row.id
       AND expense.id = (v_replay.result->>'expense_id')::uuid
      WHERE group_row.id = (v_replay.result->>'group_id')::uuid
    ) THEN
      RAISE EXCEPTION 'expense_unconfirmed_not_found';
    END IF;
    RETURN v_replay.result;
  END IF;
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN
    IF p_expected_receipt_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_receipt_not_found';
    END IF;
    RETURN public.expense_finalize_private_draft(
      p_actor_id, p_request_id, p_draft_id, p_expected_draft_version,
      p_expected_publication_version, p_split_confirmed
    );
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
  FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id ORDER BY audience.user_id FOR UPDATE;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL THEN
    IF p_expected_receipt_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_receipt_not_found';
    END IF;
    RETURN public.expense_finalize_private_draft(
      p_actor_id, p_request_id, p_draft_id, p_expected_draft_version,
      p_expected_publication_version, p_split_confirmed
    );
  END IF;
  IF v_receipt.actor_user_id IS DISTINCT FROM p_actor_id
     OR v_receipt.phase <> 'review'
     OR p_expected_receipt_version IS NULL
     OR v_receipt.version IS DISTINCT FROM p_expected_receipt_version THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  IF v_draft.id IS NULL OR v_draft.version <> p_expected_draft_version
     OR v_publication.draft_id IS NULL OR NOT v_publication.is_live
     OR v_publication.publication_version IS DISTINCT FROM p_expected_publication_version
     OR NOT public.expense_sql159_snapshot_is_valid(p_draft_id)
     OR v_receipt.receipt_total_minor IS NULL OR v_receipt.currency IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  PERFORM public.expense_sql179_sync_party_handles(p_draft_id);
  SELECT pg_catalog.sum(item.total_minor),
    pg_catalog.sum(item.total_minor) FILTER (WHERE item.kind = 'item'),
    coalesce(
      pg_catalog.sum(item.total_minor) FILTER (WHERE item.kind <> 'item'), 0
    )
  INTO v_line_total, v_claimable_total, v_adjustment
  FROM public.expense_receipt_items AS item
  WHERE item.draft_id = p_draft_id;
  IF v_line_total IS DISTINCT FROM v_receipt.receipt_total_minor
     OR coalesce(v_claimable_total, 0) <= 0
     OR EXISTS (
       SELECT 1
       FROM public.expense_receipt_items AS item
       LEFT JOIN (
         SELECT claim.item_id, pg_catalog.sum(claim.quantity_milli) AS quantity_milli
         FROM public.expense_receipt_claims AS claim
         WHERE claim.draft_id = p_draft_id
         GROUP BY claim.item_id
       ) AS claimed ON claimed.item_id = item.id
       WHERE item.draft_id = p_draft_id
         AND item.kind = 'item'
         AND coalesce(claimed.quantity_milli, 0)
           IS DISTINCT FROM item.quantity_milli
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_receipt_claims AS claim
       JOIN public.expense_receipt_party_handles AS handle
         ON handle.draft_id = claim.draft_id
        AND handle.id = claim.beneficiary_party_id
       LEFT JOIN public.expense_unconfirmed_publication_parties AS party
         ON party.draft_id = handle.draft_id
        AND party.identity_token_hash = handle.identity_token_hash
        AND party.is_participant
       WHERE claim.draft_id = p_draft_id AND party.draft_id IS NULL
     ) THEN
    RAISE EXCEPTION 'expense_receipt_confirmation_incomplete';
  END IF;
  WITH claim_base AS (
    SELECT claim.id, claim.beneficiary_party_id, item.id AS item_id,
      item.total_minor,
      pg_catalog.floor(
        item.total_minor::numeric * claim.quantity_milli / item.quantity_milli
      )::bigint AS base_minor,
      pg_catalog.mod(
        item.total_minor::numeric * claim.quantity_milli, item.quantity_milli
      ) AS remainder
    FROM public.expense_receipt_items AS item
    JOIN public.expense_receipt_claims AS claim
      ON claim.draft_id = item.draft_id AND claim.item_id = item.id
    WHERE item.draft_id = p_draft_id AND item.kind = 'item'
  ), item_ranked AS (
    SELECT claim_base.*,
      pg_catalog.row_number() OVER (
        PARTITION BY claim_base.item_id
        ORDER BY claim_base.remainder DESC, claim_base.id
      ) AS remainder_rank,
      claim_base.total_minor - pg_catalog.sum(claim_base.base_minor)
        OVER (PARTITION BY claim_base.item_id) AS remainder_units
    FROM claim_base
  ), item_shares AS (
    SELECT item_ranked.beneficiary_party_id,
      pg_catalog.sum(
        item_ranked.base_minor
        + CASE WHEN item_ranked.remainder_rank <= item_ranked.remainder_units
          THEN 1 ELSE 0 END
      )::bigint AS item_minor
    FROM item_ranked GROUP BY item_ranked.beneficiary_party_id
  ), adjustment_base AS (
    SELECT item_shares.*,
      pg_catalog.floor(
        pg_catalog.abs(v_adjustment)::numeric * item_shares.item_minor
          / v_claimable_total
      )::bigint AS base_minor,
      pg_catalog.mod(
        pg_catalog.abs(v_adjustment)::numeric * item_shares.item_minor,
        v_claimable_total
      ) AS remainder
    FROM item_shares
  ), adjustment_ranked AS (
    SELECT adjustment_base.*,
      pg_catalog.row_number() OVER (
        ORDER BY adjustment_base.remainder DESC,
          adjustment_base.beneficiary_party_id
      ) AS remainder_rank,
      pg_catalog.abs(v_adjustment) - pg_catalog.sum(adjustment_base.base_minor)
        OVER () AS remainder_units
    FROM adjustment_base
  ), final_shares AS (
    SELECT adjustment_ranked.beneficiary_party_id,
      (
        adjustment_ranked.item_minor
        + CASE WHEN v_adjustment < 0 THEN -1 ELSE 1 END * (
          adjustment_ranked.base_minor
          + CASE WHEN adjustment_ranked.remainder_rank
            <= adjustment_ranked.remainder_units THEN 1 ELSE 0 END
        )
      )::bigint AS amount_minor
    FROM adjustment_ranked
  )
  SELECT pg_catalog.jsonb_object_agg(
    final_shares.beneficiary_party_id::text, final_shares.amount_minor
  ) INTO v_shares
  FROM final_shares;
  IF v_shares IS NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each_text(v_shares) AS share(key, value)
    WHERE share.value::bigint < 0
  ) OR (
    SELECT pg_catalog.sum(share.value::bigint)
    FROM pg_catalog.jsonb_each_text(v_shares) AS share(key, value)
  ) IS DISTINCT FROM v_receipt.receipt_total_minor THEN
    RAISE EXCEPTION 'expense_receipt_confirmation_invalid';
  END IF;
  SELECT member.value->>'key' INTO v_author_key
  FROM pg_catalog.jsonb_array_elements(v_draft.payload->'members') AS member(value)
  JOIN public.expense_unconfirmed_publication_parties AS party
    ON party.draft_id = p_draft_id
   AND party.party_key_hash = pg_catalog.md5(member.value->>'key')
   AND party.is_author;
  SELECT pg_catalog.jsonb_object_agg(
      member.value->>'key',
      public.expense_sql179_minor_text(
        coalesce(
          (v_shares->>handle.id::text)::bigint, 0
        ),
        v_receipt.currency
      )
    ),
    pg_catalog.jsonb_object_agg(
      member.value->>'key',
      public.expense_sql179_minor_text(
        CASE WHEN party.is_author THEN v_receipt.receipt_total_minor ELSE 0 END,
        v_receipt.currency
      )
    )
  INTO v_amounts, v_payments
  FROM pg_catalog.jsonb_array_elements(v_draft.payload->'members') AS member(value)
  JOIN public.expense_unconfirmed_publication_parties AS party
    ON party.draft_id = p_draft_id
   AND party.party_key_hash = pg_catalog.md5(member.value->>'key')
  LEFT JOIN public.expense_receipt_party_handles AS handle
    ON handle.draft_id = party.draft_id
   AND handle.identity_token_hash = party.identity_token_hash;
  IF v_author_key IS NULL OR v_amounts IS NULL OR v_payments IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_confirmation_invalid';
  END IF;
  v_new_draft_version := v_draft.version + 1;
  IF v_new_draft_version > 9007199254740991 THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  UPDATE public.expense_private_drafts AS draft
  SET payload = pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              draft.payload, '{splitMethod}', '"fixed"'::jsonb
            ),
            '{amounts}', v_amounts
          ),
          '{payments}', v_payments
        ),
        '{payerKeys}', pg_catalog.jsonb_build_array(v_author_key)
      ),
      version = v_new_draft_version,
      updated_at = pg_catalog.now()
  WHERE draft.id = p_draft_id;
  v_share_result := public.expense_share_private_draft(
    p_actor_id,
    public.expense_identity_request_id('expense-sql179-refresh-v1', p_request_id),
    p_draft_id,
    v_new_draft_version,
    p_expected_publication_version
  );
  v_new_publication_version := (v_share_result->>'publication_version')::bigint;
  IF v_new_publication_version IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_confirmation_invalid';
  END IF;
  v_result := public.expense_finalize_private_draft(
    p_actor_id, p_request_id, p_draft_id, v_new_draft_version,
    v_new_publication_version, true
  );
  UPDATE public.expense_receipt_splits AS receipt
  SET phase = 'confirmed',
      confirmed_group_id = (v_result->>'group_id')::uuid,
      confirmed_expense_id = (v_result->>'expense_id')::uuid,
      version = receipt.version + 1,
      updated_at = pg_catalog.now()
  WHERE receipt.draft_id = p_draft_id;
  INSERT INTO public.expense_receipt_finalizations(
    draft_id, actor_user_id, request_id, original_draft_version,
    original_publication_version, original_receipt_version, result
  ) VALUES (
    p_draft_id, p_actor_id, p_request_id, p_expected_draft_version,
    p_expected_publication_version, p_expected_receipt_version, v_result
  );
  RETURN v_result;
END;
$function$;





DO $sql179_catalog_seal$
DECLARE
  v_digest text;
BEGIN
  WITH target_relations(name) AS (VALUES
    ('expense_receipt_splits'),
    ('expense_receipt_items'),
    ('expense_receipt_claims'),
    ('expense_receipt_party_handles'),
    ('expense_receipt_finalizations')
  ), target_functions(name) AS (VALUES
    ('expense_sql179_minor_text'),
    ('expense_sql179_validate_extraction'),
    ('expense_sql179_sync_party_handles'),
    ('expense_sql179_actor_party_id'),
    ('expense_receipt_prepare_upload_v1'),
    ('expense_receipt_get_pending_upload_v1'),
    ('expense_receipt_retry_extraction_v1'),
    ('expense_receipt_apply_extraction_v1'),
    ('expense_receipt_review_v1'),
    ('expense_get_receipt_split_v1'),
    ('expense_receipt_claim_item_v1'),
    ('expense_receipt_delete_claim_v1'),
    ('expense_finalize_private_draft_v2'),
    ('expense_receipt_get_image_target_v1'),
    ('expense_receipt_begin_delete_v1'),
    ('expense_receipt_complete_delete_v1')
  ), relation_contract AS (
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
      AND relation.relname IN (SELECT name FROM target_relations)
  ), column_contract AS (
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
      AND relation.relname IN (SELECT name FROM target_relations)
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  ), constraint_contract AS (
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
      AND relation.relname IN (SELECT name FROM target_relations)
  ), index_contract AS (
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
      AND relation.relname IN (SELECT name FROM target_relations)
  ), function_contract AS (
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
      AND routine.proname IN (SELECT name FROM target_functions)
  ), bucket_contract AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      bucket.id, bucket.name, bucket.public, bucket.file_size_limit,
      bucket.allowed_mime_types
    ) ORDER BY bucket.id), '[]'::jsonb) AS value
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'expense-receipts-private'
  )
  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'relations', relation_contract.value,
    'columns', column_contract.value,
    'constraints', constraint_contract.value,
    'indexes', index_contract.value,
    'functions', function_contract.value,
    'bucket', bucket_contract.value
  )::text)
  INTO v_digest
  FROM relation_contract
  CROSS JOIN column_contract
  CROSS JOIN constraint_contract
  CROSS JOIN index_contract
  CROSS JOIN function_contract
  CROSS JOIN bucket_contract;

  EXECUTE pg_catalog.format(
    'COMMENT ON TABLE public.expense_receipt_splits IS %L',
    'teskeid:sql179:catalog-v1:'
      || pg_catalog.current_setting('server_version_num') || ':' || v_digest
  );
END;
$sql179_catalog_seal$;

COMMIT;
