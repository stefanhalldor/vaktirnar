-- TODO #097 / SQL120: generic business profiles and reviewed public Kviss ads.
-- Written for review only. Stebbi alone may apply this after the named-target
-- preflight is fully green. This migration seeds no advertiser or creative.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $advertiser_preconditions$
DECLARE
  v_collision text;
  v_feature_expression text;
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.spaces') IS NULL
     OR pg_catalog.to_regclass('public.space_members') IS NULL
     OR pg_catalog.to_regprocedure('public.ensure_personal_space()') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'advertiser_missing_dependency';
  END IF;

  SELECT pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
    INTO v_feature_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;

  IF v_feature_expression IS NULL THEN
    RAISE EXCEPTION 'advertiser_feature_constraint_missing';
  END IF;
  IF pg_catalog.strpos(
       v_feature_expression,
       pg_catalog.quote_literal('kviss')
     ) = 0 THEN
    RAISE EXCEPTION 'advertiser_kviss_prerequisite_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'advertiser_owner_cannot_bypass_rls:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'advertiser_service_role_unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'advertiser_service_role_cannot_bypass_rls';
  END IF;

  SELECT collision.name
    INTO v_collision
  FROM (
    SELECT target.name
    FROM (VALUES
      ('business_profiles'),
      ('business_profiles_pkey'),
      ('business_profiles_slug_key'),
      ('business_profiles_space_id_id_key'),
      ('business_profiles_space_active_idx'),
      ('advertiser_creatives'),
      ('advertiser_creatives_pkey'),
      ('advertiser_creatives_space_id_id_key'),
      ('advertiser_creatives_profile_idx'),
      ('advertiser_creatives_review_queue_idx'),
      ('advertiser_one_active_per_placement_idx'),
      ('advertiser_audit_events'),
      ('advertiser_audit_events_pkey'),
      ('advertiser_audit_events_idempotency_key'),
      ('advertiser_audit_creative_time_idx')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL

    UNION ALL

    SELECT procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'advertiser_assert_owner',
        'advertiser_upsert_business_profile',
        'advertiser_upsert_creative',
        'advertiser_owner_transition',
        'advertiser_admin_review',
        'advertiser_resolve_public',
        'advertiser_audit_immutable'
      )

    UNION ALL

    SELECT relation.relname || '.' || trigger_row.tgname
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'advertiser_audit_immutable_guard'
  ) AS collision
  ORDER BY collision.name
  LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'advertiser_collision:%', v_collision;
  END IF;
END;
$advertiser_preconditions$;

DO $advertiser_feature_key$
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
    RAISE EXCEPTION 'advertiser_feature_constraint_missing';
  END IF;

  IF pg_catalog.strpos(
       v_expression,
       pg_catalog.quote_literal('auglysandi')
     ) = 0 THEN
    ALTER TABLE public.feature_access
      DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
      v_expression,
      'auglysandi'
    );
  END IF;
END;
$advertiser_feature_key$;

CREATE TABLE public.business_profiles (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  created_by uuid,
  revision integer NOT NULL DEFAULT 1,
  slug text NOT NULL,
  display_name text NOT NULL,
  description text,
  website_url text,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT business_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT business_profiles_revision_check CHECK (revision > 0),
  CONSTRAINT business_profiles_slug_check CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND pg_catalog.char_length(slug) BETWEEN 2 AND 80
  ),
  CONSTRAINT business_profiles_display_name_check CHECK (
    display_name = pg_catalog.btrim(display_name)
    AND pg_catalog.char_length(display_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT business_profiles_description_check CHECK (
    description IS NULL
    OR (
      description = pg_catalog.btrim(description)
      AND pg_catalog.char_length(description) BETWEEN 1 AND 500
    )
  ),
  CONSTRAINT business_profiles_website_url_check CHECK (
    website_url IS NULL
    OR (
      website_url = pg_catalog.btrim(website_url)
      AND pg_catalog.char_length(website_url) <= 2048
      AND website_url ~ '^https://[^/?#[:space:]@]+([/?][^#[:space:]]*)?$'
      AND website_url !~ '[[:space:][:cntrl:]]'
      AND pg_catalog.strpos(website_url, '#') = 0
      AND pg_catalog.split_part(pg_catalog.substr(website_url, 9), '/', 1) !~ '@'
    )
  ),
  CONSTRAINT business_profiles_space_fk
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE,
  CONSTRAINT business_profiles_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT business_profiles_slug_key UNIQUE (slug),
  CONSTRAINT business_profiles_space_id_id_key UNIQUE (space_id, id)
);

CREATE TABLE public.advertiser_creatives (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  placement text NOT NULL,
  headline text NOT NULL,
  body text NOT NULL,
  cta_label text NOT NULL,
  destination_url text NOT NULL,
  review_status text NOT NULL DEFAULT 'draft',
  delivery_status text NOT NULL DEFAULT 'paused',
  submitted_snapshot jsonb,
  approved_snapshot jsonb,
  approved_revision integer,
  submitted_at timestamp with time zone,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT advertiser_creatives_pkey PRIMARY KEY (id),
  CONSTRAINT advertiser_creatives_revision_check CHECK (revision > 0),
  CONSTRAINT advertiser_creatives_placement_check CHECK (
    placement IN ('public_quiz_lobby', 'public_quiz_results')
  ),
  CONSTRAINT advertiser_creatives_headline_check CHECK (
    headline = pg_catalog.btrim(headline)
    AND pg_catalog.char_length(headline) BETWEEN 1 AND 100
  ),
  CONSTRAINT advertiser_creatives_body_check CHECK (
    body = pg_catalog.btrim(body)
    AND pg_catalog.char_length(body) BETWEEN 1 AND 300
  ),
  CONSTRAINT advertiser_creatives_cta_label_check CHECK (
    cta_label = pg_catalog.btrim(cta_label)
    AND pg_catalog.char_length(cta_label) BETWEEN 1 AND 40
  ),
  CONSTRAINT advertiser_creatives_destination_url_check CHECK (
    destination_url = pg_catalog.btrim(destination_url)
    AND pg_catalog.char_length(destination_url) <= 2048
    AND destination_url ~ '^https://[^/?#[:space:]@]+([/?][^#[:space:]]*)?$'
    AND destination_url !~ '[[:space:][:cntrl:]]'
    AND pg_catalog.strpos(destination_url, '#') = 0
    AND pg_catalog.split_part(pg_catalog.substr(destination_url, 9), '/', 1) !~ '@'
  ),
  CONSTRAINT advertiser_creatives_review_status_check CHECK (
    review_status IN ('draft', 'pending', 'approved', 'changes_requested', 'rejected')
  ),
  CONSTRAINT advertiser_creatives_delivery_status_check CHECK (
    delivery_status IN ('paused', 'active')
  ),
  CONSTRAINT advertiser_creatives_review_snapshot_check CHECK (
    (
      review_status = 'draft'
      AND submitted_snapshot IS NULL
      AND submitted_at IS NULL
      AND approved_snapshot IS NULL
      AND approved_revision IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND review_note IS NULL
    )
    OR (
      review_status = 'pending'
      AND submitted_snapshot IS NOT NULL
      AND pg_catalog.jsonb_typeof(submitted_snapshot) = 'object'
      AND submitted_at IS NOT NULL
      AND approved_snapshot IS NULL
      AND approved_revision IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND review_note IS NULL
    )
    OR (
      review_status = 'approved'
      AND submitted_snapshot IS NOT NULL
      AND approved_snapshot IS NOT NULL
      AND pg_catalog.jsonb_typeof(submitted_snapshot) = 'object'
      AND pg_catalog.jsonb_typeof(approved_snapshot) = 'object'
      AND approved_snapshot = submitted_snapshot
      AND approved_revision = revision
      AND submitted_at IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
    OR (
      review_status IN ('changes_requested', 'rejected')
      AND submitted_snapshot IS NOT NULL
      AND pg_catalog.jsonb_typeof(submitted_snapshot) = 'object'
      AND submitted_at IS NOT NULL
      AND approved_snapshot IS NULL
      AND approved_revision IS NULL
      AND reviewed_at IS NOT NULL
    )
  ),
  CONSTRAINT advertiser_creatives_active_review_check CHECK (
    delivery_status <> 'active'
    OR (
      review_status = 'approved'
      AND submitted_snapshot IS NOT NULL
      AND approved_snapshot IS NOT NULL
      AND approved_revision IS NOT NULL
      AND approved_revision = revision
      AND approved_snapshot = submitted_snapshot
    )
  ),
  CONSTRAINT advertiser_creatives_review_note_check CHECK (
    review_note IS NULL
    OR (
      review_note = pg_catalog.btrim(review_note)
      AND pg_catalog.char_length(review_note) BETWEEN 1 AND 500
    )
  ),
  CONSTRAINT advertiser_creatives_profile_fk
    FOREIGN KEY (space_id, business_profile_id)
    REFERENCES public.business_profiles(space_id, id) ON DELETE CASCADE,
  CONSTRAINT advertiser_creatives_reviewer_fk
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT advertiser_creatives_space_id_id_key UNIQUE (space_id, id)
);

CREATE TABLE public.advertiser_audit_events (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  creative_id uuid NOT NULL,
  creative_revision integer NOT NULL,
  command_scope text NOT NULL,
  request_action text NOT NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  idempotency_key uuid NOT NULL,
  note text,
  snapshot jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT advertiser_audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT advertiser_audit_events_creative_revision_check CHECK (
    creative_revision > 0
  ),
  CONSTRAINT advertiser_audit_events_command_contract_check CHECK (
    (
      command_scope = 'owner'
      AND (
        (request_action = 'submit' AND event_type = 'submitted')
        OR (request_action = 'activate' AND event_type = 'activated')
        OR (request_action = 'pause' AND event_type = 'paused')
      )
    )
    OR (
      command_scope = 'admin'
      AND request_action IN ('approved', 'changes_requested', 'rejected', 'pause')
      AND event_type = CASE
        WHEN request_action = 'pause' THEN 'paused'
        ELSE request_action
      END
    )
  ),
  CONSTRAINT advertiser_audit_events_note_check CHECK (
    note IS NULL
    OR (
      note = pg_catalog.btrim(note)
      AND pg_catalog.char_length(note) BETWEEN 1 AND 500
    )
  ),
  CONSTRAINT advertiser_audit_events_snapshot_check CHECK (
    pg_catalog.jsonb_typeof(snapshot) = 'object'
  ),
  CONSTRAINT advertiser_audit_events_creative_fk
    FOREIGN KEY (creative_id) REFERENCES public.advertiser_creatives(id) ON DELETE CASCADE,
  CONSTRAINT advertiser_audit_events_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT advertiser_audit_events_idempotency_key
    UNIQUE (creative_id, idempotency_key)
);

CREATE INDEX business_profiles_space_active_idx
  ON public.business_profiles(space_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX advertiser_creatives_profile_idx
  ON public.advertiser_creatives(space_id, business_profile_id, updated_at DESC);

CREATE INDEX advertiser_creatives_review_queue_idx
  ON public.advertiser_creatives(review_status, submitted_at)
  WHERE review_status = 'pending' OR delivery_status = 'active';

CREATE UNIQUE INDEX advertiser_one_active_per_placement_idx
  ON public.advertiser_creatives(placement)
  WHERE delivery_status = 'active';

CREATE INDEX advertiser_audit_creative_time_idx
  ON public.advertiser_audit_events(creative_id, created_at DESC);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.advertiser_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertiser_creatives FORCE ROW LEVEL SECURITY;
ALTER TABLE public.advertiser_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertiser_audit_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.advertiser_assert_owner(p_actor_id uuid, p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.space_members AS membership
    WHERE membership.space_id = p_space_id
      AND membership.user_id = p_actor_id
      AND membership.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'advertiser_not_found';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(auth_user.email))
    INTO v_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_id;

  IF v_email IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.feature_access AS entitlement
    WHERE entitlement.feature_key = 'auglysandi'
      AND entitlement.email = v_email
  ) THEN
    RAISE EXCEPTION 'advertiser_not_found';
  END IF;
END;
$$;

CREATE FUNCTION public.advertiser_upsert_business_profile(
  p_actor_id uuid,
  p_space_id uuid,
  p_profile_id uuid,
  p_expected_revision integer,
  p_slug text,
  p_display_name text,
  p_description text,
  p_website_url text
)
RETURNS public.business_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.business_profiles%ROWTYPE;
  v_old_display_name text;
  v_old_website_url text;
BEGIN
  PERFORM public.advertiser_assert_owner(p_actor_id, p_space_id);

  IF (p_profile_id IS NULL AND p_expected_revision IS NOT NULL)
     OR (
       p_profile_id IS NOT NULL
       AND (p_expected_revision IS NULL OR p_expected_revision <= 0)
     )
     OR p_slug IS NULL
     OR p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR pg_catalog.char_length(p_slug) NOT BETWEEN 2 AND 80
     OR p_display_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_display_name)) NOT BETWEEN 1 AND 120
     OR (
       p_description IS NOT NULL
       AND pg_catalog.char_length(pg_catalog.btrim(p_description)) > 500
     )
     OR (
       p_website_url IS NOT NULL
       AND (
         p_website_url <> pg_catalog.btrim(p_website_url)
         OR pg_catalog.char_length(p_website_url) > 2048
         OR p_website_url !~ '^https://[^/?#[:space:]@]+([/?][^#[:space:]]*)?$'
         OR p_website_url ~ '[[:space:][:cntrl:]]'
         OR pg_catalog.strpos(p_website_url, '#') > 0
         OR pg_catalog.split_part(pg_catalog.substr(p_website_url, 9), '/', 1) ~ '@'
       )
     ) THEN
    RAISE EXCEPTION 'advertiser_invalid_profile';
  END IF;

  IF p_profile_id IS NULL THEN
    INSERT INTO public.business_profiles(
      space_id,
      created_by,
      slug,
      display_name,
      description,
      website_url
    ) VALUES (
      p_space_id,
      p_actor_id,
      p_slug,
      pg_catalog.btrim(p_display_name),
      NULLIF(pg_catalog.btrim(p_description), ''),
      p_website_url
    )
    RETURNING * INTO v_profile;
  ELSE
    SELECT profile.display_name, profile.website_url
      INTO v_old_display_name, v_old_website_url
    FROM public.business_profiles AS profile
    WHERE profile.id = p_profile_id
      AND profile.space_id = p_space_id
      AND profile.revision = p_expected_revision
      AND profile.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advertiser_revision_conflict';
    END IF;

    UPDATE public.business_profiles AS profile
    SET slug = p_slug,
        display_name = pg_catalog.btrim(p_display_name),
        description = NULLIF(pg_catalog.btrim(p_description), ''),
        website_url = p_website_url,
        revision = profile.revision + 1,
        updated_at = pg_catalog.now()
    WHERE profile.id = p_profile_id
      AND profile.space_id = p_space_id
      AND profile.revision = p_expected_revision
    RETURNING * INTO v_profile;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advertiser_revision_conflict';
    END IF;

    IF v_old_display_name IS DISTINCT FROM v_profile.display_name
       OR v_old_website_url IS DISTINCT FROM v_profile.website_url THEN
      UPDATE public.advertiser_creatives AS creative
      SET revision = creative.revision + 1,
          review_status = 'draft',
          delivery_status = 'paused',
          submitted_snapshot = NULL,
          approved_snapshot = NULL,
          approved_revision = NULL,
          submitted_at = NULL,
          reviewed_by = NULL,
          reviewed_at = NULL,
          review_note = NULL,
          updated_at = pg_catalog.now()
      WHERE creative.space_id = p_space_id
        AND creative.business_profile_id = p_profile_id;
    END IF;
  END IF;

  RETURN v_profile;
END;
$$;

CREATE FUNCTION public.advertiser_upsert_creative(
  p_actor_id uuid,
  p_space_id uuid,
  p_profile_id uuid,
  p_creative_id uuid,
  p_expected_revision integer,
  p_placement text,
  p_headline text,
  p_body text,
  p_cta_label text,
  p_destination_url text
)
RETURNS public.advertiser_creatives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creative public.advertiser_creatives%ROWTYPE;
BEGIN
  PERFORM public.advertiser_assert_owner(p_actor_id, p_space_id);

  IF (p_creative_id IS NULL AND p_expected_revision IS NOT NULL)
     OR (
       p_creative_id IS NOT NULL
       AND (p_expected_revision IS NULL OR p_expected_revision <= 0)
     )
     OR p_profile_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.business_profiles AS profile
       WHERE profile.id = p_profile_id
         AND profile.space_id = p_space_id
         AND profile.archived_at IS NULL
     )
     OR p_placement NOT IN ('public_quiz_lobby', 'public_quiz_results')
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_headline, ''))) NOT BETWEEN 1 AND 100
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 300
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_cta_label, ''))) NOT BETWEEN 1 AND 40
     OR p_destination_url IS NULL
     OR p_destination_url <> pg_catalog.btrim(p_destination_url)
     OR pg_catalog.char_length(p_destination_url) > 2048
     OR p_destination_url !~ '^https://[^/?#[:space:]@]+([/?][^#[:space:]]*)?$'
     OR p_destination_url ~ '[[:space:][:cntrl:]]'
     OR pg_catalog.strpos(p_destination_url, '#') > 0
     OR pg_catalog.split_part(pg_catalog.substr(p_destination_url, 9), '/', 1) ~ '@' THEN
    RAISE EXCEPTION 'advertiser_invalid_creative';
  END IF;

  IF p_creative_id IS NULL THEN
    INSERT INTO public.advertiser_creatives(
      space_id,
      business_profile_id,
      placement,
      headline,
      body,
      cta_label,
      destination_url
    ) VALUES (
      p_space_id,
      p_profile_id,
      p_placement,
      pg_catalog.btrim(p_headline),
      pg_catalog.btrim(p_body),
      pg_catalog.btrim(p_cta_label),
      p_destination_url
    )
    RETURNING * INTO v_creative;
  ELSE
    UPDATE public.advertiser_creatives AS creative
    SET business_profile_id = p_profile_id,
        placement = p_placement,
        headline = pg_catalog.btrim(p_headline),
        body = pg_catalog.btrim(p_body),
        cta_label = pg_catalog.btrim(p_cta_label),
        destination_url = p_destination_url,
        revision = creative.revision + 1,
        review_status = 'draft',
        delivery_status = 'paused',
        submitted_snapshot = NULL,
        approved_snapshot = NULL,
        approved_revision = NULL,
        submitted_at = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL,
        review_note = NULL,
        updated_at = pg_catalog.now()
    WHERE creative.id = p_creative_id
      AND creative.space_id = p_space_id
      AND creative.revision = p_expected_revision
      AND creative.review_status <> 'pending'
    RETURNING * INTO v_creative;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advertiser_revision_conflict';
    END IF;
  END IF;

  RETURN v_creative;
END;
$$;

CREATE FUNCTION public.advertiser_owner_transition(
  p_actor_id uuid,
  p_space_id uuid,
  p_creative_id uuid,
  p_expected_revision integer,
  p_action text,
  p_idempotency_key uuid
)
RETURNS public.advertiser_creatives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creative public.advertiser_creatives%ROWTYPE;
  v_profile public.business_profiles%ROWTYPE;
  v_existing public.advertiser_audit_events%ROWTYPE;
  v_event_type text;
  v_snapshot jsonb;
BEGIN
  PERFORM public.advertiser_assert_owner(p_actor_id, p_space_id);

  IF p_creative_id IS NULL
     OR p_expected_revision IS NULL
     OR p_expected_revision <= 0
     OR p_action NOT IN ('submit', 'activate', 'pause')
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'advertiser_invalid_transition';
  END IF;

  v_event_type := CASE p_action
    WHEN 'submit' THEN 'submitted'
    WHEN 'activate' THEN 'activated'
    ELSE 'paused'
  END;

  SELECT creative.*
    INTO v_creative
  FROM public.advertiser_creatives AS creative
  WHERE creative.id = p_creative_id
    AND creative.space_id = p_space_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advertiser_not_found';
  END IF;

  SELECT audit.*
    INTO v_existing
  FROM public.advertiser_audit_events AS audit
  WHERE audit.creative_id = p_creative_id
    AND audit.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.command_scope <> 'owner'
       OR v_existing.request_action <> p_action
       OR v_existing.event_type <> v_event_type
       OR v_existing.actor_user_id IS DISTINCT FROM p_actor_id
       OR v_existing.creative_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'advertiser_idempotency_conflict';
    END IF;
    RETURN v_creative;
  END IF;

  IF v_creative.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'advertiser_revision_conflict';
  END IF;

  SELECT profile.*
    INTO v_profile
  FROM public.business_profiles AS profile
  WHERE profile.id = v_creative.business_profile_id
    AND profile.space_id = p_space_id
    AND profile.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advertiser_not_found';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'advertiserName', v_profile.display_name,
    'placement', v_creative.placement,
    'headline', v_creative.headline,
    'body', v_creative.body,
    'ctaLabel', v_creative.cta_label,
    'destinationUrl', v_creative.destination_url
  );

  IF p_action = 'submit'
     AND v_creative.review_status IN ('draft', 'changes_requested', 'rejected')
     AND v_creative.delivery_status = 'paused' THEN
    UPDATE public.advertiser_creatives AS creative
    SET review_status = 'pending',
        submitted_snapshot = v_snapshot,
        submitted_at = pg_catalog.now(),
        approved_snapshot = NULL,
        approved_revision = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL,
        review_note = NULL,
        updated_at = pg_catalog.now()
    WHERE creative.id = p_creative_id
    RETURNING * INTO v_creative;
    v_snapshot := v_creative.submitted_snapshot;
  ELSIF p_action = 'activate'
        AND v_creative.review_status = 'approved'
        AND v_creative.delivery_status = 'paused'
        AND v_creative.approved_revision = v_creative.revision
        AND v_creative.approved_snapshot = v_creative.submitted_snapshot THEN
    UPDATE public.advertiser_creatives AS creative
    SET delivery_status = 'active',
        updated_at = pg_catalog.now()
    WHERE creative.id = p_creative_id
    RETURNING * INTO v_creative;
    v_snapshot := v_creative.approved_snapshot;
  ELSIF p_action = 'pause'
        AND v_creative.delivery_status = 'active' THEN
    UPDATE public.advertiser_creatives AS creative
    SET delivery_status = 'paused',
        updated_at = pg_catalog.now()
    WHERE creative.id = p_creative_id
    RETURNING * INTO v_creative;
    v_snapshot := v_creative.approved_snapshot;
  ELSE
    RAISE EXCEPTION 'advertiser_invalid_transition';
  END IF;

  INSERT INTO public.advertiser_audit_events(
    creative_id,
    creative_revision,
    command_scope,
    request_action,
    event_type,
    actor_user_id,
    idempotency_key,
    snapshot
  ) VALUES (
    p_creative_id,
    v_creative.revision,
    'owner',
    p_action,
    v_event_type,
    p_actor_id,
    p_idempotency_key,
    v_snapshot
  );

  RETURN v_creative;
END;
$$;

CREATE FUNCTION public.advertiser_admin_review(
  p_reviewer_id uuid,
  p_creative_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_note text,
  p_idempotency_key uuid
)
RETURNS public.advertiser_creatives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creative public.advertiser_creatives%ROWTYPE;
  v_existing public.advertiser_audit_events%ROWTYPE;
  v_event_type text;
  v_snapshot jsonb;
BEGIN
  IF p_reviewer_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = p_reviewer_id
     )
     OR p_creative_id IS NULL
     OR p_expected_revision IS NULL
     OR p_expected_revision <= 0
     OR p_decision NOT IN ('approved', 'changes_requested', 'rejected', 'pause')
     OR p_idempotency_key IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_note, ''))) > 500 THEN
    RAISE EXCEPTION 'advertiser_invalid_decision';
  END IF;

  v_event_type := CASE
    WHEN p_decision = 'pause' THEN 'paused'
    ELSE p_decision
  END;

  SELECT creative.*
    INTO v_creative
  FROM public.advertiser_creatives AS creative
  WHERE creative.id = p_creative_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advertiser_not_found';
  END IF;

  SELECT audit.*
    INTO v_existing
  FROM public.advertiser_audit_events AS audit
  WHERE audit.creative_id = p_creative_id
    AND audit.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.command_scope <> 'admin'
       OR v_existing.request_action <> p_decision
       OR v_existing.event_type <> v_event_type
       OR v_existing.actor_user_id IS DISTINCT FROM p_reviewer_id
       OR v_existing.creative_revision <> p_expected_revision
       OR v_existing.note IS DISTINCT FROM NULLIF(pg_catalog.btrim(p_note), '') THEN
      RAISE EXCEPTION 'advertiser_idempotency_conflict';
    END IF;
    RETURN v_creative;
  END IF;

  IF v_creative.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'advertiser_revision_conflict';
  END IF;

  IF p_decision = 'pause'
     AND v_creative.delivery_status = 'active' THEN
    UPDATE public.advertiser_creatives AS creative
    SET delivery_status = 'paused',
        updated_at = pg_catalog.now()
    WHERE creative.id = p_creative_id
    RETURNING * INTO v_creative;
    v_snapshot := v_creative.approved_snapshot;
  ELSIF p_decision <> 'pause'
        AND v_creative.review_status = 'pending'
        AND pg_catalog.jsonb_typeof(v_creative.submitted_snapshot) = 'object' THEN
    IF p_decision = 'approved' THEN
      UPDATE public.advertiser_creatives AS creative
      SET review_status = 'approved',
          delivery_status = 'paused',
          approved_snapshot = creative.submitted_snapshot,
          approved_revision = creative.revision,
          reviewed_by = p_reviewer_id,
          reviewed_at = pg_catalog.now(),
          review_note = NULLIF(pg_catalog.btrim(p_note), ''),
          updated_at = pg_catalog.now()
      WHERE creative.id = p_creative_id
      RETURNING * INTO v_creative;
      v_snapshot := v_creative.approved_snapshot;
    ELSE
      UPDATE public.advertiser_creatives AS creative
      SET review_status = p_decision,
          delivery_status = 'paused',
          approved_snapshot = NULL,
          approved_revision = NULL,
          reviewed_by = p_reviewer_id,
          reviewed_at = pg_catalog.now(),
          review_note = NULLIF(pg_catalog.btrim(p_note), ''),
          updated_at = pg_catalog.now()
      WHERE creative.id = p_creative_id
      RETURNING * INTO v_creative;
      v_snapshot := v_creative.submitted_snapshot;
    END IF;
  ELSE
    RAISE EXCEPTION 'advertiser_invalid_decision';
  END IF;

  INSERT INTO public.advertiser_audit_events(
    creative_id,
    creative_revision,
    command_scope,
    request_action,
    event_type,
    actor_user_id,
    idempotency_key,
    note,
    snapshot
  ) VALUES (
    p_creative_id,
    v_creative.revision,
    'admin',
    p_decision,
    v_event_type,
    p_reviewer_id,
    p_idempotency_key,
    NULLIF(pg_catalog.btrim(p_note), ''),
    v_snapshot
  );

  RETURN v_creative;
END;
$$;

CREATE FUNCTION public.advertiser_resolve_public(p_placement text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT creative.approved_snapshot ||
    pg_catalog.jsonb_build_object('disclosure', 'Auglýsing')
  FROM public.advertiser_creatives AS creative
  JOIN public.business_profiles AS profile
    ON profile.id = creative.business_profile_id
   AND profile.space_id = creative.space_id
  WHERE creative.placement = p_placement
    AND p_placement IN ('public_quiz_lobby', 'public_quiz_results')
    AND creative.delivery_status = 'active'
    AND creative.review_status = 'approved'
    AND creative.approved_revision = creative.revision
    AND creative.approved_snapshot = creative.submitted_snapshot
    AND pg_catalog.jsonb_typeof(creative.approved_snapshot) = 'object'
    AND profile.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.space_members AS membership
      JOIN auth.users AS auth_user ON auth_user.id = membership.user_id
      JOIN public.feature_access AS entitlement
        ON entitlement.feature_key = 'auglysandi'
       AND entitlement.email = pg_catalog.lower(pg_catalog.btrim(auth_user.email))
      WHERE membership.space_id = creative.space_id
        AND membership.role = 'owner'
    )
  LIMIT 1
$$;

CREATE FUNCTION public.advertiser_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (
       pg_catalog.to_jsonb(NEW) - 'actor_user_id'
     ) = (
       pg_catalog.to_jsonb(OLD) - 'actor_user_id'
     ) THEN
    -- Allow only the FK-driven auth-user redaction required by ON DELETE SET
    -- NULL. Browser/service roles have no table UPDATE grant.
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'advertiser_audit_immutable';
END;
$$;

CREATE TRIGGER advertiser_audit_immutable_guard
BEFORE UPDATE ON public.advertiser_audit_events
FOR EACH ROW EXECUTE FUNCTION public.advertiser_audit_immutable();

REVOKE ALL PRIVILEGES ON TABLE public.business_profiles,
  public.advertiser_creatives,
  public.advertiser_audit_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.business_profiles,
  public.advertiser_creatives,
  public.advertiser_audit_events
  TO service_role;

REVOKE ALL ON FUNCTION public.advertiser_assert_owner(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_upsert_business_profile(
  uuid, uuid, uuid, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_upsert_creative(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_owner_transition(
  uuid, uuid, uuid, integer, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_admin_review(
  uuid, uuid, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_resolve_public(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advertiser_audit_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.advertiser_upsert_business_profile(
  uuid, uuid, uuid, integer, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.advertiser_upsert_creative(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.advertiser_owner_transition(
  uuid, uuid, uuid, integer, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.advertiser_admin_review(
  uuid, uuid, integer, text, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.advertiser_resolve_public(text)
  TO service_role;

COMMIT;
