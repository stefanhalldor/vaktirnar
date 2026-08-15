-- TODO #097 / SQL130: customizable, versioned booking workflows.
-- Additive and forward-only. DO NOT RUN automatically. Stebbi applies this
-- migration manually only after the dedicated read-only preflight is green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';
SET LOCAL search_path = pg_catalog;

DO $booking_workflow_preconditions$
DECLARE
  v_signature text;
  v_oid oid;
  v_collision text;
  v_null_scope bigint;
  v_missing_service bigint;
  v_snapshot_mismatch bigint;
  v_cancel_inconsistent bigint;
BEGIN
  IF current_user <> 'postgres'
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user AND role.rolsuper
     ) THEN
    RAISE EXCEPTION 'booking_workflow_migration_owner_must_be_postgres_or_superuser:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'postgres' AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'booking_workflow_postgres_owner_unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
  ) THEN
    RAISE EXCEPTION 'booking_workflow_service_role_unavailable';
  END IF;

  IF pg_catalog.to_regclass('public.booking_services') IS NULL
     OR pg_catalog.to_regclass('public.booking_requests') IS NULL
     OR pg_catalog.to_regclass('public.booking_events') IS NULL
     OR pg_catalog.to_regclass('public.booking_access_members') IS NULL
     OR pg_catalog.to_regclass('public.booking_capability_sessions') IS NULL
     OR pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR pg_catalog.to_regprocedure('public.booking_provider_allowed(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.booking_assert_provider(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.booking_authorize_request(uuid,uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.booking_events_immutable()') IS NULL
     OR pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_request_projection(uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_provider_list_services(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_provider_list_requests(uuid,uuid,uuid,timestamp with time zone,uuid,integer)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_cancel_request(uuid,uuid,text,integer,uuid)'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.booking_requests')
         AND trigger_row.tgname = 'booking_requests_require_contact_phone'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'booking_workflow_prerequisites_missing';
  END IF;

  -- SQL129 is an orthogonal security contract. Verify the wrapper and the
  -- exact base creator completely before any schema mutation occurs.
  FOR v_signature IN
    SELECT signature FROM (VALUES
      ('public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'),
      ('public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)')
    ) AS expected(signature)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF v_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_oid
        AND procedure_row.prosecdef
        AND procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.jsonb')
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) AS setting
          WHERE setting IN ('search_path=', 'search_path=""')
        )
        AND pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
          ) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type = 'EXECUTE'
            AND privilege.grantee <> procedure_row.proowner
            AND (
              grantee.rolname IS DISTINCT FROM 'service_role'
              OR privilege.is_grantable
            )
        )
    ) THEN
      RAISE EXCEPTION 'booking_workflow_sql129_contract_drift:%', v_signature;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS wrapper
    WHERE wrapper.oid = pg_catalog.to_regprocedure(
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
    )
      AND pg_catalog.strpos(wrapper.prosrc, 'public.booking_create_request') > 0
      AND pg_catalog.strpos(
        wrapper.prosrc,
        $needle$COALESCE((v_result ->> 'created')::boolean, false)$needle$
      ) > 0
  ) THEN
    RAISE EXCEPTION 'booking_workflow_sql129_delegation_drift';
  END IF;

  SELECT target.name INTO v_collision
  FROM (VALUES
    ('booking_workflows'),
    ('booking_workflow_versions'),
    ('booking_workflow_states'),
    ('booking_workflow_transitions'),
    ('booking_workflow_mutations')
  ) AS target(name)
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
  ORDER BY target.name
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'booking_workflow_target_collision:%', v_collision;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND (
        (column_row.table_name = 'booking_services' AND column_row.column_name IN (
          'workflow_id', 'active_workflow_version_id', 'active_workflow_version_status'
        ))
        OR (column_row.table_name = 'booking_requests' AND column_row.column_name IN (
          'workflow_space_id', 'workflow_business_profile_id', 'workflow_id',
          'workflow_version_id', 'workflow_version_status', 'workflow_state_id',
          'cancellation_reason'
        ))
        OR (column_row.table_name = 'booking_events' AND column_row.column_name IN (
          'workflow_version_id', 'from_workflow_state_id', 'to_workflow_state_id',
          'cancellation_reason'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'booking_workflow_column_collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
        procedure_row.proname IN (
        'booking_workflow_version_immutable',
        'booking_workflow_graph_mutable',
        'booking_workflow_mutation_immutable',
        'booking_workflow_graph_fingerprint',
        'booking_workflow_input_fingerprint',
        'booking_validate_workflow_version',
        'booking_provision_default_workflow',
        'booking_assign_default_workflow_on_service_insert',
        'booking_assign_workflow_on_request_insert',
        'booking_workflow_graph_projection',
        'booking_provider_read_workflow',
        'booking_provider_ensure_workflow_draft',
        'booking_provider_save_workflow_draft',
        'booking_provider_publish_workflow_draft',
        'booking_transition_request',
          'booking_cancel_request_with_reason'
        )
        OR procedure_row.oid = pg_catalog.to_regprocedure(
          'public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer)'
        )
      )
  ) THEN
    RAISE EXCEPTION 'booking_workflow_function_collision';
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NULL
         OR request_row.business_profile_id IS NULL
         OR request_row.service_id IS NULL
    ),
    pg_catalog.count(*) FILTER (
      WHERE request_row.space_id IS NOT NULL
        AND service.id IS NULL
    ),
    pg_catalog.count(*) FILTER (
      WHERE request_row.service_id IS NOT NULL
        AND request_row.service_id_snapshot IS DISTINCT FROM request_row.service_id
    )
  INTO v_null_scope, v_missing_service, v_snapshot_mismatch
  FROM public.booking_requests AS request_row
  LEFT JOIN public.booking_services AS service
    ON service.space_id = request_row.space_id
   AND service.business_profile_id = request_row.business_profile_id
   AND service.id = request_row.service_id;

  SELECT pg_catalog.count(*) INTO v_cancel_inconsistent
  FROM public.booking_requests AS request_row
  WHERE (request_row.status = 'cancelled') IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.booking_events AS event_row
    WHERE event_row.booking_request_id = request_row.id
      AND event_row.event_type = 'request_cancelled'
  );

  IF v_null_scope > 0
     OR v_missing_service > 0
     OR v_snapshot_mismatch > 0
     OR v_cancel_inconsistent > 0 THEN
    RAISE EXCEPTION
      'booking_workflow_backfill_scope_invalid:null=% missing=% snapshot=% cancellation=%',
      v_null_scope, v_missing_service, v_snapshot_mismatch, v_cancel_inconsistent;
  END IF;
END;
$booking_workflow_preconditions$;

CREATE TABLE public.booking_workflows (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  service_id_snapshot uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_workflows_pkey PRIMARY KEY (id),
  CONSTRAINT booking_workflows_revision_check CHECK (revision > 0),
  CONSTRAINT booking_workflows_scope_id_key UNIQUE (space_id, business_profile_id, id),
  CONSTRAINT booking_workflows_service_id_key UNIQUE (service_id_snapshot),
  CONSTRAINT booking_workflows_scope_service_id_key
    UNIQUE (space_id, business_profile_id, service_id_snapshot, id),
  CONSTRAINT booking_workflows_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_workflows_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.booking_workflow_versions (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  graph_fingerprint text,
  created_by uuid,
  published_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  published_at timestamp with time zone,
  CONSTRAINT booking_workflow_versions_pkey PRIMARY KEY (id),
  CONSTRAINT booking_workflow_versions_number_check CHECK (version_number > 0),
  CONSTRAINT booking_workflow_versions_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT booking_workflow_versions_revision_check CHECK (revision > 0),
  CONSTRAINT booking_workflow_versions_fingerprint_check CHECK (
    graph_fingerprint IS NULL OR graph_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT booking_workflow_versions_publish_check CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL AND graph_fingerprint IS NOT NULL)
  ),
  CONSTRAINT booking_workflow_versions_workflow_fk
    FOREIGN KEY (space_id, business_profile_id, workflow_id)
    REFERENCES public.booking_workflows(space_id, business_profile_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_versions_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_workflow_versions_published_by_fk
    FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_workflow_versions_number_key UNIQUE (workflow_id, version_number),
  CONSTRAINT booking_workflow_versions_scope_id_key
    UNIQUE (space_id, business_profile_id, workflow_id, id),
  CONSTRAINT booking_workflow_versions_scope_id_status_key
    UNIQUE (space_id, business_profile_id, workflow_id, id, status)
);

CREATE UNIQUE INDEX booking_workflow_versions_one_draft_idx
  ON public.booking_workflow_versions (workflow_id)
  WHERE status = 'draft';

CREATE TABLE public.booking_workflow_states (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  logical_key text NOT NULL,
  system_label_key text,
  provider_label text,
  customer_label text,
  sort_order integer NOT NULL,
  is_initial boolean NOT NULL DEFAULT false,
  semantic_kind text NOT NULL DEFAULT 'active',
  attention_side text NOT NULL DEFAULT 'none',
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_workflow_states_pkey PRIMARY KEY (id),
  CONSTRAINT booking_workflow_states_system_label_check CHECK (
    system_label_key IS NULL OR system_label_key IN (
      'new_request', 'under_review', 'waiting_customer',
      'waiting_provider', 'confirmed'
    )
  ),
  CONSTRAINT booking_workflow_states_logical_key_check CHECK (
    pg_catalog.char_length(logical_key) BETWEEN 1 AND 64
    AND logical_key ~ '^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$'
  ),
  CONSTRAINT booking_workflow_states_provider_label_check CHECK (
    provider_label IS NULL OR (
      provider_label = pg_catalog.btrim(provider_label)
      AND pg_catalog.char_length(provider_label) BETWEEN 1 AND 80
      AND provider_label !~ '[[:cntrl:]]'
      AND provider_label !~ '[<>`*_#~()]'
      AND pg_catalog.strpos(provider_label, '[') = 0
      AND pg_catalog.strpos(provider_label, ']') = 0
    )
  ),
  CONSTRAINT booking_workflow_states_customer_label_check CHECK (
    customer_label IS NULL OR (
      customer_label = pg_catalog.btrim(customer_label)
      AND pg_catalog.char_length(customer_label) BETWEEN 1 AND 80
      AND customer_label !~ '[[:cntrl:]]'
      AND customer_label !~ '[<>`*_#~()]'
      AND pg_catalog.strpos(customer_label, '[') = 0
      AND pg_catalog.strpos(customer_label, ']') = 0
    )
  ),
  CONSTRAINT booking_workflow_states_label_source_check CHECK (
    (system_label_key IS NOT NULL AND provider_label IS NULL AND customer_label IS NULL)
    OR (system_label_key IS NULL AND provider_label IS NOT NULL AND customer_label IS NOT NULL)
  ),
  CONSTRAINT booking_workflow_states_sort_check CHECK (sort_order BETWEEN 0 AND 19),
  CONSTRAINT booking_workflow_states_semantic_check CHECK (
    semantic_kind IN ('active', 'confirmed')
  ),
  CONSTRAINT booking_workflow_states_attention_check CHECK (
    attention_side IN ('provider', 'customer', 'none')
  ),
  CONSTRAINT booking_workflow_states_version_fk
    FOREIGN KEY (space_id, business_profile_id, workflow_id, workflow_version_id)
    REFERENCES public.booking_workflow_versions(space_id, business_profile_id, workflow_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_states_version_id_key
    UNIQUE (workflow_version_id, id),
  CONSTRAINT booking_workflow_states_scope_id_key
    UNIQUE (space_id, business_profile_id, workflow_id, workflow_version_id, id),
  CONSTRAINT booking_workflow_states_logical_key
    UNIQUE (workflow_version_id, logical_key),
  CONSTRAINT booking_workflow_states_sort_key
    UNIQUE (workflow_version_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX booking_workflow_states_one_initial_idx
  ON public.booking_workflow_states (workflow_version_id)
  WHERE is_initial;

CREATE UNIQUE INDEX booking_workflow_states_one_confirmed_idx
  ON public.booking_workflow_states (workflow_version_id)
  WHERE semantic_kind = 'confirmed';

CREATE TABLE public.booking_workflow_transitions (
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  from_state_id uuid NOT NULL,
  to_state_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_workflow_transitions_pkey
    PRIMARY KEY (workflow_version_id, from_state_id, to_state_id),
  CONSTRAINT booking_workflow_transitions_no_self_check CHECK (from_state_id <> to_state_id),
  CONSTRAINT booking_workflow_transitions_version_fk
    FOREIGN KEY (space_id, business_profile_id, workflow_id, workflow_version_id)
    REFERENCES public.booking_workflow_versions(space_id, business_profile_id, workflow_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_transitions_from_fk
    FOREIGN KEY (
      space_id, business_profile_id, workflow_id, workflow_version_id, from_state_id
    ) REFERENCES public.booking_workflow_states(
      space_id, business_profile_id, workflow_id, workflow_version_id, id
    ) ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_transitions_to_fk
    FOREIGN KEY (
      space_id, business_profile_id, workflow_id, workflow_version_id, to_state_id
    ) REFERENCES public.booking_workflow_states(
      space_id, business_profile_id, workflow_id, workflow_version_id, id
    ) ON DELETE RESTRICT
);

CREATE TABLE public.booking_workflow_mutations (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  expected_revision integer NOT NULL,
  idempotency_key uuid NOT NULL,
  operation_fingerprint text NOT NULL,
  result_workflow_revision integer NOT NULL,
  result_version_revision integer,
  result_created boolean,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT booking_workflow_mutations_pkey PRIMARY KEY (id),
  CONSTRAINT booking_workflow_mutations_action_check CHECK (
    action IN ('ensure_draft', 'save_draft', 'publish_draft')
  ),
  CONSTRAINT booking_workflow_mutations_revision_check CHECK (
    expected_revision > 0
    AND result_workflow_revision > 0
    AND (result_version_revision IS NULL OR result_version_revision > 0)
  ),
  CONSTRAINT booking_workflow_mutations_fingerprint_check CHECK (
    operation_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT booking_workflow_mutations_workflow_fk
    FOREIGN KEY (space_id, business_profile_id, workflow_id)
    REFERENCES public.booking_workflows(space_id, business_profile_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_mutations_version_fk
    FOREIGN KEY (space_id, business_profile_id, workflow_id, workflow_version_id)
    REFERENCES public.booking_workflow_versions(space_id, business_profile_id, workflow_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT booking_workflow_mutations_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_workflow_mutations_idempotency_key
    UNIQUE (workflow_id, idempotency_key)
);

ALTER TABLE public.booking_services
  ADD COLUMN workflow_id uuid,
  ADD COLUMN active_workflow_version_id uuid,
  ADD COLUMN active_workflow_version_status text NOT NULL DEFAULT 'published';

ALTER TABLE public.booking_requests
  ADD COLUMN workflow_space_id uuid,
  ADD COLUMN workflow_business_profile_id uuid,
  ADD COLUMN workflow_id uuid,
  ADD COLUMN workflow_version_id uuid,
  ADD COLUMN workflow_version_status text NOT NULL DEFAULT 'published',
  ADD COLUMN workflow_state_id uuid,
  ADD COLUMN cancellation_reason text;

ALTER TABLE public.booking_events
  ADD COLUMN workflow_version_id uuid,
  ADD COLUMN from_workflow_state_id uuid,
  ADD COLUMN to_workflow_state_id uuid,
  ADD COLUMN cancellation_reason text GENERATED ALWAYS AS (
    CASE
      WHEN event_type = 'request_cancelled'
      THEN COALESCE(event_data ->> 'cancellationReason', 'legacy_unspecified')
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.booking_events DROP CONSTRAINT booking_events_type_check;
ALTER TABLE public.booking_events
  ADD CONSTRAINT booking_events_type_check CHECK (
    event_type IN (
      'request_submitted', 'booking_claimed', 'member_added', 'member_revoked',
      'request_cancelled', 'discount_applied', 'workflow_state_changed'
    )
  );

ALTER TABLE public.booking_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_transitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_workflow_mutations FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.booking_workflows,
  public.booking_workflow_versions,
  public.booking_workflow_states,
  public.booking_workflow_transitions,
  public.booking_workflow_mutations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.booking_workflow_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'booking_workflow_published_immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    IF (OLD.created_by IS NOT DISTINCT FROM NEW.created_by OR (
          OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
        ))
       AND (OLD.published_by IS NOT DISTINCT FROM NEW.published_by OR (
          OLD.published_by IS NOT NULL AND NEW.published_by IS NULL
        ))
       AND (pg_catalog.to_jsonb(NEW) - ARRAY['created_by', 'published_by']) =
           (pg_catalog.to_jsonb(OLD) - ARRAY['created_by', 'published_by']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'booking_workflow_published_immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.booking_workflow_graph_projection(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_version public.booking_workflow_versions%ROWTYPE;
  v_states jsonb;
  v_transitions jsonb;
BEGIN
  SELECT version_row.* INTO v_version
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.id = p_version_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', state.id,
      'logicalKey', state.logical_key,
      'systemLabelKey', state.system_label_key,
      'providerLabel', state.provider_label,
      'customerLabel', state.customer_label,
      'sortOrder', state.sort_order,
      'isInitial', state.is_initial,
      'semanticKind', state.semantic_kind,
      'attentionSide', state.attention_side
    ) ORDER BY state.sort_order, state.id
  ), '[]'::jsonb) INTO v_states
  FROM public.booking_workflow_states AS state
  WHERE state.workflow_version_id = p_version_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'fromStateId', edge.from_state_id,
      'toStateId', edge.to_state_id
    ) ORDER BY edge.from_state_id, edge.to_state_id
  ), '[]'::jsonb) INTO v_transitions
  FROM public.booking_workflow_transitions AS edge
  WHERE edge.workflow_version_id = p_version_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_version.id,
    'versionNumber', v_version.version_number,
    'status', v_version.status,
    'revision', v_version.revision,
    'graphFingerprint', v_version.graph_fingerprint,
    'publishedAt', v_version.published_at,
    'states', v_states,
    'transitions', v_transitions
  );
END;
$$;

CREATE FUNCTION public.booking_provider_read_workflow(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_workflow public.booking_workflows%ROWTYPE;
  v_draft_id uuid;
BEGIN
  PERFORM public.booking_assert_provider(p_actor_id, p_space_id);

  SELECT service.* INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = p_service_id
    AND service.space_id = p_space_id
    AND service.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT workflow.* INTO v_workflow
  FROM public.booking_workflows AS workflow
  WHERE workflow.id = v_service.workflow_id
    AND workflow.space_id = v_service.space_id
    AND workflow.business_profile_id = v_service.business_profile_id
    AND workflow.service_id_snapshot = v_service.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT version_row.id INTO v_draft_id
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.workflow_id = v_workflow.id
    AND version_row.status = 'draft';

  RETURN pg_catalog.jsonb_build_object(
    'workflow', pg_catalog.jsonb_build_object(
      'id', v_workflow.id,
      'serviceId', v_service.id,
      'revision', v_workflow.revision
    ),
    'activeVersion', public.booking_workflow_graph_projection(
      v_service.active_workflow_version_id
    ),
    'draftVersion', CASE WHEN v_draft_id IS NULL THEN NULL
      ELSE public.booking_workflow_graph_projection(v_draft_id) END
  );
END;
$$;

CREATE FUNCTION public.booking_provider_ensure_workflow_draft(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid,
  p_expected_workflow_revision integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_workflow public.booking_workflows%ROWTYPE;
  v_version public.booking_workflow_versions%ROWTYPE;
  v_receipt public.booking_workflow_mutations%ROWTYPE;
  v_fingerprint text;
  v_created boolean := false;
  v_new_workflow_revision integer;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL OR p_service_id IS NULL
     OR p_expected_workflow_revision IS NULL OR p_expected_workflow_revision <= 0
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT service.* INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = p_service_id AND service.space_id = p_space_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT workflow.* INTO v_workflow
  FROM public.booking_workflows AS workflow
  WHERE workflow.id = v_service.workflow_id
    AND workflow.space_id = v_service.space_id
    AND workflow.business_profile_id = v_service.business_profile_id
    AND workflow.service_id_snapshot = v_service.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'ensure_draft',
    'serviceId', p_service_id,
    'expectedRevision', p_expected_workflow_revision
  )::text);

  SELECT mutation.* INTO v_receipt
  FROM public.booking_workflow_mutations AS mutation
  WHERE mutation.workflow_id = v_workflow.id
    AND mutation.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_receipt.action <> 'ensure_draft'
       OR v_receipt.actor_user_id IS DISTINCT FROM p_actor_id
       OR v_receipt.expected_revision <> p_expected_workflow_revision
       OR v_receipt.operation_fingerprint <> v_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user
         WHERE auth_user.id = p_actor_id
           AND auth_user.email_confirmed_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'workflowId', v_workflow.id,
      'versionId', v_receipt.workflow_version_id,
      'workflowRevision', v_receipt.result_workflow_revision,
      'versionRevision', v_receipt.result_version_revision,
      'created', v_receipt.result_created,
      'replayed', true
    );
  END IF;

  IF v_service.archived_at IS NOT NULL
     OR NOT public.booking_provider_allowed(p_actor_id, p_space_id) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_workflow.revision <> p_expected_workflow_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;

  SELECT version_row.* INTO v_version
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.workflow_id = v_workflow.id
    AND version_row.status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.booking_workflow_versions (
      space_id, business_profile_id, workflow_id, version_number,
      status, revision, graph_fingerprint, created_by
    )
    SELECT
      v_workflow.space_id,
      v_workflow.business_profile_id,
      v_workflow.id,
      COALESCE(pg_catalog.max(existing.version_number), 0) + 1,
      'draft',
      1,
      NULL,
      p_actor_id
    FROM public.booking_workflow_versions AS existing
    WHERE existing.workflow_id = v_workflow.id
    RETURNING * INTO v_version;

    INSERT INTO public.booking_workflow_states (
      space_id, business_profile_id, workflow_id, workflow_version_id,
      logical_key, system_label_key, provider_label, customer_label,
      sort_order, is_initial, semantic_kind, attention_side
    )
    SELECT
      source.space_id,
      source.business_profile_id,
      source.workflow_id,
      v_version.id,
      source.logical_key,
      source.system_label_key,
      source.provider_label,
      source.customer_label,
      source.sort_order,
      source.is_initial,
      source.semantic_kind,
      source.attention_side
    FROM public.booking_workflow_states AS source
    WHERE source.workflow_version_id = v_service.active_workflow_version_id
    ORDER BY source.sort_order;

    INSERT INTO public.booking_workflow_transitions (
      space_id, business_profile_id, workflow_id, workflow_version_id,
      from_state_id, to_state_id
    )
    SELECT
      v_workflow.space_id,
      v_workflow.business_profile_id,
      v_workflow.id,
      v_version.id,
      draft_from.id,
      draft_to.id
    FROM public.booking_workflow_transitions AS source_edge
    JOIN public.booking_workflow_states AS active_from
      ON active_from.id = source_edge.from_state_id
    JOIN public.booking_workflow_states AS active_to
      ON active_to.id = source_edge.to_state_id
    JOIN public.booking_workflow_states AS draft_from
      ON draft_from.workflow_version_id = v_version.id
     AND draft_from.logical_key = active_from.logical_key
    JOIN public.booking_workflow_states AS draft_to
      ON draft_to.workflow_version_id = v_version.id
     AND draft_to.logical_key = active_to.logical_key
    WHERE source_edge.workflow_version_id = v_service.active_workflow_version_id;

    UPDATE public.booking_workflow_versions AS version_row
    SET graph_fingerprint = public.booking_workflow_graph_fingerprint(v_version.id)
    WHERE version_row.id = v_version.id
    RETURNING * INTO v_version;

    UPDATE public.booking_workflows AS workflow
    SET revision = workflow.revision + 1,
        updated_by = p_actor_id,
        updated_at = pg_catalog.now()
    WHERE workflow.id = v_workflow.id
      AND workflow.revision = p_expected_workflow_revision
    RETURNING workflow.revision INTO v_new_workflow_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;
    v_created := true;
  ELSE
    v_new_workflow_revision := v_workflow.revision;
  END IF;

  INSERT INTO public.booking_workflow_mutations (
    space_id, business_profile_id, workflow_id, workflow_version_id,
    action, actor_user_id, expected_revision, idempotency_key,
    operation_fingerprint, result_workflow_revision,
    result_version_revision, result_created
  ) VALUES (
    v_workflow.space_id, v_workflow.business_profile_id, v_workflow.id, v_version.id,
    'ensure_draft', p_actor_id, p_expected_workflow_revision, p_idempotency_key,
    v_fingerprint, v_new_workflow_revision, v_version.revision, v_created
  );

  RETURN pg_catalog.jsonb_build_object(
    'workflowId', v_workflow.id,
    'versionId', v_version.id,
    'workflowRevision', v_new_workflow_revision,
    'versionRevision', v_version.revision,
    'created', v_created,
    'replayed', false
  );
END;
$$;

CREATE FUNCTION public.booking_workflow_graph_fingerprint(p_version_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH state_graph AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', state.id,
        'logicalKey', state.logical_key,
        'systemLabelKey', state.system_label_key,
        'providerLabel', state.provider_label,
        'customerLabel', state.customer_label,
        'sortOrder', state.sort_order,
        'isInitial', state.is_initial,
        'semanticKind', state.semantic_kind,
        'attentionSide', state.attention_side
      ) ORDER BY state.sort_order, state.id
    ), '[]'::jsonb) AS value
    FROM public.booking_workflow_states AS state
    WHERE state.workflow_version_id = p_version_id
  ), edge_graph AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(edge.from_state_id, edge.to_state_id)
      ORDER BY edge.from_state_id, edge.to_state_id
    ), '[]'::jsonb) AS value
    FROM public.booking_workflow_transitions AS edge
    WHERE edge.workflow_version_id = p_version_id
  )
  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'states', state_graph.value,
    'transitions', edge_graph.value
  )::text)
  FROM state_graph CROSS JOIN edge_graph;
$$;

CREATE FUNCTION public.booking_validate_workflow_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_state_count integer;
  v_edge_count integer;
  v_initial_count integer;
  v_confirmed_count integer;
  v_reachable_count integer;
  v_sort_min integer;
  v_sort_max integer;
BEGIN
  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE state.is_initial)::integer,
    pg_catalog.count(*) FILTER (WHERE state.semantic_kind = 'confirmed')::integer,
    pg_catalog.min(state.sort_order),
    pg_catalog.max(state.sort_order)
  INTO v_state_count, v_initial_count, v_confirmed_count, v_sort_min, v_sort_max
  FROM public.booking_workflow_states AS state
  WHERE state.workflow_version_id = p_version_id;

  SELECT pg_catalog.count(*)::integer INTO v_edge_count
  FROM public.booking_workflow_transitions AS edge
  WHERE edge.workflow_version_id = p_version_id;

  IF v_state_count NOT BETWEEN 1 AND 20
     OR v_edge_count > 100
     OR v_initial_count <> 1
     OR v_confirmed_count <> 1
     OR v_sort_min <> 0
     OR v_sort_max <> v_state_count - 1 THEN
    RAISE EXCEPTION 'booking_workflow_invalid_graph';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_workflow_transitions AS edge
    JOIN public.booking_workflow_states AS source ON source.id = edge.from_state_id
    WHERE edge.workflow_version_id = p_version_id
      AND source.semantic_kind = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'booking_workflow_invalid_graph';
  END IF;

  WITH RECURSIVE reachable(state_id) AS (
    SELECT state.id
    FROM public.booking_workflow_states AS state
    WHERE state.workflow_version_id = p_version_id AND state.is_initial
    UNION
    SELECT edge.to_state_id
    FROM public.booking_workflow_transitions AS edge
    JOIN reachable ON reachable.state_id = edge.from_state_id
    WHERE edge.workflow_version_id = p_version_id
  )
  SELECT pg_catalog.count(*)::integer INTO v_reachable_count FROM reachable;

  IF v_reachable_count <> v_state_count THEN
    RAISE EXCEPTION 'booking_workflow_invalid_graph';
  END IF;
END;
$$;

CREATE FUNCTION public.booking_provision_default_workflow(
  p_space_id uuid,
  p_business_profile_id uuid,
  p_service_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (workflow_id uuid, version_id uuid, initial_state_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workflow_id uuid := pg_catalog.gen_random_uuid();
  v_version_id uuid := pg_catalog.gen_random_uuid();
  v_new_id uuid := pg_catalog.gen_random_uuid();
  v_review_id uuid := pg_catalog.gen_random_uuid();
  v_wait_customer_id uuid := pg_catalog.gen_random_uuid();
  v_wait_provider_id uuid := pg_catalog.gen_random_uuid();
  v_confirmed_id uuid := pg_catalog.gen_random_uuid();
  v_new_key text := 'new_request';
  v_review_key text := 'under_review';
  v_wait_customer_key text := 'waiting_customer';
  v_wait_provider_key text := 'waiting_provider';
  v_confirmed_key text := 'confirmed';
  v_fingerprint text;
BEGIN
  IF p_space_id IS NULL OR p_business_profile_id IS NULL OR p_service_id IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  INSERT INTO public.booking_workflows (
    id, space_id, business_profile_id, service_id_snapshot, created_by, updated_by
  ) VALUES (
    v_workflow_id, p_space_id, p_business_profile_id, p_service_id,
    p_actor_id, p_actor_id
  );

  INSERT INTO public.booking_workflow_versions (
    id, space_id, business_profile_id, workflow_id, version_number,
    status, revision, created_by
  ) VALUES (
    v_version_id, p_space_id, p_business_profile_id, v_workflow_id, 1,
    'draft', 1, p_actor_id
  );

  INSERT INTO public.booking_workflow_states (
    id, space_id, business_profile_id, workflow_id, workflow_version_id,
    logical_key, system_label_key, provider_label, customer_label,
    sort_order, is_initial, semantic_kind, attention_side
  ) VALUES
    (v_new_id, p_space_id, p_business_profile_id, v_workflow_id, v_version_id,
      v_new_key, 'new_request', NULL, NULL, 0, true, 'active', 'provider'),
    (v_review_id, p_space_id, p_business_profile_id, v_workflow_id, v_version_id,
      v_review_key, 'under_review', NULL, NULL, 1, false, 'active', 'provider'),
    (v_wait_customer_id, p_space_id, p_business_profile_id, v_workflow_id, v_version_id,
      v_wait_customer_key, 'waiting_customer', NULL, NULL, 2, false, 'active', 'customer'),
    (v_wait_provider_id, p_space_id, p_business_profile_id, v_workflow_id, v_version_id,
      v_wait_provider_key, 'waiting_provider', NULL, NULL, 3, false, 'active', 'provider'),
    (v_confirmed_id, p_space_id, p_business_profile_id, v_workflow_id, v_version_id,
      v_confirmed_key, 'confirmed', NULL, NULL, 4, false, 'confirmed', 'none');

  INSERT INTO public.booking_workflow_transitions (
    space_id, business_profile_id, workflow_id, workflow_version_id,
    from_state_id, to_state_id
  ) VALUES
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_new_id, v_review_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_review_id, v_wait_customer_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_review_id, v_wait_provider_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_review_id, v_confirmed_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_customer_id, v_wait_provider_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_customer_id, v_review_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_customer_id, v_confirmed_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_provider_id, v_wait_customer_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_provider_id, v_review_id),
    (p_space_id, p_business_profile_id, v_workflow_id, v_version_id, v_wait_provider_id, v_confirmed_id);

  PERFORM public.booking_validate_workflow_version(v_version_id);
  v_fingerprint := public.booking_workflow_graph_fingerprint(v_version_id);

  UPDATE public.booking_workflow_versions AS version_row
  SET status = 'published',
      graph_fingerprint = v_fingerprint,
      published_by = p_actor_id,
      published_at = pg_catalog.now()
  WHERE version_row.id = v_version_id;

  RETURN QUERY SELECT v_workflow_id, v_version_id, v_new_id;
END;
$$;

CREATE FUNCTION public.booking_assign_default_workflow_on_service_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default record;
BEGIN
  SELECT * INTO v_default
  FROM public.booking_provision_default_workflow(
    NEW.space_id,
    NEW.business_profile_id,
    NEW.id,
    NEW.created_by
  );

  NEW.workflow_id := v_default.workflow_id;
  NEW.active_workflow_version_id := v_default.version_id;
  NEW.active_workflow_version_status := 'published';
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.booking_assign_workflow_on_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_initial_state_id uuid;
BEGIN
  SELECT service.* INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = NEW.service_id
    AND service.space_id = NEW.space_id
    AND service.business_profile_id = NEW.business_profile_id
    AND service.active_workflow_version_status = 'published'
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_service_unavailable'; END IF;
  IF NEW.service_id_snapshot IS DISTINCT FROM NEW.service_id THEN
    RAISE EXCEPTION 'booking_service_unavailable';
  END IF;

  SELECT state.id INTO v_initial_state_id
  FROM public.booking_workflow_states AS state
  JOIN public.booking_workflow_versions AS version_row
    ON version_row.id = state.workflow_version_id
   AND version_row.workflow_id = state.workflow_id
   AND version_row.space_id = state.space_id
   AND version_row.business_profile_id = state.business_profile_id
  WHERE state.space_id = v_service.space_id
    AND state.business_profile_id = v_service.business_profile_id
    AND state.workflow_id = v_service.workflow_id
    AND state.workflow_version_id = v_service.active_workflow_version_id
    AND state.is_initial
    AND version_row.status = 'published'
  FOR SHARE OF state, version_row;

  IF v_initial_state_id IS NULL THEN RAISE EXCEPTION 'booking_service_unavailable'; END IF;

  NEW.workflow_space_id := v_service.space_id;
  NEW.workflow_business_profile_id := v_service.business_profile_id;
  NEW.workflow_id := v_service.workflow_id;
  NEW.workflow_version_id := v_service.active_workflow_version_id;
  NEW.workflow_version_status := 'published';
  NEW.workflow_state_id := v_initial_state_id;
  NEW.cancellation_reason := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_services_assign_default_workflow
BEFORE INSERT ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.booking_assign_default_workflow_on_service_insert();

CREATE TRIGGER booking_requests_assign_workflow
BEFORE INSERT ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.booking_assign_workflow_on_request_insert();

DO $booking_workflow_backfill$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_default record;
  v_service_count_before bigint;
  v_request_count_before bigint;
  v_event_count_before bigint;
  v_message_count_before bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_service_count_before FROM public.booking_services;
  SELECT pg_catalog.count(*) INTO v_request_count_before FROM public.booking_requests;
  SELECT pg_catalog.count(*) INTO v_event_count_before FROM public.booking_events;
  SELECT pg_catalog.count(*) INTO v_message_count_before FROM public.booking_messages;

  FOR v_service IN
    SELECT service.* FROM public.booking_services AS service ORDER BY service.id FOR UPDATE
  LOOP
    SELECT * INTO v_default
    FROM public.booking_provision_default_workflow(
      v_service.space_id,
      v_service.business_profile_id,
      v_service.id,
      NULL
    );

    UPDATE public.booking_services AS service
    SET workflow_id = v_default.workflow_id,
        active_workflow_version_id = v_default.version_id,
        active_workflow_version_status = 'published'
    WHERE service.id = v_service.id;
  END LOOP;

  UPDATE public.booking_requests AS request_row
  SET workflow_space_id = service.space_id,
      workflow_business_profile_id = service.business_profile_id,
      workflow_id = service.workflow_id,
      workflow_version_id = service.active_workflow_version_id,
      workflow_version_status = 'published',
      workflow_state_id = initial_state.id,
      cancellation_reason = CASE
        WHEN request_row.status = 'cancelled' THEN 'legacy_unspecified'
        ELSE NULL
      END
  FROM public.booking_services AS service
  JOIN public.booking_workflow_states AS initial_state
    ON initial_state.workflow_version_id = service.active_workflow_version_id
   AND initial_state.workflow_id = service.workflow_id
   AND initial_state.space_id = service.space_id
   AND initial_state.business_profile_id = service.business_profile_id
   AND initial_state.is_initial
  WHERE request_row.space_id = service.space_id
    AND request_row.business_profile_id = service.business_profile_id
    AND request_row.service_id = service.id;

  IF (SELECT pg_catalog.count(*) FROM public.booking_services) <> v_service_count_before
     OR (SELECT pg_catalog.count(*) FROM public.booking_requests) <> v_request_count_before
     OR (SELECT pg_catalog.count(*) FROM public.booking_events) <> v_event_count_before
     OR (SELECT pg_catalog.count(*) FROM public.booking_messages) <> v_message_count_before
     OR EXISTS (
       SELECT 1 FROM public.booking_requests AS request_row
       WHERE request_row.workflow_id IS NULL
          OR request_row.workflow_version_id IS NULL
          OR request_row.workflow_state_id IS NULL
     ) THEN
    RAISE EXCEPTION 'booking_workflow_backfill_failed';
  END IF;
END;
$booking_workflow_backfill$;

ALTER TABLE public.booking_services
  ALTER COLUMN workflow_id SET NOT NULL,
  ALTER COLUMN active_workflow_version_id SET NOT NULL;

ALTER TABLE public.booking_services
  ADD CONSTRAINT booking_services_active_version_status_check CHECK (
    active_workflow_version_status = 'published'
  ),
  ADD CONSTRAINT booking_services_workflow_key UNIQUE (workflow_id),
  ADD CONSTRAINT booking_services_workflow_fk
    FOREIGN KEY (space_id, business_profile_id, id, workflow_id)
    REFERENCES public.booking_workflows(
      space_id, business_profile_id, service_id_snapshot, id
    )
    ON DELETE RESTRICT,
  ADD CONSTRAINT booking_services_active_workflow_version_fk
    FOREIGN KEY (
      space_id, business_profile_id, workflow_id,
      active_workflow_version_id, active_workflow_version_status
    ) REFERENCES public.booking_workflow_versions(
      space_id, business_profile_id, workflow_id, id, status
    ) ON DELETE RESTRICT;

ALTER TABLE public.booking_requests
  ALTER COLUMN workflow_space_id SET NOT NULL,
  ALTER COLUMN workflow_business_profile_id SET NOT NULL,
  ALTER COLUMN workflow_id SET NOT NULL,
  ALTER COLUMN workflow_version_id SET NOT NULL,
  ALTER COLUMN workflow_state_id SET NOT NULL;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_workflow_version_status_check CHECK (
    workflow_version_status = 'published'
  ),
  ADD CONSTRAINT booking_requests_workflow_live_scope_check CHECK (
    (space_id IS NULL AND business_profile_id IS NULL AND service_id IS NULL)
    OR (
      space_id IS NOT NULL
      AND business_profile_id IS NOT NULL
      AND service_id IS NOT NULL
      AND space_id = workflow_space_id
      AND business_profile_id = workflow_business_profile_id
      AND service_id = service_id_snapshot
    )
  ),
  ADD CONSTRAINT booking_requests_cancellation_reason_check CHECK (
    (status = 'requested' AND cancellation_reason IS NULL)
    OR (
      status = 'cancelled'
      AND cancellation_reason IS NOT NULL
      AND cancellation_reason IN (
        'customer_cancelled', 'provider_unavailable', 'other', 'legacy_unspecified'
      )
    )
  ),
  ADD CONSTRAINT booking_requests_workflow_fk
    FOREIGN KEY (
      workflow_space_id, workflow_business_profile_id, service_id_snapshot, workflow_id
    ) REFERENCES public.booking_workflows(
      space_id, business_profile_id, service_id_snapshot, id
    )
    ON DELETE RESTRICT,
  ADD CONSTRAINT booking_requests_workflow_version_fk
    FOREIGN KEY (
      workflow_space_id, workflow_business_profile_id, workflow_id,
      workflow_version_id, workflow_version_status
    ) REFERENCES public.booking_workflow_versions(
      space_id, business_profile_id, workflow_id, id, status
    ) ON DELETE RESTRICT,
  ADD CONSTRAINT booking_requests_workflow_state_fk
    FOREIGN KEY (
      workflow_space_id, workflow_business_profile_id, workflow_id,
      workflow_version_id, workflow_state_id
    ) REFERENCES public.booking_workflow_states(
      space_id, business_profile_id, workflow_id, workflow_version_id, id
    ) ON DELETE RESTRICT;

ALTER TABLE public.booking_events
  ADD CONSTRAINT booking_events_workflow_shape_check CHECK (
    (
      event_type = 'workflow_state_changed'
      AND workflow_version_id IS NOT NULL
      AND from_workflow_state_id IS NOT NULL
      AND to_workflow_state_id IS NOT NULL
      AND actor_kind = 'provider'
      AND cancellation_reason IS NULL
    )
    OR (
      event_type <> 'workflow_state_changed'
      AND workflow_version_id IS NULL
      AND from_workflow_state_id IS NULL
      AND to_workflow_state_id IS NULL
    )
  ),
  ADD CONSTRAINT booking_events_cancellation_reason_check CHECK (
    (event_type = 'request_cancelled' AND cancellation_reason IN (
      'customer_cancelled', 'provider_unavailable', 'other', 'legacy_unspecified'
    ))
    OR (event_type <> 'request_cancelled' AND cancellation_reason IS NULL)
  ),
  ADD CONSTRAINT booking_events_from_workflow_state_fk
    FOREIGN KEY (workflow_version_id, from_workflow_state_id)
    REFERENCES public.booking_workflow_states(workflow_version_id, id)
    MATCH FULL ON DELETE RESTRICT,
  ADD CONSTRAINT booking_events_to_workflow_state_fk
    FOREIGN KEY (workflow_version_id, to_workflow_state_id)
    REFERENCES public.booking_workflow_states(workflow_version_id, id)
    MATCH FULL ON DELETE RESTRICT;

CREATE FUNCTION public.booking_workflow_graph_mutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version_id uuid := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.workflow_version_id ELSE NEW.workflow_version_id END;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.workflow_version_id IS DISTINCT FROM NEW.workflow_version_id THEN
    RAISE EXCEPTION 'booking_workflow_published_immutable';
  END IF;

  SELECT version_row.status INTO v_status
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.id = v_version_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'booking_workflow_published_immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.booking_workflow_mutation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (pg_catalog.to_jsonb(NEW) - 'actor_user_id') =
         (pg_catalog.to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'booking_workflow_mutation_immutable';
END;
$$;

CREATE TRIGGER booking_workflow_versions_immutable_guard
BEFORE UPDATE OR DELETE ON public.booking_workflow_versions
FOR EACH ROW EXECUTE FUNCTION public.booking_workflow_version_immutable();

CREATE TRIGGER booking_workflow_states_mutable_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.booking_workflow_states
FOR EACH ROW EXECUTE FUNCTION public.booking_workflow_graph_mutable();

CREATE TRIGGER booking_workflow_transitions_mutable_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.booking_workflow_transitions
FOR EACH ROW EXECUTE FUNCTION public.booking_workflow_graph_mutable();

CREATE TRIGGER booking_workflow_mutations_immutable_guard
BEFORE UPDATE OR DELETE ON public.booking_workflow_mutations
FOR EACH ROW EXECUTE FUNCTION public.booking_workflow_mutation_immutable();

CREATE FUNCTION public.booking_workflow_input_fingerprint(p_graph jsonb)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
IMMUTABLE
SET search_path = ''
AS $$
  WITH states AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item ->> 'id',
        'logicalKey', item ->> 'logicalKey',
        'systemLabelKey', item ->> 'systemLabelKey',
        'providerLabel', NULLIF(pg_catalog.btrim(item ->> 'providerLabel'), ''),
        'customerLabel', NULLIF(pg_catalog.btrim(item ->> 'customerLabel'), ''),
        'sortOrder', item ->> 'sortOrder',
        'isInitial', item ->> 'isInitial',
        'semanticKind', item ->> 'semanticKind',
        'attentionSide', item ->> 'attentionSide'
      ) ORDER BY item ->> 'logicalKey'
    ), '[]'::jsonb) AS value
    FROM pg_catalog.jsonb_array_elements(COALESCE(p_graph -> 'states', '[]'::jsonb)) AS item
  ), edges AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'fromStateId', item ->> 'fromStateId',
        'toStateId', item ->> 'toStateId'
      ) ORDER BY item ->> 'fromStateId', item ->> 'toStateId'
    ), '[]'::jsonb) AS value
    FROM pg_catalog.jsonb_array_elements(COALESCE(p_graph -> 'transitions', '[]'::jsonb)) AS item
  )
  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'states', states.value,
    'transitions', edges.value
  )::text)
  FROM states CROSS JOIN edges;
$$;

CREATE FUNCTION public.booking_provider_save_workflow_draft(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid,
  p_draft_version_id uuid,
  p_expected_version_revision integer,
  p_graph jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_workflow public.booking_workflows%ROWTYPE;
  v_version public.booking_workflow_versions%ROWTYPE;
  v_receipt public.booking_workflow_mutations%ROWTYPE;
  v_confirmed_id uuid;
  v_input_fingerprint text;
  v_operation_fingerprint text;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL OR p_service_id IS NULL
     OR p_draft_version_id IS NULL
     OR p_expected_version_revision IS NULL OR p_expected_version_revision <= 0
     OR p_idempotency_key IS NULL
     OR p_graph IS NULL
     OR pg_catalog.jsonb_typeof(p_graph) <> 'object'
     OR pg_catalog.octet_length(p_graph::text) > 65536
     OR pg_catalog.jsonb_typeof(p_graph -> 'states') <> 'array'
     OR pg_catalog.jsonb_typeof(p_graph -> 'transitions') <> 'array'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_graph) AS key
       WHERE key NOT IN ('states', 'transitions')
     ) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  IF pg_catalog.jsonb_array_length(p_graph -> 'states') NOT BETWEEN 1 AND 20
     OR pg_catalog.jsonb_array_length(p_graph -> 'transitions') > 100
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_graph -> 'states') AS item
       WHERE pg_catalog.jsonb_typeof(item) <> 'object'
          OR COALESCE(item ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR pg_catalog.char_length(COALESCE(item ->> 'logicalKey', '')) NOT BETWEEN 1 AND 64
          OR COALESCE(item ->> 'logicalKey', '') !~ '^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$'
          OR NOT (item ?& ARRAY[
            'id', 'logicalKey', 'systemLabelKey', 'providerLabel', 'customerLabel',
            'sortOrder', 'isInitial', 'semanticKind', 'attentionSide'
          ])
          OR (item ->> 'systemLabelKey' IS NOT NULL
            AND item ->> 'systemLabelKey' NOT IN (
              'new_request', 'under_review', 'waiting_customer',
              'waiting_provider', 'confirmed'
            ))
          OR COALESCE(item ->> 'semanticKind', '') NOT IN ('active', 'confirmed')
          OR COALESCE(item ->> 'attentionSide', '') NOT IN ('provider', 'customer', 'none')
          OR EXISTS (
            SELECT 1 FROM pg_catalog.jsonb_object_keys(item) AS key
            WHERE key NOT IN (
              'id', 'logicalKey', 'systemLabelKey', 'providerLabel', 'customerLabel',
              'sortOrder', 'isInitial', 'semanticKind', 'attentionSide'
            )
          )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_graph -> 'transitions') AS item
       WHERE pg_catalog.jsonb_typeof(item) <> 'object'
          OR COALESCE(item ->> 'fromStateId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR COALESCE(item ->> 'toStateId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR EXISTS (
            SELECT 1 FROM pg_catalog.jsonb_object_keys(item) AS key
            WHERE key NOT IN ('fromStateId', 'toStateId')
          )
     ) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  BEGIN
    v_input_fingerprint := public.booking_workflow_input_fingerprint(p_graph);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END;

  SELECT service.* INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = p_service_id AND service.space_id = p_space_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT workflow.* INTO v_workflow
  FROM public.booking_workflows AS workflow
  WHERE workflow.id = v_service.workflow_id
    AND workflow.space_id = v_service.space_id
    AND workflow.business_profile_id = v_service.business_profile_id
    AND workflow.service_id_snapshot = v_service.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT version_row.* INTO v_version
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.id = p_draft_version_id
    AND version_row.workflow_id = v_workflow.id
    AND version_row.space_id = v_workflow.space_id
    AND version_row.business_profile_id = v_workflow.business_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_operation_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'save_draft',
    'serviceId', p_service_id,
    'versionId', p_draft_version_id,
    'expectedRevision', p_expected_version_revision,
    'graphFingerprint', v_input_fingerprint
  )::text);

  SELECT mutation.* INTO v_receipt
  FROM public.booking_workflow_mutations AS mutation
  WHERE mutation.workflow_id = v_workflow.id
    AND mutation.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_receipt.action <> 'save_draft'
       OR v_receipt.workflow_version_id <> p_draft_version_id
       OR v_receipt.actor_user_id IS DISTINCT FROM p_actor_id
       OR v_receipt.expected_revision <> p_expected_version_revision
       OR v_receipt.operation_fingerprint <> v_operation_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user
         WHERE auth_user.id = p_actor_id AND auth_user.email_confirmed_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'workflowId', v_workflow.id,
      'versionId', p_draft_version_id,
      'workflowRevision', v_receipt.result_workflow_revision,
      'versionRevision', v_receipt.result_version_revision,
      'replayed', true
    );
  END IF;

  IF v_service.archived_at IS NOT NULL
     OR NOT public.booking_provider_allowed(p_actor_id, p_space_id) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_version.status <> 'draft' THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_version.revision <> p_expected_version_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;

  SELECT state.id INTO v_confirmed_id
  FROM public.booking_workflow_states AS state
  WHERE state.workflow_version_id = v_version.id
    AND state.semantic_kind = 'confirmed';
  IF v_confirmed_id IS NULL THEN RAISE EXCEPTION 'booking_workflow_invalid_graph'; END IF;

  BEGIN
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(
        id uuid,
        "logicalKey" text,
        "systemLabelKey" text,
        "providerLabel" text,
        "customerLabel" text,
        "sortOrder" integer,
        "isInitial" boolean,
        "semanticKind" text,
        "attentionSide" text
      )
      WHERE input_state.id IS NULL
         OR input_state."logicalKey" IS NULL
         OR pg_catalog.char_length(input_state."logicalKey") NOT BETWEEN 1 AND 64
         OR input_state."logicalKey" !~ '^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$'
         OR input_state."sortOrder" IS NULL
         OR input_state."sortOrder" NOT BETWEEN 0 AND 19
         OR input_state."isInitial" IS NULL
         OR input_state."semanticKind" NOT IN ('active', 'confirmed')
         OR input_state."attentionSide" NOT IN ('provider', 'customer', 'none')
         OR NOT (
           (input_state."systemLabelKey" IS NOT NULL
             AND input_state."providerLabel" IS NULL
             AND input_state."customerLabel" IS NULL)
           OR (input_state."systemLabelKey" IS NULL
             AND input_state."providerLabel" IS NOT NULL
             AND input_state."customerLabel" IS NOT NULL)
         )
         OR (input_state."providerLabel" IS NOT NULL AND (
           input_state."providerLabel" <> pg_catalog.btrim(input_state."providerLabel")
           OR pg_catalog.char_length(input_state."providerLabel") NOT BETWEEN 1 AND 80
           OR input_state."providerLabel" ~ '[[:cntrl:]]'
           OR input_state."providerLabel" ~ '[<>`*_#~()]'
           OR pg_catalog.strpos(input_state."providerLabel", '[') > 0
           OR pg_catalog.strpos(input_state."providerLabel", ']') > 0
         ))
         OR (input_state."customerLabel" IS NOT NULL AND (
           input_state."customerLabel" <> pg_catalog.btrim(input_state."customerLabel")
           OR pg_catalog.char_length(input_state."customerLabel") NOT BETWEEN 1 AND 80
           OR input_state."customerLabel" ~ '[[:cntrl:]]'
           OR input_state."customerLabel" ~ '[<>`*_#~()]'
           OR pg_catalog.strpos(input_state."customerLabel", '[') > 0
           OR pg_catalog.strpos(input_state."customerLabel", ']') > 0
         ))
    ) > 0 THEN
      RAISE EXCEPTION 'booking_workflow_invalid_graph';
    END IF;

    IF EXISTS (
      SELECT input_state.id
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(id uuid)
      GROUP BY input_state.id HAVING pg_catalog.count(*) > 1
    ) OR EXISTS (
      SELECT input_state."logicalKey"
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state("logicalKey" text)
      GROUP BY input_state."logicalKey" HAVING pg_catalog.count(*) > 1
    ) OR EXISTS (
      SELECT input_state."sortOrder"
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state("sortOrder" integer)
      GROUP BY input_state."sortOrder" HAVING pg_catalog.count(*) > 1
    ) OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state("isInitial" boolean)
      WHERE input_state."isInitial"
    ) <> 1 OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(id uuid)
      WHERE input_state.id = v_confirmed_id
    ) THEN
      RAISE EXCEPTION 'booking_workflow_invalid_graph';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(
        id uuid,
        "logicalKey" text,
        "systemLabelKey" text,
        "providerLabel" text,
        "customerLabel" text,
        "semanticKind" text
      )
      LEFT JOIN public.booking_workflow_states AS current_state
        ON current_state.id = input_state.id
       AND current_state.workflow_version_id = v_version.id
      WHERE (current_state.id IS NOT NULL
          AND current_state.logical_key IS DISTINCT FROM input_state."logicalKey")
         OR (current_state.id IS NOT NULL
          AND current_state.semantic_kind IS DISTINCT FROM input_state."semanticKind")
         OR (current_state.id IS NOT NULL
          AND input_state."systemLabelKey" IS NOT NULL
          AND current_state.system_label_key IS DISTINCT FROM input_state."systemLabelKey")
         OR (current_state.id IS NULL AND EXISTS (
           SELECT 1 FROM public.booking_workflow_states AS other_state
           WHERE other_state.id = input_state.id
         ))
         OR (current_state.id IS NULL AND (
           input_state."systemLabelKey" IS NOT NULL
           OR input_state."semanticKind" <> 'active'
         ))
    ) THEN
      RAISE EXCEPTION 'booking_workflow_invalid_graph';
    END IF;

    DELETE FROM public.booking_workflow_transitions AS edge
    WHERE edge.workflow_version_id = v_version.id;

    DELETE FROM public.booking_workflow_states AS state
    WHERE state.workflow_version_id = v_version.id
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(id uuid)
        WHERE input_state.id = state.id
      );

    SET CONSTRAINTS public.booking_workflow_states_sort_key DEFERRED;

    UPDATE public.booking_workflow_states AS state
    SET is_initial = false
    WHERE state.workflow_version_id = v_version.id;

    UPDATE public.booking_workflow_states AS state
    SET system_label_key = input_state."systemLabelKey",
        provider_label = input_state."providerLabel",
        customer_label = input_state."customerLabel",
        sort_order = input_state."sortOrder",
        is_initial = input_state."isInitial",
        attention_side = input_state."attentionSide"
    FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(
      id uuid,
      "logicalKey" text,
      "systemLabelKey" text,
      "providerLabel" text,
      "customerLabel" text,
      "sortOrder" integer,
      "isInitial" boolean,
      "semanticKind" text,
      "attentionSide" text
    )
    WHERE state.id = input_state.id
      AND state.workflow_version_id = v_version.id;

    INSERT INTO public.booking_workflow_states (
      id, space_id, business_profile_id, workflow_id, workflow_version_id,
      logical_key, system_label_key, provider_label, customer_label,
      sort_order, is_initial, semantic_kind, attention_side
    )
    SELECT
      input_state.id,
      v_workflow.space_id,
      v_workflow.business_profile_id,
      v_workflow.id,
      v_version.id,
      input_state."logicalKey",
      input_state."systemLabelKey",
      input_state."providerLabel",
      input_state."customerLabel",
      input_state."sortOrder",
      input_state."isInitial",
      input_state."semanticKind",
      input_state."attentionSide"
    FROM pg_catalog.jsonb_to_recordset(p_graph -> 'states') AS input_state(
      id uuid,
      "logicalKey" text,
      "systemLabelKey" text,
      "providerLabel" text,
      "customerLabel" text,
      "sortOrder" integer,
      "isInitial" boolean,
      "semanticKind" text,
      "attentionSide" text
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.booking_workflow_states AS state
      WHERE state.id = input_state.id
    );

    IF EXISTS (
      SELECT input_edge."fromStateId", input_edge."toStateId"
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'transitions') AS input_edge(
        "fromStateId" uuid, "toStateId" uuid
      )
      GROUP BY input_edge."fromStateId", input_edge."toStateId"
      HAVING pg_catalog.count(*) > 1
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_recordset(p_graph -> 'transitions') AS input_edge(
        "fromStateId" uuid, "toStateId" uuid
      )
      WHERE input_edge."fromStateId" IS NULL
         OR input_edge."toStateId" IS NULL
         OR input_edge."fromStateId" = input_edge."toStateId"
         OR NOT EXISTS (
           SELECT 1 FROM public.booking_workflow_states AS source
           WHERE source.id = input_edge."fromStateId"
             AND source.workflow_version_id = v_version.id
         )
         OR NOT EXISTS (
           SELECT 1 FROM public.booking_workflow_states AS target
           WHERE target.id = input_edge."toStateId"
             AND target.workflow_version_id = v_version.id
         )
    ) THEN
      RAISE EXCEPTION 'booking_workflow_invalid_graph';
    END IF;

    INSERT INTO public.booking_workflow_transitions (
      space_id, business_profile_id, workflow_id, workflow_version_id,
      from_state_id, to_state_id
    )
    SELECT
      v_workflow.space_id,
      v_workflow.business_profile_id,
      v_workflow.id,
      v_version.id,
      input_edge."fromStateId",
      input_edge."toStateId"
    FROM pg_catalog.jsonb_to_recordset(p_graph -> 'transitions') AS input_edge(
      "fromStateId" uuid, "toStateId" uuid
    );
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range
      OR not_null_violation OR check_violation OR unique_violation
      OR foreign_key_violation THEN
      RAISE EXCEPTION 'booking_workflow_invalid_graph';
  END;

  PERFORM public.booking_validate_workflow_version(v_version.id);

  UPDATE public.booking_workflow_versions AS version_row
  SET revision = version_row.revision + 1,
      graph_fingerprint = public.booking_workflow_graph_fingerprint(version_row.id)
  WHERE version_row.id = v_version.id
    AND version_row.revision = p_expected_version_revision
  RETURNING * INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;

  INSERT INTO public.booking_workflow_mutations (
    space_id, business_profile_id, workflow_id, workflow_version_id,
    action, actor_user_id, expected_revision, idempotency_key,
    operation_fingerprint, result_workflow_revision,
    result_version_revision, result_created
  ) VALUES (
    v_workflow.space_id, v_workflow.business_profile_id, v_workflow.id, v_version.id,
    'save_draft', p_actor_id, p_expected_version_revision, p_idempotency_key,
    v_operation_fingerprint, v_workflow.revision, v_version.revision, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'workflowId', v_workflow.id,
    'versionId', v_version.id,
    'workflowRevision', v_workflow.revision,
    'versionRevision', v_version.revision,
    'replayed', false
  );
END;
$$;

CREATE FUNCTION public.booking_provider_publish_workflow_draft(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid,
  p_draft_version_id uuid,
  p_expected_version_revision integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service public.booking_services%ROWTYPE;
  v_workflow public.booking_workflows%ROWTYPE;
  v_version public.booking_workflow_versions%ROWTYPE;
  v_receipt public.booking_workflow_mutations%ROWTYPE;
  v_fingerprint text;
BEGIN
  IF p_actor_id IS NULL OR p_space_id IS NULL OR p_service_id IS NULL
     OR p_draft_version_id IS NULL
     OR p_expected_version_revision IS NULL OR p_expected_version_revision <= 0
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT service.* INTO v_service
  FROM public.booking_services AS service
  WHERE service.id = p_service_id AND service.space_id = p_space_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT workflow.* INTO v_workflow
  FROM public.booking_workflows AS workflow
  WHERE workflow.id = v_service.workflow_id
    AND workflow.space_id = v_service.space_id
    AND workflow.business_profile_id = v_service.business_profile_id
    AND workflow.service_id_snapshot = v_service.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT version_row.* INTO v_version
  FROM public.booking_workflow_versions AS version_row
  WHERE version_row.id = p_draft_version_id
    AND version_row.workflow_id = v_workflow.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'publish_draft',
    'serviceId', p_service_id,
    'versionId', p_draft_version_id,
    'expectedRevision', p_expected_version_revision,
    'graphFingerprint', v_version.graph_fingerprint
  )::text);

  SELECT mutation.* INTO v_receipt
  FROM public.booking_workflow_mutations AS mutation
  WHERE mutation.workflow_id = v_workflow.id
    AND mutation.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_receipt.action <> 'publish_draft'
       OR v_receipt.workflow_version_id <> p_draft_version_id
       OR v_receipt.actor_user_id IS DISTINCT FROM p_actor_id
       OR v_receipt.expected_revision <> p_expected_version_revision
       OR v_receipt.operation_fingerprint <> v_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user
         WHERE auth_user.id = p_actor_id AND auth_user.email_confirmed_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'workflowId', v_workflow.id,
      'versionId', p_draft_version_id,
      'activeVersionId', p_draft_version_id,
      'workflowRevision', v_receipt.result_workflow_revision,
      'versionRevision', v_receipt.result_version_revision,
      'replayed', true
    );
  END IF;

  IF v_service.archived_at IS NOT NULL
     OR NOT public.booking_provider_allowed(p_actor_id, p_space_id) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_version.status <> 'draft' THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_version.revision <> p_expected_version_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;
  PERFORM public.booking_validate_workflow_version(v_version.id);

  UPDATE public.booking_workflow_versions AS version_row
  SET status = 'published',
      revision = version_row.revision + 1,
      graph_fingerprint = public.booking_workflow_graph_fingerprint(version_row.id),
      published_by = p_actor_id,
      published_at = pg_catalog.now()
  WHERE version_row.id = v_version.id
    AND version_row.revision = p_expected_version_revision
  RETURNING * INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;

  UPDATE public.booking_services AS service
  SET active_workflow_version_id = v_version.id,
      active_workflow_version_status = 'published'
  WHERE service.id = v_service.id
    AND service.workflow_id = v_workflow.id;

  UPDATE public.booking_workflows AS workflow
  SET revision = workflow.revision + 1,
      updated_by = p_actor_id,
      updated_at = pg_catalog.now()
  WHERE workflow.id = v_workflow.id
  RETURNING * INTO v_workflow;

  INSERT INTO public.booking_workflow_mutations (
    space_id, business_profile_id, workflow_id, workflow_version_id,
    action, actor_user_id, expected_revision, idempotency_key,
    operation_fingerprint, result_workflow_revision,
    result_version_revision, result_created
  ) VALUES (
    v_workflow.space_id, v_workflow.business_profile_id, v_workflow.id, v_version.id,
    'publish_draft', p_actor_id, p_expected_version_revision, p_idempotency_key,
    v_fingerprint, v_workflow.revision, v_version.revision, NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'workflowId', v_workflow.id,
    'versionId', v_version.id,
    'activeVersionId', v_version.id,
    'workflowRevision', v_workflow.revision,
    'versionRevision', v_version.revision,
    'replayed', false
  );
END;
$$;

CREATE FUNCTION public.booking_transition_request(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_target_state_id uuid,
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
  v_event public.booking_events%ROWTYPE;
  v_fingerprint text;
  v_from_state_id uuid;
BEGIN
  IF p_public_id IS NULL OR p_actor_user_id IS NULL OR p_target_state_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision <= 0
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'workflow_transition',
    'actorKind', 'provider',
    'actorPrincipal', 'provider:user:' || p_actor_user_id::text,
    'targetStateId', p_target_state_id,
    'expectedRevision', p_expected_revision
  )::text);

  SELECT event_row.* INTO v_event
  FROM public.booking_events AS event_row
  WHERE event_row.booking_request_id = v_request.id
    AND event_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_event.event_type <> 'workflow_state_changed'
       OR v_event.actor_kind <> 'provider'
       OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_event.to_workflow_state_id IS DISTINCT FROM p_target_state_id
       OR v_event.request_revision <> p_expected_revision + 1
       OR v_event.operation_fingerprint <> v_fingerprint
       OR NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user
         WHERE auth_user.id = p_actor_user_id
           AND auth_user.email_confirmed_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'publicId', p_public_id,
      'revision', v_event.request_revision,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(p_public_id, p_actor_user_id, NULL);
  IF v_access.access_kind <> 'provider' THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;
  IF v_request.status <> 'requested' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;
  v_from_state_id := v_request.workflow_state_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.booking_workflow_states AS target
    WHERE target.id = p_target_state_id
      AND target.space_id = v_request.workflow_space_id
      AND target.business_profile_id = v_request.workflow_business_profile_id
      AND target.workflow_id = v_request.workflow_id
      AND target.workflow_version_id = v_request.workflow_version_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.booking_workflow_transitions AS edge
    WHERE edge.workflow_version_id = v_request.workflow_version_id
      AND edge.from_state_id = v_request.workflow_state_id
      AND edge.to_state_id = p_target_state_id
  ) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  UPDATE public.booking_requests AS request_row
  SET workflow_state_id = p_target_state_id,
      revision = request_row.revision + 1,
      updated_at = pg_catalog.now()
  WHERE request_row.id = v_request.id
    AND request_row.revision = p_expected_revision
  RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;

  INSERT INTO public.booking_events (
    booking_request_id, request_revision, access_version, event_type,
    actor_kind, actor_user_id, idempotency_key, operation_fingerprint,
    event_data, workflow_version_id, from_workflow_state_id,
    to_workflow_state_id
  ) VALUES (
    v_request.id, v_request.revision, v_request.access_version,
    'workflow_state_changed', 'provider', p_actor_user_id,
    p_idempotency_key, v_fingerprint, '{}'::jsonb,
    v_request.workflow_version_id, v_from_state_id,
    p_target_state_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'publicId', p_public_id,
    'revision', v_request.revision,
    'replayed', false
  );
END;
$$;

CREATE FUNCTION public.booking_cancel_request_with_reason(
  p_public_id uuid,
  p_actor_user_id uuid,
  p_session_hash text,
  p_expected_revision integer,
  p_idempotency_key uuid,
  p_requested_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_requests%ROWTYPE;
  v_access record;
  v_event public.booking_events%ROWTYPE;
  v_actor_kind text;
  v_actor_principal text;
  v_effective_reason text;
  v_fingerprint text;
BEGIN
  IF p_public_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision <= 0
     OR p_idempotency_key IS NULL
     OR (p_requested_reason IS NOT NULL
       AND p_requested_reason NOT IN (
         'customer_cancelled', 'provider_unavailable', 'other'
       )) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.public_id = p_public_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT event_row.* INTO v_event
  FROM public.booking_events AS event_row
  WHERE event_row.booking_request_id = v_request.id
    AND event_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_event.event_type <> 'request_cancelled'
       OR v_event.request_revision <> p_expected_revision + 1 THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    v_actor_kind := v_event.actor_kind;
    v_effective_reason := v_event.cancellation_reason;
    IF v_actor_kind IN ('guest', 'member')
       AND p_requested_reason IS NOT NULL
       AND p_requested_reason <> 'customer_cancelled' THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    IF v_actor_kind = 'guest' THEN
      IF p_session_hash !~ '^[0-9a-f]{64}$'
         OR NOT EXISTS (
           SELECT 1 FROM public.booking_capability_sessions AS session_row
           WHERE session_row.booking_request_id = v_request.id
             AND session_row.session_token_hash = p_session_hash
             AND session_row.access_version = v_event.access_version
             AND session_row.revoked_at IS NULL
             AND session_row.expires_at > pg_catalog.now()
         ) THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;
      v_actor_principal := 'guest:link:' || v_event.access_version::text;
    ELSIF v_actor_kind IN ('member', 'provider') THEN
      IF v_event.actor_user_id IS NULL
         OR p_actor_user_id IS DISTINCT FROM v_event.actor_user_id
         OR NOT EXISTS (
           SELECT 1 FROM auth.users AS auth_user
           WHERE auth_user.id = p_actor_user_id
             AND auth_user.email_confirmed_at IS NOT NULL
         ) THEN
        RAISE EXCEPTION 'booking_idempotency_conflict';
      END IF;
      v_actor_principal := v_actor_kind || ':user:' || p_actor_user_id::text;
    ELSE
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'action', 'cancel',
      'actorKind', v_actor_kind,
      'actorPrincipal', v_actor_principal,
      'expectedRevision', p_expected_revision,
      'reason', CASE WHEN v_actor_kind IN ('guest', 'member')
        THEN 'customer_cancelled' ELSE p_requested_reason END
    )::text);
    IF v_event.operation_fingerprint <> v_fingerprint
       OR v_effective_reason IS DISTINCT FROM (
         CASE
           WHEN v_actor_kind IN ('guest', 'member') THEN 'customer_cancelled'
           ELSE p_requested_reason
         END
       ) THEN
      RAISE EXCEPTION 'booking_idempotency_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'publicId', p_public_id,
      'revision', v_event.request_revision,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_access
  FROM public.booking_authorize_request(p_public_id, p_actor_user_id, p_session_hash);
  v_actor_kind := v_access.access_kind;

  IF v_actor_kind = 'provider' THEN
    IF p_requested_reason IS NULL THEN RAISE EXCEPTION 'booking_invalid_input'; END IF;
    v_effective_reason := p_requested_reason;
    v_actor_principal := 'provider:user:' || v_access.actor_user_id::text;
  ELSIF v_actor_kind = 'guest' THEN
    IF p_requested_reason IS NOT NULL
       AND p_requested_reason <> 'customer_cancelled' THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
    v_effective_reason := 'customer_cancelled';
    v_actor_principal := 'guest:link:' || v_request.access_version::text;
  ELSIF v_actor_kind = 'member' AND v_access.member_role = 'owner' THEN
    IF p_requested_reason IS NOT NULL
       AND p_requested_reason <> 'customer_cancelled' THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
    v_effective_reason := 'customer_cancelled';
    v_actor_principal := 'member:user:' || v_access.actor_user_id::text;
  ELSE
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'cancel',
    'actorKind', v_actor_kind,
    'actorPrincipal', v_actor_principal,
    'expectedRevision', p_expected_revision,
    'reason', v_effective_reason
  )::text);

  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'booking_revision_conflict';
  END IF;
  IF v_request.status <> 'requested' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;

  UPDATE public.booking_requests AS request_row
  SET status = 'cancelled',
      cancellation_reason = v_effective_reason,
      revision = request_row.revision + 1,
      cancelled_at = pg_catalog.now(),
      cancelled_by_user_id = v_access.actor_user_id,
      updated_at = pg_catalog.now()
  WHERE request_row.id = v_request.id
    AND request_row.revision = p_expected_revision
  RETURNING * INTO v_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_revision_conflict'; END IF;

  INSERT INTO public.booking_events (
    booking_request_id, request_revision, access_version, event_type,
    actor_kind, actor_user_id, actor_session_id, idempotency_key,
    operation_fingerprint, event_data
  ) VALUES (
    v_request.id, v_request.revision, v_request.access_version,
    'request_cancelled', v_actor_kind, v_access.actor_user_id,
    v_access.capability_session_id, p_idempotency_key,
    v_fingerprint,
    pg_catalog.jsonb_build_object('cancellationReason', v_effective_reason)
  );

  RETURN pg_catalog.jsonb_build_object(
    'publicId', p_public_id,
    'revision', v_request.revision,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_request_projection(
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
  v_state public.booking_workflow_states%ROWTYPE;
  v_members jsonb := '[]'::jsonb;
  v_allowed_targets jsonb := '[]'::jsonb;
  v_workflow_state jsonb := NULL;
  v_current_profile_slug text;
  v_label text;
BEGIN
  SELECT request_row.* INTO v_request
  FROM public.booking_requests AS request_row
  WHERE request_row.id = p_request_id;

  IF NOT FOUND OR p_access_kind IS NULL
     OR p_access_kind NOT IN ('guest', 'member', 'provider') THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  SELECT profile.slug INTO v_current_profile_slug
  FROM public.business_profiles AS profile
  WHERE profile.space_id = v_request.space_id
    AND profile.id = v_request.business_profile_id
    AND profile.archived_at IS NULL;
  v_current_profile_slug := COALESCE(
    v_current_profile_slug,
    v_request.business_profile_slug_snapshot
  );

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
    ), '[]'::jsonb) INTO v_members
    FROM public.booking_access_members AS member
    WHERE member.booking_request_id = v_request.id;
  END IF;

  IF v_request.status = 'requested' THEN
    SELECT state.* INTO v_state
    FROM public.booking_workflow_states AS state
    WHERE state.id = v_request.workflow_state_id
      AND state.workflow_version_id = v_request.workflow_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

    v_label := CASE WHEN p_access_kind = 'provider'
      THEN v_state.provider_label ELSE v_state.customer_label END;

    IF p_access_kind = 'provider' THEN
      v_workflow_state := pg_catalog.jsonb_build_object(
        'workflowId', v_request.workflow_id,
        'versionId', v_request.workflow_version_id,
        'stateId', v_state.id,
        'logicalKey', v_state.logical_key,
        'systemLabelKey', v_state.system_label_key,
        'label', v_label,
        'attentionSide', v_state.attention_side,
        'semanticKind', v_state.semantic_kind
      );

      SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'stateId', target.id,
          'logicalKey', target.logical_key,
          'systemLabelKey', target.system_label_key,
          'label', target.provider_label,
          'attentionSide', target.attention_side,
          'semanticKind', target.semantic_kind
        ) ORDER BY target.sort_order, target.id
      ), '[]'::jsonb) INTO v_allowed_targets
      FROM public.booking_workflow_transitions AS edge
      JOIN public.booking_workflow_states AS target
        ON target.id = edge.to_state_id
       AND target.workflow_version_id = edge.workflow_version_id
      WHERE edge.workflow_version_id = v_request.workflow_version_id
        AND edge.from_state_id = v_request.workflow_state_id;
    ELSE
      -- Customer/member/guest projections deliberately contain no workflow,
      -- version, state or logical identifiers and never contain targets.
      v_workflow_state := pg_catalog.jsonb_build_object(
        'systemLabelKey', v_state.system_label_key,
        'label', v_label,
        'attentionSide', v_state.attention_side,
        'semanticKind', v_state.semantic_kind
      );
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'booking', pg_catalog.jsonb_build_object(
      'id', v_request.id,
      'publicId', v_request.public_id,
      'status', v_request.status,
      'lifecycleStatus', v_request.status,
      'accessMode', v_request.access_mode,
      'accessVersion', v_request.access_version,
      'revision', v_request.revision,
      'createdAt', v_request.created_at,
      'cancelledAt', v_request.cancelled_at,
      'cancellationReason', v_request.cancellation_reason
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
    'workflowState', v_workflow_state,
    'allowedWorkflowTargets', CASE WHEN p_access_kind = 'provider'
      THEN v_allowed_targets ELSE '[]'::jsonb END,
    'permissions', pg_catalog.jsonb_build_object(
      'canCancel', v_request.status = 'requested' AND (
        p_access_kind IN ('guest', 'provider')
        OR (p_access_kind = 'member' AND p_member_role = 'owner')
      ),
      'canTransition', v_request.status = 'requested'
        AND p_access_kind = 'provider'
        AND pg_catalog.jsonb_array_length(v_allowed_targets) > 0,
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

CREATE OR REPLACE FUNCTION public.booking_list_events(
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
  FROM public.booking_authorize_request(p_public_id, p_actor_user_id, p_session_hash);

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
      'createdAt', page.created_at,
      'cancellationReason', page.cancellation_reason,
      'workflowTransition', CASE
        WHEN page.event_type <> 'workflow_state_changed' THEN NULL
        WHEN v_access.access_kind = 'provider' THEN pg_catalog.jsonb_build_object(
          'versionId', page.workflow_version_id,
          'from', pg_catalog.jsonb_build_object(
            'stateId', page.from_workflow_state_id,
            'logicalKey', page.from_logical_key,
            'systemLabelKey', page.from_system_label_key,
            'label', page.from_provider_label
          ),
          'to', pg_catalog.jsonb_build_object(
            'stateId', page.to_workflow_state_id,
            'logicalKey', page.to_logical_key,
            'systemLabelKey', page.to_system_label_key,
            'label', page.to_provider_label
          )
        )
        ELSE pg_catalog.jsonb_build_object(
          'from', pg_catalog.jsonb_build_object(
            'systemLabelKey', page.from_system_label_key,
            'label', page.from_customer_label
          ),
          'to', pg_catalog.jsonb_build_object(
            'systemLabelKey', page.to_system_label_key,
            'label', page.to_customer_label
          )
        )
      END
    ) ORDER BY page.created_at, page.id
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      event_row.*,
      from_state.logical_key AS from_logical_key,
      from_state.system_label_key AS from_system_label_key,
      from_state.provider_label AS from_provider_label,
      from_state.customer_label AS from_customer_label,
      to_state.logical_key AS to_logical_key,
      to_state.system_label_key AS to_system_label_key,
      to_state.provider_label AS to_provider_label,
      to_state.customer_label AS to_customer_label
    FROM public.booking_events AS event_row
    LEFT JOIN public.booking_workflow_states AS from_state
      ON from_state.id = event_row.from_workflow_state_id
     AND from_state.workflow_version_id = event_row.workflow_version_id
    LEFT JOIN public.booking_workflow_states AS to_state
      ON to_state.id = event_row.to_workflow_state_id
     AND to_state.workflow_version_id = event_row.workflow_version_id
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

CREATE OR REPLACE FUNCTION public.booking_provider_list_services(
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
      'updatedAt', service.updated_at,
      'workflow', pg_catalog.jsonb_build_object(
        'id', workflow.id,
        'revision', workflow.revision,
        'activeVersionId', active_version.id,
        'activeVersionNumber', active_version.version_number
      )
    ) ORDER BY service.updated_at DESC, service.id DESC
  ), '[]'::jsonb) INTO v_result
  FROM public.booking_services AS service
  JOIN public.booking_workflows AS workflow
    ON workflow.id = service.workflow_id
   AND workflow.space_id = service.space_id
   AND workflow.business_profile_id = service.business_profile_id
  JOIN public.booking_workflow_versions AS active_version
    ON active_version.id = service.active_workflow_version_id
   AND active_version.workflow_id = workflow.id
   AND active_version.status = 'published'
  WHERE service.space_id = p_space_id
    AND service.archived_at IS NULL;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.booking_provider_list_requests(
  p_actor_id uuid,
  p_space_id uuid,
  p_service_id uuid,
  p_workflow_id uuid,
  p_state_logical_key text,
  p_attention_side text,
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
  v_items jsonb;
  v_state_facets jsonb;
  v_attention_facets jsonb;
  v_service_workflow_id uuid;
BEGIN
  PERFORM public.booking_assert_provider(p_actor_id, p_space_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL))
     OR (p_state_logical_key IS NOT NULL AND p_workflow_id IS NULL)
     OR (p_state_logical_key IS NOT NULL AND (
       pg_catalog.char_length(p_state_logical_key) NOT BETWEEN 1 AND 64
       OR p_state_logical_key !~ '^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$'
     ))
     OR (p_attention_side IS NOT NULL
       AND p_attention_side NOT IN ('provider', 'customer', 'none')) THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT service.workflow_id INTO v_service_workflow_id
    FROM public.booking_services AS service
    WHERE service.id = p_service_id AND service.space_id = p_space_id;
    IF v_service_workflow_id IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
    IF p_workflow_id IS NOT NULL AND p_workflow_id <> v_service_workflow_id THEN
      RAISE EXCEPTION 'booking_not_found';
    END IF;
  ELSIF p_workflow_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.booking_services AS service
    WHERE service.space_id = p_space_id
      AND service.workflow_id = p_workflow_id
  ) THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'publicId', page.public_id,
      'businessProfileSlug', page.business_profile_slug_snapshot,
      'providerDisplayName', page.provider_name_snapshot,
      'serviceTitle', page.service_title_snapshot,
      'status', page.status,
      'lifecycleStatus', page.status,
      'requestedDate', page.requested_local_date,
      'requestedTime', page.requested_local_time,
      'timezone', page.provider_timezone,
      'contactName', page.contact_name,
      'createdAt', page.created_at,
      'lastMessageAt', page.last_message_at,
      'cancellationReason', page.cancellation_reason,
      'workflowState', CASE WHEN page.status = 'cancelled' THEN NULL
        ELSE pg_catalog.jsonb_build_object(
          'workflowId', page.workflow_id,
          'versionId', page.workflow_version_id,
          'stateId', page.workflow_state_id,
          'logicalKey', page.logical_key,
          'systemLabelKey', page.system_label_key,
          'label', page.provider_label,
          'attentionSide', page.attention_side,
          'semanticKind', page.semantic_kind
        ) END
    ) ORDER BY page.created_at DESC, page.id DESC
  ), '[]'::jsonb) INTO v_items
  FROM (
    SELECT request_row.*, state.logical_key, state.system_label_key,
      state.provider_label, state.attention_side, state.semantic_kind,
      (
        SELECT pg_catalog.max(message.created_at)
        FROM public.booking_messages AS message
        WHERE message.booking_request_id = request_row.id
      ) AS last_message_at
    FROM public.booking_requests AS request_row
    JOIN public.booking_workflow_states AS state
      ON state.id = request_row.workflow_state_id
     AND state.workflow_version_id = request_row.workflow_version_id
    WHERE request_row.space_id = p_space_id
      AND (p_service_id IS NULL OR request_row.service_id = p_service_id)
      AND (
        p_workflow_id IS NULL
        OR (request_row.status = 'requested' AND request_row.workflow_id = p_workflow_id)
      )
      AND (p_state_logical_key IS NULL OR state.logical_key = p_state_logical_key)
      AND (
        p_attention_side IS NULL
        OR (request_row.status = 'requested' AND state.attention_side = p_attention_side)
      )
      AND (
        p_before_created_at IS NULL
        OR (request_row.created_at, request_row.id) < (p_before_created_at, p_before_id)
      )
    ORDER BY request_row.created_at DESC, request_row.id DESC
    LIMIT p_limit
  ) AS page;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'workflowId', facet.workflow_id,
      'logicalKey', facet.logical_key,
      'systemLabelKey', facet.system_label_key,
      'label', facet.provider_label,
      'count', facet.request_count
    ) ORDER BY facet.sort_order, facet.logical_key
  ), '[]'::jsonb) INTO v_state_facets
  FROM (
    SELECT
      request_row.workflow_id,
      state.logical_key,
      (pg_catalog.array_agg(state.system_label_key
        ORDER BY version_row.version_number DESC, state.id))[1] AS system_label_key,
      (pg_catalog.array_agg(state.provider_label
        ORDER BY version_row.version_number DESC, state.id))[1] AS provider_label,
      pg_catalog.min(state.sort_order) AS sort_order,
      pg_catalog.count(*)::integer AS request_count
    FROM public.booking_requests AS request_row
    JOIN public.booking_workflow_states AS state
      ON state.id = request_row.workflow_state_id
     AND state.workflow_version_id = request_row.workflow_version_id
    JOIN public.booking_workflow_versions AS version_row
      ON version_row.id = request_row.workflow_version_id
    WHERE request_row.space_id = p_space_id
      AND request_row.status = 'requested'
      AND (p_service_id IS NULL OR request_row.service_id = p_service_id)
    GROUP BY request_row.workflow_id, state.logical_key
  ) AS facet;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'attentionSide', facet.attention_side,
      'count', facet.request_count
    ) ORDER BY CASE facet.attention_side
      WHEN 'provider' THEN 1 WHEN 'customer' THEN 2 ELSE 3 END
  ), '[]'::jsonb) INTO v_attention_facets
  FROM (
    SELECT state.attention_side, pg_catalog.count(*)::integer AS request_count
    FROM public.booking_requests AS request_row
    JOIN public.booking_workflow_states AS state
      ON state.id = request_row.workflow_state_id
     AND state.workflow_version_id = request_row.workflow_version_id
    WHERE request_row.space_id = p_space_id
      AND request_row.status = 'requested'
      AND (p_service_id IS NULL OR request_row.service_id = p_service_id)
    GROUP BY state.attention_side
  ) AS facet;

  RETURN pg_catalog.jsonb_build_object(
    'items', v_items,
    'facets', pg_catalog.jsonb_build_object(
      'states', v_state_facets,
      'attention', v_attention_facets
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_upsert_service(
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
  v_workflow jsonb;
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

  SELECT pg_catalog.jsonb_build_object(
    'id', workflow.id,
    'revision', workflow.revision,
    'activeVersionId', active_version.id,
    'activeVersionNumber', active_version.version_number
  ) INTO v_workflow
  FROM public.booking_workflows AS workflow
  JOIN public.booking_workflow_versions AS active_version
    ON active_version.id = v_service.active_workflow_version_id
   AND active_version.workflow_id = workflow.id
   AND active_version.status = 'published'
  WHERE workflow.id = v_service.workflow_id
    AND workflow.space_id = v_service.space_id
    AND workflow.business_profile_id = v_service.business_profile_id
    AND workflow.service_id_snapshot = v_service.id;

  IF v_workflow IS NULL THEN RAISE EXCEPTION 'booking_workflow_invalid_graph'; END IF;

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
    'workflow', v_workflow,
    'created', v_created,
    'replayed', v_replayed
  );
END;
$$;

ALTER TABLE public.booking_workflows OWNER TO postgres;
ALTER TABLE public.booking_workflow_versions OWNER TO postgres;
ALTER TABLE public.booking_workflow_states OWNER TO postgres;
ALTER TABLE public.booking_workflow_transitions OWNER TO postgres;
ALTER TABLE public.booking_workflow_mutations OWNER TO postgres;

ALTER FUNCTION public.booking_workflow_version_immutable() OWNER TO postgres;
ALTER FUNCTION public.booking_workflow_graph_mutable() OWNER TO postgres;
ALTER FUNCTION public.booking_workflow_mutation_immutable() OWNER TO postgres;
ALTER FUNCTION public.booking_workflow_graph_fingerprint(uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_workflow_input_fingerprint(jsonb) OWNER TO postgres;
ALTER FUNCTION public.booking_validate_workflow_version(uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provision_default_workflow(uuid,uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_assign_default_workflow_on_service_insert() OWNER TO postgres;
ALTER FUNCTION public.booking_assign_workflow_on_request_insert() OWNER TO postgres;
ALTER FUNCTION public.booking_workflow_graph_projection(uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_read_workflow(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_ensure_workflow_draft(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_save_workflow_draft(uuid,uuid,uuid,uuid,integer,jsonb,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_publish_workflow_draft(uuid,uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_transition_request(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_cancel_request_with_reason(uuid,uuid,text,integer,uuid,text) OWNER TO postgres;
ALTER FUNCTION public.booking_request_projection(uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_list_services(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer) OWNER TO postgres;
ALTER FUNCTION public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.booking_workflow_version_immutable(),
  public.booking_workflow_graph_mutable(),
  public.booking_workflow_mutation_immutable(),
  public.booking_workflow_graph_fingerprint(uuid),
  public.booking_workflow_input_fingerprint(jsonb),
  public.booking_validate_workflow_version(uuid),
  public.booking_provision_default_workflow(uuid,uuid,uuid,uuid),
  public.booking_assign_default_workflow_on_service_insert(),
  public.booking_assign_workflow_on_request_insert(),
  public.booking_workflow_graph_projection(uuid),
  public.booking_provider_read_workflow(uuid,uuid,uuid),
  public.booking_provider_ensure_workflow_draft(uuid,uuid,uuid,integer,uuid),
  public.booking_provider_save_workflow_draft(uuid,uuid,uuid,uuid,integer,jsonb,uuid),
  public.booking_provider_publish_workflow_draft(uuid,uuid,uuid,uuid,integer,uuid),
  public.booking_transition_request(uuid,uuid,uuid,integer,uuid),
  public.booking_cancel_request_with_reason(uuid,uuid,text,integer,uuid,text),
  public.booking_request_projection(uuid,text,text),
  public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer),
  public.booking_provider_list_services(uuid,uuid),
  public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer),
  public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)
FROM PUBLIC, anon, authenticated, service_role;

-- Retain the SQL125 functions for forward-only history, but remove their API
-- execution rights so neither can bypass the new typed contracts.
REVOKE ALL ON FUNCTION public.booking_cancel_request(uuid,uuid,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_provider_list_requests(
  uuid,uuid,uuid,timestamp with time zone,uuid,integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.booking_provider_read_workflow(uuid,uuid,uuid),
  public.booking_provider_ensure_workflow_draft(uuid,uuid,uuid,integer,uuid),
  public.booking_provider_save_workflow_draft(uuid,uuid,uuid,uuid,integer,jsonb,uuid),
  public.booking_provider_publish_workflow_draft(uuid,uuid,uuid,uuid,integer,uuid),
  public.booking_transition_request(uuid,uuid,uuid,integer,uuid),
  public.booking_cancel_request_with_reason(uuid,uuid,text,integer,uuid,text),
  public.booking_list_events(uuid,uuid,text,timestamp with time zone,uuid,integer),
  public.booking_provider_list_services(uuid,uuid),
  public.booking_provider_list_requests(uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,integer),
  public.booking_upsert_service(uuid,uuid,uuid,uuid,integer,text,text,text,integer,text,uuid)
TO service_role;

DO $booking_workflow_postconditions$
DECLARE
  v_version record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.booking_services AS service
    LEFT JOIN public.booking_workflows AS workflow
      ON workflow.id = service.workflow_id
     AND workflow.space_id = service.space_id
     AND workflow.business_profile_id = service.business_profile_id
     AND workflow.service_id_snapshot = service.id
    LEFT JOIN public.booking_workflow_versions AS version_row
      ON version_row.id = service.active_workflow_version_id
     AND version_row.workflow_id = service.workflow_id
     AND version_row.space_id = service.space_id
     AND version_row.business_profile_id = service.business_profile_id
     AND version_row.status = 'published'
    WHERE workflow.id IS NULL OR version_row.id IS NULL
  ) OR EXISTS (
    SELECT workflow.id
    FROM public.booking_workflows AS workflow
    LEFT JOIN public.booking_services AS service ON service.workflow_id = workflow.id
    GROUP BY workflow.id
    HAVING pg_catalog.count(service.id) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.booking_requests AS request_row
    LEFT JOIN public.booking_workflow_states AS state
      ON state.id = request_row.workflow_state_id
     AND state.workflow_version_id = request_row.workflow_version_id
     AND state.workflow_id = request_row.workflow_id
     AND state.space_id = request_row.workflow_space_id
     AND state.business_profile_id = request_row.workflow_business_profile_id
    WHERE state.id IS NULL
       OR request_row.workflow_version_status <> 'published'
       OR (request_row.status = 'requested' AND request_row.cancellation_reason IS NOT NULL)
       OR (request_row.status = 'cancelled' AND request_row.cancellation_reason IS NULL)
  ) OR EXISTS (
    SELECT 1
    FROM public.booking_events AS event_row
    WHERE (event_row.event_type = 'workflow_state_changed') IS DISTINCT FROM (
      event_row.workflow_version_id IS NOT NULL
      AND event_row.from_workflow_state_id IS NOT NULL
      AND event_row.to_workflow_state_id IS NOT NULL
    )
       OR (event_row.event_type = 'request_cancelled') IS DISTINCT FROM (
         event_row.cancellation_reason IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'booking_workflow_postcondition_failed';
  END IF;

  FOR v_version IN
    SELECT version_row.id FROM public.booking_workflow_versions AS version_row
  LOOP
    PERFORM public.booking_validate_workflow_version(v_version.id);
  END LOOP;
END;
$booking_workflow_postconditions$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Written and statically reviewed only. Codex did not execute this SQL.
