-- SQL139: independent, optional Expense <-> Event links.
-- Additive migration only. It must be run by Stebbi after the read-only
-- preflight; Codex does not execute this file.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user AND role_row.rolsuper
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_executor_invalid';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_member_invitations') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity_audience') IS NULL
     OR pg_catalog.to_regclass('public.recent_events') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_expense_link_integrity_trigger()'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_preview(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_normalize_text(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_valid_text(text,integer,integer)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_prerequisite_missing';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_link_management(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_target_exists';
  END IF;
END;
$preflight$;

-- Link validity is structural. Authorization is proved by the mutation that
-- creates the link and is never inherited from the link later. This prevents
-- roster or identity changes from mutating or invalidating Expense members.
CREATE OR REPLACE FUNCTION public.teskeid_event_assert_expense_link(
  p_event_id uuid,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
    JOIN public.expense_groups AS group_row
      ON group_row.id = link.group_id AND group_row.kind = 'one_off'
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id AND expense.id = link.expense_id
    WHERE link.event_id = p_event_id
      AND link.group_id = p_group_id
      AND link.expense_id = p_expense_id
      AND (
        SELECT pg_catalog.count(*)
        FROM public.expenses AS group_expense
        WHERE group_expense.group_id = link.group_id
      ) = 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_invalid';
  END IF;
END;
$function$;

-- A create-time unchecked link is inserted and removed in one transaction.
-- Its deferred INSERT trigger must therefore accept that the link no longer
-- exists instead of reintroducing provenance as a dependency.
CREATE OR REPLACE FUNCTION public.teskeid_event_expense_link_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = NEW.event_id
      AND link.group_id = NEW.group_id
      AND link.expense_id = NEW.expense_id
  ) THEN
    PERFORM public.teskeid_event_assert_expense_link(
      NEW.event_id, NEW.group_id, NEW.expense_id
    );
  END IF;
  RETURN NULL;
END;
$function$;

-- Event settlement is now derived from ordinary Expense members. Registered
-- members are netted by user identity across linked expenses; unlinked manual
-- members remain separate per Expense member. No Event roster provenance is
-- read or exposed, and email-shaped labels are blocked from the projection.
CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_preview(
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
  v_tagged_count integer;
  v_currency text;
  v_pending_count integer;
  v_review_required boolean;
  v_balance_total numeric;
  v_blocked jsonb;
  v_state text;
  v_currencies jsonb := '[]'::jsonb;
  v_transfers jsonb;
  v_debtor_ids uuid[];
  v_debtor_labels text[];
  v_debts bigint[];
  v_creditor_ids uuid[];
  v_creditor_labels text[];
  v_credits bigint[];
  v_debtor_index integer;
  v_creditor_index integer;
  v_amount bigint;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id
      AND event_row.owner_user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_tagged_count
  FROM public.teskeid_event_expense_links AS link
  WHERE link.event_id = p_event_id;

  IF v_tagged_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'none_tagged',
      'tagged_expense_count', 0,
      'currencies', '[]'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    LEFT JOIN public.expense_groups AS group_row
      ON group_row.id = link.group_id
    LEFT JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    WHERE link.event_id = p_event_id
      AND (
        group_row.id IS NULL
        OR group_row.kind <> 'one_off'
        OR expense.id IS NULL
        OR expense.status NOT IN ('active', 'cancelled')
        OR (
          SELECT pg_catalog.count(*)
          FROM public.expenses AS group_expense
          WHERE group_expense.group_id = link.group_id
        ) <> 1
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'unavailable',
      'tagged_expense_count', v_tagged_count,
      'currencies', '[]'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expense_repayments AS repayment
      ON repayment.group_id = link.group_id
    WHERE link.event_id = p_event_id
      AND (
        (
          SELECT pg_catalog.count(*)
          FROM public.expense_repayment_allocations AS allocation
          WHERE allocation.group_id = repayment.group_id
            AND allocation.repayment_id = repayment.id
        ) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM public.expense_repayment_allocations AS allocation
          JOIN public.expense_obligations AS obligation
            ON obligation.group_id = allocation.group_id
           AND obligation.id = allocation.obligation_id
          WHERE allocation.group_id = repayment.group_id
            AND allocation.repayment_id = repayment.id
            AND allocation.amount_minor = repayment.amount_minor
            AND obligation.from_member_id = repayment.from_member_id
            AND obligation.to_member_id = repayment.to_member_id
            AND obligation.currency = repayment.currency
            AND obligation.amount_minor = allocation.amount_minor
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.expense_group_members AS from_member
          WHERE from_member.group_id = repayment.group_id
            AND from_member.id = repayment.from_member_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.expense_group_members AS to_member
          WHERE to_member.group_id = repayment.group_id
            AND to_member.id = repayment.to_member_id
        )
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', 'unavailable',
      'tagged_expense_count', v_tagged_count,
      'currencies', '[]'::jsonb
    );
  END IF;

  FOR v_currency IN
    SELECT DISTINCT expense.currency
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id
     AND expense.id = link.expense_id
    WHERE link.event_id = p_event_id
    ORDER BY expense.currency
  LOOP
    SELECT pg_catalog.count(*)::integer
    INTO v_pending_count
    FROM public.teskeid_event_expense_links AS link
    JOIN public.expense_repayments AS repayment
      ON repayment.group_id = link.group_id
     AND repayment.currency = v_currency
     AND repayment.status = 'reported'
    WHERE link.event_id = p_event_id;

    SELECT COALESCE(pg_catalog.bool_or(
      public.expense_reported_repayments_need_review(link.group_id)
    ), false)
    INTO v_review_required
    FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = p_event_id
      AND EXISTS (
        SELECT 1 FROM public.expense_repayments AS repayment
        WHERE repayment.group_id = link.group_id
          AND repayment.currency = v_currency
          AND repayment.status = 'reported'
      );

    WITH member_identity AS (
      SELECT
        member.group_id,
        member.id AS member_id,
        CASE
          WHEN member.user_id IS NOT NULL
            THEN 'user:' || member.user_id::text
          ELSE 'member:' || member.group_id::text || ':' || member.id::text
        END AS identity_key,
        CASE
          WHEN member.user_id IS NOT NULL THEN public.teskeid_event_uuid_from_text(
            'teskeid-event-preview-user:' || p_event_id::text || ':'
              || member.user_id::text
          )
          ELSE public.teskeid_event_uuid_from_text(
            'teskeid-event-preview-member:' || p_event_id::text || ':'
              || member.group_id::text || ':' || member.id::text
          )
        END AS party_id,
        CASE
          WHEN public.teskeid_event_valid_text(
            safe_label.display_name, 1, 120
          ) AND pg_catalog.strpos(safe_label.display_name, '@') = 0
          THEN safe_label.display_name
          ELSE NULL
        END AS display_name,
        NOT (
          public.teskeid_event_valid_text(
            safe_label.display_name, 1, 120
          ) AND pg_catalog.strpos(safe_label.display_name, '@') = 0
        ) AS blocked
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_group_members AS member
        ON member.group_id = link.group_id
      LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
      CROSS JOIN LATERAL (
        SELECT public.teskeid_event_normalize_text(
          CASE WHEN member.user_id IS NOT NULL
            THEN profile.display_name ELSE member.display_name END
        ) AS display_name
      ) AS safe_label
      WHERE link.event_id = p_event_id
    ), movements AS (
      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        payment.amount_minor::bigint AS amount_minor
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expenses AS expense
        ON expense.group_id = link.group_id
       AND expense.id = link.expense_id
       AND expense.status = 'active'
       AND expense.currency = v_currency
      JOIN public.expense_payments AS payment
        ON payment.group_id = link.group_id
       AND payment.expense_id = link.expense_id
      JOIN member_identity AS identity
        ON identity.group_id = payment.group_id
       AND identity.member_id = payment.member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        -share.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expenses AS expense
        ON expense.group_id = link.group_id
       AND expense.id = link.expense_id
       AND expense.status = 'active'
       AND expense.currency = v_currency
      JOIN public.expense_shares AS share
        ON share.group_id = link.group_id
       AND share.expense_id = link.expense_id
      JOIN member_identity AS identity
        ON identity.group_id = share.group_id
       AND identity.member_id = share.member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        repayment.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_repayments AS repayment
        ON repayment.group_id = link.group_id
       AND repayment.status = 'confirmed'
       AND repayment.currency = v_currency
      JOIN public.expense_repayment_allocations AS allocation
        ON allocation.group_id = repayment.group_id
       AND allocation.repayment_id = repayment.id
       AND allocation.amount_minor = repayment.amount_minor
      JOIN public.expense_obligations AS obligation
        ON obligation.group_id = allocation.group_id
       AND obligation.id = allocation.obligation_id
       AND obligation.from_member_id = repayment.from_member_id
       AND obligation.to_member_id = repayment.to_member_id
       AND obligation.currency = repayment.currency
       AND obligation.amount_minor = allocation.amount_minor
      JOIN member_identity AS identity
        ON identity.group_id = repayment.group_id
       AND identity.member_id = repayment.from_member_id
      WHERE link.event_id = p_event_id

      UNION ALL

      SELECT identity.identity_key, identity.party_id,
        identity.display_name, identity.blocked,
        -repayment.amount_minor::bigint
      FROM public.teskeid_event_expense_links AS link
      JOIN public.expense_repayments AS repayment
        ON repayment.group_id = link.group_id
       AND repayment.status = 'confirmed'
       AND repayment.currency = v_currency
      JOIN public.expense_repayment_allocations AS allocation
        ON allocation.group_id = repayment.group_id
       AND allocation.repayment_id = repayment.id
       AND allocation.amount_minor = repayment.amount_minor
      JOIN public.expense_obligations AS obligation
        ON obligation.group_id = allocation.group_id
       AND obligation.id = allocation.obligation_id
       AND obligation.from_member_id = repayment.from_member_id
       AND obligation.to_member_id = repayment.to_member_id
       AND obligation.currency = repayment.currency
       AND obligation.amount_minor = allocation.amount_minor
      JOIN member_identity AS identity
        ON identity.group_id = repayment.group_id
       AND identity.member_id = repayment.to_member_id
      WHERE link.event_id = p_event_id
    ), balances AS (
      SELECT identity_key, party_id,
        pg_catalog.min(display_name) AS display_name,
        pg_catalog.bool_or(blocked) AS blocked,
        pg_catalog.sum(amount_minor)::bigint AS amount_minor
      FROM movements
      GROUP BY identity_key, party_id
      HAVING pg_catalog.sum(amount_minor) <> 0
    )
    SELECT
      COALESCE(pg_catalog.sum(balance.amount_minor), 0),
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'party_id', balance.party_id,
        'display_name', balance.display_name,
        'reason', 'unresolved_identity'
      ) ORDER BY balance.party_id) FILTER (WHERE balance.blocked), '[]'::jsonb),
      pg_catalog.array_agg(balance.party_id
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0 AND NOT balance.blocked),
      pg_catalog.array_agg(balance.display_name
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0 AND NOT balance.blocked),
      pg_catalog.array_agg(-balance.amount_minor
        ORDER BY -balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor < 0 AND NOT balance.blocked),
      pg_catalog.array_agg(balance.party_id
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0 AND NOT balance.blocked),
      pg_catalog.array_agg(balance.display_name
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0 AND NOT balance.blocked),
      pg_catalog.array_agg(balance.amount_minor
        ORDER BY balance.amount_minor DESC, balance.party_id)
        FILTER (WHERE balance.amount_minor > 0 AND NOT balance.blocked)
    INTO
      v_balance_total, v_blocked,
      v_debtor_ids, v_debtor_labels, v_debts,
      v_creditor_ids, v_creditor_labels, v_credits
    FROM balances AS balance;

    IF v_balance_total <> 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'event_id', p_event_id,
        'status', 'unavailable',
        'tagged_expense_count', v_tagged_count,
        'currencies', '[]'::jsonb
      );
    END IF;

    v_transfers := '[]'::jsonb;
    IF v_review_required THEN
      v_state := 'review_required';
    ELSIF v_pending_count > 0 THEN
      v_state := 'pending';
    ELSIF pg_catalog.jsonb_array_length(v_blocked) > 0 THEN
      v_state := 'blocked_manual';
    ELSIF COALESCE(pg_catalog.array_length(v_debtor_ids, 1), 0) = 0 THEN
      v_state := 'settled';
    ELSE
      v_state := 'open';
      v_debtor_index := 1;
      v_creditor_index := 1;
      WHILE v_debtor_index <= COALESCE(
          pg_catalog.array_length(v_debtor_ids, 1), 0
        )
        AND v_creditor_index <= COALESCE(
          pg_catalog.array_length(v_creditor_ids, 1), 0
        )
      LOOP
        v_amount := LEAST(
          v_debts[v_debtor_index], v_credits[v_creditor_index]
        );
        v_transfers := v_transfers || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'from_party_id', v_debtor_ids[v_debtor_index],
            'to_party_id', v_creditor_ids[v_creditor_index],
            'from_display_name', v_debtor_labels[v_debtor_index],
            'to_display_name', v_creditor_labels[v_creditor_index],
            'amount_minor', v_amount
          )
        );
        v_debts[v_debtor_index] := v_debts[v_debtor_index] - v_amount;
        v_credits[v_creditor_index] := v_credits[v_creditor_index] - v_amount;
        IF v_debts[v_debtor_index] = 0 THEN
          v_debtor_index := v_debtor_index + 1;
        END IF;
        IF v_credits[v_creditor_index] = 0 THEN
          v_creditor_index := v_creditor_index + 1;
        END IF;
      END LOOP;
    END IF;

    v_currencies := v_currencies || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'currency', v_currency,
        'state', v_state,
        'transfers', v_transfers,
        'pending_repayment_count', v_pending_count,
        'blocked_parties', v_blocked
      )
    );

    v_debtor_ids := NULL;
    v_debtor_labels := NULL;
    v_debts := NULL;
    v_creditor_ids := NULL;
    v_creditor_labels := NULL;
    v_credits := NULL;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'status', 'ready',
    'tagged_expense_count', v_tagged_count,
    'currencies', v_currencies
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_link_to_event boolean,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_result jsonb;
  v_group_id uuid;
  v_expense_id uuid;
  v_import_invitation_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_expected_roster_revision < 1
     OR p_link_to_event IS NULL OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'linkToEvent', p_link_to_event,
    'payload', p_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_expense_from_event', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-independent-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_result := public.teskeid_event_create_tagged_expense_for_actor(
    p_actor_id, v_inner_request_id, p_event_id,
    p_expected_roster_revision, p_payload
  );
  v_group_id := (v_result->>'group_id')::uuid;
  v_expense_id := (v_result->>'expense_id')::uuid;

  -- Event attendance is not Expense consent. The legacy bridge creates
  -- invitations for mapped Event guests before it writes provenance. Remove
  -- those invitations and their same-transaction audit/feed projections
  -- before returning; explicit ordinary Expense invitations are retained.
  SELECT COALESCE(pg_catalog.array_agg(
    invitation.id ORDER BY invitation.id
  ), ARRAY[]::uuid[])
  INTO v_import_invitation_ids
  FROM public.expense_member_invitations AS invitation
  JOIN public.teskeid_event_expense_participant_sources AS source
    ON source.group_id = invitation.group_id
   AND source.expense_member_id = invitation.member_id
  WHERE source.event_id = p_event_id
    AND source.group_id = v_group_id
    AND source.expense_id = v_expense_id
    AND invitation.status = 'pending';

  DELETE FROM public.recent_events AS recent
  WHERE recent.source = 'expenses'
    AND recent.entity_type = 'expense_member_invitation'
    AND recent.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_activity AS activity
  WHERE activity.entity_type = 'expense_member_invitation'
    AND activity.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = ANY(v_import_invitation_ids);

  v_result := pg_catalog.jsonb_set(
    v_result,
    '{invitation_ids}',
    COALESCE((
      SELECT pg_catalog.jsonb_agg(candidate.value ORDER BY candidate.ordinal)
      FROM pg_catalog.jsonb_array_elements_text(
        COALESCE(v_result->'invitation_ids', '[]'::jsonb)
      ) WITH ORDINALITY AS candidate(value, ordinal)
      WHERE candidate.value::uuid <> ALL(v_import_invitation_ids)
    ), '[]'::jsonb),
    true
  );

  -- Event guest provenance is intentionally temporary input validation only.
  DELETE FROM public.teskeid_event_expense_participant_sources AS source
  WHERE source.event_id = p_event_id
    AND source.group_id = v_group_id
    AND source.expense_id = v_expense_id;
  IF NOT p_link_to_event THEN
    DELETE FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = p_event_id
      AND link.group_id = v_group_id
      AND link.expense_id = v_expense_id;
  END IF;

  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_link_management(
  p_actor_id uuid,
  p_expense_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_current_event jsonb;
  v_events jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense
  JOIN public.expense_groups AS group_row
    ON group_row.id = expense.group_id
   AND group_row.kind = 'one_off'
   AND group_row.status <> 'closed'
  WHERE expense.id = p_expense_id
    AND expense.status = 'active'
    AND (
      expense.created_by = p_actor_id
      OR public.expense_active_member_role(p_actor_id, expense.group_id)
           IN ('owner', 'admin')
    )
    AND (
      SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
      WHERE group_expense.group_id = expense.group_id
    ) = 1;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', CASE WHEN event_row.owner_user_id = p_actor_id OR EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = event_row.id
        AND membership.user_id = p_actor_id
    ) THEN event_row.name ELSE NULL END,
    'can_open', event_row.owner_user_id = p_actor_id OR EXISTS (
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
  ) INTO v_current_event
  FROM public.teskeid_event_expense_links AS link
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  WHERE link.expense_id = p_expense_id
    AND link.group_id = v_group_id;

  IF v_current_event IS NULL THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id', candidate.id,
      'name', candidate.name,
      'roster_revision', candidate.roster_revision,
      'viewer_role', candidate.viewer_role
    ) ORDER BY candidate.created_at DESC, candidate.id DESC), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT event_row.id, event_row.name, event_row.roster_revision,
        event_row.created_at,
        CASE WHEN event_row.owner_user_id = p_actor_id
          THEN 'owner' ELSE 'attendee' END AS viewer_role
      FROM public.teskeid_events AS event_row
      WHERE event_row.owner_user_id = p_actor_id
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
      ORDER BY event_row.created_at DESC, event_row.id DESC
      LIMIT 100
    ) AS candidate;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'current_event', v_current_event,
    'events', v_events
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_attach_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_event_id uuid,
  p_expected_financial_version bigint,
  p_expected_roster_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_existing_event_id uuid;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_event_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0 OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'eventId', p_event_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'expectedRosterRevision', p_expected_roster_revision
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_attach_expense', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT expense.group_id INTO v_expense.group_id
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.group_id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off' OR v_group.status = 'closed'
     OR v_group.financial_version <> p_expected_financial_version
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND COALESCE(v_role, '') NOT IN ('owner', 'admin'))
     OR (SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
         WHERE group_expense.group_id = v_group.id) <> 1 THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  -- Existing Expense mutations and account deletion lock group before Event.
  -- Preserve that global order so attach cannot deadlock with either path.
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF v_event.id IS NULL OR v_event.roster_revision <> p_expected_roster_revision
     OR (
       v_event.owner_user_id <> p_actor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.teskeid_event_attendance_memberships AS membership
         JOIN public.teskeid_event_guests AS guest
           ON guest.event_id = membership.event_id
          AND guest.id = membership.event_guest_id
          AND guest.status = 'active'
          AND guest.linked_user_id = membership.user_id
         WHERE membership.event_id = p_event_id
           AND membership.user_id = p_actor_id
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;
  SELECT link.event_id INTO v_existing_event_id
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id
  FOR UPDATE;
  IF v_existing_event_id IS NOT NULL AND v_existing_event_id <> p_event_id THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  IF v_existing_event_id IS NULL THEN
    INSERT INTO public.teskeid_event_expense_links(
      event_id, group_id, expense_id, linked_by_user_id
    ) VALUES (p_event_id, v_group.id, p_expense_id, p_actor_id);
  END IF;
  PERFORM public.teskeid_event_assert_expense_link(
    p_event_id, v_group.id, p_expense_id
  );
  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id, 'event_id', p_event_id
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_detach_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_expected_event_id uuid,
  p_expected_financial_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_link public.teskeid_event_expense_links%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_expected_event_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'expectedEventId', p_expected_event_id,
    'expectedFinancialVersion', p_expected_financial_version
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_detach_expense', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT link.* INTO v_link
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id;
  IF v_link.expense_id IS NULL OR v_link.event_id <> p_expected_event_id THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_link.group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off' OR v_group.status = 'closed'
     OR v_group.financial_version <> p_expected_financial_version
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND COALESCE(v_role, '') NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  PERFORM event_row.id FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_expected_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_link_conflict'; END IF;
  SELECT link.* INTO v_link FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id FOR UPDATE;
  IF v_link.expense_id IS NULL
     OR v_link.event_id <> p_expected_event_id
     OR v_link.group_id <> v_group.id THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  DELETE FROM public.teskeid_event_expense_links AS link
  WHERE link.event_id = p_expected_event_id
    AND link.group_id = v_group.id
    AND link.expense_id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_link_conflict'; END IF;

  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id, 'event_id', p_expected_event_id
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_expense_link_integrity_trigger() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_link_management(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_expense_link_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_link_management(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_attach_expense(
  uuid,uuid,uuid,uuid,bigint,bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_detach_expense(
  uuid,uuid,uuid,uuid,bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_link_management(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_attach_expense(
  uuid,uuid,uuid,uuid,bigint,bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_detach_expense(
  uuid,uuid,uuid,uuid,bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_preview(uuid,uuid)
  TO service_role;

DO $postflight$
DECLARE
  v_function_oid oid;
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
    'public.teskeid_event_get_expense_link_management(uuid,uuid)',
    'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
    'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)',
    'public.teskeid_event_get_expense_preview(uuid,uuid)'
  ] LOOP
    v_function_oid := pg_catalog.to_regprocedure(v_signature);
    IF v_function_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = v_function_oid
        AND owner_role.rolname = 'postgres'
        AND function_row.prosecdef
        AND function_row.prorettype = 'jsonb'::pg_catalog.regtype
        AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'teskeid_event_expense_link_attestation_failed:%', v_signature;
    END IF;
  END LOOP;
  IF pg_catalog.has_function_privilege(
       'service_role', 'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)', 'EXECUTE'
     ) OR pg_catalog.has_function_privilege(
       'service_role', 'public.teskeid_event_expense_link_integrity_trigger()', 'EXECUTE'
     ) OR NOT pg_catalog.has_function_privilege(
       'service_role', 'public.teskeid_event_get_expense_preview(uuid,uuid)', 'EXECUTE'
     ) OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_preview(uuid,uuid)'
     )), 'teskeid_event_expense_participant_sources') <> 0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
       'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
     )), 'DELETE FROM public.teskeid_event_expense_participant_sources') = 0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
       'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
     )), 'p_expected_roster_revision') = 0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
       'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'
     )), 'DELETE FROM public.teskeid_event_expense_links') = 0 THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_attestation_failed';
  END IF;
END;
$postflight$;

COMMIT;
