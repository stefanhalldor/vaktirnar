-- Migration 98: private-beta bookkeeping VAT workbook.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi alone reviews
-- and runs it. Browser roles receive no table or function access. The app must
-- call the service-role-only RPCs below after its own global feature gate and
-- session checks; the database independently repeats entitlement, membership,
-- tenant, lifecycle, version and idempotency checks.
--
-- FEATURE-KEY COMPATIBILITY: the current SQL95, SQL96 feature-key block, and
-- SQL98 preserve the exact expression they find and widen it only for their
-- own key. SQL95 remains separately gated and is not a prerequisite here.
-- Never run stale SQL95/SQL96 copies that hard-replace the shared allowlist.
-- SQL96 as a whole must not be rerun after SQL97, which supersedes its RPCs.

BEGIN;

-- Preserve every key in the target database instead of replacing the union
-- with a hard-coded list that may already be stale.
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
    RAISE EXCEPTION 'bookkeeping_feature_constraint_missing';
  END IF;

  IF v_expression NOT LIKE '%bokhaldid%' THEN
    ALTER TABLE public.feature_access
      DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
      v_expression,
      'bokhaldid'
    );
  END IF;
END;
$feature_key$;

-- Seed only when the slug is absent. Never overwrite admin-managed copy.
INSERT INTO public.ideas (
  title, slug, short_description, problem_description, possible_solution,
  category, status, source, is_public, is_featured
)
VALUES (
  'Bókhaldið',
  'bokhaldid',
  'Einföld VSK-vinnubók fyrir reksturinn.',
  'Það getur verið tímafrekt að taka saman rekjanlegar VSK-tölur úr fylgiskjölum.',
  'Handvirk, einkarekin vinnubók sem tekur saman reiti A–F án þess að senda skil.',
  'Útgjöld',
  'building',
  'seed',
  true,
  false
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Durable tenant, VAT registration, period, entry, filing and audit model.
-- Auth links are nullable snapshots with ON DELETE SET NULL; deleting an auth
-- account can never cascade into retained bookkeeping records.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookkeeping_entities (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name       text        NOT NULL,
  legal_name         text        NULL,
  legal_identifier   text        NULL,
  default_currency   text        NOT NULL DEFAULT 'ISK',
  details_confirmed  boolean     NOT NULL DEFAULT false,
  status             text        NOT NULL DEFAULT 'active',
  version            bigint      NOT NULL DEFAULT 1,
  created_by         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entities_display_name_check
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT bookkeeping_entities_legal_name_check
    CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 1 AND 200),
  CONSTRAINT bookkeeping_entities_legal_identifier_check
    CHECK (legal_identifier IS NULL OR char_length(btrim(legal_identifier)) BETWEEN 1 AND 32),
  CONSTRAINT bookkeeping_entities_currency_check CHECK (default_currency = 'ISK'),
  CONSTRAINT bookkeeping_entities_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT bookkeeping_entities_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS public.bookkeeping_entity_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text        NOT NULL,
  role         text        NOT NULL DEFAULT 'owner',
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entity_members_name_check
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT bookkeeping_entity_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT bookkeeping_entity_members_status_check CHECK (status IN ('active', 'removed', 'unlinked')),
  CONSTRAINT bookkeeping_entity_members_entity_id_id_unique UNIQUE (entity_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bookkeeping_entity_members_user_unique
  ON public.bookkeeping_entity_members (entity_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS bookkeeping_entity_members_owner_unique
  ON public.bookkeeping_entity_members (entity_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS bookkeeping_entity_members_user_idx
  ON public.bookkeeping_entity_members (user_id, status, entity_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bookkeeping_vat_registrations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  vat_number         text        NOT NULL,
  label              text        NULL,
  filing_method      text        NOT NULL,
  details_confirmed  boolean     NOT NULL DEFAULT false,
  active             boolean     NOT NULL DEFAULT true,
  version            bigint      NOT NULL DEFAULT 1,
  created_by         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_vat_registrations_number_check
    CHECK (char_length(btrim(vat_number)) BETWEEN 1 AND 40),
  CONSTRAINT bookkeeping_vat_registrations_label_check
    CHECK (label IS NULL OR char_length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT bookkeeping_vat_registrations_filing_method_check CHECK (
    filing_method IN ('general_bimonthly', 'monthly', 'annual', 'agricultural', 'other')
  ),
  CONSTRAINT bookkeeping_vat_registrations_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_vat_registrations_entity_id_id_unique UNIQUE (entity_id, id),
  CONSTRAINT bookkeeping_vat_registrations_entity_number_unique UNIQUE (entity_id, vat_number)
);

CREATE INDEX IF NOT EXISTS bookkeeping_vat_registrations_entity_active_idx
  ON public.bookkeeping_vat_registrations (entity_id, active, created_at);

CREATE TABLE IF NOT EXISTS public.bookkeeping_periods (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  vat_registration_id      uuid        NOT NULL,
  starts_on                date        NOT NULL,
  ends_on                  date        NOT NULL,
  due_on                   date        NULL,
  state                    text        NOT NULL DEFAULT 'draft',
  period_dates_confirmed   boolean     NOT NULL DEFAULT false,
  live_form_compared       boolean     NOT NULL DEFAULT false,
  version                  bigint      NOT NULL DEFAULT 1,
  submitted_at             timestamptz NULL,
  reopened_at              timestamptz NULL,
  reopen_reason            text        NULL,
  current_payment_state    text        NULL,
  current_paid_on          date        NULL,
  created_by               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_periods_registration_fk
    FOREIGN KEY (entity_id, vat_registration_id)
    REFERENCES public.bookkeeping_vat_registrations(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_periods_dates_check CHECK (starts_on <= ends_on),
  CONSTRAINT bookkeeping_periods_due_check CHECK (due_on IS NULL OR due_on > ends_on),
  CONSTRAINT bookkeeping_periods_state_check CHECK (
    state IN ('draft', 'review', 'ready', 'submitted', 'paid')
  ),
  CONSTRAINT bookkeeping_periods_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_periods_reopen_reason_check CHECK (
    reopen_reason IS NULL OR char_length(btrim(reopen_reason)) BETWEEN 1 AND 1000
  ),
  CONSTRAINT bookkeeping_periods_payment_state_check CHECK (
    current_payment_state IS NULL OR current_payment_state IN ('unpaid', 'paid', 'credit')
  ),
  CONSTRAINT bookkeeping_periods_paid_on_check CHECK (
    (current_payment_state = 'paid' AND current_paid_on IS NOT NULL)
    OR (current_payment_state IS DISTINCT FROM 'paid' AND current_paid_on IS NULL)
  ),
  CONSTRAINT bookkeeping_periods_entity_id_id_unique UNIQUE (entity_id, id),
  CONSTRAINT bookkeeping_periods_registration_range_unique
    UNIQUE (vat_registration_id, starts_on, ends_on)
);

CREATE INDEX IF NOT EXISTS bookkeeping_periods_entity_registration_idx
  ON public.bookkeeping_periods (entity_id, vat_registration_id, starts_on DESC);

CREATE TABLE IF NOT EXISTS public.bookkeeping_entries (
  id                                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                           uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  vat_registration_id                uuid        NOT NULL,
  period_id                           uuid        NOT NULL,
  entry_type                          text        NOT NULL,
  document_date                       date        NOT NULL,
  reporting_date                      date        NOT NULL,
  counterparty                        text        NULL,
  description                         text        NOT NULL,
  document_type                       text        NULL,
  document_reference                  text        NULL,
  duplicate_reference_confirmed       boolean     NOT NULL DEFAULT false,
  currency                            text        NOT NULL DEFAULT 'ISK',
  source_type                         text        NOT NULL DEFAULT 'manual',
  source_id                           uuid        NULL,
  source_reference                    text        NULL,
  review_state                        text        NOT NULL DEFAULT 'unreviewed',
  original_document_preserved         boolean     NOT NULL DEFAULT false,
  business_purpose_confirmed          boolean     NOT NULL DEFAULT false,
  seller_vat_registration_confirmed   boolean     NULL,
  foreign_service_state               text        NOT NULL DEFAULT 'not_applicable',
  import_state                        text        NOT NULL DEFAULT 'not_applicable',
  mixed_use_state                     text        NOT NULL DEFAULT 'not_applicable',
  uncertain_deductibility_state       text        NOT NULL DEFAULT 'not_applicable',
  special_case_resolution_note        text        NULL,
  note                                text        NULL,
  status                              text        NOT NULL DEFAULT 'active',
  version                             bigint      NOT NULL DEFAULT 1,
  voided_at                           timestamptz NULL,
  voided_reason                       text        NULL,
  voided_by                           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by                          uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                          uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entries_period_fk
    FOREIGN KEY (entity_id, period_id)
    REFERENCES public.bookkeeping_periods(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_entries_registration_fk
    FOREIGN KEY (entity_id, vat_registration_id)
    REFERENCES public.bookkeeping_vat_registrations(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_entries_type_check CHECK (
    entry_type IN ('sale', 'purchase', 'sales_credit', 'purchase_credit')
  ),
  CONSTRAINT bookkeeping_entries_counterparty_check
    CHECK (counterparty IS NULL OR char_length(btrim(counterparty)) BETWEEN 1 AND 200),
  CONSTRAINT bookkeeping_entries_description_check
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT bookkeeping_entries_document_type_check
    CHECK (document_type IS NULL OR char_length(btrim(document_type)) BETWEEN 1 AND 80),
  CONSTRAINT bookkeeping_entries_document_reference_check
    CHECK (document_reference IS NULL OR char_length(btrim(document_reference)) BETWEEN 1 AND 160),
  CONSTRAINT bookkeeping_entries_currency_check CHECK (currency = 'ISK'),
  CONSTRAINT bookkeeping_entries_source_type_check CHECK (source_type = 'manual'),
  CONSTRAINT bookkeeping_entries_source_empty_check CHECK (
    source_id IS NULL AND source_reference IS NULL
  ),
  CONSTRAINT bookkeeping_entries_review_state_check CHECK (
    review_state IN ('unreviewed', 'reviewed', 'needs_review')
  ),
  CONSTRAINT bookkeeping_entries_special_case_states_check CHECK (
    foreign_service_state IN ('not_applicable', 'unresolved', 'resolved')
    AND import_state IN ('not_applicable', 'unresolved', 'resolved')
    AND mixed_use_state IN ('not_applicable', 'unresolved', 'resolved')
    AND uncertain_deductibility_state IN ('not_applicable', 'unresolved', 'resolved')
  ),
  CONSTRAINT bookkeeping_entries_special_case_note_check CHECK (
    special_case_resolution_note IS NULL
    OR char_length(btrim(special_case_resolution_note)) BETWEEN 1 AND 1000
  ),
  CONSTRAINT bookkeeping_entries_note_check CHECK (note IS NULL OR char_length(note) <= 2000),
  CONSTRAINT bookkeeping_entries_status_check CHECK (status IN ('active', 'voided')),
  CONSTRAINT bookkeeping_entries_void_check CHECK (
    (status = 'active' AND voided_at IS NULL AND voided_reason IS NULL AND voided_by IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL
      AND voided_reason IS NOT NULL
      AND char_length(btrim(voided_reason)) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT bookkeeping_entries_version_check CHECK (version > 0),
  CONSTRAINT bookkeeping_entries_entity_period_id_unique UNIQUE (entity_id, period_id, id),
  CONSTRAINT bookkeeping_entries_entity_id_id_unique UNIQUE (entity_id, id)
);

CREATE INDEX IF NOT EXISTS bookkeeping_entries_period_reporting_idx
  ON public.bookkeeping_entries (period_id, reporting_date, created_at, id);

CREATE INDEX IF NOT EXISTS bookkeeping_entries_document_reference_idx
  ON public.bookkeeping_entries (
    period_id, entry_type, upper(coalesce(counterparty, '')),
    upper(coalesce(document_type, '')), upper(document_reference)
  )
  WHERE status = 'active' AND document_reference IS NOT NULL;

-- Every edit creates a new set of line revisions. Earlier revisions are marked
-- inactive but never deleted, preserving the exact numeric history.
CREATE TABLE IF NOT EXISTS public.bookkeeping_entry_lines (
  row_id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  id                           uuid        NOT NULL,
  entity_id                    uuid        NOT NULL,
  period_id                    uuid        NOT NULL,
  entry_id                     uuid        NOT NULL,
  entry_version                bigint      NOT NULL,
  line_no                      integer     NOT NULL,
  client_key                   text        NOT NULL,
  category_code                text        NULL,
  description                  text        NULL,
  vat_treatment                text        NOT NULL,
  vat_rate                     smallint    NOT NULL,
  currency                     text        NOT NULL DEFAULT 'ISK',
  amount_includes_vat          boolean     NOT NULL DEFAULT true,
  gross_minor                  bigint      NOT NULL,
  net_minor                    bigint      NOT NULL,
  vat_minor                    bigint      NOT NULL,
  input_vat_deductibility      text        NOT NULL,
  deductible_vat_minor         bigint      NOT NULL DEFAULT 0,
  manual_vat_override          boolean     NOT NULL DEFAULT false,
  manual_vat_override_reason   text        NULL,
  exempt_turnover_confirmed    boolean     NOT NULL DEFAULT false,
  active                       boolean     NOT NULL DEFAULT true,
  superseded_at                timestamptz NULL,
  created_by                   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entry_lines_entry_fk
    FOREIGN KEY (entity_id, period_id, entry_id)
    REFERENCES public.bookkeeping_entries(entity_id, period_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_entry_lines_version_check CHECK (entry_version > 0),
  CONSTRAINT bookkeeping_entry_lines_line_no_check CHECK (line_no BETWEEN 1 AND 50),
  CONSTRAINT bookkeeping_entry_lines_client_key_check
    CHECK (char_length(btrim(client_key)) BETWEEN 1 AND 80),
  CONSTRAINT bookkeeping_entry_lines_category_check
    CHECK (category_code IS NULL OR char_length(btrim(category_code)) BETWEEN 1 AND 80),
  CONSTRAINT bookkeeping_entry_lines_description_check
    CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT bookkeeping_entry_lines_vat_treatment_check CHECK (
    vat_treatment IN (
      'taxable_24', 'taxable_11', 'exempt_turnover',
      'outside_scope', 'no_vat', 'needs_review'
    )
  ),
  CONSTRAINT bookkeeping_entry_lines_vat_rate_check CHECK (
    (vat_treatment = 'taxable_24' AND vat_rate = 24)
    OR (vat_treatment = 'taxable_11' AND vat_rate = 11)
    OR (vat_treatment NOT IN ('taxable_24', 'taxable_11') AND vat_rate = 0)
  ),
  CONSTRAINT bookkeeping_entry_lines_currency_check CHECK (currency = 'ISK'),
  CONSTRAINT bookkeeping_entry_lines_amounts_check CHECK (
    gross_minor BETWEEN 1 AND 9007199254740991
    AND net_minor BETWEEN 0 AND 9007199254740991
    AND vat_minor BETWEEN 0 AND 9007199254740991
    AND deductible_vat_minor BETWEEN 0 AND 9007199254740991
    AND gross_minor = net_minor + vat_minor
    AND deductible_vat_minor <= vat_minor
  ),
  CONSTRAINT bookkeeping_entry_lines_deductibility_check CHECK (
    input_vat_deductibility IN (
      'not_applicable', 'fully_deductible', 'partially_deductible',
      'not_deductible', 'needs_review'
    )
  ),
  CONSTRAINT bookkeeping_entry_lines_override_check CHECK (
    (manual_vat_override AND manual_vat_override_reason IS NOT NULL
      AND char_length(btrim(manual_vat_override_reason)) BETWEEN 1 AND 500)
    OR (NOT manual_vat_override AND manual_vat_override_reason IS NULL)
  ),
  CONSTRAINT bookkeeping_entry_lines_active_check CHECK (
    (active AND superseded_at IS NULL) OR (NOT active AND superseded_at IS NOT NULL)
  ),
  CONSTRAINT bookkeeping_entry_lines_version_line_unique
    UNIQUE (entry_id, entry_version, line_no),
  CONSTRAINT bookkeeping_entry_lines_version_id_unique
    UNIQUE (entry_id, entry_version, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bookkeeping_entry_lines_active_id_unique
  ON public.bookkeeping_entry_lines (entry_id, id)
  WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS bookkeeping_entry_lines_active_client_key_unique
  ON public.bookkeeping_entry_lines (entry_id, client_key)
  WHERE active;

CREATE INDEX IF NOT EXISTS bookkeeping_entry_lines_entry_active_idx
  ON public.bookkeeping_entry_lines (entry_id, active, line_no);

-- Private full header revisions are required to reconstruct edits. Sensitive
-- header values stay only in this default-deny table; the general activity
-- stream records bounded lifecycle/version metadata instead.
CREATE TABLE IF NOT EXISTS public.bookkeeping_entry_revisions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid        NOT NULL,
  period_id      uuid        NOT NULL,
  entry_id       uuid        NOT NULL,
  entry_version  bigint      NOT NULL,
  header_snapshot jsonb      NOT NULL,
  captured_by    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_entry_revisions_entry_fk
    FOREIGN KEY (entity_id, period_id, entry_id)
    REFERENCES public.bookkeeping_entries(entity_id, period_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_entry_revisions_version_check CHECK (entry_version > 0),
  CONSTRAINT bookkeeping_entry_revisions_snapshot_check CHECK (
    jsonb_typeof(header_snapshot) = 'object'
    AND octet_length(header_snapshot::text) <= 10000
  ),
  CONSTRAINT bookkeeping_entry_revisions_entry_version_unique
    UNIQUE (entry_id, entry_version)
);

CREATE INDEX IF NOT EXISTS bookkeeping_entry_revisions_entry_idx
  ON public.bookkeeping_entry_revisions (entry_id, entry_version DESC);

CREATE TABLE IF NOT EXISTS public.bookkeeping_filing_snapshots (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                uuid        NOT NULL,
  period_id                uuid        NOT NULL,
  submission_no            integer     NOT NULL,
  a_minor                  bigint      NOT NULL,
  b_minor                  bigint      NOT NULL,
  c_minor                  bigint      NOT NULL,
  d_minor                  bigint      NOT NULL,
  e_minor                  bigint      NOT NULL,
  f_minor                  bigint      NOT NULL,
  output_vat_24_minor      bigint      NOT NULL,
  output_vat_11_minor      bigint      NOT NULL,
  input_vat_24_minor       bigint      NOT NULL,
  input_vat_11_minor       bigint      NOT NULL,
  submitted_on             date        NOT NULL,
  due_on                   date        NULL,
  reported_result_minor    bigint      NOT NULL,
  result_mismatch_reason   text        NULL,
  confirmation_reference   text        NULL,
  note                     text        NULL,
  payment_state_at_filing  text        NOT NULL,
  paid_on_at_filing        date        NULL,
  created_by               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_filing_snapshots_period_fk
    FOREIGN KEY (entity_id, period_id)
    REFERENCES public.bookkeeping_periods(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_filing_snapshots_submission_check CHECK (submission_no > 0),
  CONSTRAINT bookkeeping_filing_snapshots_amounts_check CHECK (
    a_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND b_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND c_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND d_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND e_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND f_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND reported_result_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND output_vat_24_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND output_vat_11_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND input_vat_24_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND input_vat_11_minor BETWEEN -9007199254740991 AND 9007199254740991
    AND f_minor = d_minor - e_minor
    AND d_minor = output_vat_24_minor + output_vat_11_minor
    AND e_minor = input_vat_24_minor + input_vat_11_minor
  ),
  CONSTRAINT bookkeeping_filing_snapshots_mismatch_check CHECK (
    reported_result_minor = f_minor
    OR (result_mismatch_reason IS NOT NULL
      AND char_length(btrim(result_mismatch_reason)) BETWEEN 1 AND 1000)
  ),
  CONSTRAINT bookkeeping_filing_snapshots_confirmation_check CHECK (
    confirmation_reference IS NULL
    OR char_length(btrim(confirmation_reference)) BETWEEN 1 AND 200
  ),
  CONSTRAINT bookkeeping_filing_snapshots_note_check
    CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT bookkeeping_filing_snapshots_payment_check CHECK (
    payment_state_at_filing IN ('unpaid', 'paid', 'credit')
    AND (
      (payment_state_at_filing = 'paid' AND paid_on_at_filing IS NOT NULL)
      OR (payment_state_at_filing <> 'paid' AND paid_on_at_filing IS NULL)
    )
  ),
  CONSTRAINT bookkeeping_filing_snapshots_period_submission_unique
    UNIQUE (period_id, submission_no)
);

CREATE INDEX IF NOT EXISTS bookkeeping_filing_snapshots_period_idx
  ON public.bookkeeping_filing_snapshots (period_id, submission_no DESC);

-- Bounded private audit metadata: never amounts, tax identifiers, document
-- references, counterparties, free-form notes, email addresses or line data.
CREATE TABLE IF NOT EXISTS public.bookkeeping_activity (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no    bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  entity_id      uuid        NOT NULL REFERENCES public.bookkeeping_entities(id) ON DELETE RESTRICT,
  period_id      uuid        NULL,
  entry_id       uuid        NULL,
  event_type     text        NOT NULL,
  actor_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_version bigint      NULL,
  period_version bigint      NULL,
  entry_version  bigint      NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookkeeping_activity_period_fk
    FOREIGN KEY (entity_id, period_id)
    REFERENCES public.bookkeeping_periods(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_activity_entry_fk
    FOREIGN KEY (entity_id, entry_id)
    REFERENCES public.bookkeeping_entries(entity_id, id) ON DELETE RESTRICT,
  CONSTRAINT bookkeeping_activity_event_type_check CHECK (event_type IN (
    'entity_created', 'vat_registration_added', 'period_created',
    'entry_created', 'entry_updated', 'entry_review_changed', 'entry_voided',
    'period_ready', 'filing_recorded', 'period_reopened', 'payment_recorded',
    'account_unlinked'
  )),
  CONSTRAINT bookkeeping_activity_version_check CHECK (
    (entity_version IS NULL OR entity_version > 0)
    AND (period_version IS NULL OR period_version > 0)
    AND (entry_version IS NULL OR entry_version > 0)
  ),
  CONSTRAINT bookkeeping_activity_metadata_check CHECK (
    jsonb_typeof(metadata) = 'object'
    AND octet_length(metadata::text) <= 1000
  )
);

CREATE INDEX IF NOT EXISTS bookkeeping_activity_entity_sequence_idx
  ON public.bookkeeping_activity (entity_id, sequence_no DESC);

-- Idempotency rows contain only an MD5 fingerprint and bounded identifiers;
-- never entry contents, names, amounts, tax identifiers or source references.
CREATE TABLE IF NOT EXISTS public.bookkeeping_mutation_requests (
  actor_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz NULL,
  PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT bookkeeping_mutation_requests_operation_check
    CHECK (char_length(operation) BETWEEN 1 AND 80),
  CONSTRAINT bookkeeping_mutation_requests_fingerprint_check
    CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT bookkeeping_mutation_requests_result_check
    CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1000))
);

CREATE INDEX IF NOT EXISTS bookkeeping_mutation_requests_created_idx
  ON public.bookkeeping_mutation_requests (created_at);

-- ---------------------------------------------------------------------------
-- Default-deny RLS and direct grants. No client policy is created. Even
-- service_role has no direct table privilege; every read and write uses a
-- membership-checking RPC.
-- ---------------------------------------------------------------------------

ALTER TABLE public.bookkeeping_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_entity_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_vat_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_filing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_mutation_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bookkeeping_entities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_entity_members FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_vat_registrations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_periods FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_entries FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_entry_lines FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_entry_revisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_filing_snapshots FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_activity FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bookkeeping_mutation_requests FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Integrity, lifecycle, authorization, idempotency and audit helpers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bookkeeping_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
BEGIN
  -- Account unlinking removes only nullable auth snapshots. That lifecycle
  -- operation must not make otherwise unchanged bookkeeping rows look edited,
  -- or make an entry header diverge from its immutable same-version revision.
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME IN (
      'bookkeeping_entities',
      'bookkeeping_vat_registrations',
      'bookkeeping_periods'
    )
      AND (
        v_new->'created_by' IS NOT DISTINCT FROM v_old->'created_by'
        OR (v_old->'created_by' <> 'null'::jsonb
          AND v_new->'created_by' = 'null'::jsonb)
      )
      AND (
        v_new->'updated_by' IS NOT DISTINCT FROM v_old->'updated_by'
        OR (v_old->'updated_by' <> 'null'::jsonb
          AND v_new->'updated_by' = 'null'::jsonb)
      )
      AND (
        v_new->'created_by' IS DISTINCT FROM v_old->'created_by'
        OR v_new->'updated_by' IS DISTINCT FROM v_old->'updated_by'
      )
      AND (v_old - ARRAY['created_by', 'updated_by', 'updated_at'])
        = (v_new - ARRAY['created_by', 'updated_by', 'updated_at']) THEN
      NEW.updated_at := OLD.updated_at;
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'bookkeeping_entries'
      AND (
        v_new->'created_by' IS NOT DISTINCT FROM v_old->'created_by'
        OR (v_old->'created_by' <> 'null'::jsonb
          AND v_new->'created_by' = 'null'::jsonb)
      )
      AND (
        v_new->'updated_by' IS NOT DISTINCT FROM v_old->'updated_by'
        OR (v_old->'updated_by' <> 'null'::jsonb
          AND v_new->'updated_by' = 'null'::jsonb)
      )
      AND (
        v_new->'voided_by' IS NOT DISTINCT FROM v_old->'voided_by'
        OR (v_old->'voided_by' <> 'null'::jsonb
          AND v_new->'voided_by' = 'null'::jsonb)
      )
      AND (
        v_new->'created_by' IS DISTINCT FROM v_old->'created_by'
        OR v_new->'updated_by' IS DISTINCT FROM v_old->'updated_by'
        OR v_new->'voided_by' IS DISTINCT FROM v_old->'voided_by'
      )
      AND (v_old - ARRAY[
        'created_by', 'updated_by', 'voided_by', 'updated_at'
      ]) = (v_new - ARRAY[
        'created_by', 'updated_by', 'voided_by', 'updated_at'
      ]) THEN
      NEW.updated_at := OLD.updated_at;
      RETURN NEW;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'bookkeeping_hard_delete_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'bookkeeping_activity' AND TG_OP = 'UPDATE'
     AND v_old->'actor_user_id' <> 'null'::jsonb
     AND v_new->'actor_user_id' = 'null'::jsonb
     AND (v_old - 'actor_user_id') = (v_new - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'bookkeeping_filing_snapshots' AND TG_OP = 'UPDATE'
     AND v_old->'created_by' <> 'null'::jsonb
     AND v_new->'created_by' = 'null'::jsonb
     AND (v_old - 'created_by') = (v_new - 'created_by') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'bookkeeping_entry_revisions' AND TG_OP = 'UPDATE'
     AND v_old->'captured_by' <> 'null'::jsonb
     AND v_new->'captured_by' = 'null'::jsonb
     AND (v_old - 'captured_by') = (v_new - 'captured_by') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'bookkeeping_immutable_record';
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_guard_line_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The only normal line update supersedes the current revision. Numeric,
  -- VAT, tenant and source fields remain byte-for-byte unchanged.
  IF OLD.active AND NOT NEW.active
     AND OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL
     AND (to_jsonb(OLD) - ARRAY['active', 'superseded_at'])
       = (to_jsonb(NEW) - ARRAY['active', 'superseded_at']) THEN
    RETURN NEW;
  END IF;

  -- Account deletion may unlink its nullable auth snapshot only.
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
     AND (to_jsonb(OLD) - 'created_by') = (to_jsonb(NEW) - 'created_by') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'bookkeeping_immutable_line_revision';
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_member_unlink_auth_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.status := 'unlinked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookkeeping_entities_touch_updated_at ON public.bookkeeping_entities;
CREATE TRIGGER bookkeeping_entities_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_entities
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();

DROP TRIGGER IF EXISTS bookkeeping_members_touch_updated_at ON public.bookkeeping_entity_members;
CREATE TRIGGER bookkeeping_members_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_entity_members
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();
DROP TRIGGER IF EXISTS bookkeeping_members_unlink_auth_snapshot ON public.bookkeeping_entity_members;
CREATE TRIGGER bookkeeping_members_unlink_auth_snapshot
  BEFORE UPDATE OF user_id ON public.bookkeeping_entity_members
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_member_unlink_auth_snapshot();

DROP TRIGGER IF EXISTS bookkeeping_registrations_touch_updated_at ON public.bookkeeping_vat_registrations;
CREATE TRIGGER bookkeeping_registrations_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_vat_registrations
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();

DROP TRIGGER IF EXISTS bookkeeping_periods_touch_updated_at ON public.bookkeeping_periods;
CREATE TRIGGER bookkeeping_periods_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_periods
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();

DROP TRIGGER IF EXISTS bookkeeping_entries_touch_updated_at ON public.bookkeeping_entries;
CREATE TRIGGER bookkeeping_entries_touch_updated_at
  BEFORE UPDATE ON public.bookkeeping_entries
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_touch_updated_at();

DROP TRIGGER IF EXISTS bookkeeping_entities_no_delete ON public.bookkeeping_entities;
CREATE TRIGGER bookkeeping_entities_no_delete
  BEFORE DELETE ON public.bookkeeping_entities
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_members_no_delete ON public.bookkeeping_entity_members;
CREATE TRIGGER bookkeeping_members_no_delete
  BEFORE DELETE ON public.bookkeeping_entity_members
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_registrations_no_delete ON public.bookkeeping_vat_registrations;
CREATE TRIGGER bookkeeping_registrations_no_delete
  BEFORE DELETE ON public.bookkeeping_vat_registrations
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_periods_no_delete ON public.bookkeeping_periods;
CREATE TRIGGER bookkeeping_periods_no_delete
  BEFORE DELETE ON public.bookkeeping_periods
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_entries_no_delete ON public.bookkeeping_entries;
CREATE TRIGGER bookkeeping_entries_no_delete
  BEFORE DELETE ON public.bookkeeping_entries
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_entry_lines_no_delete ON public.bookkeeping_entry_lines;
CREATE TRIGGER bookkeeping_entry_lines_no_delete
  BEFORE DELETE ON public.bookkeeping_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_delete();
DROP TRIGGER IF EXISTS bookkeeping_entry_lines_revision_guard ON public.bookkeeping_entry_lines;
CREATE TRIGGER bookkeeping_entry_lines_revision_guard
  BEFORE UPDATE ON public.bookkeeping_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_guard_line_revision_update();

DROP TRIGGER IF EXISTS bookkeeping_snapshots_immutable ON public.bookkeeping_filing_snapshots;
CREATE TRIGGER bookkeeping_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_filing_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();
DROP TRIGGER IF EXISTS bookkeeping_entry_revisions_immutable ON public.bookkeeping_entry_revisions;
CREATE TRIGGER bookkeeping_entry_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_entry_revisions
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();
DROP TRIGGER IF EXISTS bookkeeping_activity_immutable ON public.bookkeeping_activity;
CREATE TRIGGER bookkeeping_activity_immutable
  BEFORE UPDATE OR DELETE ON public.bookkeeping_activity
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_reject_immutable_change();

CREATE OR REPLACE FUNCTION public.bookkeeping_has_beta_access(p_user_id uuid)
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
     AND access.feature_key = 'bokhaldid'
    WHERE account.id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_beta_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT public.bookkeeping_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'bookkeeping_unavailable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_active_member_role(
  p_actor_id uuid,
  p_entity_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT member.role
  FROM public.bookkeeping_entity_members AS member
  WHERE member.entity_id = p_entity_id
    AND member.user_id = p_actor_id
    AND member.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_owner(
  p_actor_id uuid,
  p_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.bookkeeping_assert_beta_actor(p_actor_id);
  IF public.bookkeeping_active_member_role(p_actor_id, p_entity_id)
       IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'bookkeeping_not_allowed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_begin_request(
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
  v_existing public.bookkeeping_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR char_length(p_operation) NOT BETWEEN 1 AND 80
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;

  -- Serialize all bookkeeping mutations for one actor. Account unlinking takes
  -- the same lock before revoking entitlement and nulling durable auth links.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9801)
  );
  PERFORM public.bookkeeping_assert_beta_actor(p_actor_id);

  INSERT INTO public.bookkeeping_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  )
  VALUES (p_actor_id, p_request_id, p_operation, p_fingerprint)
  ON CONFLICT (actor_user_id, request_id) DO NOTHING;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request.*
  INTO v_existing
  FROM public.bookkeeping_mutation_requests AS request
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
  FOR UPDATE;

  IF v_existing.operation <> p_operation
     OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'bookkeeping_idempotency_conflict';
  END IF;
  IF v_existing.result IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_idempotency_incomplete';
  END IF;
  RETURN v_existing.result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_finish_request(
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
  IF jsonb_typeof(p_result) <> 'object' OR octet_length(p_result::text) > 1000 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_result';
  END IF;
  UPDATE public.bookkeeping_mutation_requests AS request
  SET result = p_result, completed_at = now()
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
    AND request.result IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bookkeeping_idempotency_incomplete';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_record_activity(
  p_entity_id uuid,
  p_period_id uuid,
  p_entry_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_entity_version bigint,
  p_period_version bigint,
  p_entry_version bigint,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := gen_random_uuid();
BEGIN
  -- Metadata is deliberately code-only and may never contain financial or
  -- source-document fields. Callers below use only bounded lifecycle keys.
  IF jsonb_typeof(p_metadata) <> 'object'
     OR octet_length(p_metadata::text) > 1000
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_metadata) AS key
       WHERE key <> ALL (ARRAY[
         'from_state', 'to_state', 'submission_no', 'payment_state',
         'member_unlinked'
       ]::text[])
     ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_audit_metadata';
  END IF;
  INSERT INTO public.bookkeeping_activity (
    id, entity_id, period_id, entry_id, event_type, actor_user_id,
    entity_version, period_version, entry_version, metadata
  ) VALUES (
    v_activity_id, p_entity_id, p_period_id, p_entry_id, p_event_type,
    p_actor_id, p_entity_version, p_period_version, p_entry_version, p_metadata
  );
  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_period_dates_valid(
  p_filing_method text,
  p_starts_on date,
  p_ends_on date,
  p_due_on date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_starts_on IS NOT NULL
    AND p_ends_on IS NOT NULL
    AND p_starts_on <= p_ends_on
    AND (p_due_on IS NULL OR p_due_on > p_ends_on)
    AND CASE p_filing_method
      WHEN 'general_bimonthly' THEN
        extract(day FROM p_starts_on) = 1
        AND mod(extract(month FROM p_starts_on)::integer, 2) = 1
        AND p_ends_on = (
          pg_catalog.date_trunc('month', p_starts_on)::date
          + interval '2 months' - interval '1 day'
        )::date
      WHEN 'monthly' THEN
        extract(day FROM p_starts_on) = 1
        AND p_ends_on = (
          pg_catalog.date_trunc('month', p_starts_on)::date
          + interval '1 month' - interval '1 day'
        )::date
      WHEN 'annual' THEN
        extract(month FROM p_starts_on) = 1
        AND extract(day FROM p_starts_on) = 1
        AND p_ends_on = (p_starts_on + interval '1 year' - interval '1 day')::date
      WHEN 'agricultural' THEN true
      WHEN 'other' THEN true
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_entry_payload(p_entry jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_entry_type text;
BEGIN
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object'
     OR (p_entry - ARRAY[
       'request_id', 'entity_id', 'vat_registration_id', 'period_id',
       'entry_id', 'expected_version', 'type', 'document_date',
       'reporting_date', 'counterparty', 'description', 'document_type',
       'document_reference', 'duplicate_reference_confirmed', 'currency',
       'source_type', 'source_id', 'source_reference', 'review_state',
       'original_document_preserved', 'business_purpose_confirmed',
       'seller_vat_registration_confirmed', 'special_cases',
       'special_case_resolution_note', 'note', 'lines'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_entry ?& ARRAY[
       'type', 'document_date', 'reporting_date', 'description',
       'duplicate_reference_confirmed', 'currency', 'source_type',
       'review_state', 'original_document_preserved',
       'business_purpose_confirmed', 'seller_vat_registration_confirmed',
       'special_cases', 'lines'
     ]::text[]) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;

  v_entry_type := p_entry->>'type';
  IF jsonb_typeof(p_entry->'type') <> 'string'
     OR jsonb_typeof(p_entry->'document_date') <> 'string'
     OR jsonb_typeof(p_entry->'reporting_date') <> 'string'
     OR jsonb_typeof(p_entry->'description') <> 'string'
     OR jsonb_typeof(p_entry->'currency') <> 'string'
     OR jsonb_typeof(p_entry->'source_type') <> 'string'
     OR jsonb_typeof(p_entry->'review_state') <> 'string'
     OR v_entry_type NOT IN ('sale', 'purchase', 'sales_credit', 'purchase_credit')
     OR (p_entry->>'document_date') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (p_entry->>'reporting_date') !~ '^\d{4}-\d{2}-\d{2}$'
     OR char_length(btrim(p_entry->>'description')) NOT BETWEEN 1 AND 500
     OR (p_entry->>'currency') <> 'ISK'
     OR (p_entry->>'source_type') <> 'manual'
     OR coalesce(jsonb_typeof(p_entry->'source_id'), 'null') <> 'null'
     OR coalesce(jsonb_typeof(p_entry->'source_reference'), 'null') <> 'null'
     OR (p_entry->>'review_state') NOT IN ('unreviewed', 'reviewed', 'needs_review')
     OR jsonb_typeof(p_entry->'duplicate_reference_confirmed') <> 'boolean'
     OR jsonb_typeof(p_entry->'original_document_preserved') <> 'boolean'
     OR jsonb_typeof(p_entry->'business_purpose_confirmed') <> 'boolean'
     OR jsonb_typeof(p_entry->'seller_vat_registration_confirmed')
          NOT IN ('boolean', 'null')
     OR (p_entry ? 'counterparty' AND jsonb_typeof(p_entry->'counterparty') NOT IN ('string', 'null'))
     OR (p_entry ? 'counterparty' AND jsonb_typeof(p_entry->'counterparty') = 'string'
       AND char_length(btrim(p_entry->>'counterparty')) NOT BETWEEN 1 AND 200)
     OR (p_entry ? 'document_type' AND jsonb_typeof(p_entry->'document_type') NOT IN ('string', 'null'))
     OR (p_entry ? 'document_type' AND jsonb_typeof(p_entry->'document_type') = 'string'
       AND char_length(btrim(p_entry->>'document_type')) NOT BETWEEN 1 AND 80)
     OR (p_entry ? 'document_reference' AND jsonb_typeof(p_entry->'document_reference') NOT IN ('string', 'null'))
     OR (p_entry ? 'document_reference' AND jsonb_typeof(p_entry->'document_reference') = 'string'
       AND char_length(btrim(p_entry->>'document_reference')) NOT BETWEEN 1 AND 160)
     OR (p_entry ? 'special_case_resolution_note'
       AND jsonb_typeof(p_entry->'special_case_resolution_note') NOT IN ('string', 'null'))
     OR (jsonb_typeof(p_entry->'special_case_resolution_note') = 'string'
       AND char_length(btrim(p_entry->>'special_case_resolution_note')) NOT BETWEEN 1 AND 1000)
     OR (p_entry ? 'note' AND jsonb_typeof(p_entry->'note') NOT IN ('string', 'null'))
     OR (jsonb_typeof(p_entry->'note') = 'string' AND char_length(p_entry->>'note') > 2000)
     OR jsonb_typeof(p_entry->'special_cases') <> 'object'
     OR ((p_entry->'special_cases') - ARRAY[
       'foreign_service', 'import', 'mixed_use', 'uncertain_deductibility'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_entry->'special_cases' ?& ARRAY[
       'foreign_service', 'import', 'mixed_use', 'uncertain_deductibility'
     ]::text[])
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_entry->'special_cases') AS special(key, value)
       WHERE jsonb_typeof(special.value) <> 'string'
          OR (special.value #>> '{}') NOT IN ('not_applicable', 'unresolved', 'resolved')
     )
     OR jsonb_typeof(p_entry->'lines') <> 'array'
     OR jsonb_array_length(p_entry->'lines') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_entry->'lines') AS line
       WHERE jsonb_typeof(line) <> 'object'
          OR (line - ARRAY[
            'client_key', 'line_id', 'category_code', 'description',
            'vat_treatment', 'currency', 'amount_includes_vat',
            'gross_minor', 'net_minor', 'vat_minor',
            'input_vat_deductibility', 'deductible_vat_minor',
            'manual_vat_override', 'manual_vat_override_reason',
            'exempt_turnover_confirmed'
          ]::text[]) <> '{}'::jsonb
          OR NOT (line ?& ARRAY[
            'client_key', 'vat_treatment', 'currency', 'amount_includes_vat',
            'gross_minor', 'net_minor', 'vat_minor',
            'input_vat_deductibility', 'deductible_vat_minor',
            'manual_vat_override', 'exempt_turnover_confirmed'
          ]::text[])
          OR jsonb_typeof(line->'client_key') <> 'string'
          OR jsonb_typeof(line->'vat_treatment') <> 'string'
          OR jsonb_typeof(line->'currency') <> 'string'
          OR jsonb_typeof(line->'input_vat_deductibility') <> 'string'
          OR char_length(btrim(line->>'client_key')) NOT BETWEEN 1 AND 80
          OR (line ? 'line_id' AND jsonb_typeof(line->'line_id') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'line_id') = 'string'
            AND (line->>'line_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
          OR (line ? 'category_code' AND jsonb_typeof(line->'category_code') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'category_code') = 'string'
            AND char_length(btrim(line->>'category_code')) NOT BETWEEN 1 AND 80)
          OR (line ? 'description' AND jsonb_typeof(line->'description') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'description') = 'string'
            AND char_length(btrim(line->>'description')) NOT BETWEEN 1 AND 500)
          OR (line->>'vat_treatment') NOT IN (
            'taxable_24', 'taxable_11', 'exempt_turnover',
            'outside_scope', 'no_vat', 'needs_review'
          )
          OR (line->>'currency') <> 'ISK'
          OR jsonb_typeof(line->'amount_includes_vat') <> 'boolean'
          OR jsonb_typeof(line->'gross_minor') <> 'number'
          OR (line->>'gross_minor') !~ '^[0-9]+$'
          OR (line->>'gross_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
          OR jsonb_typeof(line->'net_minor') <> 'number'
          OR (line->>'net_minor') !~ '^[0-9]+$'
          OR (line->>'net_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR jsonb_typeof(line->'vat_minor') <> 'number'
          OR (line->>'vat_minor') !~ '^[0-9]+$'
          OR (line->>'vat_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR jsonb_typeof(line->'deductible_vat_minor') <> 'number'
          OR (line->>'deductible_vat_minor') !~ '^[0-9]+$'
          OR (line->>'deductible_vat_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR (line->>'gross_minor')::numeric
             <> (line->>'net_minor')::numeric + (line->>'vat_minor')::numeric
          OR (line->>'deductible_vat_minor')::numeric > (line->>'vat_minor')::numeric
          OR (line->>'input_vat_deductibility') NOT IN (
            'not_applicable', 'fully_deductible', 'partially_deductible',
            'not_deductible', 'needs_review'
          )
          OR jsonb_typeof(line->'manual_vat_override') <> 'boolean'
          OR (line ? 'manual_vat_override_reason'
            AND jsonb_typeof(line->'manual_vat_override_reason') NOT IN ('string', 'null'))
          OR jsonb_typeof(line->'exempt_turnover_confirmed') <> 'boolean'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_entry->'lines') AS line
       GROUP BY line->>'client_key' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_entry->'lines') AS line
       WHERE jsonb_typeof(line->'line_id') = 'string'
       GROUP BY line->>'line_id' HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry_lines';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entry->'lines') AS line
    CROSS JOIN LATERAL (
      SELECT CASE line->>'vat_treatment'
        WHEN 'taxable_24' THEN 24
        WHEN 'taxable_11' THEN 11
        ELSE 0
      END::numeric AS rate
    ) AS tax
    WHERE
      (v_entry_type IN ('sale', 'sales_credit') AND line->>'vat_treatment' = 'no_vat')
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND line->>'vat_treatment' = 'exempt_turnover')
      OR (tax.rate = 0 AND line->>'vat_treatment' <> 'needs_review'
        AND (line->>'vat_minor')::numeric <> 0)
      OR (
        tax.rate > 0
        AND NOT (line->>'manual_vat_override')::boolean
        AND (
          CASE WHEN (line->>'amount_includes_vat')::boolean THEN
            round((line->>'gross_minor')::numeric * tax.rate / (100 + tax.rate))
              <> (line->>'vat_minor')::numeric
            OR (line->>'gross_minor')::numeric
              - round((line->>'gross_minor')::numeric * tax.rate / (100 + tax.rate))
              <> (line->>'net_minor')::numeric
          ELSE
            round((line->>'net_minor')::numeric * tax.rate / 100)
              <> (line->>'vat_minor')::numeric
            OR (line->>'net_minor')::numeric
              + round((line->>'net_minor')::numeric * tax.rate / 100)
              <> (line->>'gross_minor')::numeric
          END
        )
      )
      OR ((line->>'manual_vat_override')::boolean AND (
        jsonb_typeof(line->'manual_vat_override_reason') <> 'string'
        OR char_length(btrim(line->>'manual_vat_override_reason')) NOT BETWEEN 1 AND 500
      ))
      OR (NOT (line->>'manual_vat_override')::boolean
        AND jsonb_typeof(line->'manual_vat_override_reason') = 'string')
      OR (v_entry_type IN ('sale', 'sales_credit') AND (
        line->>'input_vat_deductibility' <> 'not_applicable'
        OR (line->>'deductible_vat_minor')::numeric <> 0
      ))
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND tax.rate > 0 AND (
        (line->>'input_vat_deductibility' = 'fully_deductible'
          AND (line->>'deductible_vat_minor')::numeric <> (line->>'vat_minor')::numeric)
        OR (line->>'input_vat_deductibility' = 'partially_deductible' AND (
          (line->>'deductible_vat_minor')::numeric <= 0
          OR (line->>'deductible_vat_minor')::numeric >= (line->>'vat_minor')::numeric
        ))
        OR (line->>'input_vat_deductibility' = 'not_deductible'
          AND (line->>'deductible_vat_minor')::numeric <> 0)
      ))
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND tax.rate = 0 AND (
        line->>'input_vat_deductibility' <> 'not_applicable'
        OR (line->>'deductible_vat_minor')::numeric <> 0
      ))
  ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_vat_line';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_replace_entry_lines(
  p_actor_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_entry_id uuid,
  p_entry_version bigint,
  p_entry jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_record record;
  v_line_id uuid;
BEGIN
  PERFORM public.bookkeeping_assert_entry_payload(p_entry);

  UPDATE public.bookkeeping_entry_lines AS old_line
  SET active = false, superseded_at = now()
  WHERE old_line.entry_id = p_entry_id AND old_line.active;

  FOR v_line_record IN
    SELECT line.value, line.ordinality::integer AS line_no
    FROM jsonb_array_elements(p_entry->'lines') WITH ORDINALITY AS line(value, ordinality)
  LOOP
    v_line_id := CASE
      WHEN jsonb_typeof(v_line_record.value->'line_id') = 'string'
        THEN (v_line_record.value->>'line_id')::uuid
      ELSE gen_random_uuid()
    END;

    IF EXISTS (
      SELECT 1 FROM public.bookkeeping_entry_lines AS existing
      WHERE existing.id = v_line_id AND existing.entry_id <> p_entry_id
    ) THEN
      RAISE EXCEPTION 'bookkeeping_line_id_conflict';
    END IF;

    INSERT INTO public.bookkeeping_entry_lines (
      id, entity_id, period_id, entry_id, entry_version, line_no, client_key,
      category_code, description, vat_treatment, vat_rate, currency,
      amount_includes_vat, gross_minor, net_minor, vat_minor,
      input_vat_deductibility, deductible_vat_minor, manual_vat_override,
      manual_vat_override_reason, exempt_turnover_confirmed, created_by
    ) VALUES (
      v_line_id, p_entity_id, p_period_id, p_entry_id, p_entry_version,
      v_line_record.line_no, btrim(v_line_record.value->>'client_key'),
      NULLIF(btrim(v_line_record.value->>'category_code'), ''),
      NULLIF(btrim(v_line_record.value->>'description'), ''),
      v_line_record.value->>'vat_treatment',
      CASE v_line_record.value->>'vat_treatment'
        WHEN 'taxable_24' THEN 24 WHEN 'taxable_11' THEN 11 ELSE 0 END,
      v_line_record.value->>'currency',
      (v_line_record.value->>'amount_includes_vat')::boolean,
      (v_line_record.value->>'gross_minor')::bigint,
      (v_line_record.value->>'net_minor')::bigint,
      (v_line_record.value->>'vat_minor')::bigint,
      v_line_record.value->>'input_vat_deductibility',
      (v_line_record.value->>'deductible_vat_minor')::bigint,
      (v_line_record.value->>'manual_vat_override')::boolean,
      NULLIF(btrim(v_line_record.value->>'manual_vat_override_reason'), ''),
      (v_line_record.value->>'exempt_turnover_confirmed')::boolean,
      p_actor_id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_clone_entry_lines(
  p_actor_id uuid,
  p_entry_id uuid,
  p_entry_version bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH previous AS (
    UPDATE public.bookkeeping_entry_lines AS line
    SET active = false, superseded_at = now()
    WHERE line.entry_id = p_entry_id AND line.active
    RETURNING line.*
  )
  INSERT INTO public.bookkeeping_entry_lines (
    id, entity_id, period_id, entry_id, entry_version, line_no, client_key,
    category_code, description, vat_treatment, vat_rate, currency,
    amount_includes_vat, gross_minor, net_minor, vat_minor,
    input_vat_deductibility, deductible_vat_minor, manual_vat_override,
    manual_vat_override_reason, exempt_turnover_confirmed, created_by
  )
  SELECT
    previous.id, previous.entity_id, previous.period_id, previous.entry_id,
    p_entry_version, previous.line_no, previous.client_key,
    previous.category_code, previous.description, previous.vat_treatment,
    previous.vat_rate, previous.currency, previous.amount_includes_vat,
    previous.gross_minor, previous.net_minor, previous.vat_minor,
    previous.input_vat_deductibility, previous.deductible_vat_minor,
    previous.manual_vat_override, previous.manual_vat_override_reason,
    previous.exempt_turnover_confirmed, p_actor_id
  FROM previous ORDER BY previous.line_no;

  IF NOT FOUND THEN RAISE EXCEPTION 'bookkeeping_entry_has_no_lines'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_capture_entry_revision(
  p_actor_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.bookkeeping_entries%ROWTYPE;
BEGIN
  SELECT entry.* INTO v_entry FROM public.bookkeeping_entries AS entry
  WHERE entry.id = p_entry_id;
  IF v_entry.id IS NULL THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;

  INSERT INTO public.bookkeeping_entry_revisions (
    entity_id, period_id, entry_id, entry_version, header_snapshot, captured_by
  ) VALUES (
    v_entry.entity_id, v_entry.period_id, v_entry.id, v_entry.version,
    jsonb_build_object(
      'entryType', v_entry.entry_type,
      'vatRegistrationId', v_entry.vat_registration_id,
      'documentDate', v_entry.document_date,
      'reportingDate', v_entry.reporting_date,
      'counterparty', v_entry.counterparty,
      'description', v_entry.description,
      'documentType', v_entry.document_type,
      'documentReference', v_entry.document_reference,
      'duplicateReferenceConfirmed', v_entry.duplicate_reference_confirmed,
      'currency', v_entry.currency,
      'sourceType', v_entry.source_type,
      'sourceId', v_entry.source_id,
      'sourceReference', v_entry.source_reference,
      'reviewState', v_entry.review_state,
      'originalDocumentPreserved', v_entry.original_document_preserved,
      'businessPurposeConfirmed', v_entry.business_purpose_confirmed,
      'sellerVatRegistrationConfirmed', v_entry.seller_vat_registration_confirmed,
      'foreignServiceState', v_entry.foreign_service_state,
      'importState', v_entry.import_state,
      'mixedUseState', v_entry.mixed_use_state,
      'uncertainDeductibilityState', v_entry.uncertain_deductibility_state,
      'specialCaseResolutionNote', v_entry.special_case_resolution_note,
      'note', v_entry.note,
      'status', v_entry.status,
      'voidedAt', v_entry.voided_at,
      'voidedReason', v_entry.voided_reason,
      'createdAt', v_entry.created_at,
      'updatedAt', v_entry.updated_at
    ),
    p_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_period_summary_safe(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a numeric;
  v_b numeric;
  v_c numeric;
  v_d numeric;
  v_e numeric;
  v_d24 numeric;
  v_d11 numeric;
  v_e24 numeric;
  v_e11 numeric;
BEGIN
  WITH base AS (
    SELECT entry.entry_type, line.vat_treatment, line.net_minor,
      line.vat_minor, line.deductible_vat_minor,
      line.input_vat_deductibility, line.exempt_turnover_confirmed,
      entry.document_reference, entry.original_document_preserved,
      entry.business_purpose_confirmed, entry.seller_vat_registration_confirmed,
      entry.foreign_service_state, entry.import_state, entry.mixed_use_state,
      entry.uncertain_deductibility_state,
      CASE WHEN entry.entry_type IN ('sales_credit', 'purchase_credit')
        THEN -1::numeric ELSE 1::numeric END AS sign
    FROM public.bookkeeping_entries AS entry
    JOIN public.bookkeeping_entry_lines AS line
      ON line.entry_id = entry.id AND line.entry_version = entry.version AND line.active
    WHERE entry.period_id = p_period_id
      AND entry.status = 'active' AND entry.review_state = 'reviewed'
  )
  SELECT
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'taxable_24' THEN net_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'taxable_11' THEN net_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'exempt_turnover' AND exempt_turnover_confirmed
      THEN net_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment IN ('taxable_24', 'taxable_11')
      THEN vat_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('purchase', 'purchase_credit')
      AND vat_treatment IN ('taxable_24', 'taxable_11')
      AND input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND document_reference IS NOT NULL AND original_document_preserved
      AND business_purpose_confirmed AND seller_vat_registration_confirmed IS TRUE
      AND foreign_service_state <> 'unresolved' AND import_state <> 'unresolved'
      AND mixed_use_state <> 'unresolved' AND uncertain_deductibility_state <> 'unresolved'
      THEN deductible_vat_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'taxable_24' THEN vat_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'taxable_11' THEN vat_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('purchase', 'purchase_credit')
      AND vat_treatment = 'taxable_24'
      AND input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND document_reference IS NOT NULL AND original_document_preserved
      AND business_purpose_confirmed AND seller_vat_registration_confirmed IS TRUE
      AND foreign_service_state <> 'unresolved' AND import_state <> 'unresolved'
      AND mixed_use_state <> 'unresolved' AND uncertain_deductibility_state <> 'unresolved'
      THEN deductible_vat_minor * sign ELSE 0 END), 0),
    coalesce(sum(CASE WHEN entry_type IN ('purchase', 'purchase_credit')
      AND vat_treatment = 'taxable_11'
      AND input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND document_reference IS NOT NULL AND original_document_preserved
      AND business_purpose_confirmed AND seller_vat_registration_confirmed IS TRUE
      AND foreign_service_state <> 'unresolved' AND import_state <> 'unresolved'
      AND mixed_use_state <> 'unresolved' AND uncertain_deductibility_state <> 'unresolved'
      THEN deductible_vat_minor * sign ELSE 0 END), 0)
  INTO v_a, v_b, v_c, v_d, v_e, v_d24, v_d11, v_e24, v_e11
  FROM base;

  IF greatest(
    abs(v_a), abs(v_b), abs(v_c), abs(v_d), abs(v_e), abs(v_d - v_e),
    abs(v_d24), abs(v_d11), abs(v_e24), abs(v_e11)
  ) > 9007199254740991 THEN
    RAISE EXCEPTION 'bookkeeping_amount_overflow';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_calculate_period_summary(
  p_actor_id uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH period_context AS (
    SELECT period.id, period.entity_id
    FROM public.bookkeeping_periods AS period
    WHERE period.id = p_period_id
      AND public.bookkeeping_has_beta_access(p_actor_id)
      AND public.bookkeeping_active_member_role(p_actor_id, period.entity_id) = 'owner'
  ),
  base AS (
    SELECT
      entry.id AS entry_id,
      line.id AS line_id,
      line.vat_treatment,
      line.net_minor,
      line.vat_minor,
      line.deductible_vat_minor,
      CASE WHEN entry.entry_type IN ('sales_credit', 'purchase_credit') THEN -1 ELSE 1 END::bigint AS sign,
      entry.entry_type,
      entry.document_reference,
      entry.original_document_preserved,
      entry.business_purpose_confirmed,
      entry.seller_vat_registration_confirmed,
      entry.foreign_service_state,
      entry.import_state,
      entry.mixed_use_state,
      entry.uncertain_deductibility_state,
      line.input_vat_deductibility,
      line.exempt_turnover_confirmed
    FROM period_context AS context
    JOIN public.bookkeeping_entries AS entry
      ON entry.period_id = context.id
     AND entry.entity_id = context.entity_id
     AND entry.status = 'active'
     AND entry.review_state = 'reviewed'
    JOIN public.bookkeeping_entry_lines AS line
      ON line.entry_id = entry.id
     AND line.entry_version = entry.version
     AND line.active
  ),
  contributions AS (
    SELECT 'A'::text AS field, entry_id, line_id, vat_treatment,
      (net_minor * sign)::bigint AS amount_minor
    FROM base
    WHERE entry_type IN ('sale', 'sales_credit') AND vat_treatment = 'taxable_24'
    UNION ALL
    SELECT 'B', entry_id, line_id, vat_treatment, (net_minor * sign)::bigint
    FROM base
    WHERE entry_type IN ('sale', 'sales_credit') AND vat_treatment = 'taxable_11'
    UNION ALL
    SELECT 'C', entry_id, line_id, vat_treatment, (net_minor * sign)::bigint
    FROM base
    WHERE entry_type IN ('sale', 'sales_credit')
      AND vat_treatment = 'exempt_turnover' AND exempt_turnover_confirmed
    UNION ALL
    SELECT 'D', entry_id, line_id, vat_treatment, (vat_minor * sign)::bigint
    FROM base
    WHERE entry_type IN ('sale', 'sales_credit')
      AND vat_treatment IN ('taxable_24', 'taxable_11')
    UNION ALL
    SELECT 'E', entry_id, line_id, vat_treatment,
      (deductible_vat_minor * sign)::bigint
    FROM base
    WHERE entry_type IN ('purchase', 'purchase_credit')
      AND vat_treatment IN ('taxable_24', 'taxable_11')
      AND input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND document_reference IS NOT NULL
      AND original_document_preserved
      AND business_purpose_confirmed
      AND seller_vat_registration_confirmed IS TRUE
      AND foreign_service_state <> 'unresolved'
      AND import_state <> 'unresolved'
      AND mixed_use_state <> 'unresolved'
      AND uncertain_deductibility_state <> 'unresolved'
  ),
  f_contributions AS (
    SELECT contribution.* FROM contributions AS contribution
    UNION ALL
    SELECT 'F', entry_id, line_id, vat_treatment,
      CASE field WHEN 'D' THEN amount_minor ELSE -amount_minor END
    FROM contributions WHERE field IN ('D', 'E')
  ),
  totals AS (
    SELECT
      coalesce(sum(amount_minor) FILTER (WHERE field = 'A'), 0)::bigint AS a,
      coalesce(sum(amount_minor) FILTER (WHERE field = 'B'), 0)::bigint AS b,
      coalesce(sum(amount_minor) FILTER (WHERE field = 'C'), 0)::bigint AS c,
      coalesce(sum(amount_minor) FILTER (WHERE field = 'D'), 0)::bigint AS d,
      coalesce(sum(amount_minor) FILTER (WHERE field = 'E'), 0)::bigint AS e,
      coalesce(sum(amount_minor) FILTER (
        WHERE field = 'D' AND vat_treatment = 'taxable_24'
      ), 0)::bigint AS d24,
      coalesce(sum(amount_minor) FILTER (
        WHERE field = 'D' AND vat_treatment = 'taxable_11'
      ), 0)::bigint AS d11,
      coalesce(sum(amount_minor) FILTER (
        WHERE field = 'E' AND vat_treatment = 'taxable_24'
      ), 0)::bigint AS e24,
      coalesce(sum(amount_minor) FILTER (
        WHERE field = 'E' AND vat_treatment = 'taxable_11'
      ), 0)::bigint AS e11
    FROM contributions
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM period_context) THEN
    jsonb_build_object(
      'currency', 'ISK',
      'fields', jsonb_build_object(
        'A', totals.a, 'B', totals.b, 'C', totals.c,
        'D', totals.d, 'E', totals.e, 'F', totals.d - totals.e
      ),
      'outputVat24Minor', totals.d24,
      'outputVat11Minor', totals.d11,
      'inputVat24Minor', totals.e24,
      'inputVat11Minor', totals.e11,
      'traces', jsonb_build_object(
        'A', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id) FROM f_contributions WHERE field = 'A'), '[]'::jsonb),
        'B', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id) FROM f_contributions WHERE field = 'B'), '[]'::jsonb),
        'C', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id) FROM f_contributions WHERE field = 'C'), '[]'::jsonb),
        'D', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id) FROM f_contributions WHERE field = 'D'), '[]'::jsonb),
        'E', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id) FROM f_contributions WHERE field = 'E'), '[]'::jsonb),
        'F', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'field', field, 'entryId', entry_id, 'lineId', line_id,
          'amountMinor', amount_minor, 'vatTreatment', vat_treatment
        ) ORDER BY entry_id, line_id, amount_minor) FROM f_contributions WHERE field = 'F'), '[]'::jsonb)
      )
    )
  ELSE NULL END
  FROM totals;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_period_readiness(
  p_actor_id uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH context AS (
    SELECT
      entity.id AS entity_id,
      entity.details_confirmed AS entity_confirmed,
      registration.id AS registration_id,
      registration.active AS registration_active,
      registration.details_confirmed AS registration_confirmed,
      registration.filing_method,
      period.id AS period_id,
      period.starts_on,
      period.ends_on,
      period.due_on,
      period.period_dates_confirmed,
      period.live_form_compared
    FROM public.bookkeeping_periods AS period
    JOIN public.bookkeeping_entities AS entity ON entity.id = period.entity_id
    JOIN public.bookkeeping_vat_registrations AS registration
      ON registration.id = period.vat_registration_id
     AND registration.entity_id = period.entity_id
    WHERE period.id = p_period_id
      AND public.bookkeeping_has_beta_access(p_actor_id)
      AND public.bookkeeping_active_member_role(p_actor_id, period.entity_id) = 'owner'
  ),
  current_entries AS (
    SELECT entry.*
    FROM context
    JOIN public.bookkeeping_entries AS entry ON entry.period_id = context.period_id
    WHERE entry.status = 'active'
  ),
  current_lines AS (
    SELECT line.*, entry.entry_type, entry.document_reference,
      entry.original_document_preserved, entry.business_purpose_confirmed,
      entry.seller_vat_registration_confirmed
    FROM current_entries AS entry
    JOIN public.bookkeeping_entry_lines AS line
      ON line.entry_id = entry.id AND line.entry_version = entry.version AND line.active
  ),
  blockers(code, entry_id, line_id, field, detail_code) AS (
    SELECT 'entity_details_unconfirmed', NULL::uuid, NULL::uuid, NULL::text, NULL::text
    FROM context WHERE NOT entity_confirmed
    UNION ALL SELECT 'vat_registration_inactive', NULL, NULL, NULL, NULL
    FROM context WHERE NOT registration_active
    UNION ALL SELECT 'vat_registration_details_unconfirmed', NULL, NULL, NULL, NULL
    FROM context WHERE NOT registration_confirmed
    UNION ALL SELECT 'period_dates_unconfirmed', NULL, NULL, NULL, NULL
    FROM context WHERE NOT period_dates_confirmed
    UNION ALL SELECT 'period_dates_invalid', NULL, NULL, NULL, NULL
    FROM context WHERE NOT public.bookkeeping_period_dates_valid(
      filing_method, starts_on, ends_on, due_on
    )
    UNION ALL SELECT 'live_form_not_compared', NULL, NULL, NULL, NULL
    FROM context WHERE NOT live_form_compared
    UNION ALL SELECT 'entry_outside_period', entry.id, NULL, 'reportingDate', NULL
    FROM current_entries AS entry CROSS JOIN context
    WHERE entry.reporting_date < context.starts_on OR entry.reporting_date > context.ends_on
    UNION ALL SELECT 'entry_has_no_lines', entry.id, NULL, NULL, NULL
    FROM current_entries AS entry
    WHERE NOT EXISTS (
      SELECT 1 FROM current_lines AS line WHERE line.entry_id = entry.id
    )
    UNION ALL SELECT 'entry_unreviewed', entry.id, NULL, 'reviewState', NULL
    FROM current_entries AS entry WHERE entry.review_state = 'unreviewed'
    UNION ALL SELECT 'entry_needs_review', entry.id, NULL, 'reviewState', NULL
    FROM current_entries AS entry WHERE entry.review_state = 'needs_review'
    UNION ALL SELECT 'vat_treatment_needs_review', line.entry_id, line.id, 'vatTreatment', NULL
    FROM current_lines AS line WHERE line.vat_treatment = 'needs_review'
    UNION ALL SELECT 'input_deductibility_needs_review', line.entry_id, line.id,
      'inputVatDeductibility', NULL
    FROM current_lines AS line
    WHERE line.entry_type IN ('purchase', 'purchase_credit')
      AND line.vat_treatment IN ('taxable_24', 'taxable_11')
      AND line.input_vat_deductibility IN ('not_applicable', 'needs_review')
    UNION ALL SELECT 'exempt_turnover_unconfirmed', line.entry_id, line.id,
      'exemptTurnoverConfirmed', NULL
    FROM current_lines AS line
    WHERE line.vat_treatment = 'exempt_turnover' AND NOT line.exempt_turnover_confirmed
    UNION ALL SELECT 'input_document_reference_missing', line.entry_id, line.id,
      'documentReference', NULL
    FROM current_lines AS line
    WHERE line.entry_type IN ('purchase', 'purchase_credit')
      AND line.input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND line.document_reference IS NULL
    UNION ALL SELECT 'input_original_document_unconfirmed', line.entry_id, line.id,
      'originalDocumentPreserved', NULL
    FROM current_lines AS line
    WHERE line.entry_type IN ('purchase', 'purchase_credit')
      AND line.input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND NOT line.original_document_preserved
    UNION ALL SELECT 'input_business_purpose_unconfirmed', line.entry_id, line.id,
      'businessPurposeConfirmed', NULL
    FROM current_lines AS line
    WHERE line.entry_type IN ('purchase', 'purchase_credit')
      AND line.input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND NOT line.business_purpose_confirmed
    UNION ALL SELECT 'input_seller_vat_registration_unconfirmed', line.entry_id, line.id,
      'sellerVatRegistrationConfirmed', NULL
    FROM current_lines AS line
    WHERE line.entry_type IN ('purchase', 'purchase_credit')
      AND line.input_vat_deductibility IN ('fully_deductible', 'partially_deductible')
      AND line.seller_vat_registration_confirmed IS DISTINCT FROM true
    UNION ALL SELECT 'manual_override_reason_missing', line.entry_id, line.id,
      'manualVatOverrideReason', NULL
    FROM current_lines AS line
    WHERE line.manual_vat_override AND line.manual_vat_override_reason IS NULL
    UNION ALL SELECT 'foreign_service_unresolved', entry.id, NULL, NULL, NULL
    FROM current_entries AS entry WHERE entry.foreign_service_state = 'unresolved'
    UNION ALL SELECT 'import_unresolved', entry.id, NULL, NULL, NULL
    FROM current_entries AS entry WHERE entry.import_state = 'unresolved'
    UNION ALL SELECT 'mixed_use_unresolved', entry.id, NULL, NULL, NULL
    FROM current_entries AS entry WHERE entry.mixed_use_state = 'unresolved'
    UNION ALL SELECT 'uncertain_deductibility_unresolved', entry.id, NULL, NULL, NULL
    FROM current_entries AS entry WHERE entry.uncertain_deductibility_state = 'unresolved'
    UNION ALL SELECT 'special_case_resolution_note_missing', entry.id, NULL,
      'specialCaseResolutionNote', NULL
    FROM current_entries AS entry
    WHERE 'resolved' IN (
      entry.foreign_service_state, entry.import_state,
      entry.mixed_use_state, entry.uncertain_deductibility_state
    ) AND entry.special_case_resolution_note IS NULL
    UNION ALL SELECT 'duplicate_document_reference', entry.id, NULL,
      'documentReference', NULL
    FROM current_entries AS entry
    JOIN (
      SELECT entry_type,
        upper(regexp_replace(coalesce(counterparty, ''), '\s+', ' ', 'g')) AS counterparty_key,
        upper(coalesce(document_type, '')) AS type_key,
        upper(document_reference) AS reference_key
      FROM current_entries
      WHERE document_reference IS NOT NULL
      GROUP BY entry_type,
        upper(regexp_replace(coalesce(counterparty, ''), '\s+', ' ', 'g')),
        upper(coalesce(document_type, '')), upper(document_reference)
      HAVING count(*) > 1
    ) AS duplicate
      ON duplicate.entry_type = entry.entry_type
     AND duplicate.counterparty_key = upper(
       regexp_replace(coalesce(entry.counterparty, ''), '\s+', ' ', 'g')
     )
     AND duplicate.type_key = upper(coalesce(entry.document_type, ''))
     AND duplicate.reference_key = upper(entry.document_reference)
    WHERE NOT entry.duplicate_reference_confirmed
  ),
  blocker_rows AS (
    SELECT DISTINCT code, entry_id, line_id, field, detail_code FROM blockers
  ),
  counts AS (
    SELECT code, count(*)::integer AS count FROM blocker_rows GROUP BY code
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM context) THEN jsonb_build_object(
    'isReady', NOT EXISTS (SELECT 1 FROM blocker_rows),
    'blockers', coalesce((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'code', code, 'entryId', entry_id, 'lineId', line_id,
        'field', field, 'detailCode', detail_code
      )) ORDER BY code, entry_id, line_id)
      FROM blocker_rows
    ), '[]'::jsonb),
    'blockerCounts', coalesce((
      SELECT jsonb_object_agg(code, count ORDER BY code) FROM counts
    ), '{}'::jsonb)
  ) ELSE NULL END;
$$;

-- ---------------------------------------------------------------------------
-- Tenant, period and entry mutations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bookkeeping_create_entity(
  p_actor_id uuid,
  p_request_id uuid,
  p_display_name text,
  p_legal_name text,
  p_legal_identifier text,
  p_default_currency text,
  p_entity_details_confirmed boolean,
  p_vat_number text,
  p_vat_label text,
  p_filing_method text,
  p_registration_details_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_registration_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_display_name IS NULL
     OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 160
     OR (p_legal_name IS NOT NULL
       AND char_length(btrim(p_legal_name)) NOT BETWEEN 1 AND 200)
     OR (p_legal_identifier IS NOT NULL
       AND char_length(btrim(p_legal_identifier)) NOT BETWEEN 1 AND 32)
     OR p_default_currency IS NULL OR p_default_currency <> 'ISK'
     OR p_entity_details_confirmed IS NULL
     OR p_vat_number IS NULL
     OR char_length(btrim(p_vat_number)) NOT BETWEEN 1 AND 40
     OR (p_vat_label IS NOT NULL
       AND char_length(btrim(p_vat_label)) NOT BETWEEN 1 AND 120)
     OR p_filing_method IS NULL OR p_filing_method NOT IN (
       'general_bimonthly', 'monthly', 'annual', 'agricultural', 'other'
     )
     OR p_registration_details_confirmed IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'displayName', btrim(p_display_name),
    'legalName', NULLIF(btrim(p_legal_name), ''),
    'legalIdentifier', NULLIF(btrim(p_legal_identifier), ''),
    'defaultCurrency', p_default_currency,
    'entityDetailsConfirmed', p_entity_details_confirmed,
    'vatNumber', btrim(p_vat_number),
    'vatLabel', NULLIF(btrim(p_vat_label), ''),
    'filingMethod', p_filing_method,
    'registrationDetailsConfirmed', p_registration_details_confirmed
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_create_entity', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  INSERT INTO public.bookkeeping_entities (
    id, display_name, legal_name, legal_identifier, default_currency,
    details_confirmed, created_by, updated_by
  ) VALUES (
    v_entity_id, btrim(p_display_name), NULLIF(btrim(p_legal_name), ''),
    NULLIF(btrim(p_legal_identifier), ''), p_default_currency,
    p_entity_details_confirmed, p_actor_id, p_actor_id
  );
  INSERT INTO public.bookkeeping_entity_members (
    id, entity_id, user_id, display_name, role, status
  ) VALUES (
    v_member_id, v_entity_id, p_actor_id, btrim(p_display_name), 'owner', 'active'
  );
  INSERT INTO public.bookkeeping_vat_registrations (
    id, entity_id, vat_number, label, filing_method, details_confirmed,
    created_by, updated_by
  ) VALUES (
    v_registration_id, v_entity_id, btrim(p_vat_number),
    NULLIF(btrim(p_vat_label), ''), p_filing_method,
    p_registration_details_confirmed, p_actor_id, p_actor_id
  );
  PERFORM public.bookkeeping_record_activity(
    v_entity_id, NULL, NULL, 'entity_created', p_actor_id, 1, NULL, NULL
  );
  PERFORM public.bookkeeping_record_activity(
    v_entity_id, NULL, NULL, 'vat_registration_added', p_actor_id, 1, NULL, NULL
  );

  v_result := jsonb_build_object(
    'entity_id', v_entity_id,
    'member_id', v_member_id,
    'registration_id', v_registration_id
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_add_vat_registration(
  p_actor_id uuid,
  p_request_id uuid,
  p_entity_id uuid,
  p_vat_number text,
  p_label text,
  p_filing_method text,
  p_details_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity public.bookkeeping_entities%ROWTYPE;
  v_registration_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_id IS NULL OR p_vat_number IS NULL
     OR char_length(btrim(p_vat_number)) NOT BETWEEN 1 AND 40
     OR (p_label IS NOT NULL AND char_length(btrim(p_label)) NOT BETWEEN 1 AND 120)
     OR p_filing_method IS NULL OR p_filing_method NOT IN (
       'general_bimonthly', 'monthly', 'annual', 'agricultural', 'other'
     ) OR p_details_confirmed IS NULL THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'entityId', p_entity_id, 'vatNumber', btrim(p_vat_number),
    'label', NULLIF(btrim(p_label), ''), 'filingMethod', p_filing_method,
    'detailsConfirmed', p_details_confirmed
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_add_vat_registration', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT entity.* INTO v_entity
  FROM public.bookkeeping_entities AS entity
  WHERE entity.id = p_entity_id FOR UPDATE;
  IF v_entity.id IS NULL OR v_entity.status <> 'active' THEN
    RAISE EXCEPTION 'bookkeeping_not_allowed';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, p_entity_id);

  INSERT INTO public.bookkeeping_vat_registrations (
    id, entity_id, vat_number, label, filing_method, details_confirmed,
    created_by, updated_by
  ) VALUES (
    v_registration_id, p_entity_id, btrim(p_vat_number),
    NULLIF(btrim(p_label), ''), p_filing_method, p_details_confirmed,
    p_actor_id, p_actor_id
  );
  UPDATE public.bookkeeping_entities AS entity
  SET version = entity.version + 1, updated_by = p_actor_id
  WHERE entity.id = p_entity_id
  RETURNING entity.version INTO v_entity.version;
  PERFORM public.bookkeeping_record_activity(
    p_entity_id, NULL, NULL, 'vat_registration_added', p_actor_id,
    v_entity.version, NULL, NULL
  );

  v_result := jsonb_build_object(
    'registration_id', v_registration_id, 'entity_version', v_entity.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_create_period(
  p_actor_id uuid,
  p_request_id uuid,
  p_entity_id uuid,
  p_registration_id uuid,
  p_filing_method text,
  p_starts_on date,
  p_ends_on date,
  p_due_on date,
  p_period_dates_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_registration public.bookkeeping_vat_registrations%ROWTYPE;
  v_period_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_id IS NULL OR p_registration_id IS NULL
     OR p_period_dates_confirmed IS NULL
     OR NOT public.bookkeeping_period_dates_valid(
       p_filing_method, p_starts_on, p_ends_on, p_due_on
     ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_period';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'entityId', p_entity_id, 'registrationId', p_registration_id,
    'filingMethod', p_filing_method, 'startsOn', p_starts_on,
    'endsOn', p_ends_on, 'dueOn', p_due_on,
    'periodDatesConfirmed', p_period_dates_confirmed
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_create_period', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT registration.* INTO v_registration
  FROM public.bookkeeping_vat_registrations AS registration
  WHERE registration.id = p_registration_id
    AND registration.entity_id = p_entity_id
  FOR UPDATE;
  IF v_registration.id IS NULL OR NOT v_registration.active
     OR v_registration.filing_method <> p_filing_method THEN
    RAISE EXCEPTION 'bookkeeping_not_allowed';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, p_entity_id);

  INSERT INTO public.bookkeeping_periods (
    id, entity_id, vat_registration_id, starts_on, ends_on, due_on,
    period_dates_confirmed, created_by, updated_by
  ) VALUES (
    v_period_id, p_entity_id, p_registration_id, p_starts_on, p_ends_on,
    p_due_on, p_period_dates_confirmed, p_actor_id, p_actor_id
  );
  PERFORM public.bookkeeping_record_activity(
    p_entity_id, v_period_id, NULL, 'period_created', p_actor_id,
    NULL, 1, NULL
  );
  v_result := jsonb_build_object('period_id', v_period_id, 'version', 1);
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_create_entry(
  p_actor_id uuid,
  p_request_id uuid,
  p_period_id uuid,
  p_entry jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
  v_entry_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.bookkeeping_assert_entry_payload(p_entry);
  IF p_period_id IS NULL
     OR (jsonb_typeof(p_entry->'entry_id') = 'string')
     OR (jsonb_typeof(p_entry->'expected_version') = 'number')
     OR (p_entry ? 'period_id' AND jsonb_typeof(p_entry->'period_id') = 'string'
       AND (p_entry->>'period_id')::uuid <> p_period_id) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'periodId', p_period_id,
    'entry', p_entry - ARRAY[
      'request_id', 'entry_id', 'expected_version', 'entity_id',
      'vat_registration_id', 'period_id'
    ]::text[]
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_create_entry', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT period.* INTO v_period
  FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL OR v_period.state NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF (p_entry ? 'entity_id' AND jsonb_typeof(p_entry->'entity_id') = 'string'
        AND (p_entry->>'entity_id')::uuid <> v_period.entity_id)
     OR (p_entry ? 'vat_registration_id'
        AND jsonb_typeof(p_entry->'vat_registration_id') = 'string'
        AND (p_entry->>'vat_registration_id')::uuid <> v_period.vat_registration_id) THEN
    RAISE EXCEPTION 'bookkeeping_tenant_mismatch';
  END IF;

  INSERT INTO public.bookkeeping_entries (
    id, entity_id, vat_registration_id, period_id, entry_type,
    document_date, reporting_date, counterparty, description, document_type,
    document_reference, duplicate_reference_confirmed, currency, source_type,
    review_state, original_document_preserved, business_purpose_confirmed,
    seller_vat_registration_confirmed, foreign_service_state, import_state,
    mixed_use_state, uncertain_deductibility_state,
    special_case_resolution_note, note, created_by, updated_by
  ) VALUES (
    v_entry_id, v_period.entity_id, v_period.vat_registration_id, p_period_id,
    p_entry->>'type', (p_entry->>'document_date')::date,
    (p_entry->>'reporting_date')::date, NULLIF(btrim(p_entry->>'counterparty'), ''),
    btrim(p_entry->>'description'), NULLIF(btrim(p_entry->>'document_type'), ''),
    NULLIF(btrim(p_entry->>'document_reference'), ''),
    (p_entry->>'duplicate_reference_confirmed')::boolean,
    p_entry->>'currency', p_entry->>'source_type', p_entry->>'review_state',
    (p_entry->>'original_document_preserved')::boolean,
    (p_entry->>'business_purpose_confirmed')::boolean,
    CASE WHEN jsonb_typeof(p_entry->'seller_vat_registration_confirmed') = 'boolean'
      THEN (p_entry->>'seller_vat_registration_confirmed')::boolean ELSE NULL END,
    p_entry->'special_cases'->>'foreign_service',
    p_entry->'special_cases'->>'import', p_entry->'special_cases'->>'mixed_use',
    p_entry->'special_cases'->>'uncertain_deductibility',
    NULLIF(btrim(p_entry->>'special_case_resolution_note'), ''),
    NULLIF(btrim(p_entry->>'note'), ''), p_actor_id, p_actor_id
  );
  PERFORM public.bookkeeping_replace_entry_lines(
    p_actor_id, v_period.entity_id, p_period_id, v_entry_id, 1, p_entry
  );
  PERFORM public.bookkeeping_capture_entry_revision(p_actor_id, v_entry_id);
  PERFORM public.bookkeeping_assert_period_summary_safe(p_period_id);
  UPDATE public.bookkeeping_periods AS period
  SET state = 'review', version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = p_period_id
  RETURNING period.version INTO v_period.version;
  PERFORM public.bookkeeping_record_activity(
    v_period.entity_id, p_period_id, v_entry_id, 'entry_created', p_actor_id,
    NULL, v_period.version, 1
  );
  v_result := jsonb_build_object(
    'entry_id', v_entry_id, 'version', 1, 'period_id', p_period_id,
    'period_version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_update_entry(
  p_actor_id uuid,
  p_request_id uuid,
  p_entry_id uuid,
  p_expected_version bigint,
  p_entry jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.bookkeeping_entries%ROWTYPE;
  v_period public.bookkeeping_periods%ROWTYPE;
  v_period_id uuid;
  v_new_version bigint;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.bookkeeping_assert_entry_payload(p_entry);
  IF p_entry_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR (p_entry ? 'entry_id' AND jsonb_typeof(p_entry->'entry_id') = 'string'
       AND (p_entry->>'entry_id')::uuid <> p_entry_id)
     OR (p_entry ? 'expected_version'
       AND jsonb_typeof(p_entry->'expected_version') = 'number'
       AND (p_entry->>'expected_version')::bigint <> p_expected_version) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'entryId', p_entry_id, 'expectedVersion', p_expected_version,
    'entry', p_entry - ARRAY[
      'request_id', 'entry_id', 'expected_version', 'entity_id',
      'vat_registration_id', 'period_id'
    ]::text[]
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_update_entry', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT entry.period_id INTO v_period_id
  FROM public.bookkeeping_entries AS entry WHERE entry.id = p_entry_id;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  SELECT period.* INTO v_period
  FROM public.bookkeeping_periods AS period
  WHERE period.id = v_period_id FOR UPDATE;
  SELECT entry.* INTO v_entry
  FROM public.bookkeeping_entries AS entry
  WHERE entry.id = p_entry_id AND entry.period_id = v_period_id FOR UPDATE;

  IF v_period.state NOT IN ('draft', 'review') OR v_entry.status <> 'active' THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_entry.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;
  IF (p_entry ? 'entity_id' AND jsonb_typeof(p_entry->'entity_id') = 'string'
        AND (p_entry->>'entity_id')::uuid <> v_entry.entity_id)
     OR (p_entry ? 'vat_registration_id'
        AND jsonb_typeof(p_entry->'vat_registration_id') = 'string'
        AND (p_entry->>'vat_registration_id')::uuid <> v_entry.vat_registration_id)
     OR (p_entry ? 'period_id' AND jsonb_typeof(p_entry->'period_id') = 'string'
        AND (p_entry->>'period_id')::uuid <> v_entry.period_id) THEN
    RAISE EXCEPTION 'bookkeeping_tenant_mismatch';
  END IF;

  v_new_version := v_entry.version + 1;
  UPDATE public.bookkeeping_entries AS entry
  SET entry_type = p_entry->>'type',
      document_date = (p_entry->>'document_date')::date,
      reporting_date = (p_entry->>'reporting_date')::date,
      counterparty = NULLIF(btrim(p_entry->>'counterparty'), ''),
      description = btrim(p_entry->>'description'),
      document_type = NULLIF(btrim(p_entry->>'document_type'), ''),
      document_reference = NULLIF(btrim(p_entry->>'document_reference'), ''),
      duplicate_reference_confirmed = (p_entry->>'duplicate_reference_confirmed')::boolean,
      currency = p_entry->>'currency', source_type = p_entry->>'source_type',
      review_state = p_entry->>'review_state',
      original_document_preserved = (p_entry->>'original_document_preserved')::boolean,
      business_purpose_confirmed = (p_entry->>'business_purpose_confirmed')::boolean,
      seller_vat_registration_confirmed = CASE
        WHEN jsonb_typeof(p_entry->'seller_vat_registration_confirmed') = 'boolean'
          THEN (p_entry->>'seller_vat_registration_confirmed')::boolean ELSE NULL END,
      foreign_service_state = p_entry->'special_cases'->>'foreign_service',
      import_state = p_entry->'special_cases'->>'import',
      mixed_use_state = p_entry->'special_cases'->>'mixed_use',
      uncertain_deductibility_state = p_entry->'special_cases'->>'uncertain_deductibility',
      special_case_resolution_note = NULLIF(btrim(p_entry->>'special_case_resolution_note'), ''),
      note = NULLIF(btrim(p_entry->>'note'), ''),
      version = v_new_version, updated_by = p_actor_id
  WHERE entry.id = p_entry_id;
  PERFORM public.bookkeeping_replace_entry_lines(
    p_actor_id, v_entry.entity_id, v_entry.period_id, p_entry_id,
    v_new_version, p_entry
  );
  PERFORM public.bookkeeping_capture_entry_revision(p_actor_id, p_entry_id);
  PERFORM public.bookkeeping_assert_period_summary_safe(v_entry.period_id);
  UPDATE public.bookkeeping_periods AS period
  SET state = 'review', version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = v_entry.period_id
  RETURNING period.version INTO v_period.version;
  PERFORM public.bookkeeping_record_activity(
    v_entry.entity_id, v_entry.period_id, p_entry_id, 'entry_updated', p_actor_id,
    NULL, v_period.version, v_new_version
  );
  v_result := jsonb_build_object(
    'entry_id', p_entry_id, 'version', v_new_version,
    'period_id', v_entry.period_id, 'period_version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_set_entry_review_status(
  p_actor_id uuid,
  p_request_id uuid,
  p_entry_id uuid,
  p_expected_version bigint,
  p_review_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.bookkeeping_entries%ROWTYPE;
  v_period public.bookkeeping_periods%ROWTYPE;
  v_period_id uuid;
  v_new_version bigint;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entry_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_review_status IS NULL
     OR p_review_status NOT IN ('unreviewed', 'reviewed', 'needs_review') THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'entryId', p_entry_id, 'expectedVersion', p_expected_version,
    'reviewStatus', p_review_status
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_set_entry_review_status', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT entry.period_id INTO v_period_id
  FROM public.bookkeeping_entries AS entry WHERE entry.id = p_entry_id;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = v_period_id FOR UPDATE;
  SELECT entry.* INTO v_entry FROM public.bookkeeping_entries AS entry
  WHERE entry.id = p_entry_id AND entry.period_id = v_period_id FOR UPDATE;
  IF v_period.state NOT IN ('draft', 'review') OR v_entry.status <> 'active' THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_entry.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;

  v_new_version := v_entry.version + 1;
  UPDATE public.bookkeeping_entries AS entry
  SET review_state = p_review_status, version = v_new_version, updated_by = p_actor_id
  WHERE entry.id = p_entry_id;
  -- Review-only edits clone the unchanged numeric revision. Moving the old
  -- rows forward would make the previous header version unreconstructable.
  PERFORM public.bookkeeping_clone_entry_lines(p_actor_id, p_entry_id, v_new_version);
  PERFORM public.bookkeeping_capture_entry_revision(p_actor_id, p_entry_id);
  PERFORM public.bookkeeping_assert_period_summary_safe(v_period_id);
  UPDATE public.bookkeeping_periods AS period
  SET state = 'review', version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = v_period_id RETURNING period.version INTO v_period.version;
  PERFORM public.bookkeeping_record_activity(
    v_entry.entity_id, v_period_id, p_entry_id, 'entry_review_changed', p_actor_id,
    NULL, v_period.version, v_new_version
  );
  v_result := jsonb_build_object(
    'entry_id', p_entry_id, 'version', v_new_version,
    'period_id', v_period_id, 'period_version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_void_entry(
  p_actor_id uuid,
  p_request_id uuid,
  p_entry_id uuid,
  p_expected_version bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.bookkeeping_entries%ROWTYPE;
  v_period public.bookkeeping_periods%ROWTYPE;
  v_period_id uuid;
  v_new_version bigint;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_entry_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'entryId', p_entry_id, 'expectedVersion', p_expected_version,
    'reason', btrim(p_reason)
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_void_entry', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT entry.period_id INTO v_period_id
  FROM public.bookkeeping_entries AS entry WHERE entry.id = p_entry_id;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_not_found'; END IF;
  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = v_period_id FOR UPDATE;
  SELECT entry.* INTO v_entry FROM public.bookkeeping_entries AS entry
  WHERE entry.id = p_entry_id AND entry.period_id = v_period_id FOR UPDATE;
  IF v_period.state NOT IN ('draft', 'review') OR v_entry.status <> 'active' THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_entry.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;

  v_new_version := v_entry.version + 1;
  UPDATE public.bookkeeping_entries AS entry
  SET status = 'voided', voided_at = now(), voided_reason = btrim(p_reason),
      voided_by = p_actor_id, version = v_new_version, updated_by = p_actor_id
  WHERE entry.id = p_entry_id;
  PERFORM public.bookkeeping_clone_entry_lines(p_actor_id, p_entry_id, v_new_version);
  PERFORM public.bookkeeping_capture_entry_revision(p_actor_id, p_entry_id);
  PERFORM public.bookkeeping_assert_period_summary_safe(v_period_id);
  UPDATE public.bookkeeping_periods AS period
  SET state = 'review', version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = v_period_id RETURNING period.version INTO v_period.version;
  PERFORM public.bookkeeping_record_activity(
    v_entry.entity_id, v_period_id, p_entry_id, 'entry_voided', p_actor_id,
    NULL, v_period.version, v_new_version
  );
  v_result := jsonb_build_object(
    'entry_id', p_entry_id, 'version', v_new_version,
    'period_id', v_period_id, 'period_version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_set_period_ready(
  p_actor_id uuid,
  p_request_id uuid,
  p_period_id uuid,
  p_expected_version bigint,
  p_live_form_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
  v_readiness jsonb;
  v_summary jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_period_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_live_form_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'periodId', p_period_id, 'expectedVersion', p_expected_version,
    'liveFormConfirmed', p_live_form_confirmed
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_set_period_ready', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL OR v_period.state NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_period.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;

  UPDATE public.bookkeeping_periods AS period
  SET live_form_compared = true, version = period.version + 1,
      updated_by = p_actor_id
  WHERE period.id = p_period_id
  RETURNING period.* INTO v_period;
  v_readiness := public.bookkeeping_period_readiness(p_actor_id, p_period_id);
  IF v_readiness IS NULL OR (v_readiness->>'isReady')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'bookkeeping_not_ready';
  END IF;
  PERFORM public.bookkeeping_assert_period_summary_safe(p_period_id);
  v_summary := public.bookkeeping_calculate_period_summary(p_actor_id, p_period_id);

  UPDATE public.bookkeeping_periods AS period
  SET state = 'ready', updated_by = p_actor_id
  WHERE period.id = p_period_id;
  PERFORM public.bookkeeping_record_activity(
    v_period.entity_id, p_period_id, NULL, 'period_ready', p_actor_id,
    NULL, v_period.version, NULL,
    jsonb_build_object('from_state', v_period.state, 'to_state', 'ready')
  );
  v_result := jsonb_build_object(
    'period_id', p_period_id, 'status', 'ready',
    'version', v_period.version, 'summary', v_summary - 'traces'
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_record_filing(
  p_actor_id uuid,
  p_request_id uuid,
  p_period_id uuid,
  p_expected_version bigint,
  p_submitted_on date,
  p_due_on date,
  p_fields jsonb,
  p_reported_result_minor bigint,
  p_result_mismatch_reason text,
  p_confirmation_reference text,
  p_note text,
  p_payment_status text,
  p_paid_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
  v_summary jsonb;
  v_snapshot_id uuid := gen_random_uuid();
  v_submission_no integer;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_period_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_submitted_on IS NULL
     OR p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object'
     OR (p_fields - ARRAY['A', 'B', 'C', 'D', 'E', 'F']::text[]) <> '{}'::jsonb
     OR NOT (p_fields ?& ARRAY['A', 'B', 'C', 'D', 'E', 'F']::text[])
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_fields) AS field(key, value)
       WHERE jsonb_typeof(field.value) <> 'number'
          OR (field.value #>> '{}') !~ '^-?[0-9]+$'
          OR (field.value #>> '{}')::numeric
             NOT BETWEEN -9007199254740991 AND 9007199254740991
     )
     OR (p_fields->>'F')::numeric <> (p_fields->>'D')::numeric - (p_fields->>'E')::numeric
     OR p_reported_result_minor IS NULL
     OR p_reported_result_minor NOT BETWEEN -9007199254740991 AND 9007199254740991
     OR (p_reported_result_minor <> (p_fields->>'F')::bigint AND (
       p_result_mismatch_reason IS NULL
       OR char_length(btrim(p_result_mismatch_reason)) NOT BETWEEN 1 AND 1000
     ))
     OR (p_confirmation_reference IS NOT NULL
       AND char_length(btrim(p_confirmation_reference)) NOT BETWEEN 1 AND 200)
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000)
     OR p_payment_status IS NULL OR p_payment_status NOT IN ('unpaid', 'paid', 'credit')
     OR (p_payment_status = 'paid' AND p_paid_on IS NULL)
     OR (p_payment_status <> 'paid' AND p_paid_on IS NOT NULL) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_filing';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'periodId', p_period_id, 'expectedVersion', p_expected_version,
    'submittedOn', p_submitted_on, 'dueOn', p_due_on, 'fields', p_fields,
    'reportedResultMinor', p_reported_result_minor,
    'resultMismatchReason', NULLIF(btrim(p_result_mismatch_reason), ''),
    'confirmationReference', NULLIF(btrim(p_confirmation_reference), ''),
    'note', NULLIF(btrim(p_note), ''), 'paymentStatus', p_payment_status,
    'paidOn', p_paid_on
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_record_filing', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL OR v_period.state <> 'ready' THEN
    RAISE EXCEPTION 'bookkeeping_period_locked';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_period.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;
  IF p_due_on IS DISTINCT FROM v_period.due_on THEN
    RAISE EXCEPTION 'bookkeeping_filing_due_date_conflict';
  END IF;

  PERFORM public.bookkeeping_assert_period_summary_safe(p_period_id);
  v_summary := public.bookkeeping_calculate_period_summary(p_actor_id, p_period_id);
  IF v_summary IS NULL OR p_fields <> v_summary->'fields' THEN
    RAISE EXCEPTION 'bookkeeping_filing_summary_conflict';
  END IF;
  SELECT coalesce(max(snapshot.submission_no), 0) + 1
  INTO v_submission_no
  FROM public.bookkeeping_filing_snapshots AS snapshot
  WHERE snapshot.period_id = p_period_id;

  INSERT INTO public.bookkeeping_filing_snapshots (
    id, entity_id, period_id, submission_no,
    a_minor, b_minor, c_minor, d_minor, e_minor, f_minor,
    output_vat_24_minor, output_vat_11_minor,
    input_vat_24_minor, input_vat_11_minor,
    submitted_on, due_on, reported_result_minor, result_mismatch_reason,
    confirmation_reference, note, payment_state_at_filing,
    paid_on_at_filing, created_by
  ) VALUES (
    v_snapshot_id, v_period.entity_id, p_period_id, v_submission_no,
    (p_fields->>'A')::bigint, (p_fields->>'B')::bigint,
    (p_fields->>'C')::bigint, (p_fields->>'D')::bigint,
    (p_fields->>'E')::bigint, (p_fields->>'F')::bigint,
    (v_summary->>'outputVat24Minor')::bigint,
    (v_summary->>'outputVat11Minor')::bigint,
    (v_summary->>'inputVat24Minor')::bigint,
    (v_summary->>'inputVat11Minor')::bigint,
    p_submitted_on, p_due_on, p_reported_result_minor,
    NULLIF(btrim(p_result_mismatch_reason), ''),
    NULLIF(btrim(p_confirmation_reference), ''), NULLIF(btrim(p_note), ''),
    p_payment_status, p_paid_on, p_actor_id
  );

  UPDATE public.bookkeeping_periods AS period
  SET state = CASE WHEN p_payment_status = 'paid' THEN 'paid' ELSE 'submitted' END,
      submitted_at = now(), current_payment_state = p_payment_status,
      current_paid_on = p_paid_on, version = period.version + 1,
      updated_by = p_actor_id
  WHERE period.id = p_period_id RETURNING period.* INTO v_period;
  PERFORM public.bookkeeping_record_activity(
    v_period.entity_id, p_period_id, NULL, 'filing_recorded', p_actor_id,
    NULL, v_period.version, NULL,
    jsonb_build_object(
      'from_state', 'ready', 'to_state', v_period.state,
      'submission_no', v_submission_no, 'payment_state', p_payment_status
    )
  );
  v_result := jsonb_build_object(
    'period_id', p_period_id, 'status', v_period.state,
    'version', v_period.version, 'snapshot_id', v_snapshot_id,
    'submission_no', v_submission_no
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_reopen_period(
  p_actor_id uuid,
  p_request_id uuid,
  p_period_id uuid,
  p_expected_version bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
  v_previous_state text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_period_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'periodId', p_period_id, 'expectedVersion', p_expected_version,
    'reason', btrim(p_reason)
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_reopen_period', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL OR v_period.state NOT IN ('ready', 'submitted', 'paid') THEN
    RAISE EXCEPTION 'bookkeeping_period_not_reopenable';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_period.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;
  v_previous_state := v_period.state;
  UPDATE public.bookkeeping_periods AS period
  SET state = 'review', live_form_compared = false, reopened_at = now(),
      reopen_reason = btrim(p_reason), version = period.version + 1,
      updated_by = p_actor_id
  WHERE period.id = p_period_id RETURNING period.* INTO v_period;
  PERFORM public.bookkeeping_record_activity(
    v_period.entity_id, p_period_id, NULL, 'period_reopened', p_actor_id,
    NULL, v_period.version, NULL,
    jsonb_build_object('from_state', v_previous_state, 'to_state', 'review')
  );
  v_result := jsonb_build_object(
    'period_id', p_period_id, 'status', 'review', 'version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_record_payment(
  p_actor_id uuid,
  p_request_id uuid,
  p_period_id uuid,
  p_expected_version bigint,
  p_payment_status text,
  p_paid_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  IF p_period_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_payment_status IS NULL OR p_payment_status NOT IN ('unpaid', 'paid', 'credit')
     OR (p_payment_status = 'paid' AND p_paid_on IS NULL)
     OR (p_payment_status <> 'paid' AND p_paid_on IS NOT NULL) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_payment';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'periodId', p_period_id, 'expectedVersion', p_expected_version,
    'paymentStatus', p_payment_status, 'paidOn', p_paid_on
  )::text);
  v_replay := public.bookkeeping_begin_request(
    p_actor_id, p_request_id, 'bookkeeping_record_payment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL OR v_period.state NOT IN ('submitted', 'paid')
     OR NOT EXISTS (
       SELECT 1 FROM public.bookkeeping_filing_snapshots AS snapshot
       WHERE snapshot.period_id = p_period_id
     ) THEN
    RAISE EXCEPTION 'bookkeeping_payment_not_allowed';
  END IF;
  PERFORM public.bookkeeping_assert_owner(p_actor_id, v_period.entity_id);
  IF v_period.version <> p_expected_version THEN
    RAISE EXCEPTION 'bookkeeping_version_conflict';
  END IF;
  UPDATE public.bookkeeping_periods AS period
  SET state = CASE WHEN p_payment_status = 'paid' THEN 'paid' ELSE 'submitted' END,
      current_payment_state = p_payment_status, current_paid_on = p_paid_on,
      version = period.version + 1, updated_by = p_actor_id
  WHERE period.id = p_period_id RETURNING period.* INTO v_period;
  PERFORM public.bookkeeping_record_activity(
    v_period.entity_id, p_period_id, NULL, 'payment_recorded', p_actor_id,
    NULL, v_period.version, NULL,
    jsonb_build_object('payment_state', p_payment_status)
  );
  v_result := jsonb_build_object(
    'period_id', p_period_id, 'status', v_period.state, 'version', v_period.version
  );
  PERFORM public.bookkeeping_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Private JSON projection helpers and membership-checking read RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bookkeeping_entity_json(p_entity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', entity.id,
    'ownerUserId', (
      SELECT member.user_id FROM public.bookkeeping_entity_members AS member
      WHERE member.entity_id = entity.id AND member.role = 'owner'
        AND member.status = 'active' AND member.user_id IS NOT NULL LIMIT 1
    ),
    'displayName', entity.display_name,
    'legalName', entity.legal_name,
    'defaultCurrency', entity.default_currency,
    'detailsConfirmed', entity.details_confirmed,
    'createdAt', entity.created_at,
    'updatedAt', entity.updated_at
  )
  FROM public.bookkeeping_entities AS entity WHERE entity.id = p_entity_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_registration_json(p_registration_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', registration.id, 'entityId', registration.entity_id,
    'vatNumber', registration.vat_number, 'label', registration.label,
    'filingMethod', registration.filing_method,
    'detailsConfirmed', registration.details_confirmed,
    'active', registration.active, 'createdAt', registration.created_at,
    'updatedAt', registration.updated_at
  )
  FROM public.bookkeeping_vat_registrations AS registration
  WHERE registration.id = p_registration_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_period_json(p_period_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', period.id, 'entityId', period.entity_id,
    'vatRegistrationId', period.vat_registration_id,
    'startsOn', period.starts_on, 'endsOn', period.ends_on,
    'dueOn', period.due_on, 'state', period.state,
    'periodDatesConfirmed', period.period_dates_confirmed,
    'liveFormCompared', period.live_form_compared,
    'version', period.version, 'submittedAt', period.submitted_at,
    'reopenedAt', period.reopened_at, 'reopenReason', period.reopen_reason,
    'createdAt', period.created_at, 'updatedAt', period.updated_at
  )
  FROM public.bookkeeping_periods AS period WHERE period.id = p_period_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_entry_json(p_entry_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', entry.id, 'entityId', entry.entity_id,
    'vatRegistrationId', entry.vat_registration_id, 'periodId', entry.period_id,
    'type', entry.entry_type, 'documentDate', entry.document_date,
    'reportingDate', entry.reporting_date, 'counterparty', entry.counterparty,
    'description', entry.description, 'documentType', entry.document_type,
    'documentReference', entry.document_reference,
    'duplicateReferenceConfirmed', entry.duplicate_reference_confirmed,
    'currency', entry.currency, 'sourceType', entry.source_type,
    'sourceId', entry.source_id, 'sourceReference', entry.source_reference,
    'reviewState', entry.review_state,
    'evidence', jsonb_build_object(
      'originalDocumentPreserved', entry.original_document_preserved,
      'businessPurposeConfirmed', entry.business_purpose_confirmed,
      'sellerVatRegistrationConfirmed', entry.seller_vat_registration_confirmed
    ),
    'specialCases', jsonb_build_object(
      'foreignService', entry.foreign_service_state,
      'import', entry.import_state,
      'mixedUse', entry.mixed_use_state,
      'uncertainDeductibility', entry.uncertain_deductibility_state
    ),
    'specialCaseResolutionNote', entry.special_case_resolution_note,
    'note', entry.note,
    'version', entry.version, 'voidedAt', entry.voided_at,
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', line.id, 'entryId', line.entry_id,
        'categoryCode', line.category_code, 'description', line.description,
        'vatTreatment', line.vat_treatment, 'currency', line.currency,
        'amountIncludesVat', line.amount_includes_vat,
        'grossMinor', line.gross_minor, 'netMinor', line.net_minor,
        'vatMinor', line.vat_minor,
        'inputVatDeductibility', line.input_vat_deductibility,
        'deductibleVatMinor', line.deductible_vat_minor,
        'manualVatOverride', line.manual_vat_override,
        'manualVatOverrideReason', line.manual_vat_override_reason,
        'exemptTurnoverConfirmed', line.exempt_turnover_confirmed
      ) ORDER BY line.line_no)
      FROM public.bookkeeping_entry_lines AS line
      WHERE line.entry_id = entry.id AND line.active
    ), '[]'::jsonb),
    'createdAt', entry.created_at, 'updatedAt', entry.updated_at
  )
  FROM public.bookkeeping_entries AS entry WHERE entry.id = p_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_filing_json(p_period_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'periodId', snapshot.period_id,
    'fields', jsonb_build_object(
      'A', snapshot.a_minor, 'B', snapshot.b_minor, 'C', snapshot.c_minor,
      'D', snapshot.d_minor, 'E', snapshot.e_minor, 'F', snapshot.f_minor
    ),
    'submittedOn', snapshot.submitted_on, 'dueOn', snapshot.due_on,
    'reportedResultMinor', snapshot.reported_result_minor,
    'resultMismatchReason', snapshot.result_mismatch_reason,
    'confirmationReference', snapshot.confirmation_reference,
    'note', snapshot.note,
    'paymentState', coalesce(period.current_payment_state, snapshot.payment_state_at_filing),
    'paidOn', CASE
      WHEN coalesce(period.current_payment_state, snapshot.payment_state_at_filing) = 'paid'
        THEN coalesce(period.current_paid_on, snapshot.paid_on_at_filing)
      ELSE NULL END
  )
  FROM public.bookkeeping_filing_snapshots AS snapshot
  JOIN public.bookkeeping_periods AS period ON period.id = snapshot.period_id
  WHERE snapshot.period_id = p_period_id
  ORDER BY snapshot.submission_no DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_dashboard(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.bookkeeping_assert_beta_actor(p_actor_id);
  SELECT jsonb_build_object(
    'entities', coalesce(jsonb_agg(jsonb_build_object(
      'entity', public.bookkeeping_entity_json(entity.id),
      'registrations', coalesce((
        SELECT jsonb_agg(public.bookkeeping_registration_json(registration.id)
          ORDER BY registration.created_at, registration.id)
        FROM public.bookkeeping_vat_registrations AS registration
        WHERE registration.entity_id = entity.id
      ), '[]'::jsonb),
      'periods', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'period', public.bookkeeping_period_json(period.id),
          'entryCount', (
            SELECT count(*)::integer FROM public.bookkeeping_entries AS entry
            WHERE entry.period_id = period.id AND entry.status = 'active'
          ),
          'summary', public.bookkeeping_calculate_period_summary(p_actor_id, period.id),
          'readiness', public.bookkeeping_period_readiness(p_actor_id, period.id),
          'filing', public.bookkeeping_filing_json(period.id)
        ) ORDER BY period.starts_on DESC, period.id)
        FROM public.bookkeeping_periods AS period
        WHERE period.entity_id = entity.id
      ), '[]'::jsonb)
    ) ORDER BY entity.created_at, entity.id), '[]'::jsonb)
  ) INTO v_result
  FROM public.bookkeeping_entities AS entity
  WHERE public.bookkeeping_active_member_role(p_actor_id, entity.id) = 'owner'
    AND entity.status = 'active';
  RETURN coalesce(v_result, jsonb_build_object('entities', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_period(
  p_actor_id uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period public.bookkeeping_periods%ROWTYPE;
BEGIN
  PERFORM public.bookkeeping_assert_beta_actor(p_actor_id);
  SELECT period.* INTO v_period FROM public.bookkeeping_periods AS period
  WHERE period.id = p_period_id;
  IF v_period.id IS NULL
     OR public.bookkeeping_active_member_role(p_actor_id, v_period.entity_id)
       IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'bookkeeping_not_found';
  END IF;
  RETURN jsonb_build_object(
    'entity', public.bookkeeping_entity_json(v_period.entity_id),
    'registration', public.bookkeeping_registration_json(v_period.vat_registration_id),
    'period', public.bookkeeping_period_json(v_period.id),
    'entries', coalesce((
      SELECT jsonb_agg(public.bookkeeping_entry_json(entry.id)
        ORDER BY entry.reporting_date, entry.created_at, entry.id)
      FROM public.bookkeeping_entries AS entry WHERE entry.period_id = v_period.id
    ), '[]'::jsonb),
    'summary', public.bookkeeping_calculate_period_summary(p_actor_id, v_period.id),
    'readiness', public.bookkeeping_period_readiness(p_actor_id, v_period.id),
    'filing', public.bookkeeping_filing_json(v_period.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookkeeping_get_entry(
  p_actor_id uuid,
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id uuid;
BEGIN
  PERFORM public.bookkeeping_assert_beta_actor(p_actor_id);
  SELECT entry.entity_id INTO v_entity_id
  FROM public.bookkeeping_entries AS entry WHERE entry.id = p_entry_id;
  IF v_entity_id IS NULL
     OR public.bookkeeping_active_member_role(p_actor_id, v_entity_id)
       IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'bookkeeping_not_found';
  END IF;
  RETURN jsonb_build_object('entry', public.bookkeeping_entry_json(p_entry_id));
END;
$$;

-- Called only by the existing account-deletion orchestrator. Durable financial
-- rows and filing snapshots remain; auth links and private entitlement are
-- removed. This function is defined here but is never run by the migration.
CREATE OR REPLACE FUNCTION public.bookkeeping_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_entity_ids uuid[] := ARRAY[]::uuid[];
  v_entity_id uuid;
  v_members integer := 0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'bookkeeping_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9801)
  );
  SELECT account.email INTO v_email FROM auth.users AS account
  WHERE account.id = p_user_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access
    WHERE access.feature_key = 'bokhaldid'
      AND public.normalize_email_canonical(access.email)
        = public.normalize_email_canonical(v_email);
  END IF;

  SELECT coalesce(array_agg(member.entity_id ORDER BY member.entity_id), ARRAY[]::uuid[])
  INTO v_entity_ids
  FROM public.bookkeeping_entity_members AS member
  WHERE member.user_id = p_user_id;
  PERFORM entity.id FROM public.bookkeeping_entities AS entity
  WHERE entity.id = ANY(v_entity_ids) ORDER BY entity.id FOR UPDATE;

  UPDATE public.bookkeeping_entity_members AS member
  SET user_id = NULL, status = 'unlinked'
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;
  UPDATE public.bookkeeping_entities
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_vat_registrations
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_periods
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id;
  UPDATE public.bookkeeping_entries
    SET created_by = CASE WHEN created_by = p_user_id THEN NULL ELSE created_by END,
        updated_by = CASE WHEN updated_by = p_user_id THEN NULL ELSE updated_by END,
        voided_by = CASE WHEN voided_by = p_user_id THEN NULL ELSE voided_by END
    WHERE created_by = p_user_id OR updated_by = p_user_id OR voided_by = p_user_id;
  UPDATE public.bookkeeping_entry_lines SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bookkeeping_entry_revisions SET captured_by = NULL WHERE captured_by = p_user_id;
  UPDATE public.bookkeeping_filing_snapshots SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bookkeeping_activity SET actor_user_id = NULL WHERE actor_user_id = p_user_id;
  DELETE FROM public.bookkeeping_mutation_requests WHERE actor_user_id = p_user_id;

  FOREACH v_entity_id IN ARRAY v_entity_ids LOOP
    PERFORM public.bookkeeping_record_activity(
      v_entity_id, NULL, NULL, 'account_unlinked', NULL, NULL, NULL, NULL,
      jsonb_build_object('member_unlinked', true)
    );
  END LOOP;
  RETURN jsonb_build_object('members_unlinked', v_members);
END;
$$;

-- ---------------------------------------------------------------------------
-- Function grants. All helpers are private. Every app-facing read/mutation is
-- callable only by service_role; browser roles have no EXECUTE privilege.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.bookkeeping_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_reject_delete()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_reject_immutable_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_guard_line_revision_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_member_unlink_auth_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_has_beta_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_assert_beta_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_active_member_role(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_assert_owner(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_begin_request(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_finish_request(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_record_activity(
  uuid, uuid, uuid, text, uuid, bigint, bigint, bigint, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_period_dates_valid(text, date, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_assert_entry_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_replace_entry_lines(
  uuid, uuid, uuid, uuid, bigint, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_clone_entry_lines(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_capture_entry_revision(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_assert_period_summary_safe(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_entity_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_registration_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_period_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_entry_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_filing_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.bookkeeping_calculate_period_summary(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_period_readiness(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_create_entity(
  uuid, uuid, text, text, text, text, boolean, text, text, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_add_vat_registration(
  uuid, uuid, uuid, text, text, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_create_period(
  uuid, uuid, uuid, uuid, text, date, date, date, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_create_entry(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_update_entry(uuid, uuid, uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_set_entry_review_status(
  uuid, uuid, uuid, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_void_entry(uuid, uuid, uuid, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_set_period_ready(
  uuid, uuid, uuid, bigint, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_record_filing(
  uuid, uuid, uuid, bigint, date, date, jsonb, bigint,
  text, text, text, text, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_reopen_period(uuid, uuid, uuid, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_record_payment(
  uuid, uuid, uuid, bigint, text, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_get_dashboard(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_get_period(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_get_entry(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bookkeeping_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.bookkeeping_calculate_period_summary(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_period_readiness(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_create_entity(
  uuid, uuid, text, text, text, text, boolean, text, text, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_add_vat_registration(
  uuid, uuid, uuid, text, text, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_create_period(
  uuid, uuid, uuid, uuid, text, date, date, date, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_create_entry(uuid, uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_update_entry(uuid, uuid, uuid, bigint, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_set_entry_review_status(
  uuid, uuid, uuid, bigint, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_void_entry(uuid, uuid, uuid, bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_set_period_ready(
  uuid, uuid, uuid, bigint, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_record_filing(
  uuid, uuid, uuid, bigint, date, date, jsonb, bigint,
  text, text, text, text, date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_reopen_period(uuid, uuid, uuid, bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_record_payment(
  uuid, uuid, uuid, bigint, text, date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_get_dashboard(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_get_period(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_get_entry(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bookkeeping_prepare_account_deletion(uuid)
  TO service_role;

COMMENT ON TABLE public.bookkeeping_entities IS
  'Durable bookkeeping tenants. Auth links are nullable; account deletion never cascades into financial records.';
COMMENT ON TABLE public.bookkeeping_entry_lines IS
  'Versioned VAT line revisions. Previous numeric revisions are superseded, never deleted.';
COMMENT ON TABLE public.bookkeeping_entry_revisions IS
  'Immutable private header revisions. Sensitive values stay default-deny and never enter shared activity or logs.';
COMMENT ON TABLE public.bookkeeping_filing_snapshots IS
  'Immutable server-derived A-F filing snapshots; F=D-E and D/E subtotals are constrained.';
COMMENT ON TABLE public.bookkeeping_activity IS
  'Append-only private lifecycle audit. Amounts, tax identifiers, counterparties, emails, notes and document references are forbidden.';

COMMIT;

-- No rollback is run here. Recovery is a separately reviewed operation which
-- must preserve filing/audit retention, drop RPCs before tables, and restore
-- the exact feature constraint expression present in the target environment.
