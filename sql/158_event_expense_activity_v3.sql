-- SQL158: Additive V3 Event expense activity with authorized detail targets.
-- SQL157/V2 remains unchanged and compatible with the currently deployed app.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';
SELECT pg_catalog.pg_advisory_xact_lock(158158);

DO $preflight$
DECLARE
  v_v2_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity_v2(uuid,uuid)'
  );
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'teskeid_event_sql158_executor_mismatch';
  END IF;

  IF v_v2_oid IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL
     OR pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_sql158_prerequisite_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.pronamespace =
          pg_catalog.to_regnamespace('public')
      AND function_row.proname =
          'teskeid_event_get_expense_activity_v3'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql158_target_exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = function_row.prolang
    WHERE function_row.oid = v_v2_oid
      AND function_row.prokind = 'f'
      AND function_row.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
      AND NOT function_row.proretset
      AND function_row.prosecdef
      AND function_row.provolatile = 'v'
      AND NOT function_row.proisstrict
      AND NOT function_row.proleakproof
      AND function_row.proparallel = 'u'
      AND function_row.pronargdefaults = 0
      AND function_row.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(function_row.oid) =
            'p_actor_id uuid, p_event_id uuid'
      AND pg_catalog.md5(pg_catalog.replace(
            function_row.prosrc, E'\r\n', E'\n'
          )) = 'd5422fcda5e1ce93aeb08a4f2c9db91a'
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_row.pronamespace
          AND overload.proname = function_row.proname
      )
      AND (
        SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_row.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_row.proowner
            OR grantee.rolname = 'service_role'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_row.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql158_predecessor_drift';
  END IF;
END;
$preflight$;

-- Canonical Event-read visibility remains the SQL157/V2 decision. V3 only
-- annotates an already-visible, already-valid row with an exact detail target
-- when the actor independently has the destination's active membership.
CREATE FUNCTION public.teskeid_event_get_expense_activity_v3(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_revalidated_scope jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  -- V3 remains the canonical session/claim authority. Because it is VOLATILE,
  -- call it before the read projection and then re-prove its exact returned
  -- owner/attendee evidence inside the projection snapshot below.
  v_scope := public.teskeid_event_private_scope_v3(
    p_actor_id, p_event_id
  );

  -- This entire projection is one data-producing SQL statement. Under READ
  -- COMMITTED the revalidated Event authority, visibility, summaries and actor
  -- positions therefore share one snapshot.
  WITH scope_evidence AS MATERIALIZED (
    SELECT v_scope AS value
    WHERE pg_catalog.jsonb_typeof(v_scope) = 'object'
      AND v_scope - ARRAY[
        'viewer_role', 'event_guest_id', 'identity_generation'
      ]::text[] = '{}'::jsonb
  ), scope AS MATERIALIZED (
    SELECT evidence.value
    FROM scope_evidence AS evidence
    WHERE (
      evidence.value->>'viewer_role' = 'owner'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'event_guest_id'
      ) = 'null'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'identity_generation'
      ) = 'null'
      AND EXISTS (
        SELECT 1
        FROM public.teskeid_events AS event_row
        WHERE event_row.id = p_event_id
          AND event_row.owner_user_id = p_actor_id
      )
    ) OR (
      evidence.value->>'viewer_role' = 'attendee'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'event_guest_id'
      ) = 'string'
      AND pg_catalog.jsonb_typeof(
        evidence.value->'identity_generation'
      ) = 'string'
      AND EXISTS (
        SELECT 1
        FROM public.teskeid_events AS event_row
        JOIN public.teskeid_event_participations AS participation
          ON participation.event_id = event_row.id
         AND participation.recipient_user_id = p_actor_id
         AND participation.access_state = 'active'
         AND participation.event_guest_id::text =
               evidence.value->>'event_guest_id'
         AND participation.identity_generation::text =
               evidence.value->>'identity_generation'
        JOIN public.teskeid_event_guests AS guest
          ON guest.event_id = participation.event_id
         AND guest.id = participation.event_guest_id
         AND guest.status = 'active'
        JOIN public.teskeid_event_participation_rsvp_v3 AS decision
          ON decision.event_id = participation.event_id
         AND decision.event_guest_id = participation.event_guest_id
         AND decision.identity_generation =
               participation.identity_generation
         AND decision.decision_version = participation.rsvp_version
        WHERE event_row.id = p_event_id
          AND event_row.owner_user_id <> p_actor_id
      )
    )
  ), visible_candidates AS MATERIALIZED (
    -- Hidden participants-only rows are removed before any title, amount,
    -- count, balance or repayment projection can observe their Expense data.
    SELECT link.event_id, link.group_id, link.expense_id, link.linked_at
    FROM scope
    JOIN public.teskeid_event_expense_links AS link
      ON link.event_id = p_event_id
    WHERE scope.value IS NOT NULL
      AND (
        link.visibility = 'all_event'
        OR (
          link.visibility = 'participants_only'
          AND EXISTS (
            SELECT 1
            FROM public.expense_group_members AS actor_member
            WHERE actor_member.group_id = link.group_id
              AND actor_member.user_id = p_actor_id
              AND actor_member.status = 'active'
              AND NOT EXISTS (
                SELECT 1
                FROM public.expense_claim_disputes AS dispute
                WHERE dispute.group_id = link.group_id
                  AND dispute.expense_id = link.expense_id
                  AND dispute.member_id = actor_member.id
                  AND dispute.disputed_user_id = p_actor_id
                  AND dispute.status = 'disputed'
              )
          )
        )
      )
    ORDER BY link.linked_at DESC, link.expense_id DESC
    LIMIT 101
  ), visible_count AS MATERIALIZED (
    SELECT pg_catalog.count(*)::integer AS value
    FROM visible_candidates
  ), projectable_candidates AS MATERIALIZED (
    SELECT candidate.*
    FROM visible_candidates AS candidate
    CROSS JOIN visible_count
    WHERE visible_count.value BETWEEN 1 AND 100
  ), visible_detail AS MATERIALIZED (
    -- Every visible candidate contributes exactly one detail row, including a
    -- broken candidate. Broken visible data fails the whole projection closed.
    SELECT candidate.group_id, candidate.expense_id,
      expense.title, expense.total_minor, expense.currency,
      expense.incurred_on, expense.created_at,
      COALESCE(
        group_row.id IS NOT NULL
        AND group_row.kind = 'one_off'
        AND expense.id IS NOT NULL
        AND expense.status = 'active'
        AND expense.total_minor BETWEEN 1 AND 9007199254740991
        AND group_expense_stats.item_count = 1
        AND payment_stats.item_count BETWEEN 1 AND 50
        AND payment_stats.amount_total = expense.total_minor,
        false
      ) AS is_valid
    FROM projectable_candidates AS candidate
    LEFT JOIN public.expense_groups AS group_row
      ON group_row.id = candidate.group_id
    LEFT JOIN public.expenses AS expense
      ON expense.group_id = candidate.group_id
     AND expense.id = candidate.expense_id
    LEFT JOIN LATERAL (
      SELECT pg_catalog.count(*) AS item_count
      FROM public.expenses AS group_expense
      WHERE group_expense.group_id = candidate.group_id
    ) AS group_expense_stats ON true
    LEFT JOIN LATERAL (
      SELECT pg_catalog.count(*) AS item_count,
        COALESCE(pg_catalog.sum(payment.amount_minor), 0) AS amount_total
      FROM public.expense_payments AS payment
      WHERE payment.group_id = candidate.group_id
        AND payment.expense_id = candidate.expense_id
    ) AS payment_stats ON true
  ), detail_gate AS MATERIALIZED (
    SELECT visible_count.value AS visible_count,
      COALESCE(pg_catalog.bool_or(NOT detail.is_valid), false) AS has_invalid
    FROM visible_count
    LEFT JOIN visible_detail AS detail ON true
    GROUP BY visible_count.value
  ), projection_gate AS MATERIALIZED (
    SELECT scope.value AS scope, detail_gate.visible_count,
      detail_gate.has_invalid,
      detail_gate.visible_count BETWEEN 1 AND 100
        AND NOT detail_gate.has_invalid AS can_project
    FROM scope
    CROSS JOIN detail_gate
  ), detail_targets AS MATERIALIZED (
    -- Detail authority can only annotate rows that visibility and validation
    -- have already admitted. A dispute does not revoke canonical detail access;
    -- active exact group membership is the destination's authority boundary.
    SELECT detail.group_id, detail.expense_id,
      EXISTS (
        SELECT 1
        FROM public.expense_group_members AS detail_member
        WHERE detail_member.group_id = detail.group_id
          AND detail_member.user_id = p_actor_id
          AND detail_member.status = 'active'
      ) AS can_open_detail
    FROM projection_gate AS gate
    JOIN visible_detail AS detail
      ON gate.can_project AND detail.is_valid
  ), expenses_json AS MATERIALIZED (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'title', detail.title,
        'total_minor', detail.total_minor,
        'currency', detail.currency,
        'detail_target', CASE
          WHEN COALESCE(target.can_open_detail, false)
            THEN pg_catalog.jsonb_build_object(
              'expense_id', detail.expense_id
            )
          ELSE 'null'::jsonb
        END
      ) ORDER BY detail.incurred_on DESC, detail.created_at DESC,
        detail.expense_id DESC
    ) FILTER (WHERE gate.can_project AND detail.is_valid), '[]'::jsonb) AS value
    FROM projection_gate AS gate
    LEFT JOIN visible_detail AS detail
      ON gate.can_project AND detail.is_valid
    LEFT JOIN detail_targets AS target
      ON target.group_id = detail.group_id
     AND target.expense_id = detail.expense_id
  ), position_inputs AS MATERIALIZED (
    -- Event visibility never creates a financial position. Only the actor's
    -- exact active, undisputed Expense membership reaches balance projection.
    SELECT detail.group_id, detail.expense_id, detail.currency,
      actor_member.id AS actor_member_id
    FROM projection_gate AS gate
    JOIN visible_detail AS detail
      ON gate.can_project AND detail.is_valid
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = detail.group_id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = detail.group_id
        AND dispute.expense_id = detail.expense_id
        AND dispute.member_id = actor_member.id
        AND dispute.disputed_user_id = p_actor_id
        AND dispute.status = 'disputed'
    )
  ), position_contributions AS MATERIALIZED (
    SELECT input.currency,
      COALESCE(balance.amount_minor, 0::numeric) AS amount_minor,
      EXISTS (
        SELECT 1
        FROM public.expense_repayments AS repayment
        WHERE repayment.group_id = input.group_id
          AND repayment.currency = input.currency
          AND repayment.status = 'reported'
          AND input.actor_member_id IN (
            repayment.from_member_id, repayment.to_member_id
          )
      ) AS pending
    FROM position_inputs AS input
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        pg_catalog.sum(group_balance.amount_minor), 0
      )::numeric AS amount_minor
      FROM public.expense_group_balances(
        input.group_id, false
      ) AS group_balance
      WHERE group_balance.member_id = input.actor_member_id
        AND group_balance.currency = input.currency
    ) AS balance ON true
  ), position_rows AS MATERIALIZED (
    SELECT contribution.currency,
      pg_catalog.sum(contribution.amount_minor) AS actor_balance,
      pg_catalog.bool_or(contribution.pending) AS pending
    FROM position_contributions AS contribution
    GROUP BY contribution.currency
  ), position_gate AS MATERIALIZED (
    SELECT COALESCE(pg_catalog.bool_or(
      NOT position.pending
      AND (
        position.actor_balance > 9007199254740991
        OR position.actor_balance < -9007199254740991
      )
    ), false) AS has_overflow
    FROM position_rows AS position
  ), positions_json AS MATERIALIZED (
    SELECT CASE WHEN position_gate.has_overflow THEN '[]'::jsonb
      ELSE COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'currency', position.currency,
          'state', CASE
            WHEN position.pending THEN 'pending'
            WHEN position.actor_balance < 0 THEN 'owes'
            WHEN position.actor_balance > 0 THEN 'owed'
            ELSE 'zero'
          END,
          'amount_minor', CASE
            WHEN position.pending THEN 0
            ELSE pg_catalog.abs(position.actor_balance)::bigint
          END
        ) ORDER BY position.currency
      ) FILTER (WHERE position.currency IS NOT NULL), '[]'::jsonb)
    END AS value
    FROM position_gate
    LEFT JOIN position_rows AS position
      ON NOT position_gate.has_overflow
    GROUP BY position_gate.has_overflow
  )
  SELECT gate.scope,
    CASE
      WHEN gate.scope IS NULL THEN NULL
      WHEN gate.visible_count > 100 OR gate.has_invalid
        OR position_gate.has_overflow THEN pg_catalog.jsonb_build_object(
          'status', 'unavailable', 'expenses', '[]'::jsonb,
          'positions', '[]'::jsonb
        )
      WHEN gate.visible_count = 0 THEN pg_catalog.jsonb_build_object(
        'status', 'none', 'expenses', '[]'::jsonb,
        'positions', '[]'::jsonb
      )
      ELSE pg_catalog.jsonb_build_object(
        'status', 'ready', 'expenses', expenses_json.value,
        'positions', positions_json.value
      )
    END
  INTO v_revalidated_scope, v_result
  FROM projection_gate AS gate
  CROSS JOIN expenses_json
  CROSS JOIN position_gate
  CROSS JOIN positions_json;

  IF v_revalidated_scope IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  TO service_role;

COMMENT ON FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid) IS
  'Privacy-safe Event expense activity with object-authorized detail targets.';

COMMIT;
