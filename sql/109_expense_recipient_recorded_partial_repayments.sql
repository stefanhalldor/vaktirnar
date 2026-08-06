-- SQL109: recipient-recorded partial repayments.
--
-- The exact recipient (or an owner/admin acting for an unregistered invited
-- recipient) may record money already received. The repayment is confirmed
-- immediately, remains an immutable ledger event and is bounded by the current
-- settlement after both confirmed and reported repayments.
-- Stebbi alone runs this migration after the read-only preflight is green.

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.expense_groups') IS NULL THEN v_missing := array_append(v_missing, 'expense_groups'); END IF;
  IF to_regclass('public.expense_group_members') IS NULL THEN v_missing := array_append(v_missing, 'expense_group_members'); END IF;
  IF to_regclass('public.expense_obligations') IS NULL THEN v_missing := array_append(v_missing, 'expense_obligations'); END IF;
  IF to_regclass('public.expense_repayments') IS NULL THEN v_missing := array_append(v_missing, 'expense_repayments'); END IF;
  IF to_regclass('public.expense_repayment_allocations') IS NULL THEN v_missing := array_append(v_missing, 'expense_repayment_allocations'); END IF;
  IF to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_assert_beta_actor'); END IF;
  IF to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'expense_begin_request'); END IF;
  IF to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL THEN v_missing := array_append(v_missing, 'expense_finish_request'); END IF;
  IF to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_active_member_role'); END IF;
  IF to_regprocedure('public.expense_simplified_settlement(uuid,text,boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_simplified_settlement'); END IF;
  IF to_regprocedure('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_record_activity'); END IF;
  IF to_regprocedure('public.expense_attach_encrypted_payment_snapshot()') IS NULL THEN v_missing := array_append(v_missing, 'expense_attach_encrypted_payment_snapshot'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'SQL109 prerequisites missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- A recipient-recorded payment is already complete. It must not capture the
-- recipient's payment instructions: those are needed only while a debtor is
-- reporting an outside payment.
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
  IF NEW.status <> 'reported' THEN
    NEW.payment_preference_snapshot := NULL;
    NEW.payment_profile_encrypted_snapshot := NULL;
    RETURN NEW;
  END IF;

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
    NEW.payment_preference_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_record_received_repayment(
  p_actor_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_expected_financial_version bigint,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_note text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_from public.expense_group_members%ROWTYPE;
  v_to public.expense_group_members%ROWTYPE;
  v_role text;
  v_available bigint;
  v_obligation_id uuid := gen_random_uuid();
  v_repayment_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL OR p_group_id IS NULL
     OR p_from_member_id IS NULL OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
     OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency !~ '^[A-Z]{3}$'
     OR p_occurred_on IS NULL
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'fromMemberId', p_from_member_id,
    'toMemberId', p_to_member_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'occurredOn', p_occurred_on,
    'note', NULLIF(btrim(p_note), '')
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_record_received_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Keep the global order: actor mutation lock (inside begin_request), then
  -- the group row. The financial version is a CAS guard against stale dialogs.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling')
     OR v_group.financial_version <> p_expected_financial_version
     OR v_role IS NULL THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;

  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_from_member_id
    AND member.status IN ('active', 'invited');
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_to_member_id
    AND member.status IN ('active', 'invited');

  IF v_from.id IS NULL OR v_to.id IS NULL OR NOT (
    (v_to.status = 'active' AND v_to.user_id = p_actor_id)
    OR (
      (v_to.user_id IS NULL OR v_to.status = 'invited')
      AND coalesce(v_role, '') IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  -- Include pending reports. The recipient can record only genuinely free
  -- remainder and can never duplicate a reported or confirmed amount.
  SELECT settlement.amount_minor INTO v_available
  FROM public.expense_simplified_settlement(p_group_id, p_currency, true) AS settlement
  WHERE settlement.from_member_id = p_from_member_id
    AND settlement.to_member_id = p_to_member_id
  LIMIT 1;
  IF v_available IS NULL OR p_amount_minor > v_available THEN
    RAISE EXCEPTION 'expense_repayment_exceeds_available';
  END IF;

  INSERT INTO public.expense_obligations (
    id, group_id, from_member_id, to_member_id, amount_minor, currency
  ) VALUES (
    v_obligation_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency
  );
  INSERT INTO public.expense_repayments (
    id, group_id, from_member_id, to_member_id, amount_minor, currency,
    occurred_on, note, status, reported_by, payment_preference_snapshot,
    payment_profile_encrypted_snapshot
  ) VALUES (
    v_repayment_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency, p_occurred_on, NULLIF(btrim(p_note), ''),
    'confirmed', p_actor_id, NULL, NULL
  );
  INSERT INTO public.expense_repayment_allocations (
    group_id, repayment_id, obligation_id, amount_minor
  ) VALUES (p_group_id, v_repayment_id, v_obligation_id, p_amount_minor);

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_repayment_confirmed',
    'expense_repayment', v_repayment_id, 'expense_repayment_confirmed',
    NULL, v_group.name, ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object(
    'repayment_id', v_repayment_id,
    'group_id', p_group_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_record_received_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_record_received_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_attach_encrypted_payment_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.expense_record_received_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) IS 'Recipient-authorized, CAS/idempotency-guarded direct confirmation of a bounded partial repayment.';

COMMIT;
