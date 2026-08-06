-- Migration 96: private-beta expense sharing persistence.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi must review and
-- run it separately. All browser writes go through server actions which call
-- the service-role-only RPCs below. The database repeats entitlement and group
-- authorization checks; no client-supplied balance or settlement is trusted.

BEGIN;

-- Preserve every feature key allowed by the target database and widen the
-- union only for expenses, so this block cannot remove keys added later.
-- SQL96 as a whole must not be rerun after SQL97, which replaces several of
-- its function bodies with newer behavior.
DO $feature_key$
DECLARE
  v_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
  INTO v_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation
    ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'feature_access'
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c';

  IF v_expression IS NULL THEN
    RAISE EXCEPTION 'expense_feature_constraint_missing';
  END IF;

  IF v_expression NOT LIKE '%utlagt-og-endurgreitt%' THEN
    ALTER TABLE public.feature_access
      DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
      v_expression,
      'utlagt-og-endurgreitt'
    );
  END IF;
END;
$feature_key$;

-- recent_events predates source enums. Preserve its existing loans rows while
-- making the expense projection explicit and fail closed for unknown sources.
ALTER TABLE public.recent_events
  DROP CONSTRAINT IF EXISTS recent_events_source_check;

ALTER TABLE public.recent_events
  ADD CONSTRAINT recent_events_source_check
  CHECK (source IN ('loans', 'expenses'));

-- ---------------------------------------------------------------------------
-- Bounded value validators used by table constraints and RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_valid_currency_array(p_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_values IS NULL
    OR (
      cardinality(p_values) BETWEEN 0 AND 32
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(p_values) AS value
        WHERE value IS NULL OR value !~ '^[A-Z]{3}$'
      )
      AND cardinality(p_values) = cardinality(ARRAY(SELECT DISTINCT value FROM unnest(p_values) AS value))
    );
$$;

CREATE OR REPLACE FUNCTION public.expense_valid_payment_details(p_details jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_typeof(p_details) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_details) AS key
      WHERE key <> ALL (ARRAY[
        'accountNumber', 'nationalId', 'phoneNumber', 'paymentLink',
        'instructions', 'defaultReference'
      ]::text[])
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(p_details) AS item(key, value)
      WHERE jsonb_typeof(item.value) <> 'string'
         OR btrim(item.value #>> '{}') = ''
         OR char_length(item.value #>> '{}') > CASE item.key
              WHEN 'accountNumber' THEN 80
              WHEN 'nationalId' THEN 32
              WHEN 'phoneNumber' THEN 40
              WHEN 'paymentLink' THEN 500
              WHEN 'instructions' THEN 1000
              WHEN 'defaultReference' THEN 200
              ELSE 0
            END
         OR (item.key = 'paymentLink' AND (item.value #>> '{}') !~ '^https://')
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.expense_valid_payment_snapshot(p_snapshot jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_snapshot IS NULL
    OR coalesce((
      jsonb_typeof(p_snapshot) = 'object'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_snapshot) AS key
        WHERE key <> ALL (ARRAY[
          'title', 'kind', 'currency', 'details', 'visibility', 'captured_at',
          'owner_user_id', 'source_preference_id', 'source_version'
        ]::text[])
      )
      AND jsonb_typeof(p_snapshot->'title') = 'string'
      AND char_length(btrim(p_snapshot->>'title')) BETWEEN 1 AND 120
      AND p_snapshot->>'kind' IN (
        'bank_account', 'payment_app_phone', 'payment_link', 'cash', 'other'
      )
      AND (p_snapshot->>'currency') ~ '^[A-Z]{3}$'
      AND public.expense_valid_payment_details(p_snapshot->'details')
      AND p_snapshot->>'visibility' IN ('debt_context', 'explicit_share')
      AND jsonb_typeof(p_snapshot->'captured_at') = 'string'
      AND char_length(p_snapshot->>'captured_at') BETWEEN 20 AND 40
      AND jsonb_typeof(p_snapshot->'owner_user_id') = 'string'
      AND (p_snapshot->>'owner_user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof(p_snapshot->'source_preference_id') = 'string'
      AND (p_snapshot->>'source_preference_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof(p_snapshot->'source_version') = 'number'
      AND char_length(p_snapshot->>'source_version') BETWEEN 1 AND 19
      AND (p_snapshot->>'source_version') ~ '^[1-9][0-9]*$'
    ), false);
$$;

-- ---------------------------------------------------------------------------
-- Durable ledger and membership model.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.expense_groups (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                    text        NOT NULL,
  name                    text        NOT NULL,
  description             text        NULL,
  emoji                   text        NULL,
  default_currency        text        NOT NULL,
  default_include_creator boolean     NOT NULL DEFAULT true,
  status                  text        NOT NULL DEFAULT 'active',
  financial_version       bigint      NOT NULL DEFAULT 0,
  created_by              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_groups_kind_check CHECK (kind IN ('group', 'one_off')),
  CONSTRAINT expense_groups_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT expense_groups_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT expense_groups_emoji_check CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16),
  CONSTRAINT expense_groups_currency_check CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expense_groups_status_check CHECK (status IN ('active', 'settling', 'settled', 'closed')),
  CONSTRAINT expense_groups_financial_version_check CHECK (financial_version >= 0)
);

CREATE TABLE IF NOT EXISTS public.expense_group_members (
  id           uuid        PRIMARY KEY,
  group_id     uuid        NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text        NOT NULL,
  role         text        NOT NULL DEFAULT 'member',
  status       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_group_members_name_check CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT expense_group_members_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT expense_group_members_status_check CHECK (status IN ('invited', 'active', 'declined', 'removed', 'left')),
  CONSTRAINT expense_group_members_group_id_id_unique UNIQUE (group_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_group_members_registered_unique
  ON public.expense_group_members (group_id, user_id)
  WHERE user_id IS NOT NULL AND status IN ('invited', 'active');

CREATE UNIQUE INDEX IF NOT EXISTS expense_group_members_owner_unique
  ON public.expense_group_members (group_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS expense_group_members_user_status_idx
  ON public.expense_group_members (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.expenses (
  id           uuid        PRIMARY KEY,
  group_id     uuid        NOT NULL REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  title        text        NOT NULL,
  total_minor  bigint      NOT NULL,
  currency     text        NOT NULL,
  incurred_on  date        NOT NULL,
  category     text        NULL,
  note         text        NULL,
  status       text        NOT NULL DEFAULT 'active',
  split_method text        NOT NULL,
  created_by   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expenses_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT expenses_total_check CHECK (total_minor BETWEEN 1 AND 9007199254740991),
  CONSTRAINT expenses_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expenses_category_check CHECK (category IS NULL OR category IN (
    'food', 'accommodation', 'transport', 'travel', 'home',
    'entertainment', 'gifts', 'shopping', 'other'
  )),
  CONSTRAINT expenses_note_check CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT expenses_status_check CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT expenses_split_method_check CHECK (split_method IN (
    'equal', 'percentage', 'fixed', 'mixed_equal_remainder',
    'mixed_percentage_remainder', 'weighted'
  )),
  CONSTRAINT expenses_group_id_id_unique UNIQUE (group_id, id)
);

CREATE INDEX IF NOT EXISTS expenses_group_incurred_idx
  ON public.expenses (group_id, incurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_payments (
  group_id     uuid   NOT NULL,
  expense_id   uuid   NOT NULL,
  member_id    uuid   NOT NULL,
  amount_minor bigint NOT NULL,
  PRIMARY KEY (expense_id, member_id),
  CONSTRAINT expense_payments_group_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_payments_group_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_payments_amount_check CHECK (amount_minor BETWEEN 1 AND 9007199254740991)
);

CREATE TABLE IF NOT EXISTS public.expense_shares (
  group_id     uuid   NOT NULL,
  expense_id   uuid   NOT NULL,
  member_id    uuid   NOT NULL,
  amount_minor bigint NOT NULL,
  PRIMARY KEY (expense_id, member_id),
  CONSTRAINT expense_shares_group_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_shares_group_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_shares_amount_check CHECK (amount_minor BETWEEN 0 AND 9007199254740991)
);

CREATE TABLE IF NOT EXISTS public.expense_obligations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid        NOT NULL REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  from_member_id uuid        NOT NULL,
  to_member_id   uuid        NOT NULL,
  amount_minor   bigint      NOT NULL,
  currency       text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_obligations_distinct_members_check CHECK (from_member_id <> to_member_id),
  CONSTRAINT expense_obligations_amount_check CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  CONSTRAINT expense_obligations_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expense_obligations_group_from_member_fk
    FOREIGN KEY (group_id, from_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_obligations_group_to_member_fk
    FOREIGN KEY (group_id, to_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_obligations_group_id_id_unique UNIQUE (group_id, id)
);

CREATE INDEX IF NOT EXISTS expense_obligations_group_currency_idx
  ON public.expense_obligations (group_id, currency, created_at);

CREATE TABLE IF NOT EXISTS public.expense_repayments (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                    uuid        NOT NULL REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  from_member_id              uuid        NOT NULL,
  to_member_id                uuid        NOT NULL,
  amount_minor                bigint      NOT NULL,
  currency                    text        NOT NULL,
  occurred_on                 date        NOT NULL,
  note                        text        NULL,
  status                      text        NOT NULL DEFAULT 'reported',
  reported_by                 uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_preference_snapshot jsonb       NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_repayments_distinct_members_check CHECK (from_member_id <> to_member_id),
  CONSTRAINT expense_repayments_amount_check CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  CONSTRAINT expense_repayments_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expense_repayments_note_check CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT expense_repayments_status_check CHECK (status IN ('reported', 'confirmed', 'rejected', 'cancelled')),
  CONSTRAINT expense_repayments_snapshot_check CHECK (public.expense_valid_payment_snapshot(payment_preference_snapshot)),
  CONSTRAINT expense_repayments_group_from_member_fk
    FOREIGN KEY (group_id, from_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_repayments_group_to_member_fk
    FOREIGN KEY (group_id, to_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_repayments_group_id_id_unique UNIQUE (group_id, id)
);

CREATE INDEX IF NOT EXISTS expense_repayments_group_status_idx
  ON public.expense_repayments (group_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_repayment_allocations (
  group_id      uuid   NOT NULL,
  repayment_id  uuid   NOT NULL,
  obligation_id uuid   NOT NULL,
  amount_minor bigint NOT NULL,
  PRIMARY KEY (repayment_id, obligation_id),
  CONSTRAINT expense_repayment_allocations_group_repayment_fk
    FOREIGN KEY (group_id, repayment_id)
    REFERENCES public.expense_repayments(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_repayment_allocations_group_obligation_fk
    FOREIGN KEY (group_id, obligation_id)
    REFERENCES public.expense_obligations(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_repayment_allocations_amount_check CHECK (amount_minor BETWEEN 1 AND 9007199254740991)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_repayment_single_allocation
  ON public.expense_repayment_allocations (repayment_id);

-- The durable audit stream contains display/title snapshots but never amounts,
-- notes, email addresses, or payment details.
CREATE TABLE IF NOT EXISTS public.expense_activity (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no        bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  group_id           uuid        NULL REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  event_type         text        NOT NULL,
  entity_type        text        NOT NULL,
  entity_id          uuid        NOT NULL,
  summary_code       text        NOT NULL,
  actor_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_display_name text        NOT NULL,
  expense_title      text        NULL,
  group_title        text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_activity_event_type_check CHECK (event_type IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled',
    'expense_payment_preference_saved',
    'expense_payment_preference_deactivated'
  )),
  CONSTRAINT expense_activity_entity_type_check CHECK (entity_type IN (
    'expense', 'expense_group', 'expense_group_invitation',
    'expense_repayment', 'payment_preference'
  )),
  CONSTRAINT expense_activity_event_entity_check CHECK (
    (event_type IN ('expense_created', 'expense_updated', 'expense_cancelled')
      AND entity_type = 'expense' AND group_id IS NOT NULL AND expense_title IS NOT NULL)
    OR (event_type = 'expense_group_invitation_received'
      AND entity_type = 'expense_group_invitation'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_group_member_added', 'expense_group_member_removed',
        'expense_group_invitation_accepted', 'expense_group_invitation_declined',
        'expense_group_member_left', 'expense_group_settling', 'expense_group_settled'
      )
      AND entity_type = 'expense_group'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_repayment_reported', 'expense_repayment_confirmed',
        'expense_repayment_rejected', 'expense_repayment_cancelled'
      )
      AND entity_type = 'expense_repayment' AND group_id IS NOT NULL
      AND (expense_title IS NOT NULL OR group_title IS NOT NULL))
    OR (event_type IN (
        'expense_payment_preference_saved',
        'expense_payment_preference_deactivated'
      )
      AND entity_type = 'payment_preference' AND group_id IS NULL
      AND expense_title IS NULL AND group_title IS NULL)
  ),
  CONSTRAINT expense_activity_summary_code_check CHECK (
    char_length(summary_code) BETWEEN 1 AND 80
    AND summary_code ~ '^[a-z0-9_]+$'
  ),
  CONSTRAINT expense_activity_actor_name_check CHECK (char_length(btrim(actor_display_name)) BETWEEN 1 AND 120),
  CONSTRAINT expense_activity_expense_title_check CHECK (expense_title IS NULL OR char_length(expense_title) BETWEEN 1 AND 200),
  CONSTRAINT expense_activity_group_title_check CHECK (group_title IS NULL OR char_length(group_title) BETWEEN 1 AND 160)
);

CREATE INDEX IF NOT EXISTS expense_activity_group_sequence_idx
  ON public.expense_activity (group_id, sequence_no DESC);

-- Audience is captured in the same transaction as activity. This preserves
-- audit visibility for a member-removal event without granting current access.
CREATE TABLE IF NOT EXISTS public.expense_activity_audience (
  activity_id uuid        NOT NULL REFERENCES public.expense_activity(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS expense_activity_audience_user_idx
  ON public.expense_activity_audience (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_payment_preferences (
  id                   uuid        PRIMARY KEY,
  owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                text        NOT NULL,
  kind                 text        NOT NULL,
  supported_currencies text[]      NULL,
  details              jsonb       NOT NULL,
  visibility           text        NOT NULL,
  version              bigint      NOT NULL DEFAULT 1,
  active               boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_payment_preferences_owner_id_unique UNIQUE (owner_user_id, id),
  CONSTRAINT expense_payment_preferences_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT expense_payment_preferences_kind_check CHECK (kind IN (
    'bank_account', 'payment_app_phone', 'payment_link', 'cash', 'other'
  )),
  CONSTRAINT expense_payment_preferences_currencies_check CHECK (
    public.expense_valid_currency_array(supported_currencies)
  ),
  CONSTRAINT expense_payment_preferences_details_check CHECK (
    public.expense_valid_payment_details(details)
  ),
  CONSTRAINT expense_payment_preferences_required_details_check CHECK (
    (kind <> 'bank_account' OR details ? 'accountNumber')
    AND (kind <> 'payment_app_phone' OR details ? 'phoneNumber')
    AND (kind <> 'payment_link' OR details ? 'paymentLink')
    AND (kind <> 'other' OR details ? 'instructions')
  ),
  CONSTRAINT expense_payment_preferences_visibility_check CHECK (
    visibility IN ('private', 'debt_context', 'explicit_share')
  ),
  CONSTRAINT expense_payment_preferences_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS expense_payment_preferences_owner_active_idx
  ON public.expense_payment_preferences (owner_user_id, active, created_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_payment_preference_assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_id uuid        NULL,
  scope_type    text        NOT NULL,
  currency      text        NULL,
  group_id      uuid        NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_payment_preference_assignments_owner_preference_fk
    FOREIGN KEY (owner_user_id, preference_id)
    REFERENCES public.expense_payment_preferences(owner_user_id, id)
    ON DELETE CASCADE,
  CONSTRAINT expense_payment_preference_assignments_scope_check CHECK (
    (scope_type = 'general' AND currency IS NULL AND group_id IS NULL)
    OR (scope_type = 'currency' AND currency ~ '^[A-Z]{3}$' AND group_id IS NULL)
    OR (scope_type = 'group_currency' AND currency ~ '^[A-Z]{3}$' AND group_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_preference_assignment_general_unique
  ON public.expense_payment_preference_assignments (owner_user_id)
  WHERE scope_type = 'general';

CREATE UNIQUE INDEX IF NOT EXISTS expense_preference_assignment_currency_unique
  ON public.expense_payment_preference_assignments (owner_user_id, currency)
  WHERE scope_type = 'currency';

CREATE UNIQUE INDEX IF NOT EXISTS expense_preference_assignment_group_currency_unique
  ON public.expense_payment_preference_assignments (owner_user_id, group_id, currency)
  WHERE scope_type = 'group_currency';

-- Idempotency rows contain only a fingerprint and bounded result IDs, never
-- titles, notes, member names, or payment details.
CREATE TABLE IF NOT EXISTS public.expense_mutation_requests (
  actor_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz NULL,
  PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT expense_mutation_requests_operation_check CHECK (char_length(operation) BETWEEN 1 AND 80),
  CONSTRAINT expense_mutation_requests_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT expense_mutation_requests_result_check CHECK (result IS NULL OR jsonb_typeof(result) = 'object')
);

CREATE INDEX IF NOT EXISTS expense_mutation_requests_created_idx
  ON public.expense_mutation_requests (created_at);

-- ---------------------------------------------------------------------------
-- RLS and direct grants. Browser roles have no table access. Existing server
-- repositories need read-only service_role access; all writes remain RPC-only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_repayment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_activity_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payment_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payment_preference_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_mutation_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.expense_groups FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_group_members FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expenses FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_payments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_shares FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_obligations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_repayments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_repayment_allocations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_activity FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_activity_audience FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_payment_preferences FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_payment_preference_assignments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_mutation_requests FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.expense_groups TO service_role;
GRANT SELECT ON public.expense_group_members TO service_role;
GRANT SELECT ON public.expenses TO service_role;
GRANT SELECT ON public.expense_payments TO service_role;
GRANT SELECT ON public.expense_shares TO service_role;
GRANT SELECT ON public.expense_obligations TO service_role;
GRANT SELECT ON public.expense_repayments TO service_role;
GRANT SELECT ON public.expense_repayment_allocations TO service_role;
GRANT SELECT ON public.expense_activity TO service_role;
GRANT SELECT ON public.expense_payment_preferences TO service_role;
GRANT SELECT ON public.expense_payment_preference_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.expense_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_groups_touch_updated_at ON public.expense_groups;
CREATE TRIGGER expense_groups_touch_updated_at
  BEFORE UPDATE ON public.expense_groups
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

DROP TRIGGER IF EXISTS expense_group_members_touch_updated_at ON public.expense_group_members;
CREATE TRIGGER expense_group_members_touch_updated_at
  BEFORE UPDATE ON public.expense_group_members
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

DROP TRIGGER IF EXISTS expenses_touch_updated_at ON public.expenses;
CREATE TRIGGER expenses_touch_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

DROP TRIGGER IF EXISTS expense_repayments_touch_updated_at ON public.expense_repayments;
CREATE TRIGGER expense_repayments_touch_updated_at
  BEFORE UPDATE ON public.expense_repayments
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

DROP TRIGGER IF EXISTS expense_payment_preferences_touch_updated_at ON public.expense_payment_preferences;
CREATE TRIGGER expense_payment_preferences_touch_updated_at
  BEFORE UPDATE ON public.expense_payment_preferences
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

DROP TRIGGER IF EXISTS expense_preference_assignments_touch_updated_at
  ON public.expense_payment_preference_assignments;
CREATE TRIGGER expense_preference_assignments_touch_updated_at
  BEFORE UPDATE ON public.expense_payment_preference_assignments
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Internal authorization, idempotency, ledger, and audit helpers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_has_beta_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS account
    JOIN public.feature_access AS access
      ON public.normalize_email_canonical(access.email)
       = public.normalize_email_canonical(account.email)
     AND access.feature_key = 'utlagt-og-endurgreitt'
    WHERE account.id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.expense_assert_beta_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'expense_unavailable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_active_member_role(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT member.role
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.user_id = p_actor_id
    AND member.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.expense_begin_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.expense_mutation_requests%ROWTYPE;
BEGIN
  -- Serialize all expense mutations for one actor and recheck entitlement after
  -- waiting. Account deletion takes the same lock before revoking access.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  IF NOT public.expense_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'expense_unavailable';
  END IF;

  IF p_request_id IS NULL
     OR char_length(p_operation) NOT BETWEEN 1 AND 80
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  INSERT INTO public.expense_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  )
  VALUES (p_actor_id, p_request_id, p_operation, p_fingerprint)
  ON CONFLICT (actor_user_id, request_id) DO NOTHING;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request.*
  INTO v_existing
  FROM public.expense_mutation_requests AS request
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
  FOR UPDATE;

  IF v_existing.operation <> p_operation
     OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'expense_idempotency_conflict';
  END IF;

  IF v_existing.result IS NULL THEN
    RAISE EXCEPTION 'expense_idempotency_incomplete';
  END IF;

  RETURN v_existing.result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_finish_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'expense_invalid_result';
  END IF;

  UPDATE public.expense_mutation_requests AS request
  SET result = p_result,
      completed_at = now()
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
    AND request.result IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_idempotency_incomplete';
  END IF;
END;
$$;

-- Returns the canonical ledger. Confirmed repayments affect the ledger;
-- reported repayments are included only when reserving available settlement.
CREATE OR REPLACE FUNCTION public.expense_group_balances(
  p_group_id uuid,
  p_include_reported boolean DEFAULT false
)
RETURNS TABLE (member_id uuid, currency text, amount_minor bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT movement.member_id, movement.currency, sum(movement.amount_minor)::bigint
  FROM (
    SELECT payment.member_id, expense.currency, payment.amount_minor
    FROM public.expense_payments AS payment
    JOIN public.expenses AS expense ON expense.id = payment.expense_id
    WHERE expense.group_id = p_group_id AND expense.status = 'active'

    UNION ALL

    SELECT share.member_id, expense.currency, -share.amount_minor
    FROM public.expense_shares AS share
    JOIN public.expenses AS expense ON expense.id = share.expense_id
    WHERE expense.group_id = p_group_id AND expense.status = 'active'

    UNION ALL

    SELECT repayment.from_member_id, repayment.currency, repayment.amount_minor
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id
      AND (
        repayment.status = 'confirmed'
        OR (p_include_reported AND repayment.status = 'reported')
      )

    UNION ALL

    SELECT repayment.to_member_id, repayment.currency, -repayment.amount_minor
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id
      AND (
        repayment.status = 'confirmed'
        OR (p_include_reported AND repayment.status = 'reported')
      )
  ) AS movement
  GROUP BY movement.member_id, movement.currency
  HAVING sum(movement.amount_minor) <> 0;
$$;

-- Deterministic greedy simplification identical to the TypeScript domain:
-- largest remaining amounts first, stable UUID text as the tie-breaker.
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
AS $$
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

  SELECT coalesce(sum(balance.amount_minor), 0)::bigint
  INTO v_total
  FROM public.expense_group_balances(p_group_id, p_include_reported) AS balance
  WHERE balance.currency = p_currency;

  IF v_total <> 0 THEN
    RAISE EXCEPTION 'expense_balance_total_invalid';
  END IF;

  SELECT
    array_agg(balance.member_id ORDER BY -balance.amount_minor DESC, balance.member_id),
    array_agg(-balance.amount_minor ORDER BY -balance.amount_minor DESC, balance.member_id)
  INTO v_debtors, v_debts
  FROM public.expense_group_balances(p_group_id, p_include_reported) AS balance
  WHERE balance.currency = p_currency AND balance.amount_minor < 0;

  SELECT
    array_agg(balance.member_id ORDER BY balance.amount_minor DESC, balance.member_id),
    array_agg(balance.amount_minor ORDER BY balance.amount_minor DESC, balance.member_id)
  INTO v_creditors, v_credits
  FROM public.expense_group_balances(p_group_id, p_include_reported) AS balance
  WHERE balance.currency = p_currency AND balance.amount_minor > 0;

  WHILE v_debtor_index <= coalesce(array_length(v_debtors, 1), 0)
    AND v_creditor_index <= coalesce(array_length(v_creditors, 1), 0)
  LOOP
    v_amount := least(v_debts[v_debtor_index], v_credits[v_creditor_index]);
    from_member_id := v_debtors[v_debtor_index];
    to_member_id := v_creditors[v_creditor_index];
    amount_minor := v_amount;
    currency := p_currency;
    RETURN NEXT;

    v_debts[v_debtor_index] := v_debts[v_debtor_index] - v_amount;
    v_credits[v_creditor_index] := v_credits[v_creditor_index] - v_amount;
    IF v_debts[v_debtor_index] = 0 THEN
      v_debtor_index := v_debtor_index + 1;
    END IF;
    IF v_credits[v_creditor_index] = 0 THEN
      v_creditor_index := v_creditor_index + 1;
    END IF;
  END LOOP;

  IF v_debtor_index <= coalesce(array_length(v_debtors, 1), 0)
     OR v_creditor_index <= coalesce(array_length(v_creditors, 1), 0) THEN
    RAISE EXCEPTION 'expense_balance_total_invalid';
  END IF;
END;
$$;

-- Inserts immutable audit + snapshotted audience + sanitized Nýlegt rows in
-- one transaction. Preference activity passes p_project_recent=false.
CREATE OR REPLACE FUNCTION public.expense_record_activity(
  p_group_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary_code text,
  p_expense_title text DEFAULT NULL,
  p_group_title text DEFAULT NULL,
  p_extra_user_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_project_recent boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := gen_random_uuid();
  v_created_at timestamptz := now();
  v_actor_display_name text;
  v_href text;
  v_payload jsonb;
BEGIN
  SELECT member.display_name
  INTO v_actor_display_name
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.user_id = p_actor_id
  ORDER BY CASE member.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
           member.created_at DESC
  LIMIT 1;

  IF v_actor_display_name IS NULL THEN
    SELECT NULLIF(btrim(profile.display_name), '')
    INTO v_actor_display_name
    FROM public.profiles AS profile
    WHERE profile.id = p_actor_id;
  END IF;
  v_actor_display_name := coalesce(v_actor_display_name, 'Teskeiðarnotandi');

  INSERT INTO public.expense_activity (
    id, group_id, event_type, entity_type, entity_id, summary_code,
    actor_user_id, actor_display_name, expense_title, group_title, created_at
  )
  VALUES (
    v_activity_id, p_group_id, p_event_type, p_entity_type, p_entity_id,
    p_summary_code, p_actor_id, v_actor_display_name,
    NULLIF(btrim(p_expense_title), ''), NULLIF(btrim(p_group_title), ''),
    v_created_at
  );

  INSERT INTO public.expense_activity_audience (activity_id, user_id)
  SELECT v_activity_id, recipient.user_id
  FROM (
    SELECT member.user_id
    FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.status = 'active'
      AND member.user_id IS NOT NULL
      AND p_event_type <> 'expense_group_invitation_received'
    UNION
    SELECT unnest(coalesce(p_extra_user_ids, ARRAY[]::uuid[]))
    UNION
    SELECT p_actor_id
  ) AS recipient
  WHERE recipient.user_id IS NOT NULL
    AND public.expense_has_beta_access(recipient.user_id)
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  IF NOT p_project_recent THEN
    RETURN v_activity_id;
  END IF;

  IF p_event_type NOT IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled'
  ) THEN
    RAISE EXCEPTION 'expense_recent_projection_invalid';
  END IF;

  v_href := CASE p_entity_type
    WHEN 'expense' THEN '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || p_entity_id::text
    WHEN 'expense_repayment' THEN '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/' || p_entity_id::text
    WHEN 'expense_group_invitation' THEN '/auth-mvp/utlagt-og-endurgreitt/bod/' || p_entity_id::text
    WHEN 'expense_group' THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || p_entity_id::text
    ELSE NULL
  END;

  IF v_href IS NULL OR p_event_type IN (
    'expense_payment_preference_saved',
    'expense_payment_preference_deactivated'
  ) THEN
    RAISE EXCEPTION 'expense_recent_projection_invalid';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'expenseTitle', NULLIF(btrim(p_expense_title), ''),
    'groupTitle', NULLIF(btrim(p_group_title), ''),
    'actorUserId', p_actor_id
  ));

  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at, ack_at
  )
  SELECT
    audience.user_id,
    'expenses',
    p_event_type,
    p_entity_type,
    p_entity_id,
    'expenses:activity:' || v_activity_id::text,
    v_payload,
    v_href,
    v_created_at,
    CASE WHEN audience.user_id = p_actor_id THEN v_created_at ELSE NULL END
  FROM public.expense_activity_audience AS audience
  WHERE audience.activity_id = v_activity_id
  ON CONFLICT (user_id, event_key) DO NOTHING;

  RETURN v_activity_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Group, membership, and expense mutations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_create_group(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_description text,
  p_emoji text,
  p_default_currency text,
  p_default_include_creator boolean,
  p_members jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_member jsonb;
  v_member_id uuid;
  v_user_id uuid;
  v_display_name text;
  v_owner_count integer;
  v_canonical_members jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 160
     OR (p_description IS NOT NULL AND char_length(p_description) > 1000)
     OR (p_emoji IS NOT NULL AND char_length(p_emoji) NOT BETWEEN 1 AND 16)
     OR p_default_currency !~ '^[A-Z]{3}$'
     OR p_default_include_creator IS NULL
     OR jsonb_typeof(p_members) <> 'array' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF jsonb_array_length(p_members) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;

  SELECT count(*)::integer
  INTO v_owner_count
  FROM jsonb_array_elements(p_members) AS item
  WHERE item->>'user_id' = p_actor_id::text
    AND item->>'role' = 'owner';

  IF v_owner_count <> 1
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_members) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['id', 'user_id', 'display_name', 'role', 'status']::text[]) <> '{}'::jsonb
          OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR char_length(btrim(item->>'display_name')) NOT BETWEEN 1 AND 120
          OR item->>'role' NOT IN ('owner', 'member')
          OR (item->>'role' = 'owner'
            AND (item->>'user_id') IS DISTINCT FROM p_actor_id::text)
          OR (item->>'role' <> 'owner' AND item->>'user_id' = p_actor_id::text)
          OR (
            item ? 'user_id'
            AND jsonb_typeof(item->'user_id') <> 'null'
            AND (item->>'user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_members) AS item
       GROUP BY item->>'id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_members) AS item
       WHERE jsonb_typeof(item->'user_id') = 'string'
       GROUP BY item->>'user_id' HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'ordinal', member.ordinal,
      'userId', member.value->'user_id',
      -- Registered display names are live profile snapshots and can change
      -- between retries. Guest labels are semantic client input.
      'guestDisplayName', CASE
        WHEN jsonb_typeof(member.value->'user_id') = 'string' THEN NULL
        ELSE btrim(member.value->>'display_name')
      END,
      'role', member.value->>'role'
    )
    ORDER BY member.ordinal
  )
  INTO v_canonical_members
  FROM jsonb_array_elements(p_members) WITH ORDINALITY AS member(value, ordinal);

  v_fingerprint := md5(jsonb_build_object(
    'name', btrim(p_name),
    'description', NULLIF(btrim(p_description), ''),
    'emoji', NULLIF(btrim(p_emoji), ''),
    'currency', p_default_currency,
    'includeCreator', p_default_include_creator,
    'members', v_canonical_members
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_create_group', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  INSERT INTO public.expense_groups (
    id, kind, name, description, emoji, default_currency,
    default_include_creator, created_by
  )
  VALUES (
    v_group_id, 'group', btrim(p_name), NULLIF(btrim(p_description), ''),
    NULLIF(btrim(p_emoji), ''), p_default_currency,
    p_default_include_creator, p_actor_id
  );

  FOR v_member IN SELECT value FROM jsonb_array_elements(p_members)
  LOOP
    v_member_id := (v_member->>'id')::uuid;
    v_user_id := CASE
      WHEN jsonb_typeof(v_member->'user_id') = 'string' THEN (v_member->>'user_id')::uuid
      ELSE NULL
    END;
    v_display_name := btrim(v_member->>'display_name');

    IF v_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users AS account WHERE account.id = v_user_id) THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;

    INSERT INTO public.expense_group_members (
      id, group_id, user_id, display_name, role, status
    )
    VALUES (
      v_member_id,
      v_group_id,
      v_user_id,
      v_display_name,
      CASE WHEN v_user_id = p_actor_id THEN 'owner' ELSE 'member' END,
      CASE WHEN v_user_id = p_actor_id OR v_user_id IS NULL THEN 'active' ELSE 'invited' END
    );
  END LOOP;

  FOR v_user_id IN
    SELECT member.user_id
    FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id
      AND member.status = 'invited'
      AND member.user_id IS NOT NULL
  LOOP
    PERFORM public.expense_record_activity(
      v_group_id, p_actor_id, 'expense_group_invitation_received',
      'expense_group_invitation', v_group_id,
      'expense_group_invitation_received', NULL, btrim(p_name),
      ARRAY[v_user_id], true
    );
  END LOOP;

  -- Guest snapshots are visible only inside the group and have no recent-event
  -- recipient; retain a bounded audit entry for their addition.
  IF EXISTS (
    SELECT 1 FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id
      AND member.user_id IS NULL
      AND member.role <> 'owner'
  ) THEN
    PERFORM public.expense_record_activity(
      v_group_id, p_actor_id, 'expense_group_member_added',
      'expense_group', v_group_id, 'expense_group_member_added',
      NULL, btrim(p_name), ARRAY[]::uuid[], true
    );
  END IF;

  v_result := jsonb_build_object('group_id', v_group_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.expense_add_group_member(
  p_actor_id uuid,
  p_group_id uuid,
  p_request_id uuid,
  p_member jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_existing_member public.expense_group_members%ROWTYPE;
  v_role text;
  v_member_id uuid;
  v_user_id uuid;
  v_display_name text;
  v_status text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF jsonb_typeof(p_member) <> 'object'
     OR (p_member - ARRAY['id', 'user_id', 'display_name', 'status']::text[]) <> '{}'::jsonb
     OR (p_member->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR char_length(btrim(p_member->>'display_name')) NOT BETWEEN 1 AND 120
     OR (
       p_member ? 'user_id'
       AND jsonb_typeof(p_member->'user_id') <> 'null'
       AND (p_member->>'user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) THEN
    RAISE EXCEPTION 'expense_member_invalid';
  END IF;

  v_member_id := (p_member->>'id')::uuid;
  v_user_id := CASE
    WHEN jsonb_typeof(p_member->'user_id') = 'string' THEN (p_member->>'user_id')::uuid
    ELSE NULL
  END;
  v_display_name := btrim(p_member->>'display_name');
  v_status := CASE WHEN v_user_id IS NULL THEN 'active' ELSE 'invited' END;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'userId', v_user_id,
    'guestDisplayName', CASE WHEN v_user_id IS NULL THEN v_display_name ELSE NULL END
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_add_group_member', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.kind <> 'group' OR v_group.status <> 'active'
     OR coalesce(v_role, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'expense_not_allowed';
  END IF;
  IF (SELECT count(*) FROM public.expense_group_members AS member
      WHERE member.group_id = p_group_id AND member.status IN ('active', 'invited')) >= 50
     OR (v_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM auth.users AS account WHERE account.id = v_user_id
     )) THEN
    RAISE EXCEPTION 'expense_member_invalid';
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT member.* INTO v_existing_member
    FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.user_id = v_user_id
    ORDER BY member.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing_member.id IS NOT NULL THEN
    IF v_existing_member.status IN ('active', 'invited')
       OR EXISTS (
         SELECT 1
         FROM public.expense_group_balances(p_group_id, false) AS balance
         WHERE balance.member_id = v_existing_member.id
           AND balance.amount_minor <> 0
       )
       OR EXISTS (
         SELECT 1
         FROM public.expense_repayments AS repayment
         WHERE repayment.group_id = p_group_id
           AND repayment.status = 'reported'
           AND v_existing_member.id IN (
             repayment.from_member_id, repayment.to_member_id
           )
       ) THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;
    UPDATE public.expense_group_members AS member
    SET display_name = v_display_name,
        role = 'member',
        status = 'invited',
        created_at = now()
    WHERE member.id = v_existing_member.id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.expense_group_members AS member
      WHERE member.id = v_member_id
    ) THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;
    INSERT INTO public.expense_group_members (
      id, group_id, user_id, display_name, role, status
    ) VALUES (
      v_member_id, p_group_id, v_user_id, v_display_name, 'member', v_status
    );
  END IF;

  IF v_status = 'invited' THEN
    PERFORM public.expense_record_activity(
      p_group_id, p_actor_id, 'expense_group_invitation_received',
      'expense_group_invitation', p_group_id,
      'expense_group_invitation_received', NULL, v_group.name,
      ARRAY[v_user_id], true
    );
  ELSE
    PERFORM public.expense_record_activity(
      p_group_id, p_actor_id, 'expense_group_member_added',
      'expense_group', p_group_id, 'expense_group_member_added',
      NULL, v_group.name, ARRAY[]::uuid[], true
    );
  END IF;

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_member_can_exit(
  p_group_id uuid,
  p_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.expense_group_balances(p_group_id, false) AS balance
    WHERE balance.member_id = p_member_id
      AND balance.amount_minor <> 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = p_group_id
      AND repayment.status = 'reported'
      AND p_member_id IN (repayment.from_member_id, repayment.to_member_id)
  );
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

CREATE OR REPLACE FUNCTION public.expense_leave_group(
  p_actor_id uuid,
  p_group_id uuid,
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
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_fingerprint := md5(jsonb_build_object('groupId', p_group_id)::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_leave_group', v_fingerprint
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
    AND member.status = 'active'
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind <> 'group' OR v_member.id IS NULL
     OR v_member.role = 'owner'
     OR NOT public.expense_member_can_exit(p_group_id, v_member.id) THEN
    RAISE EXCEPTION 'expense_member_cannot_leave';
  END IF;

  UPDATE public.expense_group_members AS member
  SET status = 'left'
  WHERE member.id = v_member.id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_group_member_left',
    'expense_group', p_group_id, 'expense_group_member_left',
    NULL, v_group.name, ARRAY[p_actor_id], true
  );

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_remove_group_member(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_target public.expense_group_members%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
  v_extra uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id, 'memberId', p_member_id
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_remove_group_member', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  SELECT member.* INTO v_target
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_member_id
    AND member.status IN ('active', 'invited')
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind <> 'group'
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_target.id IS NULL OR v_target.role = 'owner'
     OR v_target.user_id = p_actor_id
     OR NOT public.expense_member_can_exit(p_group_id, p_member_id) THEN
    RAISE EXCEPTION 'expense_member_cannot_remove';
  END IF;

  IF v_target.user_id IS NOT NULL THEN
    v_extra := ARRAY[v_target.user_id];
  END IF;
  UPDATE public.expense_group_members AS member
  SET status = 'removed'
  WHERE member.id = p_member_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_group_member_removed',
    'expense_group', p_group_id, 'expense_group_member_removed',
    NULL, v_group.name, v_extra, true
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
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;
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
  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group.id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'expense_amount_overflow';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group.id, false) AS balance
    JOIN public.expense_group_members AS member
      ON member.group_id = v_group.id
     AND member.id = balance.member_id
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
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

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

-- ---------------------------------------------------------------------------
-- Settlement reporting and confirmation.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Private payment preferences. CAS prevents lost updates; only a bounded,
-- immutable debt-context snapshot may cross into a repayment.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_save_payment_preference(
  p_actor_id uuid,
  p_preference_id uuid,
  p_expected_version bigint,
  p_request_id uuid,
  p_title text,
  p_kind text,
  p_supported_currencies text[],
  p_details jsonb,
  p_visibility text,
  p_assignment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.expense_payment_preferences%ROWTYPE;
  v_scope text;
  v_currency text;
  v_group_id uuid;
  v_new_version bigint;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_preference_id IS NULL
     OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120
     OR p_kind NOT IN (
       'bank_account', 'payment_app_phone', 'payment_link', 'cash', 'other'
     )
     OR NOT public.expense_valid_currency_array(p_supported_currencies)
     OR NOT public.expense_valid_payment_details(p_details)
     OR p_visibility NOT IN ('private', 'debt_context')
     OR (p_kind = 'bank_account' AND NOT (p_details ? 'accountNumber'))
     OR (p_kind = 'payment_app_phone' AND NOT (p_details ? 'phoneNumber'))
     OR (p_kind = 'payment_link' AND NOT (p_details ? 'paymentLink'))
     OR (p_kind = 'other' AND NOT (p_details ? 'instructions'))
     OR (p_expected_version IS NOT NULL AND p_expected_version <= 0) THEN
    RAISE EXCEPTION 'expense_payment_preference_invalid';
  END IF;

  IF p_assignment IS NOT NULL THEN
    IF jsonb_typeof(p_assignment) <> 'object' THEN
      RAISE EXCEPTION 'expense_payment_assignment_invalid';
    END IF;
    v_scope := p_assignment->>'scope_type';
    IF v_scope = 'general' THEN
      IF (p_assignment - ARRAY['scope_type']::text[]) <> '{}'::jsonb THEN
        RAISE EXCEPTION 'expense_payment_assignment_invalid';
      END IF;
    ELSIF v_scope = 'currency' THEN
      IF (p_assignment - ARRAY['scope_type', 'currency']::text[]) <> '{}'::jsonb
         OR (p_assignment->>'currency') !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'expense_payment_assignment_invalid';
      END IF;
      v_currency := p_assignment->>'currency';
    ELSIF v_scope = 'group_currency' THEN
      IF (p_assignment - ARRAY['scope_type', 'group_id', 'currency']::text[]) <> '{}'::jsonb
         OR (p_assignment->>'group_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR (p_assignment->>'currency') !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'expense_payment_assignment_invalid';
      END IF;
      v_group_id := (p_assignment->>'group_id')::uuid;
      v_currency := p_assignment->>'currency';
    ELSE
      RAISE EXCEPTION 'expense_payment_assignment_invalid';
    END IF;
  END IF;

  -- A specific assignment must never point at a preference that declares the
  -- assigned currency unsupported. Otherwise the specific row would suppress
  -- broader fallback while being unusable itself.
  IF v_currency IS NOT NULL
     AND p_supported_currencies IS NOT NULL
     AND NOT (v_currency = ANY(p_supported_currencies)) THEN
    RAISE EXCEPTION 'expense_payment_assignment_invalid';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'preferenceId', CASE
      WHEN p_expected_version IS NULL THEN NULL
      ELSE p_preference_id
    END,
    'expectedVersion', p_expected_version,
    'title', btrim(p_title),
    'kind', p_kind,
    'supportedCurrencies', p_supported_currencies,
    'details', p_details,
    'visibility', p_visibility,
    'assignment', p_assignment
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_save_payment_preference', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Serialize the whole preference/assignment decision for this owner. Report
  -- repayment takes the same namespace after its group lock; this RPC never
  -- takes a group row lock, so the shared order cannot form a group cycle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9602)
  );

  IF v_scope = 'group_currency'
     AND public.expense_active_member_role(p_actor_id, v_group_id) IS NULL THEN
    RAISE EXCEPTION 'expense_payment_assignment_not_allowed';
  END IF;

  SELECT preference.* INTO v_existing
  FROM public.expense_payment_preferences AS preference
  WHERE preference.id = p_preference_id
    AND preference.owner_user_id = p_actor_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    IF p_expected_version IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.expense_payment_preferences AS preference
      WHERE preference.id = p_preference_id
    ) THEN
      RAISE EXCEPTION 'expense_payment_preference_version_conflict';
    END IF;
    v_new_version := 1;
    INSERT INTO public.expense_payment_preferences (
      id, owner_user_id, title, kind, supported_currencies,
      details, visibility, version, active
    ) VALUES (
      p_preference_id, p_actor_id, btrim(p_title), p_kind,
      p_supported_currencies, p_details, p_visibility, v_new_version, true
    );
  ELSE
    IF NOT v_existing.active
       OR p_expected_version IS NULL
       OR v_existing.version <> p_expected_version THEN
      RAISE EXCEPTION 'expense_payment_preference_version_conflict';
    END IF;
    v_new_version := v_existing.version + 1;
    UPDATE public.expense_payment_preferences AS preference
    SET title = btrim(p_title),
        kind = p_kind,
        supported_currencies = p_supported_currencies,
        details = p_details,
        visibility = p_visibility,
        version = v_new_version
    WHERE preference.id = p_preference_id
      AND preference.owner_user_id = p_actor_id;
  END IF;

  DELETE FROM public.expense_payment_preference_assignments AS assignment
  WHERE assignment.owner_user_id = p_actor_id
    AND assignment.preference_id = p_preference_id;

  IF p_assignment IS NOT NULL THEN
    DELETE FROM public.expense_payment_preference_assignments AS assignment
    WHERE assignment.owner_user_id = p_actor_id
      AND (
        (v_scope = 'general' AND assignment.scope_type = 'general')
        OR (v_scope = 'currency'
          AND assignment.scope_type = 'currency'
          AND assignment.currency = v_currency)
        OR (v_scope = 'group_currency'
          AND assignment.scope_type = 'group_currency'
          AND assignment.group_id = v_group_id
          AND assignment.currency = v_currency)
      );
    INSERT INTO public.expense_payment_preference_assignments (
      owner_user_id, preference_id, scope_type, currency, group_id
    ) VALUES (
      p_actor_id, p_preference_id, v_scope, v_currency, v_group_id
    );
  END IF;

  -- Preference audit is private/activity-only: group_id stays NULL and the
  -- shared recent_events projection is deliberately skipped.
  PERFORM public.expense_record_activity(
    NULL, p_actor_id, 'expense_payment_preference_saved',
    'payment_preference', p_preference_id,
    'expense_payment_preference_saved', NULL, NULL,
    ARRAY[p_actor_id], false
  );

  v_result := jsonb_build_object(
    'preference_id', p_preference_id,
    'version', v_new_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_deactivate_payment_preference(
  p_actor_id uuid,
  p_preference_id uuid,
  p_expected_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_preference public.expense_payment_preferences%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_preference_id IS NULL OR p_expected_version IS NULL OR p_expected_version <= 0 THEN
    RAISE EXCEPTION 'expense_payment_preference_invalid';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'preferenceId', p_preference_id,
    'expectedVersion', p_expected_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_deactivate_payment_preference', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9602)
  );

  SELECT preference.* INTO v_preference
  FROM public.expense_payment_preferences AS preference
  WHERE preference.id = p_preference_id
    AND preference.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_preference.id IS NULL OR NOT v_preference.active
     OR v_preference.version <> p_expected_version THEN
    RAISE EXCEPTION 'expense_payment_preference_version_conflict';
  END IF;

  UPDATE public.expense_payment_preferences AS preference
  SET active = false,
      version = preference.version + 1
  WHERE preference.id = p_preference_id
    AND preference.owner_user_id = p_actor_id;
  DELETE FROM public.expense_payment_preference_assignments AS assignment
  WHERE assignment.owner_user_id = p_actor_id
    AND assignment.preference_id = p_preference_id;

  PERFORM public.expense_record_activity(
    NULL, p_actor_id, 'expense_payment_preference_deactivated',
    'payment_preference', p_preference_id,
    'expense_payment_preference_deactivated', NULL, NULL,
    ARRAY[p_actor_id], false
  );

  v_result := jsonb_build_object(
    'preference_id', p_preference_id,
    'version', v_preference.version + 1
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Resolve a current payment instruction before the debtor pays outside
-- Teskeið. This is deliberately a service boundary rather than a table read:
-- group membership, entitlement, live settlement, assignment precedence, and
-- preference visibility are all rederived at read time. Every failed check
-- returns NULL without revealing whether a preference exists.
CREATE OR REPLACE FUNCTION public.expense_resolve_payment_instruction(
  p_actor_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_currency text
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
  v_preference public.expense_payment_preferences%ROWTYPE;
  v_preference_id uuid;
  v_available bigint;
  v_details jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_actor_id IS NULL
     OR p_group_id IS NULL
     OR p_from_member_id IS NULL
     OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_currency IS NULL
     OR p_currency !~ '^[A-Z]{3}$'
     OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN NULL;
  END IF;

  -- FOR SHARE conflicts with every financial/membership mutation's group-row
  -- update lock. The live settlement and both memberships therefore remain
  -- stable until this transaction returns.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR SHARE;
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling')
     OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN NULL;
  END IF;

  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_from_member_id
    AND member.status = 'active';
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_to_member_id
    AND member.status = 'active';
  IF v_from.id IS NULL
     OR v_to.id IS NULL
     OR v_from.user_id IS DISTINCT FROM p_actor_id
     OR v_to.user_id IS NULL
     OR NOT public.expense_has_beta_access(v_to.user_id) THEN
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

  -- Shared lock order: group row, preference-owner advisory lock (9602), then
  -- assignment/preference rows. Save/deactivate never take a group row lock;
  -- account deletion takes groups before 9602. No reverse edge exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_to.user_id::text, 9602)
  );
  IF NOT public.expense_has_beta_access(p_actor_id)
     OR NOT public.expense_has_beta_access(v_to.user_id) THEN
    RETURN NULL;
  END IF;

  -- Select exactly one matching scope. A matching NULL, missing, private,
  -- inactive, or currency-incompatible preference suppresses broader scopes.
  SELECT assignment.preference_id INTO v_preference_id
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
  LIMIT 1
  FOR SHARE;
  IF v_preference_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT preference.* INTO v_preference
  FROM public.expense_payment_preferences AS preference
  WHERE preference.id = v_preference_id
    AND preference.owner_user_id = v_to.user_id
  FOR SHARE;
  IF v_preference.id IS NULL
     OR NOT v_preference.active
     OR v_preference.visibility <> 'debt_context'
     OR (
       v_preference.supported_currencies IS NOT NULL
       AND NOT (p_currency = ANY(v_preference.supported_currencies))
     ) THEN
    RETURN NULL;
  END IF;

  -- Mirror PAYMENT_DETAIL_KEYS_BY_KIND before the snapshot crosses the RPC
  -- boundary, even though the stored object has its own global allowlist.
  SELECT coalesce(jsonb_object_agg(detail.key, detail.value), '{}'::jsonb)
  INTO v_details
  FROM jsonb_each(v_preference.details) AS detail(key, value)
  WHERE detail.key = ANY(CASE v_preference.kind
    WHEN 'bank_account' THEN ARRAY[
      'accountNumber', 'nationalId', 'instructions', 'defaultReference'
    ]::text[]
    WHEN 'payment_app_phone' THEN ARRAY[
      'phoneNumber', 'instructions', 'defaultReference'
    ]::text[]
    WHEN 'payment_link' THEN ARRAY['paymentLink', 'instructions']::text[]
    WHEN 'cash' THEN ARRAY['instructions']::text[]
    WHEN 'other' THEN ARRAY['instructions']::text[]
    ELSE ARRAY[]::text[]
  END);

  v_snapshot := jsonb_build_object(
    'title', v_preference.title,
    'kind', v_preference.kind,
    'currency', p_currency,
    'details', v_details,
    'visibility', 'debt_context',
    'captured_at', now(),
    'owner_user_id', v_preference.owner_user_id,
    'source_preference_id', v_preference.id,
    'source_version', v_preference.version
  );
  IF NOT public.expense_valid_payment_snapshot(v_snapshot) THEN
    RETURN NULL;
  END IF;
  RETURN v_snapshot;
END;
$$;

-- Resolve stored notification activity IDs at click time. Snapshotted audience
-- is necessary but never sufficient: current membership and current entity
-- ownership are rechecked. A still-invited recipient resolves only the matching
-- invitation to the consent route; acceptance canonicalizes it to the group.
-- Declined, left, and removed members receive no target, and every other entity
-- requires current active membership.
CREATE OR REPLACE FUNCTION public.expense_resolve_recent_targets(
  p_actor_id uuid,
  p_activity_ids uuid[]
)
RETURNS TABLE (activity_id uuid, href text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.expense_has_beta_access(p_actor_id)
     OR p_activity_ids IS NULL
     OR cardinality(p_activity_ids) > 100
     OR array_position(p_activity_ids, NULL) IS NOT NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    activity.id,
    CASE activity.entity_type
      WHEN 'expense' THEN
        '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || activity.entity_id::text
      WHEN 'expense_repayment' THEN
        '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/' || activity.entity_id::text
      WHEN 'expense_group_invitation' THEN CASE membership.status
        WHEN 'invited' THEN
          '/auth-mvp/utlagt-og-endurgreitt/bod/' || activity.group_id::text
        WHEN 'active' THEN
          '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
        ELSE NULL
      END
      WHEN 'expense_group' THEN
        '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
      ELSE NULL
    END AS href
  FROM public.expense_activity AS activity
  JOIN public.expense_activity_audience AS audience
    ON audience.activity_id = activity.id
   AND audience.user_id = p_actor_id
  JOIN public.expense_group_members AS membership
    ON membership.group_id = activity.group_id
   AND membership.user_id = p_actor_id
   AND membership.status IN ('invited', 'active')
  WHERE activity.id = ANY(p_activity_ids)
    AND activity.group_id IS NOT NULL
    AND activity.entity_type <> 'payment_preference'
    AND (
      (activity.entity_type = 'expense_group_invitation'
        AND membership.status IN ('invited', 'active'))
      OR
      (activity.entity_type <> 'expense_group_invitation'
        AND membership.status = 'active')
    )
    AND CASE activity.entity_type
      WHEN 'expense' THEN EXISTS (
        SELECT 1 FROM public.expenses AS expense
        WHERE expense.id = activity.entity_id
          AND expense.group_id = activity.group_id
      )
      WHEN 'expense_repayment' THEN EXISTS (
        SELECT 1 FROM public.expense_repayments AS repayment
        WHERE repayment.id = activity.entity_id
          AND repayment.group_id = activity.group_id
      )
      WHEN 'expense_group_invitation' THEN activity.entity_id = activity.group_id
      WHEN 'expense_group' THEN activity.entity_id = activity.group_id
      ELSE false
    END
  ORDER BY activity.sequence_no;
END;
$$;

-- Account-deletion preparation removes private/sensitive expense data and all
-- notification projections while retaining the minimum shared ledger/audit
-- snapshots other members rely on. The auth.users deletion itself is separate.
CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_preferences integer := 0;
  v_snapshots integer := 0;
  v_members integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );

  SELECT account.email INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_user_id;

  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email)
        = public.normalize_email_canonical(v_email);
  END IF;

  -- Match the financial mutation lock order before unlinking any party.
  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  JOIN public.expense_group_members AS member
    ON member.group_id = group_row.id
  WHERE member.user_id = p_user_id
  ORDER BY group_row.id
  FOR UPDATE OF group_row;

  -- Match repayment snapshot ordering: group rows precede the separate
  -- preference-owner lock. This also serializes preference hard deletion with
  -- save, deactivate, and repayment snapshot creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9602)
  );

  DELETE FROM public.expense_payment_preferences AS preference
  WHERE preference.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_preferences = ROW_COUNT;

  UPDATE public.expense_repayments AS repayment
  SET payment_preference_snapshot = NULL
  WHERE repayment.payment_preference_snapshot->>'owner_user_id' = p_user_id::text;
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  DELETE FROM public.recent_events AS event
  WHERE event.source = 'expenses'
    AND (
      event.user_id = p_user_id
      OR event.payload->>'actorUserId' = p_user_id::text
    );
  DELETE FROM public.expense_activity_audience AS audience
  WHERE audience.user_id = p_user_id;
  DELETE FROM public.expense_mutation_requests AS request
  WHERE request.actor_user_id = p_user_id;

  UPDATE public.expense_activity AS activity
  SET actor_user_id = NULL,
      actor_display_name = 'Teskeiðarnotandi'
  WHERE activity.actor_user_id = p_user_id;
  UPDATE public.expense_repayments AS repayment
  SET reported_by = NULL
  WHERE repayment.reported_by = p_user_id;
  UPDATE public.expenses AS expense
  SET created_by = NULL
  WHERE expense.created_by = p_user_id;
  UPDATE public.expense_groups AS group_row
  SET created_by = NULL
  WHERE group_row.created_by = p_user_id;

  UPDATE public.expense_group_members AS member
  SET user_id = NULL,
      status = CASE
        WHEN member.status IN ('invited', 'declined') THEN 'removed'
        ELSE member.status
      END
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  RETURN jsonb_build_object(
    'preferences_removed', v_preferences,
    'snapshots_removed', v_snapshots,
    'parties_unlinked', v_members
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function grants. Every mutation and resolver is service-role-only. Internal
-- helpers remain private to SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.expense_valid_currency_array(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_valid_payment_details(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_valid_payment_snapshot(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_has_beta_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_assert_beta_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_active_member_role(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_begin_request(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_finish_request(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_group_balances(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_simplified_settlement(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_record_activity(
  uuid, uuid, text, text, uuid, text, text, text, uuid[], boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_member_can_exit(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expense_create_group(
  uuid, uuid, text, text, text, text, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_create_expense(
  uuid, uuid, uuid, uuid, text, bigint, text, date, text, text,
  text, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_add_group_member(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_respond_group_invitation(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_leave_group(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_remove_group_member(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_cancel_expense(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_set_group_status(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_report_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_transition_repayment(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_save_payment_preference(
  uuid, uuid, bigint, uuid, text, text, text[], jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_deactivate_payment_preference(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_payment_instruction(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_recent_targets(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_create_group(
  uuid, uuid, text, text, text, text, boolean, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_create_expense(
  uuid, uuid, uuid, uuid, text, bigint, text, date, text, text,
  text, jsonb, jsonb, jsonb, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_add_group_member(uuid, uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_respond_group_invitation(uuid, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_leave_group(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_remove_group_member(uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_cancel_expense(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_set_group_status(uuid, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_report_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_transition_repayment(uuid, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_save_payment_preference(
  uuid, uuid, bigint, uuid, text, text, text[], jsonb, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_deactivate_payment_preference(
  uuid, uuid, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_payment_instruction(
  uuid, uuid, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_recent_targets(uuid, uuid[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_prepare_account_deletion(uuid)
  TO service_role;

COMMENT ON TABLE public.expense_group_members IS
  'Durable expense parties. user_id is a nullable auth link; guest/display snapshots survive account deletion.';
COMMENT ON TABLE public.expense_obligations IS
  'Immutable settlement obligation created from a locked, server-derived current settlement at report time.';
COMMENT ON TABLE public.expense_activity IS
  'Append-only bounded audit metadata. Financial amounts, notes, emails, member lists, and payment details are forbidden.';
COMMENT ON TABLE public.expense_payment_preferences IS
  'Private bounded payment details; only debt-context snapshots may be copied into repayments.';

COMMIT;

-- Recovery is intentionally a separately reviewed operation. It must drop RPCs
-- before tables and restore the feature_access/recent_events constraints to the
-- exact union present in the target environment. No rollback is run here.
