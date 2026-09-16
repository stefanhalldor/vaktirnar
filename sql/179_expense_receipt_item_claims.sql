-- SQL179 MIGRATION: private receipt extraction, fractional item claims and atomic
-- conversion into the existing Expense finalizer.
-- Stebbi alone runs this reviewed migration. Codex never runs SQL.

BEGIN;
SET LOCAL search_path = '';
SET LOCAL lock_timeout = '5s';

DO $sql179_guard$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_current_digest text;
  v_stored_comment text;
  v_targets_exact boolean;
BEGIN
  IF pg_catalog.to_regclass('public.expense_receipt_splits') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_receipt_items') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_receipt_claims') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_receipt_party_handles') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_receipt_finalizations') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM storage.buckets AS bucket
       WHERE bucket.id = 'expense-receipts-private'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname IN (
           'expense_sql179_minor_text',
           'expense_sql179_validate_extraction',
           'expense_sql179_sync_party_handles',
           'expense_sql179_actor_party_id',
           'expense_receipt_prepare_upload_v1',
           'expense_receipt_get_pending_upload_v1',
           'expense_receipt_retry_extraction_v1',
           'expense_receipt_apply_extraction_v1',
           'expense_receipt_review_v1',
           'expense_get_receipt_split_v1',
           'expense_receipt_claim_item_v1',
           'expense_receipt_delete_claim_v1',
           'expense_finalize_private_draft_v2',
           'expense_receipt_get_image_target_v1',
           'expense_receipt_begin_delete_v1',
           'expense_receipt_complete_delete_v1'
         )
     ) THEN
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
    INTO v_current_digest
    FROM relation_contract
    CROSS JOIN column_contract
    CROSS JOIN constraint_contract
    CROSS JOIN index_contract
    CROSS JOIN function_contract
    CROSS JOIN bucket_contract;

    v_stored_comment := pg_catalog.obj_description(
      pg_catalog.to_regclass('public.expense_receipt_splits'), 'pg_class'
    );
    v_targets_exact := COALESCE(
      v_stored_comment ~ '^teskeid:sql179:catalog-v1:[0-9]+:[0-9a-f]{32}$'
      AND pg_catalog.split_part(v_stored_comment, ':', 4)
        = pg_catalog.current_setting('server_version_num')
      AND pg_catalog.split_part(v_stored_comment, ':', 5) = v_current_digest,
      false
    );
    IF v_targets_exact THEN
      RAISE EXCEPTION 'sql179_exact_already_installed';
    END IF;
    RAISE EXCEPTION 'sql179_target_drift';
  END IF;
  IF pg_catalog.to_regclass('public.expense_private_drafts') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_private_drafts');
  END IF;
  IF pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_unconfirmed_publications');
  END IF;
  IF pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_unconfirmed_publication_parties');
  END IF;
  IF pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_shares') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('storage.buckets') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'receipt_dependency_relations');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_finalize_private_draft');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_share_private_draft');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_sql159_snapshot_is_valid(uuid)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.expense_sql159_audience_allows(uuid,uuid)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.expense_identity_request_id(text,uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'sql159_internal_contract');
  END IF;
  IF pg_catalog.to_regprocedure('public.teskeid_event_assert_session_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_begin_request(uuid,uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_delete_private_draft(uuid,uuid)'
     ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'receipt_authority_contract');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)'
  ) IS NULL OR (
    SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = pg_catalog.to_regprocedure(
      'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)'
    )
  ) IS DISTINCT FROM '58e08589a18db2a20ff406d22b98ba91' THEN
    v_missing := pg_catalog.array_append(v_missing, 'sql177_context_lineage');
  END IF;
  IF (
    SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = pg_catalog.to_regprocedure(
      'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'
    )
  ) IS DISTINCT FROM '14ac1abc9046fea4812ac652a9b96088'
     OR (
       SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
         'public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)'
       )
     ) IS DISTINCT FROM 'ca805bbd38dbd013e1c034e0049432ec' THEN
    v_missing := pg_catalog.array_append(v_missing, 'sql159_finalize_share_lineage');
  END IF;
  IF pg_catalog.cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql179_missing_or_drifted_prerequisites:%',
      pg_catalog.array_to_string(v_missing, ',');
  END IF;
END;
$sql179_guard$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts-private',
  'expense-receipts-private',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
;

CREATE TABLE public.expense_receipt_splits (
  draft_id                 uuid        PRIMARY KEY,
  actor_user_id            uuid        NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id                uuid        NOT NULL UNIQUE,
  phase                    text        NOT NULL,
  object_path              text        NULL UNIQUE,
  original_filename        text        NULL,
  declared_mime_type       text        NOT NULL,
  declared_size_bytes      bigint      NOT NULL,
  verified_mime_type       text        NULL,
  verified_size_bytes      bigint      NULL,
  content_sha256           text        NULL,
  currency                 text        NULL,
  title                    text        NULL,
  incurred_on              date        NULL,
  receipt_total_minor      bigint      NULL,
  version                  bigint      NOT NULL DEFAULT 1,
  raw_deleted_at           timestamptz NULL,
  confirmed_group_id       uuid        NULL,
  confirmed_expense_id     uuid        NULL,
  delete_scope             text        NULL,
  phase_before_delete      text        NULL,
  created_at               timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at               timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT expense_receipt_splits_actor_draft_unique
    UNIQUE (draft_id, actor_user_id),
  CONSTRAINT expense_receipt_splits_phase_check
    CHECK (phase IN ('uploading', 'extracting', 'review', 'confirmed', 'deleting')),
  CONSTRAINT expense_receipt_splits_path_check CHECK (
    object_path IS NULL
    OR object_path ~ '^objects/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  CONSTRAINT expense_receipt_splits_filename_check CHECK (
    original_filename IS NULL
    OR pg_catalog.char_length(original_filename) BETWEEN 1 AND 240
  ),
  CONSTRAINT expense_receipt_splits_declared_check CHECK (
    declared_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    AND declared_size_bytes BETWEEN 1 AND 10485760
  ),
  CONSTRAINT expense_receipt_splits_verified_check CHECK (
    verified_mime_type IS NULL
    OR verified_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT expense_receipt_splits_hash_check CHECK (
    content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT expense_receipt_splits_financial_check CHECK (
    (currency IS NULL AND title IS NULL AND incurred_on IS NULL
      AND receipt_total_minor IS NULL)
    OR (
      currency IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
      AND pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 1 AND 200
      AND incurred_on IS NOT NULL
      AND receipt_total_minor BETWEEN 1 AND 9007199254740991
    )
  ),
  CONSTRAINT expense_receipt_splits_object_lifecycle_check CHECK (
    (object_path IS NOT NULL AND raw_deleted_at IS NULL)
    OR (object_path IS NULL AND raw_deleted_at IS NOT NULL)
  ),
  CONSTRAINT expense_receipt_splits_lifecycle_check CHECK (
    (
      (phase IN ('uploading', 'extracting')
        OR (phase = 'deleting' AND phase_before_delete IN ('uploading', 'extracting')))
      AND verified_mime_type IS NULL
      AND verified_size_bytes IS NULL
      AND content_sha256 IS NULL
      AND currency IS NULL
    )
    OR (
      (phase IN ('review', 'confirmed')
        OR (phase = 'deleting' AND phase_before_delete IN ('review', 'confirmed')))
      AND verified_mime_type IS NOT NULL
      AND verified_size_bytes BETWEEN 1 AND 10485760
      AND content_sha256 IS NOT NULL
    )
  ),
  CONSTRAINT expense_receipt_splits_confirmation_check CHECK (
    (confirmed_group_id IS NULL) = (confirmed_expense_id IS NULL)
    AND (phase <> 'confirmed' OR confirmed_group_id IS NOT NULL)
  ),
  CONSTRAINT expense_receipt_splits_delete_check CHECK (
    (phase = 'deleting'
      AND delete_scope IN ('image', 'split')
      AND phase_before_delete IN ('uploading', 'extracting', 'review', 'confirmed'))
    OR (phase <> 'deleting' AND delete_scope IS NULL AND phase_before_delete IS NULL)
  ),
  CONSTRAINT expense_receipt_splits_version_check
    CHECK (version BETWEEN 1 AND 9007199254740991)
);

CREATE TABLE public.expense_receipt_items (
  draft_id                uuid        NOT NULL
    REFERENCES public.expense_receipt_splits(draft_id) ON DELETE CASCADE,
  id                      uuid        NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  ordinal                 smallint    NOT NULL,
  kind                    text        NOT NULL,
  description             text        NOT NULL,
  quantity_milli          bigint      NOT NULL,
  total_minor             bigint      NOT NULL,
  confidence_basis_points integer     NOT NULL,
  needs_review            boolean     NOT NULL,
  PRIMARY KEY (draft_id, id),
  CONSTRAINT expense_receipt_items_ordinal_unique UNIQUE (draft_id, ordinal),
  CONSTRAINT expense_receipt_items_ordinal_check CHECK (ordinal BETWEEN 1 AND 100),
  CONSTRAINT expense_receipt_items_kind_check
    CHECK (kind IN ('item', 'discount', 'tax', 'tip')),
  CONSTRAINT expense_receipt_items_description_check
    CHECK (pg_catalog.char_length(pg_catalog.btrim(description)) BETWEEN 1 AND 200),
  CONSTRAINT expense_receipt_items_quantity_check CHECK (
    quantity_milli BETWEEN 1 AND 1000000
    AND (kind = 'item' OR quantity_milli = 1000)
  ),
  CONSTRAINT expense_receipt_items_total_check CHECK (
    total_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND ((kind = 'item' AND total_minor > 0) OR kind <> 'item')
  ),
  CONSTRAINT expense_receipt_items_confidence_check
    CHECK (confidence_basis_points BETWEEN 0 AND 10000)
);

CREATE TABLE public.expense_receipt_claims (
  draft_id                uuid        NOT NULL,
  item_id                 uuid        NOT NULL,
  id                      uuid        NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  actor_party_id          uuid        NOT NULL,
  beneficiary_party_id    uuid        NOT NULL,
  quantity_milli          bigint      NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (draft_id, id),
  CONSTRAINT expense_receipt_claims_item_fk
    FOREIGN KEY (draft_id, item_id)
    REFERENCES public.expense_receipt_items(draft_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_receipt_claims_quantity_check
    CHECK (quantity_milli BETWEEN 1 AND 1000000)
);

CREATE TABLE public.expense_receipt_party_handles (
  draft_id           uuid        NOT NULL
    REFERENCES public.expense_receipt_splits(draft_id) ON DELETE CASCADE,
  id                 uuid        NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  identity_token_hash text       NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (draft_id, id),
  CONSTRAINT expense_receipt_party_handles_identity_unique
    UNIQUE (draft_id, identity_token_hash),
  CONSTRAINT expense_receipt_party_handles_hash_check
    CHECK (identity_token_hash ~ '^[0-9a-f]{32}$')
);

ALTER TABLE public.expense_receipt_claims
  ADD CONSTRAINT expense_receipt_claims_actor_party_fk
  FOREIGN KEY (draft_id, actor_party_id)
  REFERENCES public.expense_receipt_party_handles(draft_id, id) ON DELETE RESTRICT;
ALTER TABLE public.expense_receipt_claims
  ADD CONSTRAINT expense_receipt_claims_beneficiary_party_fk
  FOREIGN KEY (draft_id, beneficiary_party_id)
  REFERENCES public.expense_receipt_party_handles(draft_id, id) ON DELETE RESTRICT;

CREATE INDEX expense_receipt_claims_item_idx
  ON public.expense_receipt_claims (draft_id, item_id, id);

CREATE TABLE public.expense_receipt_finalizations (
  draft_id                    uuid        PRIMARY KEY,
  actor_user_id               uuid        NOT NULL,
  request_id                  uuid        NOT NULL,
  original_draft_version      bigint      NOT NULL,
  original_publication_version bigint     NOT NULL,
  original_receipt_version    bigint      NOT NULL,
  result                      jsonb       NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT expense_receipt_finalizations_actor_request_unique
    UNIQUE (actor_user_id, request_id),
  CONSTRAINT expense_receipt_finalizations_result_check
    CHECK (pg_catalog.jsonb_typeof(result) = 'object')
);

ALTER TABLE public.expense_receipt_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_splits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_party_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_party_handles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipt_finalizations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.expense_receipt_splits,
  public.expense_receipt_items,
  public.expense_receipt_claims,
  public.expense_receipt_party_handles,
  public.expense_receipt_finalizations
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.expense_sql179_minor_text(
  p_amount bigint,
  p_currency text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_currency = 'ISK' THEN p_amount::text
    ELSE (p_amount / 100)::text || '.' || pg_catalog.lpad((p_amount % 100)::text, 2, '0')
  END;
$function$;

CREATE FUNCTION public.expense_receipt_prepare_upload_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_upload_id uuid,
  p_filename text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_existing public.expense_receipt_splits%ROWTYPE;
  v_path text;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_upload_id IS NULL
     OR p_declared_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_declared_size_bytes NOT BETWEEN 1 AND 10485760
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_filename, '')))
       NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.context_type <> 'one_off'
     OR v_draft.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_receipt_not_found';
  END IF;
  SELECT receipt.* INTO v_existing
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
  FOR UPDATE;
  IF v_existing.draft_id IS NOT NULL THEN
    IF v_existing.upload_id = p_upload_id
       AND v_existing.declared_mime_type = p_declared_mime_type
       AND v_existing.declared_size_bytes = p_declared_size_bytes
       AND v_existing.original_filename = pg_catalog.btrim(p_filename) THEN
      RETURN pg_catalog.jsonb_build_object(
        'upload_id', v_existing.upload_id,
        'bucket_id', 'expense-receipts-private',
        'object_path', v_existing.object_path
      );
    END IF;
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  v_path := 'objects/' || p_actor_id::text || '/' || p_draft_id::text
    || '/' || p_upload_id::text;
  INSERT INTO public.expense_receipt_splits(
    draft_id, actor_user_id, upload_id, phase, object_path,
    original_filename, declared_mime_type, declared_size_bytes
  ) VALUES (
    p_draft_id, p_actor_id, p_upload_id, 'uploading', v_path,
    pg_catalog.btrim(p_filename), p_declared_mime_type,
    p_declared_size_bytes
  );
  RETURN pg_catalog.jsonb_build_object(
    'upload_id', p_upload_id,
    'bucket_id', 'expense-receipts-private',
    'object_path', v_path
  );
END;
$function$;

CREATE FUNCTION public.expense_receipt_get_pending_upload_v1(
  p_actor_id uuid,
  p_draft_id uuid,
  p_upload_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL OR p_upload_id IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
    AND receipt.actor_user_id = p_actor_id
    AND receipt.upload_id = p_upload_id
    AND receipt.phase IN ('uploading', 'extracting')
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  UPDATE public.expense_receipt_splits AS receipt
  SET phase = 'extracting', updated_at = pg_catalog.now()
  WHERE receipt.draft_id = p_draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'bucket_id', 'expense-receipts-private',
    'object_path', v_receipt.object_path,
    'declared_mime_type', v_receipt.declared_mime_type,
    'declared_size_bytes', v_receipt.declared_size_bytes
  );
END;
$function$;

CREATE FUNCTION public.expense_receipt_retry_extraction_v1(
  p_actor_id uuid,
  p_draft_id uuid
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
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  BEGIN
    SELECT draft.* INTO STRICT v_draft
    FROM public.expense_private_drafts AS draft
    WHERE draft.id = p_draft_id
      AND draft.actor_user_id = p_actor_id
      AND draft.context_type = 'one_off'
      AND draft.expense_id IS NULL
    FOR UPDATE;
    SELECT receipt.* INTO STRICT v_receipt
    FROM public.expense_receipt_splits AS receipt
    WHERE receipt.draft_id = p_draft_id
      AND receipt.actor_user_id = p_actor_id
      AND receipt.phase IN ('uploading', 'extracting')
      AND receipt.object_path IS NOT NULL
      AND receipt.raw_deleted_at IS NULL
    FOR UPDATE;
  EXCEPTION
    WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'expense_receipt_not_found';
  END;
  UPDATE public.expense_receipt_splits AS receipt
  SET phase = 'extracting', updated_at = pg_catalog.now()
  WHERE receipt.draft_id = p_draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'upload_id', v_receipt.upload_id,
    'bucket_id', 'expense-receipts-private',
    'object_path', v_receipt.object_path,
    'declared_mime_type', v_receipt.declared_mime_type,
    'declared_size_bytes', v_receipt.declared_size_bytes
  );
END;
$function$;

CREATE FUNCTION public.expense_sql179_validate_extraction(p_extraction jsonb)
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

CREATE FUNCTION public.expense_receipt_apply_extraction_v1(
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

CREATE FUNCTION public.expense_receipt_review_v1(
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

CREATE FUNCTION public.expense_sql179_sync_party_handles(p_draft_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.expense_receipt_party_handles(draft_id, identity_token_hash)
  SELECT party.draft_id, party.identity_token_hash
  FROM public.expense_unconfirmed_publication_parties AS party
  JOIN public.expense_unconfirmed_publications AS publication
    ON publication.draft_id = party.draft_id
   AND publication.is_live
  WHERE party.draft_id = p_draft_id
    AND party.is_participant
  ON CONFLICT (draft_id, identity_token_hash) DO NOTHING;
END;
$function$;

CREATE FUNCTION public.expense_sql179_actor_party_id(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity_hash text;
  v_party_id uuid;
BEGIN
  SELECT party.identity_token_hash INTO v_identity_hash
  FROM public.expense_unconfirmed_publications AS publication
  JOIN public.expense_unconfirmed_publication_parties AS party
    ON party.draft_id = publication.draft_id
   AND party.is_author
   AND party.is_participant
  WHERE publication.draft_id = p_draft_id
    AND publication.actor_user_id = p_actor_id
    AND publication.is_live;
  IF v_identity_hash IS NULL THEN
    SELECT audience.identity_token_hash INTO v_identity_hash
    FROM public.expense_unconfirmed_publication_audience AS audience
    JOIN public.expense_unconfirmed_publication_parties AS party
      ON party.draft_id = audience.draft_id
     AND party.identity_token_hash = audience.identity_token_hash
     AND party.is_participant
    WHERE audience.draft_id = p_draft_id
      AND audience.user_id = p_actor_id;
  END IF;
  SELECT handle.id INTO v_party_id
  FROM public.expense_receipt_party_handles AS handle
  WHERE handle.draft_id = p_draft_id
    AND handle.identity_token_hash = v_identity_hash;
  RETURN v_party_id;
END;
$function$;

CREATE FUNCTION public.expense_get_receipt_split_v1(
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

CREATE FUNCTION public.expense_receipt_claim_item_v1(
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

CREATE FUNCTION public.expense_receipt_delete_claim_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_publication_id uuid,
  p_expected_receipt_version bigint,
  p_claim_id uuid
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
  v_actor_party_id uuid;
  v_deleted uuid;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_publication_id IS NULL
     OR p_expected_receipt_version NOT BETWEEN 1 AND 9007199254740991
     OR p_claim_id IS NULL THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_receipt_delete_claim_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_object(
      'publicationId', p_publication_id,
      'receiptVersion', p_expected_receipt_version,
      'claimId', p_claim_id
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
  IF v_actor_party_id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_allowed'; END IF;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = v_publication.draft_id
    AND receipt.phase = 'review'
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL OR v_receipt.version <> p_expected_receipt_version THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  END IF;
  DELETE FROM public.expense_receipt_claims AS claim
  WHERE claim.draft_id = v_receipt.draft_id
    AND claim.id = p_claim_id
    AND claim.actor_party_id = v_actor_party_id
  RETURNING claim.id INTO v_deleted;
  IF v_deleted IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_allowed'; END IF;
  UPDATE public.expense_receipt_splits AS receipt
  SET version = receipt.version + 1, updated_at = pg_catalog.now()
  WHERE receipt.draft_id = v_receipt.draft_id;
  v_result := pg_catalog.jsonb_build_object(
    'receipt_version', v_receipt.version + 1
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_finalize_private_draft_v2(
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

CREATE FUNCTION public.expense_receipt_get_image_target_v1(
  p_actor_id uuid,
  p_draft_id uuid DEFAULT NULL,
  p_publication_id uuid DEFAULT NULL,
  p_expense_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_receipt public.expense_receipt_splits%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL
     OR (CASE WHEN p_draft_id IS NULL THEN 0 ELSE 1 END
       + CASE WHEN p_publication_id IS NULL THEN 0 ELSE 1 END
       + CASE WHEN p_expense_id IS NULL THEN 0 ELSE 1 END) <> 1 THEN
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
  ELSIF p_publication_id IS NOT NULL THEN
    SELECT receipt.* INTO v_receipt
    FROM public.expense_receipt_splits AS receipt
    JOIN public.expense_unconfirmed_publications AS publication
      ON publication.draft_id = receipt.draft_id
     AND publication.publication_id = p_publication_id
     AND publication.is_live
    WHERE public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
      AND public.expense_sql159_snapshot_is_valid(publication.draft_id);
  ELSE
    SELECT receipt.* INTO v_receipt
    FROM public.expense_receipt_splits AS receipt
    WHERE receipt.confirmed_expense_id = p_expense_id
      AND (
        receipt.actor_user_id = p_actor_id
        OR EXISTS (
          SELECT 1
          FROM public.expenses AS expense
          JOIN public.expense_group_members AS member
            ON member.group_id = expense.group_id
           AND member.user_id = p_actor_id
           AND member.status = 'active'
          WHERE expense.id = p_expense_id
            AND (
              EXISTS (
                SELECT 1 FROM public.expense_shares AS share
                WHERE share.expense_id = expense.id
                  AND share.member_id = member.id
              )
              OR EXISTS (
                SELECT 1 FROM public.expense_payments AS payment
                WHERE payment.expense_id = expense.id
                  AND payment.member_id = member.id
              )
            )
        )
      );
  END IF;
  IF v_receipt.draft_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF v_receipt.object_path IS NULL OR v_receipt.phase = 'deleting' THEN
    IF v_receipt.actor_user_id <> p_actor_id THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found');
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'management',
      'draft_id', v_receipt.draft_id,
      'is_author', true,
      'image_available', false,
      'delete_scope', v_receipt.delete_scope
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'status', 'ready',
    'draft_id', v_receipt.draft_id,
    'is_author', v_receipt.actor_user_id = p_actor_id,
    'image_available', true,
    'delete_scope', NULL,
    'bucket_id', 'expense-receipts-private',
    'object_path', v_receipt.object_path
  );
END;
$function$;

CREATE FUNCTION public.expense_receipt_begin_delete_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_receipt public.expense_receipt_splits%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_scope NOT IN ('image', 'split') THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
    AND receipt.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL
     OR (p_scope = 'image' AND v_receipt.object_path IS NULL) THEN
    RAISE EXCEPTION 'expense_receipt_not_found';
  END IF;
  IF v_receipt.phase = 'deleting' THEN
    IF v_receipt.delete_scope <> p_scope THEN
      RAISE EXCEPTION 'expense_receipt_conflict';
    END IF;
  ELSIF v_receipt.phase NOT IN ('uploading', 'extracting', 'review', 'confirmed') THEN
    RAISE EXCEPTION 'expense_receipt_conflict';
  ELSE
    UPDATE public.expense_receipt_splits AS receipt
    SET phase_before_delete = receipt.phase,
        phase = 'deleting',
        delete_scope = p_scope,
        version = receipt.version + 1,
        updated_at = pg_catalog.now()
    WHERE receipt.draft_id = p_draft_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'bucket_id', 'expense-receipts-private',
    'object_path', v_receipt.object_path,
    'storage_required', v_receipt.object_path IS NOT NULL,
    'scope', p_scope
  );
END;
$function$;

CREATE FUNCTION public.expense_receipt_complete_delete_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_receipt public.expense_receipt_splits%ROWTYPE;
  v_draft_exists boolean;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_scope NOT IN ('image', 'split') THEN
    RAISE EXCEPTION 'expense_receipt_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  PERFORM 1
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
  FOR UPDATE;
  SELECT receipt.* INTO v_receipt
  FROM public.expense_receipt_splits AS receipt
  WHERE receipt.draft_id = p_draft_id
    AND receipt.actor_user_id = p_actor_id
    AND receipt.phase = 'deleting'
    AND receipt.delete_scope = p_scope
  FOR UPDATE;
  IF v_receipt.draft_id IS NULL THEN RAISE EXCEPTION 'expense_receipt_not_found'; END IF;
  IF p_scope = 'image' THEN
    UPDATE public.expense_receipt_splits AS receipt
    SET phase = receipt.phase_before_delete,
        object_path = NULL,
        raw_deleted_at = pg_catalog.now(),
        delete_scope = NULL,
        phase_before_delete = NULL,
        version = receipt.version + 1,
        updated_at = pg_catalog.now()
    WHERE receipt.draft_id = p_draft_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.expense_private_drafts AS draft
      WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id
    ) INTO v_draft_exists;
    DELETE FROM public.expense_receipt_splits AS receipt
    WHERE receipt.draft_id = p_draft_id;
    IF v_draft_exists THEN
      PERFORM public.expense_delete_private_draft(p_actor_id, p_draft_id);
    END IF;
  END IF;
  RETURN pg_catalog.jsonb_build_object('state', 'deleted', 'scope', p_scope);
END;
$function$;

ALTER FUNCTION public.expense_sql179_minor_text(bigint,text) OWNER TO postgres;
ALTER FUNCTION public.expense_sql179_validate_extraction(jsonb) OWNER TO postgres;
ALTER FUNCTION public.expense_sql179_sync_party_handles(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_sql179_actor_party_id(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_prepare_upload_v1(
  uuid,uuid,uuid,uuid,text,text,bigint
) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_get_pending_upload_v1(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_retry_extraction_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_apply_extraction_v1(
  uuid,uuid,uuid,uuid,text,bigint,text,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_review_v1(
  uuid,uuid,uuid,bigint,text,text,date,bigint,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.expense_get_receipt_split_v1(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_claim_item_v1(
  uuid,uuid,uuid,bigint,uuid,uuid,bigint
) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_delete_claim_v1(
  uuid,uuid,uuid,bigint,uuid
) OWNER TO postgres;
ALTER FUNCTION public.expense_finalize_private_draft_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,boolean
) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_get_image_target_v1(
  uuid,uuid,uuid,uuid
) OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_begin_delete_v1(uuid,uuid,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.expense_receipt_complete_delete_v1(uuid,uuid,uuid,text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_sql179_minor_text(bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_sql179_validate_extraction(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_sql179_sync_party_handles(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_sql179_actor_party_id(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_receipt_prepare_upload_v1(
  uuid,uuid,uuid,uuid,text,text,bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_get_pending_upload_v1(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_retry_extraction_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_apply_extraction_v1(
  uuid,uuid,uuid,uuid,text,bigint,text,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_review_v1(
  uuid,uuid,uuid,bigint,text,text,date,bigint,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_get_receipt_split_v1(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_claim_item_v1(
  uuid,uuid,uuid,bigint,uuid,uuid,bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_delete_claim_v1(
  uuid,uuid,uuid,bigint,uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_finalize_private_draft_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_get_image_target_v1(
  uuid,uuid,uuid,uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_begin_delete_v1(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_receipt_complete_delete_v1(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_receipt_prepare_upload_v1(
  uuid,uuid,uuid,uuid,text,text,bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_get_pending_upload_v1(uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_retry_extraction_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_apply_extraction_v1(
  uuid,uuid,uuid,uuid,text,bigint,text,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_review_v1(
  uuid,uuid,uuid,bigint,text,text,date,bigint,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_receipt_split_v1(uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_claim_item_v1(
  uuid,uuid,uuid,bigint,uuid,uuid,bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_delete_claim_v1(
  uuid,uuid,uuid,bigint,uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_finalize_private_draft_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_get_image_target_v1(
  uuid,uuid,uuid,uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_begin_delete_v1(uuid,uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_receipt_complete_delete_v1(uuid,uuid,uuid,text)
  TO service_role;

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
