-- SQL107: One encrypted payment profile per expense user.
--
-- Additive only. The encryption key never enters PostgreSQL; the app stores
-- authenticated ciphertext envelopes produced by server-only Node code.
-- Stebbi alone runs this migration after the read-only preflight is green.

BEGIN;

CREATE OR REPLACE FUNCTION public.expense_valid_payment_envelope(p_envelope jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce((
    jsonb_typeof(p_envelope) = 'object'
    AND (p_envelope - ARRAY['v', 'alg', 'kid', 'iv', 'ciphertext', 'tag']::text[]) = '{}'::jsonb
    AND p_envelope ?& ARRAY['v', 'alg', 'kid', 'iv', 'ciphertext', 'tag']::text[]
    AND p_envelope->>'v' = '1'
    AND p_envelope->>'alg' = 'A256GCM'
    AND (p_envelope->>'kid') ~ '^[A-Za-z0-9._-]{1,40}$'
    AND (p_envelope->>'iv') ~ '^[A-Za-z0-9_-]{16}$'
    AND char_length(p_envelope->>'ciphertext') BETWEEN 2 AND 4096
    AND (p_envelope->>'ciphertext') ~ '^[A-Za-z0-9_-]+$'
    AND char_length(p_envelope->>'tag') BETWEEN 20 AND 24
    AND (p_envelope->>'tag') ~ '^[A-Za-z0-9_-]+$'
  ), false);
$$;

CREATE TABLE IF NOT EXISTS public.expense_payment_profiles_v2 (
  id                  uuid        PRIMARY KEY,
  owner_user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_details   jsonb       NOT NULL,
  payload_fingerprint text        NOT NULL,
  version             bigint      NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_payment_profiles_v2_owner_unique UNIQUE (owner_user_id),
  CONSTRAINT expense_payment_profiles_v2_envelope_check
    CHECK (public.expense_valid_payment_envelope(encrypted_details)),
  CONSTRAINT expense_payment_profiles_v2_fingerprint_check
    CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT expense_payment_profiles_v2_version_check CHECK (version > 0)
);

ALTER TABLE public.expense_repayments
  ADD COLUMN IF NOT EXISTS payment_profile_encrypted_snapshot jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_repayments'::regclass
      AND conname = 'expense_repayments_encrypted_snapshot_check'
  ) THEN
    ALTER TABLE public.expense_repayments
      ADD CONSTRAINT expense_repayments_encrypted_snapshot_check CHECK (
        payment_profile_encrypted_snapshot IS NULL
        OR (
          jsonb_typeof(payment_profile_encrypted_snapshot) = 'object'
          AND (payment_profile_encrypted_snapshot - ARRAY[
            'profile_id', 'owner_user_id', 'profile_version', 'captured_at', 'envelope'
          ]::text[]) = '{}'::jsonb
          AND payment_profile_encrypted_snapshot ?& ARRAY[
            'profile_id', 'owner_user_id', 'profile_version', 'captured_at', 'envelope'
          ]::text[]
          AND (payment_profile_encrypted_snapshot->>'profile_id') ~* '^[0-9a-f-]{36}$'
          AND (payment_profile_encrypted_snapshot->>'owner_user_id') ~* '^[0-9a-f-]{36}$'
          AND (payment_profile_encrypted_snapshot->>'profile_version') ~ '^[1-9][0-9]*$'
          AND public.expense_valid_payment_envelope(payment_profile_encrypted_snapshot->'envelope')
        )
      ) NOT VALID;
    ALTER TABLE public.expense_repayments
      VALIDATE CONSTRAINT expense_repayments_encrypted_snapshot_check;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS expense_payment_profiles_v2_owner_idx
  ON public.expense_payment_profiles_v2 (owner_user_id);

DROP TRIGGER IF EXISTS expense_payment_profiles_v2_touch_updated_at
  ON public.expense_payment_profiles_v2;
CREATE TRIGGER expense_payment_profiles_v2_touch_updated_at
  BEFORE UPDATE ON public.expense_payment_profiles_v2
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

CREATE OR REPLACE FUNCTION public.expense_scrub_v2_snapshots_after_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- A user-initiated profile clear preserves immutable historical snapshots.
  -- A cascading delete from auth.users scrubs the former user's payment data.
  IF NOT EXISTS (SELECT 1 FROM auth.users AS account WHERE account.id = OLD.owner_user_id) THEN
    UPDATE public.expense_repayments AS repayment
    SET payment_profile_encrypted_snapshot = NULL
    WHERE repayment.payment_profile_encrypted_snapshot->>'owner_user_id' = OLD.owner_user_id::text;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS expense_payment_profiles_v2_account_delete_scrub
  ON public.expense_payment_profiles_v2;
CREATE TRIGGER expense_payment_profiles_v2_account_delete_scrub
  AFTER DELETE ON public.expense_payment_profiles_v2
  FOR EACH ROW EXECUTE FUNCTION public.expense_scrub_v2_snapshots_after_account_delete();

CREATE OR REPLACE FUNCTION public.expense_attach_encrypted_payment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner_id uuid;
  v_profile public.expense_payment_profiles_v2%ROWTYPE;
BEGIN
  SELECT member.user_id INTO v_owner_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = NEW.group_id
    AND member.id = NEW.to_member_id
    AND member.status = 'active';

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = v_owner_id;

  IF v_profile.id IS NOT NULL THEN
    NEW.payment_profile_encrypted_snapshot := jsonb_build_object(
      'profile_id', v_profile.id,
      'owner_user_id', v_profile.owner_user_id,
      'profile_version', v_profile.version,
      'captured_at', now(),
      'envelope', v_profile.encrypted_details
    );
    -- New writes never duplicate decrypted data into the legacy snapshot.
    NEW.payment_preference_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_repayments_encrypted_snapshot
  ON public.expense_repayments;
CREATE TRIGGER expense_repayments_encrypted_snapshot
  BEFORE INSERT ON public.expense_repayments
  FOR EACH ROW EXECUTE FUNCTION public.expense_attach_encrypted_payment_snapshot();

CREATE OR REPLACE FUNCTION public.expense_save_payment_profile_v2(
  p_actor_id uuid,
  p_profile_id uuid,
  p_expected_version bigint,
  p_envelope jsonb,
  p_payload_fingerprint text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_replay jsonb;
  v_result jsonb;
  v_existing public.expense_payment_profiles_v2%ROWTYPE;
  v_version bigint;
BEGIN
  IF p_actor_id IS NULL OR p_profile_id IS NULL
     OR NOT public.expense_valid_payment_envelope(p_envelope)
     OR p_payload_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'save_payment_profile_v2',
    md5(concat_ws('|', p_profile_id::text, coalesce(p_expected_version::text, ''), p_payload_fingerprint))
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT profile.* INTO v_existing
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = p_actor_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'expense_conflict'; END IF;
    INSERT INTO public.expense_payment_profiles_v2 (
      id, owner_user_id, encrypted_details, payload_fingerprint
    ) VALUES (
      p_profile_id, p_actor_id, p_envelope, p_payload_fingerprint
    );
    v_version := 1;
  ELSE
    IF v_existing.id <> p_profile_id
       OR p_expected_version IS NULL
       OR v_existing.version <> p_expected_version THEN
      RAISE EXCEPTION 'expense_conflict';
    END IF;
    UPDATE public.expense_payment_profiles_v2 AS profile
    SET encrypted_details = p_envelope,
        payload_fingerprint = p_payload_fingerprint,
        version = profile.version + 1
    WHERE profile.id = p_profile_id
      AND profile.owner_user_id = p_actor_id
      AND profile.version = p_expected_version
    RETURNING profile.version INTO v_version;
    IF v_version IS NULL THEN RAISE EXCEPTION 'expense_conflict'; END IF;
  END IF;

  v_result := jsonb_build_object('profile_id', p_profile_id, 'version', v_version);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_clear_payment_profile_v2(
  p_actor_id uuid,
  p_profile_id uuid,
  p_expected_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_replay jsonb;
  v_result jsonb := jsonb_build_object('cleared', true);
  v_deleted bigint;
BEGIN
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'clear_payment_profile_v2',
    md5(concat_ws('|', p_profile_id::text, p_expected_version::text))
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  DELETE FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.id = p_profile_id
    AND profile.owner_user_id = p_actor_id
    AND profile.version = p_expected_version;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'expense_conflict'; END IF;

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_convert_legacy_payment_profile_v2(
  p_actor_id uuid,
  p_profile_id uuid,
  p_envelope jsonb,
  p_payload_fingerprint text,
  p_encrypted_snapshots jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_replay jsonb;
  v_result jsonb;
  v_mapping jsonb;
  v_repayment_id uuid;
  v_snapshot jsonb;
  v_expected_count bigint;
  v_updated_count bigint := 0;
BEGIN
  IF p_actor_id IS NULL OR p_profile_id IS NULL
     OR NOT public.expense_valid_payment_envelope(p_envelope)
     OR p_payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_encrypted_snapshots) <> 'array'
     OR jsonb_array_length(p_encrypted_snapshots) > 500 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'convert_legacy_payment_profile_v2',
    md5(concat_ws('|', p_profile_id::text, p_payload_fingerprint, jsonb_array_length(p_encrypted_snapshots)::text))
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF EXISTS (SELECT 1 FROM public.expense_payment_profiles_v2 WHERE owner_user_id = p_actor_id) THEN
    RAISE EXCEPTION 'expense_conflict';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.expense_repayments AS repayment
  WHERE repayment.payment_preference_snapshot->>'owner_user_id' = p_actor_id::text;
  IF v_expected_count <> jsonb_array_length(p_encrypted_snapshots) THEN
    RAISE EXCEPTION 'expense_conflict';
  END IF;

  FOR v_mapping IN SELECT value FROM jsonb_array_elements(p_encrypted_snapshots)
  LOOP
    IF jsonb_typeof(v_mapping) <> 'object'
       OR NOT (v_mapping ?& ARRAY['repayment_id', 'snapshot']::text[]) THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    v_repayment_id := (v_mapping->>'repayment_id')::uuid;
    v_snapshot := v_mapping->'snapshot';
    IF jsonb_typeof(v_snapshot) <> 'object'
       OR NOT public.expense_valid_payment_envelope(v_snapshot->'envelope')
       OR v_snapshot->>'owner_user_id' IS DISTINCT FROM p_actor_id::text THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    UPDATE public.expense_repayments AS repayment
    SET payment_profile_encrypted_snapshot = v_snapshot,
        payment_preference_snapshot = NULL
    WHERE repayment.id = v_repayment_id
      AND repayment.payment_preference_snapshot->>'owner_user_id' = p_actor_id::text
      AND repayment.payment_preference_snapshot->>'source_preference_id' = v_snapshot->>'profile_id'
      AND repayment.payment_preference_snapshot->>'source_version' = v_snapshot->>'profile_version';
    IF FOUND THEN v_updated_count := v_updated_count + 1; ELSE RAISE EXCEPTION 'expense_conflict'; END IF;
  END LOOP;
  IF v_updated_count <> v_expected_count OR EXISTS (
    SELECT 1 FROM public.expense_repayments
    WHERE payment_preference_snapshot->>'owner_user_id' = p_actor_id::text
  ) THEN RAISE EXCEPTION 'expense_conflict'; END IF;

  DELETE FROM public.expense_payment_preference_assignments WHERE owner_user_id = p_actor_id;
  DELETE FROM public.expense_payment_preferences WHERE owner_user_id = p_actor_id;
  INSERT INTO public.expense_payment_profiles_v2(id, owner_user_id, encrypted_details, payload_fingerprint)
  VALUES (p_profile_id, p_actor_id, p_envelope, p_payload_fingerprint);
  v_result := jsonb_build_object('profile_id', p_profile_id, 'version', 1, 'converted_snapshots', v_updated_count);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_resolve_payment_profile_v2(
  p_actor_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_from_user_id uuid;
  v_to_user_id uuid;
  v_profile public.expense_payment_profiles_v2%ROWTYPE;
  v_outstanding bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT member.user_id INTO v_from_user_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_from_member_id AND member.status = 'active';
  SELECT member.user_id INTO v_to_user_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_to_member_id AND member.status = 'active';
  IF v_from_user_id IS DISTINCT FROM p_actor_id OR v_to_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(obligation.amount_minor), 0) - coalesce((
    SELECT sum(allocation.amount_minor)
    FROM public.expense_repayment_allocations AS allocation
    JOIN public.expense_repayments AS repayment ON repayment.id = allocation.repayment_id
    JOIN public.expense_obligations AS allocated_obligation ON allocated_obligation.id = allocation.obligation_id
    WHERE allocated_obligation.group_id = p_group_id
      AND allocated_obligation.from_member_id = p_from_member_id
      AND allocated_obligation.to_member_id = p_to_member_id
      AND allocated_obligation.currency = p_currency
      AND repayment.status IN ('reported', 'confirmed')
  ), 0) INTO v_outstanding
  FROM public.expense_obligations AS obligation
  WHERE obligation.group_id = p_group_id
    AND obligation.from_member_id = p_from_member_id
    AND obligation.to_member_id = p_to_member_id
    AND obligation.currency = p_currency;
  IF v_outstanding <= 0 THEN RETURN NULL; END IF;

  SELECT profile.* INTO v_profile
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = v_to_user_id;
  IF v_profile.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'profile_id', v_profile.id,
    'owner_user_id', v_profile.owner_user_id,
    'version', v_profile.version,
    'envelope', v_profile.encrypted_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_resolve_repayment_payment_snapshot_v2(
  p_actor_id uuid,
  p_repayment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_repayment public.expense_repayments%ROWTYPE;
  v_from_user_id uuid;
  v_to_user_id uuid;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT repayment.* INTO v_repayment
  FROM public.expense_repayments AS repayment
  WHERE repayment.id = p_repayment_id;
  IF v_repayment.id IS NULL OR v_repayment.payment_profile_encrypted_snapshot IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT member.user_id INTO v_from_user_id FROM public.expense_group_members AS member
  WHERE member.group_id = v_repayment.group_id AND member.id = v_repayment.from_member_id;
  SELECT member.user_id INTO v_to_user_id FROM public.expense_group_members AS member
  WHERE member.group_id = v_repayment.group_id AND member.id = v_repayment.to_member_id;
  IF p_actor_id IS DISTINCT FROM v_from_user_id AND p_actor_id IS DISTINCT FROM v_to_user_id THEN
    RETURN NULL;
  END IF;
  RETURN v_repayment.payment_profile_encrypted_snapshot;
END;
$$;

ALTER TABLE public.expense_payment_profiles_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payment_profiles_v2 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_payment_profiles_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.expense_payment_profiles_v2 TO service_role;

REVOKE ALL ON FUNCTION public.expense_valid_payment_envelope(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_attach_encrypted_payment_snapshot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_scrub_v2_snapshots_after_account_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_save_payment_profile_v2(uuid, uuid, bigint, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_clear_payment_profile_v2(uuid, uuid, bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_convert_legacy_payment_profile_v2(uuid, uuid, jsonb, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_payment_profile_v2(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_repayment_payment_snapshot_v2(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_save_payment_profile_v2(uuid, uuid, bigint, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_clear_payment_profile_v2(uuid, uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_convert_legacy_payment_profile_v2(uuid, uuid, jsonb, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_payment_profile_v2(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_repayment_payment_snapshot_v2(uuid, uuid) TO service_role;

COMMENT ON TABLE public.expense_payment_profiles_v2 IS
  'One encrypted-at-rest payment profile per owner. Keys live outside PostgreSQL.';

COMMIT;
