-- SQL177 MIGRATION: make an open edit binding the confirmed-to-draft presentation and financial boundary.
--
-- Installation changes functions and triggers only. It never opens a draft,
-- changes an Expense/application row, or mutates repayment/settlement history.
BEGIN;

DO $sql177_preflight$
DECLARE
  v_executor_ok boolean;
  v_prerequisites_exact boolean;
  v_noncreator_bindings_absent boolean;
  v_installation_allowed boolean;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);
WITH expected_predecessors(signature, source_hash) AS (VALUES
  ('public.expense_can_open_edit_revision_v1(uuid,uuid)', '35244913794fd372184e6ad1fc0b7d02'),
  ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', '0c6e7aa35c5ba4627b635511e94d5e8a'),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'e85b65c38a577ab33f1072173ac8353b'),
  ('public.expense_get_edit_revision_state_v1(uuid,uuid)', 'f26cc24ab01e5b923cc986ca8b19d9c4'),
  ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', '578aecf4b838c85b9d70ad4748ea4f6e'),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', '4332f4ccfd5e58f2e17ebe9389c13311'),
  ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', '65270072a4d257dcdb650cf1715b324f'),
  ('public.teskeid_event_get_expense_activity_v3(uuid,uuid)', 'ff9ce0a060d5e7c713907881da621f70')
), expected_targets(signature, source_hash, volatility, service_execute) AS (VALUES
  ('public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)', '167b94bba5a026ace42be0170932e2cd', 's'::"char", false),
  ('public.expense_can_open_edit_revision_v1(uuid,uuid)', '6af21a74dc87da961818814734d5596d', 's'::"char", false),
  ('public.expense_get_eligible_settlement_context_v1(uuid,uuid)', 'ceb16d2aaf29fc2e9bd057aeba69e376', 's'::"char", true),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', '58e08589a18db2a20ff406d22b98ba91', 'v'::"char", false),
  ('public.expense_get_edit_revision_state_v1(uuid,uuid)', '4033c7f15a7e0dcf9eef6f827d002e02', 's'::"char", true),
  ('public.expense_guard_edit_revision_financial_mutation_v1()', '247667a7aa6450800ab1f6f0ac612d0a', 'v'::"char", false),
  ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', 'e29788e5ab52bd15ac05427065168886', 'v'::"char", true),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', '832083d8dde3c68e56115991f2d29b8e', 'v'::"char", true),
  ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', 'f890668e54cad0eec483a06f87ad635c', 'v'::"char", true),
  ('public.teskeid_event_get_expense_activity_v3(uuid,uuid)', '54eea919f2990d0d69dbbc03884e6b69', 'v'::"char", true)
), prerequisite_state AS MATERIALIZED (
  SELECT
    pg_catalog.to_regclass('public.expense_edit_revision_bindings') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_private_drafts') IS NOT NULL
      AND pg_catalog.to_regclass('public.expenses') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_groups') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_repayments') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NOT NULL
      AS prerequisites_exact,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_edit_revision_bindings AS binding
      JOIN public.expenses AS expense
        ON expense.id = binding.expense_id
       AND expense.group_id = binding.group_id
      WHERE binding.actor_user_id IS DISTINCT FROM expense.created_by
    ) AS noncreator_bindings_absent
), predecessor_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.source_hash
  ) IS TRUE), false)
  AND pg_catalog.to_regprocedure(
    'public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)'
  ) IS NULL
  AND pg_catalog.to_regprocedure(
    'public.expense_guard_edit_revision_financial_mutation_v1()'
  ) IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'expense_sql177_repayment_edit_lock',
      'expense_sql177_settlement_item_edit_lock'
    )
      AND NOT trigger_row.tgisinternal
  ) AS predecessor_sources_exact
  FROM expected_predecessors AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
), target_function_state AS MATERIALIZED (
  SELECT COALESCE(pg_catalog.bool_and((
    routine.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.source_hash
    AND routine.prokind = 'f'
    AND routine.provolatile = expected.volatility
    AND NOT routine.proisstrict
    AND routine.prosecdef
    AND routine.proconfig = ARRAY['search_path=""']::text[]
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND language_row.lanname = 'plpgsql'
    AND (
      SELECT pg_catalog.array_agg(
        pg_catalog.pg_get_userbyid(acl.grantee)::text ORDER BY
          pg_catalog.pg_get_userbyid(acl.grantee)::text
      ) FILTER (WHERE acl.privilege_type = 'EXECUTE')
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
    ) = CASE WHEN expected.service_execute
      THEN ARRAY['postgres','service_role']::text[]
      ELSE ARRAY['postgres']::text[] END
  ) IS TRUE), false) AS target_functions_exact
  FROM expected_targets AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), target_trigger_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and(
      trigger_row.oid IS NOT NULL
      AND trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
      -- Exact row/before/event bitmask: 1 + 2 + 4 + 8 + 16.
      AND trigger_row.tgtype = 31
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.expense_guard_edit_revision_financial_mutation_v1()'
      )
      AND trigger_row.tgnargs = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgattr = ''::pg_catalog.int2vector
      AND trigger_row.tgconstraint = 0
      AND NOT trigger_row.tgdeferrable
      AND NOT trigger_row.tginitdeferred
    ), false) AS target_triggers_exact
  FROM (VALUES
    ('expense_sql177_repayment_edit_lock', 'public.expense_repayments'),
    ('expense_sql177_settlement_item_edit_lock', 'public.expense_settlement_batch_items')
  ) AS expected(trigger_name, relation_name)
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
), classified AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    prerequisite_state.prerequisites_exact,
    prerequisite_state.noncreator_bindings_absent,
    predecessor_state.predecessor_sources_exact,
    target_function_state.target_functions_exact
      AND target_trigger_state.target_triggers_exact AS targets_exact
  FROM prerequisite_state
  CROSS JOIN predecessor_state
  CROSS JOIN target_function_state
  CROSS JOIN target_trigger_state
)
SELECT executor_ok, prerequisites_exact, noncreator_bindings_absent,
  predecessor_sources_exact OR targets_exact
INTO v_executor_ok, v_prerequisites_exact, v_noncreator_bindings_absent,
  v_installation_allowed
FROM classified;
  IF v_executor_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql177_executor_mismatch';
  END IF;
  IF v_prerequisites_exact IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql177_prerequisite_missing';
  END IF;
  IF v_noncreator_bindings_absent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql177_noncreator_binding_drift';
  END IF;
  IF v_installation_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql177_source_or_trigger_drift';
  END IF;
END;
$sql177_preflight$;

-- SQL177 INSTALL BODY START


CREATE OR REPLACE FUNCTION public.expense_sql177_edit_draft_summary(
  p_actor_id uuid,
  p_draft_id uuid,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_total_minor bigint;
  v_title text;
  v_currency text;
  v_incurred_on date;
BEGIN
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  JOIN public.expense_edit_revision_bindings AS binding
    ON binding.draft_id = draft.id
   AND binding.expense_id = draft.expense_id
   AND binding.group_id = draft.group_id
   AND binding.actor_user_id = draft.actor_user_id
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id
    AND draft.context_type = 'edit'
    AND draft.group_id = p_group_id
    AND draft.expense_id = p_expense_id;
  IF v_draft.id IS NULL
     OR pg_catalog.jsonb_typeof(v_draft.payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'total') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'currency') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'incurredOn') <> 'string' THEN
    RAISE EXCEPTION 'expense_edit_revision_projection_unavailable';
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
    RAISE EXCEPTION 'expense_edit_revision_projection_unavailable';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'title', v_title,
    'total_minor', v_total_minor,
    'currency', v_currency,
    'incurred_on', pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD')
  );
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
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN RETURN 'unavailable'; END IF;
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row WHERE group_row.id = v_expense.group_id;
  IF v_expense.status <> 'active'
     OR v_group.status <> 'active'
     OR v_expense.created_by IS DISTINCT FROM p_actor_id
     OR public.expense_active_member_role(p_actor_id, v_group.id) IS NULL THEN
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
            AND repayment.id IS NOT NULL
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
    RETURN 'ineligible_settlement';
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
     OR public.expense_active_member_role(p_actor_id, p_group_id) IS NULL
     OR EXISTS (
       SELECT 1
       FROM public.expense_edit_revision_bindings AS binding
       WHERE binding.group_id = p_group_id
     ) THEN
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
     OR v_group_status <> 'active'
     OR v_expense_created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_not_allowed';
  END IF;
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
        WHEN 'ineligible_settlement' THEN 'settlement'
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

CREATE OR REPLACE FUNCTION public.expense_guard_edit_revision_financial_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
BEGIN
  v_group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END;
  IF EXISTS (
    SELECT 1
    FROM public.expense_edit_revision_bindings AS binding
    WHERE binding.group_id = v_group_id
  ) THEN
    RAISE EXCEPTION 'expense_edit_revision_financial_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS expense_sql177_repayment_edit_lock
  ON public.expense_repayments;
CREATE TRIGGER expense_sql177_repayment_edit_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.expense_repayments
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_edit_revision_financial_mutation_v1();

DROP TRIGGER IF EXISTS expense_sql177_settlement_item_edit_lock
  ON public.expense_settlement_batch_items;
CREATE TRIGGER expense_sql177_settlement_item_edit_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.expense_settlement_batch_items
FOR EACH ROW EXECUTE FUNCTION
  public.expense_guard_edit_revision_financial_mutation_v1();

CREATE OR REPLACE FUNCTION public.expense_list_group_creation_drafts_v1(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate record;
  v_shared record;
  v_private public.expense_private_drafts%ROWTYPE;
  v_shared_edit jsonb;
  v_summary jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF p_actor_id IS NULL OR p_group_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'none', 'rows', '[]'::jsonb
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF NOT EXISTS (
    SELECT 1
    FROM public.expense_groups AS group_row
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = group_row.id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE group_row.id = p_group_id
      AND group_row.status = 'active'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'none', 'rows', '[]'::jsonb
    );
  END IF;

  FOR v_candidate IN
    SELECT candidate.*
    FROM (
      SELECT 'shared_creation'::text AS row_kind,
        publication.draft_id, publication.publication_id,
        NULL::uuid AS expense_id, publication.updated_at
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.is_live
        AND publication.context_type = 'group'
        AND publication.group_id = p_group_id
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_edit_revision_bindings AS binding
          WHERE binding.draft_id = publication.draft_id
        )
        AND public.expense_sql159_audience_allows(
          p_actor_id, publication.draft_id
        )
      UNION ALL
      SELECT 'private_creation'::text,
        draft.id, NULL::uuid, NULL::uuid, draft.updated_at
      FROM public.expense_private_drafts AS draft
      WHERE draft.actor_user_id = p_actor_id
        AND draft.context_type = 'group'
        AND draft.group_id = p_group_id
        AND draft.expense_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS publication
          WHERE publication.draft_id = draft.id
            AND publication.is_live
        )
      UNION ALL
      SELECT 'shared_edit'::text,
        binding.draft_id, publication.publication_id,
        binding.expense_id, binding.updated_at
      FROM public.expense_edit_revision_bindings AS binding
      JOIN public.expense_private_drafts AS draft
        ON draft.id = binding.draft_id
       AND draft.context_type = 'edit'
       AND draft.expense_id = binding.expense_id
       AND draft.group_id = binding.group_id
       AND draft.actor_user_id = binding.actor_user_id
      JOIN public.expense_unconfirmed_publications AS publication
        ON publication.draft_id = binding.draft_id
       AND publication.is_live
      WHERE binding.group_id = p_group_id
        AND binding.mode = 'shared'
        AND public.expense_sql159_audience_allows(
          p_actor_id, binding.draft_id
        )
      UNION ALL
      SELECT 'private_edit'::text,
        binding.draft_id, NULL::uuid,
        binding.expense_id, binding.updated_at
      FROM public.expense_edit_revision_bindings AS binding
      JOIN public.expense_private_drafts AS draft
        ON draft.id = binding.draft_id
       AND draft.context_type = 'edit'
       AND draft.expense_id = binding.expense_id
       AND draft.group_id = binding.group_id
       AND draft.actor_user_id = binding.actor_user_id
      WHERE binding.group_id = p_group_id
        AND binding.mode = 'private'
        AND binding.actor_user_id = p_actor_id
    ) AS candidate
    ORDER BY candidate.updated_at DESC,
      candidate.publication_id DESC NULLS LAST,
      candidate.draft_id DESC
    LIMIT 101
  LOOP
    v_count := v_count + 1;
    IF v_count > 100 THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1,
        'status', 'unavailable',
        'rows', '[]'::jsonb
      );
    END IF;
    IF v_candidate.row_kind = 'shared_creation' THEN
      v_shared := NULL;
      SELECT publication.*,
        draft.version AS current_draft_version
      INTO v_shared
      FROM public.expense_unconfirmed_publications AS publication
      JOIN public.expense_private_drafts AS draft
        ON draft.id = publication.draft_id
       AND draft.actor_user_id = publication.actor_user_id
      WHERE publication.draft_id = v_candidate.draft_id
        AND publication.publication_id = v_candidate.publication_id
        AND publication.is_live
        AND publication.context_type = 'group'
        AND publication.group_id = p_group_id
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_edit_revision_bindings AS binding
          WHERE binding.draft_id = publication.draft_id
        )
        AND public.expense_sql159_audience_allows(
          p_actor_id, publication.draft_id
        )
      FOR SHARE OF publication, draft;
      IF v_shared.draft_id IS NULL
         OR NOT public.expense_sql159_snapshot_is_valid(
           v_shared.draft_id
         ) THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'shared_draft',
          'publication_id', v_shared.publication_id,
          'publication_version', v_shared.publication_version,
          'title', v_shared.title,
          'total_minor', v_shared.total_minor,
          'currency', v_shared.currency,
          'incurred_on', pg_catalog.to_char(
            v_shared.incurred_on, 'YYYY-MM-DD'
          ),
          'allocation_state', v_shared.allocation_state,
          'viewer_role', CASE WHEN v_shared.actor_user_id = p_actor_id
            THEN 'author' ELSE 'participant' END,
          'detail_target', CASE WHEN v_shared.actor_user_id = p_actor_id
            THEN pg_catalog.jsonb_build_object(
              'kind', 'private_draft', 'draft_id', v_shared.draft_id
            ) ELSE pg_catalog.jsonb_build_object(
              'kind', 'shared_draft',
              'publication_id', v_shared.publication_id
            ) END
        )
      );
    ELSIF v_candidate.row_kind = 'private_creation' THEN
      v_private := NULL;
      SELECT draft.* INTO v_private
      FROM public.expense_private_drafts AS draft
      WHERE draft.id = v_candidate.draft_id
        AND draft.actor_user_id = p_actor_id
        AND draft.context_type = 'group'
        AND draft.group_id = p_group_id
        AND draft.expense_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS publication
          WHERE publication.draft_id = draft.id
            AND publication.is_live
        )
      FOR SHARE OF draft;
      IF v_private.id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_summary := public.expense_sql175_private_group_summary(
        p_actor_id, v_private.id, p_group_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'private_draft',
          'draft_id', v_private.id,
          'draft_version', v_private.version,
          'title', v_summary->'title',
          'total_minor', v_summary->'total_minor',
          'currency', v_summary->'currency',
          'incurred_on', v_summary->'incurred_on',
          'allocation_state', 'incomplete',
          'viewer_role', 'author',
          'detail_target', pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_private.id
          )
        )
      );
    ELSIF v_candidate.row_kind = 'shared_edit' THEN
      v_shared_edit := public.expense_get_shared_edit_revision_v1(
        p_actor_id, v_candidate.publication_id
      );
      IF v_shared_edit->>'status' IS DISTINCT FROM 'ready' THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        (v_shared_edit->'draft') - 'parties'
        || pg_catalog.jsonb_build_object(
          'detail_target', CASE
            WHEN v_shared_edit->'draft'->>'viewer_role' = 'author'
            THEN pg_catalog.jsonb_build_object(
              'kind', 'edit_draft',
              'expense_id', v_candidate.expense_id,
              'draft_id', v_candidate.draft_id
            )
            ELSE pg_catalog.jsonb_build_object(
              'kind', 'shared_draft',
              'publication_id', v_candidate.publication_id
            )
          END
        )
      );
    ELSE
      v_private := NULL;
      SELECT draft.* INTO v_private
      FROM public.expense_private_drafts AS draft
      JOIN public.expense_edit_revision_bindings AS binding
        ON binding.draft_id = draft.id
       AND binding.expense_id = draft.expense_id
       AND binding.group_id = draft.group_id
       AND binding.actor_user_id = draft.actor_user_id
       AND binding.mode = 'private'
      WHERE draft.id = v_candidate.draft_id
        AND draft.actor_user_id = p_actor_id
        AND draft.context_type = 'edit'
        AND draft.group_id = p_group_id
        AND draft.expense_id = v_candidate.expense_id
      FOR SHARE OF draft, binding;
      IF v_private.id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1,
          'status', 'unavailable',
          'rows', '[]'::jsonb
        );
      END IF;
      v_summary := public.expense_sql177_edit_draft_summary(
        p_actor_id, v_private.id, p_group_id, v_candidate.expense_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'private_draft',
          'draft_id', v_private.id,
          'draft_version', v_private.version,
          'title', v_summary->'title',
          'total_minor', v_summary->'total_minor',
          'currency', v_summary->'currency',
          'incurred_on', v_summary->'incurred_on',
          'allocation_state', 'incomplete',
          'viewer_role', 'author',
          'detail_target', pg_catalog.jsonb_build_object(
            'kind', 'edit_draft',
            'expense_id', v_candidate.expense_id,
            'draft_id', v_private.id
          )
        )
      );
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'unavailable',
    'rows', '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_pre_active_v1(
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
  v_candidate record;
  v_locked_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_normalized jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_can_detail boolean;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  -- Read-only scope intentionally does not auto-claim an invitation.
  v_scope := public.expense_sql159_event_scope_read_only(
    p_actor_id, p_event_id
  );
  IF pg_catalog.jsonb_typeof(v_scope) <> 'object'
     OR v_scope - ARRAY[
       'viewer_role', 'event_guest_id', 'identity_generation'
     ]::text[] <> '{}'::jsonb
     OR NOT (v_scope ?& ARRAY[
       'viewer_role', 'event_guest_id', 'identity_generation'
     ]::text[])
     OR NOT (
       (
         v_scope->>'viewer_role' = 'owner'
         AND pg_catalog.jsonb_typeof(v_scope->'event_guest_id') = 'null'
         AND pg_catalog.jsonb_typeof(v_scope->'identity_generation') = 'null'
         AND EXISTS (
           SELECT 1 FROM public.teskeid_events AS event_row
           WHERE event_row.id = p_event_id
             AND event_row.owner_user_id = p_actor_id
         )
       ) OR (
         v_scope->>'viewer_role' = 'attendee'
         AND pg_catalog.jsonb_typeof(v_scope->'event_guest_id') = 'string'
         AND pg_catalog.jsonb_typeof(v_scope->'identity_generation') = 'string'
         AND EXISTS (
           SELECT 1
           FROM public.teskeid_event_participations AS participation
           JOIN public.teskeid_event_guests AS guest
             ON guest.event_id = participation.event_id
            AND guest.id = participation.event_guest_id
            AND guest.status = 'active'
           JOIN public.teskeid_event_participation_rsvp_v3 AS decision
             ON decision.event_id = participation.event_id
            AND decision.event_guest_id = participation.event_guest_id
            AND decision.identity_generation = participation.identity_generation
            AND decision.decision_version = participation.rsvp_version
           WHERE participation.event_id = p_event_id
             AND participation.recipient_user_id = p_actor_id
             AND participation.access_state = 'active'
             AND participation.event_guest_id::text = v_scope->>'event_guest_id'
             AND participation.identity_generation::text
               = v_scope->>'identity_generation'
         )
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  -- The first two predicates determine the visible row-set. Detail authority
  -- is evaluated only later and can only turn a target on or off.
  FOR v_candidate IN
    SELECT candidate.*
    FROM (
      SELECT 'shared'::text AS row_kind,
        publication.draft_id, publication.publication_id,
        publication.publication_version, publication.actor_user_id,
        publication.visibility, publication.title,
        publication.total_minor, publication.currency,
        publication.incurred_on, publication.allocation_state,
        publication.updated_at
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.is_live
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_edit_revision_bindings AS edit_binding
          WHERE edit_binding.draft_id = publication.draft_id
        )
        AND publication.event_id = p_event_id
        AND publication.link_to_event
        AND public.expense_has_beta_access(publication.actor_user_id)
        AND public.expense_sql159_event_scope_allows(
          publication.actor_user_id, p_event_id
        )
        AND (
          publication.visibility = 'all_event'
          OR (
            publication.visibility = 'participants_only'
            AND public.expense_sql159_audience_allows(
              p_actor_id, publication.draft_id
              )
            )
          )
      UNION ALL
      SELECT 'private'::text AS row_kind,
        draft.id AS draft_id, NULL::uuid AS publication_id,
        NULL::bigint AS publication_version, draft.actor_user_id,
        NULL::text AS visibility, NULL::text AS title,
        NULL::bigint AS total_minor, NULL::text AS currency,
        NULL::date AS incurred_on, NULL::text AS allocation_state,
        draft.updated_at
      FROM public.expense_private_drafts AS draft
      WHERE draft.actor_user_id = p_actor_id
        AND public.expense_has_beta_access(p_actor_id)
        AND draft.context_type = 'one_off'
        AND pg_catalog.jsonb_typeof(draft.payload) = 'object'
        AND pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'
        AND CASE
          WHEN draft.payload->>'eventId'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (draft.payload->>'eventId')::uuid = p_event_id
          ELSE false
        END
        AND pg_catalog.jsonb_typeof(draft.payload->'linkToEvent') = 'boolean'
        AND (draft.payload->>'linkToEvent')::boolean
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS live_publication
          WHERE live_publication.draft_id = draft.id
            AND live_publication.is_live
        )
    ) AS candidate
    ORDER BY candidate.updated_at DESC,
      candidate.publication_id DESC NULLS LAST,
      candidate.draft_id DESC
    LIMIT 101
  LOOP
    v_count := v_count + 1;
    IF v_count > 100 THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
      );
    END IF;
    IF v_candidate.row_kind = 'shared' THEN
      v_locked_publication := NULL;
      SELECT publication.* INTO v_locked_publication
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.draft_id = v_candidate.draft_id
        AND publication.publication_id = v_candidate.publication_id
        AND publication.publication_version = v_candidate.publication_version
        AND publication.is_live
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_edit_revision_bindings AS edit_binding
          WHERE edit_binding.draft_id = publication.draft_id
        )
        AND publication.event_id = p_event_id
        AND publication.link_to_event
        AND public.expense_has_beta_access(publication.actor_user_id)
        AND public.expense_sql159_event_scope_allows(
          publication.actor_user_id, p_event_id
        )
        AND (
          publication.visibility = 'all_event'
          OR (
            publication.visibility = 'participants_only'
            AND public.expense_sql159_audience_allows(
              p_actor_id, publication.draft_id
            )
          )
        )
      FOR SHARE OF publication;
      IF v_locked_publication.draft_id IS NULL
         OR NOT public.expense_sql159_snapshot_is_valid(
           v_locked_publication.draft_id
         ) THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
        );
      END IF;
      v_can_detail := public.expense_sql159_audience_allows(
        p_actor_id, v_locked_publication.draft_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'shared_draft',
          'title', v_locked_publication.title,
          'total_minor', v_locked_publication.total_minor,
          'currency', v_locked_publication.currency,
          'incurred_on', pg_catalog.to_char(
            v_locked_publication.incurred_on, 'YYYY-MM-DD'
          ),
          'allocation_state', v_locked_publication.allocation_state,
          'detail_target', CASE WHEN v_can_detail
            THEN pg_catalog.jsonb_build_object(
              'kind', 'shared_draft',
              'publication_id', v_locked_publication.publication_id
            ) ELSE 'null'::jsonb END
        )
      );
    ELSE
      PERFORM 1
      FROM public.expense_private_drafts AS draft
      WHERE draft.id = v_candidate.draft_id
        AND draft.actor_user_id = p_actor_id
        AND draft.context_type = 'one_off'
        AND pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'
        AND CASE
          WHEN draft.payload->>'eventId'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (draft.payload->>'eventId')::uuid = p_event_id
          ELSE false
        END
        AND pg_catalog.jsonb_typeof(draft.payload->'linkToEvent') = 'boolean'
        AND (draft.payload->>'linkToEvent')::boolean
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_unconfirmed_publications AS publication
          WHERE publication.draft_id = draft.id
            AND publication.is_live
        )
      FOR SHARE OF draft;
      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
          'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
        );
      END IF;
      v_normalized := public.expense_sql159_private_event_summary(
        p_actor_id, v_candidate.draft_id, p_event_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'private_draft',
          'title', v_normalized->>'title',
          'total_minor', (v_normalized->>'total_minor')::bigint,
          'currency', v_normalized->>'currency',
          'incurred_on', v_normalized->>'incurred_on',
          'allocation_state', v_normalized->>'allocation_state',
          'detail_target', pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_candidate.draft_id
          )
        )
      );
    END IF;
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

CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_pre_active_v2(
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
  v_source jsonb;
  v_row jsonb;
  v_candidate record;
  v_locked record;
  v_summary jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_author_draft_id uuid;
  v_count integer := 0;
BEGIN
  v_source := public.teskeid_event_get_expense_pre_active_v1(
    p_actor_id, p_event_id
  );
  IF pg_catalog.jsonb_typeof(v_source) <> 'object'
     OR v_source - ARRAY['contract_version','status','rows']::text[]
       <> '{}'::jsonb
     OR NOT (v_source ?& ARRAY['contract_version','status','rows']::text[])
     OR v_source->>'contract_version' <> '1'
     OR v_source->>'status' NOT IN ('ready','none','unavailable')
     OR pg_catalog.jsonb_typeof(v_source->'rows') <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 2,
      'status', 'unavailable',
      'rows', '[]'::jsonb
    );
  END IF;
  IF v_source->>'status' = 'unavailable' THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 2,
      'status', 'unavailable',
      'rows', '[]'::jsonb
    );
  END IF;

  FOR v_row IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_source->'rows')
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    v_count := v_count + 1;
    IF v_row->>'lifecycle_state' = 'shared_draft'
       AND pg_catalog.jsonb_typeof(v_row->'detail_target') = 'object'
       AND v_row->'detail_target'->>'kind' = 'shared_draft'
       AND v_row->'detail_target'->>'publication_id'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_author_draft_id := NULL;
      SELECT publication.draft_id INTO v_author_draft_id
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.publication_id
          = (v_row->'detail_target'->>'publication_id')::uuid
        AND publication.actor_user_id = p_actor_id
        AND publication.is_live
        AND publication.event_id = p_event_id
        AND publication.link_to_event
      FOR SHARE OF publication;
      IF v_author_draft_id IS NOT NULL THEN
        v_row := pg_catalog.jsonb_set(
          v_row,
          ARRAY['detail_target']::text[],
          pg_catalog.jsonb_build_object(
            'kind', 'private_draft', 'draft_id', v_author_draft_id
          ),
          false
        );
      END IF;
    END IF;
    v_rows := v_rows || pg_catalog.jsonb_build_array(v_row);
  END LOOP;

  FOR v_candidate IN
    SELECT binding.draft_id, binding.expense_id, binding.group_id,
      binding.actor_user_id, binding.mode, binding.updated_at,
      publication.publication_id
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
     AND draft.context_type = 'edit'
     AND draft.expense_id = binding.expense_id
     AND draft.group_id = binding.group_id
     AND draft.actor_user_id = binding.actor_user_id
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
     AND expense.created_by = binding.actor_user_id
     AND expense.status = 'active'
    JOIN public.expense_groups AS group_row
      ON group_row.id = binding.group_id
     AND group_row.status = 'active'
    JOIN public.teskeid_event_expense_links AS link
      ON link.event_id = p_event_id
     AND link.group_id = binding.group_id
     AND link.expense_id = binding.expense_id
    LEFT JOIN public.expense_unconfirmed_publications AS publication
      ON publication.draft_id = binding.draft_id
     AND publication.is_live
    WHERE public.expense_has_beta_access(binding.actor_user_id)
      AND (
        (
          binding.actor_user_id = p_actor_id
          AND (
            binding.mode = 'private'
            OR (
              binding.mode = 'shared'
              AND publication.publication_id IS NOT NULL
            )
          )
        )
        OR (
          binding.mode = 'shared'
          AND publication.publication_id IS NOT NULL
          AND public.expense_sql159_audience_allows(
            p_actor_id, binding.draft_id
          )
        )
      )
      AND (
        link.visibility = 'all_event'
        OR (
          link.visibility = 'participants_only'
          AND EXISTS (
            SELECT 1
            FROM public.expense_group_members AS actor_member
            WHERE actor_member.group_id = binding.group_id
              AND actor_member.user_id = p_actor_id
              AND actor_member.status = 'active'
              AND NOT EXISTS (
                SELECT 1
                FROM public.expense_claim_disputes AS dispute
                WHERE dispute.group_id = binding.group_id
                  AND dispute.expense_id = binding.expense_id
                  AND dispute.member_id = actor_member.id
                  AND dispute.disputed_user_id = p_actor_id
                  AND dispute.status = 'disputed'
              )
          )
        )
      )
    ORDER BY binding.updated_at DESC, binding.expense_id DESC
    LIMIT 101
  LOOP
    v_count := v_count + 1;
    IF v_count > 100 THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 2,
        'status', 'unavailable',
        'rows', '[]'::jsonb
      );
    END IF;
    SELECT binding.draft_id, binding.expense_id, binding.group_id,
      binding.actor_user_id, binding.mode, draft.version,
      publication.publication_id, publication.publication_version,
      publication.title, publication.total_minor, publication.currency,
      publication.incurred_on, publication.allocation_state
    INTO v_locked
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
     AND draft.context_type = 'edit'
     AND draft.expense_id = binding.expense_id
     AND draft.group_id = binding.group_id
     AND draft.actor_user_id = binding.actor_user_id
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
     AND expense.created_by = binding.actor_user_id
     AND expense.status = 'active'
    JOIN public.expense_groups AS group_row
      ON group_row.id = binding.group_id
     AND group_row.status = 'active'
    JOIN public.teskeid_event_expense_links AS link
      ON link.event_id = p_event_id
     AND link.group_id = binding.group_id
     AND link.expense_id = binding.expense_id
    LEFT JOIN public.expense_unconfirmed_publications AS publication
      ON publication.draft_id = binding.draft_id
     AND publication.is_live
    WHERE binding.draft_id = v_candidate.draft_id
      AND (
        (
          binding.actor_user_id = p_actor_id
          AND (
            binding.mode = 'private'
            OR (
              binding.mode = 'shared'
              AND publication.publication_id IS NOT NULL
            )
          )
        )
        OR (
          binding.mode = 'shared'
          AND publication.publication_id IS NOT NULL
          AND public.expense_sql159_audience_allows(
            p_actor_id, binding.draft_id
          )
        )
      )
      AND (
        link.visibility = 'all_event'
        OR (
          link.visibility = 'participants_only'
          AND EXISTS (
            SELECT 1
            FROM public.expense_group_members AS actor_member
            WHERE actor_member.group_id = binding.group_id
              AND actor_member.user_id = p_actor_id
              AND actor_member.status = 'active'
              AND NOT EXISTS (
                SELECT 1
                FROM public.expense_claim_disputes AS dispute
                WHERE dispute.group_id = binding.group_id
                  AND dispute.expense_id = binding.expense_id
                  AND dispute.member_id = actor_member.id
                  AND dispute.disputed_user_id = p_actor_id
                  AND dispute.status = 'disputed'
              )
          )
        )
      )
    FOR SHARE OF binding, draft, expense, group_row, link;
    IF v_locked.draft_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 2,
        'status', 'unavailable',
        'rows', '[]'::jsonb
      );
    END IF;
    IF v_locked.mode = 'shared' THEN
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'shared_draft',
          'title', v_locked.title,
          'total_minor', v_locked.total_minor,
          'currency', v_locked.currency,
          'incurred_on', pg_catalog.to_char(v_locked.incurred_on, 'YYYY-MM-DD'),
          'allocation_state', v_locked.allocation_state,
          'detail_target', CASE
            WHEN v_locked.actor_user_id = p_actor_id
            THEN pg_catalog.jsonb_build_object(
              'kind', 'edit_draft',
              'expense_id', v_locked.expense_id,
              'draft_id', v_locked.draft_id
            )
            ELSE pg_catalog.jsonb_build_object(
              'kind', 'shared_draft',
              'publication_id', v_locked.publication_id
            )
          END
        )
      );
    ELSE
      v_summary := public.expense_sql177_edit_draft_summary(
        p_actor_id, v_locked.draft_id, v_locked.group_id, v_locked.expense_id
      );
      v_rows := v_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'lifecycle_state', 'private_draft',
          'title', v_summary->'title',
          'total_minor', v_summary->'total_minor',
          'currency', v_summary->'currency',
          'incurred_on', v_summary->'incurred_on',
          'allocation_state', 'incomplete',
          'detail_target', pg_catalog.jsonb_build_object(
            'kind', 'edit_draft',
            'expense_id', v_locked.expense_id,
            'draft_id', v_locked.draft_id
          )
        )
      );
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 2,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 2,
    'status', 'unavailable',
    'rows', '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_activity_v3(
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_edit_revision_bindings AS edit_binding
        WHERE edit_binding.expense_id = link.expense_id
          AND edit_binding.group_id = link.group_id
      )
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

ALTER FUNCTION public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_guard_edit_revision_financial_mutation_v1()
  OWNER TO postgres;
ALTER FUNCTION public.expense_can_open_edit_revision_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_assert_private_draft_context(uuid,text,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_edit_revision_financial_mutation_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_can_open_edit_revision_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_assert_private_draft_context(uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  TO service_role;

COMMENT ON FUNCTION public.expense_sql177_edit_draft_summary(uuid,uuid,uuid,uuid) IS
  'SQL177 internal exact-creator projection summary for one bound edit draft.';
COMMENT ON FUNCTION public.expense_guard_edit_revision_financial_mutation_v1() IS
  'SQL177 blocks repayment and settlement-item writes while a group has an open edit revision.';
COMMENT ON FUNCTION public.expense_can_open_edit_revision_v1(uuid,uuid) IS
  'SQL177 exact-creator edit-open capability; repayment history is preserved and proposed settlement blocks.';
COMMENT ON FUNCTION public.expense_list_group_creation_drafts_v1(uuid,uuid) IS
  'SQL177 group draft projection for creation drafts and exact edit-bound drafts.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_pre_active_v2(uuid,uuid) IS
  'SQL177 Event draft projection for creation drafts and exact edit-bound drafts.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid) IS
  'SQL177 confirmed Event projection excludes exact edit-bound Expenses.';

-- SQL177 INSTALL BODY END

COMMIT;
