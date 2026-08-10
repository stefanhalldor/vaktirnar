-- SQL122: expose an encrypted payment profile to every exact current debtor.
--
-- SQL119 correctly added canonical shared-debtor authorization, but its debt
-- predicate inspected repayment obligations. Those immutable rows are created
-- only when a repayment is reported/recorded, so they are not the source of
-- truth for the unpaid settlement shown by "Gera allt upp". This function-only
-- migration uses the same live simplified settlement as the payment action.
-- It changes no rows, tables, RLS policies or table grants.

BEGIN;

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_resolver_source text;
  v_authorizer_source text;
BEGIN
  IF pg_catalog.to_regclass('public.expense_payment_profiles_v2') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_payment_profiles_v2');
  END IF;
  IF pg_catalog.to_regclass('public.expense_group_members') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_group_members');
  END IF;
  IF pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_assert_beta_actor(uuid)');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
    );
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_simplified_settlement(uuid,text,boolean)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_simplified_settlement(uuid,text,boolean)'
    );
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    );
  END IF;
  IF pg_catalog.to_regrole('service_role') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'service_role');
  END IF;
  IF pg_catalog.cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql122_missing_prerequisites:%', pg_catalog.array_to_string(v_missing, ',');
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'expense_resolve_payment_profile_v2') <> 1 THEN
    RAISE EXCEPTION 'sql122_unexpected_resolver_overloads';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
      'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    )
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.prorettype = 'jsonb'::pg_catalog.regtype
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'sql122_incompatible_resolver_security';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
      'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
    )
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND EXISTS (
        SELECT 1 FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'sql122_incompatible_share_authorizer_security';
  END IF;
  SELECT procedure.prosrc INTO v_authorizer_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
  );
  IF v_authorizer_source NOT LIKE '%public.expense_share_collaborators%'
     OR v_authorizer_source NOT LIKE '%collaboration.share_member_id = p_member_id%'
     OR v_authorizer_source NOT LIKE '%actor_member.user_id = p_actor_id%' THEN
    RAISE EXCEPTION 'sql122_incompatible_share_authorizer_contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure(
      'public.expense_simplified_settlement(uuid,text,boolean)'
    )
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND EXISTS (
        SELECT 1 FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'sql122_incompatible_simplified_settlement_security';
  END IF;

  SELECT procedure.prosrc INTO v_resolver_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
  );
  IF v_resolver_source NOT LIKE '%public.expense_payment_profiles_v2%'
     OR v_resolver_source NOT LIKE '%public.expense_actor_can_act_for_share_member%' THEN
    RAISE EXCEPTION 'sql122_incompatible_resolver_contract';
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
  v_available bigint;
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

  SELECT settlement.amount_minor INTO v_available
  FROM public.expense_simplified_settlement(
    p_group_id, p_currency, true
  ) AS settlement
  WHERE settlement.from_member_id = p_from_member_id
    AND settlement.to_member_id = p_to_member_id
    AND settlement.amount_minor > 0
  LIMIT 1;
  IF v_available IS NULL OR v_available <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = v_to_user_id;
  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

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
) IS 'Returns the exact creditor encrypted payment profile only to a direct or canonical shared debtor in the current positive simplified settlement.';

COMMIT;
