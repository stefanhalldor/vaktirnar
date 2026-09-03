-- SQL168 MIGRATION: TES-24 clean-only confirmed Expense edit-revision lifecycle.
-- Legacy repayment history is never changed or reinterpreted by this migration.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(104168);

DO $preflight$
DECLARE
  v_assert_hash text;
  v_update_hash text;
  v_wrapper_hash text;
  v_settlement_hash text;
  v_shared_reader_hash text;
  v_unexpected_repayment_dml_grant_count integer;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql168_executor_not_postgres';
  END IF;
  IF pg_catalog.to_regclass('public.expense_private_drafts') IS NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_simplified_settlement(uuid,text,boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_list_visible_shared_drafts(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'expense_sql168_predecessor_drift';
  END IF;
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    INTO v_assert_hash
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)'
  );
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    INTO v_update_hash
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  );
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    INTO v_wrapper_hash
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
  );
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    INTO v_settlement_hash
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_simplified_settlement(uuid,text,boolean)'
  );
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
    INTO v_shared_reader_hash
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_list_visible_shared_drafts(uuid)'
  );
  SELECT pg_catalog.count(*)::integer INTO v_unexpected_repayment_dml_grant_count
  FROM information_schema.role_table_grants AS grant_row
  WHERE grant_row.table_schema = 'public'
    AND grant_row.table_name = 'expense_repayments'
    AND grant_row.grantee <> 'postgres'
    AND grant_row.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER');
  IF v_assert_hash <> 'aeb9b8246978d630fb69db9365a22f34'
     OR v_update_hash <> '30ba02f3b79d2c7a9387ee504d198d12'
     OR v_wrapper_hash <> 'c3a1ab7746d50ed552c625bbc95efbab'
     OR v_settlement_hash <> 'fe9016a12b1ac987b3b00f314c800c89'
     OR v_shared_reader_hash <> '59b01785320ce254fb4ac7d6168709bc'
     OR v_unexpected_repayment_dml_grant_count <> 0 THEN
    RAISE EXCEPTION 'expense_sql168_predecessor_source_drift';
  END IF;
  -- Existing unbound edit drafts predate SQL168. They remain inert and are
  -- handled only by the owner-only legacy read/discard capability below.
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.expense_edit_revision_bindings (
  draft_id                 uuid        PRIMARY KEY
    REFERENCES public.expense_private_drafts(id) ON DELETE RESTRICT,
  expense_id               uuid        NOT NULL UNIQUE
    REFERENCES public.expenses(id) ON DELETE RESTRICT,
  group_id                 uuid        NOT NULL
    REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  actor_user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mode                     text        NOT NULL,
  base_financial_version   bigint      NOT NULL,
  base_allocation_digest   text        NOT NULL,
  opened_at                timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at               timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT expense_edit_revision_bindings_mode_check
    CHECK (mode = ANY (ARRAY['private'::text, 'shared'::text])),
  CONSTRAINT expense_edit_revision_bindings_version_check
    CHECK (base_financial_version >= 0
      AND base_financial_version <= '9007199254740991'::bigint),
  CONSTRAINT expense_edit_revision_bindings_digest_check
    CHECK (base_allocation_digest ~ '^[0-9a-f]{32}$'::text),
  CONSTRAINT expense_edit_revision_bindings_context_unique
    UNIQUE (draft_id, expense_id, group_id, actor_user_id)
);

ALTER TABLE public.expense_edit_revision_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_edit_revision_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_edit_revision_bindings OWNER TO postgres;
REVOKE ALL ON TABLE public.expense_edit_revision_bindings
  FROM PUBLIC, anon, authenticated, service_role;

DROP INDEX IF EXISTS public.expense_private_drafts_one_open_edit_per_expense_idx;

-- Keep creation-draft semantics unchanged. Edit drafts are created only by
-- expense_open_edit_revision_v1 and every subsequent generic save must prove
-- the exact durable SQL168 binding before applying the existing CAS update.
CREATE OR REPLACE FUNCTION public.expense_save_private_draft(
  p_actor_id uuid,
  p_draft_id uuid,
  p_context_type text,
  p_group_id uuid,
  p_expense_id uuid,
  p_current_step text,
  p_payload jsonb,
  p_expected_version bigint DEFAULT NULL
)
RETURNS TABLE(draft_id uuid, draft_version bigint, saved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.expense_private_drafts%ROWTYPE;
  v_existing public.expense_private_drafts%ROWTYPE;
  v_incoming_relation jsonb;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL
     OR p_current_step NOT IN ('details', 'people', 'split', 'review')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;
  IF p_context_type = 'edit' AND p_expected_version IS NULL THEN
    RAISE EXCEPTION 'expense_edit_revision_required';
  END IF;
  IF p_context_type = 'edit' THEN
    SELECT * INTO v_existing
    FROM public.expense_private_drafts AS drafts
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.context_type = 'edit'
      AND drafts.group_id = p_group_id
      AND drafts.expense_id = p_expense_id
      AND drafts.version = p_expected_version
    FOR UPDATE;
    IF v_existing.id IS NULL THEN RAISE EXCEPTION 'expense_draft_conflict'; END IF;
    SELECT binding.* INTO v_binding
    FROM public.expense_edit_revision_bindings AS binding
    WHERE binding.draft_id = p_draft_id
      AND binding.actor_user_id = p_actor_id
      AND binding.group_id = p_group_id
      AND binding.expense_id = p_expense_id
    FOR UPDATE;
    IF v_binding.draft_id IS NULL THEN
      RAISE EXCEPTION 'expense_legacy_edit_draft_unbound';
    END IF;
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, p_context_type, p_group_id, p_expense_id
  );
  IF p_context_type = 'one_off' THEN
    v_incoming_relation := public.expense_sql162_event_relation_tuple(p_payload);
  END IF;

  IF p_expected_version IS NULL THEN
    IF p_context_type = 'one_off'
       AND (v_incoming_relation->>'link_to_event')::boolean THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;
    INSERT INTO public.expense_private_drafts (
      id, actor_user_id, context_type, group_id, expense_id,
      current_step, payload, version
    ) VALUES (
      p_draft_id, p_actor_id, p_context_type, p_group_id, p_expense_id,
      p_current_step, p_payload, 1
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      SELECT * INTO v_row
      FROM public.expense_private_drafts AS drafts
      WHERE drafts.id = p_draft_id AND drafts.actor_user_id = p_actor_id;
      IF v_row.id IS NULL
         OR v_row.context_type <> p_context_type
         OR v_row.group_id IS DISTINCT FROM p_group_id
         OR v_row.expense_id IS DISTINCT FROM p_expense_id
         OR v_row.current_step <> p_current_step
         OR v_row.payload <> p_payload THEN
        RAISE EXCEPTION 'expense_draft_conflict';
      END IF;
    END IF;
  ELSE
    IF p_context_type <> 'edit' THEN
      SELECT * INTO v_existing
      FROM public.expense_private_drafts AS drafts
      WHERE drafts.id = p_draft_id
        AND drafts.actor_user_id = p_actor_id
        AND drafts.context_type = p_context_type
        AND drafts.group_id IS NOT DISTINCT FROM p_group_id
        AND drafts.expense_id IS NOT DISTINCT FROM p_expense_id
        AND drafts.version = p_expected_version
      FOR UPDATE;
      IF v_existing.id IS NULL THEN RAISE EXCEPTION 'expense_draft_conflict'; END IF;
    END IF;
    IF p_context_type = 'one_off'
       AND public.expense_sql162_event_relation_tuple(v_existing.payload)
         IS DISTINCT FROM v_incoming_relation THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;
    UPDATE public.expense_private_drafts AS drafts
    SET current_step = p_current_step,
        payload = p_payload,
        version = drafts.version + 1,
        updated_at = now()
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.version = p_expected_version
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'expense_draft_conflict'; END IF;
  END IF;
  RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
END;
$function$;

-- Generic deletion is intentionally unavailable for every edit context. Bound
-- revisions use discard/reconfirm; legacy unbound rows use the dedicated RPC.
CREATE OR REPLACE FUNCTION public.expense_delete_private_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_deleted_count bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT drafts.* INTO v_draft
  FROM public.expense_private_drafts AS drafts
  WHERE drafts.id = p_draft_id AND drafts.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RETURN false; END IF;
  IF v_draft.context_type = 'edit' THEN
    RAISE EXCEPTION 'expense_edit_revision_delete_required';
  END IF;
  DELETE FROM public.expense_private_drafts AS drafts
  WHERE drafts.id = p_draft_id AND drafts.actor_user_id = p_actor_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_legacy_edit_draft_state_v1(
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
  v_count integer;
  v_draft_id uuid;
  v_draft_version bigint;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.expense_private_drafts AS draft
  JOIN public.expenses AS expense
    ON expense.id = draft.expense_id AND expense.group_id = draft.group_id
  LEFT JOIN public.expense_edit_revision_bindings AS binding
    ON binding.draft_id = draft.id
  WHERE draft.actor_user_id = p_actor_id
    AND draft.context_type = 'edit'
    AND draft.expense_id = p_expense_id
    AND binding.draft_id IS NULL;
  IF v_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'none');
  ELSIF v_count <> 1 THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'legacy_ambiguous');
  END IF;
  SELECT draft.id, draft.version INTO v_draft_id, v_draft_version
  FROM public.expense_private_drafts AS draft
  LEFT JOIN public.expense_edit_revision_bindings AS binding
    ON binding.draft_id = draft.id
  WHERE draft.actor_user_id = p_actor_id
    AND draft.context_type = 'edit'
    AND draft.expense_id = p_expense_id
    AND binding.draft_id IS NULL;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'legacy_unbound',
    'draft_id', v_draft_id, 'draft_version', v_draft_version
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'unavailable');
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_discard_legacy_edit_draft_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'expense_draft_invalid_input'; END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  PERFORM 1 FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense WHERE expense.id = p_expense_id FOR UPDATE;
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
    AND draft.context_type = 'edit'
    AND draft.group_id = v_expense.group_id
    AND draft.expense_id = p_expense_id
    AND draft.version = p_expected_draft_version
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_legacy_edit_draft_unbound'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_edit_revision_bindings AS binding
    WHERE binding.draft_id = v_draft.id
  ) THEN
    RAISE EXCEPTION 'expense_edit_revision_delete_required';
  END IF;
  DELETE FROM public.expense_private_drafts AS draft
  WHERE draft.id = v_draft.id AND draft.actor_user_id = p_actor_id;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'legacy_discarded',
    'expense_id', p_expense_id, 'group_id', v_expense.group_id
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_edit_revision_allocation_digest_v1(
  p_expense_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'title', expense.title,
    'total_minor', expense.total_minor,
    'currency', expense.currency,
    'incurred_on', expense.incurred_on,
    'category', expense.category,
    'note', expense.note,
    'split_method', expense.split_method,
    'payments', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'member_id', payment.member_id,
        'amount_minor', payment.amount_minor
      ) ORDER BY payment.member_id)
      FROM public.expense_payments AS payment
      WHERE payment.expense_id = expense.id
    ), '[]'::jsonb),
    'shares', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'member_id', share_row.member_id,
        'amount_minor', share_row.amount_minor
      ) ORDER BY share_row.member_id)
      FROM public.expense_shares AS share_row
      WHERE share_row.expense_id = expense.id
    ), '[]'::jsonb)
  )::text)
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
$function$;

CREATE OR REPLACE FUNCTION public.expense_settlement_eligible_balances_v1(
  p_group_id uuid,
  p_include_reported boolean DEFAULT false
)
RETURNS TABLE (member_id uuid, currency text, amount_minor bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.expense_edit_revision_bindings AS binding
    LEFT JOIN public.expense_private_drafts AS draft ON draft.id = binding.draft_id
    LEFT JOIN public.expenses AS expense ON expense.id = binding.expense_id
    WHERE (
        binding.group_id = p_group_id
        OR draft.group_id = p_group_id
        OR expense.group_id = p_group_id
      )
      AND (
        draft.id IS NULL OR draft.context_type <> 'edit'
        OR draft.expense_id IS DISTINCT FROM binding.expense_id
        OR draft.group_id IS DISTINCT FROM binding.group_id
        OR draft.actor_user_id IS DISTINCT FROM binding.actor_user_id
        OR expense.id IS NULL
        OR expense.group_id IS DISTINCT FROM binding.group_id
        OR expense.status <> 'active'
      )
  ) THEN
    RAISE EXCEPTION 'expense_edit_revision_state_inconsistent';
  END IF;

  RETURN QUERY
  SELECT movement.member_id, movement.currency,
    pg_catalog.sum(movement.amount_minor)::bigint
  FROM (
    SELECT payment.member_id, expense.currency, payment.amount_minor
    FROM public.expense_payments AS payment
    JOIN public.expenses AS expense ON expense.id = payment.expense_id
    WHERE expense.group_id = p_group_id
      AND expense.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_edit_revision_bindings AS binding
        JOIN public.expense_private_drafts AS draft
          ON draft.id = binding.draft_id
         AND draft.context_type = 'edit'
         AND draft.expense_id = binding.expense_id
        WHERE binding.expense_id = expense.id
          AND binding.group_id = expense.group_id
      )
    UNION ALL
    SELECT share_row.member_id, expense.currency, -share_row.amount_minor
    FROM public.expense_shares AS share_row
    JOIN public.expenses AS expense ON expense.id = share_row.expense_id
    WHERE expense.group_id = p_group_id
      AND expense.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_edit_revision_bindings AS binding
        JOIN public.expense_private_drafts AS draft
          ON draft.id = binding.draft_id
         AND draft.context_type = 'edit'
         AND draft.expense_id = binding.expense_id
        WHERE binding.expense_id = expense.id
          AND binding.group_id = expense.group_id
      )
    UNION ALL
    SELECT repayment.from_member_id, repayment.currency, repayment.amount_minor
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id
      AND (repayment.status = 'confirmed'
        OR (p_include_reported AND repayment.status = 'reported'))
    UNION ALL
    SELECT repayment.to_member_id, repayment.currency, -repayment.amount_minor
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id
      AND (repayment.status = 'confirmed'
        OR (p_include_reported AND repayment.status = 'reported'))
  ) AS movement
  GROUP BY movement.member_id, movement.currency
  HAVING pg_catalog.sum(movement.amount_minor) <> 0;
END;
$function$;

-- SQL96's public settlement signature remains stable, but its source now uses
-- the TES-24 eligible projection. Full canonical/history balances remain on
-- expense_group_balances and are not changed.
CREATE OR REPLACE FUNCTION public.expense_simplified_settlement(
  p_group_id uuid,
  p_currency text,
  p_include_reported boolean DEFAULT true
)
RETURNS TABLE (
  from_member_id uuid,
  to_member_id uuid,
  amount_minor bigint,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_debtors uuid[];
  v_debts bigint[];
  v_creditors uuid[];
  v_credits bigint[];
  v_debtor_index integer := 1;
  v_creditor_index integer := 1;
  v_amount bigint;
  v_total bigint;
BEGIN
  IF p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'expense_currency_invalid';
  END IF;
  SELECT COALESCE(pg_catalog.sum(balance.amount_minor), 0)::bigint
  INTO v_total
  FROM public.expense_settlement_eligible_balances_v1(
    p_group_id, p_include_reported
  ) AS balance
  WHERE balance.currency = p_currency;
  IF v_total <> 0 THEN RAISE EXCEPTION 'expense_balance_total_invalid'; END IF;
  SELECT
    pg_catalog.array_agg(balance.member_id
      ORDER BY -balance.amount_minor DESC, balance.member_id),
    pg_catalog.array_agg(-balance.amount_minor
      ORDER BY -balance.amount_minor DESC, balance.member_id)
  INTO v_debtors, v_debts
  FROM public.expense_settlement_eligible_balances_v1(
    p_group_id, p_include_reported
  ) AS balance
  WHERE balance.currency = p_currency AND balance.amount_minor < 0;
  SELECT
    pg_catalog.array_agg(balance.member_id
      ORDER BY balance.amount_minor DESC, balance.member_id),
    pg_catalog.array_agg(balance.amount_minor
      ORDER BY balance.amount_minor DESC, balance.member_id)
  INTO v_creditors, v_credits
  FROM public.expense_settlement_eligible_balances_v1(
    p_group_id, p_include_reported
  ) AS balance
  WHERE balance.currency = p_currency AND balance.amount_minor > 0;
  WHILE v_debtor_index <= COALESCE(pg_catalog.array_length(v_debtors, 1), 0)
    AND v_creditor_index <= COALESCE(pg_catalog.array_length(v_creditors, 1), 0)
  LOOP
    v_amount := LEAST(v_debts[v_debtor_index], v_credits[v_creditor_index]);
    from_member_id := v_debtors[v_debtor_index];
    to_member_id := v_creditors[v_creditor_index];
    amount_minor := v_amount;
    currency := p_currency;
    RETURN NEXT;
    v_debts[v_debtor_index] := v_debts[v_debtor_index] - v_amount;
    v_credits[v_creditor_index] := v_credits[v_creditor_index] - v_amount;
    IF v_debts[v_debtor_index] = 0 THEN v_debtor_index := v_debtor_index + 1; END IF;
    IF v_credits[v_creditor_index] = 0 THEN v_creditor_index := v_creditor_index + 1; END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_can_open_edit_revision_v1(
  p_actor_id uuid,
  p_expense_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_role text;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN RETURN 'unavailable'; END IF;
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row WHERE group_row.id = v_expense.group_id;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_expense.status <> 'active'
     OR v_group.status NOT IN ('active', 'settling')
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND v_role NOT IN ('owner', 'admin')) THEN
    RETURN 'ineligible_lifecycle';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_edit_revision_bindings AS binding
    LEFT JOIN public.expense_private_drafts AS draft ON draft.id = binding.draft_id
    WHERE binding.expense_id = p_expense_id
      AND (
        draft.id IS NULL OR draft.context_type <> 'edit'
        OR draft.expense_id IS DISTINCT FROM binding.expense_id
        OR draft.group_id IS DISTINCT FROM binding.group_id
        OR draft.actor_user_id IS DISTINCT FROM binding.actor_user_id
        OR binding.group_id IS DISTINCT FROM v_expense.group_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.expense_private_drafts AS draft
    LEFT JOIN public.expense_edit_revision_bindings AS binding
      ON binding.draft_id = draft.id
    WHERE draft.context_type = 'edit'
      AND draft.expense_id = p_expense_id
      AND draft.actor_user_id = p_actor_id
      AND binding.draft_id IS NULL
  ) THEN
    RETURN 'unavailable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
     AND draft.context_type = 'edit'
     AND draft.expense_id = binding.expense_id
     AND draft.group_id = binding.group_id
     AND draft.actor_user_id = binding.actor_user_id
    WHERE binding.expense_id = p_expense_id
      AND binding.group_id = v_expense.group_id
  ) THEN
    RETURN 'open';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = v_expense.group_id
      AND repayment.currency = v_expense.currency
      AND repayment.status IN ('reported', 'confirmed')
  ) THEN
    RETURN 'ineligible_history';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_settlement_batches AS batch_row
    WHERE batch_row.currency = v_expense.currency
      AND batch_row.status = 'proposed'
      AND (
        EXISTS (
          SELECT 1
          FROM public.expense_settlement_batch_items AS item
          LEFT JOIN public.expense_repayments AS repayment
            ON repayment.id = item.repayment_id
           AND repayment.group_id = item.group_id
          WHERE item.batch_id = batch_row.id
            AND item.group_id = v_expense.group_id
            AND (repayment.id IS NULL OR repayment.status <> 'reported')
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.expense_settlement_batch_items AS item
            WHERE item.batch_id = batch_row.id
          )
          AND EXISTS (
            SELECT 1 FROM public.expense_group_members AS member
            WHERE member.group_id = v_expense.group_id
              AND member.status = 'active'
              AND member.user_id = batch_row.proposed_by_user_id
          )
          AND EXISTS (
            SELECT 1 FROM public.expense_group_members AS member
            WHERE member.group_id = v_expense.group_id
              AND member.status = 'active'
              AND member.user_id = batch_row.counterparty_user_id
          )
        )
      )
  ) THEN
    RETURN 'unavailable';
  END IF;
  IF public.expense_edit_revision_allocation_digest_v1(p_expense_id) IS NULL THEN
    RETURN 'unavailable';
  END IF;
  RETURN 'eligible';
EXCEPTION WHEN OTHERS THEN
  RETURN 'unavailable';
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_eligible_settlement_context_v1(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_rows jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id;
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling')
     OR public.expense_active_member_role(p_actor_id, p_group_id) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'transfers', '[]'::jsonb
    );
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'from_member_id', settlement.from_member_id,
    'to_member_id', settlement.to_member_id,
    'amount_minor', settlement.amount_minor,
    'currency', settlement.currency
  ) ORDER BY settlement.currency, settlement.from_member_id,
    settlement.to_member_id), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT settlement.*
    FROM (
      SELECT DISTINCT expense.currency
      FROM public.expenses AS expense
      WHERE expense.group_id = p_group_id AND expense.status = 'active'
      UNION
      SELECT DISTINCT repayment.currency
      FROM public.expense_repayments AS repayment
      WHERE repayment.group_id = p_group_id
        AND repayment.status IN ('reported', 'confirmed')
    ) AS currencies
    CROSS JOIN LATERAL public.expense_simplified_settlement(
      p_group_id, currencies.currency, true
    ) AS settlement
  ) AS settlement;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'ready',
    'financial_version', v_group.financial_version,
    'requires_review', public.expense_reported_repayments_need_review(p_group_id),
    'transfers', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'transfers', '[]'::jsonb
  );
END;
$function$;

DROP TRIGGER IF EXISTS expense_tes24_repayment_write_guard
  ON public.expense_repayments;

-- Lifecycle changes may not orphan an open revision. These guards are narrow:
-- they do not mutate or reinterpret any historical financial rows.
CREATE OR REPLACE FUNCTION public.expense_guard_edit_revision_expense_lifecycle_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.expense_edit_revision_bindings AS binding
       WHERE binding.expense_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'expense_edit_revision_lifecycle_conflict';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_guard_edit_revision_group_lifecycle_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('active', 'settling')
     AND EXISTS (
       SELECT 1 FROM public.expense_edit_revision_bindings AS binding
       WHERE binding.group_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'expense_edit_revision_lifecycle_conflict';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_guard_edit_revision_member_authority_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND EXISTS (
       SELECT 1 FROM public.expense_edit_revision_bindings AS binding
       WHERE binding.group_id = OLD.group_id
         AND binding.actor_user_id IN (OLD.user_id, NEW.user_id)
     ) THEN
    RAISE EXCEPTION 'expense_edit_revision_authority_conflict';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_guard_repayment_confirmation_eligibility_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'reported' AND NEW.status = 'confirmed'
     AND public.expense_reported_repayments_need_review(OLD.group_id) THEN
    RAISE EXCEPTION 'expense_repayment_review_required';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS expense_tes24_edit_expense_lifecycle_guard
  ON public.expenses;
CREATE TRIGGER expense_tes24_edit_expense_lifecycle_guard
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_edit_revision_expense_lifecycle_v1();

DROP TRIGGER IF EXISTS expense_tes24_edit_group_lifecycle_guard
  ON public.expense_groups;
CREATE TRIGGER expense_tes24_edit_group_lifecycle_guard
BEFORE UPDATE OF status ON public.expense_groups
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_edit_revision_group_lifecycle_v1();

DROP TRIGGER IF EXISTS expense_tes24_edit_member_authority_guard
  ON public.expense_group_members;
CREATE TRIGGER expense_tes24_edit_member_authority_guard
BEFORE UPDATE OF status, role, user_id ON public.expense_group_members
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_edit_revision_member_authority_v1();

DROP TRIGGER IF EXISTS expense_tes24_repayment_confirmation_guard
  ON public.expense_repayments;
CREATE TRIGGER expense_tes24_repayment_confirmation_guard
BEFORE UPDATE OF status ON public.expense_repayments
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_repayment_confirmation_eligibility_v1();

-- SQL102's one_off/group rules are preserved. The explicit edit branch now
-- retains exact manage authority and active/settling lifecycle status.
CREATE OR REPLACE FUNCTION public.expense_assert_private_draft_context(
  p_actor_id uuid,
  p_context_type text,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_expense_created_by uuid;
  v_expense_status text;
  v_group_status text;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_context_type = 'one_off' THEN
    IF p_group_id IS NOT NULL OR p_expense_id IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_invalid_context';
    END IF;
    RETURN;
  END IF;
  IF p_context_type = 'group' THEN
    IF p_group_id IS NULL OR p_expense_id IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_invalid_context';
    END IF;
    SELECT public.expense_active_member_role(p_actor_id, p_group_id), groups.status
      INTO v_role, v_group_status
    FROM public.expense_groups AS groups WHERE groups.id = p_group_id;
    IF v_role IS NULL OR v_group_status <> 'active' THEN
      RAISE EXCEPTION 'expense_not_allowed';
    END IF;
    RETURN;
  END IF;
  IF p_context_type <> 'edit' OR p_group_id IS NULL OR p_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_draft_invalid_context';
  END IF;
  SELECT expense.created_by, expense.status, group_row.status,
         public.expense_active_member_role(p_actor_id, group_row.id)
    INTO v_expense_created_by, v_expense_status, v_group_status, v_role
  FROM public.expenses AS expense
  JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
  WHERE expense.id = p_expense_id AND expense.group_id = p_group_id;
  IF v_role IS NULL
     OR v_expense_status <> 'active'
     OR v_group_status NOT IN ('active', 'settling')
     OR (v_expense_created_by IS DISTINCT FROM p_actor_id
       AND v_role NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'expense_not_allowed';
  END IF;
END;
$function$;

-- Preserve SQL159 creation-draft semantics. Edit publications have their own
-- reader below and are filtered before SQL159 snapshot validation runs.
CREATE OR REPLACE FUNCTION public.expense_list_visible_shared_drafts(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate record;
  v_normalized jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_has_unshared_changes boolean;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  FOR v_candidate IN
    SELECT publication.*, draft.version AS current_draft_version
    FROM public.expense_unconfirmed_publications AS publication
    JOIN public.expense_private_drafts AS draft
      ON draft.id = publication.draft_id
     AND draft.actor_user_id = publication.actor_user_id
    WHERE publication.is_live
      AND draft.context_type <> 'edit'
      AND public.expense_sql159_audience_allows(
        p_actor_id, publication.draft_id
      )
    ORDER BY publication.updated_at DESC, publication.publication_id DESC
    LIMIT 101
    FOR SHARE OF publication
  LOOP
    v_count := v_count + 1;
    IF v_count > 100 THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
      );
    END IF;
    IF NOT public.expense_sql159_snapshot_is_valid(v_candidate.draft_id) THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
      );
    END IF;
    v_has_unshared_changes := NULL;
    IF v_candidate.actor_user_id = p_actor_id THEN
      IF v_candidate.current_draft_version = v_candidate.source_draft_version THEN
        v_has_unshared_changes := false;
      ELSE
        BEGIN
          v_normalized := public.expense_sql159_normalize_private_draft(
            p_actor_id, v_candidate.draft_id, false
          );
          v_has_unshared_changes := v_normalized->>'shareable_fingerprint'
            IS DISTINCT FROM v_candidate.shareable_fingerprint;
        EXCEPTION WHEN OTHERS THEN
          v_has_unshared_changes := true;
        END;
      END IF;
    END IF;
    v_rows := v_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'lifecycle_state', 'shared_draft',
        'publication_id', v_candidate.publication_id,
        'publication_version', v_candidate.publication_version,
        'title', v_candidate.title,
        'total_minor', v_candidate.total_minor,
        'currency', v_candidate.currency,
        'incurred_on', pg_catalog.to_char(v_candidate.incurred_on, 'YYYY-MM-DD'),
        'allocation_state', v_candidate.allocation_state,
        'viewer_role', CASE WHEN v_candidate.actor_user_id = p_actor_id
          THEN 'author' ELSE 'participant' END,
        'has_unshared_changes', v_has_unshared_changes,
        'detail_target', CASE WHEN v_candidate.actor_user_id = p_actor_id
          THEN pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_candidate.draft_id
          ) ELSE pg_catalog.jsonb_build_object(
            'kind', 'shared_draft',
            'publication_id', v_candidate.publication_id
          ) END
      )
    );
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_edit_revision_publication_lifecycle_v1(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id;
  SELECT binding.* INTO v_binding
  FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.actor_user_id = p_actor_id;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.context_type <> 'edit'
     OR v_draft.expense_id IS DISTINCT FROM v_binding.expense_id THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'draft_id', v_draft.id,
    'draft_version', v_draft.version,
    'sharing_state', CASE
      WHEN v_publication.draft_id IS NULL THEN 'never_shared'
      WHEN v_publication.is_live THEN 'shared'
      ELSE 'withdrawn'
    END,
    'expected_publication_version', v_publication.publication_version,
    'has_unshared_changes', CASE WHEN v_publication.is_live
      THEN v_publication.source_draft_version IS DISTINCT FROM v_draft.version
      ELSE false END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_share_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_next_version bigint;
  v_publication_id uuid;
  v_result jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_title text;
  v_total_minor bigint;
  v_currency text;
  v_incurred_on date;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'draftId', p_draft_id, 'draftVersion', p_expected_draft_version,
    'publicationVersion', p_expected_publication_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_share_edit_revision_v1', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id FOR UPDATE;
  SELECT binding.* INTO v_binding FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.actor_user_id = p_actor_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.context_type <> 'edit'
     OR v_draft.version <> p_expected_draft_version
     OR v_draft.expense_id IS DISTINCT FROM v_binding.expense_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_draft_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, 'edit', v_binding.group_id, v_binding.expense_id
  );
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = v_binding.expense_id FOR UPDATE;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'members') <> 'array'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'included') <> 'object'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'payerKeys') <> 'array'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'total') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'currency') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'incurredOn') <> 'string' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  v_title := pg_catalog.btrim(v_draft.payload->>'title');
  v_currency := v_draft.payload->>'currency';
  v_total_minor := public.expense_sql159_amount_minor(
    v_draft.payload->>'total', v_currency, false
  );
  v_incurred_on := (v_draft.payload->>'incurredOn')::date;
  IF pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 200
     OR v_currency NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')
     OR v_total_minor NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id FOR UPDATE;
  IF v_publication.draft_id IS NULL THEN
    IF p_expected_publication_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := 1;
    v_publication_id := public.teskeid_event_uuid_from_text(
      'expense-sql168-edit-publication-v1:' || p_draft_id::text
    );
  ELSE
    IF p_expected_publication_version IS NULL
       OR v_publication.publication_version <> p_expected_publication_version
       OR v_publication.publication_version = 9007199254740991 THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := v_publication.publication_version + 1;
    v_publication_id := v_publication.publication_id;
  END IF;
  DELETE FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id;
  DELETE FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id;
  INSERT INTO public.expense_unconfirmed_publications (
    draft_id, publication_id, actor_user_id, publication_version, is_live,
    source_draft_version, shareable_fingerprint, authority_fingerprint,
    context_type, group_id, event_id, event_roster_revision, link_to_event,
    visibility, title, total_minor, currency, incurred_on, allocation_state,
    published_at, updated_at, withdrawn_at
  ) VALUES (
    p_draft_id, v_publication_id, p_actor_id, v_next_version, true,
    v_draft.version, pg_catalog.md5(v_draft.payload::text),
    pg_catalog.md5(v_binding.group_id::text || ':' || p_actor_id::text),
    'group', v_binding.group_id, NULL, NULL, false,
    'participants_only', v_title, v_total_minor,
    v_currency, v_incurred_on, 'incomplete',
    pg_catalog.now(), pg_catalog.now(), NULL
  ) ON CONFLICT (draft_id) DO UPDATE SET
    publication_version = EXCLUDED.publication_version,
    is_live = true,
    source_draft_version = EXCLUDED.source_draft_version,
    shareable_fingerprint = EXCLUDED.shareable_fingerprint,
    authority_fingerprint = EXCLUDED.authority_fingerprint,
    context_type = EXCLUDED.context_type,
    group_id = EXCLUDED.group_id,
    event_id = NULL,
    event_roster_revision = NULL,
    link_to_event = false,
    visibility = 'participants_only',
    title = EXCLUDED.title,
    total_minor = EXCLUDED.total_minor,
    currency = EXCLUDED.currency,
    incurred_on = EXCLUDED.incurred_on,
    allocation_state = 'incomplete',
    published_at = EXCLUDED.published_at,
    updated_at = EXCLUDED.updated_at,
    withdrawn_at = NULL;
  INSERT INTO public.expense_unconfirmed_publication_parties (
    draft_id, allocation_state, ordinal, party_key_hash,
    identity_token_hash, display_name, is_author, is_payer,
    is_participant, paid_minor, share_minor
  )
  SELECT p_draft_id, 'incomplete', row_number() OVER (ORDER BY member.id)::smallint,
         pg_catalog.md5(member.id::text), pg_catalog.md5(member.id::text),
         pg_catalog.btrim(member.display_name), member.user_id = p_actor_id,
         v_draft.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text),
         COALESCE((v_draft.payload->'included'->>member.id::text)::boolean, false)
           OR member.user_id = p_actor_id,
         NULL, NULL
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_binding.group_id
    AND member.status = 'active'
    AND pg_catalog.strpos(member.display_name, '@') = 0
    AND (
      member.user_id = p_actor_id
      OR v_draft.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text)
      OR COALESCE((v_draft.payload->'included'->>member.id::text)::boolean, false)
    );
  INSERT INTO public.expense_unconfirmed_publication_audience (
    draft_id, user_id, audience_kind, identity_token_hash,
    binding_id, binding_generation
  ) VALUES (p_draft_id, p_actor_id, 'author', NULL, NULL, NULL);
  INSERT INTO public.expense_unconfirmed_publication_audience (
    draft_id, user_id, audience_kind, identity_token_hash,
    binding_id, binding_generation
  )
  SELECT p_draft_id, member.user_id, 'group', pg_catalog.md5(member.id::text),
         member.id, NULL
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_binding.group_id
    AND member.status = 'active'
    AND member.user_id IS NOT NULL
    AND member.user_id <> p_actor_id
    AND EXISTS (
      SELECT 1 FROM public.expense_unconfirmed_publication_parties AS party
      WHERE party.draft_id = p_draft_id
        AND party.identity_token_hash = pg_catalog.md5(member.id::text)
    );
  UPDATE public.expense_edit_revision_bindings AS binding
  SET mode = 'shared', updated_at = pg_catalog.now()
  WHERE binding.draft_id = p_draft_id;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'shared_draft',
    'draft_id', p_draft_id, 'draft_version', v_draft.version,
    'publication_id', v_publication_id,
    'publication_version', v_next_version,
    'allocation_state', 'incomplete',
    'shareable_fingerprint', pg_catalog.md5(v_draft.payload::text)
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_unshare_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_unshare_edit_revision_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_array(
      p_draft_id, p_expected_draft_version, p_expected_publication_version
    )::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id FOR UPDATE;
  SELECT binding.* INTO v_binding FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.actor_user_id = p_actor_id FOR UPDATE;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.context_type <> 'edit'
     OR v_draft.version <> p_expected_draft_version
     OR NOT v_publication.is_live
     OR v_publication.publication_version <> p_expected_publication_version THEN
    RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, 'edit', v_binding.group_id, v_binding.expense_id
  );
  DELETE FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id;
  DELETE FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id;
  UPDATE public.expense_unconfirmed_publications AS publication
  SET publication_version = publication.publication_version + 1,
      is_live = false, source_draft_version = NULL,
      shareable_fingerprint = NULL, authority_fingerprint = NULL,
      context_type = NULL, group_id = NULL, event_id = NULL,
      event_roster_revision = NULL, link_to_event = NULL,
      visibility = NULL, title = NULL, total_minor = NULL, currency = NULL,
      incurred_on = NULL, allocation_state = NULL,
      updated_at = pg_catalog.now(), withdrawn_at = pg_catalog.now()
  WHERE publication.draft_id = p_draft_id;
  UPDATE public.expense_edit_revision_bindings AS binding
  SET mode = 'private', updated_at = pg_catalog.now()
  WHERE binding.draft_id = p_draft_id;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'private_draft',
    'draft_id', p_draft_id, 'draft_version', v_draft.version,
    'publication_id', v_publication.publication_id,
    'publication_version', v_publication.publication_version + 1
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_open_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_mode text,
  p_draft_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_group_id uuid;
  v_open_decision text;
  v_new_financial_version bigint;
  v_digest text;
  v_result jsonb;
  v_share jsonb;
  v_replay jsonb;
BEGIN
  IF p_mode NOT IN ('private', 'shared') OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'expense_edit_revision_invalid_input';
  END IF;
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_open_edit_revision_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_array(p_expense_id, p_mode, p_draft_id)::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  -- The group row is the canonical TES-24 serialization boundary. Every
  -- eligibility-changing transition locks it before the Expense/draft rows.
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id FOR UPDATE;
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  v_open_decision := public.expense_can_open_edit_revision_v1(
    p_actor_id, p_expense_id
  );
  IF v_open_decision = 'open' THEN
    RAISE EXCEPTION 'expense_edit_revision_open';
  ELSIF v_open_decision = 'ineligible_history' THEN
    RAISE EXCEPTION 'expense_edit_revision_history';
  ELSIF v_open_decision <> 'eligible' THEN
    RAISE EXCEPTION 'expense_edit_revision_not_allowed';
  END IF;
  v_digest := public.expense_edit_revision_allocation_digest_v1(p_expense_id);
  IF v_digest IS NULL THEN RAISE EXCEPTION 'expense_edit_revision_base_unavailable'; END IF;
  INSERT INTO public.expense_private_drafts (
    id, actor_user_id, context_type, group_id, expense_id,
    current_step, payload, version
  ) VALUES (
    p_draft_id, p_actor_id, 'edit', v_group.id, v_expense.id,
    'split', p_payload, 1
  );
  INSERT INTO public.expense_edit_revision_bindings (
    draft_id, expense_id, group_id, actor_user_id, mode,
    base_financial_version, base_allocation_digest
  ) VALUES (
    p_draft_id, v_expense.id, v_group.id, p_actor_id, p_mode,
    v_group.financial_version, v_digest
  );
  IF p_mode = 'shared' THEN
    v_share := public.expense_share_edit_revision_v1(
      p_actor_id,
      public.expense_identity_request_id('expense-open-edit-share-v1', p_request_id),
      p_draft_id, 1, NULL
    );
  END IF;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1,
      updated_at = pg_catalog.now()
  WHERE group_row.id = v_group.id
    AND group_row.financial_version = v_group.financial_version
    AND group_row.financial_version < 9007199254740991
  RETURNING group_row.financial_version INTO v_new_financial_version;
  IF v_new_financial_version IS NULL THEN
    RAISE EXCEPTION 'expense_edit_revision_conflict';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'edit_revision_open',
    'expense_id', v_expense.id, 'group_id', v_group.id,
    'draft_id', p_draft_id, 'draft_version', 1,
    'financial_version', v_new_financial_version,
    'publication_version', CASE WHEN v_share IS NULL THEN NULL
      ELSE (v_share->>'publication_version')::bigint END
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_edit_revision_state_v1(
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
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_role text;
  v_open_decision text;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT binding.* INTO v_binding
  FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.expense_id = p_expense_id;
  IF v_binding.draft_id IS NULL THEN
    v_open_decision := public.expense_can_open_edit_revision_v1(
      p_actor_id, p_expense_id
    );
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1,
      'status', 'none',
      'can_open', v_open_decision = 'eligible',
      'open_reason', CASE v_open_decision
        WHEN 'eligible' THEN 'clean'
        WHEN 'ineligible_history' THEN 'history'
        WHEN 'ineligible_lifecycle' THEN 'lifecycle'
        ELSE 'unavailable'
      END
    );
  END IF;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL
     OR v_expense.group_id IS DISTINCT FROM v_binding.group_id THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'unavailable');
  END IF;
  v_role := public.expense_active_member_role(p_actor_id, v_binding.group_id);
  IF v_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'unavailable');
  END IF;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = v_binding.draft_id;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = v_binding.draft_id;
  IF v_draft.id IS NULL
     OR v_draft.context_type <> 'edit'
     OR v_draft.expense_id IS DISTINCT FROM v_binding.expense_id
     OR v_draft.group_id IS DISTINCT FROM v_binding.group_id
     OR v_draft.actor_user_id IS DISTINCT FROM v_binding.actor_user_id
     OR (v_binding.mode = 'shared' AND (
       v_publication.draft_id IS NULL
       OR v_publication.is_live IS DISTINCT FROM true
       OR v_publication.actor_user_id IS DISTINCT FROM v_binding.actor_user_id
       OR v_publication.context_type IS DISTINCT FROM 'group'
       OR v_publication.group_id IS DISTINCT FROM v_binding.group_id
     ))
     OR (v_binding.mode = 'private'
       AND v_publication.is_live IS NOT DISTINCT FROM true) THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'unavailable');
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'open', 'mode', v_binding.mode,
    'owned_by_actor', v_binding.actor_user_id = p_actor_id,
    'draft_id', CASE WHEN v_binding.actor_user_id = p_actor_id THEN v_draft.id ELSE NULL END,
    'draft_version', CASE WHEN v_binding.actor_user_id = p_actor_id THEN v_draft.version ELSE NULL END,
    'publication_version', CASE WHEN v_binding.actor_user_id = p_actor_id
      THEN v_publication.publication_version ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'unavailable');
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_list_visible_edit_revisions_v1(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'expense_id', binding.expense_id
  ) ORDER BY binding.expense_id), '[]'::jsonb) INTO v_rows
  FROM public.expense_edit_revision_bindings AS binding
  JOIN public.expense_private_drafts AS draft ON draft.id = binding.draft_id
  WHERE draft.context_type = 'edit'
    AND (
      binding.actor_user_id = p_actor_id
      OR (binding.mode = 'shared' AND EXISTS (
        SELECT 1
        FROM public.expense_unconfirmed_publication_audience AS audience
        JOIN public.expense_group_members AS member
          ON member.id = audience.binding_id
         AND member.group_id = binding.group_id
         AND member.user_id = p_actor_id
         AND member.status = 'active'
        WHERE audience.draft_id = binding.draft_id
          AND audience.user_id = p_actor_id
          AND audience.audience_kind = 'group'
      ))
    );
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN pg_catalog.jsonb_array_length(v_rows) = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_shared_edit_revision_v1(
  p_actor_id uuid,
  p_publication_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_viewer_role text;
  v_parties jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.publication_id = p_publication_id AND publication.is_live;
  SELECT binding.* INTO v_binding
  FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = v_publication.draft_id AND binding.mode = 'shared';
  IF v_binding.draft_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
  END IF;
  IF v_binding.actor_user_id = p_actor_id THEN
    v_viewer_role := 'author';
  ELSIF EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_publication_audience AS audience
    JOIN public.expense_group_members AS member
      ON member.id = audience.binding_id
     AND member.group_id = v_binding.group_id
     AND member.user_id = p_actor_id
     AND member.status = 'active'
    WHERE audience.draft_id = v_binding.draft_id
      AND audience.user_id = p_actor_id
      AND audience.audience_kind = 'group'
  ) THEN
    v_viewer_role := 'participant';
  ELSE
    RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'display_name', party.display_name,
    'is_author', party.is_author,
    'is_payer', party.is_payer,
    'is_participant', party.is_participant,
    'proposed_paid_minor', party.paid_minor,
    'proposed_share_minor', party.share_minor
  ) ORDER BY party.ordinal), '[]'::jsonb) INTO v_parties
  FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = v_binding.draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'ready',
    'draft', pg_catalog.jsonb_build_object(
      'lifecycle_state', 'shared_draft',
      'publication_id', v_publication.publication_id,
      'publication_version', v_publication.publication_version,
      'title', v_publication.title,
      'total_minor', v_publication.total_minor,
      'currency', v_publication.currency,
      'incurred_on', v_publication.incurred_on,
      'allocation_state', v_publication.allocation_state,
      'viewer_role', v_viewer_role,
      'parties', v_parties
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object('contract_version', 1, 'status', 'not_found');
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_discard_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_group_id uuid;
  v_new_financial_version bigint;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_discard_edit_revision_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_array(
      p_expense_id, p_draft_id, p_expected_draft_version,
      p_expected_publication_version
    )::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT binding.group_id INTO v_group_id
  FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id
    AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_edit_revision_conflict'; END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id FOR UPDATE;
  PERFORM 1 FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group_id FOR UPDATE;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id FOR UPDATE;
  SELECT binding.* INTO v_binding FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id FOR UPDATE;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.version <> p_expected_draft_version
     OR ((v_publication.draft_id IS NULL) <> (p_expected_publication_version IS NULL))
     OR (v_publication.draft_id IS NOT NULL
       AND v_publication.publication_version <> p_expected_publication_version) THEN
    RAISE EXCEPTION 'expense_edit_revision_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, 'edit', v_binding.group_id, v_binding.expense_id
  );
  DELETE FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id
    AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_edit_revision_conflict'; END IF;
  DELETE FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1,
      updated_at = pg_catalog.now()
  WHERE group_row.id = v_group.id
    AND group_row.financial_version = v_group.financial_version
    AND group_row.financial_version < 9007199254740991
  RETURNING group_row.financial_version INTO v_new_financial_version;
  IF v_new_financial_version IS NULL THEN
    RAISE EXCEPTION 'expense_edit_revision_conflict';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'discarded',
    'expense_id', p_expense_id, 'group_id', v_binding.group_id,
    'financial_version', v_new_financial_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_reconfirm_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint,
  p_expected_financial_version bigint,
  p_proposal jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_current_digest text;
  v_proposal_digest text;
  v_result jsonb;
  v_update jsonb;
  v_replay jsonb;
  v_shares jsonb;
  v_group_id uuid;
  v_new_financial_version bigint;
BEGIN
  IF p_proposal IS NULL OR pg_catalog.jsonb_typeof(p_proposal) <> 'object'
     OR p_proposal - ARRAY[
       'title','total_minor','currency','incurred_on','category','note',
       'split_method','preserve_shares','new_guest_members',
       'new_participant_invitations','removed_member_ids','payments','shares'
     ]::text[] <> '{}'::jsonb
     OR NOT (p_proposal ?& ARRAY[
       'title','total_minor','currency','incurred_on','split_method',
       'preserve_shares','new_guest_members','new_participant_invitations',
       'removed_member_ids','payments','shares'
     ]::text[]) THEN
    RAISE EXCEPTION 'expense_edit_revision_invalid_input';
  END IF;
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_reconfirm_edit_revision_v1',
    pg_catalog.md5(pg_catalog.jsonb_build_array(
      p_expense_id, p_draft_id, p_expected_draft_version,
      p_expected_publication_version, p_expected_financial_version,
      pg_catalog.md5(p_proposal::text)
    )::text)
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT binding.group_id INTO v_group_id
  FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id
    AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_edit_revision_conflict'; END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group_id FOR UPDATE;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id FOR UPDATE;
  SELECT binding.* INTO v_binding FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id FOR UPDATE;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id FOR UPDATE;
  PERFORM 1 FROM public.expense_payments AS payment
    WHERE payment.expense_id = p_expense_id ORDER BY payment.member_id FOR UPDATE;
  PERFORM 1 FROM public.expense_shares AS share_row
    WHERE share_row.expense_id = p_expense_id ORDER BY share_row.member_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.version <> p_expected_draft_version
     OR v_expense.status <> 'active'
     OR v_group.financial_version <> p_expected_financial_version
     OR ((v_publication.draft_id IS NULL) <> (p_expected_publication_version IS NULL))
     OR (v_publication.draft_id IS NOT NULL
       AND v_publication.publication_version <> p_expected_publication_version)
     OR (v_publication.is_live
       AND v_publication.source_draft_version <> v_draft.version) THEN
    RAISE EXCEPTION 'expense_edit_revision_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, 'edit', v_binding.group_id, v_binding.expense_id
  );
  v_current_digest := public.expense_edit_revision_allocation_digest_v1(p_expense_id);
  IF v_current_digest IS DISTINCT FROM v_binding.base_allocation_digest THEN
    RAISE EXCEPTION 'expense_edit_revision_base_conflict';
  END IF;
  v_shares := CASE WHEN (p_proposal->>'preserve_shares')::boolean THEN (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'member_id', share_row.member_id, 'amount_minor', share_row.amount_minor
    ) ORDER BY share_row.member_id), '[]'::jsonb)
    FROM public.expense_shares AS share_row WHERE share_row.expense_id = p_expense_id
  ) ELSE p_proposal->'shares' END;
  v_proposal_digest := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'title', p_proposal->>'title',
    'total_minor', (p_proposal->>'total_minor')::bigint,
    'currency', p_proposal->>'currency',
    'incurred_on', (p_proposal->>'incurred_on')::date,
    'category', p_proposal->>'category',
    'note', p_proposal->>'note',
    'split_method', p_proposal->>'split_method',
    'payments', (SELECT COALESCE(pg_catalog.jsonb_agg(item.value ORDER BY item.value->>'member_id'), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(p_proposal->'payments') AS item(value)),
    'shares', (SELECT COALESCE(pg_catalog.jsonb_agg(item.value ORDER BY item.value->>'member_id'), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(v_shares) AS item(value))
  )::text);
  -- Removing the draft lowers the settlement lock only inside this transaction.
  -- Any later error rolls the delete and the canonical mutation back together.
  DELETE FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id
    AND binding.expense_id = p_expense_id
    AND binding.actor_user_id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_edit_revision_conflict'; END IF;
  DELETE FROM public.expense_private_drafts AS draft WHERE draft.id = p_draft_id;
  IF v_proposal_digest = v_current_digest
     AND p_proposal->'new_guest_members' = '[]'::jsonb
     AND p_proposal->'new_participant_invitations' = '[]'::jsonb
     AND p_proposal->'removed_member_ids' = '[]'::jsonb THEN
    UPDATE public.expense_groups AS group_row
    SET financial_version = group_row.financial_version + 1,
        updated_at = pg_catalog.now()
    WHERE group_row.id = v_group.id
      AND group_row.financial_version = v_group.financial_version
      AND group_row.financial_version < 9007199254740991
    RETURNING group_row.financial_version INTO v_new_financial_version;
    IF v_new_financial_version IS NULL THEN
      RAISE EXCEPTION 'expense_edit_revision_conflict';
    END IF;
    v_result := pg_catalog.jsonb_build_object(
      'contract_version', 1, 'state', 'unchanged_reconfirmed',
      'expense_id', p_expense_id, 'group_id', v_group.id,
      'financial_version', v_new_financial_version,
      'invitation_ids', '[]'::jsonb
    );
  ELSE
    v_update := public.expense_update_expense_with_participants(
      p_actor_id,
      public.expense_identity_request_id('expense-reconfirm-edit-v1', p_request_id),
      p_expense_id, p_expected_financial_version,
      p_proposal->>'title', (p_proposal->>'total_minor')::bigint,
      p_proposal->>'currency', (p_proposal->>'incurred_on')::date,
      p_proposal->>'category', p_proposal->>'note',
      p_proposal->>'split_method', (p_proposal->>'preserve_shares')::boolean,
      p_proposal->'new_guest_members', p_proposal->'new_participant_invitations',
      ARRAY(SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(
        p_proposal->'removed_member_ids'
      ) AS removed(value)),
      p_proposal->'payments', p_proposal->'shares'
    );
    v_result := v_update || pg_catalog.jsonb_build_object(
      'contract_version', 1, 'state', 'reconfirmed'
    );
  END IF;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_edit_revision_allocation_digest_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_settlement_eligible_balances_v1(uuid,boolean) OWNER TO postgres;
ALTER FUNCTION public.expense_simplified_settlement(uuid,text,boolean) OWNER TO postgres;
ALTER FUNCTION public.expense_can_open_edit_revision_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_guard_edit_revision_expense_lifecycle_v1() OWNER TO postgres;
ALTER FUNCTION public.expense_guard_edit_revision_group_lifecycle_v1() OWNER TO postgres;
ALTER FUNCTION public.expense_guard_edit_revision_member_authority_v1() OWNER TO postgres;
ALTER FUNCTION public.expense_guard_repayment_confirmation_eligibility_v1() OWNER TO postgres;
ALTER FUNCTION public.expense_assert_private_draft_context(uuid,text,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_list_visible_shared_drafts(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_delete_private_draft(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.expense_get_legacy_edit_draft_state_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_list_visible_edit_revisions_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_get_shared_edit_revision_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_edit_revision_allocation_digest_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_settlement_eligible_balances_v1(uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_simplified_settlement(uuid,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_can_open_edit_revision_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_edit_revision_expense_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_edit_revision_group_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_edit_revision_member_authority_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_repayment_confirmation_eligibility_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_assert_private_draft_context(uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_list_visible_shared_drafts(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_delete_private_draft(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_list_visible_edit_revisions_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_shared_edit_revision_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_visible_shared_drafts(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_delete_private_draft(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_visible_edit_revisions_v1(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_shared_edit_revision_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)
  TO service_role;

DO $writer_manifest$
DECLARE
  v_writer_manifest_exact boolean;
BEGIN
  WITH expected_direct_draft_writer(signature, source_hash) AS (
    VALUES
      ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', '4c55e9caaabb3a287dfa06ed55ab1fe7'),
      ('public.expense_delete_private_draft(uuid,uuid)', '767759a756a52c8b90a57af6de1b9a6f'),
      ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'),
      ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'a1bba12665e8651121bac578d7e936d4'),
      ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', '732375dc60f72f95f8232677b2ae0f89'),
      ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', '2a7bbc7fda11f3393a55171e56bf3614'),
      ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', 'd8cd26c2d1b07475de60846222e6734a'),
      ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', 'b25d37dd096e08a402161c1301c23fc8')
  ), actual_direct_draft_writer AS (
    SELECT pg_catalog.format(
      '%I.%I(%s)', namespace_row.nspname, routine.proname,
      pg_catalog.replace(pg_catalog.oidvectortypes(routine.proargtypes), ' ', '')
    ) AS signature,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
    routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND routine.prosecdef
      AND pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS acl
        WHERE acl.grantor <> pg_catalog.to_regrole('postgres')::oid
           OR acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
           OR acl.grantee NOT IN (
             pg_catalog.to_regrole('postgres')::oid,
             pg_catalog.to_regrole('service_role')::oid
           )
      ) AS metadata_acl_exact
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = routine.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND routine.prosrc ~* '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public[.]expense_private_drafts'
  )
  SELECT NOT EXISTS (
      SELECT actual.signature FROM actual_direct_draft_writer AS actual
      EXCEPT ALL
      SELECT expected.signature FROM expected_direct_draft_writer AS expected
    ) AND NOT EXISTS (
      SELECT expected.signature FROM expected_direct_draft_writer AS expected
      EXCEPT ALL
      SELECT actual.signature FROM actual_direct_draft_writer AS actual
    ) AND COALESCE((
      SELECT pg_catalog.bool_and(
        actual.metadata_acl_exact AND actual.source_hash = expected.source_hash
      )
      FROM actual_direct_draft_writer AS actual
      JOIN expected_direct_draft_writer AS expected USING (signature)
    ), false)
  INTO v_writer_manifest_exact;
  IF NOT v_writer_manifest_exact THEN
    RAISE EXCEPTION 'STOP_WRITER_DRIFT';
  END IF;
END;
$writer_manifest$;

DO $postcondition$
DECLARE
  v_function_count integer;
  v_bad_function_count integer;
  v_bad_acl_count integer;
  v_trigger_count integer;
  v_unexpected_repayment_dml_grant_count integer;
  v_binding_relation_exact boolean;
  v_constraint_definitions_exact boolean;
  v_trigger_update_columns_exact boolean;
  v_target_metadata_acl_dependencies_exact boolean;
  v_public_schema_acl_exact boolean;
  v_binding_relation_security_exact boolean;
  v_replaced_global_index_absent boolean;
BEGIN
  WITH expected(signature, source_hash, service_execute) AS (
    VALUES
      ('public.expense_edit_revision_allocation_digest_v1(uuid)', '5d9768dccdd9a7a34d853541772aefdf', false),
      ('public.expense_settlement_eligible_balances_v1(uuid,boolean)', 'b58245a47cc0c8e306a8769afa508687', false),
      ('public.expense_simplified_settlement(uuid,text,boolean)', '3481fb2e9253cf72ef162688c7942945', false),
      ('public.expense_can_open_edit_revision_v1(uuid,uuid)', '35244913794fd372184e6ad1fc0b7d02', false),
      ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', '0c6e7aa35c5ba4627b635511e94d5e8a', true),
      ('public.expense_guard_edit_revision_expense_lifecycle_v1()', '9027aed7ed47617145af8c3bbced1fc4', false),
      ('public.expense_guard_edit_revision_group_lifecycle_v1()', '534fe5f74b82ce934f9a2868e247ceff', false),
      ('public.expense_guard_edit_revision_member_authority_v1()', '2d375364b1cc9e056923dbff3803c1b1', false),
      ('public.expense_guard_repayment_confirmation_eligibility_v1()', 'ce37d2e99e222f0356125c9ca26ed72f', false),
      ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'e85b65c38a577ab33f1072173ac8353b', false),
      ('public.expense_list_visible_shared_drafts(uuid)', 'dbaaca458c70ee18aa36c35864e9ade8', true),
      ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', '4c55e9caaabb3a287dfa06ed55ab1fe7', true),
      ('public.expense_delete_private_draft(uuid,uuid)', '767759a756a52c8b90a57af6de1b9a6f', true),
      ('public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)', '0bf01ffb0b90cf8078da4b8dcd65629c', true),
      ('public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)', '3314017996b86c4cda29ef1c3b36a1f2', true),
      ('public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)', '1ef4e7a8fc1e412918406b7b8fc31917', true),
      ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', '732375dc60f72f95f8232677b2ae0f89', true),
      ('public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)', '4c67a8fb156d01ba72d2559e68d1416f', true),
      ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', 'b25d37dd096e08a402161c1301c23fc8', true),
      ('public.expense_get_edit_revision_state_v1(uuid,uuid)', 'f26cc24ab01e5b923cc986ca8b19d9c4', true),
      ('public.expense_list_visible_edit_revisions_v1(uuid)', '8a0ddb900e607429bec043c920755b80', true),
      ('public.expense_get_shared_edit_revision_v1(uuid,uuid)', '82349ff16af2b4885581ac90f454d3a3', true),
      ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', '2a7bbc7fda11f3393a55171e56bf3614', true),
      ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', 'd8cd26c2d1b07475de60846222e6734a', true)
  ), contract AS (
    SELECT expected.*, routine.oid, owner_role.rolname AS owner_name,
      routine.prokind, routine.prosecdef, routine.proconfig,
      routine.provolatile, routine.proisstrict, routine.proleakproof,
      routine.proparallel, routine.pronargdefaults,
      language_row.lanname AS language_name,
      pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash_actual,
      pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE') AS service_actual,
      pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE') AS anon_execute,
      pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE') AS authenticated_execute
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    LEFT JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = routine.prolang
  )
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE oid IS NULL OR owner_name <> 'postgres'
      OR prokind <> 'f' OR NOT prosecdef
      OR proconfig <> CASE WHEN signature IN (
        'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
        'public.expense_delete_private_draft(uuid,uuid)'
      ) THEN ARRAY['search_path=pg_catalog, public']::text[]
      ELSE ARRAY['search_path=""']::text[] END
      OR proisstrict OR proleakproof OR proparallel <> 'u'
      OR pronargdefaults <> CASE
        WHEN signature IN (
          'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
          'public.expense_settlement_eligible_balances_v1(uuid,boolean)',
          'public.expense_simplified_settlement(uuid,text,boolean)'
        ) THEN 1 ELSE 0 END
      OR language_name <> CASE
        WHEN signature = 'public.expense_edit_revision_allocation_digest_v1(uuid)'
          THEN 'sql' ELSE 'plpgsql' END
      OR provolatile <> CASE
        WHEN signature IN (
          'public.expense_edit_revision_allocation_digest_v1(uuid)',
          'public.expense_settlement_eligible_balances_v1(uuid,boolean)',
          'public.expense_simplified_settlement(uuid,text,boolean)',
          'public.expense_can_open_edit_revision_v1(uuid,uuid)',
          'public.expense_get_eligible_settlement_context_v1(uuid,uuid)',
          'public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)',
          'public.expense_get_edit_revision_state_v1(uuid,uuid)',
          'public.expense_list_visible_edit_revisions_v1(uuid)',
          'public.expense_get_shared_edit_revision_v1(uuid,uuid)'
          ,'public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)'
        ) THEN 's'::"char" ELSE 'v'::"char" END
      OR source_hash_actual <> source_hash OR service_actual <> service_execute
      OR anon_execute OR authenticated_execute
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = oid
          AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
          AND dependency.refobjid = pg_catalog.to_regnamespace('public')
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = oid AND dependency.deptype = 'e'
      ))::integer
  INTO v_function_count, v_bad_function_count
  FROM contract;

  WITH expected(signature, service_execute) AS (
    VALUES
      ('public.expense_edit_revision_allocation_digest_v1(uuid)', false),
      ('public.expense_settlement_eligible_balances_v1(uuid,boolean)', false),
      ('public.expense_simplified_settlement(uuid,text,boolean)', false),
      ('public.expense_can_open_edit_revision_v1(uuid,uuid)', false),
      ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', true),
      ('public.expense_guard_edit_revision_expense_lifecycle_v1()', false),
      ('public.expense_guard_edit_revision_group_lifecycle_v1()', false),
      ('public.expense_guard_edit_revision_member_authority_v1()', false),
      ('public.expense_guard_repayment_confirmation_eligibility_v1()', false),
      ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', false),
      ('public.expense_list_visible_shared_drafts(uuid)', true),
      ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', true),
      ('public.expense_delete_private_draft(uuid,uuid)', true),
      ('public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)', true),
      ('public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)', true),
      ('public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)', true),
      ('public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', true),
      ('public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)', true),
      ('public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', true),
      ('public.expense_get_edit_revision_state_v1(uuid,uuid)', true),
      ('public.expense_list_visible_edit_revisions_v1(uuid)', true),
      ('public.expense_get_shared_edit_revision_v1(uuid,uuid)', true),
      ('public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', true),
      ('public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', true)
  )
  SELECT pg_catalog.count(*)::integer INTO v_bad_acl_count
  FROM expected
  JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS acl
  WHERE acl.grantor <> pg_catalog.to_regrole('postgres')::oid
     OR acl.privilege_type <> 'EXECUTE' OR acl.is_grantable
     OR (
       acl.grantee <> pg_catalog.to_regrole('postgres')::oid
       AND (
         NOT expected.service_execute
         OR acl.grantee <> pg_catalog.to_regrole('service_role')::oid
       )
     );

  SELECT pg_catalog.count(*)::integer INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE NOT trigger_row.tgisinternal AND trigger_row.tgenabled = 'O'
    AND (trigger_row.tgrelid, trigger_row.tgfoid, trigger_row.tgname) IN (
      (pg_catalog.to_regclass('public.expenses'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_expense_lifecycle_v1()'), 'expense_tes24_edit_expense_lifecycle_guard'),
      (pg_catalog.to_regclass('public.expense_groups'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_group_lifecycle_v1()'), 'expense_tes24_edit_group_lifecycle_guard'),
      (pg_catalog.to_regclass('public.expense_group_members'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_member_authority_v1()'), 'expense_tes24_edit_member_authority_guard'),
      (pg_catalog.to_regclass('public.expense_repayments'), pg_catalog.to_regprocedure('public.expense_guard_repayment_confirmation_eligibility_v1()'), 'expense_tes24_repayment_confirmation_guard')
    );

  SELECT pg_catalog.count(*)::integer INTO v_unexpected_repayment_dml_grant_count
  FROM information_schema.role_table_grants AS grant_row
  WHERE grant_row.table_schema = 'public'
    AND grant_row.table_name = 'expense_repayments'
    AND grant_row.grantee <> 'postgres'
    AND grant_row.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER');

  SELECT pg_catalog.count(*) = 9 AND pg_catalog.bool_and(
    CASE attribute.attname
      WHEN 'draft_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'expense_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'group_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'actor_user_id' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'mode' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'base_financial_version' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'bigint'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'base_allocation_digest' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        AND attribute.attnotnull AND default_row.adbin IS NULL
      WHEN 'opened_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
        AND attribute.attnotnull
        AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = 'now()'
      WHEN 'updated_at' THEN pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
        AND attribute.attnotnull
        AND pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = 'now()'
      ELSE false
    END
  ) INTO v_binding_relation_exact
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute.attrelid
   AND default_row.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
    AND attribute.attnum > 0 AND NOT attribute.attisdropped;

  SELECT pg_catalog.count(*) = 10
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'p'
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]) = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'u') = 2
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'f') = 4
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.contype = 'c') = 3
    AND pg_catalog.bool_and(constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred)
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_pkey'
      AND constraint_row.contype = 'p'
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]) = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_expense_id_key'
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (expense_id)') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_context_unique'
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'UNIQUE (draft_id, expense_id, group_id, actor_user_id)') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_mode_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK ((mode = ANY (ARRAY[''private''::text, ''shared''::text])))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_version_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK (((base_financial_version >= 0) AND (base_financial_version <= ''9007199254740991''::bigint)))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_digest_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'CHECK ((base_allocation_digest ~ ''^[0-9a-f]{32}$''::text))') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_draft_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = pg_catalog.to_regclass('public.expense_private_drafts')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'draft_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_expense_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = pg_catalog.to_regclass('public.expenses')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'expense_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_group_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = pg_catalog.to_regclass('public.expense_groups')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'group_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
    AND pg_catalog.count(*) FILTER (WHERE constraint_row.conname = 'expense_edit_revision_bindings_actor_user_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = pg_catalog.to_regclass('auth.users')
      AND constraint_row.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.conrelid AND attname = 'actor_user_id')]::smallint[]
      AND constraint_row.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid = constraint_row.confrelid AND attname = 'id')]::smallint[]
      AND constraint_row.confupdtype = 'a' AND constraint_row.confmatchtype = 's'
      AND constraint_row.confdeltype = 'r') = 1
  INTO v_constraint_definitions_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.expense_edit_revision_bindings');

  WITH expected(trigger_name, relation_oid, function_oid, update_columns) AS (
    VALUES
      ('expense_tes24_edit_expense_lifecycle_guard', pg_catalog.to_regclass('public.expenses'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_expense_lifecycle_v1()'), ARRAY[]::name[]),
      ('expense_tes24_edit_group_lifecycle_guard', pg_catalog.to_regclass('public.expense_groups'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_group_lifecycle_v1()'), ARRAY['status']::name[]),
      ('expense_tes24_edit_member_authority_guard', pg_catalog.to_regclass('public.expense_group_members'), pg_catalog.to_regprocedure('public.expense_guard_edit_revision_member_authority_v1()'), ARRAY['role','status','user_id']::name[]),
      ('expense_tes24_repayment_confirmation_guard', pg_catalog.to_regclass('public.expense_repayments'), pg_catalog.to_regprocedure('public.expense_guard_repayment_confirmation_eligibility_v1()'), ARRAY['status']::name[])
  )
  SELECT pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
    trigger_row.oid IS NOT NULL AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
    AND NOT trigger_row.tgdeferrable AND NOT trigger_row.tginitdeferred
    AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
    AND pg_catalog.octet_length(trigger_row.tgargs) = 0
    AND trigger_row.tgrelid = expected.relation_oid
    AND trigger_row.tgfoid = expected.function_oid
    AND COALESCE((SELECT pg_catalog.array_agg(attribute.attname ORDER BY attribute.attname)
      FROM pg_catalog.unnest(trigger_row.tgattr::smallint[]) AS trigger_attribute(attnum)
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = trigger_row.tgrelid
       AND attribute.attnum = trigger_attribute.attnum
    ), ARRAY[]::name[]) = expected.update_columns
  ) INTO v_trigger_update_columns_exact
  FROM expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name;

  SELECT pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('service_role', 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege('anon', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
  INTO v_public_schema_acl_exact;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS class_row
    WHERE class_row.oid = pg_catalog.to_regclass('public.expense_edit_revision_bindings')
      AND class_row.relkind = 'r'
      AND class_row.relowner = pg_catalog.to_regrole('postgres')::oid
      AND class_row.relrowsecurity AND class_row.relforcerowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = class_row.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          class_row.relacl,
          pg_catalog.acldefault('r', class_row.relowner)
        )) AS acl
        WHERE acl.grantee <> class_row.relowner
          OR acl.grantor <> class_row.relowner
          OR acl.is_grantable
      )
  ) INTO v_binding_relation_security_exact;

  SELECT pg_catalog.to_regclass(
    'public.expense_private_drafts_one_open_edit_per_expense_idx'
  ) IS NULL
  INTO v_replaced_global_index_absent;

  v_target_metadata_acl_dependencies_exact :=
    v_function_count = 24 AND v_bad_function_count = 0 AND v_bad_acl_count = 0;

  IF NOT v_target_metadata_acl_dependencies_exact
     OR v_trigger_count <> 4 OR v_unexpected_repayment_dml_grant_count <> 0
     OR NOT v_binding_relation_exact OR NOT v_constraint_definitions_exact
     OR NOT v_trigger_update_columns_exact OR NOT v_public_schema_acl_exact
     OR NOT v_binding_relation_security_exact
     OR NOT v_replaced_global_index_absent THEN
    RAISE EXCEPTION 'expense_sql168_postcondition_failed'
      USING DETAIL = pg_catalog.jsonb_build_object(
        'contract_version', 1,
        'function_count', v_function_count,
        'bad_function_count', v_bad_function_count,
        'bad_acl_count', v_bad_acl_count,
        'trigger_count', v_trigger_count,
        'unexpected_repayment_dml_grant_count',
          v_unexpected_repayment_dml_grant_count,
        'binding_relation_exact', v_binding_relation_exact,
        'constraint_definitions_exact', v_constraint_definitions_exact,
        'trigger_update_columns_exact', v_trigger_update_columns_exact,
        'target_metadata_acl_dependencies_exact',
          v_target_metadata_acl_dependencies_exact,
        'public_schema_acl_exact', v_public_schema_acl_exact,
        'binding_relation_security_exact', v_binding_relation_security_exact,
        'replaced_global_index_absent', v_replaced_global_index_absent
      )::text;
  END IF;
END;
$postcondition$;

COMMIT;
