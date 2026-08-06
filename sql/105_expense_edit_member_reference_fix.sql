-- SQL105 repairs expense member-reference JSON precedence and separates
-- financial participation from Teskeið access consent.
--
-- Financial participants may be active or invited. Access remains active-only.
-- An active owner/admin may settle for an unlinked guest or consent-pending
-- invited party without receiving another user's private payment preferences.
-- Pending guest identity links remain usable through settling and settled, so
-- the same durable member_id can be linked later without rewriting history.
--
-- Stebbi alone runs this migration after the matching read-only preflight.
-- It replaces thirteen service-role RPCs, changes no tables or rows, and is
-- idempotent because CREATE OR REPLACE preserves each function identity.

BEGIN;

DO $sql105$
DECLARE
  v_update_source text;
  v_status_source text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
      'public.expense_respond_group_invitation(uuid,uuid,text,uuid)',
      'public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)',
      'public.expense_transition_repayment(uuid,uuid,text,uuid)',
      'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)',
      'public.expense_cancel_expense(uuid,uuid,uuid)',
      'public.expense_set_group_status(uuid,uuid,text,uuid)',
      'public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)',
      'public.expense_get_my_member_invitations(uuid)',
      'public.expense_reserve_member_invitation_send(uuid,uuid)',
      'public.expense_sync_my_member_invitation_events(uuid)',
      'public.expense_respond_member_invitation(uuid,uuid,text,uuid)',
      'public.expense_cancel_member_invitation(uuid,uuid,uuid)'
    ]::text[]) AS required(signature)
    WHERE to_regprocedure(required.signature) IS NULL
  )
     OR to_regprocedure('public.expense_valid_revision_snapshot(jsonb)') IS NULL
     OR to_regclass('public.expense_revisions') IS NULL
     OR to_regclass('public.expense_member_invitations') IS NULL THEN
    RAISE EXCEPTION 'expense_participant_repair_prerequisites_missing';
  END IF;

  SELECT procedure.prosrc INTO v_update_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  );
  SELECT procedure.prosrc INTO v_status_source
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.expense_set_group_status(uuid,uuid,text,uuid)'
  );

  IF pg_catalog.strpos(v_update_source, 'INSERT INTO public.expense_revisions') = 0
     OR pg_catalog.strpos(v_update_source, 'expense_group_reopened_after_expense_edit') = 0
     OR pg_catalog.strpos(v_status_source, 'expense_group_not_settled') = 0 THEN
    RAISE EXCEPTION 'expense_participant_repair_unexpected_lineage';
  END IF;
END;
$sql105$;

CREATE OR REPLACE FUNCTION public.expense_create_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_group_id uuid,
  p_title text,
  p_total_minor bigint,
  p_currency text,
  p_incurred_on date,
  p_category text,
  p_note text,
  p_split_method text,
  p_one_off_members jsonb,
  p_payments jsonb,
  p_shares jsonb,
  p_obligations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid := p_group_id;
  v_group public.expense_groups%ROWTYPE;
  v_actor_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_member jsonb;
  v_member_id uuid;
  v_user_id uuid;
  v_owner_count integer;
  v_payment_sum bigint;
  v_share_sum bigint;
  v_canonical_members jsonb;
  v_canonical_payments jsonb;
  v_canonical_shares jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  IF p_expense_id IS NULL
     OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 200
     OR p_total_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency !~ '^[A-Z]{3}$'
     OR p_incurred_on IS NULL
     OR (p_category IS NOT NULL AND p_category NOT IN (
       'food', 'accommodation', 'transport', 'travel', 'home',
       'entertainment', 'gifts', 'shopping', 'other'
     ))
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000)
     OR p_split_method NOT IN (
       'equal', 'percentage', 'fixed', 'mixed_equal_remainder',
       'mixed_percentage_remainder', 'weighted'
     )
     OR jsonb_typeof(p_one_off_members) <> 'array'
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_typeof(p_shares) <> 'array'
     OR jsonb_typeof(p_obligations) <> 'array' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF jsonb_array_length(p_payments) NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_shares) NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_obligations) > 50 THEN
    RAISE EXCEPTION 'expense_split_invalid';
  END IF;

  IF p_group_id IS NULL THEN
    IF jsonb_array_length(p_one_off_members) NOT BETWEEN 2 AND 50 THEN
      RAISE EXCEPTION 'expense_members_invalid';
    END IF;
    SELECT count(*)::integer
    INTO v_owner_count
    FROM jsonb_array_elements(p_one_off_members) AS item
    WHERE item->>'user_id' = p_actor_id::text
      AND item->>'role' = 'owner';
    IF v_owner_count <> 1
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_one_off_members) AS item
         WHERE jsonb_typeof(item) <> 'object'
            OR (item - ARRAY['id', 'user_id', 'display_name', 'role', 'status']::text[]) <> '{}'::jsonb
            OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            OR char_length(btrim(item->>'display_name')) NOT BETWEEN 1 AND 120
            OR item->>'role' NOT IN ('owner', 'member')
            OR (item->>'role' = 'owner'
              AND (item->>'user_id') IS DISTINCT FROM p_actor_id::text)
            OR (
              item->>'user_id' IS NOT NULL
              AND item->>'user_id' <> p_actor_id::text
            )
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_one_off_members) AS item
         GROUP BY item->>'id' HAVING count(*) > 1
       ) THEN
      RAISE EXCEPTION 'expense_members_invalid';
    END IF;
  ELSIF jsonb_array_length(p_one_off_members) <> 0 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;

  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_obligations) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY[
            'from_member_id', 'to_member_id', 'amount_minor', 'currency'
          ]::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY[
            'from_member_id', 'to_member_id', 'amount_minor', 'currency'
          ]::text[])
          OR (item->>'from_member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'to_member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR item->>'from_member_id' = item->>'to_member_id'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
          OR (item->>'currency') !~ '^[A-Z]{3}$'
     ) THEN
    RAISE EXCEPTION 'expense_split_invalid';
  END IF;

  SELECT sum((item->>'amount_minor')::bigint)
  INTO v_payment_sum
  FROM jsonb_array_elements(p_payments) AS item;
  SELECT sum((item->>'amount_minor')::bigint)
  INTO v_share_sum
  FROM jsonb_array_elements(p_shares) AS item;
  IF v_payment_sum <> p_total_minor OR v_share_sum <> p_total_minor THEN
    RAISE EXCEPTION 'expense_split_total_mismatch';
  END IF;

  IF p_group_id IS NULL THEN
    IF EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_payments) AS payment
         WHERE NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_one_off_members) AS member
           WHERE (member->>'id')::uuid = (payment->>'member_id')::uuid
         )
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_shares) AS share
         WHERE NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_one_off_members) AS member
           WHERE (member->>'id')::uuid = (share->>'member_id')::uuid
         )
       ) THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;

    SELECT jsonb_agg(
      jsonb_build_object(
        'ordinal', member.ordinal,
        'userId', member.value->'user_id',
        'guestDisplayName', CASE
          WHEN jsonb_typeof(member.value->'user_id') = 'string' THEN NULL
          ELSE btrim(member.value->>'display_name')
        END,
        'role', member.value->>'role'
      )
      ORDER BY member.ordinal
    )
    INTO v_canonical_members
    FROM jsonb_array_elements(p_one_off_members) WITH ORDINALITY
      AS member(value, ordinal);

    SELECT jsonb_agg(
      jsonb_build_object(
        'memberOrdinal', member.ordinal,
        'amountMinor', (payment.value->>'amount_minor')::bigint
      )
      ORDER BY payment.ordinal
    )
    INTO v_canonical_payments
    FROM jsonb_array_elements(p_payments) WITH ORDINALITY
      AS payment(value, ordinal)
    JOIN jsonb_array_elements(p_one_off_members) WITH ORDINALITY
      AS member(value, ordinal)
      ON (member.value->>'id')::uuid = (payment.value->>'member_id')::uuid;

    SELECT jsonb_agg(
      jsonb_build_object(
        'memberOrdinal', member.ordinal,
        'amountMinor', (share.value->>'amount_minor')::bigint
      )
      ORDER BY share.ordinal
    )
    INTO v_canonical_shares
    FROM jsonb_array_elements(p_shares) WITH ORDINALITY
      AS share(value, ordinal)
    JOIN jsonb_array_elements(p_one_off_members) WITH ORDINALITY
      AS member(value, ordinal)
      ON (member.value->>'id')::uuid = (share.value->>'member_id')::uuid;
  ELSE
    v_canonical_members := '[]'::jsonb;
    v_canonical_payments := p_payments;
    v_canonical_shares := p_shares;
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'title', btrim(p_title),
    'totalMinor', p_total_minor,
    'currency', p_currency,
    'incurredOn', p_incurred_on,
    'category', p_category,
    'note', NULLIF(btrim(p_note), ''),
    'splitMethod', p_split_method,
    'oneOffMembers', v_canonical_members,
    'payments', v_canonical_payments,
    'shares', v_canonical_shares,
    'obligationsContract', 'ignored_server_rederived'
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_create_expense', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF p_group_id IS NULL THEN
    v_group_id := gen_random_uuid();
    INSERT INTO public.expense_groups (
      id, kind, name, default_currency, default_include_creator, created_by
    )
    VALUES (
      v_group_id, 'one_off', btrim(p_title), p_currency, true, p_actor_id
    );

    FOR v_member IN SELECT value FROM jsonb_array_elements(p_one_off_members)
    LOOP
      v_member_id := (v_member->>'id')::uuid;
      v_user_id := CASE
        WHEN v_member->>'user_id' = p_actor_id::text THEN p_actor_id
        ELSE NULL
      END;
      INSERT INTO public.expense_group_members (
        id, group_id, user_id, display_name, role, status
      )
      VALUES (
        v_member_id, v_group_id, v_user_id, btrim(v_member->>'display_name'),
        CASE WHEN v_user_id = p_actor_id THEN 'owner' ELSE 'member' END,
        'active'
      );
    END LOOP;
  ELSE
    SELECT group_row.*
    INTO v_group
    FROM public.expense_groups AS group_row
    WHERE group_row.id = p_group_id
    FOR UPDATE;
    v_actor_role := public.expense_active_member_role(p_actor_id, p_group_id);
    IF v_group.id IS NULL OR v_group.kind <> 'group'
       OR v_group.status <> 'active' OR v_actor_role IS NULL THEN
      RAISE EXCEPTION 'expense_not_allowed';
    END IF;
  END IF;

  IF EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_payments) AS item
       LEFT JOIN public.expense_group_members AS member
         ON member.id = (item->>'member_id')::uuid
        AND member.group_id = v_group_id
        AND member.status IN ('active', 'invited')
       WHERE member.id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_shares) AS item
       LEFT JOIN public.expense_group_members AS member
         ON member.id = (item->>'member_id')::uuid
        AND member.group_id = v_group_id
        AND member.status IN ('active', 'invited')
       WHERE member.id IS NULL
     ) THEN
    RAISE EXCEPTION 'expense_member_invalid';
  END IF;

  INSERT INTO public.expenses (
    id, group_id, title, total_minor, currency, incurred_on,
    category, note, split_method, created_by
  )
  VALUES (
    p_expense_id, v_group_id, btrim(p_title), p_total_minor, p_currency,
    p_incurred_on, p_category, NULLIF(btrim(p_note), ''),
    p_split_method, p_actor_id
  );

  INSERT INTO public.expense_payments (group_id, expense_id, member_id, amount_minor)
  SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
  FROM jsonb_array_elements(p_payments) AS item;

  INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)
  SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
  FROM jsonb_array_elements(p_shares) AS item;

  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group_id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'expense_amount_overflow';
  END IF;

  -- p_obligations is retained only for RPC compatibility with the domain
  -- foundation. It is intentionally not persisted or trusted. A locked,
  -- server-rederived obligation is created only when repayment is reported.

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_created', 'expense', p_expense_id,
    'expense_created', btrim(p_title),
    (SELECT group_row.name FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id),
    ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object('group_id', v_group_id, 'expense_id', p_expense_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_respond_group_invitation(
  p_actor_id uuid,
  p_group_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
  v_event text;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_action IS NULL OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_respond_group_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.user_id = p_actor_id
    AND member.status = 'invited'
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind NOT IN ('group', 'one_off')
     OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR v_member.id IS NULL THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  IF p_action = 'accept' THEN
    UPDATE public.expense_group_members AS member
    SET status = 'active'
    WHERE member.id = v_member.id;
  ELSIF public.expense_member_can_exit(p_group_id, v_member.id) THEN
    UPDATE public.expense_group_members AS member
    SET status = 'declined'
    WHERE member.id = v_member.id;
  ELSE
    -- Declining Teskeið access must not erase or strand a real-world debt.
    -- Keep the durable financial party as an unlinked guest so a manager can
    -- finish settlement and the same member_id may be linked again later.
    UPDATE public.expense_group_members AS member
    SET user_id = NULL,
        role = 'member',
        status = 'active'
    WHERE member.id = v_member.id;
  END IF;

  v_event := CASE p_action
    WHEN 'accept' THEN 'expense_group_invitation_accepted'
    ELSE 'expense_group_invitation_declined'
  END;
  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, v_event, 'expense_group', p_group_id,
    v_event, NULL, v_group.name, ARRAY[p_actor_id], true
  );

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_report_repayment(
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
  v_preference_id uuid;
  v_preference public.expense_payment_preferences%ROWTYPE;
  v_snapshot jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_group_id IS NULL OR p_from_member_id IS NULL OR p_to_member_id IS NULL
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
    p_actor_id, p_request_id, 'expense_report_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Every financial mutation locks the group first. This serializes balance
  -- derivation and makes expected_financial_version an effective CAS.
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
  IF v_from.id IS NULL OR v_to.id IS NULL
     OR NOT (
       (v_from.status = 'active' AND v_from.user_id = p_actor_id)
       OR (
         (v_from.user_id IS NULL OR v_from.status = 'invited')
         AND coalesce(v_role, '') IN ('owner', 'admin')
       )
     ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  SELECT settlement.amount_minor
  INTO v_available
  FROM public.expense_simplified_settlement(p_group_id, p_currency, true) AS settlement
  WHERE settlement.from_member_id = p_from_member_id
    AND settlement.to_member_id = p_to_member_id
  LIMIT 1;
  IF v_available IS NULL OR p_amount_minor > v_available THEN
    RAISE EXCEPTION 'expense_repayment_exceeds_available';
  END IF;

  -- Payment preferences use a separate owner-level advisory-lock namespace.
  -- Global order is actor mutation lock (9601), financial group row, then
  -- preference owner lock (9602), then preference/assignment rows. Save,
  -- deactivate, and account deletion take the same owner lock before touching
  -- preference data, so the authorization decision and copied snapshot are
  -- from one serialized state without crossing actor locks between users.
  --
  -- An admin reporting for an unregistered guest debtor must not receive the
  -- registered creditor's payment details. Snapshot only for the debtor acting
  -- for their own registered party.
  IF v_to.user_id IS NOT NULL AND v_from.user_id = p_actor_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_to.user_id::text, 9602)
    );

    -- Resolve the recipient's most specific assignment. A NULL preference_id
    -- is an explicit suppression and prevents fallback to a broader row.
    SELECT assignment.preference_id
    INTO v_preference_id
    FROM public.expense_payment_preference_assignments AS assignment
    WHERE assignment.owner_user_id = v_to.user_id
      AND (
        (assignment.scope_type = 'group_currency'
          AND assignment.group_id = p_group_id
          AND assignment.currency = p_currency)
        OR (assignment.scope_type = 'currency'
          AND assignment.group_id IS NULL
          AND assignment.currency = p_currency)
        OR (assignment.scope_type = 'general'
          AND assignment.group_id IS NULL
          AND assignment.currency IS NULL)
      )
    ORDER BY CASE assignment.scope_type
      WHEN 'group_currency' THEN 1
      WHEN 'currency' THEN 2
      ELSE 3
    END
    LIMIT 1;

    IF v_preference_id IS NOT NULL THEN
      SELECT preference.* INTO v_preference
      FROM public.expense_payment_preferences AS preference
      WHERE preference.id = v_preference_id
        AND preference.owner_user_id = v_to.user_id
        AND preference.active
        AND preference.visibility = 'debt_context'
        AND (
          preference.supported_currencies IS NULL
          OR p_currency = ANY(preference.supported_currencies)
        );

      IF v_preference.id IS NOT NULL THEN
        v_snapshot := jsonb_build_object(
          'title', v_preference.title,
          'kind', v_preference.kind,
          'currency', p_currency,
          'details', v_preference.details,
          'visibility', v_preference.visibility,
          'captured_at', now(),
          'owner_user_id', v_preference.owner_user_id,
          'source_preference_id', v_preference.id,
          'source_version', v_preference.version
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.expense_obligations (
    id, group_id, from_member_id, to_member_id, amount_minor, currency
  ) VALUES (
    v_obligation_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency
  );
  INSERT INTO public.expense_repayments (
    id, group_id, from_member_id, to_member_id, amount_minor, currency,
    occurred_on, note, status, reported_by, payment_preference_snapshot
  ) VALUES (
    v_repayment_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency, p_occurred_on, NULLIF(btrim(p_note), ''),
    'reported', p_actor_id, v_snapshot
  );
  INSERT INTO public.expense_repayment_allocations (
    group_id, repayment_id, obligation_id, amount_minor
  ) VALUES (p_group_id, v_repayment_id, v_obligation_id, p_amount_minor);

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_repayment_reported',
    'expense_repayment', v_repayment_id, 'expense_repayment_reported',
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

CREATE OR REPLACE FUNCTION public.expense_transition_repayment(
  p_actor_id uuid,
  p_repayment_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_repayment public.expense_repayments%ROWTYPE;
  v_from public.expense_group_members%ROWTYPE;
  v_to public.expense_group_members%ROWTYPE;
  v_role text;
  v_new_status text;
  v_event text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_action IS NULL OR p_action NOT IN ('confirm', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'repaymentId', p_repayment_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_transition_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT repayment.group_id INTO v_group_id
  FROM public.expense_repayments AS repayment
  WHERE repayment.id = p_repayment_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_repayment_not_found';
  END IF;

  -- Preserve the global lock order: group before repayment.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT repayment.* INTO v_repayment
  FROM public.expense_repayments AS repayment
  WHERE repayment.id = p_repayment_id
    AND repayment.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);
  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.id = v_repayment.from_member_id
    AND member.group_id = v_group_id;
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.id = v_repayment.to_member_id
    AND member.group_id = v_group_id;

  -- Confirmed is terminal: neither debtor nor manager can undo it. Rejection
  -- and cancellation are also terminal; every transition starts at reported.
  IF v_repayment.status <> 'reported' OR v_role IS NULL
     OR v_from.status NOT IN ('active', 'invited')
     OR v_to.status NOT IN ('active', 'invited') THEN
    RAISE EXCEPTION 'expense_repayment_transition_invalid';
  END IF;
  IF p_action IN ('confirm', 'reject') AND NOT (
    (v_to.status = 'active' AND v_to.user_id = p_actor_id)
    OR (
      (v_to.user_id IS NULL OR v_to.status = 'invited')
      AND coalesce(v_role, '') IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;
  IF p_action = 'cancel' AND NOT (
    v_from.user_id = p_actor_id
    OR v_repayment.reported_by = p_actor_id
    OR coalesce(v_role, '') IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  v_new_status := CASE p_action
    WHEN 'confirm' THEN 'confirmed'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;
  v_event := CASE p_action
    WHEN 'confirm' THEN 'expense_repayment_confirmed'
    WHEN 'reject' THEN 'expense_repayment_rejected'
    ELSE 'expense_repayment_cancelled'
  END;
  UPDATE public.expense_repayments AS repayment
  SET status = v_new_status
  WHERE repayment.id = p_repayment_id;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, v_event, 'expense_repayment', p_repayment_id,
    v_event, NULL, v_group.name, ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object('group_id', v_group_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_update_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_expected_financial_version bigint,
  p_title text,
  p_total_minor bigint,
  p_currency text,
  p_incurred_on date,
  p_category text,
  p_note text,
  p_split_method text,
  p_preserve_shares boolean,
  p_new_guest_members jsonb,
  p_payments jsonb,
  p_shares jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_payment_sum bigint;
  v_share_sum bigint;
  v_member jsonb;
  v_new_member_id uuid;
  v_current_payments jsonb;
  v_current_shares jsonb;
  v_input_payments jsonb;
  v_input_shares jsonb;
  v_canonical_new_members jsonb;
  v_changed boolean;
  v_new_version bigint;
  v_changed_fields text[];
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_summary_code text;
  v_activity_id uuid;
  v_revision_id uuid := gen_random_uuid();
  v_reopened boolean := false;
  v_group_name text;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_expense_id IS NULL
     OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
     OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 200
     OR p_total_minor IS NULL OR p_total_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_incurred_on IS NULL
     OR (p_category IS NOT NULL AND p_category NOT IN (
       'food', 'accommodation', 'transport', 'travel', 'home',
       'entertainment', 'gifts', 'shopping', 'other'
     ))
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000)
     OR p_split_method IS NULL OR p_split_method NOT IN (
       'equal', 'percentage', 'fixed', 'mixed_equal_remainder',
       'mixed_percentage_remainder', 'weighted'
     )
     OR p_preserve_shares IS NULL
     OR p_new_guest_members IS NULL OR p_payments IS NULL OR p_shares IS NULL
     OR jsonb_typeof(p_new_guest_members) <> 'array'
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_typeof(p_shares) <> 'array'
     OR jsonb_array_length(p_new_guest_members) > 48
     OR jsonb_array_length(p_payments) NOT BETWEEN 1 AND 50
     OR (NOT p_preserve_shares AND jsonb_array_length(p_shares) NOT BETWEEN 1 AND 50)
     OR (p_preserve_shares AND jsonb_array_length(p_shares) <> 0) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['id', 'display_name']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['id', 'display_name']::text[])
          OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR char_length(btrim(item->>'display_name')) NOT BETWEEN 1 AND 120
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       GROUP BY item->>'id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['member_id', 'amount_minor']::text[])
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['member_id', 'amount_minor']::text[])
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
     ))
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )) THEN
    RAISE EXCEPTION 'expense_split_invalid';
  END IF;

  SELECT sum((item->>'amount_minor')::bigint) INTO v_payment_sum
  FROM jsonb_array_elements(p_payments) AS item;
  IF v_payment_sum <> p_total_minor THEN RAISE EXCEPTION 'expense_split_total_mismatch'; END IF;
  IF NOT p_preserve_shares THEN
    SELECT sum((item->>'amount_minor')::bigint) INTO v_share_sum
    FROM jsonb_array_elements(p_shares) AS item;
    IF v_share_sum <> p_total_minor THEN RAISE EXCEPTION 'expense_split_total_mismatch'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object('ordinal', item.ordinal, 'displayName', btrim(item.value->>'display_name'))
    ORDER BY item.ordinal
  ), '[]'::jsonb) INTO v_canonical_new_members
  FROM jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS item(value, ordinal);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'memberRef', coalesce('new:' || new_member.ordinal::text, 'existing:' || (payment.value->>'member_id')),
    'amountMinor', (payment.value->>'amount_minor')::bigint
  ) ORDER BY coalesce('new:' || new_member.ordinal::text, 'existing:' || (payment.value->>'member_id'))), '[]'::jsonb)
  INTO v_input_payments
  FROM jsonb_array_elements(p_payments) AS payment(value)
  LEFT JOIN jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS new_member(value, ordinal)
    ON new_member.value->>'id' = payment.value->>'member_id';
  IF p_preserve_shares THEN
    v_input_shares := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'memberRef', coalesce('new:' || new_member.ordinal::text, 'existing:' || (share.value->>'member_id')),
      'amountMinor', (share.value->>'amount_minor')::bigint
    ) ORDER BY coalesce('new:' || new_member.ordinal::text, 'existing:' || (share.value->>'member_id'))), '[]'::jsonb)
    INTO v_input_shares
    FROM jsonb_array_elements(p_shares) AS share(value)
    LEFT JOIN jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS new_member(value, ordinal)
      ON new_member.value->>'id' = share.value->>'member_id';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'expenseId', p_expense_id, 'expectedFinancialVersion', p_expected_financial_version,
    'title', btrim(p_title), 'totalMinor', p_total_minor, 'currency', p_currency,
    'incurredOn', p_incurred_on, 'category', p_category, 'note', NULLIF(btrim(p_note), ''),
    'splitMethod', p_split_method, 'preserveShares', p_preserve_shares,
    'newGuestMembers', v_canonical_new_members, 'payments', v_input_payments, 'shares', v_input_shares
  )::text);
  v_replay := public.expense_begin_request(p_actor_id, p_request_id, 'expense_update_expense', v_fingerprint);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT expense.group_id INTO v_group_id FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group_id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);
  IF v_group.id IS NULL OR v_expense.id IS NULL
     OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  IF v_group.financial_version <> p_expected_financial_version THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;
  IF v_group.kind <> 'one_off' AND jsonb_array_length(p_new_guest_members) <> 0 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;
  IF (SELECT count(*) FROM public.expense_group_members AS member
      WHERE member.group_id = v_group_id
        AND member.status IN ('active', 'invited'))
       + jsonb_array_length(p_new_guest_members) > 50 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;
  IF p_preserve_shares AND (
    p_total_minor <> v_expense.total_minor OR p_currency <> v_expense.currency
    OR p_split_method <> v_expense.split_method
  ) THEN RAISE EXCEPTION 'expense_preserve_shares_invalid'; END IF;

  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       JOIN public.expense_group_members AS existing ON existing.id = (item->>'id')::uuid
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       WHERE NOT EXISTS (
         SELECT 1 FROM public.expense_group_members AS member
         WHERE member.id = (item->>'member_id')::uuid
           AND member.group_id = v_group_id
           AND member.status IN ('active', 'invited')
       ) AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
         WHERE new_member->>'id' = item->>'member_id'
       ) AND NOT EXISTS (
         SELECT 1 FROM public.expense_payments AS historical_payment
         JOIN public.expense_group_members AS historical_member
           ON historical_member.id = historical_payment.member_id
          AND historical_member.group_id = historical_payment.group_id
         WHERE historical_payment.group_id = v_group_id
           AND historical_payment.expense_id = p_expense_id
           AND historical_payment.member_id = (item->>'member_id')::uuid
           AND historical_payment.amount_minor = (item->>'amount_minor')::bigint
       )
     )
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       WHERE NOT EXISTS (
         SELECT 1 FROM public.expense_group_members AS member
         WHERE member.id = (item->>'member_id')::uuid
           AND member.group_id = v_group_id
           AND member.status IN ('active', 'invited')
       ) AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
         WHERE new_member->>'id' = item->>'member_id'
       ) AND NOT EXISTS (
         SELECT 1 FROM public.expense_shares AS historical_share
         JOIN public.expense_group_members AS historical_member
           ON historical_member.id = historical_share.member_id
          AND historical_member.group_id = historical_share.group_id
         WHERE historical_share.group_id = v_group_id
           AND historical_share.expense_id = p_expense_id
           AND historical_share.member_id = (item->>'member_id')::uuid
           AND historical_share.amount_minor = (item->>'amount_minor')::bigint
       )
     ))
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
       WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payments) AS payment
         WHERE payment->>'member_id' = new_member->>'id'
       ) AND (p_preserve_shares OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_shares) AS share WHERE share->>'member_id' = new_member->>'id'
       ))
     ) THEN RAISE EXCEPTION 'expense_member_invalid'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'member_id', payment.member_id, 'amount_minor', payment.amount_minor
  ) ORDER BY payment.member_id), '[]'::jsonb)
  INTO v_current_payments FROM public.expense_payments AS payment WHERE payment.expense_id = p_expense_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'member_id', item->>'member_id', 'amount_minor', (item->>'amount_minor')::bigint
  ) ORDER BY item->>'member_id'), '[]'::jsonb)
  INTO v_input_payments FROM jsonb_array_elements(p_payments) AS item;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'member_id', share.member_id, 'amount_minor', share.amount_minor
  ) ORDER BY share.member_id), '[]'::jsonb)
  INTO v_current_shares FROM public.expense_shares AS share WHERE share.expense_id = p_expense_id;
  IF NOT p_preserve_shares THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'member_id', item->>'member_id', 'amount_minor', (item->>'amount_minor')::bigint
    ) ORDER BY item->>'member_id'), '[]'::jsonb)
    INTO v_input_shares FROM jsonb_array_elements(p_shares) AS item;
  ELSE
    v_input_shares := v_current_shares;
  END IF;

  v_changed := jsonb_array_length(p_new_guest_members) > 0
    OR v_expense.title IS DISTINCT FROM btrim(p_title)
    OR v_expense.total_minor IS DISTINCT FROM p_total_minor
    OR v_expense.currency IS DISTINCT FROM p_currency
    OR v_expense.incurred_on IS DISTINCT FROM p_incurred_on
    OR v_expense.category IS DISTINCT FROM p_category
    OR v_expense.note IS DISTINCT FROM NULLIF(btrim(p_note), '')
    OR v_expense.split_method IS DISTINCT FROM p_split_method
    OR v_current_payments IS DISTINCT FROM v_input_payments
    OR v_current_shares IS DISTINCT FROM v_input_shares;
  v_changed_fields := array_remove(ARRAY[
    CASE WHEN v_expense.title IS DISTINCT FROM btrim(p_title) THEN 'title' END,
    CASE WHEN v_expense.note IS DISTINCT FROM NULLIF(btrim(p_note), '') THEN 'note' END,
    CASE WHEN v_expense.total_minor IS DISTINCT FROM p_total_minor THEN 'total_minor' END,
    CASE WHEN v_expense.currency IS DISTINCT FROM p_currency THEN 'currency' END,
    CASE WHEN v_expense.incurred_on IS DISTINCT FROM p_incurred_on THEN 'incurred_on' END,
    CASE WHEN v_expense.category IS DISTINCT FROM p_category THEN 'category' END,
    CASE WHEN v_expense.split_method IS DISTINCT FROM p_split_method THEN 'split_method' END,
    CASE WHEN v_current_payments IS DISTINCT FROM v_input_payments THEN 'payments' END,
    CASE WHEN v_current_shares IS DISTINCT FROM v_input_shares THEN 'shares' END
  ]::text[], NULL);
  IF NOT v_changed THEN
    v_result := jsonb_build_object(
      'changed', false, 'group_id', v_group_id, 'expense_id', p_expense_id,
      'financial_version', v_group.financial_version
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  v_before_snapshot := public.expense_build_revision_snapshot(v_group_id, p_expense_id);
  FOR v_member IN SELECT value FROM jsonb_array_elements(p_new_guest_members) LOOP
    v_new_member_id := (v_member->>'id')::uuid;
    INSERT INTO public.expense_group_members (id, group_id, user_id, display_name, role, status)
    VALUES (v_new_member_id, v_group_id, NULL, btrim(v_member->>'display_name'), 'member', 'active');
  END LOOP;
  UPDATE public.expenses AS expense
  SET title = btrim(p_title), total_minor = p_total_minor, currency = p_currency,
      incurred_on = p_incurred_on, category = p_category,
      note = NULLIF(btrim(p_note), ''), split_method = p_split_method
  WHERE expense.id = p_expense_id;
  DELETE FROM public.expense_payments AS payment WHERE payment.expense_id = p_expense_id;
  INSERT INTO public.expense_payments (group_id, expense_id, member_id, amount_minor)
  SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
  FROM jsonb_array_elements(p_payments) AS item;
  IF NOT p_preserve_shares THEN
    DELETE FROM public.expense_shares AS share WHERE share.expense_id = p_expense_id;
    INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)
    SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
    FROM jsonb_array_elements(p_shares) AS item;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group_id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN RAISE EXCEPTION 'expense_amount_overflow'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group_id, false) AS balance
    JOIN public.expense_group_members AS member ON member.group_id = v_group_id AND member.id = balance.member_id
    WHERE member.status NOT IN ('active', 'invited')
      AND balance.amount_minor <> 0
  ) THEN RAISE EXCEPTION 'expense_inactive_member_balance'; END IF;

  v_reopened := v_group.status = 'settled' AND EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group_id, false) AS balance
    WHERE balance.amount_minor <> 0
  );
  UPDATE public.expense_groups AS group_row
  SET name = CASE WHEN v_group.kind = 'one_off' THEN left(btrim(p_title), 160) ELSE group_row.name END,
      default_currency = CASE WHEN v_group.kind = 'one_off' THEN p_currency ELSE group_row.default_currency END,
      status = CASE WHEN v_reopened THEN 'settling' ELSE group_row.status END,
      financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id
  RETURNING financial_version, name INTO v_new_version, v_group_name;

  v_after_snapshot := public.expense_build_revision_snapshot(v_group_id, p_expense_id);
  v_summary_code := CASE
    WHEN v_changed_fields = ARRAY['title']::text[] THEN 'expense_title_updated'
    WHEN v_changed_fields = ARRAY['note']::text[] THEN 'expense_description_updated'
    WHEN v_changed_fields = ARRAY['title','note']::text[] THEN 'expense_title_description_updated'
    ELSE 'expense_updated'
  END;
  v_activity_id := public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_updated', 'expense', p_expense_id,
    v_summary_code, btrim(p_title), v_group_name, ARRAY[]::uuid[], true
  );
  INSERT INTO public.expense_revisions (
    id, group_id, expense_id, activity_id, actor_user_id,
    financial_version_before, financial_version_after, changed_fields,
    before_snapshot, after_snapshot
  ) VALUES (
    v_revision_id, v_group_id, p_expense_id, v_activity_id, p_actor_id,
    v_group.financial_version, v_new_version, v_changed_fields,
    v_before_snapshot, v_after_snapshot
  );
  IF v_reopened THEN
    PERFORM public.expense_record_activity(
      v_group_id, p_actor_id, 'expense_group_settling', 'expense_group', v_group_id,
      'expense_group_reopened_after_expense_edit', NULL, v_group_name, ARRAY[]::uuid[], true
    );
  END IF;
  v_result := jsonb_build_object(
    'changed', true, 'group_id', v_group_id, 'expense_id', p_expense_id,
    'financial_version', v_new_version, 'revision_id', v_revision_id,
    'settlement_reopened', v_reopened,
    'reported_repayments_need_review', public.expense_reported_repayments_need_review(v_group_id)
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_cancel_expense(
  p_actor_id uuid,
  p_expense_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_fingerprint := md5(jsonb_build_object('expenseId', p_expense_id)::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_cancel_expense', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.status <> 'active' OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin'))
     OR EXISTS (
       SELECT 1 FROM public.expense_repayments AS repayment
       WHERE repayment.group_id = v_group.id
         AND repayment.status IN ('reported', 'confirmed')
     ) THEN
    RAISE EXCEPTION 'expense_cancel_not_allowed';
  END IF;

  UPDATE public.expenses AS expense
  SET status = 'cancelled'
  WHERE expense.id = p_expense_id;

  IF v_group.kind = 'one_off' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY(
        SELECT invitation.id
        FROM public.expense_member_invitations AS invitation
        WHERE invitation.group_id = v_group.id
          AND invitation.status = 'pending'
      ),
      'cancelled'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group.id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'expense_amount_overflow';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group.id, false) AS balance
    JOIN public.expense_group_members AS member
      ON member.group_id = v_group.id AND member.id = balance.member_id
    WHERE member.status NOT IN ('active', 'invited')
      AND balance.amount_minor <> 0
  ) THEN
    RAISE EXCEPTION 'expense_inactive_member_balance';
  END IF;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group.id;

  PERFORM public.expense_record_activity(
    v_group.id, p_actor_id, 'expense_cancelled', 'expense', p_expense_id,
    'expense_cancelled', v_expense.title, v_group.name,
    ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object('group_id', v_group.id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_set_group_status(
  p_actor_id uuid,
  p_group_id uuid,
  p_status text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_role text;
  v_event text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_status IS NULL OR p_status NOT IN ('settling', 'settled') THEN
    RAISE EXCEPTION 'expense_status_transition_invalid';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id, 'status', p_status
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_set_group_status', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR (p_status = 'settling' AND v_group.status <> 'active')
     OR (p_status = 'settled' AND v_group.status <> 'settling') THEN
    RAISE EXCEPTION 'expense_status_transition_invalid';
  END IF;
  IF p_status = 'settled' AND (
    EXISTS (
      SELECT 1 FROM public.expense_group_balances(p_group_id, false) AS balance
      WHERE balance.amount_minor <> 0
    )
    OR EXISTS (
      SELECT 1 FROM public.expense_repayments AS repayment
      WHERE repayment.group_id = p_group_id AND repayment.status = 'reported'
    )
  ) THEN
    RAISE EXCEPTION 'expense_group_not_settled';
  END IF;

  UPDATE public.expense_groups AS group_row
  SET status = p_status,
      financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;
  v_event := CASE p_status
    WHEN 'settling' THEN 'expense_group_settling'
    ELSE 'expense_group_settled'
  END;
  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, v_event, 'expense_group', p_group_id,
    v_event, NULL, v_group.name, ARRAY[]::uuid[], true
  );

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_link_guest_member_email(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_recipient_email text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_invitation record;
  v_role text;
  v_actor_email text;
  v_actor_email_canonical text;
  v_recipient_email_canonical text;
  v_inviter_display_name text;
  v_recipient_user_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_activity_id uuid;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_recipient_email_canonical := public.normalize_email_canonical(p_recipient_email);
  IF p_group_id IS NULL OR p_member_id IS NULL
     OR v_recipient_email_canonical IS NULL
     OR char_length(v_recipient_email_canonical) NOT BETWEEN 3 AND 320
     OR v_recipient_email_canonical !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL
     OR v_actor_email_canonical = v_recipient_email_canonical THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'memberId', p_member_id,
    'recipientEmailCanonical', v_recipient_email_canonical
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_link_guest_member_email', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_recipient_email_canonical, 9702)
  );

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_member_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);

  IF v_group.id IS NULL
     OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.role = 'owner' OR v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_member_link_not_allowed';
  END IF;

  -- Check recipient eligibility only after proving manager/member access, so
  -- this RPC cannot be used as a feature-allowlist oracle.
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email) = v_recipient_email_canonical
  ) THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.group_id = p_group_id
        AND invitation.status = 'pending'
        AND invitation.expires_at <= now()
    ),
    'expired'
  );

  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.group_id = p_group_id
    AND invitation.member_id = p_member_id
    AND invitation.status = 'pending'
  FOR UPDATE;

  IF EXISTS (
       SELECT 1
       FROM public.expense_group_members AS existing_member
       JOIN auth.users AS account ON account.id = existing_member.user_id
       WHERE existing_member.group_id = p_group_id
         AND existing_member.id <> p_member_id
         AND existing_member.status IN ('active', 'invited')
         AND public.normalize_email_canonical(account.email) = v_recipient_email_canonical
     )
     OR EXISTS (
       SELECT 1 FROM public.expense_member_invitations AS existing_invitation
       WHERE existing_invitation.group_id = p_group_id
         AND existing_invitation.member_id <> p_member_id
         AND existing_invitation.status = 'pending'
         AND existing_invitation.recipient_email_canonical = v_recipient_email_canonical
     ) THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  IF v_invitation.id IS NOT NULL
     AND v_invitation.recipient_email_canonical = v_recipient_email_canonical THEN
    v_result := jsonb_build_object(
      'invitation_id', v_invitation.id,
      'group_id', p_group_id,
      'member_id', p_member_id,
      'status', 'pending',
      'created', false
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF v_invitation.id IS NOT NULL THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[v_invitation.id], 'cancelled'
    );
  END IF;

  SELECT coalesce(
    (SELECT NULLIF(btrim(profile.display_name), '')
     FROM public.profiles AS profile WHERE profile.id = p_actor_id),
    'Teskeiðarnotandi'
  ) INTO v_inviter_display_name;

  INSERT INTO public.expense_member_invitations (
    group_id, member_id, recipient_email_canonical, invited_by, status,
    context_title_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot
  ) VALUES (
    p_group_id, p_member_id, v_recipient_email_canonical, p_actor_id, 'pending',
    left(btrim(v_group.name), 200), btrim(v_member.display_name),
    left(v_inviter_display_name, 120)
  )
  RETURNING * INTO v_invitation;

  SELECT account.id INTO v_recipient_user_id
  FROM auth.users AS account
  WHERE public.normalize_email_canonical(account.email) = v_recipient_email_canonical
    AND public.expense_has_beta_access(account.id)
  ORDER BY account.id
  LIMIT 1;

  v_activity_id := public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_member_invitation_received',
    'expense_member_invitation', v_invitation.id,
    'expense_member_invitation_received', NULL,
    v_invitation.context_title_snapshot,
    CASE WHEN v_recipient_user_id IS NULL
      THEN ARRAY[]::uuid[] ELSE ARRAY[v_recipient_user_id] END,
    true
  );

  v_result := jsonb_build_object(
    'invitation_id', v_invitation.id,
    'group_id', p_group_id,
    'member_id', p_member_id,
    'status', 'pending',
    'created', true,
    'activity_id', v_activity_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_get_my_member_invitations(p_actor_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  context_title text,
  inviter_display_name text,
  status text,
  expires_at timestamptz,
  invited_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    invitation.id,
    invitation.context_title_snapshot,
    invitation.inviter_display_name_snapshot,
    invitation.status,
    invitation.expires_at,
    invitation.created_at
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id
   AND group_row.status IN ('active', 'settling', 'settled')
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN auth.users AS account ON account.id = p_actor_id
  WHERE public.expense_has_beta_access(p_actor_id)
    AND invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical
      = public.normalize_email_canonical(account.email)
  ORDER BY invitation.created_at DESC, invitation.id
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_reserve_member_invitation_send(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  attempt_number integer,
  can_send boolean,
  reason text,
  recipient_email text,
  email_template_version text,
  context_title text,
  inviter_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_recipient_email_canonical text;
  v_group public.expense_groups%ROWTYPE;
  v_member record;
  v_invitation record;
  v_role text;
  v_new_attempt integer;
BEGIN
  IF NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT invitation.group_id, invitation.recipient_email_canonical
  INTO v_group_id, v_recipient_email_canonical
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_recipient_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email_canonical, 9702)
    );
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id
    AND member.id = (
      SELECT invitation.member_id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.id = p_invitation_id
    )
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);

  IF v_invitation.id IS NULL OR v_role IS NULL
     OR (v_invitation.invited_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_group.status NOT IN ('active', 'settling', 'settled')
     OR v_member.id IS NULL
     OR v_member.status <> 'active'
     OR v_member.user_id IS NOT NULL
     OR v_member.id IS DISTINCT FROM v_invitation.member_id THEN
    IF v_invitation.status = 'pending' THEN
      PERFORM public.expense_terminalize_member_invitations(
        ARRAY[p_invitation_id], 'cancelled'
      );
    END IF;
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'not_pending'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'not_pending'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'expired'
    );
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'expired'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email)
        = v_invitation.recipient_email_canonical
  ) THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false,
      'recipient_unavailable'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_invitation.attempt_status = 'reserved'
     AND v_invitation.attempt_at >= now() - interval '24 hours' THEN
    RETURN QUERY SELECT
      v_invitation.attempt_number, true, 'ok'::text,
      v_invitation.recipient_email_canonical,
      v_invitation.email_template_version,
      v_invitation.context_title_snapshot,
      v_invitation.inviter_display_name_snapshot;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'reserved' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'key_expired'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'sent'
     AND v_invitation.email_sent_at > now() - interval '24 hours' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'already_sent'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'failed'
     AND v_invitation.attempt_at > now() - interval '5 minutes' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'cooldown'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_number >= 3 THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'max_sends'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9701)
  );
  IF (
    SELECT count(*) FROM public.expense_member_invitations AS invitation
    WHERE invitation.invited_by = p_actor_id
      AND invitation.attempt_at > now() - interval '24 hours'
  ) >= 10 THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'rate_limited'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  v_new_attempt := v_invitation.attempt_number + 1;
  UPDATE public.expense_member_invitations AS invitation
  SET attempt_number = v_new_attempt,
      attempt_status = 'reserved',
      attempt_at = now(),
      email_template_version = 'v1'
  WHERE invitation.id = p_invitation_id;

  RETURN QUERY SELECT
    v_new_attempt, true, 'ok'::text,
    v_invitation.recipient_email_canonical,
    'v1'::text,
    v_invitation.context_title_snapshot,
    v_invitation.inviter_display_name_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_sync_my_member_invitation_events(
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_email_canonical text;
  v_inserted integer := 0;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL THEN RETURN 0; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_email_canonical, 9702)
  );

  -- Bounded lazy cleanup gives expires_at a real retention boundary even when
  -- a sender never revisits the group. Concurrent terminal paths remain safe
  -- because the helper updates pending rows only.
  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND invitation.expires_at <= now()
      ORDER BY invitation.expires_at, invitation.id
      LIMIT 50
    ),
    'expired'
  );

  INSERT INTO public.expense_activity_audience (activity_id, user_id)
  SELECT activity.id, p_actor_id
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id
   AND group_row.status IN ('active', 'settling', 'settled')
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN public.expense_activity AS activity
    ON activity.entity_type = 'expense_member_invitation'
   AND activity.entity_id = invitation.id
   AND activity.group_id = invitation.group_id
   AND activity.event_type = 'expense_member_invitation_received'
  WHERE invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical = v_actor_email_canonical
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at, ack_at
  )
  SELECT
    p_actor_id,
    'expenses',
    activity.event_type,
    activity.entity_type,
    activity.entity_id,
    'expenses:activity:' || activity.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'groupTitle', activity.group_title,
      'actorUserId', activity.actor_user_id
    )),
    '/auth-mvp/utlagt-og-endurgreitt/bod/adili/' || invitation.id::text,
    activity.created_at,
    NULL
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id
   AND group_row.status IN ('active', 'settling', 'settled')
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN public.expense_activity AS activity
    ON activity.entity_type = 'expense_member_invitation'
   AND activity.entity_id = invitation.id
   AND activity.group_id = invitation.group_id
   AND activity.event_type = 'expense_member_invitation_received'
  JOIN public.expense_activity_audience AS audience
    ON audience.activity_id = activity.id
   AND audience.user_id = p_actor_id
  WHERE invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical = v_actor_email_canonical
  ON CONFLICT (user_id, event_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_respond_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_member_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_actor_email text;
  v_actor_email_canonical text;
  v_public_display_name text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_new_version bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_invitation_id IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'invitationId', p_invitation_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_respond_member_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_email_canonical, 9702)
  );

  SELECT invitation.group_id, invitation.member_id
  INTO v_group_id, v_member_id
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL OR v_member_id IS NULL THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id AND member.id = v_member_id
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.group_id = v_group_id
    AND invitation.member_id = v_member_id
  FOR UPDATE;

  IF v_group.id IS NULL OR v_invitation.id IS NULL
     OR v_invitation.status <> 'pending'
     OR v_actor_email_canonical IS NULL
     OR v_invitation.recipient_email_canonical IS DISTINCT FROM v_actor_email_canonical THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'expired'
    );
    v_result := jsonb_build_object(
      'invitation_id', p_invitation_id,
      'status', 'expired'
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF p_action = 'decline' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'declined'
    );

    PERFORM public.expense_record_activity(
      v_group_id, p_actor_id, 'expense_member_invitation_declined',
      'expense_member_invitation', p_invitation_id,
      'expense_member_invitation_declined', NULL,
      v_invitation.context_title_snapshot,
      CASE WHEN v_invitation.invited_by IS NULL
        THEN ARRAY[]::uuid[] ELSE ARRAY[v_invitation.invited_by] END,
      true
    );

    v_result := jsonb_build_object(
      'invitation_id', p_invitation_id,
      'status', 'declined'
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF v_group.status NOT IN ('active', 'settling', 'settled')
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.user_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.expense_group_members AS existing_member
       WHERE existing_member.group_id = v_group_id
         AND existing_member.id <> v_member_id
         AND existing_member.user_id = p_actor_id
         AND existing_member.status IN ('active', 'invited')
     ) THEN
    RAISE EXCEPTION 'expense_invitation_conflict';
  END IF;

  SELECT NULLIF(btrim(profile.display_name), '')
  INTO v_public_display_name
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id;
  v_public_display_name := coalesce(v_public_display_name, 'Teskeiðarnotandi');

  UPDATE public.expense_group_members AS member
  SET user_id = p_actor_id,
      display_name = left(v_public_display_name, 120),
      status = 'active'
  WHERE member.id = v_member_id AND member.group_id = v_group_id;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY[p_invitation_id], 'accepted'
  );

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id
  RETURNING financial_version INTO v_new_version;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_member_invitation_accepted',
    'expense_member_invitation', p_invitation_id,
    'expense_member_invitation_accepted', NULL,
    v_invitation.context_title_snapshot,
    ARRAY[p_actor_id], true
  );

  -- Persist only durable identifiers in the idempotency result. Private guest
  -- labels and canonical email addresses must not survive in request history.
  v_result := jsonb_build_object(
    'invitation_id', p_invitation_id,
    'status', 'accepted',
    'group_id', v_group_id,
    'member_id', v_member_id,
    'invited_by', v_invitation.invited_by,
    'counterpart_user_id', p_actor_id,
    'financial_version', v_new_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_cancel_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_invitation_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;

  v_fingerprint := md5(jsonb_build_object('invitationId', p_invitation_id)::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_cancel_member_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT invitation.group_id INTO v_group_id
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_invitation_not_found'; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id AND invitation.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);

  IF v_invitation.id IS NULL OR v_invitation.status <> 'pending'
     OR v_role IS NULL
     OR (v_invitation.invited_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY[p_invitation_id],
    CASE WHEN v_invitation.expires_at <= now() THEN 'expired' ELSE 'cancelled' END
  );

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_member_invitation_cancelled',
    'expense_member_invitation', p_invitation_id,
    'expense_member_invitation_cancelled', NULL,
    v_invitation.context_title_snapshot,
    ARRAY[p_actor_id], false
  );

  v_result := jsonb_build_object(
    'invitation_id', p_invitation_id,
    'status', CASE WHEN v_invitation.expires_at <= now() THEN 'expired' ELSE 'cancelled' END
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
-- Reassert the existing server-only boundary after every replacement.
REVOKE ALL ON FUNCTION public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_respond_group_invitation(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_respond_group_invitation(uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_transition_repayment(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_transition_repayment(uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_cancel_expense(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_cancel_expense(uuid,uuid,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_set_group_status(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_set_group_status(uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_get_my_member_invitations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_get_my_member_invitations(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_reserve_member_invitation_send(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_reserve_member_invitation_send(uuid,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_sync_my_member_invitation_events(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_sync_my_member_invitation_events(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_respond_member_invitation(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_respond_member_invitation(uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.expense_cancel_member_invitation(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_cancel_member_invitation(uuid,uuid,uuid)
  TO service_role;

COMMENT ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) IS 'Atomic audited expense edit with precedence-safe member fingerprints; invited controls access, not financial participation.';
COMMENT ON FUNCTION public.expense_respond_group_invitation(uuid, uuid, text, uuid)
  IS 'Consent response preserving the same durable financial member; a declined party with unsettled exposure becomes an unlinked guest.';
COMMENT ON FUNCTION public.expense_link_guest_member_email(uuid, uuid, uuid, text, uuid)
  IS 'Creates a consent-bound identity link for an active guest in active, settling, or settled groups.';

COMMIT;
