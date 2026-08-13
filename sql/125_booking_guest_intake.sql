-- TODO #097 / SQL125: Bookings MVP provider services, guest capability access,
-- account claim, scoped messaging and immutable activity.
-- Additive and forward-only. DO NOT RUN automatically. Stebbi applies SQL
-- manually only after the dedicated read-only preflight is fully green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

DO $booking_preconditions$
DECLARE
  v_collision text;
  v_feature_expression text;
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.spaces') IS NULL
     OR pg_catalog.to_regclass('public.space_members') IS NULL
     OR pg_catalog.to_regclass('public.business_profiles') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.check_and_increment_ip_rate_limit(text,date,integer)'
     ) IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'booking_missing_dependency';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.check_and_increment_ip_rate_limit(text,date,integer)'
    )
      AND procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.bool')
  ) THEN
    RAISE EXCEPTION 'booking_rate_limit_contract_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.business_profiles')
      AND constraint_row.conname = 'business_profiles_space_id_id_key'
      AND constraint_row.contype = 'u'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[
        (SELECT attribute.attnum
         FROM pg_catalog.pg_attribute AS attribute
         WHERE attribute.attrelid = constraint_row.conrelid
           AND attribute.attname = 'space_id'
           AND NOT attribute.attisdropped),
        (SELECT attribute.attnum
         FROM pg_catalog.pg_attribute AS attribute
         WHERE attribute.attrelid = constraint_row.conrelid
           AND attribute.attname = 'id'
           AND NOT attribute.attisdropped)
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'booking_business_profile_composite_key_missing';
  END IF;

  SELECT pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
    INTO v_feature_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;

  IF v_feature_expression IS NULL
     OR pg_catalog.strpos(
       v_feature_expression,
       pg_catalog.quote_literal('auglysandi')
     ) = 0 THEN
    RAISE EXCEPTION 'booking_feature_constraint_prerequisite_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'postgres'
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'booking_postgres_owner_unavailable';
  END IF;

  -- Every SECURITY DEFINER function below is transferred to postgres. Fail
  -- closed unless the migration actor is postgres or a superuser who can make
  -- that exact owner change; BYPASSRLS alone is not sufficient ownership.
  IF current_user <> 'postgres'
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user
         AND role.rolsuper
     ) THEN
    RAISE EXCEPTION 'booking_migration_owner_must_be_postgres_or_superuser:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'booking_service_role_unavailable';
  END IF;

  SELECT collision.name
    INTO v_collision
  FROM (
    SELECT target.name
    FROM (VALUES
      ('booking_services'),
      ('booking_services_pkey'),
      ('booking_services_space_profile_id_key'),
      ('booking_services_one_active_profile_idx'),
      ('booking_services_last_idempotency_key_idx'),
      ('booking_services_public_idx'),
      ('booking_requests'),
      ('booking_requests_pkey'),
      ('booking_requests_public_id_key'),
      ('booking_requests_create_request_id_key'),
      ('booking_requests_provider_created_idx'),
      ('booking_access_members'),
      ('booking_access_members_pkey'),
      ('booking_access_members_request_email_key'),
      ('booking_access_members_active_idx'),
      ('booking_capability_sessions'),
      ('booking_capability_sessions_pkey'),
      ('booking_capability_sessions_token_hash_key'),
      ('booking_capability_sessions_request_idx'),
      ('booking_messages'),
      ('booking_messages_pkey'),
      ('booking_messages_client_message_key'),
      ('booking_messages_idempotency_key'),
      ('booking_messages_request_time_idx'),
      ('booking_events'),
      ('booking_events_pkey'),
      ('booking_events_idempotency_key'),
      ('booking_events_request_time_idx')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL

    UNION ALL

    SELECT procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname LIKE 'booking_%'

    UNION ALL

    SELECT relation.relname || '.' || trigger_row.tgname
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'booking_events_immutable_guard'
  ) AS collision
  ORDER BY collision.name
  LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'booking_collision:%', v_collision;
  END IF;
END;
$booking_preconditions$;

DO $booking_feature_key$
DECLARE
  v_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
    INTO v_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c';

  IF v_expression IS NULL THEN
    RAISE EXCEPTION 'booking_feature_constraint_missing';
  END IF;

  IF pg_catalog.strpos(v_expression, pg_catalog.quote_literal('bokanir')) = 0 THEN
    ALTER TABLE public.feature_access
      DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
      v_expression,
      'bokanir'
    );
  END IF;
END;
$booking_feature_key$;

CREATE FUNCTION public.booking_canonical_email(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_at integer;
  v_local text;
  v_domain text;
BEGIN
  IF v_email = ''
     OR pg_catalog.char_length(v_email) > 254
     OR v_email ~ '[[:space:][:cntrl:]]' THEN
    RETURN NULL;
  END IF;

  v_at := pg_catalog.strpos(v_email, '@');
  IF v_at <= 1
     OR v_at <> pg_catalog.length(v_email) - pg_catalog.strpos(pg_catalog.reverse(v_email), '@') + 1 THEN
    RETURN NULL;
  END IF;

  v_local := pg_catalog.substr(v_email, 1, v_at - 1);
  v_domain := pg_catalog.substr(v_email, v_at + 1);
  IF v_local = '' OR v_domain = '' OR pg_catalog.strpos(v_domain, '.') = 0 THEN
    RETURN NULL;
  END IF;

  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := pg_catalog.replace(v_local, '.', '');
    v_domain := 'gmail.com';
    IF v_local = '' THEN RETURN NULL; END IF;
  END IF;

  RETURN v_local || '@' || v_domain;
END;
$$;

CREATE TABLE public.booking_services (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  summary text,
  timezone text NOT NULL,
  signed_in_discount_bps integer,
  status text NOT NULL DEFAULT 'draft',
  last_idempotency_key uuid,
  last_idempotency_actor_id uuid,
  last_idempotency_expected_revision integer,
  last_idempotency_fingerprint text,
  created_by uuid,
  updated_by uuid,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_services_pkey PRIMARY KEY (id),
  CONSTRAINT booking_services_revision_check CHECK (revision > 0),
  CONSTRAINT booking_services_title_check CHECK (
    title = pg_catalog.btrim(title)
    AND pg_catalog.char_length(title) BETWEEN 1 AND 120
  ),
  CONSTRAINT booking_services_summary_check CHECK (
    summary IS NULL OR (
      summary = pg_catalog.btrim(summary)
      AND pg_catalog.char_length(summary) BETWEEN 1 AND 500
    )
  ),
  CONSTRAINT booking_services_timezone_check CHECK (
    timezone = pg_catalog.btrim(timezone)
    AND pg_catalog.char_length(timezone) BETWEEN 1 AND 64
    AND timezone !~ '[[:space:][:cntrl:]]'
  ),
  CONSTRAINT booking_services_discount_check CHECK (
    signed_in_discount_bps IS NULL
    OR signed_in_discount_bps BETWEEN 1 AND 10000
  ),
  CONSTRAINT booking_services_status_check CHECK (
    status IN ('draft', 'published', 'paused')
  ),
  CONSTRAINT booking_services_archive_check CHECK (
    archived_at IS NULL OR status = 'paused'
  ),
  CONSTRAINT booking_services_idempotency_check CHECK (
    (
      last_idempotency_key IS NULL
      AND last_idempotency_actor_id IS NULL
      AND last_idempotency_expected_revision IS NULL
      AND last_idempotency_fingerprint IS NULL
    )
    OR (
      last_idempotency_key IS NOT NULL
      AND last_idempotency_expected_revision IS NOT NULL
      AND last_idempotency_expected_revision > 0
      AND last_idempotency_fingerprint ~ '^[0-9a-f]{32}$'
    )
  ),
  CONSTRAINT booking_services_profile_fk
    FOREIGN KEY (space_id, business_profile_id)
    REFERENCES public.business_profiles(space_id, id) ON DELETE CASCADE,
  CONSTRAINT booking_services_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_services_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_services_last_idempotency_actor_fk
    FOREIGN KEY (last_idempotency_actor_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_services_space_profile_id_key
    UNIQUE (space_id, business_profile_id, id)
);

CREATE UNIQUE INDEX booking_services_one_active_profile_idx
  ON public.booking_services (space_id, business_profile_id)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX booking_services_last_idempotency_key_idx
  ON public.booking_services (last_idempotency_key)
  WHERE last_idempotency_key IS NOT NULL;

CREATE INDEX booking_services_public_idx
  ON public.booking_services (business_profile_id, updated_at DESC)
  WHERE status = 'published' AND archived_at IS NULL;

CREATE TABLE public.booking_requests (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  public_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid,
  business_profile_id uuid,
  service_id uuid,
  service_id_snapshot uuid NOT NULL,
  business_profile_slug_snapshot text NOT NULL,
  provider_name_snapshot text NOT NULL,
  provider_website_url_snapshot text,
  service_title_snapshot text NOT NULL,
  service_summary_snapshot text,
  provider_timezone text NOT NULL,
  eligible_discount_bps integer,
  applied_discount_bps integer,
  discount_applied_at timestamp with time zone,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  contact_message text NOT NULL,
  requested_local_date date NOT NULL,
  requested_local_time time without time zone NOT NULL,
  requested_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  revision integer NOT NULL DEFAULT 1,
  creator_user_id uuid,
  access_mode text NOT NULL,
  access_version integer NOT NULL DEFAULT 1,
  guest_capability_hash text,
  create_request_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  cancelled_at timestamp with time zone,
  cancelled_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_requests_pkey PRIMARY KEY (id),
  CONSTRAINT booking_requests_public_id_key UNIQUE (public_id),
  CONSTRAINT booking_requests_create_request_id_key UNIQUE (create_request_id),
  CONSTRAINT booking_requests_provider_triplet_check CHECK (
    (space_id IS NULL AND business_profile_id IS NULL AND service_id IS NULL)
    OR (space_id IS NOT NULL AND business_profile_id IS NOT NULL AND service_id IS NOT NULL)
  ),
  CONSTRAINT booking_requests_profile_slug_snapshot_check CHECK (
    business_profile_slug_snapshot ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND pg_catalog.char_length(business_profile_slug_snapshot) BETWEEN 2 AND 80
  ),
  CONSTRAINT booking_requests_provider_name_snapshot_check CHECK (
    provider_name_snapshot = pg_catalog.btrim(provider_name_snapshot)
    AND pg_catalog.char_length(provider_name_snapshot) BETWEEN 1 AND 120
  ),
  CONSTRAINT booking_requests_provider_url_snapshot_check CHECK (
    provider_website_url_snapshot IS NULL
    OR pg_catalog.char_length(provider_website_url_snapshot) <= 2048
  ),
  CONSTRAINT booking_requests_service_title_snapshot_check CHECK (
    service_title_snapshot = pg_catalog.btrim(service_title_snapshot)
    AND pg_catalog.char_length(service_title_snapshot) BETWEEN 1 AND 120
  ),
  CONSTRAINT booking_requests_service_summary_snapshot_check CHECK (
    service_summary_snapshot IS NULL
    OR pg_catalog.char_length(service_summary_snapshot) BETWEEN 1 AND 500
  ),
  CONSTRAINT booking_requests_timezone_check CHECK (
    provider_timezone = pg_catalog.btrim(provider_timezone)
    AND pg_catalog.char_length(provider_timezone) BETWEEN 1 AND 64
  ),
  CONSTRAINT booking_requests_discount_check CHECK (
    (eligible_discount_bps IS NULL OR eligible_discount_bps BETWEEN 1 AND 10000)
    AND (applied_discount_bps IS NULL OR applied_discount_bps BETWEEN 1 AND 10000)
    AND (
      (applied_discount_bps IS NULL AND discount_applied_at IS NULL)
      OR (
        applied_discount_bps IS NOT NULL
        AND applied_discount_bps = eligible_discount_bps
        AND discount_applied_at IS NOT NULL
      )
    )
  ),
  CONSTRAINT booking_requests_contact_name_check CHECK (
    contact_name = pg_catalog.btrim(contact_name)
    AND pg_catalog.char_length(contact_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT booking_requests_contact_email_check CHECK (
    contact_email = pg_catalog.lower(pg_catalog.btrim(contact_email))
    AND pg_catalog.char_length(contact_email) BETWEEN 3 AND 254
    AND contact_email !~ '[[:space:][:cntrl:]]'
    AND pg_catalog.strpos(contact_email, '@') > 1
  ),
  CONSTRAINT booking_requests_contact_phone_check CHECK (
    contact_phone IS NULL OR (
      contact_phone = pg_catalog.btrim(contact_phone)
      AND pg_catalog.char_length(contact_phone) BETWEEN 1 AND 40
      AND contact_phone !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT booking_requests_contact_message_check CHECK (
    contact_message = pg_catalog.btrim(contact_message)
    AND pg_catalog.char_length(contact_message) BETWEEN 1 AND 1000
  ),
  CONSTRAINT booking_requests_status_check CHECK (
    status IN ('requested', 'cancelled')
  ),
  CONSTRAINT booking_requests_revision_check CHECK (revision > 0),
  CONSTRAINT booking_requests_access_mode_check CHECK (
    access_mode IN ('link', 'members') AND access_version > 0
  ),
  CONSTRAINT booking_requests_capability_state_check CHECK (
    (
      access_mode = 'link'
      AND creator_user_id IS NULL
      AND guest_capability_hash ~ '^[0-9a-f]{64}$'
      AND applied_discount_bps IS NULL
    )
    OR (
      access_mode = 'members'
      AND guest_capability_hash IS NULL
    )
  ),
  CONSTRAINT booking_requests_fingerprint_check CHECK (
    request_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT booking_requests_cancellation_check CHECK (
    (status = 'requested' AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT booking_requests_requested_time_check CHECK (
    requested_at = (
      requested_local_date + requested_local_time
    ) AT TIME ZONE provider_timezone
  ),
  CONSTRAINT booking_requests_service_fk
    FOREIGN KEY (space_id, business_profile_id, service_id)
    REFERENCES public.booking_services(space_id, business_profile_id, id)
    MATCH FULL ON DELETE SET NULL,
  CONSTRAINT booking_requests_creator_fk
    FOREIGN KEY (creator_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_requests_cancelled_by_fk
    FOREIGN KEY (cancelled_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX booking_requests_provider_created_idx
  ON public.booking_requests (space_id, created_at DESC, id DESC)
  WHERE space_id IS NOT NULL;

CREATE TABLE public.booking_access_members (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  booking_request_id uuid NOT NULL,
  canonical_email text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  user_id uuid,
  added_by_user_id uuid,
  revoked_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  revoked_at timestamp with time zone,
  CONSTRAINT booking_access_members_pkey PRIMARY KEY (id),
  CONSTRAINT booking_access_members_request_email_key
    UNIQUE (booking_request_id, canonical_email),
  CONSTRAINT booking_access_members_email_check CHECK (
    public.booking_canonical_email(canonical_email) IS NOT NULL
    AND public.booking_canonical_email(canonical_email) = canonical_email
  ),
  CONSTRAINT booking_access_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT booking_access_members_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT booking_access_members_revocation_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT booking_access_members_request_fk
    FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  CONSTRAINT booking_access_members_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_access_members_added_by_fk
    FOREIGN KEY (added_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_access_members_revoked_by_fk
    FOREIGN KEY (revoked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX booking_access_members_active_idx
  ON public.booking_access_members (booking_request_id, role, canonical_email)
  WHERE status = 'active';

CREATE TABLE public.booking_capability_sessions (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  booking_request_id uuid NOT NULL,
  access_version integer NOT NULL,
  session_token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_capability_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT booking_capability_sessions_token_hash_key UNIQUE (session_token_hash),
  CONSTRAINT booking_capability_sessions_access_version_check CHECK (access_version > 0),
  CONSTRAINT booking_capability_sessions_hash_check CHECK (
    session_token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT booking_capability_sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT booking_capability_sessions_revocation_check CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  ),
  CONSTRAINT booking_capability_sessions_request_fk
    FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE
);

CREATE INDEX booking_capability_sessions_request_idx
  ON public.booking_capability_sessions (booking_request_id, access_version, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE public.booking_messages (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  booking_request_id uuid NOT NULL,
  sender_side text NOT NULL,
  sender_kind text NOT NULL,
  sender_key text NOT NULL,
  actor_user_id uuid,
  capability_session_id uuid,
  author_name_snapshot text,
  body text NOT NULL,
  client_message_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_messages_pkey PRIMARY KEY (id),
  CONSTRAINT booking_messages_client_message_key
    UNIQUE (booking_request_id, client_message_id),
  CONSTRAINT booking_messages_idempotency_key
    UNIQUE (booking_request_id, idempotency_key),
  CONSTRAINT booking_messages_sender_side_check CHECK (
    sender_side IN ('customer', 'provider')
  ),
  CONSTRAINT booking_messages_sender_kind_check CHECK (
    sender_kind IN ('guest', 'member', 'provider')
    AND sender_side = CASE WHEN sender_kind = 'provider' THEN 'provider' ELSE 'customer' END
  ),
  CONSTRAINT booking_messages_sender_identity_check CHECK (
    (sender_kind = 'guest' AND actor_user_id IS NULL AND capability_session_id IS NOT NULL)
    OR (sender_kind IN ('member', 'provider') AND capability_session_id IS NULL)
  ),
  CONSTRAINT booking_messages_sender_key_check CHECK (
    sender_key = pg_catalog.btrim(sender_key)
    AND pg_catalog.char_length(sender_key) BETWEEN 3 AND 100
  ),
  CONSTRAINT booking_messages_author_name_check CHECK (
    author_name_snapshot IS NULL OR (
      author_name_snapshot = pg_catalog.btrim(author_name_snapshot)
      AND pg_catalog.char_length(author_name_snapshot) BETWEEN 1 AND 120
      AND author_name_snapshot !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT booking_messages_body_check CHECK (
    body = pg_catalog.btrim(body)
    AND pg_catalog.char_length(body) BETWEEN 1 AND 1000
  ),
  CONSTRAINT booking_messages_request_fk
    FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  CONSTRAINT booking_messages_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_messages_session_fk
    FOREIGN KEY (capability_session_id)
    REFERENCES public.booking_capability_sessions(id) ON DELETE RESTRICT
);

CREATE INDEX booking_messages_request_time_idx
  ON public.booking_messages (booking_request_id, created_at DESC, id DESC);

CREATE TABLE public.booking_events (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  booking_request_id uuid NOT NULL,
  request_revision integer NOT NULL,
  access_version integer NOT NULL,
  event_type text NOT NULL,
  actor_kind text NOT NULL,
  actor_user_id uuid,
  actor_session_id uuid,
  subject_member_id uuid,
  idempotency_key uuid NOT NULL,
  operation_fingerprint text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_events_pkey PRIMARY KEY (id),
  CONSTRAINT booking_events_idempotency_key UNIQUE (booking_request_id, idempotency_key),
  CONSTRAINT booking_events_versions_check CHECK (
    request_revision > 0 AND access_version > 0
  ),
  CONSTRAINT booking_events_type_check CHECK (
    event_type IN (
      'request_submitted',
      'booking_claimed',
      'member_added',
      'member_revoked',
      'request_cancelled',
      'discount_applied'
    )
  ),
  CONSTRAINT booking_events_actor_kind_check CHECK (
    actor_kind IN ('guest', 'member', 'provider', 'system')
  ),
  CONSTRAINT booking_events_actor_reference_check CHECK (
    (actor_kind = 'guest' AND actor_user_id IS NULL)
    OR (actor_kind IN ('member', 'provider') AND actor_session_id IS NULL)
    OR (actor_kind = 'system' AND actor_user_id IS NULL AND actor_session_id IS NULL)
  ),
  CONSTRAINT booking_events_data_check CHECK (
    pg_catalog.jsonb_typeof(event_data) = 'object'
    AND pg_catalog.octet_length(event_data::text) <= 1000
  ),
  CONSTRAINT booking_events_fingerprint_check CHECK (
    operation_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT booking_events_request_fk
    FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id) ON DELETE RESTRICT,
  CONSTRAINT booking_events_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_events_session_fk
    FOREIGN KEY (actor_session_id)
    REFERENCES public.booking_capability_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT booking_events_subject_member_fk
    FOREIGN KEY (subject_member_id)
    REFERENCES public.booking_access_members(id) ON DELETE RESTRICT
);

CREATE INDEX booking_events_request_time_idx
  ON public.booking_events (booking_request_id, created_at DESC, id DESC);

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_access_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_access_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_capability_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_capability_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.booking_services,
  public.booking_requests,
  public.booking_access_members,
  public.booking_capability_sessions,
  public.booking_messages,
  public.booking_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.booking_provider_allowed(p_actor_id uuid, p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_actor_id IS NOT NULL
    AND p_space_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.space_members AS membership
      WHERE membership.space_id = p_space_id
        AND membership.user_id = p_actor_id
        AND membership.role = 'owner'
    )
    AND EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      JOIN public.feature_access AS entitlement
        ON entitlement.feature_key = 'bokanir'
       AND entitlement.email = public.booking_canonical_email(auth_user.email)
      WHERE auth_user.id = p_actor_id
        AND auth_user.email_confirmed_at IS NOT NULL
    );
$$;

CREATE FUNCTION public.booking_assert_provider(p_actor_id uuid, p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.booking_provider_allowed(p_actor_id, p_space_id) THEN
    RAISE EXCEPTION 'booking_provider_not_allowed';
  END IF;
END;
$$;

CREATE FUNCTION public.booking_authorize_request(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text
)
RETURNS TABLE (
  request_id uuid,
  access_kind text,
  canonical_email text,
  actor_user_id uuid,
  capability_session_id uuid,
  member_id uuid,
  member_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_email text;
  v_member public.booking_access_members%ROWTYPE;
  v_session public.booking_capability_sessions%ROWTYPE;
BEGIN
  SELECT request_row.*
    INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF p_actor_user_id IS NOT NULL THEN
    SELECT public.booking_canonical_email(auth_user.email)
      INTO v_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_actor_user_id
      AND auth_user.email_confirmed_at IS NOT NULL;

    -- An actively entitled owner always acts as the provider for their own
    -- space, even if the same canonical email was also added as a customer
    -- member. This keeps provider reads and replies server-derived and avoids
    -- letting route choice downgrade an authoritative provider identity.
    IF v_request.space_id IS NOT NULL
       AND public.booking_provider_allowed(p_actor_user_id, v_request.space_id) THEN
      RETURN QUERY SELECT
        v_request.id, 'provider'::text, v_email, p_actor_user_id,
        NULL::uuid, NULL::uuid, NULL::text;
      RETURN;
    END IF;

    IF v_email IS NOT NULL AND v_request.access_mode = 'members' THEN
      SELECT member.*
        INTO v_member
      FROM public.booking_access_members AS member
      WHERE member.booking_request_id = v_request.id
        AND member.canonical_email = v_email
        AND member.status = 'active';

      IF FOUND THEN
        RETURN QUERY SELECT
          v_request.id, 'member'::text, v_email, p_actor_user_id,
          NULL::uuid, v_member.id, v_member.role;
        RETURN;
      END IF;
    END IF;
  END IF;

  IF v_request.access_mode = 'link'
     AND p_session_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT session_row.*
      INTO v_session
    FROM public.booking_capability_sessions AS session_row
    WHERE session_row.booking_request_id = v_request.id
      AND session_row.session_token_hash = p_session_hash
      AND session_row.access_version = v_request.access_version
      AND session_row.revoked_at IS NULL
      AND session_row.expires_at > pg_catalog.now();

    IF FOUND THEN
      RETURN QUERY SELECT
        v_request.id, 'guest'::text, NULL::text, NULL::uuid,
        v_session.id, NULL::uuid, NULL::text;
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'booking_not_found';
END;
$$;

CREATE FUNCTION public.booking_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
       OR OLD.actor_session_id IS DISTINCT FROM NEW.actor_session_id
     )
     AND (OLD.actor_user_id IS NOT DISTINCT FROM NEW.actor_user_id OR (
       OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
     ))
     AND (OLD.actor_session_id IS NOT DISTINCT FROM NEW.actor_session_id OR (
       OLD.actor_session_id IS NOT NULL AND NEW.actor_session_id IS NULL
     ))
     AND (pg_catalog.to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_session_id']) =
         (pg_catalog.to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_session_id']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'booking_event_immutable';
END;
$$;

CREATE TRIGGER booking_events_immutable_guard
BEFORE UPDATE OR DELETE ON public.booking_events
FOR EACH ROW EXECUTE FUNCTION public.booking_events_immutable();

CREATE FUNCTION public.booking_upsert_service(
  p_actor_id uuid,
  p_space_id uuid,
  p_business_profile_id uuid,
  p_service_id uuid,
  p_expected_revision integer,
  p_title text,
  p_summary text,
  p_timezone text,
  p_signed_in_discount_bps integer,
  p_status text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_summary text := NULLIF(pg_catalog.btrim(p_summary), '');
  v_fingerprint text;
  v_created boolean := false;
  v_replayed boolean := false;
BEGIN
  PERFORM public.booking_assert_provider(p_actor_id, p_space_id);

  IF p_business_profile_id IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120
     OR (v_summary IS NOT NULL AND pg_catalog.char_length(v_summary) > 500)
     OR p_timezone IS NULL
     OR p_timezone <> pg_catalog.btrim(p_timezone)
     OR pg_catalog.char_length(p_timezone) NOT BETWEEN 1 AND 64
     OR p_timezone ~ '[[:space:][:cntrl:]]'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names AS timezone_row
       WHERE timezone_row.name = p_timezone
     )
     OR (p_signed_in_discount_bps IS NOT NULL
       AND p_signed_in_discount_bps NOT BETWEEN 1 AND 10000)
     OR p_status IS NULL
     OR p_status NOT IN ('draft', 'published', 'paused')
     OR (p_service_id IS NULL AND p_expected_revision IS NOT NULL)
     OR (p_service_id IS NOT NULL
       AND (p_expected_revision IS NULL OR p_expected_revision <= 0)) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_profiles AS profile
    WHERE profile.id = p_business_profile_id
      AND profile.space_id = p_space_id
      AND profile.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'booking_provider_not_allowed';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'businessProfileId', p_business_profile_id,
    'title', pg_catalog.btrim(p_title),
    'summary', v_summary,
    'timezone', p_timezone,
    'signedInDiscountBps', p_signed_in_discount_bps,
    'status', p_status
  )::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_space_id::text || ':' || p_business_profile_id::text,
    12501
  ));

  IF p_service_id IS NULL THEN
    SELECT service.*
      INTO v_service
    FROM public.booking_services AS service
    WHERE service.space_id = p_space_id
      AND service.business_profile_id = p_business_profile_id
      AND service.archived_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      IF v_service.title IS DISTINCT FROM pg_catalog.btrim(p_title)
         OR v_service.summary IS DISTINCT FROM v_summary
         OR v_service.timezone IS DISTINCT FROM p_timezone
         OR v_service.signed_in_discount_bps IS DISTINCT FROM p_signed_in_discount_bps
         OR v_service.status IS DISTINCT FROM p_status THEN
        RAISE EXCEPTION 'booking_service_conflict';
      END IF;
      v_replayed := true;
    ELSE
      INSERT INTO public.booking_services (
        space_id,
        business_profile_id,
        title,
        summary,
        timezone,
        signed_in_discount_bps,
        status,
        created_by,
        updated_by
      ) VALUES (
        p_space_id,
        p_business_profile_id,
        pg_catalog.btrim(p_title),
        v_summary,
        p_timezone,
        p_signed_in_discount_bps,
        p_status,
        p_actor_id,
        p_actor_id
      )
      RETURNING * INTO v_service;
      v_created := true;
    END IF;
  ELSE
    SELECT service.*
      INTO v_service
    FROM public.booking_services AS service
    WHERE service.id = p_service_id
      AND service.space_id = p_space_id
      AND service.business_profile_id = p_business_profile_id
      AND service.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'booking_provider_not_allowed'; END IF;

    IF p_idempotency_key IS NOT NULL
       AND v_service.last_idempotency_key = p_idempotency_key THEN
      IF v_service.last_idempotency_actor_id IS DISTINCT FROM p_actor_id
         OR v_service.last_idempotency_expected_revision IS DISTINCT FROM p_expected_revision
         OR v_service.last_idempotency_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;
      v_replayed := true;
    ELSE
      IF p_idempotency_key IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.booking_services AS other_service
           WHERE other_service.last_idempotency_key = p_idempotency_key
             AND other_service.id <> v_service.id
         ) THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;

      IF v_service.revision <> p_expected_revision THEN
        RAISE EXCEPTION 'booking_revision_conflict';
      END IF;

      UPDATE public.booking_services AS service
      SET title = pg_catalog.btrim(p_title),
          summary = v_summary,
          timezone = p_timezone,
          signed_in_discount_bps = p_signed_in_discount_bps,
          status = p_status,
          revision = service.revision + 1,
          last_idempotency_key = p_idempotency_key,
          last_idempotency_actor_id = CASE
            WHEN p_idempotency_key IS NULL THEN NULL ELSE p_actor_id
          END,
          last_idempotency_expected_revision = CASE
            WHEN p_idempotency_key IS NULL THEN NULL ELSE p_expected_revision
          END,
          last_idempotency_fingerprint = CASE
            WHEN p_idempotency_key IS NULL THEN NULL ELSE v_fingerprint
          END,
          updated_by = p_actor_id,
          updated_at = pg_catalog.now()
      WHERE service.id = v_service.id
        AND service.revision = p_expected_revision
      RETURNING * INTO v_service;

      IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_service.id,
    'businessProfileId', v_service.business_profile_id,
    'revision', v_service.revision,
    'title', v_service.title,
    'summary', v_service.summary,
    'timezone', v_service.timezone,
    'signedInDiscountBps', v_service.signed_in_discount_bps,
    'status', v_service.status,
    'updatedAt', v_service.updated_at,
    'created', v_created,
    'replayed', v_replayed
  );
END;
$$;

CREATE FUNCTION public.booking_resolve_public(p_business_profile_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_business_profile_slug IS NULL
     OR p_business_profile_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR pg_catalog.char_length(p_business_profile_slug) NOT BETWEEN 2 AND 80 THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'serviceId', service.id,
    'businessProfileSlug', profile.slug,
    'businessProfile', pg_catalog.jsonb_build_object(
      'slug', profile.slug,
      'displayName', profile.display_name,
      'description', profile.description,
      'websiteUrl', profile.website_url
    ),
    'service', pg_catalog.jsonb_build_object(
      'id', service.id,
      'title', service.title,
      'summary', service.summary,
      'timezone', service.timezone,
      'signedInDiscountBps', service.signed_in_discount_bps
    )
  )
    INTO v_result
  FROM public.business_profiles AS profile
  JOIN public.booking_services AS service
    ON service.space_id = profile.space_id
   AND service.business_profile_id = profile.id
  WHERE profile.slug = p_business_profile_slug
    AND profile.archived_at IS NULL
    AND service.status = 'published'
    AND service.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.space_members AS membership
      WHERE membership.space_id = service.space_id
        AND membership.role = 'owner'
        AND public.booking_provider_allowed(membership.user_id, service.space_id)
    )
  LIMIT 1;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_create_request(
  p_service_id uuid,
  p_request_id uuid,
  p_creator_user_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_message text,
  p_requested_local_date date,
  p_requested_local_time time without time zone,
  p_requested_at timestamp with time zone,
  p_guest_capability_hash text,
  p_rate_limit_hash text,
  p_rate_limit_window_date date,
  p_rate_limit_max integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_profile public.business_profiles%ROWTYPE;
  v_request public.booking_requests%ROWTYPE;
  v_actor_email text;
  v_contact_name text := pg_catalog.btrim(p_contact_name);
  v_contact_email text := pg_catalog.lower(pg_catalog.btrim(p_contact_email));
  v_contact_phone text := NULLIF(pg_catalog.btrim(p_contact_phone), '');
  v_contact_message text := pg_catalog.btrim(p_contact_message);
  v_fingerprint text;
  v_access_mode text;
  v_eligible_discount_bps integer;
  v_applied_discount_bps integer;
  v_discount_applied_at timestamp with time zone;
  v_rate_allowed boolean;
  v_reykjavik_date date := (pg_catalog.now() AT TIME ZONE 'Atlantic/Reykjavik')::date;
BEGIN
  IF p_service_id IS NULL
     OR p_request_id IS NULL
     OR p_contact_name IS NULL
     OR p_contact_email IS NULL
     OR p_contact_message IS NULL
     OR pg_catalog.char_length(v_contact_name) NOT BETWEEN 1 AND 120
     OR pg_catalog.char_length(v_contact_email) NOT BETWEEN 3 AND 254
     OR v_contact_email ~ '[[:space:][:cntrl:]]'
     OR pg_catalog.strpos(v_contact_email, '@') <= 1
     OR (v_contact_phone IS NOT NULL
       AND (pg_catalog.char_length(v_contact_phone) > 40 OR v_contact_phone ~ '[[:cntrl:]]'))
     OR pg_catalog.char_length(v_contact_message) NOT BETWEEN 1 AND 1000
     OR p_requested_local_date IS NULL
     OR p_requested_local_time IS NULL
     OR p_requested_at IS NULL
     OR p_rate_limit_hash IS NULL
     OR p_rate_limit_hash !~ '^[0-9a-f]{64}$'
     OR p_rate_limit_window_date IS DISTINCT FROM v_reykjavik_date
     OR p_rate_limit_max IS NULL
     OR p_rate_limit_max NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  IF p_creator_user_id IS NULL THEN
    IF p_guest_capability_hash IS NULL
       OR p_guest_capability_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;
    v_access_mode := 'link';
  ELSE
    IF p_guest_capability_hash IS NOT NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    SELECT public.booking_canonical_email(auth_user.email)
      INTO v_actor_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_creator_user_id
      AND auth_user.email_confirmed_at IS NOT NULL
    FOR SHARE;
    IF v_actor_email IS NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    v_access_mode := 'members';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'serviceId', p_service_id,
    'creatorUserId', p_creator_user_id,
    'contactName', v_contact_name,
    'contactEmail', v_contact_email,
    'contactPhone', v_contact_phone,
    'contactMessage', v_contact_message,
    'requestedLocalDate', p_requested_local_date,
    'requestedLocalTime', p_requested_local_time,
    'guestCapabilityHash', p_guest_capability_hash
  )::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 12502)
  );

  SELECT request_row.*
    INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.create_request_id = p_request_id;

  IF FOUND THEN
    IF v_request.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id', v_request.id,
      'publicId', v_request.public_id,
      'businessProfileSlug', v_request.business_profile_slug_snapshot,
      'accessMode', v_request.access_mode,
      'accessVersion', v_request.access_version,
      'status', v_request.status,
      'revision', v_request.revision,
      'eligibleDiscountBps', v_request.eligible_discount_bps,
      'appliedDiscountBps', v_request.applied_discount_bps,
      'discountBps', v_request.applied_discount_bps,
      'created', false
    );
  END IF;

  SELECT service.*
    INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = p_service_id
    AND service.status = 'published'
    AND service.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_service_unavailable'; END IF;

  SELECT profile.*
    INTO v_profile
  FROM public.business_profiles AS profile
  WHERE profile.id = v_service.business_profile_id
    AND profile.space_id = v_service.space_id
    AND profile.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND
     OR NOT EXISTS (
       SELECT 1
       FROM public.space_members AS membership
       WHERE membership.space_id = v_service.space_id
         AND membership.role = 'owner'
         AND public.booking_provider_allowed(membership.user_id, v_service.space_id)
     ) THEN
    RAISE EXCEPTION 'booking_service_unavailable';
  END IF;

  -- Round-trip the server-derived instant back to the provider-local wall
  -- time. This rejects DST gaps while accepting either real instant during a
  -- fall-back overlap; PostgreSQL and Intl may choose different valid sides.
  IF (p_requested_at AT TIME ZONE v_service.timezone) IS DISTINCT FROM
        (p_requested_local_date + p_requested_local_time)
     OR p_requested_at <= pg_catalog.now()
     OR p_requested_at > pg_catalog.now() + interval '548 days' THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  BEGIN
    SELECT public.check_and_increment_ip_rate_limit(
      p_rate_limit_hash,
      p_rate_limit_window_date,
      p_rate_limit_max
    ) INTO v_rate_allowed;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'booking_rate_limited';
  END;
  IF v_rate_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'booking_rate_limited';
  END IF;

  v_eligible_discount_bps := v_service.signed_in_discount_bps;
  IF p_creator_user_id IS NOT NULL AND v_eligible_discount_bps IS NOT NULL THEN
    v_applied_discount_bps := v_eligible_discount_bps;
    v_discount_applied_at := pg_catalog.now();
  END IF;

  INSERT INTO public.booking_requests (
    space_id,
    business_profile_id,
    service_id,
    service_id_snapshot,
    business_profile_slug_snapshot,
    provider_name_snapshot,
    provider_website_url_snapshot,
    service_title_snapshot,
    service_summary_snapshot,
    provider_timezone,
    eligible_discount_bps,
    applied_discount_bps,
    discount_applied_at,
    contact_name,
    contact_email,
    contact_phone,
    contact_message,
    requested_local_date,
    requested_local_time,
    requested_at,
    creator_user_id,
    access_mode,
    guest_capability_hash,
    create_request_id,
    request_fingerprint
  ) VALUES (
    v_service.space_id,
    v_service.business_profile_id,
    v_service.id,
    v_service.id,
    v_profile.slug,
    v_profile.display_name,
    v_profile.website_url,
    v_service.title,
    v_service.summary,
    v_service.timezone,
    v_eligible_discount_bps,
    v_applied_discount_bps,
    v_discount_applied_at,
    v_contact_name,
    v_contact_email,
    v_contact_phone,
    v_contact_message,
    p_requested_local_date,
    p_requested_local_time,
    p_requested_at,
    p_creator_user_id,
    v_access_mode,
    p_guest_capability_hash,
    p_request_id,
    v_fingerprint
  )
  RETURNING * INTO v_request;

  IF p_creator_user_id IS NOT NULL THEN
    INSERT INTO public.booking_access_members (
      booking_request_id,
      canonical_email,
      role,
      status,
      user_id,
      added_by_user_id
    ) VALUES (
      v_request.id,
      v_actor_email,
      'owner',
      'active',
      p_creator_user_id,
      p_creator_user_id
    );
  END IF;

  INSERT INTO public.booking_events (
    booking_request_id,
    request_revision,
    access_version,
    event_type,
    actor_kind,
    actor_user_id,
    idempotency_key,
    operation_fingerprint,
    event_data
  ) VALUES (
    v_request.id,
    v_request.revision,
    v_request.access_version,
    'request_submitted',
    CASE WHEN p_creator_user_id IS NULL THEN 'guest' ELSE 'member' END,
    p_creator_user_id,
    p_request_id,
    v_fingerprint,
    '{}'::jsonb
  );

  IF v_applied_discount_bps IS NOT NULL THEN
    INSERT INTO public.booking_events (
      booking_request_id,
      request_revision,
      access_version,
      event_type,
      actor_kind,
      actor_user_id,
      idempotency_key,
      operation_fingerprint,
      event_data
    ) VALUES (
      v_request.id,
      v_request.revision,
      v_request.access_version,
      'discount_applied',
      'member',
      p_creator_user_id,
      pg_catalog.gen_random_uuid(),
      pg_catalog.md5(v_fingerprint || ':discount'),
      pg_catalog.jsonb_build_object('appliedDiscountBps', v_applied_discount_bps)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'publicId', v_request.public_id,
    'businessProfileSlug', v_request.business_profile_slug_snapshot,
    'accessMode', v_request.access_mode,
    'accessVersion', v_request.access_version,
    'status', v_request.status,
    'revision', v_request.revision,
    'eligibleDiscountBps', v_request.eligible_discount_bps,
    'appliedDiscountBps', v_request.applied_discount_bps,
    'discountBps', v_request.applied_discount_bps,
    'created', true
  );
END;
$$;

CREATE FUNCTION public.booking_resolve_create_replay(
  p_request_id uuid,
  p_business_profile_slug text,
  p_creator_user_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_message text,
  p_requested_local_date date,
  p_requested_local_time time without time zone,
  p_guest_capability_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_actor_email text;
  v_contact_name text := pg_catalog.btrim(p_contact_name);
  v_contact_email text := pg_catalog.lower(pg_catalog.btrim(p_contact_email));
  v_contact_phone text := NULLIF(pg_catalog.btrim(p_contact_phone), '');
  v_contact_message text := pg_catalog.btrim(p_contact_message);
  v_fingerprint text;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;

  -- Use the same lock key as create, and run this before resolving current
  -- public provider state. A lost successful response must remain recoverable
  -- after pause, rename, flag removal or provider deletion.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 12502)
  );

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.create_request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_business_profile_slug IS NULL
     OR p_business_profile_slug IS DISTINCT FROM v_request.business_profile_slug_snapshot
     OR p_contact_name IS NULL
     OR p_contact_email IS NULL
     OR p_contact_message IS NULL
     OR pg_catalog.char_length(v_contact_name) NOT BETWEEN 1 AND 120
     OR pg_catalog.char_length(v_contact_email) NOT BETWEEN 3 AND 254
     OR v_contact_email ~ '[[:space:][:cntrl:]]'
     OR pg_catalog.strpos(v_contact_email, '@') <= 1
     OR (v_contact_phone IS NOT NULL
       AND (pg_catalog.char_length(v_contact_phone) > 40 OR v_contact_phone ~ '[[:cntrl:]]'))
     OR pg_catalog.char_length(v_contact_message) NOT BETWEEN 1 AND 1000
     OR p_requested_local_date IS NULL
     OR p_requested_local_time IS NULL
     OR p_creator_user_id IS DISTINCT FROM v_request.creator_user_id
     OR (p_creator_user_id IS NULL AND (
       p_guest_capability_hash IS NULL
       OR p_guest_capability_hash !~ '^[0-9a-f]{64}$'
     ))
     OR (p_creator_user_id IS NOT NULL AND p_guest_capability_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'booking_idempotency_conflict';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'serviceId', v_request.service_id_snapshot,
    'creatorUserId', p_creator_user_id,
    'contactName', v_contact_name,
    'contactEmail', v_contact_email,
    'contactPhone', v_contact_phone,
    'contactMessage', v_contact_message,
    'requestedLocalDate', p_requested_local_date,
    'requestedLocalTime', p_requested_local_time,
    'guestCapabilityHash', p_guest_capability_hash
  )::text);

  IF v_request.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'booking_idempotency_conflict';
  END IF;

  IF p_creator_user_id IS NULL THEN
    IF v_request.access_mode <> 'link'
       OR v_request.guest_capability_hash IS DISTINCT FROM p_guest_capability_hash THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
  ELSE
    SELECT public.booking_canonical_email(auth_user.email)
      INTO v_actor_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_creator_user_id
      AND auth_user.email_confirmed_at IS NOT NULL
    FOR SHARE;

    IF v_actor_email IS NULL
       OR v_request.access_mode <> 'members'
       OR NOT EXISTS (
         SELECT 1
         FROM public.booking_access_members AS member
         WHERE member.booking_request_id = v_request.id
           AND member.canonical_email = v_actor_email
           AND member.status = 'active'
       ) THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'publicId', v_request.public_id,
    'businessProfileSlug', v_request.business_profile_slug_snapshot,
    'accessMode', v_request.access_mode,
    'accessVersion', v_request.access_version,
    'status', v_request.status,
    'revision', v_request.revision,
    'eligibleDiscountBps', v_request.eligible_discount_bps,
    'appliedDiscountBps', v_request.applied_discount_bps,
    'discountBps', v_request.applied_discount_bps,
    'created', false
  );
END;
$$;

CREATE FUNCTION public.booking_exchange_capability(
  p_public_id uuid,
  p_capability_hash text,
  p_session_hash text,
  p_session_expires_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_session public.booking_capability_sessions%ROWTYPE;
BEGIN
  IF p_public_id IS NULL
     OR p_capability_hash IS NULL
     OR p_capability_hash !~ '^[0-9a-f]{64}$'
     OR p_session_hash IS NULL
     OR p_session_hash !~ '^[0-9a-f]{64}$'
     OR p_session_expires_at IS NULL
     OR p_session_expires_at <= pg_catalog.now()
     OR p_session_expires_at > pg_catalog.now() + interval '30 days 5 minutes' THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  SELECT request_row.*
    INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.access_mode <> 'link'
     OR v_request.guest_capability_hash IS DISTINCT FROM p_capability_hash THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_session_hash, 12503)
  );

  SELECT session_row.*
    INTO v_session
  FROM public.booking_capability_sessions AS session_row
  WHERE session_row.session_token_hash = p_session_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_session.booking_request_id <> v_request.id
       OR v_session.access_version <> v_request.access_version
       OR v_session.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
    UPDATE public.booking_capability_sessions AS session_row
    SET expires_at = p_session_expires_at,
        last_seen_at = pg_catalog.now()
    WHERE session_row.id = v_session.id
    RETURNING * INTO v_session;
  ELSE
    -- Bound live bearer-to-cookie fan-out per booking. Retire expired/revoked
    -- sessions only when no immutable event/message still references them.
    -- Referenced audit rows remain, but only live current-version sessions
    -- count toward the cap, so history never exhausts future link access.
    DELETE FROM public.booking_capability_sessions AS stale_session
    WHERE stale_session.booking_request_id = v_request.id
      AND (
        stale_session.revoked_at IS NOT NULL
        OR stale_session.expires_at <= pg_catalog.now()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_messages AS message
        WHERE message.capability_session_id = stale_session.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_events AS event_row
        WHERE event_row.actor_session_id = stale_session.id
      );

    IF (
      SELECT pg_catalog.count(*)
      FROM public.booking_capability_sessions AS session_row
      WHERE session_row.booking_request_id = v_request.id
        AND session_row.access_version = v_request.access_version
        AND session_row.revoked_at IS NULL
        AND session_row.expires_at > pg_catalog.now()
    ) >= 16 THEN
      -- Keep the same non-enumerating result as an invalid bearer/session.
      RAISE EXCEPTION 'booking_not_found';
    END IF;

    INSERT INTO public.booking_capability_sessions (
      booking_request_id,
      access_version,
      session_token_hash,
      expires_at
    ) VALUES (
      v_request.id,
      v_request.access_version,
      p_session_hash,
      p_session_expires_at
    )
    RETURNING * INTO v_session;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'publicId', v_request.public_id,
    'accessVersion', v_request.access_version,
    'sessionExpiresAt', v_session.expires_at
  );
END;
$$;

CREATE FUNCTION public.booking_request_projection(
  p_request_id uuid,
  p_access_kind text,
  p_member_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_members jsonb := '[]'::jsonb;
  v_current_profile_slug text;
BEGIN
  SELECT request_row.*
    INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.id = p_request_id;

  IF NOT FOUND
     OR p_access_kind IS NULL
     OR p_access_kind NOT IN ('guest', 'member', 'provider') THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  -- Slugs are mutable resolution keys, not historical identity. Existing
  -- private bookings point Back to the current canonical profile slug while
  -- deleted-provider history falls back to the immutable creation snapshot.
  SELECT profile.slug INTO v_current_profile_slug
  FROM public.business_profiles AS profile
  WHERE profile.space_id = v_request.space_id
    AND profile.id = v_request.business_profile_id
    AND profile.archived_at IS NULL;
  v_current_profile_slug := COALESCE(
    v_current_profile_slug,
    v_request.business_profile_slug_snapshot
  );

  -- Linked emails are access-control PII. Only a customer owner who can manage
  -- memberships receives the list; ordinary members and providers do not.
  IF v_request.access_mode = 'members'
     AND p_access_kind = 'member'
     AND p_member_role = 'owner' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', member.id,
        'emailCanonical', member.canonical_email,
        'role', member.role,
        'status', member.status,
        'createdAt', member.created_at,
        'revokedAt', member.revoked_at
      ) ORDER BY member.created_at, member.id
    ), '[]'::jsonb)
      INTO v_members
    FROM public.booking_access_members AS member
    WHERE member.booking_request_id = v_request.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'booking', pg_catalog.jsonb_build_object(
      'id', v_request.id,
      'publicId', v_request.public_id,
      'status', v_request.status,
      'accessMode', v_request.access_mode,
      'accessVersion', v_request.access_version,
      'revision', v_request.revision,
      'createdAt', v_request.created_at,
      'cancelledAt', v_request.cancelled_at
    ),
    'businessProfileSlug', v_current_profile_slug,
    'provider', pg_catalog.jsonb_build_object(
      'slug', v_current_profile_slug,
      'displayName', v_request.provider_name_snapshot,
      'websiteUrl', v_request.provider_website_url_snapshot
    ),
    'service', pg_catalog.jsonb_build_object(
      'title', v_request.service_title_snapshot,
      'summary', v_request.service_summary_snapshot,
      'timezone', v_request.provider_timezone
    ),
    'requested', pg_catalog.jsonb_build_object(
      'date', v_request.requested_local_date,
      'time', v_request.requested_local_time,
      'timezone', v_request.provider_timezone,
      'startsAtUtc', v_request.requested_at
    ),
    'contact', pg_catalog.jsonb_build_object(
      'name', v_request.contact_name,
      'email', v_request.contact_email,
      'phone', v_request.contact_phone,
      'message', v_request.contact_message
    ),
    'discount', pg_catalog.jsonb_build_object(
      'eligibleBps', v_request.eligible_discount_bps,
      'appliedBps', v_request.applied_discount_bps
    ),
    'access', pg_catalog.jsonb_build_object(
      'actorKind', p_access_kind,
      'memberRole', p_member_role
    ),
    'permissions', pg_catalog.jsonb_build_object(
      'canCancel', v_request.status = 'requested'
        AND p_access_kind IN ('guest', 'member'),
      'canClaim', v_request.access_mode = 'link'
        AND v_request.status = 'requested'
        AND p_access_kind = 'guest',
      'canManageMembers', v_request.access_mode = 'members'
        AND p_access_kind = 'member'
        AND p_member_role = 'owner',
      'canMessage', v_request.status = 'requested',
      'canSendMessage', v_request.status = 'requested'
    ),
    'members', v_members
  );
END;
$$;

CREATE FUNCTION public.booking_read_request(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_access record;
BEGIN
  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );

  RETURN public.booking_request_projection(
    v_access.request_id,
    v_access.access_kind,
    v_access.member_role
  );
END;
$$;

CREATE FUNCTION public.booking_list_messages(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_before_created_at timestamp with time zone,
  p_before_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_access record;
  v_result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'threadId', p_public_id,
      'body', page.body,
      'messageKind', 'chat',
      'createdAt', page.created_at,
      'isDeleted', false,
      'isHidden', false,
      'authorName', page.author_name_snapshot,
      'senderSide', page.sender_side,
      'senderKind', page.sender_kind
    ) ORDER BY page.created_at, page.id
  ), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT message.*
    FROM public.booking_messages AS message
    WHERE message.booking_request_id = v_access.request_id
      AND (
        p_before_created_at IS NULL
        OR (message.created_at, message.id) < (p_before_created_at, p_before_id)
      )
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT p_limit
  ) AS page;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_list_events(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_before_created_at timestamp with time zone,
  p_before_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_access record;
  v_request public.booking_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.id = v_access.request_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'eventType', page.event_type,
      'actorName', CASE page.actor_kind
        WHEN 'guest' THEN NULL
        WHEN 'provider' THEN v_request.provider_name_snapshot
        ELSE NULL
      END,
      'createdAt', page.created_at
    ) ORDER BY page.created_at, page.id
  ), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT event_row.*
    FROM public.booking_events AS event_row
    WHERE event_row.booking_request_id = v_access.request_id
      AND (
        p_before_created_at IS NULL
        OR (event_row.created_at, event_row.id) < (p_before_created_at, p_before_id)
      )
    ORDER BY event_row.created_at DESC, event_row.id DESC
    LIMIT p_limit
  ) AS page;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_provider_list_services(
  p_actor_id uuid,
  p_space_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.booking_assert_provider(p_actor_id, p_space_id);

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', service.id,
      'businessProfileId', service.business_profile_id,
      'revision', service.revision,
      'title', service.title,
      'summary', service.summary,
      'timezone', service.timezone,
      'signedInDiscountBps', service.signed_in_discount_bps,
      'status', service.status,
      'updatedAt', service.updated_at
    ) ORDER BY service.updated_at DESC, service.id DESC
  ), '[]'::jsonb)
    INTO v_result
  FROM public.booking_services AS service
  WHERE service.space_id = p_space_id
    AND service.archived_at IS NULL;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_provider_list_requests(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid,
  p_before_created_at timestamp with time zone,
  p_before_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.booking_assert_provider(p_actor_id, p_space_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  IF p_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.booking_services AS service
    WHERE service.id = p_service_id AND service.space_id = p_space_id
  ) THEN
    RAISE EXCEPTION 'booking_provider_not_allowed';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'publicId', page.public_id,
      'businessProfileSlug', page.business_profile_slug_snapshot,
      'providerDisplayName', page.provider_name_snapshot,
      'serviceTitle', page.service_title_snapshot,
      'status', page.status,
      'requestedDate', page.requested_local_date,
      'requestedTime', page.requested_local_time,
      'timezone', page.provider_timezone,
      'contactName', page.contact_name,
      'createdAt', page.created_at,
      'lastMessageAt', (
        SELECT pg_catalog.max(message.created_at)
        FROM public.booking_messages AS message
        WHERE message.booking_request_id = page.id
      )
    ) ORDER BY page.created_at DESC, page.id DESC
  ), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT request_row.*
    FROM public.booking_requests AS request_row
    WHERE request_row.space_id = p_space_id
      AND (p_service_id IS NULL OR request_row.service_id = p_service_id)
      AND (
        p_before_created_at IS NULL
        OR (request_row.created_at, request_row.id) < (p_before_created_at, p_before_id)
      )
    ORDER BY request_row.created_at DESC, request_row.id DESC
    LIMIT p_limit
  ) AS page;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_send_message(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_body text,
  p_client_message_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_access record;
  v_existing public.booking_messages%ROWTYPE;
  v_message public.booking_messages%ROWTYPE;
  v_body text := pg_catalog.btrim(p_body);
  v_sender_side text;
  v_sender_kind text;
  v_sender_key text;
  v_author_name text;
BEGIN
  IF p_public_id IS NULL
     OR p_client_message_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_body IS NULL
     OR pg_catalog.char_length(v_body) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );

  IF v_access.access_kind = 'guest' THEN
    v_sender_side := 'customer';
    v_sender_kind := 'guest';
    -- All link holders are the same bearer principal for this access version.
    -- This shares retry/rate-limit scope across independently exchanged cookies
    -- while capability_session_id still records the exact posting session.
    v_sender_key := 'guest:link:' || v_request.access_version::text;
    -- A bearer link proves possession only, never the contact person's identity.
    -- The UI localizes sender_kind=guest as Gestur/Guest.
    v_author_name := NULL;
  ELSIF v_access.access_kind = 'member' THEN
    v_sender_side := 'customer';
    v_sender_kind := 'member';
    v_sender_key := 'member:' || v_access.member_id::text;
    SELECT NULLIF(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'display_name'), '')
      INTO v_author_name
    FROM auth.users AS auth_user
    WHERE auth_user.id = v_access.actor_user_id;
    IF v_author_name ~ '[[:cntrl:]]' THEN
      v_author_name := NULL;
    ELSIF pg_catalog.char_length(v_author_name) > 120 THEN
      v_author_name := pg_catalog.substr(v_author_name, 1, 120);
    END IF;
  ELSE
    v_sender_side := 'provider';
    v_sender_kind := 'provider';
    v_sender_key := 'provider:' || v_access.actor_user_id::text;
    v_author_name := v_request.provider_name_snapshot;
    IF v_author_name ~ '[[:cntrl:]]' THEN v_author_name := NULL; END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_request.id::text || ':' || v_sender_key,
    12504
  ));

  -- Replay lookup deliberately ignores mutable sender_key. A committed guest
  -- message must remain the same operation if the bearer later claims the
  -- booking and retries as a member after losing the original response.
  SELECT message.* INTO v_existing
  FROM public.booking_messages AS message
  WHERE message.booking_request_id = v_request.id
    AND (
      message.idempotency_key = p_idempotency_key
      OR message.client_message_id = p_client_message_id
    )
  ORDER BY (message.idempotency_key = p_idempotency_key) DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.idempotency_key IS DISTINCT FROM p_idempotency_key
       OR v_existing.client_message_id IS DISTINCT FROM p_client_message_id
       OR v_existing.body IS DISTINCT FROM v_body THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    v_message := v_existing;
  ELSE
    IF v_request.status <> 'requested' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;

    IF (
      SELECT pg_catalog.count(*)
      FROM public.booking_messages AS recent_message
      WHERE recent_message.booking_request_id = v_request.id
        AND recent_message.sender_key = v_sender_key
        AND recent_message.created_at > pg_catalog.now() - interval '1 minute'
    ) >= 10 THEN
      RAISE EXCEPTION 'booking_message_rate_limited';
    END IF;

    INSERT INTO public.booking_messages (
      booking_request_id,
      sender_side,
      sender_kind,
      sender_key,
      actor_user_id,
      capability_session_id,
      author_name_snapshot,
      body,
      client_message_id,
      idempotency_key
    ) VALUES (
      v_request.id,
      v_sender_side,
      v_sender_kind,
      v_sender_key,
      v_access.actor_user_id,
      v_access.capability_session_id,
      v_author_name,
      v_body,
      p_client_message_id,
      p_idempotency_key
    )
    RETURNING * INTO v_message;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_message.id,
    'threadId', v_request.public_id,
    'body', v_message.body,
    'messageKind', 'chat',
    'createdAt', v_message.created_at,
    'isDeleted', false,
    'isHidden', false,
    'authorName', v_message.author_name_snapshot,
    'senderSide', v_message.sender_side,
    'senderKind', v_message.sender_kind
  );
END;
$$;

CREATE FUNCTION public.booking_cancel_request(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_access record;
  v_existing_event public.booking_events%ROWTYPE;
  v_actor_kind text;
  v_actor_principal text;
  v_cancel_fingerprint text;
BEGIN
  IF p_public_id IS NULL
     OR p_expected_revision IS NULL
     OR p_expected_revision <= 0
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  -- Replay is checked before current role classification. A member may become
  -- the provider (or lose membership) after the cancellation committed but
  -- before the HTTP response arrived, while the same verified user receives
  -- only this bounded replay acknowledgement.
  SELECT event_row.* INTO v_existing_event
  FROM public.booking_events AS event_row
  WHERE event_row.booking_request_id = v_request.id
    AND event_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_event.event_type <> 'request_cancelled'
       OR v_existing_event.request_revision <> p_expected_revision + 1 THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    v_actor_kind := v_existing_event.actor_kind;
    IF v_actor_kind = 'guest' THEN
      -- Validate the same live bearer access-version directly. Provider-first
      -- classification must not hide an exact guest retry when that signed-in
      -- link holder later becomes the provider.
      IF p_session_hash !~ '^[0-9a-f]{64}$'
         OR NOT EXISTS (
           SELECT 1
           FROM public.booking_capability_sessions AS session_row
           WHERE session_row.booking_request_id = v_request.id
             AND session_row.session_token_hash = p_session_hash
             AND session_row.access_version = v_existing_event.access_version
             AND session_row.revoked_at IS NULL
             AND session_row.expires_at > pg_catalog.now()
         ) THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;
      v_actor_principal := 'guest:link:' || v_existing_event.access_version::text;
    ELSIF v_actor_kind = 'member' THEN
      IF v_existing_event.actor_user_id IS NULL
         OR p_actor_user_id IS DISTINCT FROM v_existing_event.actor_user_id
         OR NOT EXISTS (
           SELECT 1
           FROM auth.users AS auth_user
           WHERE auth_user.id = p_actor_user_id
             AND auth_user.email_confirmed_at IS NOT NULL
         ) THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;
      v_actor_principal := 'member:user:' || v_existing_event.actor_user_id::text;
    ELSE
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    v_cancel_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'action', 'cancel',
      'actorKind', v_actor_kind,
      'actorPrincipal', v_actor_principal,
      'expectedRevision', p_expected_revision
    )::text);
    IF v_existing_event.operation_fingerprint IS DISTINCT FROM v_cancel_fingerprint THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'publicId', v_request.public_id,
      'status', v_request.status,
      'revision', v_request.revision,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );
  IF v_access.access_kind NOT IN ('guest', 'member') THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  v_actor_kind := v_access.access_kind;
  v_actor_principal := CASE v_actor_kind
    WHEN 'guest' THEN 'guest:link:' || v_request.access_version::text
    ELSE 'member:user:' || v_access.actor_user_id::text
  END;
  v_cancel_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'cancel',
    'actorKind', v_actor_kind,
    'actorPrincipal', v_actor_principal,
    'expectedRevision', p_expected_revision
  )::text);

  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;
  IF v_request.status <> 'requested' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;

  UPDATE public.booking_requests AS request_row
  SET status = 'cancelled',
      revision = request_row.revision + 1,
      cancelled_at = pg_catalog.now(),
      cancelled_by_user_id = v_access.actor_user_id,
      updated_at = pg_catalog.now()
  WHERE request_row.id = v_request.id
    AND request_row.revision = p_expected_revision
  RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;

  INSERT INTO public.booking_events (
    booking_request_id,
    request_revision,
    access_version,
    event_type,
    actor_kind,
    actor_user_id,
    actor_session_id,
    idempotency_key,
    operation_fingerprint,
    event_data
  ) VALUES (
    v_request.id,
    v_request.revision,
    v_request.access_version,
    'request_cancelled',
    v_actor_kind,
    v_access.actor_user_id,
    v_access.capability_session_id,
    p_idempotency_key,
    v_cancel_fingerprint,
    '{}'::jsonb
  );

  RETURN public.booking_request_projection(
    v_request.id,
    v_access.access_kind,
    v_access.member_role
  );
END;
$$;

CREATE FUNCTION public.booking_claim_request(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_expected_access_version integer,
  p_additional_emails text[],
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_access record;
  v_existing_event public.booking_events%ROWTYPE;
  v_actor_email text;
  v_raw_email text;
  v_email text;
  v_emails text[] := ARRAY[]::text[];
  v_service_discount integer;
  v_discount_applied boolean := false;
  v_claim_fingerprint text;
BEGIN
  IF p_public_id IS NULL
     OR p_actor_user_id IS NULL
     OR p_expected_access_version IS NULL
     OR p_expected_access_version <= 0
     OR p_idempotency_key IS NULL
     OR pg_catalog.cardinality(COALESCE(p_additional_emails, ARRAY[]::text[])) > 9 THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT public.booking_canonical_email(auth_user.email)
    INTO v_actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND auth_user.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF v_actor_email IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  FOREACH v_raw_email IN ARRAY COALESCE(p_additional_emails, ARRAY[]::text[])
  LOOP
    v_email := public.booking_canonical_email(v_raw_email);
    IF v_email IS NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    IF v_email <> v_actor_email AND NOT v_email = ANY(v_emails) THEN
      v_emails := pg_catalog.array_append(v_emails, v_email);
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(v_emails) > 9 THEN RAISE EXCEPTION 'booking_member_limit'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(email_row ORDER BY email_row), ARRAY[]::text[])
    INTO v_emails
  FROM pg_catalog.unnest(v_emails) AS email_row;
  v_claim_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'claim',
    'actorUserId', p_actor_user_id,
    'expectedAccessVersion', p_expected_access_version,
    'additionalEmails', pg_catalog.to_jsonb(v_emails)
  )::text);

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT event_row.* INTO v_existing_event
  FROM public.booking_events AS event_row
  WHERE event_row.booking_request_id = v_request.id
    AND event_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_event.event_type <> 'booking_claimed'
       OR v_existing_event.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_existing_event.access_version <> p_expected_access_version + 1
       OR v_existing_event.operation_fingerprint IS DISTINCT FROM v_claim_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM public.booking_access_members AS member
         WHERE member.booking_request_id = v_request.id
           AND member.canonical_email = v_actor_email
           AND member.role = 'owner'
           AND member.status = 'active'
    ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    IF public.booking_provider_allowed(p_actor_user_id, v_request.space_id) THEN
      RETURN pg_catalog.jsonb_build_object(
        'publicId', v_request.public_id,
        'accessVersion', v_request.access_version,
        'revision', v_request.revision,
        'replayed', true
      );
    END IF;
    RETURN public.booking_request_projection(v_request.id, 'member', 'owner');
  END IF;

  IF v_request.access_mode <> 'link' OR v_request.status <> 'requested' THEN
    RAISE EXCEPTION 'booking_claim_conflict';
  END IF;
  IF v_request.access_version <> p_expected_access_version THEN
    RAISE EXCEPTION 'booking_access_version_conflict';
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(
    p_public_id,
    p_actor_user_id,
    p_session_hash
  );
  IF v_access.access_kind <> 'guest' THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  INSERT INTO public.booking_access_members (
    booking_request_id,
    canonical_email,
    role,
    status,
    user_id,
    added_by_user_id
  ) VALUES (
    v_request.id,
    v_actor_email,
    'owner',
    'active',
    p_actor_user_id,
    p_actor_user_id
  );

  FOREACH v_email IN ARRAY v_emails
  LOOP
    INSERT INTO public.booking_access_members (
      booking_request_id,
      canonical_email,
      role,
      status,
      added_by_user_id
    ) VALUES (
      v_request.id,
      v_email,
      'member',
      'active',
      p_actor_user_id
    );
  END LOOP;

  IF v_request.status = 'requested' THEN
    -- Eligibility is the immutable offer snapshot captured at create time.
    -- Later provider service edits must not change this booking's claim result.
    v_service_discount := v_request.eligible_discount_bps;
  END IF;

  UPDATE public.booking_requests AS request_row
  SET access_mode = 'members',
      access_version = request_row.access_version + 1,
      revision = request_row.revision + 1,
      guest_capability_hash = NULL,
      applied_discount_bps = CASE
        WHEN request_row.status = 'requested' THEN v_service_discount
        ELSE request_row.applied_discount_bps
      END,
      discount_applied_at = CASE
        WHEN request_row.status = 'requested' AND v_service_discount IS NOT NULL
          THEN pg_catalog.now()
        ELSE request_row.discount_applied_at
      END,
      updated_at = pg_catalog.now()
  WHERE request_row.id = v_request.id
    AND request_row.access_mode = 'link'
    AND request_row.access_version = p_expected_access_version
  RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_claim_conflict'; END IF;
  v_discount_applied := v_request.applied_discount_bps IS NOT NULL;

  UPDATE public.booking_capability_sessions AS session_row
  SET revoked_at = pg_catalog.now(),
      last_seen_at = pg_catalog.now()
  WHERE session_row.booking_request_id = v_request.id
    AND session_row.revoked_at IS NULL;

  INSERT INTO public.booking_events (
    booking_request_id,
    request_revision,
    access_version,
    event_type,
    actor_kind,
    actor_user_id,
    actor_session_id,
    idempotency_key,
    operation_fingerprint,
    event_data
  ) VALUES (
    v_request.id,
    v_request.revision,
    v_request.access_version,
    'booking_claimed',
    'member',
    p_actor_user_id,
    NULL,
    p_idempotency_key,
    v_claim_fingerprint,
    pg_catalog.jsonb_build_object('additionalMemberCount', pg_catalog.cardinality(v_emails))
  );

  IF v_discount_applied THEN
    INSERT INTO public.booking_events (
      booking_request_id,
      request_revision,
      access_version,
      event_type,
      actor_kind,
      actor_user_id,
      idempotency_key,
      operation_fingerprint,
      event_data
    ) VALUES (
      v_request.id,
      v_request.revision,
      v_request.access_version,
      'discount_applied',
      'member',
      p_actor_user_id,
      pg_catalog.gen_random_uuid(),
      pg_catalog.md5(v_claim_fingerprint || ':discount'),
      pg_catalog.jsonb_build_object('appliedDiscountBps', v_request.applied_discount_bps)
    );
  END IF;

  RETURN public.booking_request_projection(v_request.id, 'member', 'owner');
END;
$$;

CREATE FUNCTION public.booking_manage_member(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_expected_access_version integer,
  p_target_selector text,
  p_action text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_actor_email text;
  v_actor_member public.booking_access_members%ROWTYPE;
  v_target_email text;
  v_target_member public.booking_access_members%ROWTYPE;
  v_existing_event public.booking_events%ROWTYPE;
  v_event_type text;
  v_role text;
  v_member_fingerprint text;
  v_target_found boolean := false;
BEGIN
  IF p_public_id IS NULL
     OR p_actor_user_id IS NULL
     OR p_expected_access_version IS NULL
     OR p_expected_access_version <= 0
     OR p_action IS NULL
     OR p_action NOT IN ('add_member', 'add_owner', 'revoke')
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT public.booking_canonical_email(auth_user.email)
    INTO v_actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND auth_user.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF v_actor_email IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.access_mode <> 'members' THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  -- Add actions use a canonical email selector. Revoke uses the stable member
  -- UUID exposed by the authorized projection; SQL derives the email so a
  -- client can never choose a revoke target by supplying an email address.
  IF p_action = 'revoke' THEN
    IF p_target_selector IS NULL OR p_target_selector !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;
    SELECT member.* INTO v_target_member
    FROM public.booking_access_members AS member
    WHERE member.booking_request_id = v_request.id
      AND member.id = p_target_selector::uuid
    FOR UPDATE;
  ELSE
    v_target_email := public.booking_canonical_email(p_target_selector);
    IF v_target_email IS NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    SELECT member.* INTO v_target_member
    FROM public.booking_access_members AS member
    WHERE member.booking_request_id = v_request.id
      AND member.canonical_email = v_target_email
    FOR UPDATE;
  END IF;
  v_target_found := FOUND;
  IF p_action = 'revoke' THEN
    IF NOT v_target_found THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    v_target_email := v_target_member.canonical_email;
  END IF;

  v_event_type := CASE WHEN p_action = 'revoke' THEN 'member_revoked' ELSE 'member_added' END;
  v_role := CASE WHEN p_action = 'add_owner' THEN 'owner' ELSE 'member' END;
  v_member_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', p_action,
    'actorUserId', p_actor_user_id,
    'expectedAccessVersion', p_expected_access_version,
    'targetEmail', v_target_email
  )::text);

  SELECT event_row.* INTO v_existing_event
  FROM public.booking_events AS event_row
  WHERE event_row.booking_request_id = v_request.id
    AND event_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_event.event_type <> v_event_type
       OR v_existing_event.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_existing_event.access_version <> p_expected_access_version + 1
       OR v_existing_event.operation_fingerprint IS DISTINCT FROM v_member_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM public.booking_access_members AS member
         WHERE member.id = v_existing_event.subject_member_id
           AND member.booking_request_id = v_request.id
           AND member.canonical_email = v_target_email
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    IF NOT public.booking_provider_allowed(p_actor_user_id, v_request.space_id)
       AND EXISTS (
      SELECT 1
      FROM public.booking_access_members AS actor_member
      WHERE actor_member.booking_request_id = v_request.id
        AND actor_member.canonical_email = v_actor_email
        AND actor_member.role = 'owner'
        AND actor_member.status = 'active'
    ) THEN
      RETURN public.booking_request_projection(v_request.id, 'member', 'owner');
    END IF;
    -- The exact mutation may have committed before a later owner revoked the
    -- actor. Preserve retry idempotency without returning booking/member PII.
    RETURN pg_catalog.jsonb_build_object(
      'publicId', v_request.public_id,
      'accessVersion', v_request.access_version,
      'revision', v_request.revision,
      'replayed', true
    );

  END IF;

  -- Self-revoke is intentionally outside the MVP. Keep this after the exact
  -- replay branch so a later account-email change cannot invalidate an
  -- already committed operation.
  IF p_action = 'revoke' AND v_target_email = v_actor_email THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  -- Provider identity has global precedence over a coincident customer
  -- membership. Exact committed retries above remain idempotent, but a
  -- provider can never create a fresh customer-side membership mutation.
  IF public.booking_provider_allowed(p_actor_user_id, v_request.space_id) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  SELECT member.* INTO v_actor_member
  FROM public.booking_access_members AS member
  WHERE member.booking_request_id = v_request.id
    AND member.canonical_email = v_actor_email
    AND member.role = 'owner'
    AND member.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v_request.access_version <> p_expected_access_version THEN
    RAISE EXCEPTION 'booking_access_version_conflict';
  END IF;

  IF p_action = 'revoke' THEN
    IF NOT v_target_found OR v_target_member.status <> 'active' THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;
    IF v_target_member.role = 'owner' AND (
      SELECT pg_catalog.count(*)
      FROM public.booking_access_members AS owner_member
      WHERE owner_member.booking_request_id = v_request.id
        AND owner_member.role = 'owner'
        AND owner_member.status = 'active'
    ) <= 1 THEN
      RAISE EXCEPTION 'booking_last_owner';
    END IF;

    UPDATE public.booking_access_members AS member
    SET status = 'revoked',
        revoked_at = pg_catalog.now(),
        revoked_by_user_id = p_actor_user_id,
        updated_at = pg_catalog.now()
    WHERE member.id = v_target_member.id
    RETURNING * INTO v_target_member;
  ELSE
    IF v_target_email = v_actor_email AND p_action = 'add_member' THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;
    IF v_target_found
       AND v_target_member.status = 'active'
       AND v_target_member.role = v_role THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;
    IF (SELECT pg_catalog.count(*)
        FROM public.booking_access_members AS active_member
        WHERE active_member.booking_request_id = v_request.id
          AND active_member.status = 'active') >= 10
       AND (NOT v_target_found OR v_target_member.status <> 'active') THEN
      RAISE EXCEPTION 'booking_member_limit';
    END IF;

    IF v_target_found THEN
      UPDATE public.booking_access_members AS member
      SET role = v_role,
          status = 'active',
          user_id = CASE
            WHEN v_target_email = v_actor_email THEN p_actor_user_id
            ELSE member.user_id
          END,
          added_by_user_id = p_actor_user_id,
          revoked_by_user_id = NULL,
          revoked_at = NULL,
          updated_at = pg_catalog.now()
      WHERE member.id = v_target_member.id
      RETURNING * INTO v_target_member;
    ELSE
      INSERT INTO public.booking_access_members (
        booking_request_id,
        canonical_email,
        role,
        status,
        user_id,
        added_by_user_id
      ) VALUES (
        v_request.id,
        v_target_email,
        v_role,
        'active',
        CASE WHEN v_target_email = v_actor_email THEN p_actor_user_id ELSE NULL END,
        p_actor_user_id
      )
      RETURNING * INTO v_target_member;
    END IF;
  END IF;

  UPDATE public.booking_requests AS request_row
  SET access_version = request_row.access_version + 1,
      revision = request_row.revision + 1,
      updated_at = pg_catalog.now()
  WHERE request_row.id = v_request.id
    AND request_row.access_version = p_expected_access_version
  RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_access_version_conflict'; END IF;

  INSERT INTO public.booking_events (
    booking_request_id,
    request_revision,
    access_version,
    event_type,
    actor_kind,
    actor_user_id,
    subject_member_id,
    idempotency_key,
    operation_fingerprint,
    event_data
  ) VALUES (
    v_request.id,
    v_request.revision,
    v_request.access_version,
    v_event_type,
    'member',
    p_actor_user_id,
    v_target_member.id,
    p_idempotency_key,
    v_member_fingerprint,
    pg_catalog.jsonb_build_object('role', v_target_member.role)
  );

  RETURN public.booking_request_projection(v_request.id, 'member', 'owner');
END;
$$;

-- Pin every private table and SECURITY DEFINER function owner explicitly. The
-- preflight above guarantees this migration can perform the ownership transfer;
-- no privileged booking object is left owned by whichever role ran migration.
ALTER TABLE public.booking_services OWNER TO postgres;
ALTER TABLE public.booking_requests OWNER TO postgres;
ALTER TABLE public.booking_access_members OWNER TO postgres;
ALTER TABLE public.booking_capability_sessions OWNER TO postgres;
ALTER TABLE public.booking_messages OWNER TO postgres;
ALTER TABLE public.booking_events OWNER TO postgres;

ALTER FUNCTION public.booking_canonical_email(text) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_allowed(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_assert_provider(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_authorize_request(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.booking_events_immutable() OWNER TO postgres;
ALTER FUNCTION public.booking_request_projection(uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.booking_upsert_service(
  uuid, uuid, uuid, uuid, integer, text, text, text, integer, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.booking_resolve_public(text) OWNER TO postgres;
ALTER FUNCTION public.booking_create_request(
  uuid, uuid, uuid, text, text, text, text, date,
  time without time zone, timestamp with time zone, text, text, date, integer
) OWNER TO postgres;
ALTER FUNCTION public.booking_resolve_create_replay(
  uuid, text, uuid, text, text, text, text, date, time without time zone, text
) OWNER TO postgres;
ALTER FUNCTION public.booking_exchange_capability(
  uuid, text, text, timestamp with time zone
) OWNER TO postgres;
ALTER FUNCTION public.booking_read_request(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.booking_list_messages(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) OWNER TO postgres;
ALTER FUNCTION public.booking_list_events(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_list_services(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_list_requests(
  uuid, uuid, uuid, timestamp with time zone, uuid, integer
) OWNER TO postgres;
ALTER FUNCTION public.booking_send_message(
  uuid, uuid, text, text, uuid, uuid
) OWNER TO postgres;
ALTER FUNCTION public.booking_cancel_request(
  uuid, uuid, text, integer, uuid
) OWNER TO postgres;
ALTER FUNCTION public.booking_claim_request(
  uuid, uuid, text, integer, text[], uuid
) OWNER TO postgres;
ALTER FUNCTION public.booking_manage_member(
  uuid, uuid, integer, text, text, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.booking_canonical_email(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_provider_allowed(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_assert_provider(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_authorize_request(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_events_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_request_projection(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.booking_upsert_service(
  uuid, uuid, uuid, uuid, integer, text, text, text, integer, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_resolve_public(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_create_request(
  uuid, uuid, uuid, text, text, text, text, date,
  time without time zone, timestamp with time zone, text, text, date, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_resolve_create_replay(
  uuid, text, uuid, text, text, text, text, date, time without time zone, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_exchange_capability(
  uuid, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_read_request(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_list_messages(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_list_events(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_provider_list_services(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_provider_list_requests(
  uuid, uuid, uuid, timestamp with time zone, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_send_message(
  uuid, uuid, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_cancel_request(
  uuid, uuid, text, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_claim_request(
  uuid, uuid, text, integer, text[], uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_manage_member(
  uuid, uuid, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.booking_upsert_service(
  uuid, uuid, uuid, uuid, integer, text, text, text, integer, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_resolve_public(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_create_request(
  uuid, uuid, uuid, text, text, text, text, date,
  time without time zone, timestamp with time zone, text, text, date, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_resolve_create_replay(
  uuid, text, uuid, text, text, text, text, date, time without time zone, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_exchange_capability(
  uuid, text, text, timestamp with time zone
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_read_request(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_list_messages(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_list_events(
  uuid, uuid, text, timestamp with time zone, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_provider_list_services(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_provider_list_requests(
  uuid, uuid, uuid, timestamp with time zone, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_send_message(
  uuid, uuid, text, text, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_cancel_request(
  uuid, uuid, text, integer, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_claim_request(
  uuid, uuid, text, integer, text[], uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_manage_member(
  uuid, uuid, integer, text, text, uuid
) TO service_role;

COMMIT;

-- Recovery after COMMIT is forward-only. Do not drop booking history or narrow
-- the shared feature-key constraint. Disable BOOKINGS_ENABLED in the app and
-- use the read-only recovery probe before designing a separately reviewed
-- corrective migration.
