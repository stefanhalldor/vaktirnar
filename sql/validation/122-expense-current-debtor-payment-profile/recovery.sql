-- SQL122 emergency recovery.
-- Restores the SQL119 repayment-obligation predicate. This changes no rows,
-- but encrypted current payment details may again be unavailable before a
-- repayment obligation exists. Run only as a deliberate emergency rollback.

BEGIN;

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
SET search_path = ''
AS $$
DECLARE
  v_to_user_id uuid;
  v_profile public.expense_payment_profiles_v2%ROWTYPE;
  v_outstanding bigint;
BEGIN
  IF p_actor_id IS NULL OR p_group_id IS NULL
     OR p_from_member_id IS NULL OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RETURN NULL;
  END IF;
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF NOT public.expense_actor_can_act_for_share_member(
    p_actor_id, p_group_id, p_from_member_id
  ) THEN RETURN NULL; END IF;
  SELECT creditor.user_id INTO v_to_user_id
  FROM public.expense_group_members AS debtor
  JOIN public.expense_group_members AS creditor
    ON creditor.group_id = debtor.group_id
   AND creditor.id = p_to_member_id
   AND creditor.status = 'active'
   AND creditor.user_id IS NOT NULL
  WHERE debtor.group_id = p_group_id
    AND debtor.id = p_from_member_id
    AND debtor.status = 'active';
  IF v_to_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(sum(obligation.amount_minor), 0) - coalesce((
    SELECT sum(allocation.amount_minor)
    FROM public.expense_repayment_allocations AS allocation
    JOIN public.expense_repayments AS repayment ON repayment.id = allocation.repayment_id
    JOIN public.expense_obligations AS allocated_obligation
      ON allocated_obligation.id = allocation.obligation_id
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
  RETURN pg_catalog.jsonb_build_object(
    'profile_id', v_profile.id,
    'owner_user_id', v_profile.owner_user_id,
    'version', v_profile.version,
    'envelope', v_profile.encrypted_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expense_resolve_payment_profile_v2(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_payment_profile_v2(
  uuid, uuid, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.expense_resolve_payment_profile_v2(
  uuid, uuid, uuid, uuid, text
) IS 'Returns the creditor encrypted payment profile only to an exact direct or canonical shared debtor with positive outstanding debt.';

COMMIT;
