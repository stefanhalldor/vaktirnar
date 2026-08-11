-- Migration 124: fail closed when a settlement proposal creates review state
-- Forward-only correction for SQL123. DO NOT RUN automatically.
--
-- SQL123's inherited expense_repayments_review_guard is a BEFORE INSERT
-- trigger. It can reject a group that was already review-required, but it
-- cannot see the NEW repayment that may itself make a multi-party settlement
-- graph require review. This replacement keeps the SQL123 RPC byte-for-byte
-- equivalent apart from one late, transactional guard after every batch item
-- exists and before financial-version or activity writes.

BEGIN;

-- Drain and block every old proposal writer before attesting the zero-row
-- one-shot state. The production app has not shipped this RPC yet; keep all
-- callers paused until SQL124 and both postflights are complete.
LOCK TABLE public.expense_settlement_batches,
  public.expense_settlement_batch_items IN SHARE MODE;

DO $preflight$
DECLARE
  v_procedure oid;
  v_source text;
  v_batch_rows bigint;
  v_item_rows bigint;
BEGIN
  IF pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL
     OR pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_reported_repayments_need_review(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'expense_124_missing_sql123_dependencies';
  END IF;

  v_procedure := pg_catalog.to_regprocedure(
    'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
  );
  IF v_procedure IS NULL THEN
    RAISE EXCEPTION 'expense_124_missing_proposal_rpc';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'postgres'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'anon'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'expense_124_required_role_missing';
  END IF;

  SELECT procedure.prosrc
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = v_procedure;

  IF v_source IS NULL
     OR v_source NOT LIKE '%p_anchor_from_member_id%'
     OR v_source NOT LIKE '%expected_profile_state_token%'
     OR v_source NOT LIKE '%FULL JOIN pg_temp.expense_batch_current_contexts%'
     OR v_source NOT LIKE '%v_affected_group_ids IS NULL%'
     OR v_source NOT LIKE '%UPDATE public.expense_groups AS group_row%'
     OR v_source LIKE '%expense_reported_repayments_need_review%' THEN
    RAISE EXCEPTION 'expense_124_unexpected_proposal_contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = v_procedure
      AND procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND owner_role.rolname = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'expense_124_unexpected_proposal_security';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE procedure.oid = v_procedure
      AND privilege.privilege_type = 'EXECUTE'
      AND COALESCE(grantee_role.rolname, 'PUBLIC')
        NOT IN ('postgres', 'service_role')
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS privilege
    JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE procedure.oid = v_procedure
      AND privilege.privilege_type = 'EXECUTE'
      AND grantee_role.rolname = 'service_role'
  ) <> 1 THEN
    RAISE EXCEPTION 'expense_124_unexpected_proposal_acl';
  END IF;

  SELECT pg_catalog.count(*) INTO v_batch_rows
  FROM public.expense_settlement_batches;
  SELECT pg_catalog.count(*) INTO v_item_rows
  FROM public.expense_settlement_batch_items;
  IF v_batch_rows <> 0 OR v_item_rows <> 0 THEN
    RAISE EXCEPTION
      'expense_124_existing_batch_state: batches=%, items=%',
      v_batch_rows, v_item_rows;
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.expense_propose_settlement_batch(
  p_actor_id uuid,
  p_anchor_group_id uuid,
  p_anchor_from_member_id uuid,
  p_anchor_to_member_id uuid,
  p_currency text,
  p_expected_contexts jsonb,
  p_expected_profile_id uuid,
  p_expected_profile_version bigint,
  p_expected_profile_state_token text,
  p_cash_minor bigint,
  p_use_offset boolean,
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
  v_batch_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_normalized_contexts jsonb;
  v_gross_payable numeric;
  v_gross_receivable numeric;
  v_offset bigint;
  v_remaining bigint;
  v_allocation bigint;
  v_sequence integer := 0;
  v_context record;
  v_group_id uuid;
  v_affected_group_ids uuid[];
  v_counterparty_user_id uuid;
  v_current_profile public.expense_payment_profiles_v2%ROWTYPE;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL
     OR p_anchor_group_id IS NULL
     OR p_anchor_from_member_id IS NULL
     OR p_anchor_to_member_id IS NULL
     OR p_anchor_from_member_id = p_anchor_to_member_id
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_cash_minor IS NULL OR p_cash_minor NOT BETWEEN 0 AND 9007199254740991
     OR p_use_offset IS NULL
     OR p_occurred_on IS NULL
     OR p_request_id IS NULL
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000)
     OR (
       (p_expected_profile_id IS NULL)
         <> (p_expected_profile_version IS NULL)
     )
     OR (
       (p_expected_profile_id IS NULL)
         <> (p_expected_profile_state_token IS NULL)
     )
     OR (
       p_expected_profile_version IS NOT NULL
       AND p_expected_profile_version NOT BETWEEN 1 AND 9007199254740991
     )
     OR (
       p_cash_minor = 0
       AND (
         p_expected_profile_id IS NOT NULL
         OR p_expected_profile_version IS NOT NULL
         OR p_expected_profile_state_token IS NOT NULL
       )
     )
     OR (
       p_expected_profile_state_token IS NOT NULL
       AND p_expected_profile_state_token !~ '^[0-9a-f]{32}$'
     ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  IF p_expected_contexts IS NULL
     OR pg_catalog.jsonb_typeof(p_expected_contexts) <> 'array' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  IF pg_catalog.jsonb_array_length(p_expected_contexts) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  DROP TABLE IF EXISTS pg_temp.expense_batch_expected_contexts;
  DROP TABLE IF EXISTS pg_temp.expense_batch_pair_groups;
  DROP TABLE IF EXISTS pg_temp.expense_batch_current_contexts;

  CREATE TEMP TABLE pg_temp.expense_batch_expected_contexts (
    group_id uuid,
    from_member_id uuid,
    to_member_id uuid,
    expected_financial_version bigint,
    amount_minor bigint
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.expense_batch_expected_contexts (
    group_id, from_member_id, to_member_id,
    expected_financial_version, amount_minor
  )
  SELECT
    input_row.group_id,
    input_row.from_member_id,
    input_row.to_member_id,
    input_row.expected_financial_version,
    input_row.amount_minor
  FROM pg_catalog.jsonb_to_recordset(p_expected_contexts) AS input_row(
    group_id uuid,
    from_member_id uuid,
    to_member_id uuid,
    expected_financial_version bigint,
    amount_minor bigint
  );

  IF EXISTS (
    SELECT 1
    FROM pg_temp.expense_batch_expected_contexts AS expected
    WHERE expected.group_id IS NULL
       OR expected.from_member_id IS NULL
       OR expected.to_member_id IS NULL
       OR expected.from_member_id = expected.to_member_id
       OR expected.expected_financial_version IS NULL
       OR expected.expected_financial_version < 0
       OR expected.amount_minor IS NULL
       OR expected.amount_minor NOT BETWEEN 1 AND 9007199254740991
  ) OR (
    SELECT count(*) FROM pg_temp.expense_batch_expected_contexts
  ) <> (
    SELECT count(DISTINCT (
      expected.group_id, expected.from_member_id, expected.to_member_id
    ))
    FROM pg_temp.expense_batch_expected_contexts AS expected
  ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_temp.expense_batch_expected_contexts AS expected
    WHERE expected.group_id = p_anchor_group_id
      AND expected.from_member_id = p_anchor_from_member_id
      AND expected.to_member_id = p_anchor_to_member_id
  ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'groupId', expected.group_id,
      'fromMemberId', expected.from_member_id,
      'toMemberId', expected.to_member_id,
      'expectedFinancialVersion', expected.expected_financial_version,
      'amountMinor', expected.amount_minor
    )
    ORDER BY expected.group_id, expected.from_member_id, expected.to_member_id
  ) INTO v_normalized_contexts
  FROM pg_temp.expense_batch_expected_contexts AS expected;

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'anchorGroupId', p_anchor_group_id,
    'anchorFromMemberId', p_anchor_from_member_id,
    'anchorToMemberId', p_anchor_to_member_id,
    'currency', p_currency,
    'contexts', v_normalized_contexts,
    'expectedProfileId', p_expected_profile_id,
    'expectedProfileVersion', p_expected_profile_version,
    'expectedProfileStateToken', p_expected_profile_state_token,
    'cashMinor', p_cash_minor,
    'useOffset', p_use_offset,
    'occurredOn', p_occurred_on,
    'note', NULLIF(btrim(p_note), '')
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_propose_settlement_batch', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Resolve the canonical counterparty from one exact outgoing context. The
  -- browser never supplies a trusted user id for the pair.
  SELECT counterparty_member.user_id
  INTO v_counterparty_user_id
  FROM public.expense_groups AS anchor_group
  JOIN public.expense_group_members AS actor_member
    ON actor_member.group_id = anchor_group.id
   AND actor_member.id = p_anchor_from_member_id
   AND actor_member.user_id = p_actor_id
   AND actor_member.status = 'active'
  JOIN public.expense_group_members AS counterparty_member
    ON counterparty_member.group_id = anchor_group.id
   AND counterparty_member.id = p_anchor_to_member_id
   AND counterparty_member.status = 'active'
   AND counterparty_member.user_id IS NOT NULL
  WHERE anchor_group.id = p_anchor_group_id
    AND anchor_group.status IN ('active', 'settling');
  IF v_counterparty_user_id IS NULL
     OR v_counterparty_user_id = p_actor_id
     OR NOT public.expense_has_beta_access(v_counterparty_user_id) THEN
    RAISE EXCEPTION 'expense_settlement_pair_not_found';
  END IF;

  CREATE TEMP TABLE pg_temp.expense_batch_pair_groups (
    group_id uuid PRIMARY KEY
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.expense_batch_pair_groups (group_id)
  SELECT DISTINCT group_row.id
  FROM public.expense_groups AS group_row
  JOIN public.expense_group_members AS actor_member
    ON actor_member.group_id = group_row.id
   AND actor_member.user_id = p_actor_id
   AND actor_member.status = 'active'
  JOIN public.expense_group_members AS counterparty_member
    ON counterparty_member.group_id = group_row.id
   AND counterparty_member.user_id = v_counterparty_user_id
   AND counterparty_member.status = 'active'
  WHERE group_row.status IN ('active', 'settling');

  IF NOT EXISTS (SELECT 1 FROM pg_temp.expense_batch_pair_groups) THEN
    RAISE EXCEPTION 'expense_settlement_pair_not_found';
  END IF;

  -- Canonical deadlock-safe order for every group shared by this exact pair.
  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  JOIN pg_temp.expense_batch_pair_groups AS pair_group
    ON pair_group.group_id = group_row.id
  ORDER BY group_row.id
  FOR UPDATE OF group_row;

  -- Revalidate the anchor after the group locks. Membership writers share the
  -- same group-row lock, so the derived identity is now stable for this tx.
  IF NOT EXISTS (
    SELECT 1
    FROM public.expense_group_members AS actor_member
    JOIN public.expense_group_members AS counterparty_member
      ON counterparty_member.group_id = actor_member.group_id
     AND counterparty_member.id = p_anchor_to_member_id
     AND counterparty_member.user_id = v_counterparty_user_id
     AND counterparty_member.status = 'active'
    WHERE actor_member.group_id = p_anchor_group_id
      AND actor_member.id = p_anchor_from_member_id
      AND actor_member.user_id = p_actor_id
      AND actor_member.status = 'active'
  ) THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;

  CREATE TEMP TABLE pg_temp.expense_batch_current_contexts (
    group_id uuid,
    from_member_id uuid,
    to_member_id uuid,
    financial_version bigint,
    amount_minor bigint,
    direction text,
    remaining_minor bigint,
    PRIMARY KEY (group_id, from_member_id, to_member_id)
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.expense_batch_current_contexts (
    group_id, from_member_id, to_member_id, financial_version,
    amount_minor, direction, remaining_minor
  )
  SELECT
    group_row.id,
    settlement.from_member_id,
    settlement.to_member_id,
    group_row.financial_version,
    settlement.amount_minor,
    CASE
      WHEN from_member.user_id = p_actor_id THEN 'outgoing'
      ELSE 'incoming'
    END,
    settlement.amount_minor
  FROM public.expense_groups AS group_row
  JOIN pg_temp.expense_batch_pair_groups AS pair_group
    ON pair_group.group_id = group_row.id
  CROSS JOIN LATERAL public.expense_simplified_settlement(
    group_row.id, p_currency, true
  ) AS settlement
  JOIN public.expense_group_members AS from_member
    ON from_member.group_id = group_row.id
   AND from_member.id = settlement.from_member_id
   AND from_member.status = 'active'
   AND from_member.user_id IS NOT NULL
  JOIN public.expense_group_members AS to_member
    ON to_member.group_id = group_row.id
   AND to_member.id = settlement.to_member_id
   AND to_member.status = 'active'
   AND to_member.user_id IS NOT NULL
  WHERE (
    from_member.user_id = p_actor_id
    AND to_member.user_id = v_counterparty_user_id
  ) OR (
    from_member.user_id = v_counterparty_user_id
    AND to_member.user_id = p_actor_id
  );

  IF EXISTS (
    SELECT 1
    FROM pg_temp.expense_batch_expected_contexts AS expected
    FULL JOIN pg_temp.expense_batch_current_contexts AS current_context
      ON current_context.group_id = expected.group_id
     AND current_context.from_member_id = expected.from_member_id
     AND current_context.to_member_id = expected.to_member_id
    WHERE expected.group_id IS NULL
       OR current_context.group_id IS NULL
       OR expected.expected_financial_version <> current_context.financial_version
       OR expected.amount_minor <> current_context.amount_minor
  ) THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;

  SELECT
    coalesce(sum(current_context.amount_minor) FILTER (
      WHERE current_context.direction = 'outgoing'
    ), 0),
    coalesce(sum(current_context.amount_minor) FILTER (
      WHERE current_context.direction = 'incoming'
    ), 0)
  INTO v_gross_payable, v_gross_receivable
  FROM pg_temp.expense_batch_current_contexts AS current_context;

  IF v_gross_payable NOT BETWEEN 1 AND 9007199254740991
     OR v_gross_receivable NOT BETWEEN 0 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_offset := CASE WHEN p_use_offset THEN
    LEAST(v_gross_payable, v_gross_receivable)::bigint
  ELSE 0 END;
  IF p_use_offset AND v_offset <= 0 THEN
    RAISE EXCEPTION 'expense_settlement_offset_conflict';
  END IF;
  IF p_cash_minor > v_gross_payable::bigint - v_offset
     OR p_cash_minor + v_offset <= 0 THEN
    RAISE EXCEPTION 'expense_settlement_amount_conflict';
  END IF;

  -- Lock the current recipient profile only when an outside payment is part of
  -- the proposal. The exact opaque id/version (or confirmed absence) must be
  -- the same state that the server rendered before the payer acted.
  IF p_cash_minor > 0 THEN
    -- Existing v2 writers take a profile row lock before their table trigger
    -- takes owner lock 9602. Match that order for an existing row to avoid a
    -- row-lock/advisory-lock cycle, then re-read after 9602 to cover inserts.
    SELECT profile.* INTO v_current_profile
    FROM public.expense_payment_profiles_v2 AS profile
    WHERE profile.owner_user_id = v_counterparty_user_id
    FOR SHARE;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_counterparty_user_id::text, 9602)
    );
    SELECT profile.* INTO v_current_profile
    FROM public.expense_payment_profiles_v2 AS profile
    WHERE profile.owner_user_id = v_counterparty_user_id;
    IF (
      p_expected_profile_id IS NULL
      AND v_current_profile.id IS NOT NULL
    ) OR (
      p_expected_profile_id IS NOT NULL
      AND (
        v_current_profile.id IS DISTINCT FROM p_expected_profile_id
        OR v_current_profile.version IS DISTINCT FROM p_expected_profile_version
        OR pg_catalog.md5(pg_catalog.concat_ws(
          '|',
          v_current_profile.id::text,
          v_current_profile.version::text,
          v_current_profile.payload_fingerprint
        )) IS DISTINCT FROM p_expected_profile_state_token
      )
    ) THEN
      RAISE EXCEPTION 'expense_payment_profile_conflict';
    END IF;
  END IF;

  INSERT INTO public.expense_settlement_batches (
    id, proposed_by_user_id, counterparty_user_id, currency,
    gross_payable_minor, gross_receivable_minor, offset_minor, cash_minor,
    expected_profile_id, expected_profile_version, expected_profile_state_token,
    occurred_on, note, status
  ) VALUES (
    v_batch_id, p_actor_id, v_counterparty_user_id, p_currency,
    v_gross_payable::bigint, v_gross_receivable::bigint, v_offset, p_cash_minor,
    p_expected_profile_id, p_expected_profile_version, p_expected_profile_state_token,
    p_occurred_on, NULLIF(btrim(p_note), ''), 'proposed'
  );

  -- Full bilateral offset, outgoing direction first.
  v_remaining := v_offset;
  FOR v_context IN
    SELECT current_context.*
    FROM pg_temp.expense_batch_current_contexts AS current_context
    WHERE current_context.direction = 'outgoing'
    ORDER BY current_context.amount_minor DESC, current_context.group_id,
      current_context.from_member_id, current_context.to_member_id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_allocation := LEAST(v_remaining, v_context.remaining_minor);
    IF v_allocation > 0 THEN
      v_sequence := v_sequence + 1;
      PERFORM public.expense_insert_settlement_batch_item(
        v_batch_id, v_sequence, v_context.group_id,
        v_context.from_member_id, v_context.to_member_id,
        'debt_offset', v_allocation, p_currency, p_occurred_on, NULL, p_actor_id
      );
      UPDATE pg_temp.expense_batch_current_contexts AS current_context
      SET remaining_minor = current_context.remaining_minor - v_allocation
      WHERE current_context.group_id = v_context.group_id
        AND current_context.from_member_id = v_context.from_member_id
        AND current_context.to_member_id = v_context.to_member_id;
      v_remaining := v_remaining - v_allocation;
    END IF;
  END LOOP;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'expense_settlement_allocation_invalid';
  END IF;

  -- Matching offset in the reverse direction. This is what makes the proposal
  -- auditable and prevents a one-sided write from extinguishing only one debt.
  v_remaining := v_offset;
  FOR v_context IN
    SELECT current_context.*
    FROM pg_temp.expense_batch_current_contexts AS current_context
    WHERE current_context.direction = 'incoming'
    ORDER BY current_context.amount_minor DESC, current_context.group_id,
      current_context.from_member_id, current_context.to_member_id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_allocation := LEAST(v_remaining, v_context.remaining_minor);
    IF v_allocation > 0 THEN
      v_sequence := v_sequence + 1;
      PERFORM public.expense_insert_settlement_batch_item(
        v_batch_id, v_sequence, v_context.group_id,
        v_context.from_member_id, v_context.to_member_id,
        'debt_offset', v_allocation, p_currency, p_occurred_on, NULL, p_actor_id
      );
      UPDATE pg_temp.expense_batch_current_contexts AS current_context
      SET remaining_minor = current_context.remaining_minor - v_allocation
      WHERE current_context.group_id = v_context.group_id
        AND current_context.from_member_id = v_context.from_member_id
        AND current_context.to_member_id = v_context.to_member_id;
      v_remaining := v_remaining - v_allocation;
    END IF;
  END LOOP;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'expense_settlement_allocation_invalid';
  END IF;

  -- Outside payment uses the largest outgoing capacity left after offset.
  v_remaining := p_cash_minor;
  FOR v_context IN
    SELECT current_context.*
    FROM pg_temp.expense_batch_current_contexts AS current_context
    WHERE current_context.direction = 'outgoing'
    ORDER BY current_context.remaining_minor DESC, current_context.group_id,
      current_context.from_member_id, current_context.to_member_id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_allocation := LEAST(v_remaining, v_context.remaining_minor);
    IF v_allocation > 0 THEN
      v_sequence := v_sequence + 1;
      PERFORM public.expense_insert_settlement_batch_item(
        v_batch_id, v_sequence, v_context.group_id,
        v_context.from_member_id, v_context.to_member_id,
        'external_payment', v_allocation, p_currency, p_occurred_on, p_note, p_actor_id
      );
      UPDATE pg_temp.expense_batch_current_contexts AS current_context
      SET remaining_minor = current_context.remaining_minor - v_allocation
      WHERE current_context.group_id = v_context.group_id
        AND current_context.from_member_id = v_context.from_member_id
        AND current_context.to_member_id = v_context.to_member_id;
      v_remaining := v_remaining - v_allocation;
    END IF;
  END LOOP;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'expense_settlement_allocation_invalid';
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT item.group_id ORDER BY item.group_id)
  INTO v_affected_group_ids
  FROM public.expense_settlement_batch_items AS item
  WHERE item.batch_id = v_batch_id;
  IF v_affected_group_ids IS NULL OR pg_catalog.cardinality(v_affected_group_ids) = 0 THEN
    RAISE EXCEPTION 'expense_settlement_allocation_invalid';
  END IF;

  -- SQL124 late review guard. The legacy BEFORE INSERT guard cannot see
  -- NEW, so validate the complete post-item reservation state in every
  -- affected group while its canonical group lock is still held. Raising here
  -- rolls back the batch,
  -- obligations, repayments, allocations and idempotency request atomically.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(v_affected_group_ids) AS affected_group(group_id)
    WHERE public.expense_reported_repayments_need_review(
      affected_group.group_id
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_review_required';
  END IF;

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = ANY(v_affected_group_ids);

  FOREACH v_group_id IN ARRAY v_affected_group_ids LOOP
    PERFORM public.expense_record_settlement_batch_activity(
      v_group_id, p_actor_id, v_batch_id, 'expense_settlement_batch_proposed'
    );
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'proposed',
    'group_ids', pg_catalog.to_jsonb(v_affected_group_ids)
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.expense_propose_settlement_batch(
  uuid, uuid, uuid, uuid, text, jsonb, uuid, bigint, text, bigint, boolean, date, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_propose_settlement_batch(
  uuid, uuid, uuid, uuid, text, jsonb, uuid, bigint, text, bigint, boolean, date, text, uuid
)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_propose_settlement_batch(
  uuid, uuid, uuid, uuid, text, jsonb, uuid, bigint, text, bigint, boolean, date, text, uuid
)
  TO service_role;

DO $postflight$
DECLARE
  v_procedure oid;
  v_source text;
  v_guard_position integer;
  v_affected_position integer;
  v_version_position integer;
  v_review_call_count integer;
  v_batch_rows bigint;
  v_item_rows bigint;
BEGIN
  v_procedure := pg_catalog.to_regprocedure(
    'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
  );
  IF v_procedure IS NULL THEN
    RAISE EXCEPTION 'expense_124_postflight_missing_proposal_rpc';
  END IF;

  SELECT procedure.prosrc
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = v_procedure;

  v_guard_position := pg_catalog.strpos(
    v_source, '-- SQL124 late review guard.'
  );
  v_affected_position := pg_catalog.strpos(
    v_source, 'IF v_affected_group_ids IS NULL'
  );
  v_version_position := pg_catalog.strpos(
    v_source, 'UPDATE public.expense_groups AS group_row'
  );
  v_review_call_count := (
    pg_catalog.length(v_source)
    - pg_catalog.length(pg_catalog.replace(
      v_source, 'public.expense_reported_repayments_need_review', ''
    ))
  ) / pg_catalog.length('public.expense_reported_repayments_need_review');

  IF v_guard_position <= v_affected_position
     OR v_guard_position >= v_version_position
     OR v_review_call_count <> 1
     OR v_source NOT LIKE '%FROM pg_catalog.unnest(v_affected_group_ids) AS affected_group(group_id)%'
     OR v_source NOT LIKE '%RAISE EXCEPTION ''expense_repayment_review_required''%' THEN
    RAISE EXCEPTION 'expense_124_postflight_guard_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = v_procedure
      AND procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND owner_role.rolname = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          COALESCE(procedure.proconfig, ARRAY[]::text[])
        ) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'expense_124_postflight_security_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE procedure.oid = v_procedure
      AND privilege.privilege_type = 'EXECUTE'
      AND COALESCE(grantee_role.rolname, 'PUBLIC')
        NOT IN ('postgres', 'service_role')
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS privilege
    JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE procedure.oid = v_procedure
      AND privilege.privilege_type = 'EXECUTE'
      AND grantee_role.rolname = 'service_role'
  ) <> 1 THEN
    RAISE EXCEPTION 'expense_124_postflight_acl_invalid';
  END IF;

  SELECT pg_catalog.count(*) INTO v_batch_rows
  FROM public.expense_settlement_batches;
  SELECT pg_catalog.count(*) INTO v_item_rows
  FROM public.expense_settlement_batch_items;
  IF v_batch_rows <> 0 OR v_item_rows <> 0 THEN
    RAISE EXCEPTION
      'expense_124_postflight_unexpected_data: batches=%, items=%',
      v_batch_rows, v_item_rows;
  END IF;
END;
$postflight$;

COMMIT;
