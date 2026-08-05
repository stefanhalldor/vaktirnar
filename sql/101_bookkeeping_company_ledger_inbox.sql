-- SQL101: Company-level bookkeeping ledger inbox and private source documents.
-- Stebbi alone runs this migration after the read-only preflight is green.
-- Company transactions are deliberately outside VAT periods. Only an explicit,
-- versioned link created by bookkeeping_link_transaction_to_vat_entry can add a
-- normal bookkeeping_entries row and therefore affect A-F/readiness/filings.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.bookkeeping_entry_settlements') IS NULL
     OR to_regprocedure('public.bookkeeping_set_entry_settlement_state(uuid,uuid,uuid,bigint,text)') IS NULL
     OR to_regprocedure('public.bookkeeping_create_entry(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_sql101_requires_sql100';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.bookkeeping_transactions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  state                 text        NOT NULL DEFAULT 'inbox',
  direction             text        NULL,
  document_date         date        NULL,
  payment_date          date        NULL,
  counterparty          text        NULL,
  counterparty_kind     text        NULL,
  description           text        NULL,
  gross_minor           bigint      NULL,
  currency              text        NOT NULL DEFAULT 'ISK',
  rough_category        text        NULL,
  vat_disposition       text        NOT NULL DEFAULT 'unclassified',
  source_type           text        NOT NULL DEFAULT 'manual',
  version               bigint      NOT NULL DEFAULT 1,
  voided_at             timestamptz NULL,
  voided_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason           text        NULL,
  created_by            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_transactions_entity_id_id_unique UNIQUE (entity_id, id),
  CONSTRAINT bookkeeping_transactions_state_check CHECK (state IN ('inbox', 'draft', 'reviewed', 'voided')),
  CONSTRAINT bookkeeping_transactions_direction_check CHECK (direction IS NULL OR direction IN ('inflow', 'outflow')),
  CONSTRAINT bookkeeping_transactions_counterparty_kind_check CHECK (
    counterparty_kind IS NULL OR counterparty_kind IN ('individual', 'company')
  ),
  CONSTRAINT bookkeeping_transactions_amount_check CHECK (gross_minor IS NULL OR gross_minor > 0),
  CONSTRAINT bookkeeping_transactions_currency_check CHECK (currency = 'ISK'),
  CONSTRAINT bookkeeping_transactions_vat_disposition_check CHECK (
    vat_disposition IN ('unclassified', 'not_applicable', 'linked')
  ),
  CONSTRAINT bookkeeping_transactions_source_type_check CHECK (source_type IN ('manual', 'upload')),
  CONSTRAINT bookkeeping_transactions_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_transactions_text_bounds_check CHECK (
    (counterparty IS NULL OR char_length(counterparty) BETWEEN 1 AND 200)
    AND (description IS NULL OR char_length(description) BETWEEN 1 AND 500)
    AND (rough_category IS NULL OR char_length(rough_category) BETWEEN 1 AND 80)
    AND (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500)
  ),
  CONSTRAINT bookkeeping_transactions_void_lifecycle_check CHECK (
    (state <> 'voided' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (state = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bookkeeping_transactions_entity_updated_idx
  ON public.bookkeeping_transactions (entity_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS bookkeeping_transactions_entity_filters_idx
  ON public.bookkeeping_transactions (entity_id, state, vat_disposition, direction, id);

CREATE TABLE IF NOT EXISTS public.bookkeeping_transaction_revisions (
  transaction_id       uuid        NOT NULL,
  entity_id            uuid        NOT NULL,
  version              bigint      NOT NULL,
  operation            text        NOT NULL,
  snapshot             jsonb       NOT NULL,
  captured_by          uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, version),
  CONSTRAINT bookkeeping_transaction_revisions_transaction_fk
    FOREIGN KEY (entity_id, transaction_id)
    REFERENCES public.bookkeeping_transactions(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_revisions_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_transaction_revisions_operation_check CHECK (
    operation IN ('created', 'updated', 'attachment_ready', 'vat_not_applicable',
      'vat_unclassified', 'vat_linked', 'voided')
  ),
  CONSTRAINT bookkeeping_transaction_revisions_snapshot_check CHECK (
    jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 12000
  )
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_attachments (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id              uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  status                 text        NOT NULL DEFAULT 'pending',
  bucket_id              text        NOT NULL DEFAULT 'bookkeeping-private',
  object_path            text        NOT NULL UNIQUE,
  original_filename      text        NULL,
  declared_mime_type     text        NOT NULL,
  declared_size_bytes    bigint      NOT NULL,
  verified_mime_type     text        NULL,
  verified_size_bytes    bigint      NULL,
  sha256_hex             text        NULL,
  rejection_code         text        NULL,
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_by           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  finalized_at           timestamptz NULL,
  CONSTRAINT bookkeeping_attachments_entity_id_id_unique UNIQUE (entity_id, id),
  CONSTRAINT bookkeeping_attachments_status_check CHECK (status IN ('pending', 'ready', 'rejected')),
  CONSTRAINT bookkeeping_attachments_bucket_check CHECK (bucket_id = 'bookkeeping-private'),
  CONSTRAINT bookkeeping_attachments_path_check CHECK (
    object_path ~ '^objects/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  CONSTRAINT bookkeeping_attachments_filename_check CHECK (
    original_filename IS NULL OR char_length(original_filename) BETWEEN 1 AND 240
  ),
  CONSTRAINT bookkeeping_attachments_declared_mime_check CHECK (
    declared_mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT bookkeeping_attachments_declared_size_check CHECK (
    declared_size_bytes BETWEEN 1 AND 15728640
  ),
  CONSTRAINT bookkeeping_attachments_verified_mime_check CHECK (
    verified_mime_type IS NULL OR verified_mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT bookkeeping_attachments_verified_size_check CHECK (
    verified_size_bytes IS NULL OR verified_size_bytes BETWEEN 1 AND 15728640
  ),
  CONSTRAINT bookkeeping_attachments_sha_check CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[0-9a-f]{64}$'),
  CONSTRAINT bookkeeping_attachments_rejection_code_check CHECK (
    rejection_code IS NULL OR rejection_code IN ('size_mismatch', 'mime_mismatch', 'invalid_content')
  ),
  CONSTRAINT bookkeeping_attachments_lifecycle_check CHECK (
    (status = 'pending' AND verified_mime_type IS NULL AND verified_size_bytes IS NULL
      AND sha256_hex IS NULL AND rejection_code IS NULL AND finalized_at IS NULL)
    OR (status = 'ready' AND verified_mime_type IS NOT NULL AND verified_size_bytes IS NOT NULL
      AND sha256_hex IS NOT NULL AND rejection_code IS NULL AND finalized_at IS NOT NULL)
    OR (status = 'rejected' AND rejection_code IS NOT NULL AND finalized_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_transaction_attachments (
  entity_id       uuid        NOT NULL,
  transaction_id uuid        NOT NULL,
  attachment_id  uuid        NOT NULL,
  attached_by    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  attached_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, attachment_id),
  CONSTRAINT bookkeeping_transaction_attachments_transaction_fk
    FOREIGN KEY (entity_id, transaction_id)
    REFERENCES public.bookkeeping_transactions(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_attachments_attachment_fk
    FOREIGN KEY (entity_id, attachment_id)
    REFERENCES public.bookkeeping_attachments(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_attachments_one_owner UNIQUE (attachment_id)
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_transaction_vat_links (
  transaction_id             uuid        PRIMARY KEY,
  entity_id                  uuid        NOT NULL,
  vat_registration_id        uuid        NOT NULL,
  period_id                  uuid        NOT NULL,
  entry_id                   uuid        NOT NULL UNIQUE,
  source_transaction_version bigint      NOT NULL,
  linked_by                  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookkeeping_transaction_vat_links_transaction_fk
    FOREIGN KEY (entity_id, transaction_id)
    REFERENCES public.bookkeeping_transactions(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_vat_links_entry_fk
    FOREIGN KEY (entity_id, period_id, entry_id)
    REFERENCES public.bookkeeping_entries(entity_id, period_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_vat_links_registration_fk
    FOREIGN KEY (entity_id, vat_registration_id)
    REFERENCES public.bookkeeping_vat_registrations(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_transaction_vat_links_version_check CHECK (source_transaction_version > 0)
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bookkeeping-private', 'bookkeeping-private', false, 15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.bookkeeping_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_vat_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_transaction_vat_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bookkeeping_transactions,
  public.bookkeeping_transaction_revisions,
  public.bookkeeping_attachments,
  public.bookkeeping_transaction_attachments,
  public.bookkeeping_transaction_vat_links
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bookkeeping_transactions_touch_updated_at ON public.bookkeeping_transactions;
CREATE TRIGGER bookkeeping_transactions_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();

DROP TRIGGER IF EXISTS bookkeeping_transactions_no_delete ON public.bookkeeping_transactions;
CREATE TRIGGER bookkeeping_transactions_no_delete
  BEFORE DELETE ON public.bookkeeping_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_transaction_revisions_immutable ON public.bookkeeping_transaction_revisions;
CREATE TRIGGER bookkeeping_transaction_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_transaction_revisions
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();
DROP TRIGGER IF EXISTS bookkeeping_attachments_no_delete ON public.bookkeeping_attachments;
CREATE TRIGGER bookkeeping_attachments_no_delete
  BEFORE DELETE ON public.bookkeeping_attachments
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_transaction_attachments_immutable ON public.bookkeeping_transaction_attachments;
CREATE TRIGGER bookkeeping_transaction_attachments_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_transaction_attachments
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();
DROP TRIGGER IF EXISTS bookkeeping_transaction_vat_links_immutable ON public.bookkeeping_transaction_vat_links;
CREATE TRIGGER bookkeeping_transaction_vat_links_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_transaction_vat_links
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();

CREATE OR REPLACE FUNCTION public.bookkeeping_transaction_snapshot(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', tx.id, 'entityId', tx.entity_id, 'state', tx.state,
    'direction', tx.direction, 'documentDate', tx.document_date,
    'paymentDate', tx.payment_date, 'counterparty', tx.counterparty,
    'counterpartyKind', tx.counterparty_kind, 'description', tx.description,
    'grossMinor', tx.gross_minor, 'currency', tx.currency,
    'roughCategory', tx.rough_category, 'vatDisposition', tx.vat_disposition,
    'sourceType', tx.source_type, 'version', tx.version,
    'voidedAt', tx.voided_at, 'voidReason', tx.void_reason,
    'createdAt', tx.created_at, 'updatedAt', tx.updated_at
  )
  FROM public.bookkeeping_transactions AS tx WHERE tx.id = p_transaction_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_capture_transaction_revision(
  p_actor_id uuid,
  p_transaction_id uuid,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.bookkeeping_transactions%ROWTYPE;
BEGIN
  SELECT tx.* INTO STRICT v_tx
  FROM public.bookkeeping_transactions AS tx WHERE tx.id = p_transaction_id;
  INSERT INTO public.bookkeeping_transaction_revisions (
    transaction_id, entity_id, version, operation, snapshot, captured_by
  ) VALUES (
    v_tx.id, v_tx.entity_id, v_tx.version, p_operation,
    public.bookkeeping_transaction_snapshot(v_tx.id), p_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_transaction_payload(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) AS key
       WHERE key <> ALL (ARRAY[
         'state', 'direction', 'document_date', 'payment_date', 'counterparty',
         'counterparty_kind', 'description', 'gross_minor', 'currency',
         'rough_category'
       ]::text[])
     )
     OR coalesce(p_payload->>'state', 'inbox') NOT IN ('inbox', 'draft', 'reviewed')
     OR (p_payload ? 'direction' AND jsonb_typeof(p_payload->'direction') NOT IN ('string', 'null'))
     OR (p_payload->>'direction' IS NOT NULL AND p_payload->>'direction' NOT IN ('inflow', 'outflow'))
     OR (p_payload->>'counterparty_kind' IS NOT NULL
       AND p_payload->>'counterparty_kind' NOT IN ('individual', 'company'))
     OR coalesce(p_payload->>'currency', 'ISK') <> 'ISK'
     OR (p_payload->>'gross_minor' IS NOT NULL
       AND ((p_payload->>'gross_minor') !~ '^[0-9]+$' OR (p_payload->>'gross_minor')::numeric <= 0
         OR (p_payload->>'gross_minor')::numeric > 9007199254740991))
     OR char_length(coalesce(p_payload->>'counterparty', '')) > 200
     OR char_length(coalesce(p_payload->>'description', '')) > 500
     OR char_length(coalesce(p_payload->>'rough_category', '')) > 80 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_transaction';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_create_company_transaction(
  p_actor_id uuid,
  p_request_id uuid,
  p_entity_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.bookkeeping_assert_transaction_payload(p_payload);
  IF p_entity_id IS NULL OR nullif(btrim(p_payload->>'description'), '') IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_transaction_description_required';
  END IF;
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_create_company_transaction',
    md5(jsonb_build_object('entityId', p_entity_id, 'payload', p_payload)::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, p_entity_id);
  INSERT INTO public.bookkeeping_transactions (
    id, entity_id, state, direction, document_date, payment_date, counterparty,
    counterparty_kind, description, gross_minor, currency, rough_category,
    source_type, created_by, updated_by
  ) VALUES (
    v_id, p_entity_id, coalesce(p_payload->>'state', 'inbox'),
    nullif(p_payload->>'direction', ''), nullif(p_payload->>'document_date', '')::date,
    nullif(p_payload->>'payment_date', '')::date, nullif(btrim(p_payload->>'counterparty'), ''),
    nullif(p_payload->>'counterparty_kind', ''), btrim(p_payload->>'description'),
    nullif(p_payload->>'gross_minor', '')::bigint, 'ISK',
    nullif(btrim(p_payload->>'rough_category'), ''), 'manual', p_actor_id, p_actor_id
  );
  PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_id, 'created');
  v_result := jsonb_build_object('transaction_id', v_id, 'entity_id', p_entity_id, 'version', 1);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_update_company_transaction(
  p_actor_id uuid,
  p_request_id uuid,
  p_transaction_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_replay jsonb;
  v_result jsonb;
  v_changed boolean;
BEGIN
  PERFORM public.bookkeeping_assert_transaction_payload(p_payload);
  IF p_transaction_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_transaction';
  END IF;
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_update_company_transaction',
    md5(jsonb_build_object('transactionId', p_transaction_id,
      'expectedVersion', p_expected_version, 'payload', p_payload)::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT tx.* INTO v_tx FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_tx.entity_id);
  IF v_tx.version <> p_expected_version THEN RAISE EXCEPTION 'bookkeeping_version_conflict'; END IF;
  IF v_tx.state = 'voided' THEN RAISE EXCEPTION 'bookkeeping_not_allowed'; END IF;
  IF nullif(btrim(p_payload->>'description'), '') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.bookkeeping_transaction_attachments AS relation
       JOIN public.bookkeeping_attachments AS attachment ON attachment.id = relation.attachment_id
       WHERE relation.transaction_id = v_tx.id AND attachment.status = 'ready'
     ) THEN
    RAISE EXCEPTION 'bookkeeping_transaction_content_required';
  END IF;

  v_changed := ROW(
    v_tx.state, v_tx.direction, v_tx.document_date, v_tx.payment_date,
    v_tx.counterparty, v_tx.counterparty_kind, v_tx.description,
    v_tx.gross_minor, v_tx.rough_category
  ) IS DISTINCT FROM ROW(
    coalesce(p_payload->>'state', 'inbox'), nullif(p_payload->>'direction', ''),
    nullif(p_payload->>'document_date', '')::date, nullif(p_payload->>'payment_date', '')::date,
    nullif(btrim(p_payload->>'counterparty'), ''), nullif(p_payload->>'counterparty_kind', ''),
    nullif(btrim(p_payload->>'description'), ''), nullif(p_payload->>'gross_minor', '')::bigint,
    nullif(btrim(p_payload->>'rough_category'), '')
  );
  IF v_changed THEN
    UPDATE public.bookkeeping_transactions AS tx SET
      state = coalesce(p_payload->>'state', 'inbox'),
      direction = nullif(p_payload->>'direction', ''),
      document_date = nullif(p_payload->>'document_date', '')::date,
      payment_date = nullif(p_payload->>'payment_date', '')::date,
      counterparty = nullif(btrim(p_payload->>'counterparty'), ''),
      counterparty_kind = nullif(p_payload->>'counterparty_kind', ''),
      description = nullif(btrim(p_payload->>'description'), ''),
      gross_minor = nullif(p_payload->>'gross_minor', '')::bigint,
      rough_category = nullif(btrim(p_payload->>'rough_category'), ''),
      version = tx.version + 1, updated_by = p_actor_id
    WHERE tx.id = p_transaction_id RETURNING tx.* INTO v_tx;
    PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_tx.id, 'updated');
  END IF;
  v_result := jsonb_build_object('transaction_id', v_tx.id, 'entity_id', v_tx.entity_id,
    'version', v_tx.version, 'changed', v_changed);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_prepare_attachment_upload(
  p_actor_id uuid,
  p_request_id uuid,
  p_entity_id uuid,
  p_transaction_id uuid,
  p_original_filename text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attachment_id uuid := gen_random_uuid();
  v_transaction_id uuid := p_transaction_id;
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_path text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_id IS NULL OR p_declared_mime_type NOT IN
       ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_declared_size_bytes NOT BETWEEN 1 AND 15728640
     OR char_length(coalesce(p_original_filename, '')) > 240 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_attachment';
  END IF;
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_prepare_attachment_upload',
    md5(jsonb_build_object('entityId', p_entity_id, 'transactionId', p_transaction_id,
      'mime', p_declared_mime_type, 'size', p_declared_size_bytes,
      'name', p_original_filename)::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, p_entity_id);
  IF v_transaction_id IS NULL THEN
    v_transaction_id := gen_random_uuid();
    INSERT INTO public.bookkeeping_transactions (
      id, entity_id, state, source_type, created_by, updated_by
    ) VALUES (v_transaction_id, p_entity_id, 'inbox', 'upload', p_actor_id, p_actor_id);
    PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_transaction_id, 'created');
  ELSE
    SELECT tx.* INTO v_tx FROM public.bookkeeping_transactions AS tx
    WHERE tx.id = v_transaction_id AND tx.entity_id = p_entity_id FOR UPDATE;
    IF NOT FOUND OR v_tx.state = 'voided' THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  END IF;
  v_path := 'objects/' || gen_random_uuid()::text || '/' || gen_random_uuid()::text;
  INSERT INTO public.bookkeeping_attachments (
    id, entity_id, object_path, original_filename, declared_mime_type,
    declared_size_bytes, created_by
  ) VALUES (
    v_attachment_id, p_entity_id, v_path, nullif(btrim(p_original_filename), ''),
    p_declared_mime_type, p_declared_size_bytes, p_actor_id
  );
  INSERT INTO public.bookkeeping_transaction_attachments (
    entity_id, transaction_id, attachment_id, attached_by
  ) VALUES (p_entity_id, v_transaction_id, v_attachment_id, p_actor_id);
  v_result := jsonb_build_object('transaction_id', v_transaction_id,
    'attachment_id', v_attachment_id, 'bucket_id', 'bookkeeping-private',
    'object_path', v_path);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_void_company_transaction(
  p_actor_id uuid,
  p_request_id uuid,
  p_transaction_id uuid,
  p_expected_version bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_transaction_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_replay := public.bookkeeping_begin_request(p_actor_id, p_request_id,
    'bookkeeping_void_company_transaction', md5(jsonb_build_object(
      'transactionId', p_transaction_id, 'expectedVersion', p_expected_version,
      'reason', btrim(p_reason))::text));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT tx.* INTO v_tx FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_tx.entity_id);
  IF v_tx.version <> p_expected_version THEN RAISE EXCEPTION 'bookkeeping_version_conflict'; END IF;
  IF v_tx.vat_disposition = 'linked' THEN RAISE EXCEPTION 'bookkeeping_transaction_linked'; END IF;
  IF v_tx.state <> 'voided' THEN
    UPDATE public.bookkeeping_transactions AS tx SET state = 'voided',
      version = tx.version + 1, voided_at = now(), voided_by = p_actor_id,
      void_reason = btrim(p_reason), updated_by = p_actor_id
    WHERE tx.id = p_transaction_id RETURNING tx.* INTO v_tx;
    PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_tx.id, 'voided');
  END IF;
  v_result := jsonb_build_object('transaction_id', v_tx.id, 'entity_id', v_tx.entity_id,
    'version', v_tx.version, 'state', v_tx.state);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_finalize_attachment_upload(
  p_actor_id uuid,
  p_request_id uuid,
  p_attachment_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint,
  p_sha256_hex text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attachment public.bookkeeping_attachments%ROWTYPE;
  v_transaction_id uuid;
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_verified_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_verified_size_bytes NOT BETWEEN 1 AND 15728640
     OR p_sha256_hex !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'bookkeeping_invalid_attachment';
  END IF;
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_finalize_attachment_upload',
    md5(jsonb_build_object('attachmentId', p_attachment_id, 'mime', p_verified_mime_type,
      'size', p_verified_size_bytes, 'sha256', p_sha256_hex)::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT attachment.* INTO v_attachment FROM public.bookkeeping_attachments AS attachment
  WHERE attachment.id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_attachment.entity_id);
  SELECT link.transaction_id INTO STRICT v_transaction_id
  FROM public.bookkeeping_transaction_attachments AS link
  WHERE link.attachment_id = p_attachment_id;
  SELECT tx.* INTO STRICT v_tx FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = v_transaction_id FOR UPDATE;
  IF v_attachment.status = 'ready' THEN
    IF v_attachment.verified_mime_type <> p_verified_mime_type
       OR v_attachment.verified_size_bytes <> p_verified_size_bytes
       OR v_attachment.sha256_hex <> p_sha256_hex THEN
      RAISE EXCEPTION 'bookkeeping_attachment_mismatch';
    END IF;
    v_result := jsonb_build_object('transaction_id', v_tx.id,
      'entity_id', v_tx.entity_id, 'attachment_id', p_attachment_id,
      'version', v_tx.version, 'status', 'ready');
    PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;
  IF v_attachment.status <> 'pending'
     OR v_attachment.declared_mime_type <> p_verified_mime_type
     OR v_attachment.declared_size_bytes <> p_verified_size_bytes THEN
    RAISE EXCEPTION 'bookkeeping_attachment_mismatch';
  END IF;
  UPDATE public.bookkeeping_attachments SET status = 'ready',
    verified_mime_type = p_verified_mime_type,
    verified_size_bytes = p_verified_size_bytes,
    sha256_hex = p_sha256_hex, finalized_by = p_actor_id, finalized_at = now()
  WHERE id = p_attachment_id;
  UPDATE public.bookkeeping_transactions AS tx
  SET version = tx.version + 1, updated_by = p_actor_id
  WHERE tx.id = v_transaction_id RETURNING tx.* INTO v_tx;
  PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_tx.id, 'attachment_ready');
  v_result := jsonb_build_object('transaction_id', v_tx.id,
    'entity_id', v_tx.entity_id, 'attachment_id', p_attachment_id,
    'version', v_tx.version, 'status', 'ready');
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_set_transaction_vat_disposition(
  p_actor_id uuid,
  p_request_id uuid,
  p_transaction_id uuid,
  p_expected_version bigint,
  p_vat_disposition text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_vat_disposition NOT IN ('unclassified', 'not_applicable') THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_replay := public.bookkeeping_begin_request(p_actor_id, p_request_id,
    'bookkeeping_set_transaction_vat_disposition', md5(jsonb_build_object(
      'transactionId', p_transaction_id, 'expectedVersion', p_expected_version,
      'vatDisposition', p_vat_disposition)::text));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT tx.* INTO v_tx FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_tx.entity_id);
  IF v_tx.version <> p_expected_version THEN RAISE EXCEPTION 'bookkeeping_version_conflict'; END IF;
  IF v_tx.vat_disposition = 'linked' OR v_tx.state = 'voided' THEN RAISE EXCEPTION 'bookkeeping_not_allowed'; END IF;
  IF v_tx.vat_disposition <> p_vat_disposition THEN
    UPDATE public.bookkeeping_transactions AS tx SET vat_disposition = p_vat_disposition,
      version = tx.version + 1, updated_by = p_actor_id
    WHERE tx.id = p_transaction_id RETURNING tx.* INTO v_tx;
    PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_tx.id,
      CASE WHEN p_vat_disposition = 'not_applicable' THEN 'vat_not_applicable'
        ELSE 'vat_unclassified' END);
  END IF;
  v_result := jsonb_build_object('transaction_id', v_tx.id, 'entity_id', v_tx.entity_id,
    'version', v_tx.version, 'vat_disposition', v_tx.vat_disposition);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_reject_attachment_upload(
  p_actor_id uuid,
  p_request_id uuid,
  p_attachment_id uuid,
  p_rejection_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attachment public.bookkeeping_attachments%ROWTYPE;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_rejection_code NOT IN ('size_mismatch', 'mime_mismatch', 'invalid_content') THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_replay := public.bookkeeping_begin_request(p_actor_id, p_request_id,
    'bookkeeping_reject_attachment_upload', md5(jsonb_build_object(
      'attachmentId', p_attachment_id, 'rejectionCode', p_rejection_code)::text));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT attachment.* INTO v_attachment FROM public.bookkeeping_attachments AS attachment
  WHERE attachment.id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_attachment.entity_id);
  IF v_attachment.status = 'ready' THEN RAISE EXCEPTION 'bookkeeping_not_allowed'; END IF;
  IF v_attachment.status = 'pending' THEN
    UPDATE public.bookkeeping_attachments SET status = 'rejected',
      rejection_code = p_rejection_code, finalized_by = p_actor_id, finalized_at = now()
    WHERE id = p_attachment_id;
  END IF;
  v_result := jsonb_build_object('attachment_id', p_attachment_id,
    'status', 'rejected', 'rejection_code', p_rejection_code);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_link_transaction_to_vat_entry(
  p_actor_id uuid,
  p_request_id uuid,
  p_transaction_id uuid,
  p_expected_transaction_version bigint,
  p_period_id uuid,
  p_entry jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.bookkeeping_transactions%ROWTYPE;
  v_period public.bookkeeping_periods%ROWTYPE;
  v_entry_id uuid := gen_random_uuid();
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.bookkeeping_assert_entry_payload(p_entry);
  IF p_transaction_id IS NULL OR p_expected_transaction_version IS NULL
     OR p_expected_transaction_version < 1 OR p_period_id IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_replay := public.bookkeeping_begin_request(p_actor_id, p_request_id,
    'bookkeeping_link_transaction_to_vat_entry', md5(jsonb_build_object(
      'transactionId', p_transaction_id, 'expectedVersion', p_expected_transaction_version,
      'periodId', p_period_id, 'entry', p_entry - ARRAY['request_id']::text[])::text));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT tx.* INTO v_tx FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_tx.entity_id);
  IF v_tx.version <> p_expected_transaction_version THEN RAISE EXCEPTION 'bookkeeping_version_conflict'; END IF;
  IF v_tx.vat_disposition <> 'unclassified' OR v_tx.state = 'voided'
     OR EXISTS (SELECT 1 FROM public.bookkeeping_transaction_vat_links AS link
       WHERE link.transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'bookkeeping_transaction_already_classified';
  END IF;
  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF NOT FOUND OR v_period.state NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  IF v_period.entity_id <> v_tx.entity_id THEN RAISE EXCEPTION 'bookkeeping_tenant_mismatch'; END IF;

  INSERT INTO public.bookkeeping_entries (
    id, entity_id, vat_registration_id, period_id, entry_type,
    document_date, reporting_date, counterparty, description, document_type,
    document_reference, duplicate_reference_confirmed, currency, source_type,
    review_state, original_document_preserved, business_purpose_confirmed,
    seller_vat_registration_confirmed, foreign_service_state, import_state,
    mixed_use_state, uncertain_deductibility_state, special_case_resolution_note,
    note, created_by, updated_by
  ) VALUES (
    v_entry_id, v_period.entity_id, v_period.vat_registration_id, p_period_id,
    p_entry->>'type', (p_entry->>'document_date')::date, (p_entry->>'reporting_date')::date,
    nullif(btrim(p_entry->>'counterparty'), ''), btrim(p_entry->>'description'),
    nullif(btrim(p_entry->>'document_type'), ''), nullif(btrim(p_entry->>'document_reference'), ''),
    (p_entry->>'duplicate_reference_confirmed')::boolean, 'ISK', 'manual',
    p_entry->>'review_state', (p_entry->>'original_document_preserved')::boolean,
    (p_entry->>'business_purpose_confirmed')::boolean,
    CASE WHEN jsonb_typeof(p_entry->'seller_vat_registration_confirmed') = 'boolean'
      THEN (p_entry->>'seller_vat_registration_confirmed')::boolean ELSE NULL END,
    p_entry->'special_cases'->>'foreign_service', p_entry->'special_cases'->>'import',
    p_entry->'special_cases'->>'mixed_use', p_entry->'special_cases'->>'uncertain_deductibility',
    nullif(btrim(p_entry->>'special_case_resolution_note'), ''),
    nullif(btrim(p_entry->>'note'), ''), p_actor_id, p_actor_id
  );
  PERFORM public.bookkeeping_replace_entry_lines(
    p_actor_id, v_period.entity_id, p_period_id, v_entry_id, 1, p_entry
  );
  PERFORM public.bookkeeping_capture_entry_revision(p_actor_id, v_entry_id);
  PERFORM public.bookkeeping_assert_period_summary_safe(p_period_id);
  UPDATE public.bookkeeping_periods AS period SET state = 'review',
    version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = p_period_id RETURNING period.version INTO v_period.version;
  INSERT INTO public.bookkeeping_transaction_vat_links (
    transaction_id, entity_id, vat_registration_id, period_id, entry_id,
    source_transaction_version, linked_by
  ) VALUES (
    v_tx.id, v_tx.entity_id, v_period.vat_registration_id, p_period_id,
    v_entry_id, v_tx.version, p_actor_id
  );
  UPDATE public.bookkeeping_transactions AS tx SET vat_disposition = 'linked',
    state = 'reviewed', version = tx.version + 1, updated_by = p_actor_id
  WHERE tx.id = v_tx.id RETURNING tx.* INTO v_tx;
  PERFORM public.bookkeeping_capture_transaction_revision(p_actor_id, v_tx.id, 'vat_linked');
  PERFORM public.bookkeeping_record_activity(v_tx.entity_id, p_period_id, v_entry_id,
    'entry_created', p_actor_id, NULL, v_period.version, 1);
  v_result := jsonb_build_object('transaction_id', v_tx.id, 'transaction_version', v_tx.version,
    'entry_id', v_entry_id, 'entry_version', 1, 'period_id', p_period_id,
    'period_version', v_period.version);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_company_transaction_json(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.bookkeeping_transaction_snapshot(tx.id) || jsonb_build_object(
    'attachments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', attachment.id, 'status', attachment.status,
        'filename', attachment.original_filename,
        'mimeType', coalesce(attachment.verified_mime_type, attachment.declared_mime_type),
        'sizeBytes', coalesce(attachment.verified_size_bytes, attachment.declared_size_bytes),
        'createdAt', attachment.created_at
      ) ORDER BY attachment.created_at, attachment.id)
      FROM public.bookkeeping_transaction_attachments AS relation
      JOIN public.bookkeeping_attachments AS attachment ON attachment.id = relation.attachment_id
      WHERE relation.transaction_id = tx.id AND attachment.status = 'ready'
    ), '[]'::jsonb),
    'vatLink', (
      SELECT jsonb_build_object('periodId', link.period_id, 'entryId', link.entry_id,
        'sourceTransactionVersion', link.source_transaction_version,
        'linkedAt', link.linked_at,
        'hasDrift', tx.version <> link.source_transaction_version + 1)
      FROM public.bookkeeping_transaction_vat_links AS link
      WHERE link.transaction_id = tx.id
    )
  )
  FROM public.bookkeeping_transactions AS tx WHERE tx.id = p_transaction_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_company_ledger(p_actor_id uuid, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.bookkeeping_assert_owner(p_actor_id, p_entity_id);
  RETURN jsonb_build_object(
    'entity', public.bookkeeping_entity_json(p_entity_id),
    'transactions', coalesce((
      SELECT jsonb_agg(public.bookkeeping_company_transaction_json(tx.id)
        ORDER BY coalesce(tx.document_date, tx.created_at::date) DESC, tx.created_at DESC, tx.id)
      FROM public.bookkeeping_transactions AS tx
      WHERE tx.entity_id = p_entity_id
        AND (nullif(tx.description, '') IS NOT NULL OR EXISTS (
          SELECT 1 FROM public.bookkeeping_transaction_attachments AS relation
          JOIN public.bookkeeping_attachments AS attachment ON attachment.id = relation.attachment_id
          WHERE relation.transaction_id = tx.id AND attachment.status = 'ready'
        ))
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_company_transaction(p_actor_id uuid, p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id uuid;
BEGIN
  SELECT tx.entity_id INTO v_entity_id FROM public.bookkeeping_transactions AS tx
  WHERE tx.id = p_transaction_id;
  IF v_entity_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_entity_id);
  RETURN jsonb_build_object(
    'transaction', public.bookkeeping_company_transaction_json(p_transaction_id),
    'revisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('version', revision.version,
        'operation', revision.operation, 'capturedAt', revision.captured_at,
        'snapshot', revision.snapshot) ORDER BY revision.version DESC)
      FROM public.bookkeeping_transaction_revisions AS revision
      WHERE revision.transaction_id = p_transaction_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_attachment_for_download(
  p_actor_id uuid, p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attachment public.bookkeeping_attachments%ROWTYPE;
BEGIN
  SELECT attachment.* INTO v_attachment FROM public.bookkeeping_attachments AS attachment
  WHERE attachment.id = p_attachment_id AND attachment.status = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_attachment.entity_id);
  RETURN jsonb_build_object('bucket_id', v_attachment.bucket_id,
    'object_path', v_attachment.object_path, 'mime_type', v_attachment.verified_mime_type,
    'filename', v_attachment.original_filename);
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_pending_attachment_for_finalize(
  p_actor_id uuid, p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attachment public.bookkeeping_attachments%ROWTYPE;
BEGIN
  SELECT attachment.* INTO v_attachment FROM public.bookkeeping_attachments AS attachment
  WHERE attachment.id = p_attachment_id AND attachment.status IN ('pending', 'ready');
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_attachment.entity_id);
  RETURN jsonb_build_object('bucket_id', v_attachment.bucket_id,
    'object_path', v_attachment.object_path,
    'declared_mime_type', v_attachment.declared_mime_type,
    'declared_size_bytes', v_attachment.declared_size_bytes);
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeping_transaction_snapshot(uuid),
  public.bookkeeping_capture_transaction_revision(uuid,uuid,text),
  public.bookkeeping_assert_transaction_payload(jsonb),
  public.bookkeeping_company_transaction_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.bookkeeping_create_company_transaction(uuid,uuid,uuid,jsonb),
  public.bookkeeping_update_company_transaction(uuid,uuid,uuid,bigint,jsonb),
  public.bookkeeping_void_company_transaction(uuid,uuid,uuid,bigint,text),
  public.bookkeeping_prepare_attachment_upload(uuid,uuid,uuid,uuid,text,text,bigint),
  public.bookkeeping_finalize_attachment_upload(uuid,uuid,uuid,text,bigint,text),
  public.bookkeeping_reject_attachment_upload(uuid,uuid,uuid,text),
  public.bookkeeping_set_transaction_vat_disposition(uuid,uuid,uuid,bigint,text),
  public.bookkeeping_link_transaction_to_vat_entry(uuid,uuid,uuid,bigint,uuid,jsonb),
  public.bookkeeping_get_company_ledger(uuid,uuid),
  public.bookkeeping_get_company_transaction(uuid,uuid),
  public.bookkeeping_get_attachment_for_download(uuid,uuid),
  public.bookkeeping_get_pending_attachment_for_finalize(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.bookkeeping_create_company_transaction(uuid,uuid,uuid,jsonb),
  public.bookkeeping_update_company_transaction(uuid,uuid,uuid,bigint,jsonb),
  public.bookkeeping_void_company_transaction(uuid,uuid,uuid,bigint,text),
  public.bookkeeping_prepare_attachment_upload(uuid,uuid,uuid,uuid,text,text,bigint),
  public.bookkeeping_finalize_attachment_upload(uuid,uuid,uuid,text,bigint,text),
  public.bookkeeping_reject_attachment_upload(uuid,uuid,uuid,text),
  public.bookkeeping_set_transaction_vat_disposition(uuid,uuid,uuid,bigint,text),
  public.bookkeeping_link_transaction_to_vat_entry(uuid,uuid,uuid,bigint,uuid,jsonb),
  public.bookkeeping_get_company_ledger(uuid,uuid),
  public.bookkeeping_get_company_transaction(uuid,uuid),
  public.bookkeeping_get_attachment_for_download(uuid,uuid),
  public.bookkeeping_get_pending_attachment_for_finalize(uuid,uuid)
  TO service_role;

COMMENT ON TABLE public.bookkeeping_transactions IS
  'Canonical sparse company ledger inbox. Rows are outside VAT until an immutable formal link is created.';
COMMENT ON TABLE public.bookkeeping_attachments IS
  'Private source-document metadata. Binary content lives only in the private bookkeeping-private Storage bucket.';
COMMENT ON TABLE public.bookkeeping_transaction_vat_links IS
  'One-way trace from a company transaction version to a normal VAT entry. Drift is visible and never mutates the VAT entry.';

COMMIT;
