-- Migration 123: atomic bilateral settlement batches
-- Additive. DO NOT RUN automatically. Stebbi runs database migrations manually.
--
-- A batch may contain:
--   * external_payment legs from the proposer to the counterparty; and
--   * two matched debt_offset directions for a full bilateral offset.
--
-- Every leg is a normal reported repayment reservation. The counterparty
-- confirms or rejects the whole batch atomically; the proposer may cancel it.
-- No browser role receives direct table access.

BEGIN;

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_batch_table regclass;
  v_item_table regclass;
  v_metadata_column_count integer;
  v_sql123_function_count integer;
  v_sql123_trigger_count integer;
BEGIN
  IF pg_catalog.to_regclass('public.expense_groups') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_groups');
  END IF;
  IF pg_catalog.to_regclass('public.expense_group_members') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_group_members');
  END IF;
  IF pg_catalog.to_regclass('public.expense_obligations') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_obligations');
  END IF;
  IF pg_catalog.to_regclass('public.expense_repayments') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_repayments');
  END IF;
  IF pg_catalog.to_regclass('public.expense_repayment_allocations') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_repayment_allocations');
  END IF;
  IF pg_catalog.to_regclass('public.expense_payment_profiles_v2') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_payment_profiles_v2');
  END IF;
  IF pg_catalog.to_regclass('public.expense_activity') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_activity');
  END IF;
  IF pg_catalog.to_regclass('public.expense_activity_audience') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_activity_audience');
  END IF;
  IF pg_catalog.to_regclass('public.profiles') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'profiles');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_simplified_settlement(uuid,text,boolean)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_simplified_settlement');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_begin_request(uuid,uuid,text,text)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_begin_request');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_finish_request(uuid,uuid,jsonb)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_finish_request');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_assert_beta_actor(uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_assert_beta_actor');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_has_beta_access(uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_has_beta_access');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_reported_repayments_need_review(uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_reported_repayments_need_review'
    );
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_actor_can_act_for_share_member'
    );
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_resolve_payment_profile_v2');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_valid_payment_envelope(jsonb)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_valid_payment_envelope');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_attach_encrypted_payment_snapshot()'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(
      v_missing, 'expense_attach_encrypted_payment_snapshot'
    );
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_touch_updated_at()'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_touch_updated_at');
  END IF;

  IF pg_catalog.cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'expense_123_missing_dependencies: %',
      pg_catalog.array_to_string(v_missing, ', ');
  END IF;

  v_batch_table := pg_catalog.to_regclass('public.expense_settlement_batches');
  v_item_table := pg_catalog.to_regclass('public.expense_settlement_batch_items');
  SELECT pg_catalog.count(*)::integer
  INTO v_metadata_column_count
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND column_row.table_name = 'expense_repayments'
    AND column_row.column_name IN (
      'settlement_batch_id', 'settlement_method', 'settlement_sequence'
    );

  SELECT pg_catalog.count(*)::integer
  INTO v_sql123_function_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'expense_guard_settlement_batch_mutation',
      'expense_guard_settlement_batch_item_mutation',
      'expense_guard_batch_repayment_mutation',
      'expense_lock_payment_profile_owner',
      'expense_record_settlement_batch_activity',
      'expense_insert_settlement_batch_item',
      'expense_propose_settlement_batch',
      'expense_transition_settlement_batch',
      'expense_cancel_batches_before_user_unlink'
    );

  SELECT pg_catalog.count(*)::integer
  INTO v_sql123_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE NOT trigger_row.tgisinternal
    AND trigger_row.tgname IN (
      'expense_settlement_batches_touch_updated_at',
      'expense_settlement_batches_immutable_guard',
      'expense_settlement_batch_items_immutable_guard',
      'expense_repayments_batch_guard',
      'expense_payment_profiles_v2_owner_lock',
      'expense_group_members_cancel_batches_before_unlink'
    );

  -- SQL123 has not shipped, so there is no authoritative applied-version
  -- marker that can distinguish a safe rerun from an incomplete draft. Fail
  -- closed on every known artifact instead of repairing unknown live state.
  IF v_batch_table IS NOT NULL
     OR v_item_table IS NOT NULL
     OR v_metadata_column_count <> 0
     OR v_sql123_function_count <> 0
     OR v_sql123_trigger_count <> 0 THEN
    RAISE EXCEPTION
      'expense_123_partial_state_detected: follow recovery notes before rerun';
  END IF;

  -- SQL107 is a hard dependency. Require the exact critical column types and
  -- nullability used by profile comparison and encrypted repayment snapshots.
  IF EXISTS (
    WITH required(
      table_name, column_name, udt_schema, udt_name, is_nullable
    ) AS (VALUES
      ('expense_payment_profiles_v2', 'id', 'pg_catalog', 'uuid', 'NO'),
      ('expense_payment_profiles_v2', 'owner_user_id', 'pg_catalog', 'uuid', 'NO'),
      ('expense_payment_profiles_v2', 'encrypted_details', 'pg_catalog', 'jsonb', 'NO'),
      ('expense_payment_profiles_v2', 'payload_fingerprint', 'pg_catalog', 'text', 'NO'),
      ('expense_payment_profiles_v2', 'version', 'pg_catalog', 'int8', 'NO'),
      ('expense_repayments', 'payment_profile_encrypted_snapshot',
        'pg_catalog', 'jsonb', 'YES')
    )
    SELECT 1
    FROM required
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS column_row
      WHERE column_row.table_schema = 'public'
        AND column_row.table_name = required.table_name
        AND column_row.column_name = required.column_name
        AND column_row.udt_schema = required.udt_schema
        AND column_row.udt_name = required.udt_name
        AND column_row.is_nullable = required.is_nullable
    )
  ) THEN
    RAISE EXCEPTION 'expense_123_incompatible_sql107_columns';
  END IF;

  -- Pin every SQL107 key/check that SQL123 relies on to the expected type,
  -- validated state and participating column.
  IF EXISTS (
    WITH required(
      relation_id, constraint_name, constraint_type, column_name
    ) AS (VALUES
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_pkey', 'p'::"char", 'id'),
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_owner_unique', 'u'::"char", 'owner_user_id'),
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_owner_user_id_fkey', 'f'::"char", 'owner_user_id'),
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_envelope_check', 'c'::"char", 'encrypted_details'),
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_fingerprint_check', 'c'::"char", 'payload_fingerprint'),
      (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
        'expense_payment_profiles_v2_version_check', 'c'::"char", 'version'),
      (pg_catalog.to_regclass('public.expense_repayments'),
        'expense_repayments_encrypted_snapshot_check', 'c'::"char",
        'payment_profile_encrypted_snapshot')
    )
    SELECT 1
    FROM required
    WHERE required.relation_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = required.relation_id
        AND constraint_row.conname = required.constraint_name
        AND constraint_row.contype = required.constraint_type
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND ARRAY(
          SELECT attribute.attname::text
          FROM pg_catalog.unnest(constraint_row.conkey) AS key_column(attnum)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.conrelid
           AND attribute.attnum = key_column.attnum
        ) = ARRAY[required.column_name]::text[]
    )
  ) THEN
    RAISE EXCEPTION 'expense_123_incompatible_sql107_constraints';
  END IF;

  -- The profile owner FK must retain canonical auth ownership and account
  -- deletion cascade semantics.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
        'public.expense_payment_profiles_v2'
      )
      AND constraint_row.conname = 'expense_payment_profiles_v2_owner_user_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.convalidated
      AND constraint_row.confrelid = pg_catalog.to_regclass('auth.users')
      AND constraint_row.confdeltype = 'c'
      AND constraint_row.confupdtype = 'a'
      AND constraint_row.confmatchtype = 's'
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.confkey) AS key_column(attnum)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid
         AND attribute.attnum = key_column.attnum
      ) = ARRAY['id']::text[]
  ) THEN
    RAISE EXCEPTION 'expense_123_incompatible_sql107_owner_fk';
  END IF;

  -- Require SQL107's exact enabled BEFORE INSERT ROW trigger before replacing
  -- its function body with the debt-offset-aware implementation below.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.expense_repayments')
      AND trigger_row.tgname = 'expense_repayments_encrypted_snapshot'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.expense_attach_encrypted_payment_snapshot()'
      )
      AND trigger_row.tgtype = 7
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'expense_123_incompatible_encrypted_snapshot_trigger';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.expense_settlement_batches (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  counterparty_user_id     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  currency                 text        NOT NULL,
  gross_payable_minor      bigint      NOT NULL,
  gross_receivable_minor   bigint      NOT NULL,
  offset_minor             bigint      NOT NULL,
  cash_minor               bigint      NOT NULL,
  expected_profile_id      uuid        NULL,
  expected_profile_version bigint      NULL,
  expected_profile_state_token text    NULL,
  occurred_on              date        NOT NULL,
  note                     text        NULL,
  status                   text        NOT NULL DEFAULT 'proposed',
  resolved_by_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz NULL,

  CONSTRAINT expense_settlement_batches_distinct_users_check CHECK (
    proposed_by_user_id IS NULL
    OR counterparty_user_id IS NULL
    OR proposed_by_user_id <> counterparty_user_id
  ),
  CONSTRAINT expense_settlement_batches_currency_check CHECK (
    currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT expense_settlement_batches_amounts_check CHECK (
    gross_payable_minor BETWEEN 1 AND 9007199254740991
    AND gross_receivable_minor BETWEEN 0 AND 9007199254740991
    AND offset_minor BETWEEN 0 AND 9007199254740991
    AND cash_minor BETWEEN 0 AND 9007199254740991
    AND offset_minor <= LEAST(
      gross_payable_minor, gross_receivable_minor
    )
    AND cash_minor <= gross_payable_minor - offset_minor
    AND offset_minor + cash_minor BETWEEN 1 AND 9007199254740991
  ),
  CONSTRAINT expense_settlement_batches_note_check CHECK (
    note IS NULL OR char_length(note) <= 1000
  ),
  CONSTRAINT expense_settlement_batches_profile_expectation_check CHECK (
    (
      expected_profile_id IS NULL
      AND expected_profile_version IS NULL
      AND expected_profile_state_token IS NULL
    )
    OR (
      cash_minor > 0
      AND expected_profile_id IS NOT NULL
      AND expected_profile_version IS NOT NULL
      AND expected_profile_version > 0
      AND expected_profile_state_token IS NOT NULL
      AND expected_profile_state_token ~ '^[0-9a-f]{32}$'
    )
  ),
  CONSTRAINT expense_settlement_batches_status_check CHECK (
    status IN ('proposed', 'confirmed', 'rejected', 'cancelled')
  ),
  CONSTRAINT expense_settlement_batches_resolution_check CHECK (
    (
      status = 'proposed'
      AND resolved_at IS NULL
      AND resolved_by_user_id IS NULL
    )
    OR (
      status IN ('confirmed', 'rejected', 'cancelled')
      AND resolved_at IS NOT NULL
    )
  )
);

ALTER TABLE public.expense_repayments
  ADD COLUMN IF NOT EXISTS settlement_batch_id uuid NULL,
  ADD COLUMN IF NOT EXISTS settlement_method text NULL,
  ADD COLUMN IF NOT EXISTS settlement_sequence integer NULL;

DO $repayment_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.expense_repayments'::regclass
      AND constraint_row.conname = 'expense_repayments_settlement_batch_fk'
  ) THEN
    ALTER TABLE public.expense_repayments
      ADD CONSTRAINT expense_repayments_settlement_batch_fk
      FOREIGN KEY (settlement_batch_id)
      REFERENCES public.expense_settlement_batches(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.expense_repayments'::regclass
      AND constraint_row.conname = 'expense_repayments_settlement_metadata_check'
  ) THEN
    ALTER TABLE public.expense_repayments
      ADD CONSTRAINT expense_repayments_settlement_metadata_check CHECK (
        (
          settlement_batch_id IS NULL
          AND settlement_method IS NULL
          AND settlement_sequence IS NULL
        )
        OR (
          settlement_batch_id IS NOT NULL
          AND settlement_method IS NOT NULL
          AND settlement_sequence IS NOT NULL
          AND settlement_method IN ('external_payment', 'debt_offset')
          AND settlement_sequence > 0
        )
      ) NOT VALID;
    ALTER TABLE public.expense_repayments
      VALIDATE CONSTRAINT expense_repayments_settlement_metadata_check;
  END IF;
END;
$repayment_constraints$;

CREATE TABLE IF NOT EXISTS public.expense_settlement_batch_items (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                 uuid        NOT NULL,
  sequence_no              integer     NOT NULL,
  group_id                 uuid        NOT NULL,
  from_member_id           uuid        NOT NULL,
  to_member_id             uuid        NOT NULL,
  method                   text        NOT NULL,
  amount_minor             bigint      NOT NULL,
  repayment_id             uuid        NOT NULL,
  obligation_id            uuid        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_settlement_batch_items_batch_fk
    FOREIGN KEY (batch_id)
    REFERENCES public.expense_settlement_batches(id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_group_fk
    FOREIGN KEY (group_id)
    REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_from_member_fk
    FOREIGN KEY (group_id, from_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_to_member_fk
    FOREIGN KEY (group_id, to_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_repayment_fk
    FOREIGN KEY (group_id, repayment_id)
    REFERENCES public.expense_repayments(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_obligation_fk
    FOREIGN KEY (group_id, obligation_id)
    REFERENCES public.expense_obligations(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_settlement_batch_items_distinct_members_check CHECK (
    from_member_id <> to_member_id
  ),
  CONSTRAINT expense_settlement_batch_items_method_check CHECK (
    method IN ('external_payment', 'debt_offset')
  ),
  CONSTRAINT expense_settlement_batch_items_amount_check CHECK (
    amount_minor BETWEEN 1 AND 9007199254740991
  ),
  CONSTRAINT expense_settlement_batch_items_sequence_check CHECK (
    sequence_no > 0
  ),
  CONSTRAINT expense_settlement_batch_items_batch_sequence_unique
    UNIQUE (batch_id, sequence_no),
  CONSTRAINT expense_settlement_batch_items_repayment_unique
    UNIQUE (repayment_id),
  CONSTRAINT expense_settlement_batch_items_obligation_unique
    UNIQUE (obligation_id)
);

CREATE INDEX IF NOT EXISTS expense_settlement_batches_proposer_status_idx
  ON public.expense_settlement_batches (proposed_by_user_id, status, created_at DESC)
  WHERE proposed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_settlement_batches_counterparty_status_idx
  ON public.expense_settlement_batches (counterparty_user_id, status, created_at DESC)
  WHERE counterparty_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_repayments_settlement_batch_idx
  ON public.expense_repayments (settlement_batch_id, settlement_sequence)
  WHERE settlement_batch_id IS NOT NULL;

DROP TRIGGER IF EXISTS expense_settlement_batches_touch_updated_at
  ON public.expense_settlement_batches;
CREATE TRIGGER expense_settlement_batches_touch_updated_at
  BEFORE UPDATE ON public.expense_settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

-- Preserve every existing activity value from migration 114 and add bounded,
-- amount-free batch activity. Batch events are private group audit only and
-- are deliberately not projected to recent_events.
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_entity_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_entity_type_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_type_check;

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_type_check CHECK (event_type IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_member_renamed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled',
    'expense_member_invitation_received', 'expense_member_invitation_accepted',
    'expense_member_invitation_declined', 'expense_member_invitation_cancelled',
    'expense_payment_preference_saved', 'expense_payment_preference_deactivated',
    'expense_share_collaborator_added', 'expense_share_collaborator_linked',
    'expense_share_collaborator_removed',
    'expense_settlement_batch_proposed', 'expense_settlement_batch_confirmed',
    'expense_settlement_batch_rejected', 'expense_settlement_batch_cancelled'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_entity_type_check CHECK (entity_type IN (
    'expense', 'expense_group', 'expense_group_invitation',
    'expense_member_invitation', 'expense_repayment', 'payment_preference',
    'expense_settlement_batch'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_entity_check CHECK (
    (event_type IN (
        'expense_created', 'expense_updated', 'expense_cancelled',
        'expense_group_member_renamed',
        'expense_share_collaborator_added', 'expense_share_collaborator_linked',
        'expense_share_collaborator_removed'
      )
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
        'expense_member_invitation_received', 'expense_member_invitation_accepted',
        'expense_member_invitation_declined', 'expense_member_invitation_cancelled'
      )
      AND entity_type = 'expense_member_invitation'
      AND group_id IS NOT NULL AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_repayment_reported', 'expense_repayment_confirmed',
        'expense_repayment_rejected', 'expense_repayment_cancelled'
      )
      AND entity_type = 'expense_repayment' AND group_id IS NOT NULL
      AND (expense_title IS NOT NULL OR group_title IS NOT NULL))
    OR (event_type IN (
        'expense_payment_preference_saved', 'expense_payment_preference_deactivated'
      )
      AND entity_type = 'payment_preference' AND group_id IS NULL
      AND expense_title IS NULL AND group_title IS NULL)
    OR (event_type IN (
        'expense_settlement_batch_proposed', 'expense_settlement_batch_confirmed',
        'expense_settlement_batch_rejected', 'expense_settlement_batch_cancelled'
      )
      AND entity_type = 'expense_settlement_batch'
      AND group_id IS NOT NULL AND group_title IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.expense_guard_settlement_batch_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expense_settlement_batch_immutable';
  END IF;

  IF OLD.id <> NEW.id
     OR OLD.currency <> NEW.currency
     OR OLD.gross_payable_minor <> NEW.gross_payable_minor
     OR OLD.gross_receivable_minor <> NEW.gross_receivable_minor
     OR OLD.offset_minor <> NEW.offset_minor
     OR OLD.cash_minor <> NEW.cash_minor
     OR OLD.expected_profile_id IS DISTINCT FROM NEW.expected_profile_id
     OR OLD.expected_profile_version IS DISTINCT FROM NEW.expected_profile_version
     OR OLD.expected_profile_state_token IS DISTINCT FROM NEW.expected_profile_state_token
     OR OLD.occurred_on <> NEW.occurred_on
     OR OLD.note IS DISTINCT FROM NEW.note
     OR OLD.created_at <> NEW.created_at
     OR (
       OLD.proposed_by_user_id IS DISTINCT FROM NEW.proposed_by_user_id
       AND NEW.proposed_by_user_id IS NOT NULL
     )
     OR (
       OLD.counterparty_user_id IS DISTINCT FROM NEW.counterparty_user_id
       AND NEW.counterparty_user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'expense_settlement_batch_immutable';
  END IF;

  IF OLD.status IN ('confirmed', 'rejected', 'cancelled')
     AND (
       NEW.status <> OLD.status
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR (
         OLD.resolved_by_user_id IS DISTINCT FROM NEW.resolved_by_user_id
         AND NEW.resolved_by_user_id IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'expense_settlement_batch_terminal';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       OLD.status = 'proposed'
       AND NEW.status IN ('confirmed', 'rejected', 'cancelled')
       AND NEW.resolved_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'expense_settlement_batch_transition_invalid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_settlement_batches_immutable_guard
  ON public.expense_settlement_batches;
CREATE TRIGGER expense_settlement_batches_immutable_guard
  BEFORE UPDATE OR DELETE ON public.expense_settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.expense_guard_settlement_batch_mutation();

CREATE OR REPLACE FUNCTION public.expense_guard_settlement_batch_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'expense_settlement_batch_item_immutable';
END;
$$;

DROP TRIGGER IF EXISTS expense_settlement_batch_items_immutable_guard
  ON public.expense_settlement_batch_items;
CREATE TRIGGER expense_settlement_batch_items_immutable_guard
  BEFORE UPDATE OR DELETE ON public.expense_settlement_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.expense_guard_settlement_batch_item_mutation();

CREATE OR REPLACE FUNCTION public.expense_guard_batch_repayment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authorized_batch text;
BEGIN
  IF OLD.settlement_batch_id IS NULL THEN
    IF NEW.settlement_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'expense_settlement_batch_link_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.settlement_batch_id IS DISTINCT FROM OLD.settlement_batch_id
     OR NEW.settlement_method IS DISTINCT FROM OLD.settlement_method
     OR NEW.settlement_sequence IS DISTINCT FROM OLD.settlement_sequence THEN
    RAISE EXCEPTION 'expense_settlement_batch_link_immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_authorized_batch := pg_catalog.current_setting(
      'teskeid.expense_settlement_batch_transition', true
    );
    IF v_authorized_batch IS DISTINCT FROM OLD.settlement_batch_id::text THEN
      RAISE EXCEPTION 'expense_repayment_batch_managed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_repayments_batch_guard
  ON public.expense_repayments;
CREATE TRIGGER expense_repayments_batch_guard
  BEFORE UPDATE ON public.expense_repayments
  FOR EACH ROW EXECUTE FUNCTION public.expense_guard_batch_repayment_mutation();

-- Do not retain payment-profile data on a pure accounting offset. External
-- payment legs retain the encrypted v2 snapshot behavior from migration 107.
CREATE OR REPLACE FUNCTION public.expense_attach_encrypted_payment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_profile public.expense_payment_profiles_v2%ROWTYPE;
BEGIN
  IF NEW.settlement_method = 'debt_offset' THEN
    NEW.payment_preference_snapshot := NULL;
    NEW.payment_profile_encrypted_snapshot := NULL;
    RETURN NEW;
  END IF;

  SELECT member.user_id INTO v_owner_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = NEW.group_id
    AND member.id = NEW.to_member_id
    AND member.status = 'active';

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.expense_payment_profiles_v2 AS profile
  WHERE profile.owner_user_id = v_owner_id;

  IF v_profile.id IS NOT NULL THEN
    NEW.payment_profile_encrypted_snapshot := pg_catalog.jsonb_build_object(
      'profile_id', v_profile.id,
      'owner_user_id', v_profile.owner_user_id,
      'profile_version', v_profile.version,
      'captured_at', pg_catalog.now(),
      'envelope', v_profile.encrypted_details
    );
    NEW.payment_preference_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Migration 107's v2 writers use actor idempotency but did not participate in
-- the profile-owner lock used by repayment snapshot readers. Put the lock on
-- the table itself so save, clear, conversion, account deletion and any future
-- writer all serialize with cash-leg snapshot capture.
CREATE OR REPLACE FUNCTION public.expense_lock_payment_profile_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_user_id uuid;
BEGIN
  v_owner_user_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.owner_user_id
    ELSE NEW.owner_user_id
  END;
  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_user_id::text, 9602)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_payment_profiles_v2_owner_lock
  ON public.expense_payment_profiles_v2;
CREATE TRIGGER expense_payment_profiles_v2_owner_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_payment_profiles_v2
  FOR EACH ROW EXECUTE FUNCTION public.expense_lock_payment_profile_owner();

-- Extend SQL122's exact current-debtor resolver with an opaque ABA-resistant
-- state token. The token contains no payment detail and changes when the
-- profile identity, monotonic version or payload fingerprint changes.
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
    'state_token', pg_catalog.md5(pg_catalog.concat_ws(
      '|', v_profile.id::text, v_profile.version::text,
      v_profile.payload_fingerprint
    )),
    'envelope', v_profile.encrypted_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_record_settlement_batch_activity(
  p_group_id uuid,
  p_actor_id uuid,
  p_batch_id uuid,
  p_event_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := gen_random_uuid();
  v_actor_display_name text;
  v_group_name text;
BEGIN
  IF p_event_type NOT IN (
    'expense_settlement_batch_proposed',
    'expense_settlement_batch_confirmed',
    'expense_settlement_batch_rejected',
    'expense_settlement_batch_cancelled'
  ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  SELECT group_row.name INTO v_group_name
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id;
  IF v_group_name IS NULL THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;

  SELECT member.display_name INTO v_actor_display_name
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.user_id = p_actor_id
  ORDER BY CASE member.status WHEN 'active' THEN 0 ELSE 1 END, member.created_at DESC
  LIMIT 1;
  IF v_actor_display_name IS NULL THEN
    SELECT NULLIF(btrim(profile.display_name), '') INTO v_actor_display_name
    FROM public.profiles AS profile
    WHERE profile.id = p_actor_id;
  END IF;
  v_actor_display_name := coalesce(v_actor_display_name, 'Teskeiðarnotandi');

  INSERT INTO public.expense_activity (
    id, group_id, event_type, entity_type, entity_id, summary_code,
    actor_user_id, actor_display_name, expense_title, group_title
  ) VALUES (
    v_activity_id, p_group_id, p_event_type, 'expense_settlement_batch',
    p_batch_id, p_event_type, p_actor_id, v_actor_display_name, NULL, v_group_name
  );

  INSERT INTO public.expense_activity_audience (activity_id, user_id)
  SELECT v_activity_id, audience.user_id
  FROM (
    SELECT member.user_id
    FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.status = 'active'
      AND member.user_id IS NOT NULL
    UNION
    SELECT p_actor_id
  ) AS audience
  WHERE audience.user_id IS NOT NULL
    AND public.expense_has_beta_access(audience.user_id)
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_insert_settlement_batch_item(
  p_batch_id uuid,
  p_sequence integer,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_method text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_note text,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_obligation_id uuid := gen_random_uuid();
  v_repayment_id uuid := gen_random_uuid();
BEGIN
  IF p_method IS NULL
     OR p_method NOT IN ('external_payment', 'debt_offset')
     OR p_batch_id IS NULL
     OR p_group_id IS NULL
     OR p_from_member_id IS NULL
     OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_amount_minor IS NULL
     OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_sequence IS NULL OR p_sequence <= 0
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_occurred_on IS NULL
     OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  INSERT INTO public.expense_obligations (
    id, group_id, from_member_id, to_member_id, amount_minor, currency
  ) VALUES (
    v_obligation_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency
  );

  INSERT INTO public.expense_repayments (
    id, group_id, from_member_id, to_member_id, amount_minor, currency,
    occurred_on, note, status, reported_by,
    settlement_batch_id, settlement_method, settlement_sequence
  ) VALUES (
    v_repayment_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency, p_occurred_on,
    CASE WHEN p_method = 'external_payment' THEN NULLIF(btrim(p_note), '') ELSE NULL END,
    'reported', p_actor_id, p_batch_id, p_method, p_sequence
  );

  INSERT INTO public.expense_repayment_allocations (
    group_id, repayment_id, obligation_id, amount_minor
  ) VALUES (
    p_group_id, v_repayment_id, v_obligation_id, p_amount_minor
  );

  INSERT INTO public.expense_settlement_batch_items (
    batch_id, sequence_no, group_id, from_member_id, to_member_id,
    method, amount_minor, repayment_id, obligation_id
  ) VALUES (
    p_batch_id, p_sequence, p_group_id, p_from_member_id, p_to_member_id,
    p_method, p_amount_minor, v_repayment_id, v_obligation_id
  );

  RETURN v_repayment_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.expense_transition_settlement_batch(
  p_actor_id uuid,
  p_batch_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.expense_settlement_batches%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_new_status text;
  v_event_type text;
  v_group_ids uuid[];
  v_group_id uuid;
  v_item_count integer;
  v_reported_count integer;
  v_max_sequence integer;
  v_structure_count integer;
  v_structure_invalid boolean;
  v_external_payment_total numeric;
  v_outgoing_offset_total numeric;
  v_incoming_offset_total numeric;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_batch_id IS NULL
     OR p_request_id IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('confirm', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'batchId', p_batch_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_transition_settlement_batch', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT item.group_id ORDER BY item.group_id)
  INTO v_group_ids
  FROM public.expense_settlement_batch_items AS item
  WHERE item.batch_id = p_batch_id;
  IF v_group_ids IS NULL OR pg_catalog.cardinality(v_group_ids) = 0 THEN
    RAISE EXCEPTION 'expense_settlement_batch_not_found';
  END IF;

  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  WHERE group_row.id = ANY(v_group_ids)
  ORDER BY group_row.id
  FOR UPDATE;

  SELECT batch_row.* INTO v_batch
  FROM public.expense_settlement_batches AS batch_row
  WHERE batch_row.id = p_batch_id
  FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'expense_settlement_batch_not_found';
  END IF;
  IF v_batch.status <> 'proposed' THEN
    RAISE EXCEPTION 'expense_settlement_batch_transition_invalid';
  END IF;
  IF p_action IN ('confirm', 'reject')
     AND v_batch.counterparty_user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_settlement_batch_not_allowed';
  END IF;
  IF p_action = 'cancel'
     AND v_batch.proposed_by_user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_settlement_batch_not_allowed';
  END IF;

  -- Both canonical users must still be active direct members for every item.
  IF EXISTS (
    SELECT 1
    FROM public.expense_settlement_batch_items AS item
    JOIN public.expense_group_members AS from_member
      ON from_member.group_id = item.group_id
     AND from_member.id = item.from_member_id
    JOIN public.expense_group_members AS to_member
      ON to_member.group_id = item.group_id
     AND to_member.id = item.to_member_id
    WHERE item.batch_id = p_batch_id
      AND (
        from_member.status <> 'active'
        OR to_member.status <> 'active'
        OR from_member.user_id IS NULL
        OR to_member.user_id IS NULL
        OR NOT (
          (
            from_member.user_id = v_batch.proposed_by_user_id
            AND to_member.user_id = v_batch.counterparty_user_id
          )
          OR (
            from_member.user_id = v_batch.counterparty_user_id
            AND to_member.user_id = v_batch.proposed_by_user_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'expense_settlement_batch_transition_invalid';
  END IF;

  PERFORM repayment.id
  FROM public.expense_repayments AS repayment
  WHERE repayment.settlement_batch_id = p_batch_id
  ORDER BY repayment.group_id, repayment.settlement_sequence, repayment.id
  FOR UPDATE;

  SELECT
    count(*),
    count(*) FILTER (WHERE repayment.status = 'reported')
  INTO v_item_count, v_reported_count
  FROM public.expense_repayments AS repayment
  WHERE repayment.settlement_batch_id = p_batch_id;
  IF v_item_count <= 0 OR v_reported_count <> v_item_count OR v_item_count <> (
    SELECT count(*)
    FROM public.expense_settlement_batch_items AS item
    WHERE item.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'expense_settlement_batch_transition_invalid';
  END IF;

  IF p_action = 'confirm' THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(v_group_ids) AS affected_group(group_id)
      WHERE public.expense_reported_repayments_need_review(affected_group.group_id)
    ) THEN
      RAISE EXCEPTION 'expense_repayment_review_required';
    END IF;

    SELECT
      count(*)::integer,
      coalesce(max(item.sequence_no), 0),
      coalesce(bool_or(
        repayment.settlement_batch_id IS DISTINCT FROM item.batch_id
        OR repayment.settlement_method IS DISTINCT FROM item.method
        OR repayment.settlement_sequence IS DISTINCT FROM item.sequence_no
        OR repayment.group_id IS DISTINCT FROM item.group_id
        OR repayment.from_member_id IS DISTINCT FROM item.from_member_id
        OR repayment.to_member_id IS DISTINCT FROM item.to_member_id
        OR repayment.amount_minor IS DISTINCT FROM item.amount_minor
        OR repayment.currency IS DISTINCT FROM v_batch.currency
        OR repayment.status IS DISTINCT FROM 'reported'
        OR repayment.reported_by IS DISTINCT FROM v_batch.proposed_by_user_id
        OR obligation.group_id IS DISTINCT FROM item.group_id
        OR obligation.from_member_id IS DISTINCT FROM item.from_member_id
        OR obligation.to_member_id IS DISTINCT FROM item.to_member_id
        OR obligation.amount_minor IS DISTINCT FROM item.amount_minor
        OR obligation.currency IS DISTINCT FROM v_batch.currency
        OR allocation.group_id IS DISTINCT FROM item.group_id
        OR allocation.repayment_id IS DISTINCT FROM item.repayment_id
        OR allocation.obligation_id IS DISTINCT FROM item.obligation_id
        OR allocation.amount_minor IS DISTINCT FROM item.amount_minor
        OR (
          item.method = 'external_payment'
          AND (
            from_member.user_id IS DISTINCT FROM v_batch.proposed_by_user_id
            OR to_member.user_id IS DISTINCT FROM v_batch.counterparty_user_id
          )
        )
      ), false),
      coalesce(sum(item.amount_minor) FILTER (
        WHERE item.method = 'external_payment'
      ), 0),
      coalesce(sum(item.amount_minor) FILTER (
        WHERE item.method = 'debt_offset'
          AND from_member.user_id = v_batch.proposed_by_user_id
          AND to_member.user_id = v_batch.counterparty_user_id
      ), 0),
      coalesce(sum(item.amount_minor) FILTER (
        WHERE item.method = 'debt_offset'
          AND from_member.user_id = v_batch.counterparty_user_id
          AND to_member.user_id = v_batch.proposed_by_user_id
      ), 0)
    INTO
      v_structure_count,
      v_max_sequence,
      v_structure_invalid,
      v_external_payment_total,
      v_outgoing_offset_total,
      v_incoming_offset_total
    FROM public.expense_settlement_batch_items AS item
    JOIN public.expense_repayments AS repayment
      ON repayment.group_id = item.group_id
     AND repayment.id = item.repayment_id
    JOIN public.expense_obligations AS obligation
      ON obligation.group_id = item.group_id
     AND obligation.id = item.obligation_id
    LEFT JOIN public.expense_repayment_allocations AS allocation
      ON allocation.group_id = item.group_id
     AND allocation.repayment_id = item.repayment_id
     AND allocation.obligation_id = item.obligation_id
    JOIN public.expense_group_members AS from_member
      ON from_member.group_id = item.group_id
     AND from_member.id = item.from_member_id
    JOIN public.expense_group_members AS to_member
      ON to_member.group_id = item.group_id
     AND to_member.id = item.to_member_id
    WHERE item.batch_id = p_batch_id;

    IF v_structure_invalid
       OR v_structure_count <> v_item_count
       OR v_max_sequence <> v_item_count
       OR v_external_payment_total <> v_batch.cash_minor
       OR v_outgoing_offset_total <> v_batch.offset_minor
       OR v_incoming_offset_total <> v_batch.offset_minor THEN
      RAISE EXCEPTION 'expense_settlement_batch_transition_invalid';
    END IF;
  END IF;

  v_new_status := CASE p_action
    WHEN 'confirm' THEN 'confirmed'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;
  v_event_type := 'expense_settlement_batch_' || v_new_status;

  PERFORM pg_catalog.set_config(
    'teskeid.expense_settlement_batch_transition', p_batch_id::text, true
  );
  UPDATE public.expense_repayments AS repayment
  SET status = v_new_status
  WHERE repayment.settlement_batch_id = p_batch_id
    AND repayment.status = 'reported';

  UPDATE public.expense_settlement_batches AS batch_row
  SET status = v_new_status,
      resolved_at = now(),
      resolved_by_user_id = p_actor_id
  WHERE batch_row.id = p_batch_id
    AND batch_row.status = 'proposed';

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = ANY(v_group_ids);

  FOREACH v_group_id IN ARRAY v_group_ids LOOP
    PERFORM public.expense_record_settlement_batch_activity(
      v_group_id, p_actor_id, p_batch_id, v_event_type
    );
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'status', v_new_status,
    'group_ids', pg_catalog.to_jsonb(v_group_ids)
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Account deletion/unlinking must never leave reported reservations behind.
-- The canonical account-deletion flow already locks every affected group in
-- ID order before it nulls member.user_id, so this trigger preserves that
-- ordering and atomically cancels any still-proposed batch.
CREATE OR REPLACE FUNCTION public.expense_cancel_batches_before_user_unlink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id uuid;
  v_batch_ids uuid[];
  v_group_ids uuid[];
BEGIN
  IF OLD.user_id IS NULL OR NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve through immutable item/member identity. Batch auth-user FKs may
  -- already have been nulled by an auth.users cascade in either order.
  SELECT pg_catalog.array_agg(DISTINCT item.batch_id ORDER BY item.batch_id)
  INTO v_batch_ids
  FROM public.expense_settlement_batch_items AS item
  JOIN public.expense_settlement_batches AS batch_row
    ON batch_row.id = item.batch_id
   AND batch_row.status = 'proposed'
  WHERE item.group_id = OLD.group_id
    AND (item.from_member_id = OLD.id OR item.to_member_id = OLD.id);
  IF v_batch_ids IS NULL OR pg_catalog.cardinality(v_batch_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT item.group_id ORDER BY item.group_id)
  INTO v_group_ids
  FROM public.expense_settlement_batch_items AS item
  WHERE item.batch_id = ANY(v_batch_ids);

  -- Match every normal settlement path: groups first, then batches, then
  -- repayments. This removes the account-deletion deadlock edge.
  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  WHERE group_row.id = ANY(v_group_ids)
  ORDER BY group_row.id
  FOR UPDATE;

  PERFORM batch_row.id
  FROM public.expense_settlement_batches AS batch_row
  WHERE batch_row.id = ANY(v_batch_ids)
  ORDER BY batch_row.id
  FOR UPDATE;

  SELECT pg_catalog.array_agg(batch_row.id ORDER BY batch_row.id)
  INTO v_batch_ids
  FROM public.expense_settlement_batches AS batch_row
  WHERE batch_row.id = ANY(v_batch_ids)
    AND batch_row.status = 'proposed';
  IF v_batch_ids IS NULL OR pg_catalog.cardinality(v_batch_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT item.group_id ORDER BY item.group_id)
  INTO v_group_ids
  FROM public.expense_settlement_batch_items AS item
  WHERE item.batch_id = ANY(v_batch_ids);

  PERFORM repayment.id
  FROM public.expense_repayments AS repayment
  WHERE repayment.settlement_batch_id = ANY(v_batch_ids)
  ORDER BY repayment.group_id, repayment.settlement_batch_id,
    repayment.settlement_sequence, repayment.id
  FOR UPDATE;

  FOREACH v_batch_id IN ARRAY v_batch_ids LOOP
    PERFORM pg_catalog.set_config(
      'teskeid.expense_settlement_batch_transition', v_batch_id::text, true
    );
    UPDATE public.expense_repayments AS repayment
    SET status = 'cancelled'
    WHERE repayment.settlement_batch_id = v_batch_id
      AND repayment.status = 'reported';
    UPDATE public.expense_settlement_batches AS batch_row
    SET status = 'cancelled', resolved_at = now(), resolved_by_user_id = NULL
    WHERE batch_row.id = v_batch_id
      AND batch_row.status = 'proposed';
  END LOOP;

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = ANY(v_group_ids);

  -- The immutable batch status is the durable cancellation audit. Do not add
  -- an audience row from this BEFORE-unlink trigger: a direct auth.users
  -- cascade may already be deleting the referenced audience user.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_group_members_cancel_batches_before_unlink
  ON public.expense_group_members;
CREATE TRIGGER expense_group_members_cancel_batches_before_unlink
  BEFORE UPDATE OF user_id ON public.expense_group_members
  FOR EACH ROW
  WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
  EXECUTE FUNCTION public.expense_cancel_batches_before_user_unlink();

ALTER TABLE public.expense_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_settlement_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_settlement_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_settlement_batch_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.expense_settlement_batches
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.expense_settlement_batch_items
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.expense_settlement_batches TO service_role;
GRANT SELECT ON public.expense_settlement_batch_items TO service_role;

REVOKE ALL ON FUNCTION public.expense_guard_settlement_batch_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_settlement_batch_item_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_batch_repayment_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_lock_payment_profile_owner()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_record_settlement_batch_activity(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_insert_settlement_batch_item(
  uuid, integer, uuid, uuid, uuid, text, bigint, text, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_cancel_batches_before_user_unlink()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_resolve_payment_profile_v2(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expense_propose_settlement_batch(
  uuid, uuid, uuid, uuid, text, jsonb, uuid, bigint, text, bigint, boolean, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_transition_settlement_batch(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_propose_settlement_batch(
  uuid, uuid, uuid, uuid, text, jsonb, uuid, bigint, text, bigint, boolean, date, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_transition_settlement_batch(
  uuid, uuid, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_payment_profile_v2(
  uuid, uuid, uuid, uuid, text
) TO service_role;

DO $postflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_settlement_batches');
  END IF;
  IF pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_settlement_batch_items');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_propose_settlement_batch');
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.expense_transition_settlement_batch(uuid,uuid,text,uuid)'
  ) IS NULL THEN
    v_missing := pg_catalog.array_append(v_missing, 'expense_transition_settlement_batch');
  END IF;
  IF pg_catalog.cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'expense_123_postflight_failed: %',
      pg_catalog.array_to_string(v_missing, ', ');
  END IF;
END;
$postflight$;

COMMIT;

-- Recovery:
-- * Before COMMIT, any failure rolls the migration back completely.
-- * After COMMIT, do not drop batch rows or repayment links. Disable the UI
--   feature and deploy a forward-only corrective migration.
-- * If the preflight reports the incompatible early draft, first inspect both
--   draft tables for rows. Only an explicitly approved recovery migration may
--   rename/drop an empty draft or transform live rows.
