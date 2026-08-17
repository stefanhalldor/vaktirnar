-- SQL140: attendee-safe Event expense activity and optional global settlement labels.
-- Additive DB-first migration. It writes no financial or membership data.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user AND role_row.rolsuper
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_activity_executor_invalid';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_activity_relation_missing';
  END IF;
  IF pg_catalog.to_regprocedure('public.teskeid_event_assert_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_financial_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_normalize_text(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_valid_text(text,integer,integer)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_group_balances(uuid,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_get_expense_preview(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_activity_function_missing';
  END IF;
  IF NOT COALESCE((
    SELECT pg_catalog.md5(pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'))
             = '377b2f0520cbbf0345b6da864846e96e'
      AND owner_role.rolname = 'postgres'
      AND function_row.prosecdef
      AND function_row.prokind = 'f'
      AND NOT function_row.proretset
      AND function_row.provolatile = 's'
      AND function_row.proparallel = 'u'
      AND NOT function_row.proisstrict
      AND NOT function_row.proleakproof
      AND function_row.pronargdefaults = 0
      AND function_row.prolang = (
        SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
        WHERE language_row.lanname = 'plpgsql'
      )
      AND pg_catalog.pg_get_function_arguments(function_row.oid)
            = 'p_actor_id uuid, p_event_id uuid'
      AND pg_catalog.pg_get_function_result(function_row.oid) = 'jsonb'
      AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_row.proowner
    WHERE function_row.oid = pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_preview(uuid,uuid)'
    )
  ), false) THEN
    RAISE EXCEPTION 'teskeid_event_expense_preview_contract_drift';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.pronamespace = 'public'::pg_catalog.regnamespace
      AND function_row.proname IN (
        'teskeid_event_get_expense_activity',
        'teskeid_event_get_expense_context_labels'
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_activity_target_exists';
  END IF;
END;
$preflight$;

-- Exact allowlist projection for Event owner or an exact active attendee.
-- It emits no Expense/Event/member identifiers, no emails, no instructions,
-- no shares and no debt vectors for anyone except the signed-in actor.
CREATE FUNCTION public.teskeid_event_get_expense_activity(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_active_count integer;
  v_expenses jsonb := '[]'::jsonb;
  v_positions jsonb := '[]'::jsonb;
  v_currency text;
  v_actor_balance numeric;
  v_pending boolean;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
      AND (
        event_row.owner_user_id = p_actor_id
        OR EXISTS (
          SELECT 1
          FROM public.teskeid_event_attendance_memberships AS membership
          JOIN public.teskeid_event_guests AS guest
            ON guest.event_id = membership.event_id
           AND guest.id = membership.event_guest_id
           AND guest.status = 'active'
           AND guest.linked_user_id = membership.user_id
          WHERE membership.event_id = event_row.id
            AND membership.user_id = p_actor_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_active_count
  FROM (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
     AND expense.status = 'active'
    WHERE link.event_id = p_event_id
    ORDER BY expense.incurred_on DESC, expense.created_at DESC, expense.id DESC
    LIMIT 101
  ) AS bounded_expense;

  IF v_active_count > 100 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'unavailable', 'expenses', '[]'::jsonb, 'positions', '[]'::jsonb
    );
  END IF;
  IF v_active_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'none', 'expenses', '[]'::jsonb, 'positions', '[]'::jsonb
    );
  END IF;

  -- A displayed amount must reconcile to one bounded payer list. Fail closed
  -- instead of presenting a partial or internally inconsistent ledger row.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
     AND expense.status = 'active'
    WHERE link.event_id = p_event_id
      AND (
        (SELECT pg_catalog.count(*) FROM public.expense_payments AS payment
         WHERE payment.group_id = link.group_id
           AND payment.expense_id = link.expense_id) NOT BETWEEN 1 AND 50
        OR (SELECT COALESCE(pg_catalog.sum(payment.amount_minor), 0)
            FROM public.expense_payments AS payment
            WHERE payment.group_id = link.group_id
              AND payment.expense_id = link.expense_id) <> expense.total_minor
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'unavailable', 'expenses', '[]'::jsonb, 'positions', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'title', candidate.title,
      'description', candidate.description,
      'total_minor', candidate.total_minor,
      'currency', candidate.currency,
      'payers', candidate.payers
    ) ORDER BY candidate.incurred_on DESC, candidate.created_at DESC, candidate.expense_id DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM (
    SELECT expense.id AS expense_id,
      expense.title,
      expense.note AS description,
      expense.total_minor,
      expense.currency,
      expense.incurred_on,
      expense.created_at,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'display_name', CASE
              WHEN public.teskeid_event_valid_text(
                public.teskeid_event_normalize_text(member.display_name), 1, 120
              )
              AND pg_catalog.strpos(
                public.teskeid_event_normalize_text(member.display_name), '@'
              ) = 0
              THEN public.teskeid_event_normalize_text(member.display_name)
              ELSE NULL
            END,
            'amount_minor', payment.amount_minor
          ) ORDER BY payment.member_id
        )
        FROM public.expense_payments AS payment
        JOIN public.expense_group_members AS member
          ON member.group_id = payment.group_id
         AND member.id = payment.member_id
        WHERE payment.group_id = link.group_id
          AND payment.expense_id = link.expense_id
      ), '[]'::jsonb) AS payers
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
     AND expense.status = 'active'
    WHERE link.event_id = p_event_id
  ) AS candidate;

  FOR v_currency IN
    SELECT DISTINCT expense.currency
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
     AND expense.status = 'active'
    WHERE link.event_id = p_event_id
    ORDER BY expense.currency
  LOOP
    SELECT COALESCE(pg_catalog.sum(balance.amount_minor), 0)
    INTO v_actor_balance
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
     AND expense.status = 'active'
     AND expense.currency = v_currency
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = link.group_id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    JOIN LATERAL public.expense_group_balances(link.group_id, false) AS balance
      ON balance.member_id = actor_member.id
     AND balance.currency = v_currency
    WHERE link.event_id = p_event_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expenses AS expense
        ON expense.group_id = link.group_id
       AND expense.id = link.expense_id
       AND expense.status = 'active'
       AND expense.currency = v_currency
      JOIN public.expense_group_members AS actor_member
        ON actor_member.group_id = link.group_id
       AND actor_member.user_id = p_actor_id
       AND actor_member.status = 'active'
      JOIN public.expense_repayments AS repayment
        ON repayment.group_id = link.group_id
       AND repayment.currency = v_currency
       AND repayment.status = 'reported'
       AND actor_member.id IN (repayment.from_member_id, repayment.to_member_id)
      WHERE link.event_id = p_event_id
    ) INTO v_pending;

    IF NOT v_pending
       AND (v_actor_balance > 9007199254740991 OR v_actor_balance < -9007199254740991) THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'unavailable', 'expenses', '[]'::jsonb, 'positions', '[]'::jsonb
      );
    END IF;

    v_positions := v_positions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'currency', v_currency,
        'state', CASE
          WHEN v_pending THEN 'pending'
          WHEN v_actor_balance < 0 THEN 'owes'
          WHEN v_actor_balance > 0 THEN 'owed'
          ELSE 'zero'
        END,
        'amount_minor', CASE
          WHEN v_pending THEN 0
          ELSE pg_catalog.abs(v_actor_balance)::bigint
        END
      )
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ready', 'expenses', v_expenses, 'positions', v_positions
  );
END;
$function$;

-- Optional display attribution for the already-authorized global pay-all
-- contexts. Event names are returned only when the actor is both an active
-- Expense member and the Event owner or an exact active attendee.
CREATE FUNCTION public.teskeid_event_get_expense_context_labels(
  p_actor_id uuid,
  p_group_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_labels jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_group_ids IS NULL
     OR pg_catalog.cardinality(p_group_ids) > 100
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_group_ids) AS input(group_id)
       WHERE input.group_id IS NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  IF pg_catalog.cardinality(p_group_ids) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('labels', v_labels);
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'group_id', candidate.group_id,
      'event_name', candidate.event_name
    ) ORDER BY candidate.event_name, candidate.group_id
  ), '[]'::jsonb)
  INTO v_labels
  FROM (
    SELECT DISTINCT link.group_id, event_row.name AS event_name
    FROM pg_catalog.unnest(p_group_ids) AS input(group_id)
    JOIN public.teskeid_event_expense_links AS link
      ON link.group_id = input.group_id
    JOIN public.teskeid_events AS event_row
      ON event_row.id = link.event_id
    WHERE EXISTS (
      SELECT 1
      FROM public.expense_group_members AS actor_member
      WHERE actor_member.group_id = link.group_id
        AND actor_member.user_id = p_actor_id
        AND actor_member.status = 'active'
    )
      AND (
        event_row.owner_user_id = p_actor_id
        OR EXISTS (
          SELECT 1
          FROM public.teskeid_event_attendance_memberships AS membership
          JOIN public.teskeid_event_guests AS guest
            ON guest.event_id = membership.event_id
           AND guest.id = membership.event_guest_id
           AND guest.status = 'active'
           AND guest.linked_user_id = membership.user_id
          WHERE membership.event_id = event_row.id
            AND membership.user_id = p_actor_id
        )
      )
  ) AS candidate;

  RETURN pg_catalog.jsonb_build_object('labels', v_labels);
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_expense_activity(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_context_labels(uuid,uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_activity(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_context_labels(uuid,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_activity(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_context_labels(uuid,uuid[])
  TO service_role;

DO $attestation$
DECLARE
  v_activity pg_catalog.pg_proc%ROWTYPE;
  v_labels pg_catalog.pg_proc%ROWTYPE;
BEGIN
  SELECT function_row.* INTO v_activity
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity(uuid,uuid)'
  );
  SELECT function_row.* INTO v_labels
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_context_labels(uuid,uuid[])'
  );

  IF v_activity.oid IS NULL OR v_labels.oid IS NULL
     OR v_activity.proowner <> 'postgres'::pg_catalog.regrole
     OR v_labels.proowner <> 'postgres'::pg_catalog.regrole
     OR NOT v_activity.prosecdef OR NOT v_labels.prosecdef
     OR v_activity.prokind <> 'f' OR v_labels.prokind <> 'f'
     OR v_activity.proretset OR v_labels.proretset
     OR v_activity.provolatile <> 's' OR v_labels.provolatile <> 's'
     OR v_activity.proparallel <> 'u' OR v_labels.proparallel <> 'u'
     OR v_activity.proisstrict OR v_labels.proisstrict
     OR v_activity.proleakproof OR v_labels.proleakproof
     OR v_activity.pronargdefaults <> 0 OR v_labels.pronargdefaults <> 0
     OR v_activity.prolang <> (
          SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
          WHERE language_row.lanname = 'plpgsql'
        )
     OR v_labels.prolang <> (
          SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
          WHERE language_row.lanname = 'plpgsql'
        )
     OR v_activity.prorettype <> 'jsonb'::pg_catalog.regtype
     OR v_labels.prorettype <> 'jsonb'::pg_catalog.regtype
     OR pg_catalog.pg_get_function_arguments(v_activity.oid)
          <> 'p_actor_id uuid, p_event_id uuid'
     OR pg_catalog.pg_get_function_arguments(v_labels.oid)
          <> 'p_actor_id uuid, p_group_ids uuid[]'
     OR pg_catalog.pg_get_function_result(v_activity.oid) <> 'jsonb'
     OR pg_catalog.pg_get_function_result(v_labels.oid) <> 'jsonb'
     OR v_activity.proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR v_labels.proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR pg_catalog.md5(pg_catalog.replace(v_activity.prosrc, E'\r\n', E'\n'))
          <> '18e145ca9e417df099190e27ca6e5015'
     OR pg_catalog.md5(pg_catalog.replace(v_labels.prosrc, E'\r\n', E'\n'))
          <> '6dd096389519b6a218b2703190f98b11'
     OR NOT pg_catalog.has_function_privilege('service_role', v_activity.oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_labels.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_activity.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_activity.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_labels.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_labels.oid, 'EXECUTE')
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS function_row
         WHERE function_row.pronamespace = 'public'::pg_catalog.regnamespace
           AND function_row.proname IN (
             'teskeid_event_get_expense_activity',
             'teskeid_event_get_expense_context_labels'
           )) <> 2 THEN
    RAISE EXCEPTION 'teskeid_event_expense_activity_attestation_failed';
  END IF;
END;
$attestation$;

COMMIT;
