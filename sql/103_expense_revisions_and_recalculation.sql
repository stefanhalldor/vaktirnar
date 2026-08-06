-- Migration 103: audited expense revisions and repayment-safe recalculation.
--
-- IMPORTANT: this file is written for Stebbi to review and run. Codex never
-- runs it. It is additive except for replacing expense_update_expense and
-- adding a fail-closed INSERT trigger to expense_repayments.

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.expense_groups') IS NULL THEN v_missing := array_append(v_missing, 'expense_groups'); END IF;
  IF to_regclass('public.expenses') IS NULL THEN v_missing := array_append(v_missing, 'expenses'); END IF;
  IF to_regclass('public.expense_payments') IS NULL THEN v_missing := array_append(v_missing, 'expense_payments'); END IF;
  IF to_regclass('public.expense_shares') IS NULL THEN v_missing := array_append(v_missing, 'expense_shares'); END IF;
  IF to_regclass('public.expense_repayments') IS NULL THEN v_missing := array_append(v_missing, 'expense_repayments'); END IF;
  IF to_regclass('public.expense_activity') IS NULL THEN v_missing := array_append(v_missing, 'expense_activity'); END IF;
  IF to_regclass('public.expense_private_drafts') IS NULL THEN v_missing := array_append(v_missing, 'expense_private_drafts(SQL102)'); END IF;
  IF to_regprocedure('public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_update_expense(SQL97)');
  END IF;
  IF to_regprocedure('public.expense_group_balances(uuid,boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_group_balances'); END IF;
  IF to_regprocedure('public.expense_simplified_settlement(uuid,text,boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_simplified_settlement'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql103_missing_prerequisites:%', array_to_string(v_missing, ',');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_valid_revision_fields(p_fields text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_field text;
BEGIN
  IF p_fields IS NULL OR cardinality(p_fields) NOT BETWEEN 1 AND 9 THEN RETURN false; END IF;
  FOREACH v_field IN ARRAY p_fields LOOP
    IF v_field IS NULL OR v_field NOT IN (
      'title', 'note', 'total_minor', 'currency', 'incurred_on',
      'category', 'split_method', 'payments', 'shares'
    ) THEN RETURN false; END IF;
  END LOOP;
  RETURN (SELECT count(DISTINCT field) = cardinality(p_fields) FROM unnest(p_fields) AS field);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_valid_revision_snapshot(p_snapshot jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_expense jsonb;
  v_summary jsonb;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object'
     OR octet_length(p_snapshot::text) > 65536
     OR NOT (p_snapshot ?& ARRAY['version','groupStatus','expense','payments','shares','balances','repaymentSummary'])
     OR (p_snapshot - ARRAY['version','groupStatus','expense','payments','shares','balances','repaymentSummary']::text[]) <> '{}'::jsonb
     OR p_snapshot->>'version' <> '1'
     OR p_snapshot->>'groupStatus' NOT IN ('active','settling','settled','closed')
     OR jsonb_typeof(p_snapshot->'payments') <> 'array'
     OR jsonb_typeof(p_snapshot->'shares') <> 'array'
     OR jsonb_typeof(p_snapshot->'balances') <> 'array'
     OR jsonb_array_length(p_snapshot->'payments') NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_snapshot->'shares') NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_snapshot->'balances') > 50 THEN RETURN false; END IF;
  v_expense := p_snapshot->'expense';
  v_summary := p_snapshot->'repaymentSummary';
  IF jsonb_typeof(v_expense) <> 'object'
     OR NOT (v_expense ?& ARRAY['title','note','totalMinor','currency','incurredOn','category','splitMethod'])
     OR (v_expense - ARRAY['title','note','totalMinor','currency','incurredOn','category','splitMethod']::text[]) <> '{}'::jsonb
     OR char_length(btrim(v_expense->>'title')) NOT BETWEEN 1 AND 200
     OR (v_expense->>'totalMinor') !~ '^[0-9]+$'
     OR (v_expense->>'totalMinor')::numeric NOT BETWEEN 1 AND 9007199254740991
     OR (v_expense->>'currency') !~ '^[A-Z]{3}$'
     OR (v_expense->>'incurredOn') !~ '^\d{4}-\d{2}-\d{2}$'
     OR ((v_expense->'note') <> 'null'::jsonb AND char_length(v_expense->>'note') > 1000)
     OR ((v_expense->'category') <> 'null'::jsonb AND v_expense->>'category' NOT IN (
       'food','accommodation','transport','travel','home','entertainment','gifts','shopping','other'
     ))
     OR v_expense->>'splitMethod' NOT IN (
       'equal','percentage','fixed','mixed_equal_remainder','mixed_percentage_remainder','weighted'
     ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements((p_snapshot->'payments') || (p_snapshot->'shares')) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ?& ARRAY['memberId','displayName','amountMinor'])
       OR (item - ARRAY['memberId','displayName','amountMinor']::text[]) <> '{}'::jsonb
       OR (item->>'memberId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR char_length(btrim(item->>'displayName')) NOT BETWEEN 1 AND 120
       OR (item->>'amountMinor') !~ '^[0-9]+$'
       OR (item->>'amountMinor')::numeric NOT BETWEEN 0 AND 9007199254740991
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'balances') AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ?& ARRAY['memberId','displayName','currency','amountMinor'])
       OR (item - ARRAY['memberId','displayName','currency','amountMinor']::text[]) <> '{}'::jsonb
       OR (item->>'memberId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR char_length(btrim(item->>'displayName')) NOT BETWEEN 1 AND 120
       OR (item->>'currency') !~ '^[A-Z]{3}$'
       OR (item->>'amountMinor') !~ '^-?[0-9]+$'
       OR abs((item->>'amountMinor')::numeric) > 9007199254740991
  ) THEN RETURN false; END IF;
  IF jsonb_typeof(v_summary) <> 'object'
     OR NOT (v_summary ?& ARRAY['reported','confirmed','rejected','cancelled'])
     OR (v_summary - ARRAY['reported','confirmed','rejected','cancelled']::text[]) <> '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_summary) AS entry
       WHERE jsonb_typeof(entry.value) <> 'number'
          OR entry.value::text !~ '^[0-9]+$'
          OR (entry.value::text)::numeric > 1000000
     ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.expense_revisions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no              bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  group_id                 uuid        NOT NULL REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  expense_id               uuid        NOT NULL,
  activity_id              uuid        NOT NULL UNIQUE REFERENCES public.expense_activity(id) ON DELETE RESTRICT,
  actor_user_id            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  financial_version_before bigint      NOT NULL,
  financial_version_after  bigint      NOT NULL,
  changed_fields           text[]      NOT NULL,
  before_snapshot          jsonb       NOT NULL,
  after_snapshot           jsonb       NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_revisions_group_expense_fk FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_revisions_version_check CHECK (
    financial_version_before >= 0 AND financial_version_after = financial_version_before + 1
  ),
  CONSTRAINT expense_revisions_changed_fields_check CHECK (public.expense_valid_revision_fields(changed_fields)),
  CONSTRAINT expense_revisions_before_snapshot_check CHECK (public.expense_valid_revision_snapshot(before_snapshot)),
  CONSTRAINT expense_revisions_after_snapshot_check CHECK (public.expense_valid_revision_snapshot(after_snapshot)),
  CONSTRAINT expense_revisions_expense_version_unique UNIQUE (expense_id, financial_version_after)
);

CREATE INDEX IF NOT EXISTS expense_revisions_expense_sequence_idx
  ON public.expense_revisions (expense_id, sequence_no DESC);
ALTER TABLE public.expense_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_revisions FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.expense_revisions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'expense_revision_immutable';
END;
$$;
DROP TRIGGER IF EXISTS expense_revisions_immutable_guard ON public.expense_revisions;
CREATE TRIGGER expense_revisions_immutable_guard
BEFORE UPDATE OR DELETE ON public.expense_revisions
FOR EACH ROW EXECUTE FUNCTION public.expense_revisions_immutable();

CREATE OR REPLACE FUNCTION public.expense_build_revision_snapshot(p_group_id uuid, p_expense_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_snapshot jsonb;
BEGIN
  SELECT jsonb_build_object(
    'version', 1, 'groupStatus', group_row.status,
    'expense', jsonb_build_object(
      'title', expense.title, 'note', expense.note, 'totalMinor', expense.total_minor,
      'currency', expense.currency, 'incurredOn', expense.incurred_on,
      'category', expense.category, 'splitMethod', expense.split_method
    ),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'memberId', payment.member_id, 'displayName', member.display_name, 'amountMinor', payment.amount_minor
    ) ORDER BY payment.member_id), '[]'::jsonb)
      FROM public.expense_payments AS payment
      JOIN public.expense_group_members AS member ON member.group_id = payment.group_id AND member.id = payment.member_id
      WHERE payment.group_id = p_group_id AND payment.expense_id = p_expense_id),
    'shares', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'memberId', share.member_id, 'displayName', member.display_name, 'amountMinor', share.amount_minor
    ) ORDER BY share.member_id), '[]'::jsonb)
      FROM public.expense_shares AS share
      JOIN public.expense_group_members AS member ON member.group_id = share.group_id AND member.id = share.member_id
      WHERE share.group_id = p_group_id AND share.expense_id = p_expense_id),
    'balances', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'memberId', balance.member_id, 'displayName', member.display_name,
      'currency', balance.currency, 'amountMinor', balance.amount_minor
    ) ORDER BY balance.currency, balance.member_id), '[]'::jsonb)
      FROM public.expense_group_balances(p_group_id, false) AS balance
      JOIN public.expense_group_members AS member ON member.group_id = p_group_id AND member.id = balance.member_id),
    'repaymentSummary', (SELECT jsonb_build_object(
      'reported', count(*) FILTER (WHERE repayment.status = 'reported'),
      'confirmed', count(*) FILTER (WHERE repayment.status = 'confirmed'),
      'rejected', count(*) FILTER (WHERE repayment.status = 'rejected'),
      'cancelled', count(*) FILTER (WHERE repayment.status = 'cancelled')
    ) FROM public.expense_repayments AS repayment WHERE repayment.group_id = p_group_id)
  ) INTO v_snapshot
  FROM public.expense_groups AS group_row
  JOIN public.expenses AS expense ON expense.group_id = group_row.id
  WHERE group_row.id = p_group_id AND expense.id = p_expense_id;
  IF v_snapshot IS NULL OR NOT public.expense_valid_revision_snapshot(v_snapshot) THEN
    RAISE EXCEPTION 'expense_revision_snapshot_invalid';
  END IF;
  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_reported_repayments_need_review(p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH reported AS (
    SELECT repayment.from_member_id, repayment.to_member_id, repayment.currency,
           sum(repayment.amount_minor)::bigint AS amount_minor
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id AND repayment.status = 'reported'
    GROUP BY repayment.from_member_id, repayment.to_member_id, repayment.currency
  ), current_settlement AS (
    SELECT currency.value AS currency, settlement.from_member_id,
           settlement.to_member_id, settlement.amount_minor
    FROM (SELECT DISTINCT repayment.currency AS value
          FROM public.expense_repayments AS repayment
          WHERE repayment.group_id = p_group_id AND repayment.status = 'reported') AS currency
    CROSS JOIN LATERAL public.expense_simplified_settlement(p_group_id, currency.value, false) AS settlement
  )
  SELECT EXISTS (
    SELECT 1 FROM reported
    LEFT JOIN current_settlement
      ON current_settlement.from_member_id = reported.from_member_id
     AND current_settlement.to_member_id = reported.to_member_id
     AND current_settlement.currency = reported.currency
    WHERE current_settlement.amount_minor IS NULL OR reported.amount_minor > current_settlement.amount_minor
  );
$$;

CREATE OR REPLACE FUNCTION public.expense_guard_new_reported_repayment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'reported' AND public.expense_reported_repayments_need_review(NEW.group_id) THEN
    RAISE EXCEPTION 'expense_repayment_review_required';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS expense_repayments_review_guard ON public.expense_repayments;
CREATE TRIGGER expense_repayments_review_guard
BEFORE INSERT ON public.expense_repayments
FOR EACH ROW EXECUTE FUNCTION public.expense_guard_new_reported_repayment();

-- expense_update_expense is replaced below with the SQL97 source-compatible,
-- CAS-guarded implementation.
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

REVOKE ALL ON TABLE public.expense_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.expense_revisions TO service_role;
REVOKE ALL ON FUNCTION public.expense_valid_revision_fields(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_valid_revision_snapshot(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_revisions_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_build_revision_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_reported_repayments_need_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_new_reported_repayment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) TO service_role;

COMMENT ON TABLE public.expense_revisions IS
  'Private append-only before/after audit for expense edits. Normalized expense tables remain authoritative.';
COMMENT ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) IS 'Atomic audited expense edit with CAS, immutable repayment preservation, derived settlement recalculation, and conditional settled-group reopening.';

COMMIT;

-- Recovery is deliberately separate: restore the SQL97 RPC body, then drop
-- the review trigger/helpers and revision table only after preserving audit.
-- No rollback is run by this file.
