-- SQL100: Operational settlement state for bookkeeping entries.
-- Stebbi alone runs this migration after the read-only preflight is green.
-- This migration does not alter VAT amounts, entry revisions, period state,
-- readiness, A-F calculations or filing snapshots.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bookkeeping_entry_settlements (
  entry_id       uuid        PRIMARY KEY,
  entity_id      uuid        NOT NULL,
  period_id      uuid        NOT NULL,
  state          text        NOT NULL DEFAULT 'open',
  version        bigint      NOT NULL DEFAULT 1,
  settled_at     timestamptz NULL,
  settled_by     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entry_settlements_entry_fk
    FOREIGN KEY (entity_id, period_id, entry_id)
    REFERENCES public.bookkeeping_entries(entity_id, period_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_entry_settlements_state_check
    CHECK (state IN ('open', 'settled')),
  CONSTRAINT bookkeeping_entry_settlements_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_entry_settlements_lifecycle_check CHECK (
    (state = 'open' AND settled_at IS NULL AND settled_by IS NULL)
    OR (state = 'settled' AND settled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bookkeeping_entry_settlements_period_state_idx
  ON public.bookkeeping_entry_settlements (entity_id, period_id, state, entry_id);

DROP TRIGGER IF EXISTS bookkeeping_entry_settlements_reject_delete
  ON public.bookkeeping_entry_settlements;
CREATE TRIGGER bookkeeping_entry_settlements_reject_delete
  BEFORE DELETE ON public.bookkeeping_entry_settlements
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();

ALTER TABLE public.bookkeeping_entry_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_entry_settlements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bookkeeping_entry_settlements
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_constraint text;
  v_event_types text[];
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'bookkeeping_activity'
    AND constraint_row.conname = 'bookkeeping_activity_event_type_check';

  IF v_constraint IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_sql100_missing_activity_constraint';
  END IF;
  SELECT array_agg(event_match[1] ORDER BY event_match[1])
  INTO v_event_types
  FROM regexp_matches(v_constraint, '''([^'']+)''', 'g') AS event_match;
  IF NOT (
    ARRAY[
      'account_unlinked', 'entity_created', 'entry_created',
      'entry_review_changed', 'entry_updated', 'entry_voided',
      'filing_recorded', 'payment_recorded', 'period_created',
      'period_ready', 'period_reopened', 'vat_registration_added'
    ]::text[] <@ v_event_types
    AND v_event_types <@ ARRAY[
      'account_unlinked', 'entity_created', 'entry_created',
      'entry_review_changed', 'entry_settlement_changed', 'entry_updated',
      'entry_voided', 'filing_recorded', 'payment_recorded', 'period_created',
      'period_ready', 'period_reopened', 'vat_registration_added'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'bookkeeping_sql100_unexpected_activity_constraint';
  END IF;

  ALTER TABLE public.bookkeeping_activity
    DROP CONSTRAINT bookkeeping_activity_event_type_check;
  ALTER TABLE public.bookkeeping_activity
    ADD CONSTRAINT bookkeeping_activity_event_type_check CHECK (event_type IN (
      'entity_created', 'vat_registration_added', 'period_created',
      'entry_created', 'entry_updated', 'entry_review_changed', 'entry_voided',
      'entry_settlement_changed',
      'period_ready', 'filing_recorded', 'period_reopened', 'payment_recorded',
      'account_unlinked'
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_entry_json(p_entry_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', entry.id, 'entityId', entry.entity_id,
    'vatRegistrationId', entry.vat_registration_id, 'periodId', entry.period_id,
    'type', entry.entry_type, 'documentDate', entry.document_date,
    'reportingDate', entry.reporting_date, 'counterparty', entry.counterparty,
    'description', entry.description, 'documentType', entry.document_type,
    'documentReference', entry.document_reference,
    'duplicateReferenceConfirmed', entry.duplicate_reference_confirmed,
    'currency', entry.currency, 'sourceType', entry.source_type,
    'sourceId', entry.source_id, 'sourceReference', entry.source_reference,
    'reviewState', entry.review_state,
    'evidence', jsonb_build_object(
      'originalDocumentPreserved', entry.original_document_preserved,
      'businessPurposeConfirmed', entry.business_purpose_confirmed,
      'sellerVatRegistrationConfirmed', entry.seller_vat_registration_confirmed
    ),
    'specialCases', jsonb_build_object(
      'foreignService', entry.foreign_service_state,
      'import', entry.import_state,
      'mixedUse', entry.mixed_use_state,
      'uncertainDeductibility', entry.uncertain_deductibility_state
    ),
    'specialCaseResolutionNote', entry.special_case_resolution_note,
    'note', entry.note,
    'version', entry.version,
    'settlementState', coalesce(settlement.state, 'open'),
    'settlementVersion', coalesce(settlement.version, 0),
    'settledAt', settlement.settled_at,
    'voidedAt', entry.voided_at,
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', line.id, 'entryId', line.entry_id,
        'categoryCode', line.category_code, 'description', line.description,
        'vatTreatment', line.vat_treatment, 'currency', line.currency,
        'amountIncludesVat', line.amount_includes_vat,
        'grossMinor', line.gross_minor, 'netMinor', line.net_minor,
        'vatMinor', line.vat_minor,
        'inputVatDeductibility', line.input_vat_deductibility,
        'deductibleVatMinor', line.deductible_vat_minor,
        'manualVatOverride', line.manual_vat_override,
        'manualVatOverrideReason', line.manual_vat_override_reason,
        'exemptTurnoverConfirmed', line.exempt_turnover_confirmed
      ) ORDER BY line.line_no)
      FROM public.bookkeeping_entry_lines AS line
      WHERE line.entry_id = entry.id AND line.active
    ), '[]'::jsonb),
    'createdAt', entry.created_at, 'updatedAt', entry.updated_at
  )
  FROM public.bookkeeping_entries AS entry
  LEFT JOIN public.bookkeeping_entry_settlements AS settlement
    ON settlement.entry_id = entry.id
  WHERE entry.id = p_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_set_entry_settlement_state(
  p_actor_id uuid,
  p_request_id uuid,
  p_entry_id uuid,
  p_expected_settlement_version bigint,
  p_settlement_state text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.bookkeeping_entries%ROWTYPE;
  v_settlement public.bookkeeping_entry_settlements%ROWTYPE;
  v_current_state text := 'open';
  v_current_version bigint := 0;
  v_new_version bigint;
  v_settled_at timestamptz;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entry_id IS NULL OR p_expected_settlement_version IS NULL
     OR p_expected_settlement_version < 0
     OR p_settlement_state NOT IN ('open', 'settled') THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'entryId', p_entry_id,
    'expectedSettlementVersion', p_expected_settlement_version,
    'settlementState', p_settlement_state
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id,
    'bookkeeping_set_entry_settlement_state', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Serialize the sparse first-write path even if different owners act at once.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_entry_id::text, 9802)
  );
  SELECT entry.* INTO v_entry
  FROM public.bookkeeping_entries AS entry
  WHERE entry.id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_entry.entity_id);
  IF v_entry.status <> 'active' THEN RAISE EXCEPTION 'bookkeeping_not_allowed'; END IF;

  SELECT settlement.* INTO v_settlement
  FROM public.bookkeeping_entry_settlements AS settlement
  WHERE settlement.entry_id = p_entry_id
  FOR UPDATE;
  IF FOUND THEN
    v_current_state := v_settlement.state;
    v_current_version := v_settlement.version;
    v_settled_at := v_settlement.settled_at;
  END IF;
  IF v_current_version <> p_expected_settlement_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;

  IF v_current_state = p_settlement_state THEN
    v_result := jsonb_build_object(
      'entry_id', p_entry_id,
      'period_id', v_entry.period_id,
      'settlement_state', v_current_state,
      'settlement_version', v_current_version,
      'settled_at', v_settled_at
    );
    PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  v_new_version := v_current_version + 1;
  IF v_current_version = 0 THEN
    INSERT INTO public.bookkeeping_entry_settlements (
      entry_id, entity_id, period_id, state, version,
      settled_at, settled_by, updated_by
    ) VALUES (
      p_entry_id, v_entry.entity_id, v_entry.period_id,
      p_settlement_state, v_new_version,
      CASE WHEN p_settlement_state = 'settled' THEN now() ELSE NULL END,
      CASE WHEN p_settlement_state = 'settled' THEN p_actor_id ELSE NULL END,
      p_actor_id
    )
    RETURNING settled_at INTO v_settled_at;
  ELSE
    UPDATE public.bookkeeping_entry_settlements AS settlement
    SET state = p_settlement_state,
        version = v_new_version,
        settled_at = CASE WHEN p_settlement_state = 'settled' THEN now() ELSE NULL END,
        settled_by = CASE WHEN p_settlement_state = 'settled' THEN p_actor_id ELSE NULL END,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE settlement.entry_id = p_entry_id
      AND settlement.version = p_expected_settlement_version
    RETURNING settlement.settled_at INTO v_settled_at;
    IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_version_conflict'; END IF;
  END IF;

  -- Operational-only audit: no amounts, counterparties, references or notes.
  PERFORM public.bookkeeping_record_activity(
    v_entry.entity_id, v_entry.period_id, p_entry_id,
    'entry_settlement_changed', p_actor_id,
    NULL, NULL, v_entry.version,
    jsonb_build_object('from_state', v_current_state, 'to_state', p_settlement_state)
  );
  v_result := jsonb_build_object(
    'entry_id', p_entry_id,
    'period_id', v_entry.period_id,
    'settlement_state', p_settlement_state,
    'settlement_version', v_new_version,
    'settled_at', v_settled_at
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_entity_ids uuid[] := ARRAY[]::uuid[];
  v_entity_id uuid;
  v_members integer := 0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9801)
  );
  SELECT account.email INTO v_email FROM auth.users AS account
  WHERE account.id = p_user_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access
    WHERE access.feature_key = 'bokhaldid'
      AND public.normalize_email_canonical(access.email)
        = public.normalize_email_canonical(v_email);
  END IF;
  SELECT coalesce(array_agg(member.entity_id ORDER BY member.entity_id), ARRAY[]::uuid[])
  INTO v_entity_ids
  FROM public.bookkeeping_entity_members AS member
  WHERE member.user_id = p_user_id;
  PERFORM entity.id FROM public.bookkeeping_entities AS entity
  WHERE entity.id = ANY(v_entity_ids) ORDER BY entity.id FOR UPDATE;
  UPDATE public.bookkeeping_entity_members AS member
  SET user_id = NULL, status = 'unlinked'
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;
  UPDATE public.bookkeeping_entities
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_vat_registrations
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_periods
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_entries
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END,
        voided_by = CASE WHEN voided_by = p_user_id THEN NULL ELSE voided_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id OR voided_by = p_user_id;
  UPDATE public.bookkeeping_entry_settlements
    SET settled_by = CASE WHEN settled_by = p_user_id THEN NULL ELSE settled_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE settled_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_entry_lines SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bookkeeping_entry_revisions SET captured_by = NULL WHERE captured_by = p_user_id;
  UPDATE public.bookkeeping_filing_snapshots SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bookkeeping_activity SET actor_user_id = NULL WHERE actor_user_id = p_user_id;
  DELETE FROM public.bookkeeping_mutation_requests WHERE actor_user_id = p_user_id;
  FOREACH v_entity_id IN ARRAY v_entity_ids LOOP
    PERFORM public.bookkeeping_record_activity(
      v_entity_id, NULL, NULL, 'account_unlinked', NULL, NULL, NULL, NULL,
      jsonb_build_object('member_unlinked', true)
    );
  END LOOP;
  RETURN jsonb_build_object('members_unlinked', v_members);
END;
$$;

REVOKE ALL ON FUNCTION public.bookkeeping_entry_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_set_entry_settlement_state(
  uuid, uuid, uuid, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_set_entry_settlement_state(
  uuid, uuid, uuid, bigint, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_prepare_account_deletion(uuid)
  TO service_role;

COMMENT ON TABLE public.bookkeeping_entry_settlements IS
  'Operational entry settlement state. It is isolated from VAT revisions, A-F, readiness and filing snapshots; missing row means open at version 0.';

COMMIT;
