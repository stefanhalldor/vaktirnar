-- Migration 95: provider-neutral, tenant-scoped AI coding collaboration.
--
-- Phase 1 is deliberately limited to read-only agent replies. Ordinary chat
-- text cannot grant filesystem, Git, deployment, SQL, secret or other action
-- authority. A later, separately approved phase must model actions and
-- approvals explicitly rather than inferring authority from message text.
--
-- Tenant boundary: existing public.spaces + public.space_members (sql/29).
-- Browser access: narrow SECURITY DEFINER RPCs which derive auth.uid().
-- Connector access: service_role-only RPCs with hashed, expiring credentials.
-- Direct table access: service_role only; RLS default-deny for clients.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi runs it only
-- after a separate review and explicit migration approval.

BEGIN;

-- Private-beta entitlement. This migration is not yet applied, so the feature
-- key is added here rather than in a follow-up migration. The global runtime
-- switch is only an emergency kill switch; every user and connector also
-- requires this server-managed feature_access row.
ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN (
    'umonnun',
    'tengsl',
    'facebook-oauth',
    'vedrid',
    'ferdalagid',
    'elta-vedrid',
    'weather-provider-vedurstofan',
    'weather-pulse',
    'weather-provider-vegagerdin',
    'road-intelligence-v1',
    'teskeid-routing-v1',
    'agent-collaboration-private-beta'
  ));

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid        NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  slug            text        NOT NULL DEFAULT 'coding-agent',
  title           text        NOT NULL DEFAULT 'AI coding collaboration',
  status          text        NOT NULL DEFAULT 'active',
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  message_count   integer     NOT NULL DEFAULT 0,

  CONSTRAINT teskeid_agent_conversations_space_id_id_unique
    UNIQUE (space_id, id),
  CONSTRAINT teskeid_agent_conversations_space_slug_unique
    UNIQUE (space_id, slug),
  CONSTRAINT teskeid_agent_conversations_slug_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  CONSTRAINT teskeid_agent_conversations_title_check
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  CONSTRAINT teskeid_agent_conversations_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT teskeid_agent_conversations_message_count_check
    CHECK (message_count >= 0)
);

-- ---------------------------------------------------------------------------
-- One-time pairing sessions. Only HMAC hashes are persisted.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_pairing_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid        NOT NULL,
  conversation_id uuid        NOT NULL,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash       text        NOT NULL,
  provider_type   text        NOT NULL,
  connector_name  text        NOT NULL,
  policy          text        NOT NULL DEFAULT 'read_only_reply',
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_agent_pairing_sessions_space_id_id_unique
    UNIQUE (space_id, id),
  CONSTRAINT teskeid_agent_pairing_sessions_space_conversation_id_unique
    UNIQUE (space_id, conversation_id, id),
  CONSTRAINT teskeid_agent_pairing_sessions_code_hash_unique
    UNIQUE (code_hash),
  CONSTRAINT teskeid_agent_pairing_sessions_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_pairing_sessions_code_hash_check
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT teskeid_agent_pairing_sessions_provider_check
    CHECK (provider_type ~ '^[a-z0-9][a-z0-9._-]{1,49}$'),
  CONSTRAINT teskeid_agent_pairing_sessions_name_check
    CHECK (char_length(trim(connector_name)) BETWEEN 1 AND 80),
  CONSTRAINT teskeid_agent_pairing_sessions_policy_check
    CHECK (policy = 'read_only_reply'),
  CONSTRAINT teskeid_agent_pairing_sessions_state_check
    CHECK (NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL)),
  CONSTRAINT teskeid_agent_pairing_sessions_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS teskeid_agent_pairing_sessions_lookup_idx
  ON public.teskeid_agent_pairing_sessions (code_hash, expires_at)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

-- ---------------------------------------------------------------------------
-- Paired provider connectors. token_hash is an HMAC digest, never a raw token.
-- Phase 1 permits exactly one active connector per conversation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_connectors (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id           uuid        NOT NULL,
  conversation_id    uuid        NOT NULL,
  pairing_session_id uuid        NOT NULL,
  created_by         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_type      text        NOT NULL,
  display_name       text        NOT NULL,
  policy             text        NOT NULL DEFAULT 'read_only_reply',
  token_hash         text        NOT NULL,
  token_expires_at   timestamptz NOT NULL,
  status             text        NOT NULL DEFAULT 'active',
  agent_session_id   text,
  last_seen_at       timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_agent_connectors_space_id_id_unique
    UNIQUE (space_id, id),
  CONSTRAINT teskeid_agent_connectors_space_conversation_id_unique
    UNIQUE (space_id, conversation_id, id),
  CONSTRAINT teskeid_agent_connectors_token_hash_unique
    UNIQUE (token_hash),
  CONSTRAINT teskeid_agent_connectors_pairing_unique
    UNIQUE (pairing_session_id),
  CONSTRAINT teskeid_agent_connectors_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_connectors_pairing_fk
    FOREIGN KEY (space_id, conversation_id, pairing_session_id)
    REFERENCES public.teskeid_agent_pairing_sessions(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_connectors_provider_check
    CHECK (provider_type ~ '^[a-z0-9][a-z0-9._-]{1,49}$'),
  CONSTRAINT teskeid_agent_connectors_name_check
    CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT teskeid_agent_connectors_policy_check
    CHECK (policy = 'read_only_reply'),
  CONSTRAINT teskeid_agent_connectors_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT teskeid_agent_connectors_token_expiry_check
    CHECK (token_expires_at > created_at),
  CONSTRAINT teskeid_agent_connectors_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT teskeid_agent_connectors_session_check
    CHECK (agent_session_id IS NULL OR char_length(agent_session_id) BETWEEN 1 AND 500),
  CONSTRAINT teskeid_agent_connectors_revocation_check
    CHECK (
      (status = 'active' AND revoked_at IS NULL)
      OR (status = 'revoked' AND revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_agent_connectors_one_active_idx
  ON public.teskeid_agent_connectors (space_id, conversation_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS teskeid_agent_connectors_token_lookup_idx
  ON public.teskeid_agent_connectors (token_hash, status, token_expires_at);

-- ---------------------------------------------------------------------------
-- Messages. Exact actor constraints prevent forged user/connector attribution.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id          uuid        NOT NULL,
  conversation_id   uuid        NOT NULL,
  actor_type        text        NOT NULL,
  actor_user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id      uuid,
  author_name       text        NOT NULL,
  body              text        NOT NULL,
  client_message_id uuid,
  idempotency_key   text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_agent_messages_space_conversation_id_unique
    UNIQUE (space_id, conversation_id, id),
  CONSTRAINT teskeid_agent_messages_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_messages_connector_fk
    FOREIGN KEY (space_id, conversation_id, connector_id)
    REFERENCES public.teskeid_agent_connectors(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_messages_actor_type_check
    CHECK (actor_type IN ('user', 'agent', 'system')),
  CONSTRAINT teskeid_agent_messages_actor_exact_check
    CHECK (
      (actor_type = 'user' AND actor_user_id IS NOT NULL AND connector_id IS NULL)
      OR (actor_type = 'agent' AND actor_user_id IS NULL AND connector_id IS NOT NULL)
      OR (actor_type = 'system' AND actor_user_id IS NULL AND connector_id IS NULL)
    ),
  CONSTRAINT teskeid_agent_messages_author_check
    CHECK (char_length(trim(author_name)) BETWEEN 1 AND 120),
  CONSTRAINT teskeid_agent_messages_body_check
    CHECK (char_length(trim(body)) BETWEEN 1 AND 12000),
  CONSTRAINT teskeid_agent_messages_idempotency_key_check
    CHECK (
      idempotency_key IS NULL
      OR (
        char_length(idempotency_key) BETWEEN 8 AND 200
        AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
      )
    )
);

CREATE INDEX IF NOT EXISTS teskeid_agent_messages_page_idx
  ON public.teskeid_agent_messages (space_id, conversation_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_agent_messages_client_id_unique_idx
  ON public.teskeid_agent_messages
    (space_id, conversation_id, actor_type, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_agent_messages_idempotency_unique_idx
  ON public.teskeid_agent_messages
    (space_id, conversation_id, actor_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Per-user monotonic read cursors.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_read_cursors (
  space_id            uuid        NOT NULL,
  conversation_id     uuid        NOT NULL,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid       NOT NULL,
  last_read_at        timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (space_id, conversation_id, user_id),
  CONSTRAINT teskeid_agent_read_cursors_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_read_cursors_message_fk
    FOREIGN KEY (space_id, conversation_id, last_read_message_id)
    REFERENCES public.teskeid_agent_messages(space_id, conversation_id, id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Read-only reply queue with bounded retries and lease fencing.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_runs (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                   uuid        NOT NULL,
  conversation_id            uuid        NOT NULL,
  user_message_id            uuid        NOT NULL,
  connector_id               uuid,
  reply_message_id           uuid,
  policy                     text        NOT NULL DEFAULT 'read_only_reply',
  status                     text        NOT NULL DEFAULT 'queued',
  idempotency_key            text        NOT NULL,
  attempt_count              smallint    NOT NULL DEFAULT 0,
  available_at               timestamptz NOT NULL DEFAULT now(),
  lease_id                   uuid,
  lease_owner_id             uuid,
  lease_expires_at           timestamptz,
  heartbeat_at               timestamptz,
  completion_idempotency_key text,
  completion_client_id       uuid,
  completion_agent_session_id text,
  last_failure_idempotency_key text,
  last_failure_lease_id        uuid,
  last_failure_lease_owner_id  uuid,
  failure_category           text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  completed_at               timestamptz,
  failed_at                  timestamptz,

  CONSTRAINT teskeid_agent_runs_space_conversation_id_unique
    UNIQUE (space_id, conversation_id, id),
  CONSTRAINT teskeid_agent_runs_user_message_unique
    UNIQUE (user_message_id),
  CONSTRAINT teskeid_agent_runs_conversation_idempotency_unique
    UNIQUE (space_id, conversation_id, idempotency_key),
  CONSTRAINT teskeid_agent_runs_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_runs_user_message_fk
    FOREIGN KEY (space_id, conversation_id, user_message_id)
    REFERENCES public.teskeid_agent_messages(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_runs_connector_fk
    FOREIGN KEY (space_id, conversation_id, connector_id)
    REFERENCES public.teskeid_agent_connectors(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_runs_reply_message_fk
    FOREIGN KEY (space_id, conversation_id, reply_message_id)
    REFERENCES public.teskeid_agent_messages(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_runs_policy_check
    CHECK (policy = 'read_only_reply'),
  CONSTRAINT teskeid_agent_runs_status_check
    CHECK (status IN ('queued', 'leased', 'completed', 'failed')),
  CONSTRAINT teskeid_agent_runs_idempotency_key_check
    CHECK (
      char_length(idempotency_key) BETWEEN 8 AND 200
      AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  CONSTRAINT teskeid_agent_runs_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND 3),
  CONSTRAINT teskeid_agent_runs_completion_key_check
    CHECK (
      completion_idempotency_key IS NULL
      OR (
        char_length(completion_idempotency_key) BETWEEN 8 AND 200
        AND completion_idempotency_key ~ '^[A-Za-z0-9._:-]+$'
      )
    ),
  CONSTRAINT teskeid_agent_runs_completion_session_check
    CHECK (
      completion_agent_session_id IS NULL
      OR char_length(completion_agent_session_id) BETWEEN 1 AND 500
    ),
  CONSTRAINT teskeid_agent_runs_failure_key_check
    CHECK (
      last_failure_idempotency_key IS NULL
      OR (
        char_length(last_failure_idempotency_key) BETWEEN 8 AND 200
        AND last_failure_idempotency_key ~ '^[A-Za-z0-9._:-]+$'
      )
    ),
  CONSTRAINT teskeid_agent_runs_failure_fence_check
    CHECK (
      (last_failure_lease_id IS NULL AND last_failure_lease_owner_id IS NULL)
      OR (last_failure_lease_id IS NOT NULL AND last_failure_lease_owner_id IS NOT NULL)
    ),
  CONSTRAINT teskeid_agent_runs_failure_category_check
    CHECK (
      failure_category IS NULL
      OR (
        char_length(failure_category) BETWEEN 1 AND 80
        AND failure_category ~ '^[a-z0-9._-]+$'
      )
    ),
  CONSTRAINT teskeid_agent_runs_state_check
    CHECK (
      (
        status = 'queued'
        AND reply_message_id IS NULL
        AND lease_id IS NULL
        AND lease_owner_id IS NULL
        AND lease_expires_at IS NULL
        AND completed_at IS NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'leased'
        AND connector_id IS NOT NULL
        AND reply_message_id IS NULL
        AND lease_id IS NOT NULL
        AND lease_owner_id IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND heartbeat_at IS NOT NULL
        AND completed_at IS NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'completed'
        AND connector_id IS NOT NULL
        AND reply_message_id IS NOT NULL
        AND lease_id IS NOT NULL
        AND lease_owner_id IS NOT NULL
        AND completion_idempotency_key IS NOT NULL
        AND completion_client_id IS NOT NULL
        AND completed_at IS NOT NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'failed'
        AND reply_message_id IS NULL
        AND failure_category IS NOT NULL
        AND completed_at IS NULL
        AND failed_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS teskeid_agent_runs_claim_idx
  ON public.teskeid_agent_runs
    (space_id, conversation_id, status, available_at, created_at)
  WHERE status = 'queued';

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_agent_runs_one_lease_per_conversation_idx
  ON public.teskeid_agent_runs (space_id, conversation_id)
  WHERE status = 'leased';

-- ---------------------------------------------------------------------------
-- Privacy-minimal audit events. No message body, prompt, address, coordinates,
-- credentials or arbitrary client payload is accepted by the public RPCs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teskeid_agent_audit_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid        NOT NULL,
  conversation_id uuid        NOT NULL,
  actor_type      text        NOT NULL,
  actor_user_id   uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id    uuid,
  run_id          uuid,
  event_type      text        NOT NULL,
  details         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_agent_audit_events_conversation_fk
    FOREIGN KEY (space_id, conversation_id)
    REFERENCES public.teskeid_agent_conversations(space_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_audit_events_connector_fk
    FOREIGN KEY (space_id, conversation_id, connector_id)
    REFERENCES public.teskeid_agent_connectors(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_audit_events_run_fk
    FOREIGN KEY (space_id, conversation_id, run_id)
    REFERENCES public.teskeid_agent_runs(space_id, conversation_id, id)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_agent_audit_events_actor_type_check
    CHECK (actor_type IN ('user', 'connector', 'system')),
  CONSTRAINT teskeid_agent_audit_events_actor_exact_check
    CHECK (
      (actor_type = 'user' AND actor_user_id IS NOT NULL AND connector_id IS NULL)
      OR (actor_type = 'connector' AND actor_user_id IS NULL AND connector_id IS NOT NULL)
      OR (actor_type = 'system' AND actor_user_id IS NULL AND connector_id IS NULL)
    ),
  CONSTRAINT teskeid_agent_audit_events_event_type_check
    CHECK (
      char_length(event_type) BETWEEN 1 AND 80
      AND event_type ~ '^[a-z0-9._-]+$'
    ),
  CONSTRAINT teskeid_agent_audit_events_details_check
    CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS teskeid_agent_audit_events_timeline_idx
  ON public.teskeid_agent_audit_events
    (space_id, conversation_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Updated-at and message counter triggers.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS teskeid_agent_conversations_updated_at
  ON public.teskeid_agent_conversations;
CREATE TRIGGER teskeid_agent_conversations_updated_at
  BEFORE UPDATE ON public.teskeid_agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

DROP TRIGGER IF EXISTS teskeid_agent_connectors_updated_at
  ON public.teskeid_agent_connectors;
CREATE TRIGGER teskeid_agent_connectors_updated_at
  BEFORE UPDATE ON public.teskeid_agent_connectors
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

DROP TRIGGER IF EXISTS teskeid_agent_runs_updated_at
  ON public.teskeid_agent_runs;
CREATE TRIGGER teskeid_agent_runs_updated_at
  BEFORE UPDATE ON public.teskeid_agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

CREATE OR REPLACE FUNCTION public.teskeid_agent_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.teskeid_agent_conversations AS conversation
  SET message_count = conversation.message_count + 1,
      last_message_at = greatest(
        coalesce(conversation.last_message_at, NEW.created_at),
        NEW.created_at
      ),
      updated_at = now()
  WHERE conversation.space_id = NEW.space_id
    AND conversation.id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teskeid_agent_messages_after_insert
  ON public.teskeid_agent_messages;
CREATE TRIGGER teskeid_agent_messages_after_insert
  AFTER INSERT ON public.teskeid_agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_agent_on_message_insert();

REVOKE ALL ON FUNCTION public.teskeid_agent_on_message_insert()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS and direct grants: default deny for browser roles.
-- ---------------------------------------------------------------------------

ALTER TABLE public.teskeid_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_pairing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_read_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_agent_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.teskeid_agent_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_pairing_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_connectors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_read_cursors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teskeid_agent_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_pairing_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_connectors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_read_cursors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_agent_audit_events TO service_role;

-- Authoritative entitlement check shared by browser and connector RPCs.
-- Passing a credential timestamp prevents an old pairing/token from becoming
-- valid again if access is later removed and re-granted.
CREATE OR REPLACE FUNCTION public.teskeid_agent_has_beta_access(
  p_user_id uuid,
  p_credential_created_at timestamptz DEFAULT NULL
)
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
      -- Migration 56 keeps Gmail aliases canonical across app and SQL gates.
      ON public.normalize_email_canonical(access.email)
       = public.normalize_email_canonical(account.email)
     AND access.feature_key = 'agent-collaboration-private-beta'
    WHERE account.id = p_user_id
      AND (
        p_credential_created_at IS NULL
        OR access.granted_at <= p_credential_created_at
      )
  );
$$;

REVOKE ALL ON FUNCTION public.teskeid_agent_has_beta_access(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated browser RPC: bootstrap the caller's private conversation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teskeid_agent_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_conversation public.teskeid_agent_conversations%ROWTYPE;
  v_connectors jsonb;
  v_latest_run jsonb;
  v_unread_count integer;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  v_space_id := public.ensure_personal_space();

  INSERT INTO public.teskeid_agent_conversations (
    space_id,
    slug,
    title,
    created_by
  )
  VALUES (
    v_space_id,
    'coding-agent',
    'AI coding collaboration',
    v_actor_id
  )
  ON CONFLICT (space_id, slug) DO NOTHING;

  SELECT conversation.*
  INTO STRICT v_conversation
  FROM public.teskeid_agent_conversations AS conversation
  JOIN public.space_members AS membership
    ON membership.space_id = conversation.space_id
   AND membership.user_id = v_actor_id
  WHERE conversation.space_id = v_space_id
    AND conversation.slug = 'coding-agent';

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', connector.id,
        'providerKey', connector.provider_type,
        'displayName', connector.display_name,
        'status', connector.status,
        'lastSeenAt', connector.last_seen_at,
        'tokenExpiresAt', connector.token_expires_at
      )
      ORDER BY connector.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_connectors
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.space_id = v_space_id
    AND connector.conversation_id = v_conversation.id
    AND connector.status = 'active'
    AND connector.token_expires_at > now();

  -- One bounded, presentation-safe status object. Never return a prompt,
  -- message body, path, provider output, lease identifier or failure details.
  SELECT CASE
    WHEN run.status = 'failed' THEN
      jsonb_build_object(
        'id', run.id,
        'status', 'failed',
        'failureCategory', run.failure_category
      )
    WHEN run.status = 'leased'
         AND run.lease_expires_at <= now()
         AND run.attempt_count >= 3 THEN
      jsonb_build_object(
        'id', run.id,
        'status', 'failed',
        'failureCategory', 'lease_expired'
      )
    ELSE
      jsonb_build_object(
        'id', run.id,
        'status', CASE run.status
          WHEN 'leased' THEN CASE
            WHEN run.lease_expires_at > now() THEN 'working'
            ELSE 'queued'
          END
          WHEN 'completed' THEN 'completed'
          ELSE 'queued'
        END
      )
    END
  INTO v_latest_run
  FROM public.teskeid_agent_runs AS run
  WHERE run.space_id = v_space_id
    AND run.conversation_id = v_conversation.id
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1;

  SELECT count(*)::integer
  INTO v_unread_count
  FROM public.teskeid_agent_messages AS message
  LEFT JOIN public.teskeid_agent_read_cursors AS cursor
    ON cursor.space_id = message.space_id
   AND cursor.conversation_id = message.conversation_id
   AND cursor.user_id = v_actor_id
  WHERE message.space_id = v_space_id
    AND message.conversation_id = v_conversation.id
    AND message.actor_type IN ('agent', 'system')
    AND (
      cursor.last_read_message_id IS NULL
      OR (message.created_at, message.id) > (cursor.last_read_at, cursor.last_read_message_id)
    );

  RETURN jsonb_build_object(
    'spaceId', v_space_id,
    'conversation', jsonb_build_object(
      'id', v_conversation.id,
      'title', v_conversation.title
    ),
    'connectors', v_connectors,
    'latestRun', v_latest_run,
    'unreadCount', v_unread_count
  );
END;
$$;

-- Read-only menu polling. It never creates a space or conversation.
CREATE OR REPLACE FUNCTION public.teskeid_agent_get_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_conversation_id uuid;
  v_unread_count integer := 0;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT space.id
  INTO v_space_id
  FROM public.spaces AS space
  JOIN public.space_members AS membership
    ON membership.space_id = space.id
   AND membership.user_id = v_actor_id
  WHERE space.type = 'personal'
    AND space.created_by = v_actor_id
  LIMIT 1;

  IF v_space_id IS NULL THEN
    RETURN jsonb_build_object(
      'conversationId', NULL,
      'unreadCount', 0,
      'hasActiveConnector', false
    );
  END IF;

  SELECT conversation.id
  INTO v_conversation_id
  FROM public.teskeid_agent_conversations AS conversation
  WHERE conversation.space_id = v_space_id
    AND conversation.slug = 'coding-agent';

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'conversationId', NULL,
      'unreadCount', 0,
      'hasActiveConnector', false
    );
  END IF;

  SELECT count(*)::integer
  INTO v_unread_count
  FROM public.teskeid_agent_messages AS message
  LEFT JOIN public.teskeid_agent_read_cursors AS cursor
    ON cursor.space_id = message.space_id
   AND cursor.conversation_id = message.conversation_id
   AND cursor.user_id = v_actor_id
  WHERE message.space_id = v_space_id
    AND message.conversation_id = v_conversation_id
    AND message.actor_type IN ('agent', 'system')
    AND (
      cursor.last_read_message_id IS NULL
      OR (message.created_at, message.id) > (cursor.last_read_at, cursor.last_read_message_id)
    );

  RETURN jsonb_build_object(
    'conversationId', v_conversation_id,
    'unreadCount', v_unread_count,
    'hasActiveConnector', EXISTS (
      SELECT 1
      FROM public.teskeid_agent_connectors AS connector
      WHERE connector.space_id = v_space_id
        AND connector.conversation_id = v_conversation_id
        AND connector.status = 'active'
        AND connector.token_expires_at > now()
    )
  );
END;
$$;

-- Keyset pagination uses the full (created_at, id) tuple, avoiding skips when
-- several messages share a timestamp. Results are newest-first; the API may
-- reverse each page for the existing chat panel.
CREATE OR REPLACE FUNCTION public.teskeid_agent_list_messages(
  p_conversation_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  "conversationId" uuid,
  body text,
  "actorType" text,
  "authorName" text,
  "createdAt" timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_before_created_at timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT conversation.space_id
  INTO v_space_id
  FROM public.teskeid_agent_conversations AS conversation
  JOIN public.space_members AS membership
    ON membership.space_id = conversation.space_id
   AND membership.user_id = v_actor_id
  WHERE conversation.id = p_conversation_id;

  IF v_actor_id IS NULL OR v_space_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  IF p_before_id IS NOT NULL THEN
    SELECT message.created_at
    INTO v_before_created_at
    FROM public.teskeid_agent_messages AS message
    WHERE message.space_id = v_space_id
      AND message.conversation_id = p_conversation_id
      AND message.id = p_before_id;

    IF v_before_created_at IS NULL THEN
      RAISE EXCEPTION 'agent_collaboration_unavailable';
    END IF;

  ELSIF p_before IS NOT NULL THEN
    -- Timestamp-only pagination can skip equal-timestamp rows and is therefore
    -- intentionally rejected. Callers must send the opaque message id too.
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  RETURN QUERY
  SELECT
    message.id,
    message.conversation_id AS "conversationId",
    message.body,
    message.actor_type AS "actorType",
    message.author_name AS "authorName",
    message.created_at AS "createdAt"
  FROM public.teskeid_agent_messages AS message
  WHERE message.space_id = v_space_id
    AND message.conversation_id = p_conversation_id
    AND (
      p_before_id IS NULL
      OR (message.created_at, message.id) < (v_before_created_at, p_before_id)
    )
  ORDER BY message.created_at DESC, message.id DESC
  LIMIT v_limit;
END;
$$;

-- Insert a user message and exactly one read-only reply job atomically.
CREATE OR REPLACE FUNCTION public.teskeid_agent_send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_author_name text;
  v_existing_message public.teskeid_agent_messages%ROWTYPE;
  v_message public.teskeid_agent_messages%ROWTYPE;
  v_run public.teskeid_agent_runs%ROWTYPE;
  v_connector_id uuid;
  v_outstanding_count integer;
  v_recent_send_count integer;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT conversation.space_id
  INTO v_space_id
  FROM public.teskeid_agent_conversations AS conversation
  JOIN public.space_members AS membership
    ON membership.space_id = conversation.space_id
   AND membership.user_id = v_actor_id
  WHERE conversation.id = p_conversation_id
    AND conversation.status = 'active';

  IF v_actor_id IS NULL OR v_space_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  IF p_client_message_id IS NULL
     OR char_length(trim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 12000
     OR char_length(coalesce(p_idempotency_key, '')) NOT BETWEEN 8 AND 200
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'agent_message_invalid';
  END IF;

  -- Serialize a conversation's sends. This makes both uniqueness checks and
  -- the outstanding-run quota deterministic under concurrent requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('teskeid-agent-conversation:' || p_conversation_id::text, 0)
  );

  SELECT message.*
  INTO v_existing_message
  FROM public.teskeid_agent_messages AS message
  WHERE message.space_id = v_space_id
    AND message.conversation_id = p_conversation_id
    AND message.actor_type = 'user'
    AND (
      message.client_message_id = p_client_message_id
      OR message.idempotency_key = p_idempotency_key
    )
  ORDER BY message.created_at
  LIMIT 1;

  IF v_existing_message.id IS NOT NULL THEN
    IF v_existing_message.actor_user_id <> v_actor_id
       OR v_existing_message.client_message_id <> p_client_message_id
       OR v_existing_message.idempotency_key <> p_idempotency_key
       OR v_existing_message.body <> trim(p_body) THEN
      RAISE EXCEPTION 'agent_message_idempotency_conflict';
    END IF;

    SELECT run.*
    INTO STRICT v_run
    FROM public.teskeid_agent_runs AS run
    WHERE run.space_id = v_space_id
      AND run.conversation_id = p_conversation_id
      AND run.user_message_id = v_existing_message.id;

    RETURN jsonb_build_object(
      'id', v_existing_message.id,
      'conversationId', v_existing_message.conversation_id,
      'body', v_existing_message.body,
      'actorType', v_existing_message.actor_type,
      'authorName', v_existing_message.author_name,
      'createdAt', v_existing_message.created_at
    );
  END IF;

  -- Coarse tenant-scoped abuse/cost guard for the initial commercial shape.
  -- The idempotency fast path above means a safe HTTP retry is never charged
  -- against the limit. Message bodies are not copied into audit or logs.
  SELECT count(*)::integer
  INTO v_recent_send_count
  FROM public.teskeid_agent_messages AS message
  WHERE message.space_id = v_space_id
    AND message.conversation_id = p_conversation_id
    AND message.actor_type = 'user'
    AND message.created_at >= now() - interval '10 minutes';

  IF v_recent_send_count >= 30 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'agent_rate_limited';
  END IF;

  SELECT count(*)::integer
  INTO v_outstanding_count
  FROM public.teskeid_agent_runs AS run
  WHERE run.space_id = v_space_id
    AND run.conversation_id = p_conversation_id
    AND run.status IN ('queued', 'leased');

  IF v_outstanding_count >= 20 THEN
    RAISE EXCEPTION 'agent_run_backlog_full';
  END IF;

  SELECT connector.id
  INTO v_connector_id
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.space_id = v_space_id
    AND connector.conversation_id = p_conversation_id
    AND connector.status = 'active'
    AND connector.token_expires_at > now();

  SELECT left(coalesce(nullif(trim(profile.display_name), ''), 'User'), 120)
  INTO v_author_name
  FROM public.profiles AS profile
  WHERE profile.id = v_actor_id;

  v_author_name := coalesce(v_author_name, 'User');

  INSERT INTO public.teskeid_agent_messages (
    space_id,
    conversation_id,
    actor_type,
    actor_user_id,
    author_name,
    body,
    client_message_id,
    idempotency_key
  )
  VALUES (
    v_space_id,
    p_conversation_id,
    'user',
    v_actor_id,
    v_author_name,
    trim(p_body),
    p_client_message_id,
    p_idempotency_key
  )
  RETURNING * INTO v_message;

  INSERT INTO public.teskeid_agent_runs (
    space_id,
    conversation_id,
    user_message_id,
    connector_id,
    policy,
    status,
    idempotency_key
  )
  VALUES (
    v_space_id,
    p_conversation_id,
    v_message.id,
    v_connector_id,
    'read_only_reply',
    'queued',
    p_idempotency_key
  )
  RETURNING * INTO v_run;

  RETURN jsonb_build_object(
    'id', v_message.id,
    'conversationId', v_message.conversation_id,
    'body', v_message.body,
    'actorType', v_message.actor_type,
    'authorName', v_message.author_name,
    'createdAt', v_message.created_at
  );
END;
$$;

-- Monotonic cursor updates prevent a slower request from moving read state back.
CREATE OR REPLACE FUNCTION public.teskeid_agent_mark_read(
  p_conversation_id uuid,
  p_last_read_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_message_id uuid;
  v_message_created_at timestamptz;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT conversation.space_id
  INTO v_space_id
  FROM public.teskeid_agent_conversations AS conversation
  JOIN public.space_members AS membership
    ON membership.space_id = conversation.space_id
   AND membership.user_id = v_actor_id
  WHERE conversation.id = p_conversation_id;

  IF v_actor_id IS NULL OR v_space_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  IF p_last_read_message_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT message.id, message.created_at
  INTO v_message_id, v_message_created_at
  FROM public.teskeid_agent_messages AS message
  WHERE message.space_id = v_space_id
    AND message.conversation_id = p_conversation_id
    AND message.id = p_last_read_message_id;

  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  INSERT INTO public.teskeid_agent_read_cursors (
    space_id,
    conversation_id,
    user_id,
    last_read_message_id,
    last_read_at,
    updated_at
  )
  VALUES (
    v_space_id,
    p_conversation_id,
    v_actor_id,
    v_message_id,
    v_message_created_at,
    now()
  )
  ON CONFLICT (space_id, conversation_id, user_id) DO UPDATE
  SET last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at,
      updated_at = now()
  WHERE (
    EXCLUDED.last_read_at,
    EXCLUDED.last_read_message_id
  ) > (
    teskeid_agent_read_cursors.last_read_at,
    teskeid_agent_read_cursors.last_read_message_id
  );

  RETURN true;
END;
$$;

-- Pairing creation is owner-only. The API creates the short code and sends
-- only its lowercase SHA-256 HMAC hex digest to this function.
CREATE OR REPLACE FUNCTION public.teskeid_agent_create_pairing(
  p_conversation_id uuid,
  p_code_hash text,
  p_expires_at timestamptz,
  p_connector_name text,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_pairing public.teskeid_agent_pairing_sessions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT conversation.space_id
  INTO v_space_id
  FROM public.teskeid_agent_conversations AS conversation
  JOIN public.space_members AS membership
    ON membership.space_id = conversation.space_id
   AND membership.user_id = v_actor_id
   AND membership.role = 'owner'
  WHERE conversation.id = p_conversation_id
    AND conversation.status = 'active';

  IF v_actor_id IS NULL OR v_space_id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  IF p_code_hash IS NULL
     OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_provider_type IS NULL
     OR p_provider_type !~ '^[a-z0-9][a-z0-9._-]{1,49}$'
     OR char_length(trim(coalesce(p_connector_name, ''))) NOT BETWEEN 1 AND 80
     OR p_expires_at IS NULL
     OR p_expires_at < now() + interval '2 minutes'
     OR p_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'agent_pairing_invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('teskeid-agent-conversation:' || p_conversation_id::text, 0)
  );

  UPDATE public.teskeid_agent_pairing_sessions AS pairing
  SET cancelled_at = now()
  WHERE pairing.space_id = v_space_id
    AND pairing.conversation_id = p_conversation_id
    AND pairing.consumed_at IS NULL
    AND pairing.cancelled_at IS NULL;

  INSERT INTO public.teskeid_agent_pairing_sessions (
    space_id,
    conversation_id,
    created_by,
    code_hash,
    provider_type,
    connector_name,
    policy,
    expires_at
  )
  VALUES (
    v_space_id,
    p_conversation_id,
    v_actor_id,
    p_code_hash,
    p_provider_type,
    trim(p_connector_name),
    'read_only_reply',
    p_expires_at
  )
  RETURNING * INTO v_pairing;

  INSERT INTO public.teskeid_agent_audit_events (
    space_id,
    conversation_id,
    actor_type,
    actor_user_id,
    event_type
  )
  VALUES (
    v_space_id,
    p_conversation_id,
    'user',
    v_actor_id,
    'pairing.created'
  );

  RETURN jsonb_build_object(
    'sessionId', v_pairing.id,
    'providerKey', v_pairing.provider_type,
    'displayName', v_pairing.connector_name,
    'expiresAt', v_pairing.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teskeid_agent_revoke_connector(
  p_connector_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_connector public.teskeid_agent_connectors%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
     OR NOT public.teskeid_agent_has_beta_access(v_actor_id) THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  JOIN public.space_members AS membership
    ON membership.space_id = connector.space_id
   AND membership.user_id = v_actor_id
   AND membership.role = 'owner'
  WHERE connector.id = p_connector_id
  ;

  IF v_actor_id IS NULL OR v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'teskeid-agent-conversation:' || v_connector.conversation_id::text,
      0
    )
  );

  -- Re-check both ownership and connector state after acquiring the shared
  -- conversation lock used by pairing and claiming.
  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  JOIN public.space_members AS membership
    ON membership.space_id = connector.space_id
   AND membership.user_id = v_actor_id
   AND membership.role = 'owner'
  WHERE connector.id = p_connector_id
  FOR UPDATE OF connector;

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_collaboration_unavailable';
  END IF;

  IF v_connector.status = 'revoked' THEN
    RETURN true;
  END IF;

  UPDATE public.teskeid_agent_connectors AS connector
  SET status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  WHERE connector.space_id = v_connector.space_id
    AND connector.id = v_connector.id;

  -- A revoked worker cannot complete an old lease. Preserve the user's queued
  -- work for a future connector, without increasing attempt_count.
  UPDATE public.teskeid_agent_runs AS run
  SET status = CASE WHEN run.attempt_count >= 3 THEN 'failed' ELSE 'queued' END,
      connector_id = NULL,
      lease_id = NULL,
      lease_owner_id = NULL,
      lease_expires_at = NULL,
      heartbeat_at = NULL,
      available_at = now(),
      failure_category = CASE WHEN run.attempt_count >= 3 THEN 'connector_revoked' ELSE NULL END,
      failed_at = CASE WHEN run.attempt_count >= 3 THEN now() ELSE NULL END,
      updated_at = now()
  WHERE run.space_id = v_connector.space_id
    AND run.conversation_id = v_connector.conversation_id
    AND run.status IN ('queued', 'leased');

  INSERT INTO public.teskeid_agent_audit_events (
    space_id,
    conversation_id,
    actor_type,
    actor_user_id,
    event_type
  )
  VALUES (
    v_connector.space_id,
    v_connector.conversation_id,
    'user',
    v_actor_id,
    'connector.revoked'
  );

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Service-role connector RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teskeid_agent_exchange_pairing(
  p_code_hash text,
  p_token_hash text,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pairing public.teskeid_agent_pairing_sessions%ROWTYPE;
  v_connector public.teskeid_agent_connectors%ROWTYPE;
BEGIN
  IF p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_provider_type !~ '^[a-z0-9][a-z0-9._-]{1,49}$' THEN
    RAISE EXCEPTION 'agent_pairing_unavailable';
  END IF;

  SELECT pairing.*
  INTO v_pairing
  FROM public.teskeid_agent_pairing_sessions AS pairing
  WHERE pairing.code_hash = p_code_hash
    AND pairing.provider_type = p_provider_type
    AND pairing.policy = 'read_only_reply'
    AND pairing.consumed_at IS NULL
    AND pairing.cancelled_at IS NULL
    AND pairing.expires_at > now()
    AND public.teskeid_agent_has_beta_access(pairing.created_by, pairing.created_at);

  IF v_pairing.id IS NULL THEN
    RAISE EXCEPTION 'agent_pairing_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('teskeid-agent-conversation:' || v_pairing.conversation_id::text, 0)
  );

  -- Pairing creation takes the same lock before cancelling old sessions.
  -- Re-read and lock the row so provider, expiry and single-use checks are
  -- authoritative at the instant of exchange.
  SELECT pairing.*
  INTO v_pairing
  FROM public.teskeid_agent_pairing_sessions AS pairing
  WHERE pairing.code_hash = p_code_hash
    AND pairing.provider_type = p_provider_type
    AND pairing.policy = 'read_only_reply'
    AND pairing.consumed_at IS NULL
    AND pairing.cancelled_at IS NULL
    AND pairing.expires_at > now()
    AND public.teskeid_agent_has_beta_access(pairing.created_by, pairing.created_at)
  FOR UPDATE;

  IF v_pairing.id IS NULL THEN
    RAISE EXCEPTION 'agent_pairing_unavailable';
  END IF;

  -- Re-pairing is deterministic: revoke the previous active connector first.
  UPDATE public.teskeid_agent_connectors AS connector
  SET status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  WHERE connector.space_id = v_pairing.space_id
    AND connector.conversation_id = v_pairing.conversation_id
    AND connector.status = 'active';

  INSERT INTO public.teskeid_agent_connectors (
    space_id,
    conversation_id,
    pairing_session_id,
    created_by,
    provider_type,
    display_name,
    policy,
    token_hash,
    token_expires_at
  )
  VALUES (
    v_pairing.space_id,
    v_pairing.conversation_id,
    v_pairing.id,
    v_pairing.created_by,
    v_pairing.provider_type,
    v_pairing.connector_name,
    'read_only_reply',
    p_token_hash,
    now() + interval '30 days'
  )
  RETURNING * INTO v_connector;

  UPDATE public.teskeid_agent_pairing_sessions AS pairing
  SET consumed_at = now()
  WHERE pairing.id = v_pairing.id
    AND pairing.consumed_at IS NULL
    AND pairing.cancelled_at IS NULL;

  -- Move incomplete work to the new connector and fence any old lease.
  UPDATE public.teskeid_agent_runs AS run
  SET status = CASE WHEN run.attempt_count >= 3 THEN 'failed' ELSE 'queued' END,
      connector_id = v_connector.id,
      lease_id = NULL,
      lease_owner_id = NULL,
      lease_expires_at = NULL,
      heartbeat_at = NULL,
      available_at = now(),
      failure_category = CASE WHEN run.attempt_count >= 3 THEN 'connector_replaced' ELSE NULL END,
      failed_at = CASE WHEN run.attempt_count >= 3 THEN now() ELSE NULL END,
      updated_at = now()
  WHERE run.space_id = v_pairing.space_id
    AND run.conversation_id = v_pairing.conversation_id
    AND run.status IN ('queued', 'leased');

  INSERT INTO public.teskeid_agent_audit_events (
    space_id,
    conversation_id,
    actor_type,
    connector_id,
    event_type
  )
  VALUES (
    v_connector.space_id,
    v_connector.conversation_id,
    'connector',
    v_connector.id,
    'connector.paired'
  );

  RETURN jsonb_build_object(
    'connectorId', v_connector.id,
    'spaceId', v_connector.space_id,
    'conversationId', v_connector.conversation_id,
    'providerKey', v_connector.provider_type,
    'displayName', v_connector.display_name,
    'policy', v_connector.policy,
    'tokenExpiresAt', v_connector.token_expires_at,
    'token_expires_at', v_connector.token_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teskeid_agent_claim_run(
  p_token_hash text,
  p_lease_owner_id uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connector public.teskeid_agent_connectors%ROWTYPE;
  v_run public.teskeid_agent_runs%ROWTYPE;
  v_prompt text;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 60), 30), 300);
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_lease_owner_id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.token_hash = p_token_hash
    AND connector.status = 'active'
    AND connector.policy = 'read_only_reply'
    AND connector.token_expires_at > now()
    AND public.teskeid_agent_has_beta_access(connector.created_by, connector.created_at);

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('teskeid-agent-conversation:' || v_connector.conversation_id::text, 0)
  );

  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.token_hash = p_token_hash
    AND connector.status = 'active'
    AND connector.policy = 'read_only_reply'
    AND connector.token_expires_at > now()
    AND public.teskeid_agent_has_beta_access(connector.created_by, connector.created_at)
  FOR UPDATE;

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  -- Lost claim response: return the caller's existing live lease unchanged.
  SELECT run.*
  INTO v_run
  FROM public.teskeid_agent_runs AS run
  WHERE run.space_id = v_connector.space_id
    AND run.conversation_id = v_connector.conversation_id
    AND run.connector_id = v_connector.id
    AND run.status = 'leased'
    AND run.lease_owner_id = p_lease_owner_id
    AND run.lease_expires_at > now()
  ORDER BY run.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    -- Expired leases are either retried or terminally failed at the attempt cap.
    UPDATE public.teskeid_agent_runs AS run
    SET status = CASE WHEN run.attempt_count >= 3 THEN 'failed' ELSE 'queued' END,
        lease_id = NULL,
        lease_owner_id = NULL,
        lease_expires_at = NULL,
        heartbeat_at = NULL,
        available_at = now(),
        failure_category = CASE WHEN run.attempt_count >= 3 THEN 'lease_expired' ELSE NULL END,
        failed_at = CASE WHEN run.attempt_count >= 3 THEN now() ELSE NULL END,
        updated_at = now()
    WHERE run.space_id = v_connector.space_id
      AND run.conversation_id = v_connector.conversation_id
      AND run.status = 'leased'
      AND run.lease_expires_at <= now();

    -- Another owner has the conversation's single live lease.
    IF EXISTS (
      SELECT 1
      FROM public.teskeid_agent_runs AS run
      WHERE run.space_id = v_connector.space_id
        AND run.conversation_id = v_connector.conversation_id
        AND run.status = 'leased'
        AND run.lease_expires_at > now()
    ) THEN
      UPDATE public.teskeid_agent_connectors AS connector
      SET last_seen_at = now(), updated_at = now()
      WHERE connector.id = v_connector.id;
      RETURN NULL;
    END IF;

    SELECT run.*
    INTO v_run
    FROM public.teskeid_agent_runs AS run
    WHERE run.space_id = v_connector.space_id
      AND run.conversation_id = v_connector.conversation_id
      AND run.status = 'queued'
      AND run.attempt_count < 3
      AND run.available_at <= now()
      AND (run.connector_id IS NULL OR run.connector_id = v_connector.id)
    ORDER BY run.created_at, run.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_run.id IS NULL THEN
      UPDATE public.teskeid_agent_connectors AS connector
      SET last_seen_at = now(), updated_at = now()
      WHERE connector.id = v_connector.id;
      RETURN NULL;
    END IF;

    UPDATE public.teskeid_agent_runs AS run
    SET connector_id = v_connector.id,
        status = 'leased',
        attempt_count = run.attempt_count + 1,
        lease_id = gen_random_uuid(),
        lease_owner_id = p_lease_owner_id,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        heartbeat_at = now(),
        failure_category = NULL,
        failed_at = NULL,
        updated_at = now()
    WHERE run.id = v_run.id
    RETURNING * INTO v_run;

    INSERT INTO public.teskeid_agent_audit_events (
      space_id,
      conversation_id,
      actor_type,
      connector_id,
      run_id,
      event_type,
      details
    )
    VALUES (
      v_run.space_id,
      v_run.conversation_id,
      'connector',
      v_connector.id,
      v_run.id,
      'run.claimed',
      jsonb_build_object('attempt', v_run.attempt_count)
    );
  END IF;

  SELECT message.body
  INTO STRICT v_prompt
  FROM public.teskeid_agent_messages AS message
  WHERE message.space_id = v_run.space_id
    AND message.conversation_id = v_run.conversation_id
    AND message.id = v_run.user_message_id
    AND message.actor_type = 'user';

  UPDATE public.teskeid_agent_connectors AS connector
  SET last_seen_at = now(), updated_at = now()
  WHERE connector.id = v_connector.id;

  RETURN jsonb_build_object(
    'id', v_run.id,
    'runId', v_run.id,
    'leaseId', v_run.lease_id,
    'conversationId', v_run.conversation_id,
    'userMessageId', v_run.user_message_id,
    'prompt', v_prompt,
    'mode', v_run.policy,
    'policy', v_run.policy,
    'attemptCount', v_run.attempt_count,
    'createdAt', v_run.created_at,
    'leaseExpiresAt', v_run.lease_expires_at,
    'agentSessionId', v_connector.agent_session_id,
    'priorAgentSessionId', v_connector.agent_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teskeid_agent_heartbeat_run(
  p_token_hash text,
  p_run_id uuid,
  p_lease_owner_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connector public.teskeid_agent_connectors%ROWTYPE;
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 60), 30), 300);
  v_updated_count integer;
BEGIN
  -- Match connector -> run lock order used by claim, complete, fail and revoke.
  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.token_hash = p_token_hash
    AND connector.status = 'active'
    AND connector.policy = 'read_only_reply'
    AND connector.token_expires_at > now()
    AND public.teskeid_agent_has_beta_access(connector.created_by, connector.created_at)
  FOR UPDATE;

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  UPDATE public.teskeid_agent_runs AS run
  SET lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      heartbeat_at = now(),
      updated_at = now()
  WHERE run.id = p_run_id
    AND run.connector_id = v_connector.id
    AND run.space_id = v_connector.space_id
    AND run.conversation_id = v_connector.conversation_id
    AND run.status = 'leased'
    AND run.lease_owner_id = p_lease_owner_id
    AND run.lease_id = p_lease_id
    AND run.lease_expires_at > now();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'agent_run_lease_unavailable';
  END IF;

  UPDATE public.teskeid_agent_connectors AS connector
  SET last_seen_at = now(),
      updated_at = now()
  WHERE connector.id = v_connector.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.teskeid_agent_complete_run(
  p_token_hash text,
  p_run_id uuid,
  p_lease_owner_id uuid,
  p_lease_id uuid,
  p_reply_body text,
  p_client_message_id uuid,
  p_idempotency_key text,
  p_agent_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connector public.teskeid_agent_connectors%ROWTYPE;
  v_run public.teskeid_agent_runs%ROWTYPE;
  v_message public.teskeid_agent_messages%ROWTYPE;
BEGIN
  IF char_length(trim(coalesce(p_reply_body, ''))) NOT BETWEEN 1 AND 12000
     OR p_client_message_id IS NULL
     OR char_length(coalesce(p_idempotency_key, '')) NOT BETWEEN 8 AND 200
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     OR (p_agent_session_id IS NOT NULL AND char_length(p_agent_session_id) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'agent_run_completion_invalid';
  END IF;

  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.token_hash = p_token_hash
    AND connector.status = 'active'
    AND connector.policy = 'read_only_reply'
    AND connector.token_expires_at > now()
    AND public.teskeid_agent_has_beta_access(connector.created_by, connector.created_at)
  FOR UPDATE;

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  SELECT run.*
  INTO v_run
  FROM public.teskeid_agent_runs AS run
  WHERE run.id = p_run_id
    AND run.space_id = v_connector.space_id
    AND run.conversation_id = v_connector.conversation_id
    AND run.connector_id = v_connector.id
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'agent_run_lease_unavailable';
  END IF;

  -- Lost successful response: exact replay returns the original message before
  -- lease-expiry checks. A changed key or payload can never replace output.
  IF v_run.status = 'completed' THEN
    SELECT message.*
    INTO STRICT v_message
    FROM public.teskeid_agent_messages AS message
    WHERE message.space_id = v_run.space_id
      AND message.conversation_id = v_run.conversation_id
      AND message.id = v_run.reply_message_id;

    IF v_run.lease_owner_id = p_lease_owner_id
       AND v_run.lease_id = p_lease_id
       AND v_run.completion_idempotency_key = p_idempotency_key
       AND v_run.completion_client_id = p_client_message_id
       AND v_message.body = trim(p_reply_body)
       AND v_run.completion_agent_session_id IS NOT DISTINCT FROM p_agent_session_id THEN
      RETURN jsonb_build_object(
        'messageId', v_message.id,
        'message', jsonb_build_object(
          'id', v_message.id,
          'conversationId', v_message.conversation_id,
          'body', v_message.body,
          'actorType', v_message.actor_type,
          'authorName', v_message.author_name,
          'createdAt', v_message.created_at
        ),
        'run', jsonb_build_object('id', v_run.id, 'status', v_run.status)
      );
    END IF;

    RAISE EXCEPTION 'agent_run_completion_conflict';
  END IF;

  IF v_run.status <> 'leased'
     OR v_run.lease_owner_id <> p_lease_owner_id
     OR v_run.lease_id <> p_lease_id
     OR v_run.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'agent_run_lease_unavailable';
  END IF;

  INSERT INTO public.teskeid_agent_messages (
    space_id,
    conversation_id,
    actor_type,
    connector_id,
    author_name,
    body,
    client_message_id,
    idempotency_key
  )
  VALUES (
    v_run.space_id,
    v_run.conversation_id,
    'agent',
    v_connector.id,
    v_connector.display_name,
    trim(p_reply_body),
    p_client_message_id,
    p_idempotency_key
  )
  RETURNING * INTO v_message;

  UPDATE public.teskeid_agent_runs AS run
  SET status = 'completed',
      reply_message_id = v_message.id,
      completion_idempotency_key = p_idempotency_key,
      completion_client_id = p_client_message_id,
      completion_agent_session_id = p_agent_session_id,
      completed_at = now(),
      updated_at = now()
  WHERE run.id = v_run.id
  RETURNING * INTO v_run;

  UPDATE public.teskeid_agent_connectors AS connector
  SET agent_session_id = p_agent_session_id,
      last_seen_at = now(),
      updated_at = now()
  WHERE connector.id = v_connector.id;

  INSERT INTO public.teskeid_agent_audit_events (
    space_id,
    conversation_id,
    actor_type,
    connector_id,
    run_id,
    event_type
  )
  VALUES (
    v_run.space_id,
    v_run.conversation_id,
    'connector',
    v_connector.id,
    v_run.id,
    'run.completed'
  );

  RETURN jsonb_build_object(
    'messageId', v_message.id,
    'message', jsonb_build_object(
      'id', v_message.id,
      'conversationId', v_message.conversation_id,
      'body', v_message.body,
      'actorType', v_message.actor_type,
      'authorName', v_message.author_name,
      'createdAt', v_message.created_at
    ),
    'run', jsonb_build_object('id', v_run.id, 'status', v_run.status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teskeid_agent_fail_run(
  p_token_hash text,
  p_run_id uuid,
  p_lease_owner_id uuid,
  p_lease_id uuid,
  p_failure_category text,
  p_failure_idempotency_key text,
  p_retryable boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connector public.teskeid_agent_connectors%ROWTYPE;
  v_run public.teskeid_agent_runs%ROWTYPE;
  v_next_status text;
BEGIN
  IF p_failure_category IS NULL
     OR p_failure_category !~ '^[a-z0-9._-]{1,80}$'
     OR char_length(coalesce(p_failure_idempotency_key, '')) NOT BETWEEN 8 AND 200
     OR p_failure_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'agent_run_failure_invalid';
  END IF;

  SELECT connector.*
  INTO v_connector
  FROM public.teskeid_agent_connectors AS connector
  WHERE connector.token_hash = p_token_hash
    AND connector.status = 'active'
    AND connector.policy = 'read_only_reply'
    AND connector.token_expires_at > now()
    AND public.teskeid_agent_has_beta_access(connector.created_by, connector.created_at)
  FOR UPDATE;

  IF v_connector.id IS NULL THEN
    RAISE EXCEPTION 'agent_connector_unavailable';
  END IF;

  SELECT run.*
  INTO v_run
  FROM public.teskeid_agent_runs AS run
  WHERE run.id = p_run_id
    AND run.space_id = v_connector.space_id
    AND run.conversation_id = v_connector.conversation_id
    AND run.connector_id = v_connector.id
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'agent_run_lease_unavailable';
  END IF;

  -- Exact retry of a previously recorded failure is a no-op.
  IF v_run.last_failure_idempotency_key = p_failure_idempotency_key
     AND v_run.failure_category = p_failure_category
     AND v_run.last_failure_lease_id = p_lease_id
     AND v_run.last_failure_lease_owner_id = p_lease_owner_id
     AND v_run.status IN ('queued', 'failed') THEN
    RETURN jsonb_build_object(
      'runId', v_run.id,
      'status', v_run.status,
      'retryAt', CASE WHEN v_run.status = 'queued' THEN v_run.available_at ELSE NULL END
    );
  END IF;

  IF v_run.status <> 'leased'
     OR v_run.lease_owner_id <> p_lease_owner_id
     OR v_run.lease_id <> p_lease_id
     OR v_run.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'agent_run_lease_unavailable';
  END IF;

  v_next_status := CASE
    WHEN coalesce(p_retryable, false) AND v_run.attempt_count < 3 THEN 'queued'
    ELSE 'failed'
  END;

  UPDATE public.teskeid_agent_runs AS run
  SET status = v_next_status,
      lease_id = CASE WHEN v_next_status = 'queued' THEN NULL ELSE run.lease_id END,
      lease_owner_id = CASE WHEN v_next_status = 'queued' THEN NULL ELSE run.lease_owner_id END,
      lease_expires_at = CASE WHEN v_next_status = 'queued' THEN NULL ELSE run.lease_expires_at END,
      heartbeat_at = CASE WHEN v_next_status = 'queued' THEN NULL ELSE run.heartbeat_at END,
      available_at = CASE
        WHEN v_next_status = 'queued'
        THEN now() + make_interval(secs => least(60, greatest(15, run.attempt_count * 15)))
        ELSE run.available_at
      END,
      last_failure_idempotency_key = p_failure_idempotency_key,
      last_failure_lease_id = p_lease_id,
      last_failure_lease_owner_id = p_lease_owner_id,
      failure_category = p_failure_category,
      failed_at = CASE WHEN v_next_status = 'failed' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE run.id = v_run.id
  RETURNING * INTO v_run;

  UPDATE public.teskeid_agent_connectors AS connector
  SET last_seen_at = now(), updated_at = now()
  WHERE connector.id = v_connector.id;

  INSERT INTO public.teskeid_agent_audit_events (
    space_id,
    conversation_id,
    actor_type,
    connector_id,
    run_id,
    event_type,
    details
  )
  VALUES (
    v_run.space_id,
    v_run.conversation_id,
    'connector',
    v_connector.id,
    v_run.id,
    CASE WHEN v_run.status = 'queued' THEN 'run.retry_scheduled' ELSE 'run.failed' END,
    jsonb_build_object(
      'failureCategory', p_failure_category,
      'attempt', v_run.attempt_count
    )
  );

  RETURN jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'retryAt', CASE WHEN v_run.status = 'queued' THEN v_run.available_at ELSE NULL END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC grants. Browser roles get only user-scoped functions. Connector
-- operations are service_role-only; table access remains unavailable.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.teskeid_agent_bootstrap()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_get_summary()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_list_messages(uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_send_message(uuid, text, uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_mark_read(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_create_pairing(uuid, text, timestamptz, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teskeid_agent_revoke_connector(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.teskeid_agent_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_get_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_list_messages(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_send_message(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_mark_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_create_pairing(uuid, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_revoke_connector(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.teskeid_agent_exchange_pairing(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_agent_claim_run(text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_agent_heartbeat_run(text, uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_agent_complete_run(text, uuid, uuid, uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_agent_fail_run(text, uuid, uuid, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.teskeid_agent_exchange_pairing(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_claim_run(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_heartbeat_run(text, uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_complete_run(text, uuid, uuid, uuid, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_agent_fail_run(text, uuid, uuid, uuid, text, text, boolean) TO service_role;

COMMENT ON TABLE public.teskeid_agent_conversations IS
  'Private, space-scoped provider-neutral coding-agent conversations.';
COMMENT ON TABLE public.teskeid_agent_connectors IS
  'Revocable, expiring coding-agent connectors; stores HMAC token hashes only.';
COMMENT ON TABLE public.teskeid_agent_runs IS
  'Bounded read_only_reply queue with retries, idempotency and fenced leases.';

COMMIT;

-- Recovery / rollback plan (run only with separate approval):
-- DROP FUNCTION IF EXISTS public.teskeid_agent_fail_run(text, uuid, uuid, uuid, text, text, boolean);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_complete_run(text, uuid, uuid, uuid, text, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_heartbeat_run(text, uuid, uuid, uuid, integer);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_claim_run(text, uuid, integer);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_exchange_pairing(text, text, text);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_revoke_connector(uuid);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_create_pairing(uuid, text, timestamptz, text, text);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_mark_read(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_send_message(uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_list_messages(uuid, timestamptz, uuid, integer);
-- DROP FUNCTION IF EXISTS public.teskeid_agent_get_summary();
-- DROP FUNCTION IF EXISTS public.teskeid_agent_bootstrap();
-- DROP FUNCTION IF EXISTS public.teskeid_agent_has_beta_access(uuid, timestamptz);
-- DROP TRIGGER IF EXISTS teskeid_agent_messages_after_insert ON public.teskeid_agent_messages;
-- DROP FUNCTION IF EXISTS public.teskeid_agent_on_message_insert();
-- DROP TABLE IF EXISTS public.teskeid_agent_audit_events;
-- DROP TABLE IF EXISTS public.teskeid_agent_read_cursors;
-- DROP TABLE IF EXISTS public.teskeid_agent_runs;
-- DROP TABLE IF EXISTS public.teskeid_agent_messages;
-- DROP TABLE IF EXISTS public.teskeid_agent_connectors;
-- DROP TABLE IF EXISTS public.teskeid_agent_pairing_sessions;
-- DROP TABLE IF EXISTS public.teskeid_agent_conversations;
-- ALTER TABLE public.feature_access
--   DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
-- ALTER TABLE public.feature_access
--   ADD CONSTRAINT feature_access_feature_key_check
--   CHECK (feature_key IN (
--     'umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid',
--     'elta-vedrid', 'weather-provider-vedurstofan', 'weather-pulse',
--     'weather-provider-vegagerdin', 'road-intelligence-v1',
--     'teskeid-routing-v1'
--   ));
