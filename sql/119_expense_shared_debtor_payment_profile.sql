-- TODO #95 / SQL119: show an owner's payment profile to an exact canonical
-- shared debtor who currently owes that owner.
--
-- This migration replaces one read-only resolver. It changes no tables,
-- policies, ledger rows, payment profiles or repayment amounts. Stebbi alone
-- runs it after the read-only preflight is green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_resolver_source text;
  v_helper_source text;
BEGIN
  IF to_regclass('public.expense_payment_profiles_v2') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_payment_profiles_v2');
  END IF;
  IF to_regclass('public.expense_group_members') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_group_members');
  END IF;
  IF to_regclass('public.expense_obligations') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_obligations');
  END IF;
  IF to_regclass('public.expense_repayments') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_repayments');
  END IF;
  IF to_regclass('public.expense_repayment_allocations') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_repayment_allocations');
  END IF;
  IF to_regclass('public.expense_share_collaborators') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_share_collaborators');
  END IF;
  IF to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_assert_beta_actor(uuid)');
  END IF;
  IF to_regprocedure('public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_actor_can_act_for_share_member(uuid,uuid,uuid)');
  END IF;
  IF to_regprocedure('public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)');
  END IF;
  IF to_regrole('service_role') IS NULL THEN
    v_missing := array_append(v_missing, 'service_role');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql119_missing_prerequisites:%', array_to_string(v_missing, ',');
  END IF;

  IF (SELECT count(*)
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'expense_resolve_payment_profile_v2') <> 1 THEN
    RAISE EXCEPTION 'sql119_unexpected_resolver_overloads';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    )
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.prorettype = 'jsonb'::regtype
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting LIKE 'search_path=%'
      )
  ) THEN
    RAISE EXCEPTION 'sql119_incompatible_resolver_security';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
    )
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'sql119_incompatible_share_authorizer_security';
  END IF;

  SELECT procedure.prosrc INTO v_resolver_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
  );
  IF v_resolver_source NOT LIKE '%public.expense_payment_profiles_v2%'
     OR v_resolver_source NOT LIKE '%public.expense_obligations%'
     OR v_resolver_source NOT LIKE '%public.expense_repayment_allocations%' THEN
    RAISE EXCEPTION 'sql119_incompatible_resolver_contract';
  END IF;

  SELECT procedure.prosrc INTO v_helper_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
  );
  IF v_helper_source NOT LIKE '%public.expense_share_collaborators%'
     OR v_helper_source NOT LIKE '%collaboration.share_member_id = p_member_id%'
     OR v_helper_source NOT LIKE '%actor_member.user_id = p_actor_id%' THEN
    RAISE EXCEPTION 'sql119_incompatible_share_authorization';
  END IF;
END;
$preflight$;

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
  ) THEN
    RETURN NULL;
  END IF;

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
  IF v_to_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(obligation.amount_minor), 0) - coalesce((
    SELECT sum(allocation.amount_minor)
    FROM public.expense_repayment_allocations AS allocation
    JOIN public.expense_repayments AS repayment
      ON repayment.id = allocation.repayment_id
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
  IF v_outstanding <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = v_to_user_id;
  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
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
