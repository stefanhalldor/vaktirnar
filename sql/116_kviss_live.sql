-- TODO #097 / SQL116: server-authoritative public Kviss sessions.
-- Written for review only. Depends on SQL115. Never exposes base tables to browsers.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $kviss_live_preconditions$
DECLARE
  v_collision text;
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.kviss_templates') IS NULL
     OR pg_catalog.to_regclass('public.kviss_template_questions') IS NULL
     OR pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR pg_catalog.to_regprocedure('extensions.crypt(text,text)') IS NULL
     OR pg_catalog.to_regprocedure('extensions.gen_salt(text,integer)') IS NULL
     OR pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'kviss_live_missing_dependency';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = required.role_name
    )
  ) THEN
    RAISE EXCEPTION 'kviss_live_missing_role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'kviss_live_owner_cannot_bypass_rls:%', current_user;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'kviss_live_service_role_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('kviss_templates', 'kviss_template_questions')
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (
      pg_catalog.to_regclass('public.kviss_templates'),
      pg_catalog.to_regclass('public.kviss_template_questions')
    )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)')
      AND procedure.proowner = pg_catalog.to_regrole(current_user)
      AND procedure.prosecdef
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) OR (
    SELECT pg_catalog.count(*) <> 2
       OR pg_catalog.count(*) FILTER (WHERE privilege.privilege_type = 'SELECT') <> 2
       OR pg_catalog.count(*) FILTER (WHERE privilege.privilege_type <> 'SELECT') <> 0
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
      AND privilege.grantee = 'service_role'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) OR EXISTS (
    SELECT 1 FROM information_schema.column_privileges AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)')
      AND COALESCE(role.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'kviss_live_authoring_contract_invalid';
  END IF;

  SELECT collision.name INTO v_collision
  FROM (
    SELECT target.name
    FROM (VALUES
      ('kviss_sessions'),
      ('kviss_sessions_pkey'),
      ('kviss_sessions_join_code_key'),
      ('kviss_sessions_broadcast_topic_key'),
      ('kviss_sessions_space_id_id_key'),
      ('kviss_session_questions'),
      ('kviss_session_questions_pkey'),
      ('kviss_session_questions_session_id_sort_order_key'),
      ('kviss_session_questions_session_id_id_key'),
      ('kviss_participants'),
      ('kviss_participants_pkey'),
      ('kviss_participants_capability_digest_key'),
      ('kviss_participants_session_id_id_key'),
      ('kviss_answers'),
      ('kviss_answers_pkey'),
      ('kviss_answers_participant_id_activation_id_key'),
      ('kviss_answers_participant_id_command_id_key'),
      ('kviss_session_messages'),
      ('kviss_session_messages_pkey'),
      ('kviss_session_messages_participant_id_client_message_id_key'),
      ('kviss_session_commands'),
      ('kviss_session_commands_pkey'),
      ('kviss_join_attempts'),
      ('kviss_join_attempts_pkey'),
      ('kviss_join_attempts_id_seq'),
      ('kviss_sessions_space_created_idx'),
      ('kviss_session_questions_order_idx'),
      ('kviss_participants_session_joined_idx'),
      ('kviss_answers_session_question_idx'),
      ('kviss_messages_session_created_idx'),
      ('kviss_join_attempts_scope_time_idx'),
      ('kviss_join_attempts_time_idx')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL

    UNION ALL

    SELECT procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'kviss_create_session',
        'kviss_join_session',
        'kviss_host_command',
        'kviss_answer_question',
        'kviss_send_message',
        'kviss_touch_participant'
      )
  ) AS collision
  ORDER BY collision.name
  LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'kviss_live_collision:%', v_collision;
  END IF;
END;
$kviss_live_preconditions$;

CREATE TABLE public.kviss_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_revision integer NOT NULL CHECK (template_revision > 0),
  created_by uuid NOT NULL,
  join_code text NOT NULL UNIQUE CHECK (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'question', 'reveal', 'leaderboard', 'ended')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  active_question_id uuid,
  activation_id uuid,
  question_started_at timestamptz,
  password_hash text,
  broadcast_topic text NOT NULL UNIQUE CHECK (broadcast_topic ~ '^[A-Za-z0-9_-]{43}$'),
  team_names text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(team_names) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT kviss_sessions_created_by_fk FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT kviss_sessions_template_fk FOREIGN KEY (space_id, template_id)
    REFERENCES public.kviss_templates(space_id, id) ON DELETE CASCADE,
  UNIQUE (space_id, id)
);

CREATE TABLE public.kviss_session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  source_template_question_id uuid NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  question_text text NOT NULL,
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 4),
  correct_option_indices integer[] NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 5 AND 600),
  point_weight integer NOT NULL CHECK (point_weight BETWEEN 1 AND 100),
  confidence_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_session_questions_session_fk FOREIGN KEY (session_id)
    REFERENCES public.kviss_sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, sort_order),
  UNIQUE (session_id, id)
);

ALTER TABLE public.kviss_sessions
  ADD CONSTRAINT kviss_sessions_active_question_fk
  FOREIGN KEY (id, active_question_id)
  REFERENCES public.kviss_session_questions(session_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.kviss_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  nickname text NOT NULL CHECK (nickname = btrim(nickname) AND char_length(nickname) BETWEEN 1 AND 40),
  team_index integer CHECK (team_index >= 0),
  capability_digest text NOT NULL UNIQUE CHECK (capability_digest ~ '^[a-f0-9]{64}$'),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_participants_session_fk FOREIGN KEY (session_id)
    REFERENCES public.kviss_sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, id)
);

CREATE TABLE public.kviss_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  question_id uuid NOT NULL,
  activation_id uuid NOT NULL,
  selected_option integer NOT NULL CHECK (selected_option >= 0),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  CONSTRAINT kviss_answers_participant_fk FOREIGN KEY (session_id, participant_id)
    REFERENCES public.kviss_participants(session_id, id) ON DELETE CASCADE,
  CONSTRAINT kviss_answers_question_fk FOREIGN KEY (session_id, question_id)
    REFERENCES public.kviss_session_questions(session_id, id) ON DELETE CASCADE,
  UNIQUE (participant_id, activation_id),
  UNIQUE (participant_id, command_id)
);

CREATE TABLE public.kviss_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  client_message_id uuid NOT NULL,
  body text NOT NULL CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_messages_participant_fk FOREIGN KEY (session_id, participant_id)
    REFERENCES public.kviss_participants(session_id, id) ON DELETE CASCADE,
  UNIQUE (participant_id, client_message_id)
);

CREATE TABLE public.kviss_session_commands (
  session_id uuid NOT NULL,
  command_id uuid NOT NULL,
  actor_user_id uuid,
  command_type text NOT NULL,
  question_id uuid,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kviss_session_commands_session_fk FOREIGN KEY (session_id)
    REFERENCES public.kviss_sessions(id) ON DELETE CASCADE,
  CONSTRAINT kviss_session_commands_actor_fk FOREIGN KEY (actor_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, command_id)
);

CREATE TABLE public.kviss_join_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  join_code text NOT NULL,
  actor_scope_hash text NOT NULL CHECK (char_length(actor_scope_hash) = 64),
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kviss_sessions_space_created_idx ON public.kviss_sessions(space_id, created_at DESC);
CREATE INDEX kviss_session_questions_order_idx ON public.kviss_session_questions(session_id, sort_order);
CREATE INDEX kviss_participants_session_joined_idx ON public.kviss_participants(session_id, joined_at, id) WHERE revoked_at IS NULL;
CREATE INDEX kviss_answers_session_question_idx ON public.kviss_answers(session_id, question_id, answered_at, id);
CREATE INDEX kviss_messages_session_created_idx ON public.kviss_session_messages(session_id, created_at, id);
CREATE INDEX kviss_join_attempts_scope_time_idx ON public.kviss_join_attempts(join_code, actor_scope_hash, attempted_at DESC);
CREATE INDEX kviss_join_attempts_time_idx ON public.kviss_join_attempts(attempted_at, id);

ALTER TABLE public.kviss_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_session_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_join_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kviss_join_attempts FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.kviss_create_session(
  p_actor_id uuid,
  p_space_id uuid,
  p_template_id uuid,
  p_password text,
  p_broadcast_topic text
)
RETURNS public.kviss_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.kviss_templates%ROWTYPE;
  v_session public.kviss_sessions%ROWTYPE;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt integer;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL OR p_template_id IS NULL THEN
    RAISE EXCEPTION 'kviss_invalid_request';
  END IF;
  PERFORM public.kviss_assert_author(p_actor_id, p_space_id);
  SELECT * INTO v_template FROM public.kviss_templates t
  WHERE t.id = p_template_id AND t.space_id = p_space_id AND t.archived_at IS NULL
  FOR SHARE;
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'kviss_not_found'; END IF;
  IF p_password IS NOT NULL
     AND (char_length(p_password) < 4 OR octet_length(p_password) > 72) THEN
    RAISE EXCEPTION 'kviss_invalid_password';
  END IF;
  IF p_broadcast_topic IS NULL OR p_broadcast_topic !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'kviss_invalid_topic';
  END IF;

  FOR v_attempt IN 1..30 LOOP
    SELECT string_agg(substr(v_alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % char_length(v_alphabet)), 1), '')
      INTO v_code FROM generate_series(1, 6);
    INSERT INTO public.kviss_sessions (
        space_id, template_id, template_revision, created_by, join_code,
        title, password_hash, broadcast_topic, team_names
      ) VALUES (
        p_space_id, v_template.id, v_template.revision, p_actor_id, v_code,
        v_template.title,
        CASE WHEN p_password IS NULL THEN NULL ELSE extensions.crypt(p_password, extensions.gen_salt('bf', 10)) END,
        p_broadcast_topic, v_template.team_names
      )
      ON CONFLICT (join_code) DO NOTHING
      RETURNING * INTO v_session;
    IF v_session.id IS NOT NULL THEN EXIT; END IF;
  END LOOP;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'kviss_join_code_exhausted'; END IF;

  INSERT INTO public.kviss_session_questions (
    session_id, source_template_question_id, sort_order, question_text, options,
    correct_option_indices, duration_seconds, point_weight, confidence_mode
  )
  SELECT v_session.id, tq.id, tq.sort_order, tq.question_text, tq.options,
    tq.correct_option_indices, tq.duration_seconds, tq.point_weight, tq.confidence_mode
  FROM public.kviss_template_questions tq
  WHERE tq.template_id = v_template.id AND tq.space_id = p_space_id
  ORDER BY tq.sort_order;

  IF NOT FOUND THEN RAISE EXCEPTION 'kviss_empty_template'; END IF;
  RETURN v_session;
END;
$$;

CREATE FUNCTION public.kviss_join_session(
  p_join_code text,
  p_nickname text,
  p_password text,
  p_capability_digest text,
  p_actor_scope_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text := upper(btrim(p_join_code));
  v_session public.kviss_sessions%ROWTYPE;
  v_participant public.kviss_participants%ROWTYPE;
  v_failed integer;
  v_team_count integer;
BEGIN
  IF p_join_code IS NULL OR v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
     OR p_nickname IS NULL OR char_length(btrim(p_nickname)) NOT BETWEEN 1 AND 40
     OR p_capability_digest IS NULL OR p_capability_digest !~ '^[a-f0-9]{64}$'
     OR p_actor_scope_hash IS NULL OR p_actor_scope_hash !~ '^[a-f0-9]{64}$'
     OR octet_length(coalesce(p_password, '')) > 72 THEN
    RAISE EXCEPTION 'kviss_join_failed';
  END IF;

  SELECT * INTO v_session FROM public.kviss_sessions s
  WHERE s.join_code = v_code AND s.status <> 'ended' FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'kviss_join_failed'; END IF;

  -- Opportunistic retention is globally bounded so one public join never
  -- turns into an unbounded delete while the live session row is locked.
  DELETE FROM public.kviss_join_attempts
  WHERE id IN (
    SELECT id FROM public.kviss_join_attempts
    WHERE attempted_at < now() - interval '7 days'
    ORDER BY attempted_at, id
    LIMIT 1000
  );
  IF (SELECT count(*) FROM public.kviss_participants p WHERE p.session_id = v_session.id AND p.revoked_at IS NULL) >= 500 THEN
    RETURN jsonb_build_object('error', 'join_failed');
  END IF;

  SELECT count(*) INTO v_failed FROM public.kviss_join_attempts a
  WHERE a.join_code = v_code AND a.actor_scope_hash = p_actor_scope_hash
    AND NOT a.succeeded AND a.attempted_at > now() - interval '15 minutes';
  IF v_failed >= 8 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  IF v_session.password_hash IS NOT NULL
     AND (p_password IS NULL OR extensions.crypt(p_password, v_session.password_hash) <> v_session.password_hash) THEN
    INSERT INTO public.kviss_join_attempts(join_code, actor_scope_hash, succeeded)
    VALUES (v_code, p_actor_scope_hash, false);
    -- Return a generic sentinel instead of raising: raising would roll back the
    -- failed-attempt row and silently disable the rate limit.
    RETURN jsonb_build_object('error', 'join_failed');
  END IF;

  v_team_count := coalesce(cardinality(v_session.team_names), 0);
  INSERT INTO public.kviss_participants (
    session_id, nickname, team_index, capability_digest, expires_at
  ) VALUES (
    v_session.id, btrim(p_nickname),
    CASE WHEN v_team_count = 0 THEN NULL ELSE (
      SELECT candidate.team_index
      FROM generate_series(0, v_team_count - 1) AS candidate(team_index)
      LEFT JOIN LATERAL (
        SELECT count(*) AS member_count FROM public.kviss_participants p
        WHERE p.session_id = v_session.id AND p.team_index = candidate.team_index AND p.revoked_at IS NULL
      ) counts ON true
      ORDER BY counts.member_count, candidate.team_index LIMIT 1
    ) END,
    p_capability_digest, now() + interval '30 days'
  ) RETURNING * INTO v_participant;

  INSERT INTO public.kviss_join_attempts(join_code, actor_scope_hash, succeeded)
  VALUES (v_code, p_actor_scope_hash, true);
  UPDATE public.kviss_sessions SET revision = revision + 1, updated_at = now() WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'participantId', v_participant.id,
    'sessionId', v_session.id,
    'joinCode', v_session.join_code
  );
END;
$$;

CREATE FUNCTION public.kviss_host_command(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_command_id uuid,
  p_command_type text,
  p_question_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.kviss_sessions%ROWTYPE;
  v_existing bigint;
  v_existing_type text;
  v_existing_question_id uuid;
  v_new_status text;
  v_activation uuid;
  v_requested_question_id uuid := p_question_id;
BEGIN
  IF p_actor_id IS NULL OR p_session_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision <= 0
     OR p_command_id IS NULL OR p_command_type IS NULL
     OR (p_command_type = 'activate_question' AND p_question_id IS NULL)
     OR (p_command_type <> 'activate_question' AND p_question_id IS NOT NULL) THEN
    RAISE EXCEPTION 'kviss_invalid_command';
  END IF;
  SELECT * INTO v_session FROM public.kviss_sessions s
  WHERE s.id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'kviss_not_found'; END IF;
  PERFORM public.kviss_assert_author(p_actor_id, v_session.space_id);

  -- Recheck idempotency after taking the session lock. Concurrent retries of
  -- the same command then return the first result instead of a false revision
  -- conflict, while a reused key with different input fails closed.
  SELECT resulting_revision, command_type, question_id
    INTO v_existing, v_existing_type, v_existing_question_id
  FROM public.kviss_session_commands c
  WHERE c.session_id = p_session_id AND c.command_id = p_command_id;
  IF v_existing IS NOT NULL THEN
    IF v_existing_type <> p_command_type
       OR v_existing_question_id IS DISTINCT FROM v_requested_question_id THEN
      RAISE EXCEPTION 'kviss_idempotency_conflict';
    END IF;
    RETURN v_existing;
  END IF;

  IF v_session.revision <> p_expected_revision THEN RAISE EXCEPTION 'kviss_revision_conflict'; END IF;

  IF p_command_type = 'activate_question' THEN
    IF v_session.status NOT IN ('lobby', 'reveal', 'leaderboard') OR NOT EXISTS (
      SELECT 1 FROM public.kviss_session_questions q WHERE q.session_id = p_session_id AND q.id = p_question_id
    ) THEN RAISE EXCEPTION 'kviss_invalid_transition'; END IF;
    v_new_status := 'question'; v_activation := gen_random_uuid();
  ELSIF p_command_type = 'reveal' THEN
    IF v_session.status <> 'question' THEN RAISE EXCEPTION 'kviss_invalid_transition'; END IF;
    v_new_status := 'reveal'; v_activation := v_session.activation_id; p_question_id := v_session.active_question_id;
  ELSIF p_command_type = 'leaderboard' THEN
    IF v_session.status <> 'reveal' THEN RAISE EXCEPTION 'kviss_invalid_transition'; END IF;
    v_new_status := 'leaderboard'; v_activation := NULL; p_question_id := NULL;
  ELSIF p_command_type = 'end' THEN
    IF v_session.status = 'ended' THEN RAISE EXCEPTION 'kviss_invalid_transition'; END IF;
    v_new_status := 'ended'; v_activation := NULL; p_question_id := NULL;
  ELSE
    RAISE EXCEPTION 'kviss_invalid_command';
  END IF;

  UPDATE public.kviss_sessions s SET status = v_new_status,
    active_question_id = p_question_id, activation_id = v_activation,
    question_started_at = CASE WHEN v_new_status = 'question' THEN now() ELSE NULL END,
    revision = s.revision + 1, updated_at = now(),
    ended_at = CASE WHEN v_new_status = 'ended' THEN now() ELSE s.ended_at END
  WHERE s.id = p_session_id RETURNING revision INTO v_existing;
  INSERT INTO public.kviss_session_commands(
    session_id, command_id, actor_user_id, command_type, question_id, resulting_revision
  ) VALUES (
    p_session_id, p_command_id, p_actor_id, p_command_type, v_requested_question_id, v_existing
  );
  RETURN v_existing;
END;
$$;

CREATE FUNCTION public.kviss_answer_question(
  p_capability_digest text,
  p_question_id uuid,
  p_selected_option integer,
  p_command_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_participant public.kviss_participants%ROWTYPE;
  v_session public.kviss_sessions%ROWTYPE;
  v_question public.kviss_session_questions%ROWTYPE;
  v_answer public.kviss_answers%ROWTYPE;
BEGIN
  IF p_capability_digest IS NULL OR p_capability_digest !~ '^[a-f0-9]{64}$'
     OR p_question_id IS NULL OR p_selected_option IS NULL
     OR p_selected_option < 0 OR p_selected_option > 3
     OR p_command_id IS NULL THEN
    RAISE EXCEPTION 'kviss_invalid_answer';
  END IF;
  SELECT * INTO v_participant FROM public.kviss_participants p
  WHERE p.capability_digest = p_capability_digest AND p.revoked_at IS NULL
    AND p.expires_at > now() FOR UPDATE;
  IF v_participant.id IS NULL THEN RAISE EXCEPTION 'kviss_not_found'; END IF;
  SELECT * INTO v_answer FROM public.kviss_answers a
  WHERE a.participant_id = v_participant.id AND a.command_id = p_command_id;
  IF v_answer.id IS NOT NULL THEN
    IF v_answer.question_id <> p_question_id OR v_answer.selected_option <> p_selected_option THEN
      RAISE EXCEPTION 'kviss_idempotency_conflict';
    END IF;
    RETURN jsonb_build_object('answerId', v_answer.id, 'selectedOption', v_answer.selected_option, 'answeredAt', v_answer.answered_at);
  END IF;
  SELECT * INTO v_session FROM public.kviss_sessions s
  WHERE s.id = v_participant.session_id FOR UPDATE;
  IF v_session.status <> 'question' OR v_session.active_question_id <> p_question_id THEN
    RAISE EXCEPTION 'kviss_invalid_transition';
  END IF;
  SELECT * INTO v_question FROM public.kviss_session_questions q
  WHERE q.session_id = v_session.id AND q.id = p_question_id;
  IF v_session.question_started_at IS NULL
     OR now() >= v_session.question_started_at + make_interval(secs => v_question.duration_seconds) THEN
    RAISE EXCEPTION 'kviss_answer_locked';
  END IF;
  IF p_selected_option < 0 OR p_selected_option >= jsonb_array_length(v_question.options) THEN
    RAISE EXCEPTION 'kviss_invalid_answer';
  END IF;

  INSERT INTO public.kviss_answers (
    session_id, participant_id, question_id, activation_id, selected_option,
    is_correct, answered_at, command_id
  ) VALUES (
    v_session.id, v_participant.id, v_question.id, v_session.activation_id,
    p_selected_option, p_selected_option = ANY(v_question.correct_option_indices), now(), p_command_id
  ) RETURNING * INTO v_answer;
  UPDATE public.kviss_participants SET last_seen_at = now() WHERE id = v_participant.id;
  RETURN jsonb_build_object('answerId', v_answer.id, 'selectedOption', v_answer.selected_option, 'answeredAt', v_answer.answered_at);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'kviss_answer_locked';
END;
$$;

CREATE FUNCTION public.kviss_send_message(
  p_capability_digest text,
  p_client_message_id uuid,
  p_body text
)
RETURNS public.kviss_session_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_participant public.kviss_participants%ROWTYPE;
  v_message public.kviss_session_messages%ROWTYPE;
BEGIN
  IF p_capability_digest IS NULL OR p_capability_digest !~ '^[a-f0-9]{64}$'
     OR p_client_message_id IS NULL
     OR char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
  SELECT * INTO v_participant FROM public.kviss_participants p
  WHERE p.capability_digest = p_capability_digest AND p.revoked_at IS NULL
    AND p.expires_at > now() FOR UPDATE;
  IF v_participant.id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.kviss_sessions s WHERE s.id = v_participant.session_id AND s.status <> 'ended') THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
  SELECT * INTO v_message FROM public.kviss_session_messages m
  WHERE m.participant_id = v_participant.id AND m.client_message_id = p_client_message_id;
  IF v_message.id IS NOT NULL THEN
    IF v_message.body <> btrim(p_body) THEN RAISE EXCEPTION 'kviss_idempotency_conflict'; END IF;
    RETURN v_message;
  END IF;
  IF (SELECT count(*) FROM public.kviss_session_messages m
      WHERE m.participant_id = v_participant.id AND m.created_at > now() - interval '1 minute') >= 10
     OR (SELECT count(*) FROM public.kviss_session_messages m WHERE m.session_id = v_participant.session_id) >= 10000 THEN
    RAISE EXCEPTION 'kviss_chat_rate_limited';
  END IF;
  INSERT INTO public.kviss_session_messages(session_id, participant_id, client_message_id, body)
  VALUES (v_participant.session_id, v_participant.id, p_client_message_id, btrim(p_body))
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

CREATE FUNCTION public.kviss_touch_participant(
  p_capability_digest text,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_capability_digest IS NULL OR p_capability_digest !~ '^[a-f0-9]{64}$'
     OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'kviss_not_found';
  END IF;
  UPDATE public.kviss_participants AS participant
  SET last_seen_at = now()
  WHERE participant.capability_digest = p_capability_digest
    AND participant.session_id = p_session_id
    AND participant.revoked_at IS NULL
    AND participant.expires_at > now()
    AND participant.last_seen_at < now() - interval '30 seconds';
END;
$$;

REVOKE ALL ON TABLE public.kviss_sessions, public.kviss_session_questions,
  public.kviss_participants, public.kviss_answers, public.kviss_session_messages,
  public.kviss_session_commands, public.kviss_join_attempts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.kviss_sessions,
  public.kviss_session_questions, public.kviss_participants, public.kviss_answers,
  public.kviss_session_messages, public.kviss_session_commands, public.kviss_join_attempts
  TO service_role;
REVOKE ALL ON SEQUENCE public.kviss_join_attempts_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.kviss_create_session(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_join_session(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_host_command(uuid, uuid, bigint, uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_answer_question(text, uuid, integer, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_send_message(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kviss_touch_participant(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kviss_create_session(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_join_session(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_host_command(uuid, uuid, bigint, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_answer_question(text, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_send_message(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kviss_touch_participant(text, uuid) TO service_role;

COMMIT;
