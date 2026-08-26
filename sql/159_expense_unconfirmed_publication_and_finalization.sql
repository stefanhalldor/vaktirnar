-- SQL159: Private drafts may be explicitly shared as sanitized, non-financial
-- proposals. Only explicit human-confirmed finalization enters the canonical
-- Expense ledger. SQL1-SQL158 and their direct-create compatibility writers
-- remain unchanged until a separately reviewed SQL160 hardening gate.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';
SELECT pg_catalog.pg_advisory_xact_lock(159159);

DO $preflight$
DECLARE
  v_expected_writers text[] := ARRAY[
    'public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
    'public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)',
    'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
    'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
    'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
  ]::text[];
  v_actual_writers text[];
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql159_executor_mismatch';
  END IF;

  IF pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL
     OR pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.expense_private_drafts') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('public.expense_shares') IS NULL
     OR pg_catalog.to_regclass('public.expense_obligations') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.relationship_circles') IS NULL
     OR pg_catalog.to_regclass('public.relationship_circle_members') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_participations') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_participation_rsvp_v3') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_has_beta_access(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_identity_request_id(text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_finish_request(uuid,uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_session_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_financial_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_private_scope_v3(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_uuid_from_text(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NULL THEN
    RAISE EXCEPTION 'expense_sql159_prerequisite_missing';
  END IF;

  IF pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_unconfirmed_finalizations') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_private_draft_tombstones') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_sql159_install_baseline') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('expense_unconfirmed_publications_pkey'),
         ('expense_unconfirmed_publications_publication_id_key'),
         ('expense_unconfirmed_publications_actor_draft_key'),
         ('expense_unconfirmed_publications_state_key'),
         ('expense_unconfirmed_publications_actor_live_idx'),
         ('expense_unconfirmed_publications_event_live_idx'),
         ('expense_unconfirmed_publications_group_live_idx'),
         ('expense_unconfirmed_publication_parties_pkey'),
         ('expense_unconfirmed_publication_parties_key_unique'),
         ('expense_unconfirmed_publication_parties_identity_unique'),
         ('expense_unconfirmed_publication_audience_pkey'),
         ('expense_unconfirmed_publication_audience_identity_unique'),
         ('expense_unconfirmed_publication_audience_user_idx'),
         ('expense_unconfirmed_finalizations_pkey'),
         ('expense_unconfirmed_finalizations_request_unique'),
         ('expense_unconfirmed_finalizations_expense_unique'),
         ('expense_private_draft_tombstones_pkey'),
         ('expense_sql159_install_baseline_pkey')
       ) AS target_index(name)
       WHERE pg_catalog.to_regclass('public.' || target_index.name) IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc AS function_row
       WHERE function_row.pronamespace = pg_catalog.to_regnamespace('public')
         AND function_row.proname LIKE 'expense_sql159_%'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc AS function_row
       WHERE function_row.pronamespace = pg_catalog.to_regnamespace('public')
         AND function_row.proname IN (
           'expense_share_private_draft',
           'expense_unshare_private_draft',
           'expense_finalize_private_draft',
           'expense_get_private_draft_publication_lifecycle',
           'expense_list_visible_shared_drafts',
           'expense_get_shared_draft_detail',
           'expense_list_group_shared_drafts',
           'teskeid_event_get_expense_pre_active_v1'
         )
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgname IN (
         'expense_sql159_finalized_draft_insert_guard',
         'expense_sql159_private_draft_delete_guard'
       )
     ) THEN
    RAISE EXCEPTION 'expense_sql159_target_exists';
  END IF;

  WITH expected(signature, source_hash, expected_config) AS (VALUES
    ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
      '536efe2584ce8b45ad8ecacf5574dfd4', ARRAY['search_path=""']::text[]),
    ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)',
      '648ea05ac92e58e79e66c8cb34267f3d', ARRAY['search_path=pg_catalog, public']::text[]),
    ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'ad0fd30363a3c9f5d8e7b51be6f1bfa2', ARRAY['search_path=pg_catalog, public']::text[]),
    ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      '5da34435052493c4c993bc88e82a72dd', ARRAY['search_path=""']::text[]),
    ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
      'eca30a044e0406a755fb02399070c3f8', ARRAY['search_path=""']::text[]),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'a30f4dff7aa3d616476da29c82e1b177', ARRAY['search_path=""']::text[]),
    ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
      '719a00f72fccbfac3f5f2cb778c2accb', ARRAY['search_path=""']::text[])
  ), checked AS (
    SELECT expected.*, function_row.oid, function_row.prosrc,
      function_row.proconfig, function_row.prosecdef, function_row.provolatile,
      function_row.proretset, function_row.prorettype, function_row.proowner,
      language_row.lanname
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = function_row.prolang
  )
  SELECT pg_catalog.array_agg(
    checked.signature ORDER BY checked.signature COLLATE pg_catalog."C"
  )::text[] INTO v_actual_writers
  FROM checked
  WHERE checked.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(checked.prosrc, E'\r\n', E'\n')) = checked.source_hash
    AND checked.proconfig = checked.expected_config
    AND checked.prosecdef
    AND checked.provolatile = 'v'
    AND NOT checked.proretset
    AND checked.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
    AND checked.lanname = 'plpgsql'
    AND pg_catalog.pg_get_userbyid(checked.proowner) = 'postgres'
    AND (
      SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.aclexplode(COALESCE(
        (SELECT target.proacl FROM pg_catalog.pg_proc AS target
         WHERE target.oid = checked.oid),
        pg_catalog.acldefault('f', checked.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantor = checked.proowner
        AND NOT privilege.is_grantable
        AND (
          privilege.grantee = checked.proowner
          OR grantee.rolname = 'service_role'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        (SELECT target.proacl FROM pg_catalog.pg_proc AS target
         WHERE target.oid = checked.oid),
        pg_catalog.acldefault('f', checked.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE privilege.privilege_type <> 'EXECUTE'
         OR privilege.grantor <> checked.proowner
         OR privilege.is_grantable
         OR privilege.grantee = 0
         OR (
           privilege.grantee <> checked.proowner
           AND grantee.rolname IS DISTINCT FROM 'service_role'
         )
    );

  IF v_actual_writers IS DISTINCT FROM v_expected_writers THEN
    RAISE EXCEPTION 'expense_sql159_writer_drift';
  END IF;
END;
$preflight$;

CREATE TABLE public.expense_unconfirmed_publications (
  -- Deliberately not an FK to expense_private_drafts. A withdrawn lifecycle
  -- survives explicit private-draft deletion so a stale generation can never
  -- reset to version 1 if the same client-generated draft UUID is reused.
  draft_id                    uuid        PRIMARY KEY,
  publication_id              uuid        NOT NULL UNIQUE,
  actor_user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_version         bigint      NOT NULL,
  is_live                     boolean     NOT NULL,
  source_draft_version        bigint      NULL,
  shareable_fingerprint       text        NULL,
  authority_fingerprint       text        NULL,
  context_type                text        NULL,
  group_id                    uuid        NULL,
  event_id                    uuid        NULL,
  event_roster_revision       bigint      NULL,
  link_to_event               boolean     NULL,
  visibility                  text        NULL,
  title                       text        NULL,
  total_minor                 bigint      NULL,
  currency                    text        NULL,
  incurred_on                 date        NULL,
  allocation_state            text        NULL,
  created_at                  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  published_at                timestamptz NULL,
  updated_at                  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  withdrawn_at                timestamptz NULL,

  CONSTRAINT expense_unconfirmed_publications_version_check
    CHECK (publication_version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT expense_unconfirmed_publications_fingerprint_check CHECK (
    (shareable_fingerprint IS NULL OR shareable_fingerprint ~ '^[0-9a-f]{32}$')
    AND (authority_fingerprint IS NULL OR authority_fingerprint ~ '^[0-9a-f]{32}$')
  ),
  CONSTRAINT expense_unconfirmed_publications_live_shape_check CHECK (
    (
      is_live
      AND source_draft_version IS NOT NULL
      AND source_draft_version BETWEEN 1 AND 9007199254740991
      AND shareable_fingerprint IS NOT NULL
      AND authority_fingerprint IS NOT NULL
      AND context_type IS NOT NULL
      AND context_type IN ('one_off', 'group')
      AND visibility IS NOT NULL
      AND visibility IN ('participants_only', 'all_event')
      AND title IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 1 AND 200
      AND total_minor IS NOT NULL
      AND total_minor BETWEEN 1 AND 9007199254740991
      AND currency IS NOT NULL
      AND currency IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
      AND incurred_on IS NOT NULL
      AND allocation_state IS NOT NULL
      AND allocation_state IN ('incomplete', 'balanced_unconfirmed')
      AND link_to_event IS NOT NULL
      AND (
        (context_type = 'group' AND group_id IS NOT NULL
          AND event_id IS NULL AND event_roster_revision IS NULL
          AND NOT link_to_event AND visibility = 'participants_only')
        OR
        (context_type = 'one_off' AND group_id IS NULL
          AND ((event_id IS NULL AND event_roster_revision IS NULL AND NOT link_to_event)
            OR (event_id IS NOT NULL
              AND event_roster_revision IS NOT NULL
              AND event_roster_revision BETWEEN 1 AND 9007199254740991)))
      )
      AND (
        visibility = 'participants_only'
        OR (visibility = 'all_event' AND event_id IS NOT NULL AND link_to_event)
      )
      AND published_at IS NOT NULL
      AND withdrawn_at IS NULL
    ) OR (
      NOT is_live
      AND source_draft_version IS NULL
      AND shareable_fingerprint IS NULL
      AND authority_fingerprint IS NULL
      AND context_type IS NULL
      AND group_id IS NULL
      AND event_id IS NULL
      AND event_roster_revision IS NULL
      AND link_to_event IS NULL
      AND visibility IS NULL
      AND title IS NULL
      AND total_minor IS NULL
      AND currency IS NULL
      AND incurred_on IS NULL
      AND allocation_state IS NULL
      AND published_at IS NOT NULL
      AND withdrawn_at IS NOT NULL
    )
  ),
  CONSTRAINT expense_unconfirmed_publications_actor_draft_key
    UNIQUE (draft_id, actor_user_id),
  CONSTRAINT expense_unconfirmed_publications_state_key
    UNIQUE (draft_id, allocation_state)
);

CREATE INDEX expense_unconfirmed_publications_actor_live_idx
  ON public.expense_unconfirmed_publications
    (actor_user_id, is_live, updated_at DESC, publication_id);
CREATE INDEX expense_unconfirmed_publications_event_live_idx
  ON public.expense_unconfirmed_publications
    (event_id, is_live, updated_at DESC, publication_id)
  WHERE event_id IS NOT NULL AND link_to_event;
CREATE INDEX expense_unconfirmed_publications_group_live_idx
  ON public.expense_unconfirmed_publications
    (group_id, is_live, updated_at DESC, publication_id)
  WHERE group_id IS NOT NULL;

CREATE TABLE public.expense_unconfirmed_publication_parties (
  draft_id              uuid        NOT NULL,
  allocation_state      text        NOT NULL,
  ordinal               smallint    NOT NULL,
  party_key_hash        text        NOT NULL,
  identity_token_hash   text        NOT NULL,
  display_name          text        NOT NULL,
  is_author             boolean     NOT NULL,
  is_payer              boolean     NOT NULL,
  is_participant        boolean     NOT NULL,
  paid_minor            bigint      NULL,
  share_minor           bigint      NULL,
  created_at            timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT expense_unconfirmed_publication_parties_pkey
    PRIMARY KEY (draft_id, ordinal),
  CONSTRAINT expense_unconfirmed_publication_parties_publication_fk
    FOREIGN KEY (draft_id, allocation_state)
    REFERENCES public.expense_unconfirmed_publications(draft_id, allocation_state)
    ON DELETE CASCADE,
  CONSTRAINT expense_unconfirmed_publication_parties_ordinal_check
    CHECK (ordinal BETWEEN 1 AND 50),
  CONSTRAINT expense_unconfirmed_publication_parties_hash_check CHECK (
    party_key_hash ~ '^[0-9a-f]{32}$'
    AND identity_token_hash ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT expense_unconfirmed_publication_parties_label_check
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 120
      AND pg_catalog.strpos(display_name, '@') = 0
    ),
  CONSTRAINT expense_unconfirmed_publication_parties_role_check
    CHECK (is_payer OR is_participant),
  CONSTRAINT expense_unconfirmed_publication_parties_amount_check CHECK (
    (allocation_state = 'incomplete' AND paid_minor IS NULL AND share_minor IS NULL)
    OR (
      allocation_state = 'balanced_unconfirmed'
      AND paid_minor IS NOT NULL
      AND share_minor IS NOT NULL
      AND paid_minor BETWEEN 0 AND 9007199254740991
      AND share_minor BETWEEN 0 AND 9007199254740991
      AND (is_payer OR paid_minor = 0)
      AND (is_participant OR share_minor = 0)
    )
  ),
  CONSTRAINT expense_unconfirmed_publication_parties_key_unique
    UNIQUE (draft_id, party_key_hash),
  CONSTRAINT expense_unconfirmed_publication_parties_identity_unique
    UNIQUE (draft_id, identity_token_hash)
);

CREATE TABLE public.expense_unconfirmed_publication_audience (
  draft_id              uuid        NOT NULL
    REFERENCES public.expense_unconfirmed_publications(draft_id) ON DELETE CASCADE,
  -- Deliberately no auth.users FK: exact authenticated identities are resolved
  -- by the frozen writer and revalidated by every reader. An auth cascade must
  -- not deadlock with atomic audience replacement through child/parent locks.
  user_id               uuid        NOT NULL,
  audience_kind         text        NOT NULL,
  identity_token_hash   text        NULL,
  binding_id            uuid        NULL,
  binding_generation    bigint      NULL,
  created_at            timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT expense_unconfirmed_publication_audience_pkey
    PRIMARY KEY (draft_id, user_id),
  CONSTRAINT expense_unconfirmed_publication_audience_identity_unique
    UNIQUE (draft_id, identity_token_hash),
  CONSTRAINT expense_unconfirmed_publication_audience_party_fk
    FOREIGN KEY (draft_id, identity_token_hash)
    REFERENCES public.expense_unconfirmed_publication_parties(
      draft_id, identity_token_hash
    ) ON DELETE CASCADE,
  CONSTRAINT expense_unconfirmed_publication_audience_identity_check CHECK (
    (audience_kind = 'author' AND identity_token_hash IS NULL)
    OR (audience_kind <> 'author'
      AND identity_token_hash IS NOT NULL
      AND identity_token_hash ~ '^[0-9a-f]{32}$')
  ),
  CONSTRAINT expense_unconfirmed_publication_audience_kind_check CHECK (
    audience_kind IN (
      'author', 'relationship', 'circle', 'group',
      'event_guest', 'event_organizer'
    )
  ),
  CONSTRAINT expense_unconfirmed_publication_audience_binding_check CHECK (
    (audience_kind = 'author' AND binding_id IS NULL AND binding_generation IS NULL)
    OR (audience_kind IN ('relationship', 'circle', 'group', 'event_organizer')
      AND binding_id IS NOT NULL AND binding_generation IS NULL)
    OR (audience_kind = 'event_guest'
      AND binding_id IS NOT NULL
      AND binding_generation BETWEEN 1 AND 9007199254740991)
  )
);

CREATE INDEX expense_unconfirmed_publication_audience_user_idx
  ON public.expense_unconfirmed_publication_audience
    (user_id, draft_id);

CREATE TABLE public.expense_unconfirmed_finalizations (
  draft_id                       uuid        PRIMARY KEY,
  -- Retained after account deletion so a finalized draft ID cannot be
  -- resurrected. Deliberately no auth.users FK and no identity PII.
  actor_user_id                  uuid        NOT NULL,
  request_id                     uuid        NOT NULL,
  request_fingerprint            text        NOT NULL,
  contract_version               smallint    NOT NULL,
  expected_draft_version         bigint      NOT NULL,
  expected_publication_version   bigint      NULL,
  final_publication_version      bigint      NULL,
  publication_id                 uuid        NULL,
  shareable_fingerprint          text        NOT NULL,
  allocation_fingerprint         text        NOT NULL,
  group_id                       uuid        NOT NULL,
  expense_id                     uuid        NOT NULL,
  invitation_ids                 uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[],
  finalized_at                   timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT expense_unconfirmed_finalizations_request_unique
    UNIQUE (actor_user_id, request_id),
  CONSTRAINT expense_unconfirmed_finalizations_expense_unique
    UNIQUE (expense_id),
  CONSTRAINT expense_unconfirmed_finalizations_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id),
  CONSTRAINT expense_unconfirmed_finalizations_contract_check
    CHECK (contract_version = 1),
  CONSTRAINT expense_unconfirmed_finalizations_version_check CHECK (
    expected_draft_version BETWEEN 1 AND 9007199254740991
    AND (expected_publication_version IS NULL
      OR expected_publication_version BETWEEN 1 AND 9007199254740991)
    AND (final_publication_version IS NULL
      OR final_publication_version BETWEEN 1 AND 9007199254740991)
  ),
  CONSTRAINT expense_unconfirmed_finalizations_publication_shape_check CHECK (
    (publication_id IS NULL) = (final_publication_version IS NULL)
    AND (
      expected_publication_version IS NULL
      OR (
        publication_id IS NOT NULL
        AND expected_publication_version < 9007199254740991
        AND final_publication_version = expected_publication_version + 1
      )
    )
  ),
  CONSTRAINT expense_unconfirmed_finalizations_fingerprint_check CHECK (
    request_fingerprint ~ '^[0-9a-f]{32}$'
    AND shareable_fingerprint ~ '^[0-9a-f]{32}$'
    AND allocation_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT expense_unconfirmed_finalizations_invitation_check CHECK (
    pg_catalog.cardinality(invitation_ids) BETWEEN 0 AND 49
    AND pg_catalog.array_position(invitation_ids, NULL::uuid) IS NULL
  )
);

-- A deleted client-generated draft UUID is retired forever. This PII-free,
-- insert-only marker closes delete/recreate ABA without changing SQL102.
CREATE TABLE public.expense_private_draft_tombstones (
  draft_id uuid PRIMARY KEY
);

CREATE TABLE public.expense_sql159_install_baseline (
  singleton                    boolean     PRIMARY KEY DEFAULT true,
  installed_at                 timestamptz NOT NULL DEFAULT pg_catalog.now(),
  predecessor_contract         jsonb       NOT NULL,
  writer_set_digest            text        NOT NULL,
  protected_count              bigint      NOT NULL,
  protected_digest             text        NOT NULL,
  request_count                bigint      NOT NULL,
  request_digest               text        NOT NULL,
  draft_count                  bigint      NOT NULL,
  draft_digest                 text        NOT NULL,
  new_relations_began_empty    boolean     NOT NULL,

  CONSTRAINT expense_sql159_install_baseline_singleton_check CHECK (singleton),
  CONSTRAINT expense_sql159_install_baseline_digest_check CHECK (
    writer_set_digest ~ '^[0-9a-f]{32}$'
    AND protected_digest ~ '^[0-9a-f]{32}$'
    AND request_digest ~ '^[0-9a-f]{32}$'
    AND draft_digest ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT expense_sql159_install_baseline_predecessor_check
    CHECK (pg_catalog.jsonb_typeof(predecessor_contract) = 'array')
);

ALTER TABLE public.expense_unconfirmed_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_publication_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_publication_parties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_publication_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_publication_audience FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_unconfirmed_finalizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_private_draft_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_private_draft_tombstones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_sql159_install_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_sql159_install_baseline FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.expense_unconfirmed_publications,
  public.expense_unconfirmed_publication_parties,
  public.expense_unconfirmed_publication_audience,
  public.expense_unconfirmed_finalizations,
  public.expense_private_draft_tombstones,
  public.expense_sql159_install_baseline
FROM PUBLIC, anon, authenticated, service_role;

-- Returns NULL for malformed values. Publication can therefore remain
-- incomplete without converting invalid input into a partial financial claim.
CREATE FUNCTION public.expense_sql159_amount_minor(
  p_raw text,
  p_currency text,
  p_allow_zero boolean
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_value text;
  v_digits integer;
  v_whole text;
  v_fraction text;
  v_minor numeric;
BEGIN
  IF p_raw IS NULL OR p_currency IS NULL OR p_allow_zero IS NULL
     OR p_currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK') THEN
    RETURN NULL;
  END IF;
  v_value := pg_catalog.regexp_replace(pg_catalog.btrim(p_raw), '[[:space:]]+', '', 'g');
  IF v_value !~ '^[0-9]+([.,][0-9]+)?$'
     OR (pg_catalog.strpos(v_value, '.') > 0 AND pg_catalog.strpos(v_value, ',') > 0) THEN
    RETURN NULL;
  END IF;
  v_digits := CASE WHEN p_currency = 'ISK' THEN 0 ELSE 2 END;
  v_value := pg_catalog.replace(v_value, ',', '.');
  v_whole := pg_catalog.split_part(v_value, '.', 1);
  v_fraction := CASE WHEN pg_catalog.strpos(v_value, '.') > 0
    THEN pg_catalog.split_part(v_value, '.', 2) ELSE '' END;
  IF pg_catalog.char_length(v_fraction) > v_digits
     OR (v_digits = 0 AND v_fraction <> '') THEN
    RETURN NULL;
  END IF;
  v_fraction := pg_catalog.rpad(v_fraction, v_digits, '0');
  v_minor := v_whole::numeric * CASE WHEN v_digits = 0 THEN 1 ELSE 100 END
    + CASE WHEN v_fraction = '' THEN 0 ELSE v_fraction::numeric END;
  IF v_minor > 9007199254740991 OR v_minor < 0
     OR (NOT p_allow_zero AND v_minor = 0) THEN
    RETURN NULL;
  END IF;
  RETURN v_minor::bigint;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.expense_finalize_private_draft(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint,
  p_split_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request_fingerprint text;
  v_replay jsonb;
  v_event_id uuid;
  v_locked_event_id uuid;
  v_event_request_id uuid;
  v_event_fingerprint text;
  v_event_replay jsonb;
  v_inner_request_id uuid;
  v_expense_id uuid;
  v_replay_finalization public.expense_unconfirmed_finalizations%ROWTYPE;
  v_replay_group_status text;
  v_replay_expense_status text;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_normalized jsonb;
  v_create_payload jsonb;
  v_created jsonb;
  v_group_id uuid;
  v_created_expense_id uuid;
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_final_publication_version bigint;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR (p_expected_publication_version IS NOT NULL
       AND p_expected_publication_version NOT BETWEEN 1 AND 9007199254740991)
     OR p_split_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_unconfirmed_confirmation_required';
  END IF;

  -- This exact fingerprint deliberately binds NULL versus integer. Same
  -- request replay is checked before the now-consumed draft is required.
  v_request_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'expectedDraftVersion', p_expected_draft_version,
    'expectedPublicationVersion', p_expected_publication_version,
    'splitConfirmed', true
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_finalize_private_draft_v1', v_request_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    -- A replay no longer has a live draft to authorize against. Re-prove the
    -- exact durable result and current canonical detail membership before
    -- returning any financial identifier.
    IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
       OR v_replay - ARRAY[
         'contract_version', 'state', 'draft_id', 'group_id', 'expense_id',
         'invitation_ids'
       ]::text[] <> '{}'::jsonb
       OR NOT (v_replay ?& ARRAY[
         'contract_version', 'state', 'draft_id', 'group_id', 'expense_id',
         'invitation_ids'
       ]::text[])
       OR v_replay->>'contract_version' <> '1'
       OR v_replay->>'state' <> 'confirmed'
       OR v_replay->>'draft_id' <> p_draft_id::text
       OR v_replay->>'group_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_replay->>'expense_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR pg_catalog.jsonb_typeof(v_replay->'invitation_ids') <> 'array'
       OR pg_catalog.jsonb_array_length(v_replay->'invitation_ids') > 49
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(v_replay->'invitation_ids') AS invitation(value)
         WHERE pg_catalog.jsonb_typeof(invitation.value) <> 'string'
            OR invitation.value #>> '{}'
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ) THEN
      RAISE EXCEPTION 'expense_unconfirmed_replay_invalid';
    END IF;
    SELECT finalization.* INTO v_replay_finalization
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.draft_id = p_draft_id
      AND finalization.actor_user_id = p_actor_id
      AND finalization.request_id = p_request_id
      AND finalization.request_fingerprint = v_request_fingerprint;
    IF v_replay_finalization.draft_id IS NULL
       OR v_replay->>'group_id' <> v_replay_finalization.group_id::text
       OR v_replay->>'expense_id' <> v_replay_finalization.expense_id::text
       OR v_replay->'invitation_ids'
         <> pg_catalog.to_jsonb(v_replay_finalization.invitation_ids) THEN
      RAISE EXCEPTION 'expense_unconfirmed_replay_invalid';
    END IF;
    SELECT group_row.status INTO v_replay_group_status
    FROM public.expense_groups AS group_row
    WHERE group_row.id = v_replay_finalization.group_id
    FOR KEY SHARE;
    SELECT expense.status INTO v_replay_expense_status
    FROM public.expenses AS expense
    WHERE expense.group_id = v_replay_finalization.group_id
      AND expense.id = v_replay_finalization.expense_id
    FOR KEY SHARE;
    -- Canonical detail remains available for cancelled Expenses and
    -- non-active group lifecycle states while the actor is still an active
    -- member. Replay must preserve that authority so post-commit invitation
    -- delivery can recover after a legitimate later status transition.
    IF v_replay_group_status IS NULL
       OR v_replay_expense_status IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.expense_group_members AS actor_member
         WHERE actor_member.group_id = v_replay_finalization.group_id
           AND actor_member.user_id = p_actor_id
           AND actor_member.status = 'active'
       ) THEN
      RAISE EXCEPTION 'expense_unconfirmed_not_found';
    END IF;
    RETURN v_replay;
  END IF;

  v_event_id := public.expense_sql159_probe_event_id(p_actor_id, p_draft_id);
  IF v_event_id IS NOT NULL THEN
    v_event_request_id := public.expense_identity_request_id(
      'expense-sql159-finalize-event-gate-v1', p_request_id
    );
    v_event_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'operation', 'expense_finalize_private_draft_v1',
      'outerFingerprint', v_request_fingerprint,
      'eventId', v_event_id
    )::text);
    v_event_replay := public.teskeid_event_begin_request(
      p_actor_id, v_event_request_id,
      'expense_sql159_finalize_gate_v1', v_event_fingerprint, true
    );
    IF v_event_replay IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_receipt_conflict';
    END IF;
  END IF;

  SELECT draft_row.* INTO v_draft
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_not_found'; END IF;
  IF v_draft.version <> p_expected_draft_version THEN
    RAISE EXCEPTION 'expense_unconfirmed_draft_conflict';
  END IF;
  v_locked_event_id := public.expense_sql159_probe_event_id(p_actor_id, p_draft_id);
  IF v_locked_event_id IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_context_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_draft.context_type, v_draft.group_id, v_draft.expense_id
  );

  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
  FOR UPDATE;
  IF v_publication.draft_id IS NOT NULL
     AND v_publication.actor_user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_not_found';
  END IF;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
    WHERE party.draft_id = p_draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
    WHERE audience.draft_id = p_draft_id ORDER BY audience.user_id FOR UPDATE;

  -- NULL is an exact assertion that no live snapshot exists. A withdrawn
  -- lifecycle row is not live and therefore satisfies that exact assertion.
  IF p_expected_publication_version IS NULL THEN
    IF COALESCE(v_publication.is_live, false) THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
  ELSIF NOT COALESCE(v_publication.is_live, false)
     OR v_publication.publication_version <> p_expected_publication_version THEN
    RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
  END IF;

  v_normalized := public.expense_sql159_normalize_private_draft(
    p_actor_id, p_draft_id, true
  );
  IF (v_normalized->>'draft_version')::bigint <> p_expected_draft_version
     OR (v_normalized->>'event_id')::uuid IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_context_conflict';
  END IF;
  IF COALESCE(v_publication.is_live, false)
     AND v_publication.shareable_fingerprint
       IS DISTINCT FROM v_normalized->>'shareable_fingerprint' THEN
    RAISE EXCEPTION 'expense_unconfirmed_shared_snapshot_stale';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.draft_id = p_draft_id
  ) THEN
    RAISE EXCEPTION 'expense_draft_finalized';
  END IF;

  v_inner_request_id := public.expense_identity_request_id(
    'expense-sql159-canonical-create-v1', p_request_id
  );
  v_expense_id := public.teskeid_event_uuid_from_text(
    'expense-sql159-expense-v1:' || p_draft_id::text
  );

  IF v_normalized->>'event_id' IS NOT NULL THEN
    v_create_payload := pg_catalog.jsonb_build_object(
      'title', v_normalized->>'title',
      'total_minor', (v_normalized->>'total_minor')::bigint,
      'currency', v_normalized->>'currency',
      'incurred_on', v_normalized->>'incurred_on',
      'category', v_normalized->'category',
      'note', v_normalized->'note',
      'split_method', v_normalized->>'split_method',
      'one_off_members', v_normalized->'one_off_members',
      'payments', v_normalized->'payments',
      'shares', v_normalized->'shares',
      'obligations', '[]'::jsonb,
      'participant_invitations', v_normalized->'participant_invitations',
      'event_guest_members', v_normalized->'event_guest_members',
      'event_organizer_members', v_normalized->'event_organizer_members'
    ) || CASE WHEN (v_normalized->>'link_to_event')::boolean
      THEN pg_catalog.jsonb_build_object(
        'event_visibility', v_normalized->>'visibility'
      ) ELSE '{}'::jsonb END;
    v_created := public.teskeid_event_create_expense_from_event_for_actor(
      p_actor_id, v_inner_request_id, (v_normalized->>'event_id')::uuid,
      (v_normalized->>'event_roster_revision')::bigint,
      (v_normalized->>'link_to_event')::boolean, v_create_payload
    );
  ELSIF v_normalized->>'group_id' IS NOT NULL THEN
    v_created := public.expense_create_expense(
      p_actor_id, v_inner_request_id, v_expense_id,
      (v_normalized->>'group_id')::uuid, v_normalized->>'title',
      (v_normalized->>'total_minor')::bigint, v_normalized->>'currency',
      (v_normalized->>'incurred_on')::date, v_normalized->>'category',
      v_normalized->>'note', v_normalized->>'split_method', '[]'::jsonb,
      v_normalized->'payments', v_normalized->'shares', '[]'::jsonb
    );
  ELSIF v_normalized->>'circle_id' IS NOT NULL THEN
    v_created := public.expense_create_expense_with_circle_context(
      p_actor_id, v_inner_request_id, v_expense_id, NULL,
      v_normalized->>'title', (v_normalized->>'total_minor')::bigint,
      v_normalized->>'currency', (v_normalized->>'incurred_on')::date,
      v_normalized->>'category', v_normalized->>'note',
      v_normalized->>'split_method', v_normalized->'one_off_members',
      v_normalized->'payments', v_normalized->'shares', '[]'::jsonb,
      v_normalized->'known_relationship_members',
      (v_normalized->>'circle_id')::uuid,
      v_normalized->'known_circle_members'
    );
  ELSE
    v_created := public.expense_create_expense_with_participants(
      p_actor_id, v_inner_request_id, v_expense_id, NULL,
      v_normalized->>'title', (v_normalized->>'total_minor')::bigint,
      v_normalized->>'currency', (v_normalized->>'incurred_on')::date,
      v_normalized->>'category', v_normalized->>'note',
      v_normalized->>'split_method', v_normalized->'one_off_members',
      v_normalized->'payments', v_normalized->'shares', '[]'::jsonb,
      v_normalized->'participant_invitations'
    );
  END IF;

  IF pg_catalog.jsonb_typeof(v_created) <> 'object'
     OR v_created->>'group_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_created->>'expense_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (v_created ? 'invitation_ids'
       AND pg_catalog.jsonb_typeof(v_created->'invitation_ids') <> 'array')
     OR COALESCE(pg_catalog.jsonb_array_length(v_created->'invitation_ids'), 0) > 49
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(
         COALESCE(v_created->'invitation_ids', '[]'::jsonb)
       ) AS invitation(value)
       WHERE pg_catalog.jsonb_typeof(invitation.value) <> 'string'
          OR invitation.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     OR (
       SELECT pg_catalog.count(*)
         <> pg_catalog.count(DISTINCT invitation.value #>> '{}')
       FROM pg_catalog.jsonb_array_elements(
         COALESCE(v_created->'invitation_ids', '[]'::jsonb)
       ) AS invitation(value)
     ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_canonical_result_invalid';
  END IF;
  v_group_id := (v_created->>'group_id')::uuid;
  v_created_expense_id := (v_created->>'expense_id')::uuid;
  IF NOT EXISTS (
    SELECT 1
    FROM public.expenses AS expense
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    WHERE expense.id = v_created_expense_id
      AND expense.group_id = v_group_id
      AND expense.status = 'active'
      AND group_row.status = 'active'
      AND expense.created_by = p_actor_id
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_canonical_result_invalid';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(
    (invitation.value #>> '{}')::uuid
    ORDER BY (invitation.value #>> '{}') COLLATE pg_catalog."C"
  ), ARRAY[]::uuid[])
  INTO v_invitation_ids
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_created->'invitation_ids', '[]'::jsonb)
  ) AS invitation(value);

  v_final_publication_version := CASE
    WHEN v_publication.draft_id IS NULL THEN NULL
    WHEN v_publication.is_live THEN v_publication.publication_version + 1
    ELSE v_publication.publication_version
  END;
  IF v_publication.is_live
     AND v_publication.publication_version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
  END IF;

  INSERT INTO public.expense_unconfirmed_finalizations (
    draft_id, actor_user_id, request_id, request_fingerprint,
    contract_version, expected_draft_version,
    expected_publication_version, final_publication_version,
    publication_id, shareable_fingerprint, allocation_fingerprint,
    group_id, expense_id, invitation_ids
  ) VALUES (
    p_draft_id, p_actor_id, p_request_id, v_request_fingerprint,
    1, p_expected_draft_version, p_expected_publication_version,
    v_final_publication_version, v_publication.publication_id,
    v_normalized->>'shareable_fingerprint',
    v_normalized->>'allocation_fingerprint', v_group_id,
    v_created_expense_id, v_invitation_ids
  );

  DELETE FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id;
  DELETE FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id;
  IF COALESCE(v_publication.is_live, false) THEN
    UPDATE public.expense_unconfirmed_publications AS publication
    SET publication_version = v_final_publication_version,
        is_live = false,
        source_draft_version = NULL,
        shareable_fingerprint = NULL,
        authority_fingerprint = NULL,
        context_type = NULL,
        group_id = NULL,
        event_id = NULL,
        event_roster_revision = NULL,
        link_to_event = NULL,
        visibility = NULL,
        title = NULL,
        total_minor = NULL,
        currency = NULL,
        incurred_on = NULL,
        allocation_state = NULL,
        updated_at = pg_catalog.now(),
        withdrawn_at = pg_catalog.now()
    WHERE publication.draft_id = p_draft_id;
  END IF;
  DELETE FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unconfirmed_draft_conflict'; END IF;

  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'state', 'confirmed',
    'draft_id', p_draft_id,
    'group_id', v_group_id,
    'expense_id', v_created_expense_id,
    'invitation_ids', pg_catalog.to_jsonb(v_invitation_ids)
  );
  IF v_event_request_id IS NOT NULL THEN
    PERFORM public.teskeid_event_finish_request(
      p_actor_id, v_event_request_id, v_result
    );
  END IF;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_sql159_probe_event_id(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_text text;
BEGIN
  SELECT CASE
    WHEN draft_row.context_type = 'one_off'
      AND pg_catalog.jsonb_typeof(draft_row.payload->'eventId') = 'string'
      AND draft_row.payload->>'eventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN draft_row.payload->>'eventId'
    ELSE NULL
  END INTO v_event_text
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id;
  RETURN v_event_text::uuid;
END;
$function$;

-- Read-only equivalent of the currently established Event scope. Unlike the
-- canonical interactive V3 scope it never claims an invitation or mutates a
-- participation. A not-yet-claimed invitation is therefore not authority for
-- sharing or reading a pre-active financial proposal.
CREATE FUNCTION public.expense_sql159_event_scope_read_only(
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
  v_owner_id uuid;
  v_event_guest_id uuid;
  v_identity_generation bigint;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT event_row.owner_user_id INTO v_owner_id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_owner_id = p_actor_id THEN
    PERFORM public.teskeid_event_assert_actor(p_actor_id);
    RETURN pg_catalog.jsonb_build_object(
      'viewer_role', 'owner',
      'event_guest_id', NULL,
      'identity_generation', NULL
    );
  END IF;
  SELECT participation.event_guest_id, participation.identity_generation
  INTO v_event_guest_id, v_identity_generation
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
    AND participation.access_state = 'active';
  IF v_event_guest_id IS NULL OR v_identity_generation IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'viewer_role', 'attendee',
    'event_guest_id', v_event_guest_id,
    'identity_generation', v_identity_generation::text
  );
END;
$function$;

CREATE FUNCTION public.expense_sql159_event_scope_allows(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.expense_sql159_event_scope_read_only(
    p_actor_id, p_event_id
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;

-- Exact audience rows are necessary but not sufficient: source-bound access
-- is revalidated so stale group/circle/Event bindings cannot keep read access.
CREATE FUNCTION public.expense_sql159_audience_allows(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_publications AS publication
    JOIN public.expense_unconfirmed_publication_audience AS audience
      ON audience.draft_id = publication.draft_id
     AND audience.user_id = p_actor_id
    WHERE publication.draft_id = p_draft_id
      AND publication.is_live
      AND public.expense_has_beta_access(p_actor_id)
      AND (
        (
          audience.audience_kind = 'author'
          AND audience.user_id = publication.actor_user_id
        )
        OR (
          audience.audience_kind <> 'author'
          AND public.expense_has_beta_access(publication.actor_user_id)
          AND (
            publication.event_id IS NULL
            OR (
              public.expense_sql159_event_scope_allows(
                publication.actor_user_id, publication.event_id
              )
              AND public.expense_sql159_event_scope_allows(
                p_actor_id, publication.event_id
              )
            )
          )
          AND (
            (
              audience.audience_kind = 'relationship'
              AND EXISTS (
                SELECT 1
                FROM public.relationships AS relationship
                WHERE relationship.id = audience.binding_id
                  AND relationship.owner_id = publication.actor_user_id
                  AND relationship.counterpart_user_id = p_actor_id
              )
            )
            OR (
              audience.audience_kind = 'circle'
              AND EXISTS (
                SELECT 1
                FROM public.relationship_circle_members AS circle_member
                JOIN public.relationship_circles AS circle
                  ON circle.id = circle_member.circle_id
                 AND circle.status = 'active'
                WHERE circle_member.id = audience.binding_id
                  AND circle_member.user_id = p_actor_id
                  AND circle_member.status = 'active'
                  AND EXISTS (
                    SELECT 1
                    FROM public.relationship_circle_members AS author_circle_member
                    WHERE author_circle_member.circle_id = circle.id
                      AND author_circle_member.user_id = publication.actor_user_id
                      AND author_circle_member.status = 'active'
                  )
              )
            )
            OR (
              audience.audience_kind = 'group'
              AND EXISTS (
                SELECT 1
                FROM public.expense_group_members AS group_member
                JOIN public.expense_groups AS group_row
                  ON group_row.id = group_member.group_id
                 AND group_row.status = 'active'
                WHERE group_member.id = audience.binding_id
                  AND group_member.group_id = publication.group_id
                  AND group_member.user_id = p_actor_id
                  AND group_member.status = 'active'
                  AND EXISTS (
                    SELECT 1
                    FROM public.expense_group_members AS author_member
                    WHERE author_member.group_id = group_member.group_id
                      AND author_member.user_id = publication.actor_user_id
                      AND author_member.status = 'active'
                  )
              )
            )
            OR (
              audience.audience_kind = 'event_organizer'
              AND EXISTS (
                SELECT 1
                FROM public.teskeid_events AS event_row
                WHERE event_row.id = publication.event_id
                  AND event_row.owner_user_id = p_actor_id
                  AND audience.binding_id = public.teskeid_event_uuid_from_text(
                    'teskeid-event-owner-participant:' || event_row.id::text
                  )
              )
            )
            OR (
              audience.audience_kind = 'event_guest'
              AND EXISTS (
                SELECT 1
                FROM public.teskeid_event_participations AS participation
                JOIN public.teskeid_event_guests AS event_guest
                  ON event_guest.event_id = participation.event_id
                 AND event_guest.id = participation.event_guest_id
                 AND event_guest.status = 'active'
                JOIN public.teskeid_event_participation_rsvp_v3 AS decision
                  ON decision.event_id = participation.event_id
                 AND decision.event_guest_id = participation.event_guest_id
                 AND decision.identity_generation = participation.identity_generation
                 AND decision.decision_version = participation.rsvp_version
                WHERE participation.event_id = publication.event_id
                  AND participation.event_guest_id = audience.binding_id
                  AND participation.identity_generation = audience.binding_generation
                  AND participation.recipient_user_id = p_actor_id
                  AND participation.access_state = 'active'
              )
            )
          )
        )
      )
  );
$function$;

CREATE FUNCTION public.expense_sql159_guard_private_draft_insert()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_actor_id uuid;
BEGIN
  -- INSERT has no existing draft row. Taking 9601 here preserves the finalizer
  -- order. This trigger intentionally never runs on UPDATE, whose CAS row lock
  -- already gives save/finalize a deterministic winner.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.actor_user_id::text, 9601)
  );
  -- A different actor can choose the same UUID. If that UUID is currently
  -- being finalized, wait on its exact row after 9601 before checking the
  -- global tombstone; the committed finalizer result then wins permanently.
  SELECT existing_draft.actor_user_id INTO v_existing_actor_id
  FROM public.expense_private_drafts AS existing_draft
  WHERE existing_draft.id = NEW.id
  FOR UPDATE;
  IF v_existing_actor_id IS NOT NULL
     AND v_existing_actor_id IS DISTINCT FROM NEW.actor_user_id THEN
    RAISE EXCEPTION 'expense_draft_lifecycle_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_private_draft_tombstones AS tombstone
    WHERE tombstone.draft_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'expense_draft_lifecycle_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    NEW.actor_user_id, NEW.context_type, NEW.group_id, NEW.expense_id
  );
  IF EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.draft_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'expense_draft_lifecycle_conflict';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.draft_id = NEW.id
      AND (
        publication.actor_user_id IS DISTINCT FROM NEW.actor_user_id
        OR v_existing_actor_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'expense_draft_lifecycle_conflict';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER expense_sql159_finalized_draft_insert_guard
BEFORE INSERT ON public.expense_private_drafts
FOR EACH ROW EXECUTE FUNCTION public.expense_sql159_guard_private_draft_insert();

-- SQL102's frozen delete RPC owns the draft row lock and takes no 9601 actor
-- lock. This trigger therefore takes no advisory lock: it follows only the
-- compatible draft -> publication -> party -> audience order. Retaining the
-- scrubbed lifecycle prevents a reused draft UUID from resetting its CAS.
CREATE FUNCTION public.expense_sql159_guard_private_draft_delete()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
BEGIN
  -- The OLD draft row is already locked by DELETE. Retire its UUID before any
  -- lifecycle cleanup so a delayed version-1 request can never bind to a new
  -- incarnation, including for never-shared drafts and cascading deletes.
  INSERT INTO public.expense_private_draft_tombstones (draft_id)
  VALUES (OLD.id)
  ON CONFLICT (draft_id) DO NOTHING;

  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = OLD.id
  FOR UPDATE;
  IF v_publication.draft_id IS NULL THEN
    RETURN OLD;
  END IF;
  IF v_publication.actor_user_id IS DISTINCT FROM OLD.actor_user_id THEN
    RAISE EXCEPTION 'expense_draft_lifecycle_conflict';
  END IF;

  -- The finalizer has already written its durable tombstone and exact final
  -- publication version before consuming the draft. Only that path skips the
  -- general delete-generation bump.
  IF EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.draft_id = OLD.id
      AND finalization.actor_user_id = OLD.actor_user_id
      AND finalization.publication_id = v_publication.publication_id
      AND finalization.final_publication_version
        = v_publication.publication_version
      AND NOT v_publication.is_live
  ) THEN
    RETURN OLD;
  END IF;

  PERFORM 1
  FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = OLD.id
  ORDER BY party.ordinal
  FOR UPDATE;
  PERFORM 1
  FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = OLD.id
  ORDER BY audience.user_id
  FOR UPDATE;

  IF v_publication.publication_version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
  END IF;
  IF v_publication.is_live THEN
    DELETE FROM public.expense_unconfirmed_publication_audience AS audience
    WHERE audience.draft_id = OLD.id;
    DELETE FROM public.expense_unconfirmed_publication_parties AS party
    WHERE party.draft_id = OLD.id;
  END IF;
  UPDATE public.expense_unconfirmed_publications AS publication
  SET publication_version = v_publication.publication_version + 1,
      is_live = false,
      source_draft_version = NULL,
      shareable_fingerprint = NULL,
      authority_fingerprint = NULL,
      context_type = NULL,
      group_id = NULL,
      event_id = NULL,
      event_roster_revision = NULL,
      link_to_event = NULL,
      visibility = NULL,
      title = NULL,
      total_minor = NULL,
      currency = NULL,
      incurred_on = NULL,
      allocation_state = NULL,
      updated_at = pg_catalog.now(),
      withdrawn_at = pg_catalog.now()
  WHERE publication.draft_id = OLD.id;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER expense_sql159_private_draft_delete_guard
BEFORE DELETE ON public.expense_private_drafts
FOR EACH ROW EXECUTE FUNCTION public.expense_sql159_guard_private_draft_delete();

-- Exact actor-private CAS discovery for reload/reshare. It intentionally
-- exposes no publication ID, source binding, label or raw draft field.
CREATE FUNCTION public.expense_get_private_draft_publication_lifecycle(
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
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_sharing_state text;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id;
  IF v_draft.id IS NULL OR v_draft.version NOT BETWEEN 1 AND 9007199254740991
     OR v_draft.expense_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_draft.context_type, v_draft.group_id, v_draft.expense_id
  );
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id;
  IF v_publication.draft_id IS NULL THEN
    v_sharing_state := 'never_shared';
  ELSIF v_publication.actor_user_id IS DISTINCT FROM p_actor_id
     OR v_publication.publication_version NOT BETWEEN 1 AND 9007199254740991
     OR (
       v_publication.is_live
       AND NOT public.expense_sql159_snapshot_is_valid(p_draft_id)
     ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  ELSE
    v_sharing_state := CASE WHEN v_publication.is_live
      THEN 'shared' ELSE 'withdrawn' END;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'draft_id', p_draft_id,
    'draft_version', v_draft.version,
    'sharing_state', v_sharing_state,
    'expected_publication_version', CASE
      WHEN v_publication.draft_id IS NULL THEN NULL
      ELSE v_publication.publication_version
    END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'not_found'
  );
END;
$function$;

CREATE FUNCTION public.expense_share_private_draft(
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
  v_request_fingerprint text;
  v_replay jsonb;
  v_event_id uuid;
  v_locked_event_id uuid;
  v_event_request_id uuid;
  v_event_fingerprint text;
  v_event_replay jsonb;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_normalized jsonb;
  v_publication_id uuid;
  v_next_version bigint;
  v_party jsonb;
  v_audience jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR (p_expected_publication_version IS NOT NULL
       AND p_expected_publication_version NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;
  v_request_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'expectedDraftVersion', p_expected_draft_version,
    'expectedPublicationVersion', p_expected_publication_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_share_private_draft_v1', v_request_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
       OR v_replay - ARRAY[
         'contract_version', 'state', 'draft_id', 'draft_version',
         'publication_id', 'publication_version', 'allocation_state',
         'shareable_fingerprint'
       ]::text[] <> '{}'::jsonb
       OR NOT (v_replay ?& ARRAY[
         'contract_version', 'state', 'draft_id', 'draft_version',
         'publication_id', 'publication_version', 'allocation_state',
         'shareable_fingerprint'
       ]::text[])
       OR v_replay->>'contract_version' <> '1'
       OR v_replay->>'state' <> 'shared_draft'
       OR v_replay->>'draft_id' <> p_draft_id::text
       OR v_replay->>'draft_version' <> p_expected_draft_version::text
       OR v_replay->>'publication_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_replay->>'publication_version' !~ '^[1-9][0-9]*$'
       OR (v_replay->>'publication_version')::numeric > 9007199254740991
       OR v_replay->>'allocation_state'
         NOT IN ('incomplete', 'balanced_unconfirmed')
       OR v_replay->>'shareable_fingerprint' !~ '^[0-9a-f]{32}$' THEN
      RAISE EXCEPTION 'expense_unconfirmed_replay_invalid';
    END IF;
    RETURN v_replay;
  END IF;

  -- Lock-free only: this probe never becomes authority. The exact value is
  -- compared again after the draft lock and normalization.
  v_event_id := public.expense_sql159_probe_event_id(p_actor_id, p_draft_id);
  IF v_event_id IS NOT NULL THEN
    v_event_request_id := public.expense_identity_request_id(
      'expense-sql159-share-event-gate-v1', p_request_id
    );
    v_event_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'operation', 'expense_share_private_draft_v1',
      'outerFingerprint', v_request_fingerprint,
      'eventId', v_event_id
    )::text);
    v_event_replay := public.teskeid_event_begin_request(
      p_actor_id, v_event_request_id,
      'expense_sql159_share_gate_v1', v_event_fingerprint, true
    );
    IF v_event_replay IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_receipt_conflict';
    END IF;
  END IF;

  SELECT draft_row.* INTO v_draft
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_not_found'; END IF;
  IF v_draft.version <> p_expected_draft_version THEN
    RAISE EXCEPTION 'expense_unconfirmed_draft_conflict';
  END IF;
  v_locked_event_id := public.expense_sql159_probe_event_id(p_actor_id, p_draft_id);
  IF v_locked_event_id IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_context_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_draft.context_type, v_draft.group_id, v_draft.expense_id
  );

  SELECT publication_row.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication_row
  WHERE publication_row.draft_id = p_draft_id
  FOR UPDATE;
  IF v_publication.draft_id IS NOT NULL
     AND v_publication.actor_user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_not_found';
  END IF;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
    WHERE party.draft_id = p_draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
    WHERE audience.draft_id = p_draft_id ORDER BY audience.user_id FOR UPDATE;

  IF v_publication.draft_id IS NULL THEN
    IF p_expected_publication_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := 1;
    v_publication_id := public.teskeid_event_uuid_from_text(
      'expense-sql159-publication-v1:' || p_draft_id::text
    );
  ELSE
    -- Once a lifecycle exists, even a withdrawn generation retains an exact
    -- CAS token. An old pre-share NULL tab can never resurrect publication.
    IF p_expected_publication_version IS NULL
       OR v_publication.publication_version <> p_expected_publication_version
       OR v_publication.publication_version = 9007199254740991 THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := v_publication.publication_version + 1;
    v_publication_id := v_publication.publication_id;
  END IF;

  v_normalized := public.expense_sql159_normalize_private_draft(
    p_actor_id, p_draft_id, false
  );
  IF (v_normalized->>'draft_version')::bigint <> p_expected_draft_version
     OR (v_normalized->>'event_id')::uuid IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_context_conflict';
  END IF;

  -- Remove the prior child snapshot inside this transaction before changing
  -- its allocation-state key. Any later failure rolls the old version back.
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
    p_expected_draft_version, v_normalized->>'shareable_fingerprint',
    v_normalized->>'authority_fingerprint', v_normalized->>'context_type',
    (v_normalized->>'group_id')::uuid, (v_normalized->>'event_id')::uuid,
    (v_normalized->>'event_roster_revision')::bigint,
    (v_normalized->>'link_to_event')::boolean, v_normalized->>'visibility',
    v_normalized->>'title', (v_normalized->>'total_minor')::bigint,
    v_normalized->>'currency', (v_normalized->>'incurred_on')::date,
    v_normalized->>'allocation_state', pg_catalog.now(), pg_catalog.now(), NULL
  )
  ON CONFLICT (draft_id) DO UPDATE SET
    publication_version = EXCLUDED.publication_version,
    is_live = true,
    source_draft_version = EXCLUDED.source_draft_version,
    shareable_fingerprint = EXCLUDED.shareable_fingerprint,
    authority_fingerprint = EXCLUDED.authority_fingerprint,
    context_type = EXCLUDED.context_type,
    group_id = EXCLUDED.group_id,
    event_id = EXCLUDED.event_id,
    event_roster_revision = EXCLUDED.event_roster_revision,
    link_to_event = EXCLUDED.link_to_event,
    visibility = EXCLUDED.visibility,
    title = EXCLUDED.title,
    total_minor = EXCLUDED.total_minor,
    currency = EXCLUDED.currency,
    incurred_on = EXCLUDED.incurred_on,
    allocation_state = EXCLUDED.allocation_state,
    published_at = EXCLUDED.published_at,
    updated_at = EXCLUDED.updated_at,
    withdrawn_at = NULL;

  FOR v_party IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_normalized->'parties') AS item(value)
    ORDER BY (item.value->>'ordinal')::integer
  LOOP
    INSERT INTO public.expense_unconfirmed_publication_parties (
      draft_id, allocation_state, ordinal, party_key_hash,
      identity_token_hash, display_name, is_author, is_payer,
      is_participant, paid_minor, share_minor
    ) VALUES (
      p_draft_id, v_normalized->>'allocation_state',
      (v_party->>'ordinal')::smallint, v_party->>'party_key_hash',
      v_party->>'identity_token_hash', v_party->>'display_name',
      (v_party->>'is_author')::boolean, (v_party->>'is_payer')::boolean,
      (v_party->>'is_participant')::boolean,
      (v_party->>'paid_minor')::bigint, (v_party->>'share_minor')::bigint
    );
  END LOOP;
  FOR v_audience IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_normalized->'audience') AS item(value)
    ORDER BY item.value->>'user_id' COLLATE pg_catalog."C"
  LOOP
    INSERT INTO public.expense_unconfirmed_publication_audience (
      draft_id, user_id, audience_kind, identity_token_hash,
      binding_id, binding_generation
    ) VALUES (
      p_draft_id, (v_audience->>'user_id')::uuid,
      v_audience->>'audience_kind', v_audience->>'identity_token_hash',
      (v_audience->>'binding_id')::uuid,
      (v_audience->>'binding_generation')::bigint
    );
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'state', 'shared_draft',
    'draft_id', p_draft_id,
    'draft_version', p_expected_draft_version,
    'publication_id', v_publication_id,
    'publication_version', v_next_version,
    'allocation_state', v_normalized->>'allocation_state',
    'shareable_fingerprint', v_normalized->>'shareable_fingerprint'
  );
  IF v_event_request_id IS NOT NULL THEN
    PERFORM public.teskeid_event_finish_request(
      p_actor_id, v_event_request_id, v_result
    );
  END IF;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_unshare_private_draft(
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
  v_request_fingerprint text;
  v_replay jsonb;
  v_event_id uuid;
  v_locked_event_id uuid;
  v_event_request_id uuid;
  v_event_fingerprint text;
  v_event_replay jsonb;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_next_version bigint;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR p_expected_publication_version IS NULL
     OR p_expected_publication_version NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;
  v_request_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'expectedDraftVersion', p_expected_draft_version,
    'expectedPublicationVersion', p_expected_publication_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_unshare_private_draft_v1', v_request_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
       OR v_replay - ARRAY[
         'contract_version', 'state', 'draft_id', 'draft_version',
         'publication_id', 'publication_version'
       ]::text[] <> '{}'::jsonb
       OR NOT (v_replay ?& ARRAY[
         'contract_version', 'state', 'draft_id', 'draft_version',
         'publication_id', 'publication_version'
       ]::text[])
       OR v_replay->>'contract_version' <> '1'
       OR v_replay->>'state' <> 'private_draft'
       OR v_replay->>'draft_id' <> p_draft_id::text
       OR v_replay->>'draft_version' <> p_expected_draft_version::text
       OR v_replay->>'publication_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_replay->>'publication_version' !~ '^[1-9][0-9]*$'
       OR (v_replay->>'publication_version')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION 'expense_unconfirmed_replay_invalid';
    END IF;
    RETURN v_replay;
  END IF;

  SELECT publication.event_id INTO v_event_id
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
    AND publication.actor_user_id = p_actor_id
    AND publication.is_live;
  IF v_event_id IS NOT NULL THEN
    v_event_request_id := public.expense_identity_request_id(
      'expense-sql159-unshare-event-gate-v1', p_request_id
    );
    v_event_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'operation', 'expense_unshare_private_draft_v1',
      'outerFingerprint', v_request_fingerprint,
      'eventId', v_event_id
    )::text);
    v_event_replay := public.teskeid_event_begin_request(
      p_actor_id, v_event_request_id,
      'expense_sql159_unshare_gate_v1', v_event_fingerprint, true
    );
    IF v_event_replay IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_receipt_conflict';
    END IF;
  END IF;

  SELECT draft_row.* INTO v_draft
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_not_found'; END IF;
  IF v_draft.version <> p_expected_draft_version THEN
    RAISE EXCEPTION 'expense_unconfirmed_draft_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_draft.context_type, v_draft.group_id, v_draft.expense_id
  );
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id
  FOR UPDATE;
  IF v_publication.draft_id IS NOT NULL
     AND v_publication.actor_user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_not_found';
  END IF;
  v_locked_event_id := CASE WHEN v_publication.is_live
    THEN v_publication.event_id ELSE NULL END;
  IF v_locked_event_id IS DISTINCT FROM v_event_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_context_conflict';
  END IF;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
    WHERE party.draft_id = p_draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
    WHERE audience.draft_id = p_draft_id ORDER BY audience.user_id FOR UPDATE;
  IF v_publication.draft_id IS NULL OR NOT v_publication.is_live
     OR v_publication.publication_version <> p_expected_publication_version
     OR v_publication.publication_version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
  END IF;
  v_next_version := v_publication.publication_version + 1;

  DELETE FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id;
  DELETE FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id;
  UPDATE public.expense_unconfirmed_publications AS publication
  SET publication_version = v_next_version,
      is_live = false,
      source_draft_version = NULL,
      shareable_fingerprint = NULL,
      authority_fingerprint = NULL,
      context_type = NULL,
      group_id = NULL,
      event_id = NULL,
      event_roster_revision = NULL,
      link_to_event = NULL,
      visibility = NULL,
      title = NULL,
      total_minor = NULL,
      currency = NULL,
      incurred_on = NULL,
      allocation_state = NULL,
      updated_at = pg_catalog.now(),
      withdrawn_at = pg_catalog.now()
  WHERE publication.draft_id = p_draft_id;

  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'state', 'private_draft',
    'draft_id', p_draft_id,
    'draft_version', p_expected_draft_version,
    'publication_id', v_publication.publication_id,
    'publication_version', v_next_version
  );
  IF v_event_request_id IS NOT NULL THEN
    PERFORM public.teskeid_event_finish_request(
      p_actor_id, v_event_request_id, v_result
    );
  END IF;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

-- Strictly derives both the sanitized publication and the canonical create
-- payload from the current private row. This function is internal: its result
-- contains private helper inputs and is never granted to an application role.
CREATE FUNCTION public.expense_sql159_normalize_private_draft(
  p_actor_id uuid,
  p_draft_id uuid,
  p_require_balanced boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_payload jsonb;
  v_circle_id uuid;
  v_event_id uuid;
  v_event_revision bigint;
  v_link_to_event boolean;
  v_visibility text;
  v_title text;
  v_total_minor bigint;
  v_currency text;
  v_incurred_on date;
  v_category text;
  v_note text;
  v_split_method text;
  v_member_record record;
  v_member jsonb;
  v_input jsonb;
  v_key text;
  v_source_kind text;
  v_source_id uuid;
  v_source_user_id uuid;
  v_binding_generation bigint;
  v_display_name text;
  v_safe_display_name text;
  v_identity_token text;
  v_member_id uuid;
  v_is_author boolean;
  v_is_payer boolean;
  v_is_participant boolean;
  v_author_selected boolean := false;
  v_all_member_count integer := 0;
  v_selected_count integer := 0;
  v_seen_users uuid[] := ARRAY[]::uuid[];
  v_seen_identity_tokens text[] := ARRAY[]::text[];
  v_parties jsonb := '[]'::jsonb;
  v_safe_parties jsonb := '[]'::jsonb;
  v_fingerprint_parties jsonb := '[]'::jsonb;
  v_audience jsonb := '[]'::jsonb;
  v_authority_tokens jsonb := '[]'::jsonb;
  v_one_off_members jsonb := '[]'::jsonb;
  v_participant_invitations jsonb := '[]'::jsonb;
  v_known_relationship_members jsonb := '[]'::jsonb;
  v_known_circle_members jsonb := '[]'::jsonb;
  v_event_guest_members jsonb := '[]'::jsonb;
  v_event_organizer_members jsonb := '[]'::jsonb;
  v_event_scope jsonb;
  v_event_source jsonb;
  v_event_candidate jsonb;
  v_event_owner_id uuid;
  v_event_owner_participant_id uuid;
  v_email text;
  v_relationship_id uuid;
  v_circle_member_id uuid;
  v_payments_valid boolean := true;
  v_shares_valid boolean := true;
  v_paid_minor bigint;
  v_share_minor bigint;
  v_payment_sum numeric := 0;
  v_share_sum numeric := 0;
  v_payments_by_key jsonb := '[]'::jsonb;
  v_shares_by_key jsonb := '[]'::jsonb;
  v_weights jsonb := '[]'::jsonb;
  v_weight bigint;
  v_weight_total numeric := 0;
  v_allocation_state text;
  v_payments jsonb := '[]'::jsonb;
  v_shares jsonb := '[]'::jsonb;
  v_party jsonb;
  v_shareable_fingerprint text;
  v_authority_fingerprint text;
  v_allocation_fingerprint text;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL OR p_require_balanced IS NULL THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;

  SELECT draft_row.* INTO v_draft
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id;
  IF v_draft.id IS NULL OR v_draft.context_type NOT IN ('one_off', 'group')
     OR v_draft.expense_id IS NOT NULL
     OR v_draft.version NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_not_found';
  END IF;
  v_payload := v_draft.payload;

  IF pg_catalog.jsonb_typeof(v_payload) <> 'object'
     OR v_payload - ARRAY[
       'circleId', 'eventId', 'eventRosterRevision', 'linkToEvent',
       'eventVisibility', 'members', 'removedMemberIds', 'included',
       'title', 'total', 'currency', 'incurredOn', 'category', 'note',
       'splitMethod', 'payments', 'payerKeys', 'amounts', 'percentages',
       'weights', 'preserveShares'
     ]::text[] <> '{}'::jsonb
     OR NOT (v_payload ?& ARRAY[
       'circleId', 'eventId', 'eventRosterRevision', 'linkToEvent',
       'eventVisibility', 'members', 'removedMemberIds', 'included',
       'title', 'total', 'currency', 'incurredOn', 'category', 'note',
       'splitMethod', 'payments', 'payerKeys', 'amounts', 'percentages',
       'weights', 'preserveShares'
     ]::text[])
     OR pg_catalog.jsonb_typeof(v_payload->'members') <> 'array'
     OR pg_catalog.jsonb_array_length(v_payload->'members') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(v_payload->'removedMemberIds') <> 'array'
     OR pg_catalog.jsonb_array_length(v_payload->'removedMemberIds') <> 0
     OR pg_catalog.jsonb_typeof(v_payload->'included') <> 'object'
     OR pg_catalog.jsonb_typeof(v_payload->'payments') <> 'object'
     OR pg_catalog.jsonb_typeof(v_payload->'payerKeys') <> 'array'
     OR pg_catalog.jsonb_array_length(v_payload->'payerKeys') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(v_payload->'amounts') <> 'object'
     OR pg_catalog.jsonb_typeof(v_payload->'percentages') <> 'object'
     OR pg_catalog.jsonb_typeof(v_payload->'weights') <> 'object'
     OR pg_catalog.jsonb_typeof(v_payload->'preserveShares') <> 'boolean'
     OR (v_payload->>'preserveShares')::boolean
     OR pg_catalog.jsonb_typeof(v_payload->'linkToEvent') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_payload->'eventVisibility') <> 'string'
     OR v_payload->>'eventVisibility' NOT IN ('participants_only', 'all_event')
     OR pg_catalog.jsonb_typeof(v_payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'total') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'currency') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'incurredOn') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'category') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'note') <> 'string'
     OR pg_catalog.jsonb_typeof(v_payload->'splitMethod') <> 'string'
     OR v_payload->>'splitMethod' NOT IN ('fixed', 'percentage', 'weighted')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(v_payload->'included') AS entry(key, value)
       WHERE entry.key !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(entry.value) <> 'boolean'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(v_payload->'payments') AS entry(key, value)
       WHERE entry.key !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR pg_catalog.char_length(entry.value #>> '{}') > 80
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(v_payload->'amounts') AS entry(key, value)
       WHERE entry.key !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR pg_catalog.char_length(entry.value #>> '{}') > 80
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(v_payload->'percentages') AS entry(key, value)
       WHERE entry.key !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR pg_catalog.char_length(entry.value #>> '{}') > 80
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(v_payload->'weights') AS entry(key, value)
       WHERE entry.key !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR pg_catalog.char_length(entry.value #>> '{}') > 80
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'payerKeys') AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'string'
          OR (item.value #>> '{}') !~ '^[A-Za-z0-9:_-]{1,80}$'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_payload->'payerKeys') AS item(value)
       GROUP BY item.value HAVING pg_catalog.count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  IF (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.jsonb_object_keys(v_payload->'included') AS key_name
     ) <> pg_catalog.jsonb_array_length(v_payload->'members')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(v_payload->'included') AS key_name
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE member.value->>'key' = key_name
       )
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT entry.key FROM pg_catalog.jsonb_each(v_payload->'payments') AS entry
         UNION ALL SELECT entry.key FROM pg_catalog.jsonb_each(v_payload->'amounts') AS entry
         UNION ALL SELECT entry.key FROM pg_catalog.jsonb_each(v_payload->'percentages') AS entry
         UNION ALL SELECT entry.key FROM pg_catalog.jsonb_each(v_payload->'weights') AS entry
       ) AS map_key
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE member.value->>'key' = map_key.key
       )
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_payload->'payerKeys') AS payer_key(value)
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE member.value->>'key' = payer_key.value
       )
     ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
    WHERE pg_catalog.jsonb_typeof(member.value) <> 'object'
       OR member.value - ARRAY['key', 'label', 'input', 'isSelf', 'included']::text[] <> '{}'::jsonb
       OR NOT (member.value ?& ARRAY['key', 'label', 'isSelf']::text[])
       OR pg_catalog.jsonb_typeof(member.value->'key') <> 'string'
       OR (member.value->>'key') !~ '^[A-Za-z0-9:_-]{1,80}$'
       OR pg_catalog.jsonb_typeof(member.value->'label') <> 'string'
       OR pg_catalog.char_length(pg_catalog.btrim(member.value->>'label')) NOT BETWEEN 1 AND 120
       OR pg_catalog.jsonb_typeof(member.value->'isSelf') <> 'boolean'
       OR (member.value ? 'included' AND pg_catalog.jsonb_typeof(member.value->'included') <> 'boolean')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
    GROUP BY member.value->>'key' HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  IF v_draft.context_type = 'group' THEN
    IF v_draft.group_id IS NULL
       OR pg_catalog.jsonb_typeof(v_payload->'circleId') <> 'null'
       OR pg_catalog.jsonb_typeof(v_payload->'eventId') <> 'null'
       OR pg_catalog.jsonb_typeof(v_payload->'eventRosterRevision') <> 'null'
       OR (v_payload->>'linkToEvent')::boolean
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE member.value ? 'input'
       ) THEN
      RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
    END IF;
  ELSE
    IF v_draft.group_id IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE NOT (member.value ? 'input')
            OR pg_catalog.jsonb_typeof(member.value->'input') <> 'object'
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
         WHERE member.value->'input'->>'type' = 'self'
       ) <> 1 THEN
      RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
    END IF;
  END IF;

  IF v_draft.context_type = 'one_off' AND EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
    WHERE NOT (member.value->'input' ?& ARRAY['type', 'key']::text[])
       OR pg_catalog.jsonb_typeof(member.value->'input'->'type') <> 'string'
       OR pg_catalog.jsonb_typeof(member.value->'input'->'key') <> 'string'
       OR NOT (
      (
        member.value->'input'->>'type' = 'self'
        AND (member.value->'input') - ARRAY['type', 'key']::text[] = '{}'::jsonb
        AND member.value->'input'->>'key' = member.value->>'key'
        AND (member.value->>'isSelf')::boolean
      ) OR (
        member.value->'input'->>'type' = 'guest'
        AND (member.value->'input') - ARRAY['type', 'key', 'display_name']::text[] = '{}'::jsonb
        AND member.value->'input' ?& ARRAY['key', 'display_name']::text[]
        AND member.value->'input'->>'key' = member.value->>'key'
        AND pg_catalog.jsonb_typeof(member.value->'input'->'display_name') = 'string'
        AND pg_catalog.char_length(pg_catalog.btrim(member.value->'input'->>'display_name')) BETWEEN 1 AND 120
        AND NOT (member.value->>'isSelf')::boolean
      ) OR (
        member.value->'input'->>'type' = 'relationship'
        AND (member.value->'input') - ARRAY['type', 'key', 'relationship_id']::text[] = '{}'::jsonb
        AND member.value->'input' ?& ARRAY['key', 'relationship_id']::text[]
        AND member.value->'input'->>'key' = member.value->>'key'
        AND member.value->'input'->>'relationship_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND NOT (member.value->>'isSelf')::boolean
      ) OR (
        member.value->'input'->>'type' = 'event_guest'
        AND (member.value->'input') - ARRAY['type', 'key', 'event_guest_id']::text[] = '{}'::jsonb
        AND member.value->'input' ?& ARRAY['key', 'event_guest_id']::text[]
        AND member.value->'input'->>'key' = member.value->>'key'
        AND member.value->'input'->>'event_guest_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND NOT (member.value->>'isSelf')::boolean
      ) OR (
        member.value->'input'->>'type' = 'email'
        AND (member.value->'input') - ARRAY['type', 'key', 'recipient_email', 'display_name']::text[] = '{}'::jsonb
        AND member.value->'input' ?& ARRAY['key', 'recipient_email', 'display_name']::text[]
        AND member.value->'input'->>'key' = member.value->>'key'
        AND pg_catalog.jsonb_typeof(member.value->'input'->'recipient_email') = 'string'
        AND pg_catalog.jsonb_typeof(member.value->'input'->'display_name') = 'string'
        AND pg_catalog.char_length(pg_catalog.btrim(member.value->'input'->>'display_name')) BETWEEN 1 AND 120
        AND NOT (member.value->>'isSelf')::boolean
      ) OR (
        member.value->'input'->>'type' = 'circle_member'
        AND (member.value->'input') - ARRAY['type', 'key', 'circle_id', 'circle_member_id']::text[] = '{}'::jsonb
        AND member.value->'input' ?& ARRAY['key', 'circle_id', 'circle_member_id']::text[]
        AND member.value->'input'->>'key' = member.value->>'key'
        AND member.value->'input'->>'circle_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND member.value->'input'->>'circle_member_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND NOT (member.value->>'isSelf')::boolean
      )
    )
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  v_title := pg_catalog.btrim(v_payload->>'title');
  v_currency := v_payload->>'currency';
  v_total_minor := public.expense_sql159_amount_minor(
    v_payload->>'total', v_currency, false
  );
  IF pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 200
     OR v_currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
     OR v_total_minor IS NULL
     OR v_payload->>'incurredOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR pg_catalog.char_length(v_payload->>'category') > 40
     OR pg_catalog.char_length(v_payload->>'note') > 1000 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  BEGIN
    v_incurred_on := (v_payload->>'incurredOn')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END;
  IF pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD') <> v_payload->>'incurredOn' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  v_category := NULLIF(pg_catalog.btrim(v_payload->>'category'), '');
  IF v_category IS NOT NULL AND v_category NOT IN (
    'food', 'accommodation', 'transport', 'travel', 'home',
    'entertainment', 'gifts', 'shopping', 'other'
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  v_note := NULLIF(pg_catalog.btrim(v_payload->>'note'), '');
  v_split_method := v_payload->>'splitMethod';
  v_link_to_event := (v_payload->>'linkToEvent')::boolean;
  v_visibility := CASE WHEN v_link_to_event
    THEN v_payload->>'eventVisibility' ELSE 'participants_only' END;

  IF pg_catalog.jsonb_typeof(v_payload->'circleId') = 'string'
     AND v_payload->>'circleId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_circle_id := (v_payload->>'circleId')::uuid;
  ELSIF pg_catalog.jsonb_typeof(v_payload->'circleId') <> 'null' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  IF pg_catalog.jsonb_typeof(v_payload->'eventId') = 'string'
     AND v_payload->>'eventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_event_id := (v_payload->>'eventId')::uuid;
  ELSIF pg_catalog.jsonb_typeof(v_payload->'eventId') <> 'null' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  IF pg_catalog.jsonb_typeof(v_payload->'eventRosterRevision') = 'number'
     AND v_payload->>'eventRosterRevision' ~ '^[1-9][0-9]*$'
     AND (v_payload->>'eventRosterRevision')::numeric <= 9007199254740991 THEN
    v_event_revision := (v_payload->>'eventRosterRevision')::bigint;
  ELSIF pg_catalog.jsonb_typeof(v_payload->'eventRosterRevision') <> 'null' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  IF (v_event_id IS NULL) <> (v_event_revision IS NULL)
     OR (v_link_to_event AND v_event_id IS NULL)
     OR (v_event_id IS NOT NULL AND v_circle_id IS NOT NULL)
     OR (v_draft.context_type = 'group' AND (v_circle_id IS NOT NULL OR v_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  IF v_event_id IS NOT NULL THEN
    v_event_scope := public.expense_sql159_event_scope_read_only(
      p_actor_id, v_event_id
    );
    -- SQL149 is the safe shared-label authority. The legacy V1 source may
    -- contain an email-shaped display snapshot and is never a publication
    -- source for SQL159.
    v_event_source := public.teskeid_event_get_legacy_expense_source_v2(
      p_actor_id, v_event_id
    );
    IF pg_catalog.jsonb_typeof(v_event_scope) <> 'object'
       OR v_event_scope - ARRAY['viewer_role', 'event_guest_id', 'identity_generation']::text[] <> '{}'::jsonb
       OR NOT (v_event_scope ?& ARRAY[
         'viewer_role', 'event_guest_id', 'identity_generation'
       ]::text[])
       OR pg_catalog.jsonb_typeof(v_event_scope->'viewer_role') <> 'string'
       OR v_event_scope->>'viewer_role' NOT IN ('owner', 'attendee')
       OR (
         v_event_scope->>'viewer_role' = 'owner'
         AND (
           pg_catalog.jsonb_typeof(v_event_scope->'event_guest_id') <> 'null'
           OR pg_catalog.jsonb_typeof(v_event_scope->'identity_generation') <> 'null'
         )
       )
       OR (
         v_event_scope->>'viewer_role' = 'attendee'
         AND (
           pg_catalog.jsonb_typeof(v_event_scope->'event_guest_id') <> 'string'
           OR v_event_scope->>'event_guest_id'
             !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR pg_catalog.jsonb_typeof(v_event_scope->'identity_generation') <> 'string'
           OR v_event_scope->>'identity_generation'
             !~ '^[1-9][0-9]*$'
           OR (v_event_scope->>'identity_generation')::numeric
             > 9007199254740991
         )
       )
       OR pg_catalog.jsonb_typeof(v_event_source) <> 'object'
       OR v_event_source - ARRAY['event_id', 'name', 'roster_revision', 'viewer_role', 'people']::text[] <> '{}'::jsonb
       OR NOT (v_event_source ?& ARRAY[
         'event_id', 'name', 'roster_revision', 'viewer_role', 'people'
       ]::text[])
       OR pg_catalog.jsonb_typeof(v_event_source->'event_id') <> 'string'
       OR v_event_source->>'event_id' IS DISTINCT FROM v_event_id::text
       OR pg_catalog.jsonb_typeof(v_event_source->'name') <> 'string'
       OR pg_catalog.jsonb_typeof(v_event_source->'roster_revision') <> 'string'
       OR pg_catalog.jsonb_typeof(v_event_source->'viewer_role') <> 'string'
       OR v_event_source->>'viewer_role'
         IS DISTINCT FROM v_event_scope->>'viewer_role'
       OR v_event_source->>'roster_revision' !~ '^[1-9][0-9]*$'
       OR (v_event_source->>'roster_revision')::numeric > 9007199254740991
       OR (v_event_source->>'roster_revision')::bigint <> v_event_revision
       OR pg_catalog.jsonb_typeof(v_event_source->'people') <> 'array'
       OR pg_catalog.jsonb_array_length(v_event_source->'people') > 49
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_event_source->'people') AS candidate(value)
         WHERE pg_catalog.jsonb_typeof(candidate.value) <> 'object'
            OR (candidate.value - 'viewer_private') - ARRAY[
              'legacy_person_ref', 'participant_kind', 'position', 'shared'
            ]::text[] <> '{}'::jsonb
            OR NOT (candidate.value ?& ARRAY[
              'legacy_person_ref', 'participant_kind', 'position', 'shared'
            ]::text[])
            OR pg_catalog.jsonb_typeof(candidate.value->'legacy_person_ref') <> 'string'
            OR candidate.value->>'legacy_person_ref' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            OR pg_catalog.jsonb_typeof(candidate.value->'participant_kind') <> 'string'
            OR candidate.value->>'participant_kind' NOT IN ('guest', 'organizer')
            OR pg_catalog.jsonb_typeof(candidate.value->'position') <> 'number'
            OR candidate.value->>'position' !~ '^[0-9]+$'
            OR (candidate.value->>'position')::numeric > 48
            OR pg_catalog.jsonb_typeof(candidate.value->'shared') <> 'object'
            OR (
              candidate.value ? 'viewer_private'
              AND (
                pg_catalog.jsonb_typeof(candidate.value->'viewer_private') <> 'object'
                OR pg_catalog.pg_column_size(candidate.value->'viewer_private') > 16384
              )
            )
            OR (
              candidate.value->>'participant_kind' = 'organizer'
              AND (
                candidate.value->'shared' - ARRAY[
                  'label_state', 'display_name', 'selectable', 'disabled_reason'
                ]::text[] <> '{}'::jsonb
                OR NOT COALESCE((
                  (
                    candidate.value->'shared'->>'label_state' = 'resolved'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'display_name'
                    ) = 'string'
                    AND pg_catalog.char_length(pg_catalog.btrim(
                      candidate.value->'shared'->>'display_name'
                    )) BETWEEN 1 AND 120
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'selectable'
                    ) = 'boolean'
                    AND (candidate.value->'shared'->>'selectable')::boolean
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'disabled_reason'
                    ) = 'null'
                  ) OR (
                    candidate.value->'shared'->>'label_state' = 'needs_owner_input'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'display_name'
                    ) = 'null'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'selectable'
                    ) = 'boolean'
                    AND NOT (candidate.value->'shared'->>'selectable')::boolean
                    AND candidate.value->'shared'->>'disabled_reason'
                      = 'profile_name_required'
                  )
                ), false)
              )
            )
            OR (
              candidate.value->>'participant_kind' = 'guest'
              AND (
                candidate.value->'shared' - ARRAY[
                  'access_state', 'label_state', 'display_name',
                  'selectable', 'disabled_reason'
                ]::text[] <> '{}'::jsonb
                OR pg_catalog.jsonb_typeof(
                  candidate.value->'shared'->'access_state'
                ) <> 'string'
                OR candidate.value->'shared'->>'access_state'
                  NOT IN ('active', 'left', 'revoked')
                OR NOT COALESCE((
                  (
                    candidate.value->'shared'->>'access_state' = 'active'
                    AND candidate.value->'shared'->>'label_state' = 'resolved'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'display_name'
                    ) = 'string'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'selectable'
                    ) = 'boolean'
                    AND (candidate.value->'shared'->>'selectable')::boolean
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'disabled_reason'
                    ) = 'null'
                  ) OR (
                    candidate.value->'shared'->>'access_state' = 'active'
                    AND candidate.value->'shared'->>'label_state'
                      = 'needs_owner_input'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'display_name'
                    ) = 'null'
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'selectable'
                    ) = 'boolean'
                    AND NOT (candidate.value->'shared'->>'selectable')::boolean
                    AND candidate.value->'shared'->>'disabled_reason'
                      IN ('name_required', 'profile_name_required')
                  ) OR (
                    candidate.value->'shared'->>'access_state'
                      IN ('left', 'revoked')
                    AND pg_catalog.jsonb_typeof(
                      candidate.value->'shared'->'selectable'
                    ) = 'boolean'
                    AND NOT (candidate.value->'shared'->>'selectable')::boolean
                    AND candidate.value->'shared'->>'disabled_reason' = 'not_active'
                    AND (
                      (
                        candidate.value->'shared'->>'label_state' = 'resolved'
                        AND pg_catalog.jsonb_typeof(
                          candidate.value->'shared'->'display_name'
                        ) = 'string'
                      ) OR (
                        candidate.value->'shared'->>'label_state'
                          = 'needs_owner_input'
                        AND pg_catalog.jsonb_typeof(
                          candidate.value->'shared'->'display_name'
                        ) = 'null'
                      )
                    )
                  )
                ), false)
              )
            )
       )
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_event_source->'people') AS candidate(value)
         GROUP BY candidate.value->>'legacy_person_ref'
         HAVING pg_catalog.count(*) > 1
       ) THEN
      RAISE EXCEPTION 'expense_unconfirmed_event_unavailable';
    END IF;
    SELECT event_row.owner_user_id INTO v_event_owner_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = v_event_id;
    v_event_owner_participant_id := public.teskeid_event_uuid_from_text(
      'teskeid-event-owner-participant:' || v_event_id::text
    );
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
    WHERE member.value->'input'->>'type' = 'event_guest'
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;

  FOR v_member_record IN
    SELECT member.value,
      pg_catalog.row_number() OVER (
        ORDER BY member.value->>'key' COLLATE pg_catalog."C"
      )::integer AS ordinal
    FROM pg_catalog.jsonb_array_elements(v_payload->'members') AS member(value)
    ORDER BY member.value->>'key' COLLATE pg_catalog."C"
  LOOP
    v_member := v_member_record.value;
    v_key := v_member->>'key';
    v_all_member_count := v_all_member_count + 1;
    v_is_payer := EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_payload->'payerKeys') AS payer(value)
      WHERE payer.value = v_key
    );
    v_is_participant := (v_payload->'included'->>v_key)::boolean;
    v_source_kind := NULL;
    v_source_id := NULL;
    v_source_user_id := NULL;
    v_binding_generation := NULL;
    v_display_name := NULL;
    v_safe_display_name := NULL;
    v_identity_token := NULL;
    v_input := v_member->'input';
    v_member_id := public.teskeid_event_uuid_from_text(
      'expense-sql159-member-v1:' || p_draft_id::text || ':' || v_key
    );

    IF v_draft.context_type = 'group' THEN
      IF v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
      END IF;
      v_member_id := v_key::uuid;
      SELECT group_member.user_id,
        COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''),
          NULLIF(pg_catalog.btrim(group_member.display_name), ''), 'Teskeiðarnotandi')
      INTO v_source_user_id, v_display_name
      FROM public.expense_group_members AS group_member
      LEFT JOIN public.profiles AS profile ON profile.id = group_member.user_id
      WHERE group_member.id = v_member_id
        AND group_member.group_id = v_draft.group_id
        AND group_member.status = 'active';
      IF v_display_name IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_source_changed'; END IF;
      v_source_kind := 'group';
      v_source_id := v_member_id;
      v_identity_token := 'group:' || v_member_id::text || ':'
        || COALESCE(v_source_user_id::text, 'guest');
    ELSIF v_input->>'type' = 'self' THEN
      v_source_kind := 'author';
      v_source_user_id := p_actor_id;
      SELECT COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), 'Teskeiðarnotandi')
      INTO v_display_name FROM public.profiles AS profile WHERE profile.id = p_actor_id;
      v_display_name := COALESCE(v_display_name, 'Teskeiðarnotandi');
      v_identity_token := 'author:' || p_actor_id::text;
    ELSIF v_input->>'type' = 'guest' THEN
      v_source_kind := 'manual';
      v_display_name := pg_catalog.btrim(v_input->>'display_name');
      v_identity_token := 'manual:' || pg_catalog.md5(v_key);
    ELSIF v_input->>'type' = 'email' THEN
      IF v_circle_id IS NOT NULL THEN
        RAISE EXCEPTION 'expense_unconfirmed_source_changed';
      END IF;
      v_source_kind := 'email';
      v_display_name := pg_catalog.btrim(v_input->>'display_name');
      v_email := public.normalize_email_canonical(v_input->>'recipient_email');
      IF v_email IS NULL OR pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320
         OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'expense_unconfirmed_source_changed';
      END IF;
      v_safe_display_name := 'Boðsgestur';
      v_identity_token := 'email:' || pg_catalog.md5(v_email);
      v_participant_invitations := v_participant_invitations
        || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'member_id', v_member_id, 'recipient_email', v_email
        ));
      v_authority_tokens := v_authority_tokens
        || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'kind', 'email', 'key_hash', pg_catalog.md5(v_key),
          'source_hash', pg_catalog.md5(v_email)
        ));
    ELSIF v_input->>'type' = 'relationship' THEN
      v_relationship_id := (v_input->>'relationship_id')::uuid;
      SELECT relationship.counterpart_user_id,
        COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), 'Teskeiðarnotandi')
      INTO v_source_user_id, v_display_name
      FROM public.relationships AS relationship
      JOIN auth.users AS account ON account.id = relationship.counterpart_user_id
      LEFT JOIN public.profiles AS profile ON profile.id = relationship.counterpart_user_id
      WHERE relationship.id = v_relationship_id
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;
      IF v_source_user_id IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_source_changed'; END IF;
      v_source_kind := 'relationship';
      v_source_id := v_relationship_id;
      v_identity_token := 'user:' || v_source_user_id::text;
      v_participant_invitations := v_participant_invitations
        || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'member_id', v_member_id, 'relationship_id', v_relationship_id
        ));
      v_known_relationship_members := v_known_relationship_members
        || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'member_id', v_member_id, 'relationship_id', v_relationship_id
        ));
    ELSIF v_input->>'type' = 'circle_member' THEN
      v_circle_member_id := (v_input->>'circle_member_id')::uuid;
      IF v_circle_id IS NULL OR (v_input->>'circle_id')::uuid <> v_circle_id
         OR NOT EXISTS (
           SELECT 1 FROM public.relationship_circles AS circle
           JOIN public.relationship_circle_members AS actor_member
             ON actor_member.circle_id = circle.id
            AND actor_member.user_id = p_actor_id
            AND actor_member.status = 'active'
           WHERE circle.id = v_circle_id AND circle.status = 'active'
         ) THEN
        RAISE EXCEPTION 'expense_unconfirmed_source_changed';
      END IF;
      SELECT circle_member.user_id,
        COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), 'Teskeiðarnotandi')
      INTO v_source_user_id, v_display_name
      FROM public.relationship_circle_members AS circle_member
      JOIN auth.users AS account ON account.id = circle_member.user_id
      LEFT JOIN public.profiles AS profile ON profile.id = circle_member.user_id
      WHERE circle_member.id = v_circle_member_id
        AND circle_member.circle_id = v_circle_id
        AND circle_member.status = 'active'
        AND circle_member.user_id <> p_actor_id;
      IF v_source_user_id IS NULL THEN RAISE EXCEPTION 'expense_unconfirmed_source_changed'; END IF;
      v_source_kind := 'circle';
      v_source_id := v_circle_member_id;
      v_identity_token := 'user:' || v_source_user_id::text;
      v_known_circle_members := v_known_circle_members
        || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'member_id', v_member_id, 'circle_member_id', v_circle_member_id
        ));
    ELSIF v_input->>'type' = 'event_guest' THEN
      v_source_id := (v_input->>'event_guest_id')::uuid;
      SELECT candidate.value INTO v_event_candidate
      FROM pg_catalog.jsonb_array_elements(v_event_source->'people') AS candidate(value)
      WHERE candidate.value->>'legacy_person_ref' = v_source_id::text;
      IF v_event_candidate IS NULL
         OR v_event_candidate->'shared'->>'label_state' <> 'resolved'
         OR pg_catalog.jsonb_typeof(
           v_event_candidate->'shared'->'display_name'
         ) <> 'string'
         OR pg_catalog.char_length(pg_catalog.btrim(
           v_event_candidate->'shared'->>'display_name'
         )) NOT BETWEEN 1 AND 120
         OR pg_catalog.strpos(
           v_event_candidate->'shared'->>'display_name', '@'
         ) <> 0
         OR pg_catalog.jsonb_typeof(
           v_event_candidate->'shared'->'selectable'
         ) <> 'boolean'
         OR NOT (v_event_candidate->'shared'->>'selectable')::boolean
         OR pg_catalog.jsonb_typeof(
           v_event_candidate->'shared'->'disabled_reason'
         ) <> 'null'
         OR (
           v_event_candidate->>'participant_kind' = 'guest'
           AND v_event_candidate->'shared'->>'access_state' <> 'active'
         ) THEN
        RAISE EXCEPTION 'expense_unconfirmed_source_changed';
      END IF;
      v_display_name := pg_catalog.btrim(
        v_event_candidate->'shared'->>'display_name'
      );
      IF v_event_candidate->>'participant_kind' = 'organizer' THEN
        IF v_source_id <> v_event_owner_participant_id OR v_event_owner_id IS NULL
           OR v_event_owner_id = p_actor_id THEN
          RAISE EXCEPTION 'expense_unconfirmed_source_changed';
        END IF;
        v_source_kind := 'event_organizer';
        v_source_user_id := v_event_owner_id;
        v_identity_token := 'user:' || v_source_user_id::text;
        v_event_organizer_members := v_event_organizer_members
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'event_participant_id', v_source_id, 'member_id', v_member_id
          ));
      ELSE
        v_source_kind := 'event_guest';
        v_event_guest_members := v_event_guest_members
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'event_guest_id', v_source_id, 'member_id', v_member_id
          ));
        SELECT participation.recipient_user_id, participation.identity_generation
        INTO v_source_user_id, v_binding_generation
        FROM public.teskeid_event_participations AS participation
        JOIN public.teskeid_event_guests AS event_guest
          ON event_guest.event_id = participation.event_id
         AND event_guest.id = participation.event_guest_id
         AND event_guest.status = 'active'
        JOIN public.teskeid_event_participation_rsvp_v3 AS decision
          ON decision.event_id = participation.event_id
         AND decision.event_guest_id = participation.event_guest_id
         AND decision.identity_generation = participation.identity_generation
         AND decision.decision_version = participation.rsvp_version
        WHERE participation.event_id = v_event_id
          AND participation.event_guest_id = v_source_id
          AND participation.access_state = 'active'
          AND participation.recipient_user_id IS NOT NULL;
        v_identity_token := CASE WHEN v_source_user_id IS NULL
          THEN 'event-guest:' || v_source_id::text
          ELSE 'user:' || v_source_user_id::text END;
      END IF;
    ELSE
      RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
    END IF;

    IF pg_catalog.char_length(pg_catalog.btrim(v_display_name)) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'expense_unconfirmed_source_changed';
    END IF;
    IF v_identity_token IS NULL
       OR v_identity_token = ANY(v_seen_identity_tokens) THEN
      RAISE EXCEPTION 'expense_unconfirmed_duplicate_identity';
    END IF;
    v_seen_identity_tokens := pg_catalog.array_append(
      v_seen_identity_tokens, v_identity_token
    );
    -- Shared identity copy never carries an email-shaped profile, group or
    -- manual label. Canonical helper payloads retain their independently
    -- authorized current labels; only the publication projection is reduced.
    v_safe_display_name := COALESCE(
      v_safe_display_name,
      CASE
        WHEN pg_catalog.strpos(v_display_name, '@') = 0
          THEN pg_catalog.btrim(v_display_name)
        WHEN v_source_kind = 'author' THEN 'Teskeiðarnotandi'
        ELSE 'Gestur'
      END
    );
    v_is_author := COALESCE(v_source_user_id = p_actor_id, false);
    IF (v_member->>'isSelf')::boolean IS DISTINCT FROM v_is_author THEN
      RAISE EXCEPTION 'expense_unconfirmed_author_required';
    END IF;
    IF v_is_author AND (v_is_payer OR v_is_participant) THEN
      v_author_selected := true;
    END IF;
    IF v_source_user_id IS NOT NULL THEN
      IF v_source_user_id = ANY(v_seen_users) THEN
        RAISE EXCEPTION 'expense_unconfirmed_duplicate_identity';
      END IF;
      v_seen_users := pg_catalog.array_append(v_seen_users, v_source_user_id);
      IF v_is_author OR v_is_payer OR v_is_participant THEN
        v_audience := v_audience || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'user_id', v_source_user_id,
            'audience_kind', CASE WHEN v_is_author THEN 'author' ELSE v_source_kind END,
            'identity_token_hash', CASE WHEN v_is_author THEN NULL
              ELSE pg_catalog.md5(v_identity_token) END,
            'binding_id', CASE WHEN v_is_author THEN NULL ELSE v_source_id END,
            'binding_generation', CASE WHEN v_is_author THEN NULL ELSE v_binding_generation END
          )
        );
      END IF;
    END IF;
    IF v_is_payer OR v_is_participant THEN
      v_selected_count := v_selected_count + 1;
      v_parties := v_parties || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'key', v_key,
          'member_id', v_member_id,
          'display_name', pg_catalog.btrim(v_display_name),
          'safe_display_name', v_safe_display_name,
          'identity_token', v_identity_token,
          'source_kind', v_source_kind,
          'source_id', v_source_id,
          'source_user_id', v_source_user_id,
          'binding_generation', v_binding_generation,
          'is_author', v_is_author,
          'is_payer', v_is_payer,
          'is_participant', v_is_participant,
          'ordinal', v_selected_count
        )
      );
    END IF;
    IF v_draft.context_type = 'one_off' THEN
      v_one_off_members := v_one_off_members || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_member_id,
          'user_id', CASE WHEN v_is_author THEN v_source_user_id ELSE NULL END,
          'display_name', v_safe_display_name,
          'role', CASE WHEN v_is_author THEN 'owner' ELSE 'member' END,
          'status', 'active'
        )
      );
    END IF;
    v_authority_tokens := v_authority_tokens || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key_hash', pg_catalog.md5(v_key),
        'source_kind', v_source_kind,
        'source_id', v_source_id,
        'source_user_id', v_source_user_id,
        'binding_generation', v_binding_generation
      )
    );
  END LOOP;

  IF v_all_member_count NOT BETWEEN 1 AND 50
     OR v_selected_count NOT BETWEEN 1 AND 50
     OR NOT v_author_selected THEN
    RAISE EXCEPTION 'expense_unconfirmed_author_required';
  END IF;

  FOR v_party IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_parties) AS item(value)
    ORDER BY (item.value->>'ordinal')::integer
  LOOP
    IF (v_party->>'is_payer')::boolean THEN
      v_paid_minor := public.expense_sql159_amount_minor(
        v_payload->'payments'->>(v_party->>'key'), v_currency, false
      );
      IF v_paid_minor IS NULL THEN
        v_payments_valid := false;
      ELSE
        v_payment_sum := v_payment_sum + v_paid_minor;
        v_payments_by_key := v_payments_by_key || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('key', v_party->>'key', 'amount_minor', v_paid_minor)
        );
      END IF;
    ELSIF COALESCE(pg_catalog.btrim(v_payload->'payments'->>(v_party->>'key')), '') <> '' THEN
      v_payments_valid := false;
    END IF;
  END LOOP;
  IF v_payment_sum <> v_total_minor THEN v_payments_valid := false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_parties) AS party(value)
    WHERE (party.value->>'is_participant')::boolean
  ) THEN
    v_shares_valid := false;
  ELSIF v_split_method = 'fixed' THEN
    FOR v_party IN SELECT item.value
      FROM pg_catalog.jsonb_array_elements(v_parties) AS item(value)
      WHERE (item.value->>'is_participant')::boolean
      ORDER BY (item.value->>'ordinal')::integer
    LOOP
      v_share_minor := public.expense_sql159_amount_minor(
        v_payload->'amounts'->>(v_party->>'key'), v_currency, true
      );
      IF v_share_minor IS NULL THEN
        v_shares_valid := false;
      ELSE
        v_share_sum := v_share_sum + v_share_minor;
        v_shares_by_key := v_shares_by_key || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('key', v_party->>'key', 'amount_minor', v_share_minor)
        );
      END IF;
    END LOOP;
    IF v_share_sum <> v_total_minor THEN v_shares_valid := false; END IF;
  ELSIF v_split_method = 'percentage' THEN
    FOR v_party IN SELECT item.value
      FROM pg_catalog.jsonb_array_elements(v_parties) AS item(value)
      WHERE (item.value->>'is_participant')::boolean
      ORDER BY (item.value->>'ordinal')::integer
    LOOP
      v_weight := public.expense_sql159_percentage_basis_points(
        v_payload->'percentages'->>(v_party->>'key')
      );
      IF v_weight IS NULL THEN
        v_shares_valid := false;
      ELSE
        v_weight_total := v_weight_total + v_weight;
        v_weights := v_weights || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('key', v_party->>'key', 'weight', v_weight)
        );
      END IF;
    END LOOP;
    IF v_weight_total <> 10000 THEN v_shares_valid := false; END IF;
    IF v_shares_valid THEN
      v_shares_by_key := public.expense_sql159_allocate_weighted(
        v_total_minor, v_weights, 10000
      );
      IF v_shares_by_key IS NULL THEN v_shares_valid := false; END IF;
    END IF;
  ELSE
    FOR v_party IN SELECT item.value
      FROM pg_catalog.jsonb_array_elements(v_parties) AS item(value)
      WHERE (item.value->>'is_participant')::boolean
      ORDER BY (item.value->>'ordinal')::integer
    LOOP
      v_weight := public.expense_sql159_weight(
        COALESCE(v_payload->'weights'->>(v_party->>'key'), '1')
      );
      IF v_weight IS NULL THEN
        v_shares_valid := false;
      ELSE
        v_weight_total := v_weight_total + v_weight;
        v_weights := v_weights || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('key', v_party->>'key', 'weight', v_weight)
        );
      END IF;
    END LOOP;
    IF v_weight_total NOT BETWEEN 1 AND 1000000 THEN v_shares_valid := false; END IF;
    IF v_shares_valid THEN
      v_shares_by_key := public.expense_sql159_allocate_weighted(
        v_total_minor, v_weights, v_weight_total::bigint
      );
      IF v_shares_by_key IS NULL THEN v_shares_valid := false; END IF;
    END IF;
  END IF;

  v_allocation_state := CASE
    WHEN v_payments_valid AND v_shares_valid THEN 'balanced_unconfirmed'
    ELSE 'incomplete'
  END;
  IF p_require_balanced AND (
    v_allocation_state <> 'balanced_unconfirmed'
    OR (v_draft.context_type = 'one_off' AND v_all_member_count < 2)
  ) THEN
    RAISE EXCEPTION 'expense_unconfirmed_split_not_ready';
  END IF;

  FOR v_party IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_parties) AS item(value)
    ORDER BY (item.value->>'ordinal')::integer
  LOOP
    v_paid_minor := 0;
    v_share_minor := 0;
    IF v_allocation_state = 'balanced_unconfirmed' THEN
      SELECT (item.value->>'amount_minor')::bigint INTO v_paid_minor
      FROM pg_catalog.jsonb_array_elements(v_payments_by_key) AS item(value)
      WHERE item.value->>'key' = v_party->>'key';
      v_paid_minor := COALESCE(v_paid_minor, 0);
      SELECT (item.value->>'amount_minor')::bigint INTO v_share_minor
      FROM pg_catalog.jsonb_array_elements(v_shares_by_key) AS item(value)
      WHERE item.value->>'key' = v_party->>'key';
      v_share_minor := COALESCE(v_share_minor, 0);
    END IF;
    v_safe_parties := v_safe_parties || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ordinal', (v_party->>'ordinal')::integer,
        'party_key_hash', pg_catalog.md5(v_party->>'key'),
        'identity_token_hash', pg_catalog.md5(v_party->>'identity_token'),
        'display_name', v_party->>'safe_display_name',
        'is_author', (v_party->>'is_author')::boolean,
        'is_payer', (v_party->>'is_payer')::boolean,
        'is_participant', (v_party->>'is_participant')::boolean,
        'paid_minor', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
          THEN v_paid_minor ELSE NULL END,
        'share_minor', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
          THEN v_share_minor ELSE NULL END
      )
    );
    v_fingerprint_parties := v_fingerprint_parties || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'identity', pg_catalog.md5(v_party->>'identity_token'),
        'displayName', v_party->>'safe_display_name',
        'isAuthor', (v_party->>'is_author')::boolean,
        'isPayer', (v_party->>'is_payer')::boolean,
        'isParticipant', (v_party->>'is_participant')::boolean,
        'paidMinor', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
          THEN v_paid_minor ELSE NULL END,
        'shareMinor', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
          THEN v_share_minor ELSE NULL END
      )
    );
    IF v_allocation_state = 'balanced_unconfirmed' THEN
      IF (v_party->>'is_payer')::boolean THEN
        v_payments := v_payments || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'member_id', (v_party->>'member_id')::uuid,
            'amount_minor', v_paid_minor
          )
        );
      END IF;
      IF (v_party->>'is_participant')::boolean THEN
        v_shares := v_shares || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'member_id', (v_party->>'member_id')::uuid,
            'amount_minor', v_share_minor
          )
        );
      END IF;
    END IF;
  END LOOP;

  v_allocation_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'totalMinor', v_total_minor,
    'currency', v_currency,
    'splitMethod', v_split_method,
    'payments', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
      THEN v_payments_by_key ELSE '[]'::jsonb END,
    'shares', CASE WHEN v_allocation_state = 'balanced_unconfirmed'
      THEN v_shares_by_key ELSE '[]'::jsonb END
  )::text);
  v_shareable_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'contextType', v_draft.context_type,
    'title', v_title,
    'totalMinor', v_total_minor,
    'currency', v_currency,
    'incurredOn', v_incurred_on,
    'allocationState', v_allocation_state,
    'parties', v_fingerprint_parties,
    'audience', (
      SELECT COALESCE(pg_catalog.jsonb_agg(item.value->>'user_id'
        ORDER BY item.value->>'user_id' COLLATE pg_catalog."C"), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(v_audience) AS item(value)
    ),
    'event', CASE WHEN v_link_to_event THEN pg_catalog.jsonb_build_object(
      'eventId', v_event_id,
      'visibility', v_visibility
    ) ELSE 'null'::jsonb END
  )::text);
  v_authority_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'contextType', v_draft.context_type,
    'groupId', v_draft.group_id,
    'circleId', v_circle_id,
    'eventId', v_event_id,
    'eventRosterRevision', v_event_revision,
    'linkToEvent', v_link_to_event,
    'authorityTokens', v_authority_tokens
  )::text);

  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'draft_version', v_draft.version,
    'context_type', v_draft.context_type,
    'group_id', v_draft.group_id,
    'circle_id', v_circle_id,
    'event_id', v_event_id,
    'event_roster_revision', v_event_revision,
    'link_to_event', v_link_to_event,
    'visibility', v_visibility,
    'title', v_title,
    'total_minor', v_total_minor,
    'currency', v_currency,
    'incurred_on', v_incurred_on,
    'category', v_category,
    'note', v_note,
    'split_method', v_split_method,
    'allocation_state', v_allocation_state,
    'parties', v_safe_parties,
    'audience', v_audience,
    'shareable_fingerprint', v_shareable_fingerprint,
    'authority_fingerprint', v_authority_fingerprint,
    'allocation_fingerprint', v_allocation_fingerprint,
    'one_off_members', v_one_off_members,
    'payments', v_payments,
    'shares', v_shares,
    'participant_invitations', v_participant_invitations,
    'known_relationship_members', v_known_relationship_members,
    'known_circle_members', v_known_circle_members,
    'event_guest_members', v_event_guest_members,
    'event_organizer_members', v_event_organizer_members
  );
END;
$function$;

CREATE FUNCTION public.expense_sql159_percentage_basis_points(p_raw text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_value text;
  v_whole text;
  v_fraction text;
  v_points numeric;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  v_value := pg_catalog.replace(pg_catalog.btrim(p_raw), ',', '.');
  IF v_value !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RETURN NULL; END IF;
  v_whole := pg_catalog.split_part(v_value, '.', 1);
  v_fraction := CASE WHEN pg_catalog.strpos(v_value, '.') > 0
    THEN pg_catalog.rpad(pg_catalog.split_part(v_value, '.', 2), 2, '0')
    ELSE '0' END;
  v_points := v_whole::numeric * 100 + v_fraction::numeric;
  IF v_points NOT BETWEEN 0 AND 10000 THEN RETURN NULL; END IF;
  RETURN v_points::bigint;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.expense_sql159_weight(p_raw text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_weight numeric;
BEGIN
  IF p_raw IS NULL OR pg_catalog.btrim(p_raw) !~ '^[0-9]{1,7}$' THEN
    RETURN NULL;
  END IF;
  v_weight := pg_catalog.btrim(p_raw)::numeric;
  IF v_weight NOT BETWEEN 0 AND 1000000 THEN RETURN NULL; END IF;
  RETURN v_weight::bigint;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN NULL;
END;
$function$;

-- Largest-remainder allocation matching the app for bounded ASCII party keys.
CREATE FUNCTION public.expense_sql159_allocate_weighted(
  p_total_minor bigint,
  p_weights jsonb,
  p_expected_weight_total bigint
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_total_minor NOT BETWEEN 0 AND 9007199254740991
     OR p_expected_weight_total NOT BETWEEN 1 AND 1000000
     OR pg_catalog.jsonb_typeof(p_weights) <> 'array'
     OR pg_catalog.jsonb_array_length(p_weights) NOT BETWEEN 1 AND 50
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_weights) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
          OR item.value - ARRAY['key', 'weight']::text[] <> '{}'::jsonb
          OR NOT (item.value ?& ARRAY['key', 'weight']::text[])
          OR pg_catalog.jsonb_typeof(item.value->'key') <> 'string'
          OR (item.value->>'key') !~ '^[A-Za-z0-9:_-]{1,80}$'
          OR pg_catalog.jsonb_typeof(item.value->'weight') <> 'number'
          OR (item.value->>'weight') !~ '^[0-9]+$'
          OR (item.value->>'weight')::numeric NOT BETWEEN 0 AND p_expected_weight_total
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_weights) AS item(value)
       GROUP BY item.value->>'key' HAVING pg_catalog.count(*) > 1
     )
     OR (
       SELECT COALESCE(pg_catalog.sum((item.value->>'weight')::bigint), 0)
       FROM pg_catalog.jsonb_array_elements(p_weights) AS item(value)
     ) <> p_expected_weight_total THEN
    RETURN NULL;
  END IF;

  WITH calculated AS MATERIALIZED (
    SELECT item.value->>'key' AS party_key,
      (p_total_minor / p_expected_weight_total)
        * (item.value->>'weight')::bigint
      + ((p_total_minor % p_expected_weight_total)
        * (item.value->>'weight')::bigint / p_expected_weight_total)
        AS base_minor,
      ((p_total_minor % p_expected_weight_total)
        * (item.value->>'weight')::bigint % p_expected_weight_total)
        AS remainder_numerator
    FROM pg_catalog.jsonb_array_elements(p_weights) AS item(value)
  ), totals AS MATERIALIZED (
    SELECT p_total_minor - pg_catalog.sum(calculated.base_minor) AS remaining
    FROM calculated
  ), ranked AS MATERIALIZED (
    SELECT calculated.*,
      pg_catalog.row_number() OVER (
        ORDER BY calculated.remainder_numerator DESC,
          calculated.party_key COLLATE pg_catalog."C"
      ) AS remainder_rank
    FROM calculated
  )
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'key', ranked.party_key,
    'amount_minor', ranked.base_minor
      + CASE WHEN ranked.remainder_rank <= totals.remaining THEN 1 ELSE 0 END
  ) ORDER BY ranked.party_key COLLATE pg_catalog."C")
  INTO v_result
  FROM ranked CROSS JOIN totals;
  RETURN v_result;
END;
$function$;

-- All shared reads pass this gate after visibility has selected a candidate.
-- It validates only normalized snapshot relations and never reads raw payload.
CREATE FUNCTION public.expense_sql159_snapshot_is_valid(p_draft_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.expense_unconfirmed_publications AS publication
    JOIN public.expense_private_drafts AS draft
      ON draft.id = publication.draft_id
     AND draft.actor_user_id = publication.actor_user_id
    CROSS JOIN LATERAL (
      SELECT pg_catalog.count(*) AS party_count,
        pg_catalog.count(*) FILTER (WHERE party.is_author) AS author_count,
        pg_catalog.count(*) FILTER (WHERE party.is_payer) AS payer_count,
        pg_catalog.count(*) FILTER (WHERE party.is_participant) AS participant_count,
        pg_catalog.min(party.ordinal) AS minimum_ordinal,
        pg_catalog.max(party.ordinal) AS maximum_ordinal,
        COALESCE(pg_catalog.sum(party.paid_minor), 0) AS paid_total,
        COALESCE(pg_catalog.sum(party.share_minor), 0) AS share_total
      FROM public.expense_unconfirmed_publication_parties AS party
      WHERE party.draft_id = publication.draft_id
    ) AS party_stats
    CROSS JOIN LATERAL (
      SELECT pg_catalog.count(*) AS audience_count,
        pg_catalog.count(*) FILTER (
          WHERE audience.audience_kind = 'author'
            AND audience.user_id = publication.actor_user_id
            AND audience.binding_id IS NULL
            AND audience.binding_generation IS NULL
        ) AS author_audience_count
      FROM public.expense_unconfirmed_publication_audience AS audience
      WHERE audience.draft_id = publication.draft_id
    ) AS audience_stats
    WHERE publication.draft_id = p_draft_id
      AND publication.is_live
      AND draft.expense_id IS NULL
      AND draft.context_type = publication.context_type
      AND draft.group_id IS NOT DISTINCT FROM publication.group_id
      AND draft.version BETWEEN publication.source_draft_version
        AND 9007199254740991
      AND party_stats.party_count BETWEEN 1 AND 50
      AND party_stats.author_count = 1
      AND party_stats.payer_count >= 1
      AND party_stats.minimum_ordinal = 1
      AND party_stats.maximum_ordinal = party_stats.party_count
      AND audience_stats.audience_count BETWEEN 1 AND party_stats.party_count
      AND audience_stats.author_audience_count = 1
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_unconfirmed_publication_audience AS audience
        LEFT JOIN public.expense_unconfirmed_publication_parties AS party
          ON party.draft_id = audience.draft_id
         AND party.identity_token_hash = audience.identity_token_hash
        WHERE audience.draft_id = publication.draft_id
          AND (
            (
              audience.audience_kind = 'author'
              AND (
                audience.user_id IS DISTINCT FROM publication.actor_user_id
                OR audience.identity_token_hash IS NOT NULL
                OR audience.binding_id IS NOT NULL
                OR audience.binding_generation IS NOT NULL
              )
            )
            OR (
              audience.audience_kind <> 'author'
              AND (
                party.draft_id IS NULL
                OR NOT (party.is_payer OR party.is_participant)
                OR party.is_author
              )
            )
          )
      )
      AND (
        publication.allocation_state = 'incomplete'
            OR (
          publication.allocation_state = 'balanced_unconfirmed'
          AND party_stats.participant_count >= 1
          AND party_stats.paid_total = publication.total_minor
          AND party_stats.share_total = publication.total_minor
        )
      )
  ), false);
$function$;

-- Tolerant author-only Event resume summary. It never exposes payload and does
-- not require a draft to be publication-safe; blank/partial form state maps to
-- null summary fields instead of taking down the pre-active source.
CREATE FUNCTION public.expense_sql159_private_event_summary(
  p_actor_id uuid,
  p_draft_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_title text;
  v_currency text;
  v_total_minor bigint;
  v_incurred_on date;
BEGIN
  SELECT draft.* INTO v_draft
  FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.actor_user_id = p_actor_id;
  IF v_draft.id IS NULL
     OR v_draft.context_type <> 'one_off'
     OR v_draft.expense_id IS NOT NULL
     OR v_draft.version NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.jsonb_typeof(v_draft.payload) <> 'object'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'eventId') <> 'string'
     OR v_draft.payload->>'eventId'
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (v_draft.payload->>'eventId')::uuid IS DISTINCT FROM p_event_id
     OR pg_catalog.jsonb_typeof(v_draft.payload->'linkToEvent') <> 'boolean'
     OR (v_draft.payload->>'linkToEvent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_unconfirmed_not_found';
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'title') = 'string'
     AND pg_catalog.char_length(
       pg_catalog.btrim(v_draft.payload->>'title')
     ) BETWEEN 1 AND 200 THEN
    v_title := pg_catalog.btrim(v_draft.payload->>'title');
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'currency') = 'string'
     AND v_draft.payload->>'currency'
       IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK') THEN
    v_currency := v_draft.payload->>'currency';
  END IF;
  IF v_currency IS NOT NULL
     AND pg_catalog.jsonb_typeof(v_draft.payload->'total') = 'string' THEN
    v_total_minor := public.expense_sql159_amount_minor(
      v_draft.payload->>'total', v_currency, false
    );
  END IF;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'incurredOn') = 'string'
     AND v_draft.payload->>'incurredOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    BEGIN
      v_incurred_on := (v_draft.payload->>'incurredOn')::date;
      IF pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD')
         <> v_draft.payload->>'incurredOn' THEN
        v_incurred_on := NULL;
      END IF;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      v_incurred_on := NULL;
    END;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'draft_version', v_draft.version,
    'title', v_title,
    'total_minor', v_total_minor,
    'currency', v_currency,
    'incurred_on', CASE WHEN v_incurred_on IS NULL THEN NULL
      ELSE pg_catalog.to_char(v_incurred_on, 'YYYY-MM-DD') END,
    'allocation_state', 'incomplete'
  );
END;
$function$;

CREATE FUNCTION public.expense_list_visible_shared_drafts(p_actor_id uuid)
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
          -- The stable shared snapshot remains readable when later private
          -- work is malformed or its source needs attention. Only the author
          -- sees this conservative stale signal.
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

CREATE FUNCTION public.expense_get_shared_draft_detail(
  p_actor_id uuid,
  p_publication_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_parties jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_publication_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.publication_id = p_publication_id
    AND publication.is_live
    AND public.expense_sql159_audience_allows(
      p_actor_id, publication.draft_id
    )
  FOR SHARE OF publication;
  IF v_publication.draft_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  IF NOT public.expense_sql159_snapshot_is_valid(v_publication.draft_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'not_found'
    );
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'display_name', party.display_name,
      'is_author', party.is_author,
      'is_payer', party.is_payer,
      'is_participant', party.is_participant,
      'proposed_paid_minor', party.paid_minor,
      'proposed_share_minor', party.share_minor
    ) ORDER BY party.ordinal
  ), '[]'::jsonb)
  INTO v_parties
  FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = v_publication.draft_id;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', 'ready',
    'draft', pg_catalog.jsonb_build_object(
      'lifecycle_state', 'shared_draft',
      'publication_id', v_publication.publication_id,
      'publication_version', v_publication.publication_version,
      'title', v_publication.title,
      'total_minor', v_publication.total_minor,
      'currency', v_publication.currency,
      'incurred_on', pg_catalog.to_char(v_publication.incurred_on, 'YYYY-MM-DD'),
      'allocation_state', v_publication.allocation_state,
      'viewer_role', CASE WHEN v_publication.actor_user_id = p_actor_id
        THEN 'author' ELSE 'participant' END,
      'parties', v_parties
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'not_found'
  );
END;
$function$;

CREATE FUNCTION public.expense_list_group_shared_drafts(
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
    SELECT publication.*
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.is_live
      AND publication.context_type = 'group'
      AND publication.group_id = p_group_id
      AND public.expense_sql159_audience_allows(
        p_actor_id, publication.draft_id
      )
    ORDER BY publication.updated_at DESC, publication.publication_id DESC
    LIMIT 101
    FOR SHARE OF publication
  LOOP
    v_count := v_count + 1;
    IF v_count > 100
       OR NOT public.expense_sql159_snapshot_is_valid(v_candidate.draft_id) THEN
      RETURN pg_catalog.jsonb_build_object(
        'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
      );
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
        'detail_target', pg_catalog.jsonb_build_object(
          'kind', 'shared_draft',
          'publication_id', v_candidate.publication_id
        )
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

CREATE FUNCTION public.teskeid_event_get_expense_pre_active_v1(
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

ALTER TABLE public.expense_unconfirmed_publications OWNER TO postgres;
ALTER TABLE public.expense_unconfirmed_publication_parties OWNER TO postgres;
ALTER TABLE public.expense_unconfirmed_publication_audience OWNER TO postgres;
ALTER TABLE public.expense_unconfirmed_finalizations OWNER TO postgres;
ALTER TABLE public.expense_private_draft_tombstones OWNER TO postgres;
ALTER TABLE public.expense_sql159_install_baseline OWNER TO postgres;

ALTER FUNCTION public.expense_sql159_amount_minor(text,text,boolean)
  OWNER TO postgres;
ALTER FUNCTION public.expense_finalize_private_draft(
  uuid,uuid,uuid,bigint,bigint,boolean
) OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_probe_event_id(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_event_scope_read_only(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_event_scope_allows(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_audience_allows(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_guard_private_draft_insert()
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_guard_private_draft_delete()
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_private_draft_publication_lifecycle(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_share_private_draft(
  uuid,uuid,uuid,bigint,bigint
) OWNER TO postgres;
ALTER FUNCTION public.expense_unshare_private_draft(
  uuid,uuid,uuid,bigint,bigint
) OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_normalize_private_draft(
  uuid,uuid,boolean
) OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_percentage_basis_points(text)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_weight(text) OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_snapshot_is_valid(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql159_private_event_summary(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_list_visible_shared_drafts(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_shared_draft_detail(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_list_group_shared_drafts(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.expense_sql159_amount_minor(text,text,boolean),
  public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean),
  public.expense_sql159_probe_event_id(uuid,uuid),
  public.expense_sql159_event_scope_read_only(uuid,uuid),
  public.expense_sql159_event_scope_allows(uuid,uuid),
  public.expense_sql159_audience_allows(uuid,uuid),
  public.expense_sql159_guard_private_draft_insert(),
  public.expense_sql159_guard_private_draft_delete(),
  public.expense_get_private_draft_publication_lifecycle(uuid,uuid),
  public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_sql159_normalize_private_draft(uuid,uuid,boolean),
  public.expense_sql159_percentage_basis_points(text),
  public.expense_sql159_weight(text),
  public.expense_sql159_allocate_weighted(bigint,jsonb,bigint),
  public.expense_sql159_snapshot_is_valid(uuid),
  public.expense_sql159_private_event_summary(uuid,uuid,uuid),
  public.expense_list_visible_shared_drafts(uuid),
  public.expense_get_shared_draft_detail(uuid,uuid),
  public.expense_list_group_shared_drafts(uuid,uuid),
  public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean),
  public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint),
  public.expense_get_private_draft_publication_lifecycle(uuid,uuid),
  public.expense_list_visible_shared_drafts(uuid),
  public.expense_get_shared_draft_detail(uuid,uuid),
  public.expense_list_group_shared_drafts(uuid,uuid),
  public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)
TO service_role;

COMMENT ON FUNCTION public.expense_share_private_draft(
  uuid,uuid,uuid,bigint,bigint
) IS 'Publishes or replaces one strict sanitized non-financial draft snapshot.';
COMMENT ON FUNCTION public.expense_unshare_private_draft(
  uuid,uuid,uuid,bigint,bigint
) IS 'Withdraws one exact shared-draft generation without touching the ledger.';
COMMENT ON FUNCTION public.expense_finalize_private_draft(
  uuid,uuid,uuid,bigint,bigint,boolean
) IS 'Atomically turns an exact human-confirmed private draft into one canonical active Expense.';
COMMENT ON FUNCTION public.expense_get_private_draft_publication_lifecycle(
  uuid,uuid
) IS 'Returns only the exact actor-private share CAS state needed after reload.';
COMMENT ON FUNCTION public.expense_list_visible_shared_drafts(uuid) IS
  'Bounded actor-visible shared-draft dashboard source; never returns raw draft payload.';
COMMENT ON FUNCTION public.expense_get_shared_draft_detail(uuid,uuid) IS
  'Exact-audience read-only proposal detail with indistinguishable not-found behavior.';
COMMENT ON FUNCTION public.expense_list_group_shared_drafts(uuid,uuid) IS
  'Bounded group proposal source isolated from canonical financial rows.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_pre_active_v1(uuid,uuid) IS
  'Visibility-first Event proposal summaries with object-authorized detail targets.';

-- Private rollout evidence. Row content is reduced to counts and one-way
-- digests; no title, label, email, payload or function source is retained.
WITH predecessor_expected(signature, is_writer) AS (VALUES
  ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)', true),
  ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.expense_has_beta_access(uuid)', false),
  ('public.expense_assert_beta_actor(uuid)', false),
  ('public.expense_active_member_role(uuid,uuid)', false),
  ('public.expense_begin_request(uuid,uuid,text,text)', false),
  ('public.expense_finish_request(uuid,uuid,jsonb)', false),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', false),
  ('public.expense_identity_request_id(text,uuid)', false),
  ('public.teskeid_event_assert_session_actor(uuid)', false),
  ('public.teskeid_event_assert_actor(uuid)', false),
  ('public.teskeid_event_assert_financial_actor(uuid)', false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', false),
  ('public.teskeid_event_private_scope_v3(uuid,uuid)', false),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', false),
  ('public.teskeid_event_uuid_from_text(text)', false),
  ('public.normalize_email_canonical(text)', false),
  ('public.teskeid_event_normalize_text(text)', false),
  ('public.teskeid_event_valid_text(text,integer,integer)', false),
  ('public.teskeid_event_private_normalize_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_canonical_email_v2(text)', false),
  ('public.teskeid_event_private_safe_profile_name_v2(uuid)', false),
  ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)', false),
  ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', false),
  ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)', false)
), predecessor_facts AS MATERIALIZED (
  SELECT expected.signature, expected.is_writer,
    pg_catalog.pg_get_userbyid(function_row.proowner) AS owner_name,
    pg_catalog.md5(pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n')) AS source_hash,
    COALESCE(function_row.proconfig, ARRAY[]::text[])::text[] AS proconfig,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee.rolname END
        ORDER BY (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee.rolname END) COLLATE pg_catalog."C"
      )
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
    ), '[]'::jsonb) AS execute_grantees
  FROM predecessor_expected AS expected
  JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
), predecessor_json AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'signature', facts.signature,
      'owner', facts.owner_name,
      'source_hash', facts.source_hash,
      'proconfig', pg_catalog.to_jsonb(facts.proconfig),
      'execute_grantees', facts.execute_grantees
    ) ORDER BY facts.signature COLLATE pg_catalog."C"
  ), '[]'::jsonb) AS value
  FROM predecessor_facts AS facts
), writer_digest AS (
  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    facts.signature || '|' || facts.owner_name || '|' || facts.source_hash
      || '|' || facts.proconfig::text || '|' || facts.execute_grantees::text,
    E'\n' ORDER BY facts.signature COLLATE pg_catalog."C"
  ), '')) AS value
  FROM predecessor_facts AS facts
  WHERE facts.is_writer
), protected_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_groups', pg_catalog.md5(pg_catalog.to_jsonb(group_row)::text)
  FROM public.expense_groups AS group_row
  UNION ALL
  SELECT 'expense_group_members', pg_catalog.md5(pg_catalog.to_jsonb(member)::text)
  FROM public.expense_group_members AS member
  UNION ALL
  SELECT 'expenses', pg_catalog.md5(pg_catalog.to_jsonb(expense)::text)
  FROM public.expenses AS expense
  UNION ALL
  SELECT 'expense_payments', pg_catalog.md5(pg_catalog.to_jsonb(payment)::text)
  FROM public.expense_payments AS payment
  UNION ALL
  SELECT 'expense_shares', pg_catalog.md5(pg_catalog.to_jsonb(share_row)::text)
  FROM public.expense_shares AS share_row
  UNION ALL
  SELECT 'expense_obligations', pg_catalog.md5(pg_catalog.to_jsonb(obligation)::text)
  FROM public.expense_obligations AS obligation
  UNION ALL
  SELECT 'teskeid_event_expense_links', pg_catalog.md5(pg_catalog.to_jsonb(link)::text)
  FROM public.teskeid_event_expense_links AS link
), protected_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      protected.kind || ':' || protected.row_hash, E'\n'
      ORDER BY protected.kind COLLATE pg_catalog."C",
        protected.row_hash COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM protected_rows AS protected
), request_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(request_row)::text)
  FROM public.expense_mutation_requests AS request_row
  UNION ALL
  SELECT 'teskeid_event_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(event_request_row)::text)
  FROM public.teskeid_event_mutation_requests AS event_request_row
), request_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      request_rows.kind || ':' || request_rows.row_hash, E'\n'
      ORDER BY request_rows.kind COLLATE pg_catalog."C",
        request_rows.row_hash COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM request_rows
), draft_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(draft)::text), E'\n'
      ORDER BY pg_catalog.md5(pg_catalog.to_jsonb(draft)::text)
        COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM public.expense_private_drafts AS draft
), new_relations AS (
  SELECT (
    NOT EXISTS (SELECT 1 FROM public.expense_unconfirmed_publications)
    AND NOT EXISTS (SELECT 1 FROM public.expense_unconfirmed_publication_parties)
    AND NOT EXISTS (SELECT 1 FROM public.expense_unconfirmed_publication_audience)
    AND NOT EXISTS (SELECT 1 FROM public.expense_unconfirmed_finalizations)
    AND NOT EXISTS (SELECT 1 FROM public.expense_private_draft_tombstones)
  ) AS began_empty
)
INSERT INTO public.expense_sql159_install_baseline (
  singleton, predecessor_contract, writer_set_digest,
  protected_count, protected_digest, request_count, request_digest,
  draft_count, draft_digest, new_relations_began_empty
)
SELECT true, predecessor_json.value, writer_digest.value,
  protected_evidence.row_count, protected_evidence.row_digest,
  request_evidence.row_count, request_evidence.row_digest,
  draft_evidence.row_count, draft_evidence.row_digest,
  new_relations.began_empty
FROM predecessor_json
CROSS JOIN writer_digest
CROSS JOIN protected_evidence
CROSS JOIN request_evidence
CROSS JOIN draft_evidence
CROSS JOIN new_relations;

DO $postconditions$
DECLARE
  v_baseline public.expense_sql159_install_baseline%ROWTYPE;
BEGIN
  SELECT baseline.* INTO v_baseline
  FROM public.expense_sql159_install_baseline AS baseline
  WHERE baseline.singleton;
  IF v_baseline.singleton IS NULL
     OR pg_catalog.jsonb_array_length(v_baseline.predecessor_contract) <> 32
     OR v_baseline.writer_set_digest !~ '^[0-9a-f]{32}$'
     OR v_baseline.protected_digest !~ '^[0-9a-f]{32}$'
     OR v_baseline.request_digest !~ '^[0-9a-f]{32}$'
     OR v_baseline.draft_digest !~ '^[0-9a-f]{32}$'
     OR NOT v_baseline.new_relations_began_empty THEN
    RAISE EXCEPTION 'expense_sql159_baseline_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('expense_unconfirmed_publications'),
      ('expense_unconfirmed_publication_parties'),
      ('expense_unconfirmed_publication_audience'),
      ('expense_unconfirmed_finalizations'),
      ('expense_private_draft_tombstones'),
      ('expense_sql159_install_baseline')
    ) AS expected(relation_name)
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass(
        'public.' || expected.relation_name
      )
    WHERE relation.oid IS NULL
       OR relation.relkind <> 'r'
       OR NOT relation.relrowsecurity
       OR NOT relation.relforcerowsecurity
       OR pg_catalog.pg_get_userbyid(relation.relowner) <> 'postgres'
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_policy AS policy
         WHERE policy.polrelid = relation.oid
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           relation.relacl,
           pg_catalog.acldefault('r', relation.relowner)
         )) AS privilege
         WHERE privilege.grantee <> relation.relowner
            OR privilege.grantor <> relation.relowner
            OR privilege.is_grantable
            OR privilege.privilege_type NOT IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE',
              'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
            )
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           relation.relacl,
           pg_catalog.acldefault('r', relation.relowner)
         )) AS privilege
         WHERE privilege.grantee = relation.relowner
           AND privilege.grantor = relation.relowner
           AND NOT privilege.is_grantable
           AND privilege.privilege_type IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE',
             'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
       ) <> 7 + CASE
         WHEN pg_catalog.current_setting('server_version_num')::integer
           >= 170000 THEN 1 ELSE 0 END
  ) THEN
    RAISE EXCEPTION 'expense_sql159_relation_contract_invalid';
  END IF;

  IF EXISTS (
    WITH expected(signature, language_name, volatility, security_definer,
      return_type, service_entry) AS (VALUES
      ('public.expense_sql159_amount_minor(text,text,boolean)', 'plpgsql', 'i', false, 'bigint', false),
      ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.expense_sql159_probe_event_id(uuid,uuid)', 'plpgsql', 's', true, 'uuid', false),
      ('public.expense_sql159_event_scope_read_only(uuid,uuid)', 'plpgsql', 's', true, 'jsonb', false),
      ('public.expense_sql159_event_scope_allows(uuid,uuid)', 'plpgsql', 's', true, 'boolean', false),
      ('public.expense_sql159_audience_allows(uuid,uuid)', 'sql', 's', true, 'boolean', false),
      ('public.expense_sql159_guard_private_draft_insert()', 'plpgsql', 'v', true, 'trigger', false),
      ('public.expense_sql159_guard_private_draft_delete()', 'plpgsql', 'v', true, 'trigger', false),
      ('public.expense_get_private_draft_publication_lifecycle(uuid,uuid)', 'plpgsql', 's', true, 'jsonb', true),
      ('public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'plpgsql', 'v', true, 'jsonb', false),
      ('public.expense_sql159_percentage_basis_points(text)', 'plpgsql', 'i', false, 'bigint', false),
      ('public.expense_sql159_weight(text)', 'plpgsql', 'i', false, 'bigint', false),
      ('public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)', 'plpgsql', 'i', false, 'jsonb', false),
      ('public.expense_sql159_snapshot_is_valid(uuid)', 'sql', 's', true, 'boolean', false),
      ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)', 'plpgsql', 's', true, 'jsonb', false),
      ('public.expense_list_visible_shared_drafts(uuid)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.expense_get_shared_draft_detail(uuid,uuid)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.expense_list_group_shared_drafts(uuid,uuid)', 'plpgsql', 'v', true, 'jsonb', true),
      ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', 'plpgsql', 'v', true, 'jsonb', true)
    ), checked AS (
      SELECT expected.*, function_row.oid, function_row.proowner,
        function_row.prosecdef, function_row.provolatile,
        function_row.proconfig,
        pg_catalog.format_type(function_row.prorettype, NULL) AS actual_return,
        language_row.lanname
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = function_row.prolang
    )
    SELECT 1 FROM checked
    WHERE checked.oid IS NULL
       OR pg_catalog.pg_get_userbyid(checked.proowner) <> 'postgres'
       OR checked.prosecdef IS DISTINCT FROM checked.security_definer
       OR checked.provolatile <> checked.volatility
       OR checked.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR checked.actual_return <> checked.return_type
       OR checked.lanname <> checked.language_name
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           (SELECT target.proacl FROM pg_catalog.pg_proc AS target
            WHERE target.oid = checked.oid),
           pg_catalog.acldefault('f', checked.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE privilege.privilege_type = 'EXECUTE'
           AND privilege.grantor = checked.proowner
           AND NOT privilege.is_grantable
           AND (
             privilege.grantee = checked.proowner
             OR (checked.service_entry AND grantee.rolname = 'service_role')
           )
       ) <> CASE WHEN checked.service_entry THEN 2 ELSE 1 END
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           (SELECT target.proacl FROM pg_catalog.pg_proc AS target
            WHERE target.oid = checked.oid),
           pg_catalog.acldefault('f', checked.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE privilege.privilege_type <> 'EXECUTE'
            OR privilege.grantor <> checked.proowner
            OR privilege.is_grantable
            OR privilege.grantee = 0
            OR (
              privilege.grantee <> checked.proowner
              AND (
                NOT checked.service_entry
                OR grantee.rolname IS DISTINCT FROM 'service_role'
              )
            )
       )
  ) THEN
    RAISE EXCEPTION 'expense_sql159_function_contract_invalid';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.pronamespace = pg_catalog.to_regnamespace('public')
      AND (
        function_row.proname LIKE 'expense_sql159_%'
        OR function_row.proname IN (
          'expense_finalize_private_draft',
          'expense_share_private_draft',
          'expense_unshare_private_draft',
          'expense_get_private_draft_publication_lifecycle',
          'expense_list_visible_shared_drafts',
          'expense_get_shared_draft_detail',
          'expense_list_group_shared_drafts',
          'teskeid_event_get_expense_pre_active_v1'
        )
      )
  ) <> 21 THEN
    RAISE EXCEPTION 'expense_sql159_function_collision';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      (
        'expense_sql159_finalized_draft_insert_guard',
        7::smallint,
        'public.expense_sql159_guard_private_draft_insert()'
      ),
      (
        'expense_sql159_private_draft_delete_guard',
        11::smallint,
        'public.expense_sql159_guard_private_draft_delete()'
      )
    ) AS expected(trigger_name, trigger_type, function_signature)
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = pg_catalog.to_regclass(
        'public.expense_private_drafts'
      )
     AND trigger_row.tgname = expected.trigger_name
     AND trigger_row.tgtype = expected.trigger_type
     AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
       expected.function_signature
     )
     AND NOT trigger_row.tgisinternal
     AND trigger_row.tgenabled = 'O'
  ) <> 2 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS actual_trigger
    WHERE actual_trigger.tgname IN (
      'expense_sql159_finalized_draft_insert_guard',
      'expense_sql159_private_draft_delete_guard'
    )
  ) <> 2 OR EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_publications
  ) OR EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_publication_parties
  ) OR EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_publication_audience
  ) OR EXISTS (
    SELECT 1 FROM public.expense_unconfirmed_finalizations
  ) THEN
    RAISE EXCEPTION 'expense_sql159_install_state_invalid';
  END IF;
END;
$postconditions$;

COMMIT;
