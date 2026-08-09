-- TODO #097 / SQL115: production Kviss authoring and immutable template snapshots.
-- Written for review only. Do not apply without a named-target preflight and approval.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $kviss_authoring_preconditions$
DECLARE
  v_collision text;
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.spaces') IS NULL
     OR pg_catalog.to_regclass('public.space_members') IS NULL
     OR pg_catalog.to_regprocedure('public.ensure_personal_space()') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'kviss_authoring_missing_dependency';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
      AND constraint_row.conname = 'feature_access_feature_key_check'
      AND constraint_row.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'kviss_authoring_feature_constraint_missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'kviss_authoring_owner_cannot_bypass_rls:%', current_user;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'kviss_authoring_service_role_unavailable';
  END IF;

  SELECT collision.name
    INTO v_collision
  FROM (
    SELECT target.name
    FROM (VALUES
      ('kviss_questions'),
      ('kviss_templates'),
      ('kviss_template_questions'),
      ('kviss_questions_space_active_idx'),
      ('kviss_templates_space_active_idx'),
      ('kviss_template_questions_template_idx')
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
        'kviss_assert_author',
        'kviss_upsert_question',
        'kviss_save_template',
        'kviss_archive_question'
      )
  ) AS collision
  ORDER BY collision.name
  LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'kviss_authoring_collision:%', v_collision;
  END IF;
END;
$kviss_authoring_preconditions$;

DO $feature_key$
DECLARE
  v_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(c.conbin, c.conrelid)
    INTO v_expression
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class r ON r.oid = c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND r.relname = 'feature_access'
    AND c.conname = 'feature_access_feature_key_check' AND c.contype = 'c';

  IF v_expression IS NULL THEN
    RAISE EXCEPTION 'kviss_feature_constraint_missing';
  END IF;
  IF pg_catalog.strpos(v_expression, pg_catalog.quote_literal('kviss')) = 0 THEN
    ALTER TABLE public.feature_access DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
      v_expression, 'kviss'
    );
  END IF;
END;
$feature_key$;

CREATE TABLE public.kviss_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  created_by uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  question_text text NOT NULL CHECK (
    question_text = btrim(question_text) AND char_length(question_text) BETWEEN 1 AND 500
  ),
  options jsonb NOT NULL CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 4
  ),
  correct_option_indices integer[] NOT NULL CHECK (
    cardinality(correct_option_indices) BETWEEN 1 AND 4
  ),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 5 AND 600),
  point_weight integer NOT NULL CHECK (point_weight BETWEEN 1 AND 100),
  confidence_mode boolean NOT NULL DEFAULT false,
  labels text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(labels) <= 8),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_questions_space_fk
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE,
  CONSTRAINT kviss_questions_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (space_id, id),
  UNIQUE (space_id, id, revision)
);

CREATE TABLE public.kviss_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  created_by uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 160),
  team_names text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(team_names) <= 20),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_templates_space_fk
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE,
  CONSTRAINT kviss_templates_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (space_id, id),
  UNIQUE (space_id, id, revision)
);

CREATE TABLE public.kviss_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  template_id uuid NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  source_question_id uuid,
  source_question_revision integer CHECK (source_question_revision > 0),
  question_text text NOT NULL CHECK (
    question_text = btrim(question_text) AND char_length(question_text) BETWEEN 1 AND 500
  ),
  options jsonb NOT NULL CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 4
  ),
  correct_option_indices integer[] NOT NULL CHECK (cardinality(correct_option_indices) BETWEEN 1 AND 4),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 5 AND 600),
  point_weight integer NOT NULL CHECK (point_weight BETWEEN 1 AND 100),
  confidence_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, sort_order),
  CONSTRAINT kviss_template_questions_template_fk
    FOREIGN KEY (space_id, template_id)
    REFERENCES public.kviss_templates(space_id, id) ON DELETE CASCADE,
  CONSTRAINT kviss_template_questions_source_pair_check CHECK (
    (source_question_id IS NULL AND source_question_revision IS NULL)
    OR (source_question_id IS NOT NULL AND source_question_revision IS NOT NULL)
  )
);

CREATE INDEX kviss_questions_space_active_idx
  ON public.kviss_questions(space_id, sort_order, id) WHERE archived_at IS NULL;
CREATE INDEX kviss_templates_space_active_idx
  ON public.kviss_templates(space_id, updated_at DESC, id) WHERE archived_at IS NULL;
CREATE INDEX kviss_template_questions_template_idx
  ON public.kviss_template_questions(template_id, sort_order);

ALTER TABLE public.kviss_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_template_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_template_questions FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.kviss_assert_author(p_actor_id uuid, p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.space_members m
    WHERE m.space_id = p_space_id AND m.user_id = p_actor_id AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u WHERE u.id = p_actor_id;
  IF v_email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.feature_access f
    WHERE f.feature_key = 'kviss' AND f.email = v_email
  ) THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
END;
$$;

CREATE FUNCTION public.kviss_upsert_question(
  p_actor_id uuid,
  p_space_id uuid,
  p_question_id uuid,
  p_expected_revision integer,
  p_question_text text,
  p_options jsonb,
  p_correct_option_indices integer[],
  p_duration_seconds integer,
  p_point_weight integer,
  p_confidence_mode boolean,
  p_labels text[],
  p_sort_order integer
)
RETURNS public.kviss_questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.kviss_questions%ROWTYPE;
  v_option_count integer;
BEGIN
  PERFORM public.kviss_assert_author(p_actor_id, p_space_id);
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN
    RAISE EXCEPTION 'kviss_invalid_question';
  END IF;
  v_option_count := jsonb_array_length(p_options);

  IF p_question_text IS NULL OR char_length(btrim(p_question_text)) NOT BETWEEN 1 AND 500
     OR v_option_count NOT BETWEEN 2 AND 4
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_options) AS option_row(value)
       WHERE jsonb_typeof(option_row.value) <> 'string'
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(p_options) AS option_row(value)
       WHERE option_row.value <> btrim(option_row.value)
          OR char_length(option_row.value) NOT BETWEEN 1 AND 300
     )
     OR p_correct_option_indices IS NULL
     OR cardinality(p_correct_option_indices) NOT BETWEEN 1 AND v_option_count
     OR EXISTS (
       SELECT 1 FROM unnest(p_correct_option_indices) AS selected(index_value)
       WHERE selected.index_value IS NULL
          OR selected.index_value < 0
          OR selected.index_value >= v_option_count
     )
     OR cardinality(p_correct_option_indices) <> cardinality(ARRAY(SELECT DISTINCT idx FROM unnest(p_correct_option_indices) idx))
     OR p_duration_seconds IS NULL OR p_duration_seconds NOT BETWEEN 5 AND 600
     OR p_point_weight IS NULL OR p_point_weight NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_labels), 0) > 8
     OR EXISTS (
       SELECT 1
       FROM unnest(coalesce(p_labels, '{}'::text[])) AS label_row(value)
       WHERE label_row.value IS NULL
          OR label_row.value <> btrim(label_row.value)
          OR char_length(label_row.value) NOT BETWEEN 1 AND 40
     )
     OR p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'kviss_invalid_question';
  END IF;

  IF p_question_id IS NULL THEN
    INSERT INTO public.kviss_questions (
      space_id, created_by, question_text, options, correct_option_indices,
      duration_seconds, point_weight, confidence_mode, labels, sort_order
    ) VALUES (
      p_space_id, p_actor_id, btrim(p_question_text), p_options,
      p_correct_option_indices, p_duration_seconds, p_point_weight,
      coalesce(p_confidence_mode, false), coalesce(p_labels, '{}'::text[]), p_sort_order
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.kviss_questions q
    SET question_text = btrim(p_question_text), options = p_options,
        correct_option_indices = p_correct_option_indices,
        duration_seconds = p_duration_seconds, point_weight = p_point_weight,
        confidence_mode = coalesce(p_confidence_mode, false),
        labels = coalesce(p_labels, '{}'::text[]), sort_order = p_sort_order,
        revision = q.revision + 1, updated_at = now()
    WHERE q.id = p_question_id AND q.space_id = p_space_id
      AND q.revision = p_expected_revision AND q.archived_at IS NULL
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'kviss_revision_conflict'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.kviss_save_template(
  p_actor_id uuid,
  p_space_id uuid,
  p_template_id uuid,
  p_expected_revision integer,
  p_title text,
  p_team_names text[],
  p_questions jsonb
)
RETURNS public.kviss_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.kviss_templates%ROWTYPE;
  v_item jsonb;
  v_index integer := 0;
  v_source public.kviss_questions%ROWTYPE;
BEGIN
  PERFORM public.kviss_assert_author(p_actor_id, p_space_id);
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'kviss_invalid_template';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 160
     OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 200
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_questions) AS question_row(value)
       WHERE jsonb_typeof(question_row.value) <> 'object'
     )
     OR coalesce(cardinality(p_team_names), 0) > 20
     OR EXISTS (
       SELECT 1
       FROM unnest(coalesce(p_team_names, '{}'::text[])) AS team_row(value)
       WHERE team_row.value IS NULL
          OR team_row.value <> btrim(team_row.value)
          OR char_length(team_row.value) NOT BETWEEN 1 AND 60
     ) THEN
    RAISE EXCEPTION 'kviss_invalid_template';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.kviss_templates(space_id, created_by, title, team_names)
    VALUES (p_space_id, p_actor_id, btrim(p_title), coalesce(p_team_names, '{}'::text[]))
    RETURNING * INTO v_template;
  ELSE
    UPDATE public.kviss_templates t
    SET title = btrim(p_title), team_names = coalesce(p_team_names, '{}'::text[]),
        revision = t.revision + 1, updated_at = now()
    WHERE t.id = p_template_id AND t.space_id = p_space_id
      AND t.revision = p_expected_revision AND t.archived_at IS NULL
    RETURNING * INTO v_template;
    IF v_template.id IS NULL THEN RAISE EXCEPTION 'kviss_revision_conflict'; END IF;
    DELETE FROM public.kviss_template_questions tq
    WHERE tq.space_id = p_space_id AND tq.template_id = p_template_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_questions)
  LOOP
    IF (v_item->>'sourceQuestionId') IS NULL OR (v_item->>'sourceQuestionRevision') IS NULL THEN
      RAISE EXCEPTION 'kviss_source_required';
    END IF;
    SELECT * INTO v_source
    FROM public.kviss_questions q
    WHERE q.id = (v_item->>'sourceQuestionId')::uuid
      AND q.space_id = p_space_id AND q.archived_at IS NULL;
    IF v_source.id IS NULL THEN RAISE EXCEPTION 'kviss_source_not_found'; END IF;
    IF v_source.revision <> (v_item->>'sourceQuestionRevision')::integer THEN
      RAISE EXCEPTION 'kviss_revision_conflict';
    END IF;

    INSERT INTO public.kviss_template_questions (
      id, space_id, template_id, sort_order, source_question_id,
      source_question_revision, question_text, options, correct_option_indices,
      duration_seconds, point_weight, confidence_mode
    ) VALUES (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()), p_space_id,
      v_template.id, v_index, v_source.id, v_source.revision,
      v_source.question_text, v_source.options, v_source.correct_option_indices,
      v_source.duration_seconds, v_source.point_weight, v_source.confidence_mode
    );
    v_index := v_index + 1;
  END LOOP;
  RETURN v_template;
END;
$$;

CREATE FUNCTION public.kviss_archive_question(
  p_actor_id uuid, p_space_id uuid, p_question_id uuid, p_expected_revision integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.kviss_assert_author(p_actor_id, p_space_id);
  UPDATE public.kviss_questions q
  SET archived_at = now(), updated_at = now(), revision = q.revision + 1
  WHERE q.id = p_question_id AND q.space_id = p_space_id
    AND q.revision = p_expected_revision AND q.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'kviss_revision_conflict'; END IF;
END;
$$;

REVOKE ALL ON TABLE public.kviss_questions, public.kviss_templates,
  public.kviss_template_questions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.kviss_questions,
  public.kviss_templates, public.kviss_template_questions TO service_role;

REVOKE ALL ON FUNCTION public.kviss_assert_author(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_upsert_question(uuid, uuid, uuid, integer, text, jsonb, integer[], integer, integer, boolean, text[], integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_save_template(uuid, uuid, uuid, integer, text, text[], jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_archive_question(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kviss_upsert_question(uuid, uuid, uuid, integer, text, jsonb, integer[], integer, integer, boolean, text[], integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_save_template(uuid, uuid, uuid, integer, text, text[], jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_archive_question(uuid, uuid, uuid, integer) TO service_role;

COMMIT;
