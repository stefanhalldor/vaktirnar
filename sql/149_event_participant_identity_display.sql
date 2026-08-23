-- SQL149: Event participant identity, safe shared labels and opt-out access.
--
-- This package is additive. SQL132-SQL148 remain byte-for-byte untouched.
-- Expense data and financial authority are not mutated here.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'teskeid:sql149:event-participant-identity-display', 14901
  )
);

DO $sql149_preconditions$
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql149_postgresql_15_required';
  END IF;
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sql149_executor_not_allowed';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guest_invitations') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_details') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.relationship_tags') IS NULL
     OR pg_catalog.to_regclass('public.relationship_label_definitions') IS NULL
     OR pg_catalog.to_regclass('public.relationship_label_assignments') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_assert_actor(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_assert_financial_actor(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_uuid_from_text(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attendance_terminalize_invitations(uuid[],text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'sql149_prerequisites_missing';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_event_person_labels') IS NOT NULL
     OR pg_catalog.to_regclass('public.teskeid_event_participations') IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_participation_mutation_requests'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_participation_invitation_terminalizations'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_guest_invitations_sql149_identity_uidx'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_v1_bridge_observation_seq'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'sql149_target_already_exists';
  END IF;
END;
$sql149_preconditions$;

DO $sql149_protected_catalog$
DECLARE
  v_expected record;
  v_source text;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_assert_actor(uuid)',
        'p_actor_id uuid','void','s',true,false,'u',false,
        '9dd7c34f6cc6c78131e7ebbb9a718ea4'),
      ('public.teskeid_event_uuid_from_text(text)',
        'p_value text','uuid','i',true,false,'u',false,
        '27229cbc71c621e5a8592265b07f874d'),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
        'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
        'text','s',true,false,'u',false,
        '2377be525ed29f2d4bc26d453fa8cf51'),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)',
        'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
        'jsonb','v',true,false,'u',true,
        '0022e19d8853709247583b7ddb38ef45'),
      ('public.expense_prepare_account_deletion(uuid)',
        'p_user_id uuid','jsonb','v',true,false,'u',true,
        '0562edbfaa608cead23d23d49ec36a66'),
      ('public.teskeid_event_get_expense_source(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,
        '3d01501bdb03f0f6bca83e0817688006'),
      ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
        'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
        'bigint','v',true,false,'u',false,
        '819b2e024aac1e00c7e14145b0d6b373'),
      ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
        'jsonb','v',true,false,'u',true,
        '7e6426c8e43efa3bb7d725bf6b1c807c'),
      ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
        'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
        'jsonb','s',true,false,'u',true,
        'a31fc1caa0cf009e4daad9c3e3ed1875'),
      ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,
        'ae418825a7d7f8ebe056272dde9448fd'),
      ('public.normalize_email_canonical(text)',
        'p_email text','text','i',false,true,'s',true,
        '3083103976aa8cb3780937b9da1be236'),
      ('public.teskeid_event_normalize_text(text)',
        'p_value text','text','i',true,false,'u',false,
        'ced5cfb2427fe7331f4416497614f7d1'),
      ('public.teskeid_event_valid_text(text,integer,integer)',
        'p_value text, p_minimum integer, p_maximum integer',
        'boolean','i',true,false,'u',false,
        '28c80b083a90683f15fd04f4d7d547d1'),
      ('public.teskeid_event_assert_financial_actor(uuid)',
        'p_actor_id uuid','void','s',true,false,'u',false,
        '7f6ced4f5e7472aff27d9a6d5c624355'),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
        'p_invitation_ids uuid[], p_status text',
        'integer','v',true,false,'u',false,
        'a2a85bca2a456177ab67b7817dc6e19d'),
      ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
        'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
        'jsonb','v',true,false,'u',true,
        '3e1b846ec2a4540e6ee51becb2590ec2')
    ) AS expected(
      signature, exact_arguments, return_type, volatility,
      security_definer, is_strict, parallel_safety, service_execute,
      source_md5
    )
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      v_expected.signature
    )
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = v_expected.security_definer
      AND procedure_row.proisstrict = v_expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = v_expected.volatility::"char"
      AND procedure_row.proparallel = v_expected.parallel_safety::"char"
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(v_expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        v_expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = v_expected.service_execute
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT v_expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      );
    IF pg_catalog.md5(pg_catalog.replace(v_source, E'\r\n', E'\n'))
       IS DISTINCT FROM v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_protected_catalog_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_list_for_actor(uuid)',
        'p_actor_id uuid','jsonb',
        '4ccf01e6251a7e7ee187fcba21a88c36'),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
        'p_actor_id uuid, p_invitation_id uuid','jsonb',
        'e268003d1f916f6a987e8d47dbef5971'),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
        'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid',
        'jsonb',
        '45bab121e346e77fa4a4035b7cf88f16'),
      ('public.teskeid_event_list_my_pending_invitations(uuid)',
        'p_actor_id uuid','jsonb',
        '295ca440e9caa334986f664ce2bc7398')
    ) AS expected(signature, exact_arguments, return_type, source_md5)
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      v_expected.signature
      )
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(v_expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        v_expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      );
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    IF pg_catalog.md5(pg_catalog.replace(
      v_source,
      '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',
      ''
    )) IS DISTINCT FROM v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_protected_catalog_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;
END;
$sql149_protected_catalog$;

CREATE FUNCTION public.teskeid_event_private_normalize_shared_name_v2(
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE WHEN p_value IS NULL THEN NULL ELSE pg_catalog.normalize(
    pg_catalog.regexp_replace(
      p_value,
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '', 'g'
    )
  ) END;
$function$;

-- Every timestamp crossing the SQL149 JSON boundary is rendered in UTC.
-- Raw jsonb_build_object(timestamptz) follows the session TimeZone and can
-- turn an otherwise valid year-0001/year-9999 value into an unparseable
-- year-0000/year-10000 string for a strict consumer.
CREATE FUNCTION public.teskeid_event_private_format_utc_timestamp_v2(
  p_value timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_value IS NULL
      OR NOT pg_catalog.isfinite(p_value)
      OR p_value NOT BETWEEN
        timestamptz '0001-01-01 00:00:00+00'
        AND timestamptz '9999-12-31 23:59:59.999999+00'
    THEN NULL
    ELSE pg_catalog.to_char(
      p_value AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  END;
$function$;

CREATE FUNCTION public.teskeid_event_private_valid_shared_name_v2(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_value IS NOT DISTINCT FROM
      public.teskeid_event_private_normalize_shared_name_v2(p_value)
    AND public.teskeid_event_valid_text(
      public.teskeid_event_private_normalize_shared_name_v2(p_value), 1, 120
    )
    AND pg_catalog.strpos(
      public.teskeid_event_private_normalize_shared_name_v2(p_value), '@'
    ) = 0
    AND public.teskeid_event_private_normalize_shared_name_v2(p_value)
      !~ '[[:cntrl:]]'
    AND public.teskeid_event_private_normalize_shared_name_v2(p_value)
      !~ U&'[\202A-\202E\2066-\2069]',
    false
  );
$function$;

-- This is intentionally stricter than the historical Event email checks and
-- mirrors the frozen Zod v3 email contract used by every SQL149 consumer.
-- Keeping one predicate prevents a valid database row from becoming an
-- unparseable browser DTO.
CREATE FUNCTION public.teskeid_event_private_valid_canonical_email_v2(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.char_length(p_value) BETWEEN 3 AND 320
    AND public.normalize_email_canonical(p_value) = p_value
    AND p_value ~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_''+\-\.]*)[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$',
    false
  );
$function$;

CREATE TABLE public.teskeid_event_person_labels (
  event_id            uuid        NOT NULL,
  event_guest_id      uuid        NOT NULL,
  label_state         text        NOT NULL,
  shared_display_name text        NULL,
  label_version       bigint      NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at          timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_person_labels_pkey
    PRIMARY KEY (event_id, event_guest_id),
  CONSTRAINT teskeid_event_person_labels_state_check
    CHECK (label_state IN ('resolved', 'needs_owner_input')),
  CONSTRAINT teskeid_event_person_labels_shape_check CHECK (
    (
      label_state = 'resolved'
      AND public.teskeid_event_private_valid_shared_name_v2(
        shared_display_name
      )
    ) OR (
      label_state = 'needs_owner_input'
      AND shared_display_name IS NULL
    )
  ),
  CONSTRAINT teskeid_event_person_labels_version_check
    CHECK (label_version > 0)
);

CREATE TABLE public.teskeid_event_participations (
  event_id                       uuid        NOT NULL,
  event_guest_id                 uuid        NOT NULL,
  recipient_user_id              uuid        NULL,
  recipient_email_canonical      text        NULL,
  identity_generation            bigint      NOT NULL DEFAULT 1,
  identity_version               bigint      NOT NULL DEFAULT 1,
  identity_claimed_at            timestamptz NULL,
  claim_source_invitation_id     uuid        NULL,
  access_state                   text        NOT NULL DEFAULT 'active',
  access_version                 bigint      NOT NULL DEFAULT 1,
  access_updated_at              timestamptz NOT NULL DEFAULT pg_catalog.now(),
  rsvp_state                     text        NOT NULL DEFAULT 'no_response',
  rsvp_version                   bigint      NOT NULL DEFAULT 1,
  rsvp_updated_at                timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at                     timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at                     timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_participations_pkey
    PRIMARY KEY (event_id, event_guest_id),
  CONSTRAINT teskeid_event_participations_email_check CHECK (
    recipient_email_canonical IS NULL OR (
      recipient_user_id IS NULL
      AND public.teskeid_event_private_valid_canonical_email_v2(
        recipient_email_canonical
      )
    )
  ),
  CONSTRAINT teskeid_event_participations_identity_version_check
    CHECK (identity_generation > 0 AND identity_version > 0),
  CONSTRAINT teskeid_event_participations_claim_shape_check CHECK (
    (
      recipient_user_id IS NOT NULL
      AND recipient_email_canonical IS NULL
      AND identity_claimed_at IS NOT NULL
    ) OR (
      recipient_user_id IS NULL
      AND (
        (recipient_email_canonical IS NOT NULL
          AND identity_claimed_at IS NULL
          AND claim_source_invitation_id IS NULL)
        OR (
          recipient_email_canonical IS NULL
          AND (
            (identity_claimed_at IS NULL
              AND claim_source_invitation_id IS NULL)
            OR identity_claimed_at IS NOT NULL
          )
        )
      )
    )
  ),
  CONSTRAINT teskeid_event_participations_access_check
    CHECK (access_state IN ('active', 'left', 'revoked')),
  CONSTRAINT teskeid_event_participations_tombstone_access_check CHECK (
    NOT (
      recipient_user_id IS NULL
      AND recipient_email_canonical IS NULL
      AND identity_claimed_at IS NOT NULL
      AND access_state = 'active'
    )
  ),
  CONSTRAINT teskeid_event_participations_rsvp_check
    CHECK (rsvp_state IN ('no_response', 'attending', 'not_attending')),
  CONSTRAINT teskeid_event_participations_state_versions_check
    CHECK (access_version > 0 AND rsvp_version > 0)
);

CREATE UNIQUE INDEX teskeid_event_participations_active_user_uidx
  ON public.teskeid_event_participations(event_id, recipient_user_id)
  WHERE access_state = 'active' AND recipient_user_id IS NOT NULL;
CREATE UNIQUE INDEX teskeid_event_participations_active_email_uidx
  ON public.teskeid_event_participations(event_id, recipient_email_canonical)
  WHERE access_state = 'active' AND recipient_email_canonical IS NOT NULL;
CREATE INDEX teskeid_event_participations_recipient_user_idx
  ON public.teskeid_event_participations(recipient_user_id, access_state, event_id)
  WHERE recipient_user_id IS NOT NULL;
CREATE INDEX teskeid_event_participations_recipient_email_idx
  ON public.teskeid_event_participations(
    recipient_email_canonical, access_state, event_id, event_guest_id
  ) WHERE recipient_email_canonical IS NOT NULL;

CREATE TABLE public.teskeid_event_participation_mutation_requests (
  actor_user_id uuid        NOT NULL,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at  timestamptz NULL,

  CONSTRAINT teskeid_event_participation_requests_pkey
    PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT teskeid_event_participation_requests_operation_check CHECK (
    operation IN (
      'create_with_participations_v2',
      'replace_roster_with_participations_v2',
      'repair_person_label_v2',
      'set_rsvp_v2'
    )
  ),
  CONSTRAINT teskeid_event_participation_requests_fingerprint_check
    CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT teskeid_event_participation_requests_result_check CHECK (
    result IS NULL OR (
      pg_catalog.jsonb_typeof(result) = 'object'
      AND pg_catalog.octet_length(result::text) <= 32768
    )
  )
);

CREATE TABLE
  public.teskeid_event_participation_invitation_terminalizations (
    invitation_id      uuid        PRIMARY KEY,
    event_id           uuid        NOT NULL,
    event_guest_id     uuid        NOT NULL,
    identity_generation bigint     NOT NULL,
    reason             text        NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT pg_catalog.now(),

    CONSTRAINT teskeid_event_participation_terminalizations_generation_check
      CHECK (identity_generation > 0),
    CONSTRAINT teskeid_event_participation_terminalizations_reason_check
      CHECK (reason = 'identity_claim')
  );

-- Nontransactional evidence that any deployed v1 write reached the deferred
-- compatibility bridge after SQL149.  Recovery requires is_called=false, so
-- even an aborted or semantic-no-op legacy sync closes rollback fail-closed.
CREATE SEQUENCE public.teskeid_event_v1_bridge_observation_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9223372036854775807
  START WITH 1
  CACHE 1
  NO CYCLE;

ALTER TABLE public.teskeid_event_person_labels OWNER TO postgres;
ALTER TABLE public.teskeid_event_participations OWNER TO postgres;
ALTER TABLE public.teskeid_event_participation_mutation_requests OWNER TO postgres;
ALTER TABLE public.teskeid_event_participation_invitation_terminalizations
  OWNER TO postgres;
ALTER SEQUENCE public.teskeid_event_v1_bridge_observation_seq
  OWNER TO postgres;
ALTER SEQUENCE public.teskeid_event_v1_bridge_observation_seq OWNED BY NONE;

ALTER TABLE public.teskeid_event_person_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_person_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_mutation_requests
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_mutation_requests
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_invitation_terminalizations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_invitation_terminalizations
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teskeid_event_person_labels
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_participations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_participation_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE
  public.teskeid_event_participation_invitation_terminalizations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.teskeid_event_v1_bridge_observation_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.teskeid_event_private_begin_participation_request_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing public.teskeid_event_participation_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_operation NOT IN (
       'create_with_participations_v2',
       'replace_roster_with_participations_v2',
       'repair_person_label_v2',
       'set_rsvp_v2'
     )
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 14902)
  );
  INSERT INTO public.teskeid_event_participation_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, p_operation, p_fingerprint
  ) ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request_row.* INTO v_existing
  FROM public.teskeid_event_participation_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
  FOR UPDATE;
  IF v_existing.operation <> p_operation
     OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_conflict';
  END IF;
  IF v_existing.result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
  END IF;
  RETURN v_existing.result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_finish_participation_request_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.jsonb_typeof(p_result) <> 'object'
     OR pg_catalog.octet_length(p_result::text) > 32768
     OR p_result->>'request_id' IS DISTINCT FROM p_request_id::text THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  UPDATE public.teskeid_event_participation_mutation_requests AS request_row
  SET result = p_result,
      completed_at = pg_catalog.now()
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
    AND request_row.result IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_idempotency_incomplete';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_guard_participation_request_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.actor_user_id <> NEW.actor_user_id
     OR OLD.request_id <> NEW.request_id
     OR OLD.operation <> NEW.operation
     OR OLD.fingerprint <> NEW.fingerprint
     OR OLD.created_at <> NEW.created_at
     OR OLD.result IS NOT NULL
     OR NEW.result IS NULL
     OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_receipt_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_ensure_person_v2(
  p_event_id uuid,
  p_event_guest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_name text;
  v_profile_name text;
  v_user_id uuid;
  v_email text;
  v_access_state text;
  v_rsvp_state text := 'no_response';
  v_latest_invitation public.teskeid_event_guest_invitations%ROWTYPE;
  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;
BEGIN
  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id;
  IF v_guest.id IS NULL THEN
    RETURN;
  END IF;

  v_name := public.teskeid_event_private_normalize_shared_name_v2(
    v_guest.display_name_snapshot
  );
  SELECT public.teskeid_event_private_normalize_shared_name_v2(
    profile.display_name
  ) INTO v_profile_name
  FROM public.profiles AS profile
  WHERE profile.id = v_guest.linked_user_id;
  IF public.teskeid_event_private_valid_shared_name_v2(v_profile_name) THEN
    v_name := v_profile_name;
  ELSIF v_guest.source_kind = 'manual_email'
     OR (
       v_guest.source_kind = 'relationship'
       AND pg_catalog.lower(v_name) = 'teskeiðarnotandi'
     )
     OR NOT public.teskeid_event_private_valid_shared_name_v2(v_name) THEN
    v_name := NULL;
  END IF;
  INSERT INTO public.teskeid_event_person_labels (
    event_id, event_guest_id, label_state, shared_display_name
  ) VALUES (
    v_guest.event_id,
    v_guest.id,
    CASE WHEN v_name IS NULL THEN 'needs_owner_input' ELSE 'resolved' END,
    v_name
  ) ON CONFLICT (event_id, event_guest_id) DO NOTHING;

  SELECT membership.* INTO v_membership
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = v_guest.event_id
    AND membership.event_guest_id = v_guest.id
  ORDER BY membership.accepted_at DESC, membership.user_id
  LIMIT 1;

  SELECT invitation.* INTO v_latest_invitation
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.event_id = v_guest.event_id
    AND invitation.event_guest_id = v_guest.id
  ORDER BY invitation.created_at DESC, invitation.id DESC
  LIMIT 1;

  v_user_id := COALESCE(
    v_membership.user_id,
    CASE WHEN v_latest_invitation.status IN ('accepted', 'left', 'revoked')
      THEN v_latest_invitation.accepted_user_id ELSE NULL END,
    v_guest.linked_user_id
  );
  v_email := CASE
    WHEN v_user_id IS NOT NULL THEN NULL
    WHEN v_guest.status = 'removed'
      OR v_latest_invitation.status IN ('cancelled', 'revoked', 'left')
      THEN NULL
    WHEN v_latest_invitation.status = 'pending'
      THEN v_latest_invitation.recipient_email_canonical
    WHEN v_guest.source_kind = 'manual_email'
      THEN v_guest.email_canonical
    ELSE NULL
  END;
  IF v_email IS NOT NULL AND NOT
    public.teskeid_event_private_valid_canonical_email_v2(v_email)
  THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  v_access_state := CASE
    WHEN v_guest.status = 'removed' THEN 'revoked'
    WHEN v_membership.user_id IS NOT NULL THEN 'active'
    WHEN v_latest_invitation.status = 'left' THEN 'left'
    WHEN v_latest_invitation.status IN ('revoked', 'cancelled') THEN 'revoked'
    ELSE 'active'
  END;
  v_rsvp_state := CASE
    WHEN v_membership.user_id IS NOT NULL
      OR v_latest_invitation.status IN ('accepted', 'left', 'revoked')
      THEN 'attending'
    WHEN v_latest_invitation.status = 'declined' THEN 'not_attending'
    ELSE 'no_response'
  END;

  IF v_access_state = 'active' AND v_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS other_participation
    WHERE other_participation.event_id = v_guest.event_id
      AND other_participation.event_guest_id <> v_guest.id
      AND other_participation.access_state = 'active'
      AND other_participation.recipient_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  IF v_access_state = 'active' AND v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS other_participation
    WHERE other_participation.event_id = v_guest.event_id
      AND other_participation.event_guest_id <> v_guest.id
      AND other_participation.access_state = 'active'
      AND other_participation.recipient_user_id IS NULL
      AND other_participation.recipient_email_canonical = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  INSERT INTO public.teskeid_event_participations (
    event_id, event_guest_id,
    recipient_user_id, recipient_email_canonical,
    identity_claimed_at, claim_source_invitation_id,
    access_state, access_updated_at,
    rsvp_state, rsvp_updated_at,
    created_at, updated_at
  ) VALUES (
    v_guest.event_id, v_guest.id,
    v_user_id, v_email,
    CASE WHEN v_user_id IS NOT NULL
      THEN COALESCE(v_membership.accepted_at,
        v_latest_invitation.accepted_at, v_guest.created_at)
      ELSE NULL END,
    CASE WHEN v_user_id IS NOT NULL
      THEN COALESCE(v_membership.accepted_invitation_id,
        v_latest_invitation.id) ELSE NULL END,
    v_access_state, COALESCE(
      v_membership.accepted_at,
      v_latest_invitation.updated_at,
      v_guest.updated_at
    ),
    v_rsvp_state, COALESCE(
      v_membership.accepted_at,
      v_latest_invitation.updated_at,
      v_guest.updated_at
    ),
    v_guest.created_at, GREATEST(
      v_guest.updated_at,
      COALESCE(v_latest_invitation.updated_at, v_guest.updated_at)
    )
  ) ON CONFLICT (event_id, event_guest_id) DO NOTHING;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_expire_bound_invitations_v2(
  p_recipient_user_id uuid,
  p_confirmed_email_canonical text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_expired_count integer := 0;
  v_candidate_count integer;
BEGIN
  IF p_recipient_user_id IS NULL OR (
    p_confirmed_email_canonical IS NOT NULL
    AND NOT public.teskeid_event_private_valid_canonical_email_v2(
      p_confirmed_email_canonical
    )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_candidate_count
  FROM (
    SELECT invitation.id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
    WHERE participation.recipient_user_id = p_recipient_user_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical IS DISTINCT FROM
        p_confirmed_email_canonical
    ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
    LIMIT 101
  ) AS bounded_candidate;
  IF v_candidate_count > 100 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  -- auth.users UPDATE already owns the account row.  SKIP LOCKED avoids the
  -- inverse account -> invitation wait against a frozen v1 owner transaction
  -- that already owns an invitation and is about to revalidate this account.
  SELECT COALESCE(
    pg_catalog.array_agg(locked_invitation.id ORDER BY
      locked_invitation.event_id,
      locked_invitation.event_guest_id,
      locked_invitation.id
    ),
    ARRAY[]::uuid[]
  ) INTO v_invitation_ids
  FROM (
    SELECT invitation.id, invitation.event_id,
      invitation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
    WHERE participation.recipient_user_id = p_recipient_user_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical IS DISTINCT FROM
        p_confirmed_email_canonical
    ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
    FOR UPDATE OF invitation SKIP LOCKED
  ) AS locked_invitation;

  IF pg_catalog.cardinality(v_invitation_ids) > 0 THEN
    v_expired_count :=
      public.teskeid_event_attendance_terminalize_invitations(
        v_invitation_ids, 'expired'
      );
  END IF;

  -- A visible-but-skipped pending row means a concurrent legacy writer owns
  -- it.  Abort the account-email change without logging either address.  New
  -- uncommitted pending rows are invisible here but must wait on the account
  -- lock in the immediate invitation guard and are rejected after recheck.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
    WHERE participation.recipient_user_id = p_recipient_user_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical IS DISTINCT FROM
        p_confirmed_email_canonical
  ) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  RETURN v_expired_count;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_guard_bound_invitation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_recipient_user_id uuid;
  v_current_email text;
  v_expected_email text;
BEGIN
  IF NEW.status = 'pending' THEN
    v_expected_email := NEW.recipient_email_canonical;
  ELSIF TG_OP = 'UPDATE'
     AND OLD.status = 'pending'
     AND NEW.status IN ('accepted', 'declined') THEN
    v_expected_email := OLD.recipient_email_canonical;
  ELSE
    RETURN NEW;
  END IF;

  SELECT participation.recipient_user_id
  INTO v_recipient_user_id
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = NEW.event_id
    AND participation.event_guest_id = NEW.event_guest_id;

  -- Frozen create/replace inserts a new access_only invitation before its
  -- deferred/explicit SQL149 ensure step has created the participation row.
  -- In that narrow first-write window the active legacy guest link is the
  -- exact durable-user proof; it must pass the same strict confirmed-email
  -- validation as an already-bound participation.
  IF v_recipient_user_id IS NULL
     AND NEW.invitation_kind = 'access_only' THEN
    SELECT guest.linked_user_id
    INTO v_recipient_user_id
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = NEW.event_id
      AND guest.id = NEW.event_guest_id
      AND guest.status = 'active';
    IF v_recipient_user_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
    END IF;
  END IF;

  IF v_recipient_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A claimed/bound generation is authorized by its durable user id only.
  -- The frozen identity_and_access response path authorizes decline by email
  -- before it has a user-id assertion, so no such token may exist once this
  -- participation is bound. Access-only invitations remain safe because the
  -- frozen response path also requires guest.linked_user_id = actor.
  IF NEW.invitation_kind = 'identity_and_access' THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  -- The exact bound auth row is the serialization boundary shared with
  -- auth-email updates and the frozen invitation response flow.  Holding this
  -- FOR SHARE lock through invitation commit closes the otherwise possible
  -- stale-email insert/update race.
  SELECT CASE
    WHEN public.teskeid_event_private_valid_canonical_email_v2(
      public.normalize_email_canonical(account.email)
    ) THEN public.normalize_email_canonical(account.email)
    ELSE NULL
  END
  INTO v_current_email
  FROM auth.users AS account
  WHERE account.id = v_recipient_user_id
    AND account.email_confirmed_at IS NOT NULL
  FOR SHARE OF account;

  IF v_current_email IS NULL
     OR v_current_email IS DISTINCT FROM v_expected_email
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status = 'pending'
       AND NEW.status = 'accepted'
       AND NEW.accepted_user_id IS DISTINCT FROM v_recipient_user_id
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_auth_email_invitations_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_confirmed_email text;
  v_new_confirmed_email text;
BEGIN
  v_old_confirmed_email := CASE
    WHEN OLD.email_confirmed_at IS NOT NULL
      AND public.teskeid_event_private_valid_canonical_email_v2(
        public.normalize_email_canonical(OLD.email)
      ) THEN public.normalize_email_canonical(OLD.email)
    ELSE NULL
  END;
  v_new_confirmed_email := CASE
    WHEN NEW.email_confirmed_at IS NOT NULL
      AND public.teskeid_event_private_valid_canonical_email_v2(
        public.normalize_email_canonical(NEW.email)
      ) THEN public.normalize_email_canonical(NEW.email)
    ELSE NULL
  END;
  IF v_old_confirmed_email IS NOT DISTINCT FROM v_new_confirmed_email THEN
    RETURN NEW;
  END IF;
  PERFORM public.teskeid_event_private_expire_bound_invitations_v2(
    OLD.id, v_new_confirmed_email
  );
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_participation_unlink_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.recipient_user_id IS NOT NULL
     AND NEW.recipient_user_id IS NULL THEN
    NEW.recipient_email_canonical := NULL;
    NEW.access_version := OLD.access_version
      + CASE WHEN OLD.access_state IS DISTINCT FROM 'left' THEN 1 ELSE 0 END;
    NEW.access_state := 'left';
    NEW.access_updated_at := CASE
      WHEN OLD.access_state IS DISTINCT FROM 'left' THEN pg_catalog.now()
      ELSE OLD.access_updated_at END;
    NEW.identity_version := OLD.identity_version + 1;
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_auth_delete_participations_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate_count integer;
BEGIN
  -- Burn every email capability while the bound account row is still the
  -- authoritative identity.  A locked pending row aborts deletion safely;
  -- it is never left behind for a future owner of the old address.
  PERFORM public.teskeid_event_private_expire_bound_invitations_v2(
    OLD.id, NULL
  );

  SELECT pg_catalog.count(*)::integer INTO v_candidate_count
  FROM (
    SELECT participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    WHERE participation.recipient_user_id = OLD.id
      AND guest.linked_user_id IS DISTINCT FROM OLD.id
      AND event_row.owner_user_id <> OLD.id
    ORDER BY participation.event_id, participation.event_guest_id
    LIMIT 101
  ) AS bounded_candidate;
  IF v_candidate_count > 100 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  -- Only SQL149-only claims need this bridge.  Legacy guest links are handled
  -- by the frozen guest/auth deletion path, and rows in an Event owned by the
  -- deleted account disappear with that Event.  Narrowing the predicate avoids
  -- taking participation locks ahead of legacy guest/Event cascade locks.
  PERFORM participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
  WHERE participation.recipient_user_id = OLD.id
    AND guest.linked_user_id IS DISTINCT FROM OLD.id
    AND event_row.owner_user_id <> OLD.id
  ORDER BY participation.event_id, participation.event_guest_id
  FOR UPDATE OF participation;

  UPDATE public.teskeid_event_participations AS participation
  SET recipient_user_id = NULL,
      recipient_email_canonical = NULL,
      access_state = 'left',
      updated_at = pg_catalog.now()
  FROM public.teskeid_event_guests AS guest,
       public.teskeid_events AS event_row
  WHERE participation.recipient_user_id = OLD.id
    AND guest.event_id = participation.event_id
    AND guest.id = participation.event_guest_id
    AND guest.linked_user_id IS DISTINCT FROM OLD.id
    AND event_row.id = participation.event_id
    AND event_row.owner_user_id <> OLD.id;
  RETURN OLD;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_apply_participation_v2(
  p_event_id uuid,
  p_event_guest_id uuid,
  p_identity_action text,
  p_recipient_user_id uuid,
  p_recipient_email_canonical text,
  p_claim_source_invitation_id uuid,
  p_increment_generation boolean,
  p_access_state text,
  p_rsvp_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.teskeid_event_participations%ROWTYPE;
  v_user_id uuid;
  v_email text;
  v_claimed_at timestamptz;
  v_claim_source uuid;
  v_generation bigint;
  v_access text;
  v_rsvp text;
  v_identity_changed boolean;
  v_access_changed boolean;
  v_rsvp_changed boolean;
BEGIN
  IF p_identity_action NOT IN ('preserve', 'bind', 'target', 'clear_target')
     OR (p_access_state IS NOT NULL
       AND p_access_state NOT IN ('active', 'left', 'revoked'))
     OR (p_rsvp_state IS NOT NULL
       AND p_rsvp_state NOT IN ('no_response', 'attending', 'not_attending'))
  THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  PERFORM public.teskeid_event_private_ensure_person_v2(
    p_event_id, p_event_guest_id
  );
  SELECT participation.* INTO v_row
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
  FOR UPDATE;
  IF v_row.event_guest_id IS NULL THEN
    RETURN;
  END IF;

  v_user_id := v_row.recipient_user_id;
  v_email := v_row.recipient_email_canonical;
  v_claimed_at := v_row.identity_claimed_at;
  v_claim_source := v_row.claim_source_invitation_id;
  v_generation := v_row.identity_generation
    + CASE WHEN p_increment_generation THEN 1 ELSE 0 END;

  IF p_identity_action = 'bind' THEN
    IF p_recipient_user_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    IF v_row.recipient_user_id IS NULL
       AND v_row.identity_claimed_at IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    IF v_row.recipient_user_id IS NOT NULL
       AND v_row.recipient_user_id IS DISTINCT FROM p_recipient_user_id THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    v_user_id := p_recipient_user_id;
    v_email := NULL;
    v_claimed_at := COALESCE(v_row.identity_claimed_at, pg_catalog.now());
    v_claim_source := COALESCE(
      p_claim_source_invitation_id, v_row.claim_source_invitation_id
    );
  ELSIF p_identity_action = 'target' THEN
    IF v_row.recipient_user_id IS NULL THEN
      v_user_id := NULL;
      v_email := public.normalize_email_canonical(
        p_recipient_email_canonical
      );
      IF NOT public.teskeid_event_private_valid_canonical_email_v2(v_email)
      THEN
        RAISE EXCEPTION 'teskeid_event_invalid_input';
      END IF;
      v_claimed_at := NULL;
      v_claim_source := NULL;
    END IF;
  ELSIF p_identity_action = 'clear_target' THEN
    IF v_row.recipient_user_id IS NULL THEN
      v_email := NULL;
    END IF;
  END IF;

  v_access := COALESCE(p_access_state, v_row.access_state);
  v_rsvp := COALESCE(p_rsvp_state, v_row.rsvp_state);
  IF v_user_id IS NULL
     AND v_email IS NULL
     AND v_claimed_at IS NOT NULL
     AND v_access = 'active' THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_access = 'active' AND v_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS other_participation
    WHERE other_participation.event_id = p_event_id
      AND other_participation.event_guest_id <> p_event_guest_id
      AND other_participation.access_state = 'active'
      AND other_participation.recipient_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  IF v_access = 'active' AND v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS other_participation
    WHERE other_participation.event_id = p_event_id
      AND other_participation.event_guest_id <> p_event_guest_id
      AND other_participation.access_state = 'active'
      AND other_participation.recipient_user_id IS NULL
      AND other_participation.recipient_email_canonical = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  v_identity_changed := v_user_id IS DISTINCT FROM v_row.recipient_user_id
    OR v_email IS DISTINCT FROM v_row.recipient_email_canonical
    OR v_claimed_at IS DISTINCT FROM v_row.identity_claimed_at
    OR v_claim_source IS DISTINCT FROM v_row.claim_source_invitation_id
    OR v_generation IS DISTINCT FROM v_row.identity_generation;
  v_access_changed := v_access IS DISTINCT FROM v_row.access_state;
  v_rsvp_changed := v_rsvp IS DISTINCT FROM v_row.rsvp_state;

  IF v_identity_changed OR v_access_changed OR v_rsvp_changed THEN
    UPDATE public.teskeid_event_participations AS participation
    SET recipient_user_id = v_user_id,
        recipient_email_canonical = v_email,
        identity_claimed_at = v_claimed_at,
        claim_source_invitation_id = v_claim_source,
        identity_generation = v_generation,
        identity_version = participation.identity_version
          + CASE WHEN v_identity_changed THEN 1 ELSE 0 END,
        access_state = v_access,
        access_version = participation.access_version
          + CASE WHEN v_access_changed THEN 1 ELSE 0 END,
        access_updated_at = CASE WHEN v_access_changed
          THEN pg_catalog.now() ELSE participation.access_updated_at END,
        rsvp_state = v_rsvp,
        rsvp_version = participation.rsvp_version
          + CASE WHEN v_rsvp_changed THEN 1 ELSE 0 END,
        rsvp_updated_at = CASE WHEN v_rsvp_changed
          THEN pg_catalog.now() ELSE participation.rsvp_updated_at END,
        updated_at = pg_catalog.now()
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id;
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_v1_participation_bridge_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid;
  v_event_guest_id uuid;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_invitation_count integer;
  v_increment_generation boolean;
  v_claim_terminalization boolean := false;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_v1_bridge_observation_seq'::regclass
  );
  v_event_id := COALESCE(
    (pg_catalog.to_jsonb(NEW)->>'event_id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'event_id')::uuid
  );
  v_event_guest_id := COALESCE(
    (pg_catalog.to_jsonb(NEW)->>'event_guest_id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'event_guest_id')::uuid,
    (pg_catalog.to_jsonb(NEW)->>'id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'id')::uuid
  );
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  PERFORM public.teskeid_event_private_ensure_person_v2(
    v_event_id, v_event_guest_id
  );
  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = v_event_id
    AND guest.id = v_event_guest_id;
  IF v_guest.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'teskeid_event_guests' THEN
    IF v_guest.status = 'removed' THEN
      PERFORM public.teskeid_event_private_apply_participation_v2(
        v_event_id, v_event_guest_id, 'clear_target', NULL, NULL, NULL,
        false, 'revoked', NULL
      );
    ELSIF TG_OP = 'UPDATE'
       AND OLD.linked_user_id IS NOT NULL
       AND NEW.linked_user_id IS NULL THEN
      UPDATE public.teskeid_event_participations AS participation
      SET recipient_user_id = NULL,
          recipient_email_canonical = NULL,
          access_state = 'left',
          updated_at = pg_catalog.now()
      WHERE participation.event_id = v_event_id
        AND participation.event_guest_id = v_event_guest_id;
    ELSIF TG_OP = 'UPDATE'
       AND OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id
       AND NEW.linked_user_id IS NOT NULL THEN
      PERFORM public.teskeid_event_private_apply_participation_v2(
        v_event_id, v_event_guest_id, 'bind', NEW.linked_user_id,
        NULL, NULL, false, NULL, NULL
      );
    END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'teskeid_event_guest_invitations' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      SELECT pg_catalog.count(*)::integer INTO v_invitation_count
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.event_id = v_event_id
        AND invitation.event_guest_id = v_event_guest_id;
      SELECT
        v_invitation_count > 1
        OR participation.identity_claimed_at IS NOT NULL
        OR participation.access_state <> 'active'
        OR (
          participation.recipient_user_id IS NULL
          AND participation.recipient_email_canonical
            IS DISTINCT FROM NEW.recipient_email_canonical
        )
      INTO v_increment_generation
      FROM public.teskeid_event_participations AS participation
      WHERE participation.event_id = v_event_id
        AND participation.event_guest_id = v_event_guest_id;
      PERFORM public.teskeid_event_private_apply_participation_v2(
        v_event_id, v_event_guest_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.teskeid_event_participations AS participation
          WHERE participation.event_id = v_event_id
            AND participation.event_guest_id = v_event_guest_id
            AND participation.recipient_user_id IS NOT NULL
        ) THEN 'preserve' ELSE 'target' END,
        NULL, NEW.recipient_email_canonical, NULL,
        COALESCE(v_increment_generation, v_invitation_count > 1),
        'active', 'no_response'
      );
      RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'pending'
       AND NEW.status <> 'pending' THEN
      IF NEW.status = 'accepted' THEN
        PERFORM public.teskeid_event_private_apply_participation_v2(
          v_event_id, v_event_guest_id, 'bind', NEW.accepted_user_id,
          NULL, NEW.id, false, 'active', 'attending'
        );
      ELSIF NEW.status = 'declined' THEN
        PERFORM public.teskeid_event_private_apply_participation_v2(
          v_event_id, v_event_guest_id, 'preserve', NULL, NULL, NULL,
          false, 'active', 'not_attending'
        );
      ELSIF NEW.status = 'cancelled' THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.teskeid_event_participation_invitation_terminalizations
            AS terminalization
          JOIN public.teskeid_event_participations AS participation
            ON participation.event_id = terminalization.event_id
           AND participation.event_guest_id = terminalization.event_guest_id
           AND participation.identity_generation =
             terminalization.identity_generation
           AND participation.claim_source_invitation_id =
             terminalization.invitation_id
          WHERE terminalization.invitation_id = NEW.id
            AND terminalization.reason = 'identity_claim'
        ) INTO v_claim_terminalization;
        IF NOT v_claim_terminalization THEN
          PERFORM public.teskeid_event_private_apply_participation_v2(
            v_event_id, v_event_guest_id, 'clear_target', NULL, NULL, NULL,
            false, 'revoked', NULL
          );
        END IF;
      END IF;
      RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'accepted'
       AND NEW.status = 'left' THEN
      PERFORM public.teskeid_event_private_apply_participation_v2(
        v_event_id, v_event_guest_id, 'preserve', NULL, NULL, NULL,
        false, 'left', NULL
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted'
       AND NEW.status = 'revoked' THEN
      PERFORM public.teskeid_event_private_apply_participation_v2(
        v_event_id, v_event_guest_id, 'preserve', NULL, NULL, NULL,
        false, 'revoked', NULL
      );
    END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'teskeid_event_attendance_memberships'
     AND TG_OP = 'INSERT' THEN
    PERFORM public.teskeid_event_private_apply_participation_v2(
      v_event_id, v_event_guest_id, 'bind', NEW.user_id,
      NULL, NEW.accepted_invitation_id, false, 'active', 'attending'
    );
  END IF;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_claim_participations_v2(
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_probe_email text;
  v_owner_id uuid;
  v_owner_ids uuid[] := ARRAY[]::uuid[];
  v_current_owner_ids uuid[] := ARRAY[]::uuid[];
  v_candidate_count integer;
  v_candidate record;
  v_invitation_id uuid;
  v_claimed integer := 0;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  SELECT public.normalize_email_canonical(account.email)
  INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF NOT public.teskeid_event_private_valid_canonical_email_v2(v_email) THEN
    RETURN 0;
  END IF;
  v_probe_email := v_email;

  SELECT pg_catalog.count(*)::integer INTO v_candidate_count
  FROM (
    SELECT participation.event_id, participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_events AS owned_event
        WHERE owned_event.id = participation.event_id
          AND owned_event.owner_user_id = p_actor_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
    ORDER BY participation.event_id, participation.event_guest_id
    LIMIT 101
  ) AS candidate;
  IF v_candidate_count > 100 THEN
    RAISE EXCEPTION 'teskeid_event_claim_limit_exceeded';
  END IF;
  IF v_candidate_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(owner_row.owner_user_id
    ORDER BY owner_row.owner_user_id), ARRAY[]::uuid[])
  INTO v_owner_ids
  FROM (
    SELECT DISTINCT event_row.owner_user_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND event_row.owner_user_id <> p_actor_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
    ORDER BY event_row.owner_user_id
  ) AS owner_row;
  FOREACH v_owner_id IN ARRAY v_owner_ids
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_owner_id::text, 13201)
    );
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_probe_email, 9702)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9602)
  );

  SELECT public.normalize_email_canonical(account.email)
  INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL
  FOR SHARE OF account;
  IF NOT public.teskeid_event_private_valid_canonical_email_v2(v_email)
     OR v_email IS DISTINCT FROM v_probe_email THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(owner_row.owner_user_id
    ORDER BY owner_row.owner_user_id), ARRAY[]::uuid[])
  INTO v_current_owner_ids
  FROM (
    SELECT DISTINCT event_row.owner_user_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND event_row.owner_user_id <> p_actor_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
    ORDER BY event_row.owner_user_id
  ) AS owner_row;
  -- Another first-read claim for this same actor may have completed while this
  -- transaction waited on the deterministic owner/email/user locks.  In that
  -- case every unbound candidate has disappeared and the already-bound rows
  -- are the converged authoritative state consumed by the caller's read.
  IF pg_catalog.cardinality(v_current_owner_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF v_current_owner_ids IS DISTINCT FROM v_owner_ids THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_candidate_count
  FROM (
    SELECT participation.event_id, participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_events AS owned_event
        WHERE owned_event.id = participation.event_id
          AND owned_event.owner_user_id = p_actor_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
    ORDER BY participation.event_id, participation.event_guest_id
    LIMIT 101
  ) AS candidate;
  IF v_candidate_count > 100 THEN
    RAISE EXCEPTION 'teskeid_event_claim_limit_exceeded';
  END IF;

  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id <> p_actor_id
    AND event_row.id IN (
    SELECT participation.event_id
    FROM public.teskeid_event_participations AS participation
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
  )
  ORDER BY event_row.id
  FOR UPDATE;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE (guest.event_id, guest.id) IN (
    SELECT participation.event_id, participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_events AS owned_event
        WHERE owned_event.id = participation.event_id
          AND owned_event.owner_user_id = p_actor_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
  )
  ORDER BY guest.event_id, guest.id
  FOR UPDATE;
  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE (invitation.event_id, invitation.event_guest_id) IN (
    SELECT participation.event_id, participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_events AS owned_event
        WHERE owned_event.id = participation.event_id
          AND owned_event.owner_user_id = p_actor_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
  ) AND invitation.status = 'pending'
  ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
  FOR UPDATE;
  PERFORM participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  WHERE participation.access_state = 'active'
    AND participation.recipient_user_id IS NULL
    AND participation.recipient_email_canonical = v_email
    AND NOT EXISTS (
      SELECT 1 FROM public.teskeid_events AS owned_event
      WHERE owned_event.id = participation.event_id
        AND owned_event.owner_user_id = p_actor_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS bound_self
      WHERE bound_self.event_id = participation.event_id
        AND bound_self.event_guest_id <> participation.event_guest_id
        AND bound_self.recipient_user_id = p_actor_id
    )
  ORDER BY participation.event_id, participation.event_guest_id
  FOR UPDATE;

  FOR v_candidate IN
    SELECT participation.*
    FROM public.teskeid_event_participations AS participation
    WHERE participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_events AS owned_event
        WHERE owned_event.id = participation.event_id
          AND owned_event.owner_user_id = p_actor_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS bound_self
        WHERE bound_self.event_id = participation.event_id
          AND bound_self.event_guest_id <> participation.event_guest_id
          AND bound_self.recipient_user_id = p_actor_id
      )
    ORDER BY participation.event_id, participation.event_guest_id
  LOOP
    SELECT invitation.id INTO v_invitation_id
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = v_candidate.event_id
      AND invitation.event_guest_id = v_candidate.event_guest_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical = v_email
    ORDER BY invitation.created_at DESC, invitation.id DESC
    LIMIT 1;

    IF v_invitation_id IS NOT NULL THEN
      INSERT INTO
        public.teskeid_event_participation_invitation_terminalizations (
          invitation_id, event_id, event_guest_id,
          identity_generation, reason
        ) VALUES (
          v_invitation_id, v_candidate.event_id,
          v_candidate.event_guest_id, v_candidate.identity_generation,
          'identity_claim'
        ) ON CONFLICT (invitation_id) DO NOTHING;
      IF NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participation_invitation_terminalizations
          AS terminalization
        WHERE terminalization.invitation_id = v_invitation_id
          AND terminalization.event_id = v_candidate.event_id
          AND terminalization.event_guest_id = v_candidate.event_guest_id
          AND terminalization.identity_generation =
            v_candidate.identity_generation
          AND terminalization.reason = 'identity_claim'
      ) THEN
        RAISE EXCEPTION 'teskeid_event_unavailable';
      END IF;
    END IF;

    UPDATE public.teskeid_event_participations AS participation
    SET recipient_user_id = p_actor_id,
        recipient_email_canonical = NULL,
        identity_claimed_at = pg_catalog.now(),
        claim_source_invitation_id = v_invitation_id,
        identity_version = participation.identity_version + 1,
        updated_at = pg_catalog.now()
    WHERE participation.event_id = v_candidate.event_id
      AND participation.event_guest_id = v_candidate.event_guest_id
      AND participation.identity_generation = v_candidate.identity_generation
      AND participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;

    IF v_invitation_id IS NOT NULL THEN
      PERFORM public.teskeid_event_attendance_terminalize_invitations(
        ARRAY[v_invitation_id], 'cancelled'
      );
    END IF;
    v_claimed := v_claimed + 1;
    v_invitation_id := NULL;
  END LOOP;
  RETURN v_claimed;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_assert_viewer_v2(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT CASE
    WHEN event_row.owner_user_id = p_actor_id THEN 'owner'
    WHEN EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS participation
      JOIN public.teskeid_event_guests AS self_guest
        ON self_guest.event_id = participation.event_id
       AND self_guest.id = participation.event_guest_id
       AND self_guest.status = 'active'
      WHERE participation.event_id = event_row.id
        AND participation.recipient_user_id = p_actor_id
        AND participation.access_state = 'active'
    ) THEN 'attendee'
    ELSE NULL
  END INTO v_role
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_role;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_safe_profile_name_v2(
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text;
BEGIN
  SELECT public.teskeid_event_private_normalize_shared_name_v2(
    profile.display_name
  ) INTO v_name
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id;
  IF public.teskeid_event_private_valid_shared_name_v2(v_name) THEN
    RETURN v_name;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_viewer_relationship_v2(
  p_actor_id uuid,
  p_relationship_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email_canonical text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_relationship public.relationships%ROWTYPE;
  v_relationship_id uuid;
  v_candidate_count integer;
  v_current_email text;
  v_built_in_tags jsonb;
  v_custom_labels jsonb;
  v_custom_label_count integer;
  v_alias text;
  v_email text;
  v_note text;
BEGIN
  -- After bind the durable user id is the sole identity authority.  An Auth
  -- email must never be exposed or used as an actor-controlled lookup oracle.
  -- Email matching remains available only for an unbound participation that
  -- itself carries that exact canonical recipient email.
  v_current_email := CASE WHEN p_recipient_user_id IS NULL
      AND public.teskeid_event_private_valid_canonical_email_v2(
        p_recipient_email_canonical
      )
    THEN p_recipient_email_canonical
    ELSE NULL END;

  -- All exact proofs participate in one de-duplicated candidate set.  Direct
  -- Event provenance is accepted only while it still proves the current
  -- identity; user/email proofs never priority-pick over a conflicting row.
  SELECT pg_catalog.count(DISTINCT relationship.id)::integer,
    (pg_catalog.array_agg(
      DISTINCT relationship.id ORDER BY relationship.id
    ))[1]
  INTO v_candidate_count, v_relationship_id
  FROM public.relationships AS relationship
  WHERE relationship.owner_id = p_actor_id
    AND (
      (
        relationship.id = p_relationship_id
        AND (
          (
            p_recipient_user_id IS NOT NULL
            AND relationship.counterpart_user_id = p_recipient_user_id
          )
          OR (
            v_current_email IS NOT NULL
            AND relationship.email_canonical = v_current_email
          )
          OR (
            p_recipient_user_id IS NULL
            AND v_current_email IS NULL
            AND relationship.counterpart_user_id IS NULL
            AND relationship.email_canonical IS NULL
          )
        )
      )
      OR (
        p_recipient_user_id IS NOT NULL
        AND relationship.counterpart_user_id = p_recipient_user_id
      )
      OR (
        v_current_email IS NOT NULL
        AND relationship.email_canonical = v_current_email
      )
    );
  IF v_candidate_count <> 1 OR v_relationship_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.relationships AS relationship
  WHERE relationship.id = v_relationship_id
    AND relationship.owner_id = p_actor_id;

  v_alias := public.teskeid_event_private_normalize_shared_name_v2(
    v_relationship.private_display_name
  );
  IF NOT COALESCE(
    public.teskeid_event_valid_text(v_alias, 1, 120)
    AND v_alias !~ '[[:cntrl:]]'
    AND v_alias !~ U&'[\202A-\202E\2066-\2069]',
    false
  ) THEN
    v_alias := NULL;
  END IF;
  v_email := v_relationship.email_canonical;
  IF v_email IS NOT NULL AND NOT
    public.teskeid_event_private_valid_canonical_email_v2(v_email)
  THEN
    v_email := NULL;
  END IF;
  v_note := NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
    pg_catalog.replace(pg_catalog.replace(
      v_relationship.note, E'\r\n', E'\n'
    ), E'\r', E'\n')
  ), '');
  IF pg_catalog.char_length(v_note) > 1000
     OR pg_catalog.replace(v_note, E'\n', '') ~ '[[:cntrl:]]'
     OR v_note ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
  THEN
    v_note := NULL;
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(tag_row.tag ORDER BY tag_row.sort_order),
    '[]'::jsonb)
  INTO v_built_in_tags
  FROM (
    SELECT tag.tag,
      CASE tag.tag
        WHEN 'unclassified' THEN 0 WHEN 'family' THEN 1
        WHEN 'friends' THEN 2 ELSE 3
      END AS sort_order
    FROM public.relationship_tags AS tag
    WHERE tag.relationship_id = v_relationship.id
    ORDER BY sort_order
    LIMIT 4
  ) AS tag_row;

  SELECT COALESCE(pg_catalog.jsonb_agg(label_row.name
    ORDER BY label_row.name, label_row.id), '[]'::jsonb)
  INTO v_custom_labels
  FROM (
    SELECT DISTINCT ON (canonical_label.name)
      canonical_label.id, canonical_label.name
    FROM (
      SELECT definition.id,
        public.teskeid_event_private_normalize_shared_name_v2(
          definition.name
        ) AS name
      FROM public.relationship_label_assignments AS assignment
      JOIN public.relationship_label_definitions AS definition
        ON definition.id = assignment.label_id
       AND definition.owner_id = assignment.owner_id
      WHERE assignment.owner_id = p_actor_id
        AND assignment.relationship_id = v_relationship.id
    ) AS canonical_label
    WHERE public.teskeid_event_valid_text(
      canonical_label.name, 1, 60
    )
    ORDER BY canonical_label.name, canonical_label.id
    LIMIT 20
  ) AS label_row;

  SELECT pg_catalog.count(*)::integer INTO v_custom_label_count
  FROM public.relationship_label_assignments AS assignment
  WHERE assignment.owner_id = p_actor_id
    AND assignment.relationship_id = v_relationship.id;

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'relationship',
    'alias', v_alias,
    'email', v_email,
    'built_in_tags', v_built_in_tags,
    'custom_labels', v_custom_labels,
    'hidden_custom_label_count', pg_catalog.greatest(
      v_custom_label_count - pg_catalog.jsonb_array_length(v_custom_labels), 0
    ),
    'note', v_note
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_person_projection_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_position integer,
  p_is_self boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_label public.teskeid_event_person_labels%ROWTYPE;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_profile_name text;
  v_display_name text;
  v_label_state text;
  v_disabled_reason text;
  v_viewer_private jsonb;
  v_result jsonb;
BEGIN
  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id;
  SELECT label_row.* INTO v_label
  FROM public.teskeid_event_person_labels AS label_row
  WHERE label_row.event_id = p_event_id
    AND label_row.event_guest_id = p_event_guest_id;
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id;
  IF v_guest.id IS NULL OR v_label.event_guest_id IS NULL
     OR v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  v_profile_name := public.teskeid_event_private_safe_profile_name_v2(
    v_participation.recipient_user_id
  );
  v_display_name := COALESCE(v_profile_name, v_label.shared_display_name);
  v_label_state := CASE WHEN v_display_name IS NULL
    THEN 'needs_owner_input' ELSE 'resolved' END;
  v_disabled_reason := CASE
    WHEN v_participation.access_state <> 'active' THEN 'not_active'
    WHEN v_label_state = 'needs_owner_input' THEN 'name_required'
    ELSE NULL
  END;
  v_viewer_private := public.teskeid_event_private_viewer_relationship_v2(
    p_actor_id, v_guest.relationship_id,
    v_participation.recipient_user_id,
    v_participation.recipient_email_canonical
  );
  v_result := pg_catalog.jsonb_build_object(
    'person_ref', v_guest.id,
    'participant_kind', 'guest',
    'position', p_position,
    'is_self', p_is_self,
    'label_version', v_label.label_version::text,
    'identity_version', v_participation.identity_version::text,
    'identity_generation', v_participation.identity_generation::text,
    'access_version', v_participation.access_version::text,
    'rsvp_version', v_participation.rsvp_version::text,
    'shared', pg_catalog.jsonb_build_object(
      'label_state', v_label_state,
      'display_name', v_display_name,
      'access_state', v_participation.access_state,
      'rsvp_state', v_participation.rsvp_state,
      'selectable', v_disabled_reason IS NULL,
      'bulk_eligible', v_disabled_reason IS NULL
        AND v_participation.rsvp_state <> 'not_attending',
      'disabled_reason', v_disabled_reason
    )
  );
  IF v_viewer_private IS NOT NULL THEN
    v_result := v_result || pg_catalog.jsonb_build_object(
      'viewer_private', v_viewer_private
    );
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_organizer_projection_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_display_name text;
  v_viewer_private jsonb;
  v_result jsonb;
BEGIN
  SELECT event_row.owner_user_id INTO v_owner_id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_display_name := public.teskeid_event_private_safe_profile_name_v2(
    v_owner_id
  );
  v_viewer_private := public.teskeid_event_private_viewer_relationship_v2(
    p_actor_id, NULL, v_owner_id, NULL
  );
  v_result := pg_catalog.jsonb_build_object(
    'person_ref', public.teskeid_event_uuid_from_text(
      'teskeid-event-person-source-organizer:' || p_event_id::text
    ),
    'participant_kind', 'organizer',
    'position', p_position,
    'is_self', v_owner_id = p_actor_id,
    'shared', pg_catalog.jsonb_build_object(
      'label_state', CASE WHEN v_display_name IS NULL
        THEN 'needs_owner_input' ELSE 'resolved' END,
      'display_name', v_display_name,
      'selectable', v_display_name IS NOT NULL,
      'bulk_eligible', v_display_name IS NOT NULL,
      'disabled_reason', CASE WHEN v_display_name IS NULL
        THEN 'profile_name_required' ELSE NULL END
    )
  );
  IF v_viewer_private IS NOT NULL THEN
    v_result := v_result || pg_catalog.jsonb_build_object(
      'viewer_private', v_viewer_private
    );
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_people_projection_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_viewer_role text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_people jsonb;
BEGIN
  IF p_viewer_role NOT IN ('owner', 'attendee') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH guest_positions AS (
    SELECT
      guest.id AS event_guest_id,
      participation.recipient_user_id,
      (pg_catalog.row_number() OVER (
        ORDER BY guest.position, guest.id
      ))::integer AS position
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND (p_viewer_role = 'owner' OR participation.access_state = 'active')
  ), projected AS (
    SELECT 0 AS position,
      public.teskeid_event_private_organizer_projection_v2(
        p_actor_id, p_event_id, 0
      ) AS person
    UNION ALL
    SELECT guest_position.position,
      public.teskeid_event_private_person_projection_v2(
        p_actor_id, p_event_id, guest_position.event_guest_id,
        guest_position.position,
        guest_position.recipient_user_id = p_actor_id
      ) AS person
    FROM guest_positions AS guest_position
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    projected.person ORDER BY projected.position
  ), '[]'::jsonb)
  INTO v_people
  FROM projected;
  IF pg_catalog.jsonb_array_length(v_people) < 1
     OR pg_catalog.jsonb_array_length(v_people) > 50 THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_people;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_for_actor_v2(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  SELECT pg_catalog.jsonb_build_object(
    'owned', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', owned_event.id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          owned_event.name
        ),
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS guest
          JOIN public.teskeid_event_participations AS participation
            ON participation.event_id = guest.event_id
           AND participation.event_guest_id = guest.id
          WHERE guest.event_id = owned_event.id
            AND guest.status = 'active'
            AND participation.access_state = 'active'
        ),
        'roster_revision', owned_event.roster_revision::text,
        'viewer_role', 'owner',
        'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
          owned_event.created_at
        ),
        'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
          owned_event.updated_at
        )
      ) ORDER BY owned_event.created_at DESC, owned_event.id DESC)
      FROM (
        SELECT event_row.*
        FROM public.teskeid_events AS event_row
        WHERE event_row.owner_user_id = p_actor_id
        ORDER BY event_row.created_at DESC, event_row.id DESC
        LIMIT 100
      ) AS owned_event
    ), '[]'::jsonb),
    'participating', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', attendee_event.id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          attendee_event.name
        ),
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS guest
          JOIN public.teskeid_event_participations AS participant
            ON participant.event_id = guest.event_id
           AND participant.event_guest_id = guest.id
          WHERE guest.event_id = attendee_event.id
            AND guest.status = 'active'
            AND participant.access_state = 'active'
        ),
        'roster_revision', attendee_event.roster_revision::text,
        'viewer_role', 'attendee',
        'self_rsvp_state', attendee_event.self_rsvp_state,
        'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
          attendee_event.created_at
        ),
        'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
          attendee_event.updated_at
        )
      ) ORDER BY attendee_event.created_at DESC, attendee_event.id DESC)
      FROM (
        SELECT event_row.*, participation.rsvp_state AS self_rsvp_state
        FROM public.teskeid_event_participations AS participation
        JOIN public.teskeid_event_guests AS self_guest
          ON self_guest.event_id = participation.event_id
         AND self_guest.id = participation.event_guest_id
         AND self_guest.status = 'active'
        JOIN public.teskeid_events AS event_row
          ON event_row.id = participation.event_id
        WHERE participation.recipient_user_id = p_actor_id
          AND participation.access_state = 'active'
          AND event_row.owner_user_id <> p_actor_id
        ORDER BY event_row.created_at DESC, event_row.id DESC
        LIMIT 100
      ) AS attendee_event
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_actor_view_v2(
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
  v_role text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  v_role := public.teskeid_event_private_assert_viewer_v2(
    p_actor_id, p_event_id
  );
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      event_row.name
    ),
    'roster_revision', event_row.roster_revision::text,
    'viewer_role', v_role,
    'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.created_at
    ),
    'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.updated_at
    ),
    'event_date', details.event_date,
    'event_time', CASE WHEN details.event_time IS NULL THEN NULL
      ELSE pg_catalog.to_char(details.event_time, 'HH24:MI:SS') END,
    'description', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.description, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'agenda', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.agenda, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'people', public.teskeid_event_private_people_projection_v2(
      p_actor_id, event_row.id, v_role
    )
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  LEFT JOIN public.teskeid_event_details AS details
    ON details.event_id = event_row.id
  WHERE event_row.id = p_event_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_roster_management_v2(
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
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      event_row.name
    ),
    'roster_revision', event_row.roster_revision::text,
    'viewer_role', 'owner',
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', guest.id,
        'position', guest.position::integer,
        'label_state', CASE WHEN COALESCE(
          public.teskeid_event_private_safe_profile_name_v2(
            participation.recipient_user_id
          ), label_row.shared_display_name
        ) IS NULL THEN 'needs_owner_input' ELSE 'resolved' END,
        'shared_display_name', COALESCE(
          public.teskeid_event_private_safe_profile_name_v2(
            participation.recipient_user_id
          ), label_row.shared_display_name
        ),
        'label_version', label_row.label_version::text,
        'administrative_email', CASE
          WHEN participation.access_state = 'active'
           AND participation.recipient_user_id IS NULL
           AND participation.recipient_email_canonical IS NOT NULL
            THEN participation.recipient_email_canonical
          ELSE NULL END,
        'recipient_state', CASE
          WHEN participation.recipient_user_id IS NOT NULL THEN 'user_bound'
          WHEN participation.recipient_email_canonical IS NOT NULL
            THEN 'email_unbound'
          WHEN participation.identity_claimed_at IS NOT NULL
            THEN 'identity_tombstone'
          ELSE 'name_only' END,
        'access_state', participation.access_state,
        'identity_version', participation.identity_version::text,
        'identity_generation', participation.identity_generation::text,
        'access_version', participation.access_version::text,
        'rsvp_state', participation.rsvp_state,
        'rsvp_version', participation.rsvp_version::text,
        'invitation_status', CASE
          WHEN latest_invitation.id IS NULL THEN 'not_invited'
          WHEN terminalization.invitation_id IS NOT NULL THEN 'claimed'
          ELSE latest_invitation.status END
      ) ORDER BY guest.position, guest.id)
      FROM public.teskeid_event_guests AS guest
      JOIN public.teskeid_event_person_labels AS label_row
        ON label_row.event_id = guest.event_id
       AND label_row.event_guest_id = guest.id
      JOIN public.teskeid_event_participations AS participation
        ON participation.event_id = guest.event_id
       AND participation.event_guest_id = guest.id
      LEFT JOIN LATERAL (
        SELECT invitation.*
        FROM public.teskeid_event_guest_invitations AS invitation
        WHERE invitation.event_id = guest.event_id
          AND invitation.event_guest_id = guest.id
        ORDER BY invitation.created_at DESC, invitation.id DESC
        LIMIT 1
      ) AS latest_invitation ON true
      LEFT JOIN
        public.teskeid_event_participation_invitation_terminalizations
          AS terminalization
        ON terminalization.invitation_id = latest_invitation.id
       AND terminalization.identity_generation =
         participation.identity_generation
       AND participation.claim_source_invitation_id =
         terminalization.invitation_id
      WHERE guest.event_id = event_row.id
        AND guest.status = 'active'
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_person_source_events_v2(
  p_actor_id uuid,
  p_before_sort_at timestamptz,
  p_before_event_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR ((p_before_sort_at IS NULL) <> (p_before_event_id IS NULL))
     OR (p_before_sort_at IS NOT NULL AND (
       NOT pg_catalog.isfinite(p_before_sort_at)
       OR p_before_sort_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
     )) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH visible_candidates AS (
    SELECT event_row.id AS event_id, event_row.name,
      event_row.roster_revision, 'owner'::text AS viewer_role,
      event_row.created_at AS visible_sort_at, 0 AS role_priority
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_actor_id
    UNION ALL
    SELECT event_row.id, event_row.name, event_row.roster_revision,
      'attendee'::text, event_row.created_at, 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS self_guest
      ON self_guest.event_id = participation.event_id
     AND self_guest.id = participation.event_guest_id
     AND self_guest.status = 'active'
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    WHERE participation.recipient_user_id = p_actor_id
      AND participation.access_state = 'active'
  ), owner_precedence AS (
    SELECT DISTINCT ON (candidate.event_id) candidate.*
    FROM visible_candidates AS candidate
    ORDER BY candidate.event_id, candidate.role_priority
  ), bounded AS (
    SELECT candidate.*,
      1 + (
        SELECT pg_catalog.count(*)::integer
        FROM public.teskeid_event_guests AS guest
        JOIN public.teskeid_event_participations AS participation
          ON participation.event_id = guest.event_id
         AND participation.event_guest_id = guest.id
        WHERE guest.event_id = candidate.event_id
          AND guest.status = 'active'
          AND participation.access_state = 'active'
      ) AS active_person_count
    FROM owner_precedence AS candidate
    WHERE p_before_sort_at IS NULL
       OR (candidate.visible_sort_at, candidate.event_id)
          < (p_before_sort_at, p_before_event_id)
    ORDER BY candidate.visible_sort_at DESC, candidate.event_id DESC
    LIMIT p_limit + 1
  ), numbered AS (
    SELECT bounded.*,
      pg_catalog.row_number() OVER (
        ORDER BY bounded.visible_sort_at DESC, bounded.event_id DESC
      ) AS row_number
    FROM bounded
  )
  SELECT pg_catalog.jsonb_build_object(
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', page_row.event_id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          page_row.name
        ),
        'roster_revision', page_row.roster_revision::text,
        'viewer_role', page_row.viewer_role,
        'active_person_count', page_row.active_person_count
      ) ORDER BY page_row.visible_sort_at DESC, page_row.event_id DESC)
      FROM numbered AS page_row
      WHERE page_row.row_number <= p_limit
    ), '[]'::jsonb),
    'next_cursor', CASE WHEN EXISTS (
      SELECT 1 FROM numbered AS extra_row
      WHERE extra_row.row_number = p_limit + 1
    ) THEN (
      SELECT pg_catalog.jsonb_build_object(
        'before_sort_at',
          public.teskeid_event_private_format_utc_timestamp_v2(
            cursor_row.visible_sort_at
          ),
        'before_event_id', cursor_row.event_id
      )
      FROM numbered AS cursor_row
      WHERE cursor_row.row_number = p_limit
    ) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_person_source_roster_v2(
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
  v_event public.teskeid_events%ROWTYPE;
  v_role text;
BEGIN
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  v_role := public.teskeid_event_private_assert_viewer_v2(
    p_actor_id, p_event_id
  );
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      v_event.name
    ),
    'roster_revision', v_event.roster_revision::text,
    'viewer_role', v_role,
    'people', public.teskeid_event_private_people_projection_v2(
      p_actor_id, p_event_id, v_role
    )
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_legacy_person_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_participant_kind text,
  p_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_label public.teskeid_event_person_labels%ROWTYPE;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_owner_id uuid;
  v_display_name text;
  v_viewer_private jsonb;
  v_result jsonb;
BEGIN
  IF p_participant_kind = 'organizer' THEN
    SELECT event_row.owner_user_id INTO v_owner_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id;
    v_display_name := public.teskeid_event_private_safe_profile_name_v2(
      v_owner_id
    );
    v_viewer_private := public.teskeid_event_private_viewer_relationship_v2(
      p_actor_id, NULL, v_owner_id, NULL
    );
    v_result := pg_catalog.jsonb_build_object(
      'legacy_person_ref', public.teskeid_event_uuid_from_text(
        'teskeid-event-owner-participant:' || p_event_id::text
      ),
      'participant_kind', 'organizer',
      'position', p_position,
      'shared', pg_catalog.jsonb_build_object(
        'label_state', CASE WHEN v_display_name IS NULL
          THEN 'needs_owner_input' ELSE 'resolved' END,
        'display_name', v_display_name,
        'selectable', v_display_name IS NOT NULL,
        'disabled_reason', CASE WHEN v_display_name IS NULL
          THEN 'profile_name_required' ELSE NULL END
      )
    );
  ELSIF p_participant_kind = 'guest' THEN
    SELECT guest.* INTO v_guest
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.id = p_event_guest_id;
    SELECT label_row.* INTO v_label
    FROM public.teskeid_event_person_labels AS label_row
    WHERE label_row.event_id = p_event_id
      AND label_row.event_guest_id = p_event_guest_id;
    SELECT participation.* INTO v_participation
    FROM public.teskeid_event_participations AS participation
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id;
    IF v_guest.id IS NULL OR v_label.event_guest_id IS NULL
       OR v_participation.event_guest_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    v_display_name := COALESCE(
      public.teskeid_event_private_safe_profile_name_v2(
        v_participation.recipient_user_id
      ), v_label.shared_display_name
    );
    v_viewer_private := public.teskeid_event_private_viewer_relationship_v2(
      p_actor_id, v_guest.relationship_id,
      v_participation.recipient_user_id,
      v_participation.recipient_email_canonical
    );
    v_result := pg_catalog.jsonb_build_object(
      'legacy_person_ref', v_guest.id,
      'participant_kind', 'guest',
      'position', p_position,
      'shared', pg_catalog.jsonb_build_object(
        'access_state', v_participation.access_state,
        'label_state', CASE WHEN v_display_name IS NULL
          THEN 'needs_owner_input' ELSE 'resolved' END,
        'display_name', v_display_name,
        'selectable', v_participation.access_state = 'active'
          AND v_display_name IS NOT NULL,
        'disabled_reason', CASE
          WHEN v_participation.access_state <> 'active' THEN 'not_active'
          WHEN v_display_name IS NULL THEN 'name_required'
          ELSE NULL END
      )
    );
  ELSE
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  IF v_viewer_private IS NOT NULL THEN
    v_result := v_result || pg_catalog.jsonb_build_object(
      'viewer_private', v_viewer_private
    );
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_legacy_people_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_viewer_role text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_people jsonb;
BEGIN
  IF p_viewer_role NOT IN ('owner', 'attendee') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH source_rows AS (
    SELECT 0 AS position,
      public.teskeid_event_private_legacy_person_v2(
        p_actor_id, p_event_id, NULL, 'organizer', 0
      ) AS person
    WHERE p_viewer_role = 'attendee'
    UNION ALL
    SELECT
      (pg_catalog.row_number() OVER (
        ORDER BY guest.position, guest.id
      ) - CASE WHEN p_viewer_role = 'owner' THEN 1 ELSE 0 END)::integer,
      public.teskeid_event_private_legacy_person_v2(
        p_actor_id, p_event_id, guest.id, 'guest',
        (pg_catalog.row_number() OVER (
          ORDER BY guest.position, guest.id
        ) - CASE WHEN p_viewer_role = 'owner' THEN 1 ELSE 0 END)::integer
      )
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND (p_viewer_role = 'owner'
        OR guest.linked_user_id IS DISTINCT FROM p_actor_id)
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    source_row.person ORDER BY source_row.position
  ), '[]'::jsonb)
  INTO v_people
  FROM source_rows AS source_row;
  RETURN v_people;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_legacy_expense_sources_v2(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  SELECT pg_catalog.jsonb_build_object(
    'events', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id', event_row.id,
      'name', public.teskeid_event_private_normalize_shared_name_v2(
        event_row.name
      ),
      'roster_revision', event_row.roster_revision::text,
      'viewer_role', 'owner',
      'people', public.teskeid_event_private_legacy_people_v2(
        p_actor_id, event_row.id, 'owner'
      )
    ) ORDER BY event_row.created_at DESC, event_row.id DESC), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT owned_event.*
    FROM public.teskeid_events AS owned_event
    WHERE owned_event.owner_user_id = p_actor_id
    ORDER BY owned_event.created_at DESC, owned_event.id DESC
    LIMIT 100
  ) AS event_row;
  RETURN COALESCE(v_result,
    pg_catalog.jsonb_build_object('events', '[]'::jsonb));
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_legacy_expense_source_v2(
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
  v_event public.teskeid_events%ROWTYPE;
  v_role text;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.owner_user_id = p_actor_id THEN
    v_role := 'owner';
  ELSIF EXISTS (
    SELECT 1
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_event_guests AS self_guest
      ON self_guest.event_id = membership.event_id
     AND self_guest.id = membership.event_guest_id
     AND self_guest.status = 'active'
     AND self_guest.linked_user_id = p_actor_id
    WHERE membership.event_id = p_event_id
      AND membership.user_id = p_actor_id
  ) THEN
    v_role := 'attendee';
  ELSE
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      v_event.name
    ),
    'roster_revision', v_event.roster_revision::text,
    'viewer_role', v_role,
    'people', public.teskeid_event_private_legacy_people_v2(
      p_actor_id, p_event_id, v_role
    )
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_canonical_roster_input_v2(
  p_guests jsonb,
  p_allow_retained boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_canonical jsonb;
BEGIN
  IF p_allow_retained IS NULL OR p_guests IS NULL
     OR pg_catalog.jsonb_typeof(p_guests) <> 'array'
     OR pg_catalog.jsonb_array_length(p_guests) > 49
     OR pg_catalog.pg_column_size(p_guests) > 65536 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_guests) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) <> 'object'
       OR (
         item.value ? 'event_guest_id' AND (
           NOT p_allow_retained
           OR (item.value - 'event_guest_id') <> '{}'::jsonb
           OR pg_catalog.jsonb_typeof(item.value->'event_guest_id') <> 'string'
           OR (item.value->>'event_guest_id')
             !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         )
       )
       OR (
         NOT (item.value ? 'event_guest_id') AND (
           NOT (item.value ? 'source_kind')
           OR pg_catalog.jsonb_typeof(item.value->'source_kind') <> 'string'
           OR item.value->>'source_kind' NOT IN (
             'relationship', 'manual_name', 'manual_email'
           )
           OR (
             item.value->>'source_kind' = 'relationship' AND (
               (item.value - ARRAY[
                 'source_kind', 'relationship_id'
               ]::text[]) <> '{}'::jsonb
               OR NOT (item.value ? 'relationship_id')
               OR pg_catalog.jsonb_typeof(item.value->'relationship_id')
                 <> 'string'
               OR (item.value->>'relationship_id')
                 !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             )
           )
           OR (
             item.value->>'source_kind' = 'manual_name' AND (
               (item.value - ARRAY[
                 'source_kind', 'display_name'
               ]::text[]) <> '{}'::jsonb
               OR NOT (item.value ? 'display_name')
               OR pg_catalog.jsonb_typeof(item.value->'display_name')
                 <> 'string'
               OR NOT public.teskeid_event_private_valid_shared_name_v2(
                 public.teskeid_event_private_normalize_shared_name_v2(
                   item.value->>'display_name'
                 )
               )
             )
           )
           OR (
             item.value->>'source_kind' = 'manual_email' AND (
               (item.value - ARRAY[
                 'source_kind', 'email', 'shared_display_name'
               ]::text[]) <> '{}'::jsonb
               OR NOT (item.value ? 'email')
               OR NOT (item.value ? 'shared_display_name')
               OR pg_catalog.jsonb_typeof(item.value->'email') <> 'string'
               OR pg_catalog.jsonb_typeof(
                 item.value->'shared_display_name'
               ) <> 'string'
               OR NOT public.teskeid_event_private_valid_canonical_email_v2(
                 public.normalize_email_canonical(item.value->>'email')
               )
               OR NOT public.teskeid_event_private_valid_shared_name_v2(
                 public.teskeid_event_private_normalize_shared_name_v2(
                   item.value->>'shared_display_name'
                 )
               )
             )
           )
         )
       )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE
      WHEN item.value ? 'event_guest_id' THEN
        pg_catalog.jsonb_build_object(
          'event_guest_id', (item.value->>'event_guest_id')::uuid
        )
      WHEN item.value->>'source_kind' = 'relationship' THEN
        pg_catalog.jsonb_build_object(
          'source_kind', 'relationship',
          'relationship_id', (item.value->>'relationship_id')::uuid
        )
      WHEN item.value->>'source_kind' = 'manual_email' THEN
        pg_catalog.jsonb_build_object(
          'source_kind', 'manual_email',
          'email', public.normalize_email_canonical(item.value->>'email'),
          'shared_display_name',
            public.teskeid_event_private_normalize_shared_name_v2(
              item.value->>'shared_display_name'
            )
        )
      ELSE pg_catalog.jsonb_build_object(
        'source_kind', 'manual_name',
        'display_name',
          public.teskeid_event_private_normalize_shared_name_v2(
            item.value->>'display_name'
          )
      )
    END ORDER BY item.ordinal
  ), '[]'::jsonb)
  INTO v_canonical
  FROM pg_catalog.jsonb_array_elements(p_guests)
    WITH ORDINALITY AS item(value, ordinal);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical) AS item(value)
    WHERE item.value ? 'event_guest_id'
    GROUP BY item.value->>'event_guest_id'
    HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical) AS item(value)
    WHERE item.value->>'source_kind' = 'relationship'
    GROUP BY item.value->>'relationship_id'
    HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_canonical) AS item(value)
    WHERE item.value->>'source_kind' = 'manual_email'
    GROUP BY item.value->>'email'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_guest_conflict';
  END IF;
  RETURN v_canonical;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_legacy_roster_input_v2(
  p_canonical_guests jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE
      WHEN item.value ? 'event_guest_id' THEN item.value
      WHEN item.value->>'source_kind' = 'manual_email' THEN
        pg_catalog.jsonb_build_object(
          'source_kind', 'manual_email',
          'email', item.value->>'email'
        )
      WHEN item.value->>'source_kind' = 'relationship' THEN
        pg_catalog.jsonb_build_object(
          'source_kind', 'relationship',
          'relationship_id', item.value->>'relationship_id'
        )
      ELSE pg_catalog.jsonb_build_object(
        'source_kind', 'manual_name',
        'display_name', item.value->>'display_name'
      )
    END ORDER BY item.ordinal
  ), '[]'::jsonb)
  FROM pg_catalog.jsonb_array_elements(p_canonical_guests)
    WITH ORDINALITY AS item(value, ordinal);
$function$;

CREATE FUNCTION public.teskeid_event_create_with_details_and_participations_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_guests jsonb,
  p_event_date date,
  p_event_time time without time zone,
  p_description text,
  p_agenda text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := public.teskeid_event_private_normalize_shared_name_v2(
    p_name
  );
  v_description text := NULLIF(
    public.teskeid_event_private_normalize_shared_name_v2(
      pg_catalog.replace(pg_catalog.replace(
        COALESCE(p_description, ''), E'\r\n', E'\n'
      ), E'\r', E'\n')
    ), ''
  );
  v_agenda text := NULLIF(
    public.teskeid_event_private_normalize_shared_name_v2(
      pg_catalog.replace(pg_catalog.replace(
        COALESCE(p_agenda, ''), E'\r\n', E'\n'
      ), E'\r', E'\n')
    ), ''
  );
  v_canonical_guests jsonb;
  v_legacy_guests jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_base_result jsonb;
  v_event_id uuid;
  v_invitations jsonb;
  v_item record;
  v_event_guest_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_request_id IS NULL
     OR NOT public.teskeid_event_valid_text(v_name, 1, 160)
     OR (p_event_date IS NULL) <> (p_event_time IS NULL)
     OR (p_event_date IS NOT NULL AND (
       NOT pg_catalog.isfinite(p_event_date)
       OR p_event_date NOT BETWEEN date '0001-01-01' AND date '9999-12-31'
     ))
     OR (p_event_time IS NOT NULL AND (
       p_event_time >= time '24:00:00'
       OR p_event_time IS DISTINCT FROM p_event_time::time(0)
     ))
     OR v_description IS NOT NULL AND (
       pg_catalog.char_length(v_description) > 2000
       OR pg_catalog.regexp_replace(v_description, E'\n', '', 'g')
         ~ '[[:cntrl:]]'
       OR v_description
         ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
     )
     OR v_agenda IS NOT NULL AND (
       pg_catalog.char_length(v_agenda) > 4000
       OR pg_catalog.regexp_replace(v_agenda, E'\n', '', 'g')
         ~ '[[:cntrl:]]'
       OR v_agenda
         ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_canonical_guests :=
    public.teskeid_event_private_canonical_roster_input_v2(
      p_guests, false
    );
  v_legacy_guests := public.teskeid_event_private_legacy_roster_input_v2(
    v_canonical_guests
  );
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'name', v_name,
    'guests', v_canonical_guests,
    'event_date', p_event_date,
    'event_time', p_event_time,
    'description', v_description,
    'agenda', v_agenda
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  v_replay := public.teskeid_event_private_begin_participation_request_v2(
    p_actor_id, p_request_id, 'create_with_participations_v2', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'sql149:event-create:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_base_result :=
    public.teskeid_event_create_with_details_and_attendance_invitations(
      p_actor_id, v_inner_request_id, v_name, v_legacy_guests,
      p_event_date, p_event_time, v_description, v_agenda
    );
  IF pg_catalog.jsonb_typeof(v_base_result) <> 'object'
     OR pg_catalog.jsonb_typeof(v_base_result->'invitations') <> 'array'
     OR (v_base_result->>'event_id') IS NULL
     OR (v_base_result->>'roster_revision') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  v_event_id := (v_base_result->>'event_id')::uuid;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'invitation_id', invitation.id,
      'event_guest_id', invitation.event_guest_id,
      'invitation_kind', invitation.invitation_kind,
      'recipient_label', invitation.recipient_label_snapshot,
      'invited_at', public.teskeid_event_private_format_utc_timestamp_v2(
        invitation.created_at
      ),
      'expires_at', public.teskeid_event_private_format_utc_timestamp_v2(
        invitation.expires_at
      )
    ) ORDER BY receipt.ordinal
  ), '[]'::jsonb) INTO v_invitations
  FROM pg_catalog.jsonb_array_elements(v_base_result->'invitations')
    WITH ORDINALITY AS receipt(value, ordinal)
  JOIN public.teskeid_event_guest_invitations AS invitation
    ON invitation.id = (receipt.value->>'invitation_id')::uuid
   AND invitation.event_id = v_event_id
   AND invitation.event_guest_id =
     (receipt.value->>'event_guest_id')::uuid
   AND invitation.status = 'pending'
   AND public.teskeid_event_private_valid_canonical_email_v2(
     invitation.recipient_email_canonical
   )
   AND pg_catalog.char_length(invitation.recipient_label_snapshot)
     BETWEEN 8 AND 320
   AND invitation.recipient_label_snapshot =
     pg_catalog.substr(invitation.recipient_email_canonical, 1, 1)
       || '***@' || pg_catalog.split_part(
         invitation.recipient_email_canonical, '@', 2
       )
   AND public.teskeid_event_private_valid_canonical_email_v2(
     pg_catalog.substr(invitation.recipient_label_snapshot, 1, 1)
       || '@' || pg_catalog.split_part(
         invitation.recipient_label_snapshot, '@', 2
       )
   )
   AND public.teskeid_event_private_format_utc_timestamp_v2(
     invitation.created_at
   ) IS NOT NULL
   AND public.teskeid_event_private_format_utc_timestamp_v2(
     invitation.expires_at
   ) IS NOT NULL;
  IF pg_catalog.jsonb_array_length(v_invitations) IS DISTINCT FROM
       pg_catalog.jsonb_array_length(v_base_result->'invitations') THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  FOR v_item IN
    SELECT item.value, item.ordinal
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests)
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    SELECT guest.id INTO v_event_guest_id
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = v_event_id
      AND guest.status = 'active'
      AND guest.position = v_item.ordinal - 1;
    IF v_event_guest_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    PERFORM public.teskeid_event_private_ensure_person_v2(
      v_event_id, v_event_guest_id
    );
    IF v_item.value->>'source_kind' = 'manual_email' THEN
      UPDATE public.teskeid_event_person_labels AS label_row
      SET label_state = 'resolved',
          shared_display_name = v_item.value->>'shared_display_name',
          updated_at = pg_catalog.now()
      WHERE label_row.event_id = v_event_id
        AND label_row.event_guest_id = v_event_guest_id;
    END IF;
    v_event_guest_id := NULL;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE guest.event_id = v_event_id
      AND guest.status = 'active'
  ) <> pg_catalog.jsonb_array_length(v_canonical_guests) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'created',
    'request_id', p_request_id,
    'event_id', v_event_id,
    'roster_revision', (v_base_result->>'roster_revision')::bigint::text,
    'invitations', v_invitations
  );
  PERFORM public.teskeid_event_private_finish_participation_request_v2(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_replace_roster_with_participations_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_request_id uuid,
  p_expected_roster_revision bigint,
  p_guests jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_canonical_guests jsonb;
  v_legacy_guests jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_constraint_name text;
  v_inner_request_id uuid;
  v_base_result jsonb;
  v_invitations jsonb;
  v_item record;
  v_event_guest_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_request_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_canonical_guests :=
    public.teskeid_event_private_canonical_roster_input_v2(
      p_guests, true
    );
  v_legacy_guests := public.teskeid_event_private_legacy_roster_input_v2(
    v_canonical_guests
  );
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'expected_roster_revision', p_expected_roster_revision,
    'guests', v_canonical_guests
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  v_replay := public.teskeid_event_private_begin_participation_request_v2(
    p_actor_id, p_request_id, 'replace_roster_with_participations_v2',
    v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'sql149:event-replace:' || p_actor_id::text || ':' || p_request_id::text
  );
  BEGIN
    v_base_result :=
      public.teskeid_event_replace_roster_with_attendance_invitations(
        p_actor_id, p_event_id, v_inner_request_id,
        p_expected_roster_revision, v_legacy_guests
      );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IN (
        'teskeid_event_guests_active_linked_uidx',
        'teskeid_event_guests_active_email_uidx'
      ) THEN
        RAISE EXCEPTION 'teskeid_event_guest_conflict';
      END IF;
      RAISE;
  END;
  IF pg_catalog.jsonb_typeof(v_base_result) <> 'object'
     OR pg_catalog.jsonb_typeof(v_base_result->'invitations') <> 'array'
     OR v_base_result->>'event_id' IS DISTINCT FROM p_event_id::text
     OR (v_base_result->>'roster_revision') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'invitation_id', invitation.id,
      'event_guest_id', invitation.event_guest_id,
      'invitation_kind', invitation.invitation_kind,
      'recipient_label', invitation.recipient_label_snapshot,
      'invited_at', public.teskeid_event_private_format_utc_timestamp_v2(
        invitation.created_at
      ),
      'expires_at', public.teskeid_event_private_format_utc_timestamp_v2(
        invitation.expires_at
      )
    ) ORDER BY receipt.ordinal
  ), '[]'::jsonb) INTO v_invitations
  FROM pg_catalog.jsonb_array_elements(v_base_result->'invitations')
    WITH ORDINALITY AS receipt(value, ordinal)
  JOIN public.teskeid_event_guest_invitations AS invitation
    ON invitation.id = (receipt.value->>'invitation_id')::uuid
   AND invitation.event_id = p_event_id
   AND invitation.event_guest_id =
     (receipt.value->>'event_guest_id')::uuid
   AND invitation.status = 'pending'
   AND public.teskeid_event_private_valid_canonical_email_v2(
     invitation.recipient_email_canonical
   )
   AND pg_catalog.char_length(invitation.recipient_label_snapshot)
     BETWEEN 8 AND 320
   AND invitation.recipient_label_snapshot =
     pg_catalog.substr(invitation.recipient_email_canonical, 1, 1)
       || '***@' || pg_catalog.split_part(
         invitation.recipient_email_canonical, '@', 2
       )
   AND public.teskeid_event_private_valid_canonical_email_v2(
     pg_catalog.substr(invitation.recipient_label_snapshot, 1, 1)
       || '@' || pg_catalog.split_part(
         invitation.recipient_label_snapshot, '@', 2
       )
   )
   AND public.teskeid_event_private_format_utc_timestamp_v2(
     invitation.created_at
   ) IS NOT NULL
   AND public.teskeid_event_private_format_utc_timestamp_v2(
     invitation.expires_at
   ) IS NOT NULL;
  IF pg_catalog.jsonb_array_length(v_invitations) IS DISTINCT FROM
       pg_catalog.jsonb_array_length(v_base_result->'invitations') THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  FOR v_item IN
    SELECT item.value, item.ordinal
    FROM pg_catalog.jsonb_array_elements(v_canonical_guests)
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    SELECT guest.id INTO v_event_guest_id
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND guest.position = v_item.ordinal - 1;
    IF v_event_guest_id IS NULL
       OR (
         v_item.value ? 'event_guest_id'
         AND v_event_guest_id IS DISTINCT FROM
           (v_item.value->>'event_guest_id')::uuid
       ) THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    PERFORM public.teskeid_event_private_ensure_person_v2(
      p_event_id, v_event_guest_id
    );
    IF v_item.value->>'source_kind' = 'manual_email' THEN
      UPDATE public.teskeid_event_person_labels AS label_row
      SET label_state = 'resolved',
          shared_display_name = v_item.value->>'shared_display_name',
          updated_at = pg_catalog.now()
      WHERE label_row.event_id = p_event_id
        AND label_row.event_guest_id = v_event_guest_id;
    END IF;
    v_event_guest_id := NULL;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
  ) <> pg_catalog.jsonb_array_length(v_canonical_guests) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'updated',
    'request_id', p_request_id,
    'event_id', p_event_id,
    'roster_revision', (v_base_result->>'roster_revision')::bigint::text,
    'invitations', v_invitations
  );
  PERFORM public.teskeid_event_private_finish_participation_request_v2(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_repair_person_label_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_expected_roster_revision bigint,
  p_expected_label_version bigint,
  p_shared_display_name text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := public.teskeid_event_private_normalize_shared_name_v2(
    p_shared_display_name
  );
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_label public.teskeid_event_person_labels%ROWTYPE;
  v_status text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_request_id IS NULL OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_expected_label_version IS NULL OR p_expected_label_version < 1
     OR NOT public.teskeid_event_private_valid_shared_name_v2(v_name) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'expected_roster_revision', p_expected_roster_revision,
    'expected_label_version', p_expected_label_version,
    'shared_display_name', v_name
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  v_replay := public.teskeid_event_private_begin_participation_request_v2(
    p_actor_id, p_request_id, 'repair_person_label_v2', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;
  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF v_guest.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  PERFORM public.teskeid_event_private_ensure_person_v2(
    p_event_id, p_event_guest_id
  );
  SELECT label_row.* INTO v_label
  FROM public.teskeid_event_person_labels AS label_row
  WHERE label_row.event_id = p_event_id
    AND label_row.event_guest_id = p_event_guest_id
  FOR UPDATE;
  IF v_label.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_label.label_version <> p_expected_label_version THEN
    RAISE EXCEPTION 'teskeid_event_label_version_conflict';
  END IF;
  IF v_label.label_state = 'resolved'
     AND v_label.shared_display_name = v_name THEN
    v_status := 'unchanged';
  ELSE
    UPDATE public.teskeid_event_person_labels AS label_row
    SET label_state = 'resolved',
        shared_display_name = v_name,
        label_version = label_row.label_version + 1,
        updated_at = pg_catalog.now()
    WHERE label_row.event_id = p_event_id
      AND label_row.event_guest_id = p_event_guest_id
    RETURNING label_row.* INTO v_label;
    v_status := 'updated';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'status', v_status,
    'request_id', p_request_id,
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'roster_revision', v_event.roster_revision::text,
    'label_version', v_label.label_version::text
  );
  PERFORM public.teskeid_event_private_finish_participation_request_v2(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_set_rsvp_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_rsvp_state text,
  p_expected_rsvp_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_status text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_request_id IS NULL
     OR p_rsvp_state IS NULL
     OR p_rsvp_state NOT IN ('no_response', 'attending', 'not_attending')
     OR p_expected_rsvp_version IS NULL OR p_expected_rsvp_version < 1 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'rsvp_state', p_rsvp_state,
    'expected_rsvp_version', p_expected_rsvp_version
  )::text);
  -- RSVP is the one attendee mutation that does not take the owner 13201
  -- advisory.  Pin the actor account before any Event/participation row so an
  -- auth deletion cannot hold that account and wait on this participation
  -- while the deferred receipt FK later waits in the opposite direction.
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  v_replay := public.teskeid_event_private_begin_participation_request_v2(
    p_actor_id, p_request_id, 'set_rsvp_v2', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active'
  FOR UPDATE;
  IF v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_participation.rsvp_version <> p_expected_rsvp_version THEN
    RAISE EXCEPTION 'teskeid_event_rsvp_version_conflict';
  END IF;
  IF v_participation.rsvp_state = p_rsvp_state THEN
    v_status := 'unchanged';
  ELSE
    UPDATE public.teskeid_event_participations AS participation
    SET rsvp_state = p_rsvp_state,
        rsvp_version = participation.rsvp_version + 1,
        rsvp_updated_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id
    RETURNING participation.* INTO v_participation;
    v_status := 'updated';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'status', v_status,
    'request_id', p_request_id,
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'access_state', v_participation.access_state,
    'access_version', v_participation.access_version::text,
    'rsvp_state', v_participation.rsvp_state,
    'rsvp_version', v_participation.rsvp_version::text
  );
  PERFORM public.teskeid_event_private_finish_participation_request_v2(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_private_normalize_shared_name_v2(text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_format_utc_timestamp_v2(
  timestamp with time zone
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_valid_shared_name_v2(text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_valid_canonical_email_v2(text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_begin_participation_request_v2(
  uuid,uuid,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_finish_participation_request_v2(
  uuid,uuid,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_guard_participation_request_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_ensure_person_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_expire_bound_invitations_v2(
  uuid,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_guard_bound_invitation_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_auth_email_invitations_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_participation_unlink_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_auth_delete_participations_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_apply_participation_v2(
  uuid,uuid,text,uuid,text,uuid,boolean,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_v1_participation_bridge_v2()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_claim_participations_v2(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_assert_viewer_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_safe_profile_name_v2(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_viewer_relationship_v2(
  uuid,uuid,uuid,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_person_projection_v2(
  uuid,uuid,uuid,integer,boolean
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_organizer_projection_v2(
  uuid,uuid,integer
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_people_projection_v2(
  uuid,uuid,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_for_actor_v2(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_actor_view_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_roster_management_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_person_source_events_v2(
  uuid,timestamp with time zone,uuid,integer
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_person_source_roster_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_legacy_person_v2(
  uuid,uuid,uuid,text,integer
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_legacy_expense_sources_v2(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_canonical_roster_input_v2(
  jsonb,boolean
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_legacy_roster_input_v2(jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_with_details_and_participations_v2(
  uuid,uuid,text,jsonb,date,time without time zone,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_replace_roster_with_participations_v2(
  uuid,uuid,uuid,bigint,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_repair_person_label_v2(
  uuid,uuid,uuid,bigint,bigint,text,uuid
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_set_rsvp_v2(
  uuid,uuid,uuid,text,bigint,uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.teskeid_event_private_normalize_shared_name_v2(text),
  public.teskeid_event_private_format_utc_timestamp_v2(
    timestamp with time zone
  ),
  public.teskeid_event_private_valid_shared_name_v2(text),
  public.teskeid_event_private_valid_canonical_email_v2(text),
  public.teskeid_event_private_begin_participation_request_v2(
    uuid,uuid,text,text
  ),
  public.teskeid_event_private_finish_participation_request_v2(
    uuid,uuid,jsonb
  ),
  public.teskeid_event_private_guard_participation_request_v2(),
  public.teskeid_event_private_ensure_person_v2(uuid,uuid),
  public.teskeid_event_private_expire_bound_invitations_v2(uuid,text),
  public.teskeid_event_private_guard_bound_invitation_v2(),
  public.teskeid_event_private_auth_email_invitations_v2(),
  public.teskeid_event_private_participation_unlink_v2(),
  public.teskeid_event_private_auth_delete_participations_v2(),
  public.teskeid_event_private_apply_participation_v2(
    uuid,uuid,text,uuid,text,uuid,boolean,text,text
  ),
  public.teskeid_event_private_v1_participation_bridge_v2(),
  public.teskeid_event_private_claim_participations_v2(uuid),
  public.teskeid_event_private_assert_viewer_v2(uuid,uuid),
  public.teskeid_event_private_safe_profile_name_v2(uuid),
  public.teskeid_event_private_viewer_relationship_v2(
    uuid,uuid,uuid,text
  ),
  public.teskeid_event_private_person_projection_v2(
    uuid,uuid,uuid,integer,boolean
  ),
  public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer),
  public.teskeid_event_private_people_projection_v2(uuid,uuid,text),
  public.teskeid_event_private_legacy_person_v2(
    uuid,uuid,uuid,text,integer
  ),
  public.teskeid_event_private_legacy_people_v2(uuid,uuid,text),
  public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean),
  public.teskeid_event_private_legacy_roster_input_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.teskeid_event_list_for_actor_v2(uuid),
  public.teskeid_event_get_actor_view_v2(uuid,uuid),
  public.teskeid_event_get_roster_management_v2(uuid,uuid),
  public.teskeid_event_list_person_source_events_v2(
    uuid,timestamp with time zone,uuid,integer
  ),
  public.teskeid_event_get_person_source_roster_v2(uuid,uuid),
  public.teskeid_event_list_legacy_expense_sources_v2(uuid),
  public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid),
  public.teskeid_event_create_with_details_and_participations_v2(
    uuid,uuid,text,jsonb,date,time without time zone,text,text
  ),
  public.teskeid_event_replace_roster_with_participations_v2(
    uuid,uuid,uuid,bigint,jsonb
  ),
  public.teskeid_event_repair_person_label_v2(
    uuid,uuid,uuid,bigint,bigint,text,uuid
  ),
  public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Everything above is additive/private staging.  Only now block deployed v1
-- Event/Auth writers for the short bridge/FK/backfill window.  A bounded lock
-- failure rolls the whole transaction back without exposing target objects.
-- Auth first is the canonical table-lock order.  Auth UPDATE/DELETE can reach
-- Event rows through lifecycle hooks, while Event writers only take a
-- compatible auth RowShare lock before touching Event rows.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_details IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guests IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guest_invitations
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_attendance_memberships
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX
  teskeid_event_guest_invitations_sql149_identity_uidx
  ON public.teskeid_event_guest_invitations(id, event_id, event_guest_id);

ALTER TABLE public.teskeid_event_person_labels
  ADD CONSTRAINT teskeid_event_person_labels_guest_fk
  FOREIGN KEY (event_id, event_guest_id)
  REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE;

ALTER TABLE public.teskeid_event_participations
  ADD CONSTRAINT teskeid_event_participations_guest_fk
  FOREIGN KEY (event_id, event_guest_id)
  REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT teskeid_event_participations_recipient_fk
  FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT teskeid_event_participations_claim_invitation_fk
  FOREIGN KEY (claim_source_invitation_id)
  REFERENCES public.teskeid_event_guest_invitations(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.teskeid_event_participation_mutation_requests
  ADD CONSTRAINT teskeid_event_participation_requests_actor_fk
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE
  public.teskeid_event_participation_invitation_terminalizations
  ADD CONSTRAINT teskeid_event_participation_terminalizations_invitation_fk
  FOREIGN KEY (invitation_id, event_id, event_guest_id)
  REFERENCES public.teskeid_event_guest_invitations(
    id, event_id, event_guest_id
  ) ON DELETE CASCADE,
  ADD CONSTRAINT teskeid_event_participation_terminalizations_guest_fk
  FOREIGN KEY (event_id, event_guest_id)
  REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE;

CREATE TRIGGER teskeid_event_participation_requests_mutation_guard
  BEFORE UPDATE OR DELETE
  ON public.teskeid_event_participation_mutation_requests
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_guard_participation_request_v2();

CREATE TRIGGER teskeid_event_guest_invitations_sql149_bound_guard
  BEFORE INSERT OR UPDATE
  ON public.teskeid_event_guest_invitations
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_guard_bound_invitation_v2();

CREATE TRIGGER teskeid_event_sql149_participation_account_email
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_auth_email_invitations_v2();

CREATE TRIGGER teskeid_event_participations_account_unlink
  BEFORE UPDATE OF recipient_user_id
  ON public.teskeid_event_participations
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_participation_unlink_v2();

CREATE TRIGGER teskeid_event_sql149_participation_account_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_auth_delete_participations_v2();

CREATE CONSTRAINT TRIGGER teskeid_event_guests_sql149_participation_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.teskeid_event_guests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_v1_participation_bridge_v2();
CREATE CONSTRAINT TRIGGER
  teskeid_event_guest_invitations_sql149_participation_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.teskeid_event_guest_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_v1_participation_bridge_v2();
CREATE CONSTRAINT TRIGGER
  teskeid_event_attendance_memberships_sql149_sync_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.teskeid_event_attendance_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_v1_participation_bridge_v2();

DO $sql149_locked_source_guard$
DECLARE
  v_owner_self_collision_count bigint;
  v_active_user_duplicate_group_count bigint;
  v_active_email_duplicate_group_count bigint;
  v_invalid_active_unbound_email_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    WHERE NOT pg_catalog.isfinite(event_row.created_at)
       OR event_row.created_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR NOT pg_catalog.isfinite(event_row.updated_at)
       OR event_row.updated_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR (details.event_date IS NOT NULL
         AND (
           NOT pg_catalog.isfinite(details.event_date)
           OR details.event_date NOT BETWEEN
             date '0001-01-01' AND date '9999-12-31'
         ))
       OR (details.event_time IS NOT NULL AND (
         details.event_time >= time '24:00:00'
         OR details.event_time IS DISTINCT FROM details.event_time::time(0)
       ))
  ) THEN
    RAISE EXCEPTION 'sql149_source_temporal_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    CROSS JOIN LATERAL (
      SELECT
        public.teskeid_event_private_normalize_shared_name_v2(
          event_row.name
        ) AS event_name,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.description, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS description,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.agenda, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS agenda
    ) AS normalized
    WHERE NOT public.teskeid_event_valid_text(
        normalized.event_name, 1, 160
      )
       OR (normalized.description IS NOT NULL AND (
         pg_catalog.char_length(normalized.description) > 2000
         OR pg_catalog.replace(normalized.description, E'\n', '')
           ~ '[[:cntrl:]]'
         OR normalized.description
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
       OR (normalized.agenda IS NOT NULL AND (
         pg_catalog.char_length(normalized.agenda) > 4000
         OR pg_catalog.replace(normalized.agenda, E'\n', '')
           ~ '[[:cntrl:]]'
         OR normalized.agenda
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
  ) THEN
    RAISE EXCEPTION 'sql149_source_text_projection_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    JOIN LATERAL (
      SELECT invitation.invitation_kind
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.event_id = guest.event_id
        AND invitation.event_guest_id = guest.id
        AND invitation.status = 'pending'
      ORDER BY invitation.created_at DESC, invitation.id DESC
      LIMIT 1
    ) AS pending_invitation ON true
    WHERE pending_invitation.invitation_kind = 'identity_and_access'
      AND (
        guest.linked_user_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.teskeid_event_attendance_memberships AS membership
          WHERE membership.event_id = guest.event_id
            AND membership.event_guest_id = guest.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'sql149_bound_identity_invitation_mismatch';
  END IF;

  WITH derived_identity AS (
    SELECT guest.event_id, guest.id AS event_guest_id, guest.status,
      guest.source_kind, guest.email_canonical,
      COALESCE(
        membership.user_id,
        CASE WHEN invitation.status IN ('accepted', 'left', 'revoked')
          THEN invitation.accepted_user_id ELSE NULL END,
        guest.linked_user_id
      ) AS recipient_user_id,
      invitation.status AS invitation_status,
      invitation.recipient_email_canonical AS invitation_email,
      membership.user_id AS membership_user_id
    FROM public.teskeid_event_guests AS guest
    LEFT JOIN LATERAL (
      SELECT membership.user_id
      FROM public.teskeid_event_attendance_memberships AS membership
      WHERE membership.event_id = guest.event_id
        AND membership.event_guest_id = guest.id
      ORDER BY membership.accepted_at DESC, membership.user_id
      LIMIT 1
    ) AS membership ON true
    LEFT JOIN LATERAL (
      SELECT invitation.status, invitation.recipient_email_canonical,
        invitation.accepted_user_id
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.event_id = guest.event_id
        AND invitation.event_guest_id = guest.id
      ORDER BY invitation.created_at DESC, invitation.id DESC
      LIMIT 1
    ) AS invitation ON true
  ), derived_targets AS (
    SELECT derived.event_id, derived.event_guest_id,
      derived.status AS guest_status,
      derived.recipient_user_id,
      CASE
        WHEN derived.recipient_user_id IS NOT NULL THEN NULL
        WHEN derived.status = 'removed'
          OR derived.invitation_status IN ('cancelled', 'revoked', 'left')
          THEN NULL
        WHEN derived.invitation_status = 'pending'
          THEN derived.invitation_email
        WHEN derived.source_kind = 'manual_email'
          THEN derived.email_canonical
        ELSE NULL
      END AS recipient_email_canonical,
      CASE
        WHEN derived.status = 'removed' THEN 'revoked'
        WHEN derived.membership_user_id IS NOT NULL THEN 'active'
        WHEN derived.invitation_status = 'left' THEN 'left'
        WHEN derived.invitation_status IN ('revoked', 'cancelled')
          THEN 'revoked'
        ELSE 'active'
      END AS access_state
    FROM derived_identity AS derived
  )
  SELECT
    (SELECT pg_catalog.count(*)
      FROM derived_targets AS target
      JOIN public.teskeid_events AS event_row
        ON event_row.id = target.event_id
      LEFT JOIN auth.users AS owner_account
        ON owner_account.id = event_row.owner_user_id
      WHERE target.guest_status = 'active'
        AND (
          target.recipient_user_id = event_row.owner_user_id
          OR (
            target.access_state = 'active'
            AND target.recipient_user_id IS NULL
            AND owner_account.email_confirmed_at IS NOT NULL
            AND target.recipient_email_canonical =
              public.normalize_email_canonical(owner_account.email)
          )
        )),
    (SELECT pg_catalog.count(*)
      FROM (
        SELECT target.event_id, target.recipient_user_id
        FROM derived_targets AS target
        WHERE target.access_state = 'active'
          AND target.recipient_user_id IS NOT NULL
        GROUP BY target.event_id, target.recipient_user_id
        HAVING pg_catalog.count(*) > 1
      ) AS duplicate_group),
    (SELECT pg_catalog.count(*)
      FROM (
        SELECT target.event_id, target.recipient_email_canonical
        FROM derived_targets AS target
        WHERE target.access_state = 'active'
          AND target.recipient_user_id IS NULL
          AND target.recipient_email_canonical IS NOT NULL
        GROUP BY target.event_id, target.recipient_email_canonical
        HAVING pg_catalog.count(*) > 1
      ) AS duplicate_group),
    (SELECT pg_catalog.count(*)
      FROM derived_targets AS target
      WHERE target.access_state = 'active'
        AND target.recipient_user_id IS NULL
        AND target.recipient_email_canonical IS NOT NULL
        AND NOT public.teskeid_event_private_valid_canonical_email_v2(
          target.recipient_email_canonical
        ))
  INTO v_owner_self_collision_count,
    v_active_user_duplicate_group_count,
    v_active_email_duplicate_group_count,
    v_invalid_active_unbound_email_count;

  IF v_owner_self_collision_count <> 0 THEN
    RAISE EXCEPTION 'sql149_owner_self_collision';
  END IF;
  IF v_active_user_duplicate_group_count <> 0
     OR v_active_email_duplicate_group_count <> 0 THEN
    RAISE EXCEPTION 'sql149_source_identity_collision';
  END IF;
  IF v_invalid_active_unbound_email_count <> 0 THEN
    RAISE EXCEPTION 'sql149_source_email_mismatch';
  END IF;
END;
$sql149_locked_source_guard$;

-- The deployed tables are write-blocked and every reconciliation trigger is
-- attached before this snapshot.  A v1 write therefore committed before the
-- locks or waits until the complete bridge is visible.
DO $sql149_backfill$
DECLARE
  v_guest record;
  v_bound_recipient record;
BEGIN
  FOR v_guest IN
    SELECT guest.event_id, guest.id
    FROM public.teskeid_event_guests AS guest
    ORDER BY guest.event_id, guest.id
  LOOP
    PERFORM public.teskeid_event_private_ensure_person_v2(
      v_guest.event_id, v_guest.id
    );
  END LOOP;

  FOR v_bound_recipient IN
    SELECT participation.recipient_user_id,
      CASE WHEN account.email_confirmed_at IS NOT NULL
        AND public.teskeid_event_private_valid_canonical_email_v2(
          public.normalize_email_canonical(account.email)
        ) THEN public.normalize_email_canonical(account.email)
        ELSE NULL END AS confirmed_email_canonical
    FROM public.teskeid_event_participations AS participation
    LEFT JOIN auth.users AS account
      ON account.id = participation.recipient_user_id
    WHERE participation.recipient_user_id IS NOT NULL
    GROUP BY participation.recipient_user_id, account.email,
      account.email_confirmed_at
    ORDER BY participation.recipient_user_id
  LOOP
    PERFORM public.teskeid_event_private_expire_bound_invitations_v2(
      v_bound_recipient.recipient_user_id,
      v_bound_recipient.confirmed_email_canonical
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    LEFT JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    LEFT JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE label_row.event_guest_id IS NULL
       OR participation.event_guest_id IS NULL
  ) THEN
    RAISE EXCEPTION 'sql149_backfill_parity_failed';
  END IF;
END;
$sql149_backfill$;

-- Fire every install-time deferred reconciliation while the old Event/Auth
-- tables remain write-blocked, then establish the exact no-postinstall-v1
-- baseline.  Any later bridge invocation advances the nontransactional
-- sequence and permanently makes guarded recovery refuse to drop SQL149.
SET CONSTRAINTS
  teskeid_event_guests_sql149_participation_deferred,
  teskeid_event_guest_invitations_sql149_participation_deferred,
  teskeid_event_attendance_memberships_sql149_sync_deferred
  IMMEDIATE;
DO $sql149_bridge_observation_baseline$
BEGIN
  PERFORM pg_catalog.setval(
    'public.teskeid_event_v1_bridge_observation_seq'::regclass, 1, false
  );
END;
$sql149_bridge_observation_baseline$;
SET CONSTRAINTS
  teskeid_event_guests_sql149_participation_deferred,
  teskeid_event_guest_invitations_sql149_participation_deferred,
  teskeid_event_attendance_memberships_sql149_sync_deferred
  DEFERRED;

GRANT EXECUTE ON FUNCTION
  public.teskeid_event_list_for_actor_v2(uuid),
  public.teskeid_event_get_actor_view_v2(uuid,uuid),
  public.teskeid_event_get_roster_management_v2(uuid,uuid),
  public.teskeid_event_list_person_source_events_v2(
    uuid,timestamp with time zone,uuid,integer
  ),
  public.teskeid_event_get_person_source_roster_v2(uuid,uuid),
  public.teskeid_event_list_legacy_expense_sources_v2(uuid),
  public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid),
  public.teskeid_event_create_with_details_and_participations_v2(
    uuid,uuid,text,jsonb,date,time without time zone,text,text
  ),
  public.teskeid_event_replace_roster_with_participations_v2(
    uuid,uuid,uuid,bigint,jsonb
  ),
  public.teskeid_event_repair_person_label_v2(
    uuid,uuid,uuid,bigint,bigint,text,uuid
  ),
  public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)
  TO service_role;

-- Repeat the frozen SQL132/133/137/141/147/148 seal after every SQL149 write
-- and immediately before commit.  This closes the migration-time TOCTOU gap:
-- a protected helper cannot be replaced between the initial precondition and
-- the final catalog/data attestation.
DO $sql149_final_protected_catalog$
DECLARE
  v_expected record;
  v_source text;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_assert_actor(uuid)',
        'p_actor_id uuid','void','s',true,false,'u',false,
        '9dd7c34f6cc6c78131e7ebbb9a718ea4'),
      ('public.teskeid_event_uuid_from_text(text)',
        'p_value text','uuid','i',true,false,'u',false,
        '27229cbc71c621e5a8592265b07f874d'),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
        'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
        'text','s',true,false,'u',false,
        '2377be525ed29f2d4bc26d453fa8cf51'),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)',
        'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
        'jsonb','v',true,false,'u',true,
        '0022e19d8853709247583b7ddb38ef45'),
      ('public.expense_prepare_account_deletion(uuid)',
        'p_user_id uuid','jsonb','v',true,false,'u',true,
        '0562edbfaa608cead23d23d49ec36a66'),
      ('public.teskeid_event_get_expense_source(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,
        '3d01501bdb03f0f6bca83e0817688006'),
      ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
        'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
        'bigint','v',true,false,'u',false,
        '819b2e024aac1e00c7e14145b0d6b373'),
      ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
        'jsonb','v',true,false,'u',true,
        '7e6426c8e43efa3bb7d725bf6b1c807c'),
      ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
        'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
        'jsonb','s',true,false,'u',true,
        'a31fc1caa0cf009e4daad9c3e3ed1875'),
      ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,
        'ae418825a7d7f8ebe056272dde9448fd'),
      ('public.normalize_email_canonical(text)',
        'p_email text','text','i',false,true,'s',true,
        '3083103976aa8cb3780937b9da1be236'),
      ('public.teskeid_event_normalize_text(text)',
        'p_value text','text','i',true,false,'u',false,
        'ced5cfb2427fe7331f4416497614f7d1'),
      ('public.teskeid_event_valid_text(text,integer,integer)',
        'p_value text, p_minimum integer, p_maximum integer',
        'boolean','i',true,false,'u',false,
        '28c80b083a90683f15fd04f4d7d547d1'),
      ('public.teskeid_event_assert_financial_actor(uuid)',
        'p_actor_id uuid','void','s',true,false,'u',false,
        '7f6ced4f5e7472aff27d9a6d5c624355'),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
        'p_invitation_ids uuid[], p_status text',
        'integer','v',true,false,'u',false,
        'a2a85bca2a456177ab67b7817dc6e19d'),
      ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
        'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
        'jsonb','v',true,false,'u',true,
        '3e1b846ec2a4540e6ee51becb2590ec2')
    ) AS expected(
      signature, exact_arguments, return_type, volatility,
      security_definer, is_strict, parallel_safety, service_execute,
      source_md5
    )
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = v_expected.security_definer
      AND procedure_row.proisstrict = v_expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = v_expected.volatility::"char"
      AND procedure_row.proparallel = v_expected.parallel_safety::"char"
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        v_expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = v_expected.service_execute
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT v_expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      );
    IF pg_catalog.md5(pg_catalog.replace(v_source, E'\r\n', E'\n'))
       IS DISTINCT FROM v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_final_protected_catalog_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_list_for_actor(uuid)',
        'p_actor_id uuid','4ccf01e6251a7e7ee187fcba21a88c36'),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
        'p_actor_id uuid, p_invitation_id uuid',
        'e268003d1f916f6a987e8d47dbef5971'),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
        'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid',
        '45bab121e346e77fa4a4035b7cf88f16'),
      ('public.teskeid_event_list_my_pending_invitations(uuid)',
        'p_actor_id uuid','295ca440e9caa334986f664ce2bc7398')
    ) AS expected(signature, exact_arguments, source_md5)
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      );
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    IF pg_catalog.md5(pg_catalog.replace(
      v_source,
      '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',
      ''
    )) IS DISTINCT FROM v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_final_protected_catalog_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;
END;
$sql149_final_protected_catalog$;

DO $sql149_final_attestation$
DECLARE
  v_count integer;
  v_ok boolean;
BEGIN
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.bool_and(
      class_row.relrowsecurity
      AND class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
    )
  INTO v_count, v_ok
  FROM (VALUES
    ('public.teskeid_event_person_labels'),
    ('public.teskeid_event_participations'),
    ('public.teskeid_event_participation_mutation_requests'),
    ('public.teskeid_event_participation_invitation_terminalizations')
  ) AS expected(signature)
  JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected.signature)
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner;
  IF v_count <> 4 OR NOT COALESCE(v_ok, false)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid = ANY(ARRAY[
         pg_catalog.to_regclass('public.teskeid_event_person_labels'),
         pg_catalog.to_regclass('public.teskeid_event_participations'),
         pg_catalog.to_regclass(
           'public.teskeid_event_participation_mutation_requests'
         ),
         pg_catalog.to_regclass(
           'public.teskeid_event_participation_invitation_terminalizations'
         )
       ])
     ) OR EXISTS (
       SELECT 1
       FROM (VALUES
         (pg_catalog.to_regclass('public.teskeid_event_person_labels')),
         (pg_catalog.to_regclass('public.teskeid_event_participations')),
         (pg_catalog.to_regclass(
           'public.teskeid_event_participation_mutation_requests'
         )),
         (pg_catalog.to_regclass(
           'public.teskeid_event_participation_invitation_terminalizations'
         ))
       ) AS target(relation_oid)
       JOIN pg_catalog.pg_class AS class_row
         ON class_row.oid = target.relation_oid
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         class_row.relacl,
         pg_catalog.acldefault('r', class_row.relowner)
       )) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee_role
         ON grantee_role.oid = acl.grantee
       WHERE acl.grantee = 0
          OR COALESCE(grantee_role.rolname, '') IN (
            'anon', 'authenticated', 'service_role'
          )
     ) THEN
    RAISE EXCEPTION 'sql149_relation_security_mismatch';
  END IF;

  -- These objects were created in this transaction; sealing exact object
  -- sets here prevents a partial or unexpectedly extended catalog from
  -- committing. Postflight additionally verifies every definition/key.
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass
      ]) AND attribute.attnum > 0 AND NOT attribute.attisdropped) <> 36
     OR (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid = ANY(ARRAY[
         'public.teskeid_event_person_labels'::regclass,
         'public.teskeid_event_participations'::regclass,
         'public.teskeid_event_participation_mutation_requests'::regclass,
         'public.teskeid_event_participation_invitation_terminalizations'::regclass
       ])) <> 26
     OR (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_index AS index_row
       WHERE index_row.indrelid = ANY(ARRAY[
         'public.teskeid_event_person_labels'::regclass,
         'public.teskeid_event_participations'::regclass,
         'public.teskeid_event_participation_mutation_requests'::regclass,
         'public.teskeid_event_participation_invitation_terminalizations'::regclass
       ])) <> 8
     OR pg_catalog.to_regclass(
       'public.teskeid_event_guest_invitations_sql149_identity_uidx'
     ) IS NULL THEN
    RAISE EXCEPTION 'sql149_target_catalog_mismatch';
  END IF;

  SELECT class_row.relkind = 'S'
    AND owner_role.rolname = 'postgres'
    AND class_row.relpersistence = 'p'
    AND sequence_row.seqstart = 1
    AND sequence_row.seqincrement = 1
    AND sequence_row.seqmin = 1
    AND sequence_row.seqmax = 9223372036854775807
    AND sequence_row.seqcache = 1
    AND NOT sequence_row.seqcycle
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
        AND dependency.objid = class_row.oid
        AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
        AND dependency.deptype IN ('a', 'i')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('S', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE acl.grantee = 0
         OR COALESCE(grantee_role.rolname, '') IN (
           'anon', 'authenticated', 'service_role'
         )
    )
  INTO v_ok
  FROM pg_catalog.pg_class AS class_row
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner
  JOIN pg_catalog.pg_sequence AS sequence_row
    ON sequence_row.seqrelid = class_row.oid
  WHERE class_row.oid = pg_catalog.to_regclass(
    'public.teskeid_event_v1_bridge_observation_seq'
  );
  IF NOT COALESCE(v_ok, false) OR NOT (
    SELECT sequence_state.last_value = 1 AND NOT sequence_state.is_called
    FROM public.teskeid_event_v1_bridge_observation_seq AS sequence_state
  ) THEN
    RAISE EXCEPTION 'sql149_bridge_observation_sequence_mismatch';
  END IF;

  WITH expected(signature, is_public, volatility) AS (
    VALUES
      ('public.teskeid_event_private_normalize_shared_name_v2(text)', false, 'i'),
      ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)', false, 's'),
      ('public.teskeid_event_private_valid_shared_name_v2(text)', false, 'i'),
      ('public.teskeid_event_private_valid_canonical_email_v2(text)', false, 'i'),
      ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)', false, 'v'),
      ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)', false, 'v'),
      ('public.teskeid_event_private_guard_participation_request_v2()', false, 'v'),
      ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)', false, 'v'),
      ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)', false, 'v'),
      ('public.teskeid_event_private_guard_bound_invitation_v2()', false, 'v'),
      ('public.teskeid_event_private_auth_email_invitations_v2()', false, 'v'),
      ('public.teskeid_event_private_participation_unlink_v2()', false, 'v'),
      ('public.teskeid_event_private_auth_delete_participations_v2()', false, 'v'),
      ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)', false, 'v'),
      ('public.teskeid_event_private_v1_participation_bridge_v2()', false, 'v'),
      ('public.teskeid_event_private_claim_participations_v2(uuid)', false, 'v'),
      ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)', false, 's'),
      ('public.teskeid_event_private_safe_profile_name_v2(uuid)', false, 's'),
      ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)', false, 's'),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)', false, 's'),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)', false, 's'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)', false, 's'),
      ('public.teskeid_event_list_for_actor_v2(uuid)', true, 'v'),
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)', true, 'v'),
      ('public.teskeid_event_get_roster_management_v2(uuid,uuid)', true, 'v'),
      ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)', true, 'v'),
      ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)', true, 'v'),
      ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', false, 's'),
      ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)', false, 's'),
      ('public.teskeid_event_list_legacy_expense_sources_v2(uuid)', true, 's'),
      ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', true, 's'),
      ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)', false, 'i'),
      ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)', false, 'i'),
      ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)', true, 'v'),
      ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)', true, 'v'),
      ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)', true, 'v'),
      ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)', true, 'v')
  ), checked AS (
    SELECT expected.*,
      procedure_row.oid,
      owner_role.rolname AS owner_name,
      procedure_row.prosecdef,
      procedure_row.provolatile,
      procedure_row.proparallel,
      procedure_row.proconfig,
      pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) AS service_execute,
      pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      ) AS anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      ) AS authenticated_execute
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
  )
  SELECT pg_catalog.count(*) = 37 AND pg_catalog.bool_and(
    checked.oid IS NOT NULL
    AND checked.owner_name = 'postgres'
    AND checked.prosecdef
    AND checked.provolatile = checked.volatility::"char"
    AND checked.proparallel = 'u'
    AND pg_catalog.cardinality(COALESCE(
      checked.proconfig, ARRAY[]::text[]
    )) = 1
    AND checked.proconfig[1] IN ('search_path=', 'search_path=""')
    AND checked.anon_execute = false
    AND checked.authenticated_execute = false
    AND checked.service_execute = checked.is_public
  ) INTO v_ok
  FROM checked;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_function_security_mismatch';
  END IF;

  WITH expected(function_name, expected_md5) AS (
    VALUES
      ('teskeid_event_private_normalize_shared_name_v2','d118ab08bc0346cdf31519344a2f65a7'),
      ('teskeid_event_private_format_utc_timestamp_v2','7017190619681901af3813e1fc3b305c'),
      ('teskeid_event_private_valid_shared_name_v2','7a3223263c138e04713dbc87e7dc6576'),
      ('teskeid_event_private_valid_canonical_email_v2','3e64bc04485bc06cc544f59f46a2fb0e'),
      ('teskeid_event_private_begin_participation_request_v2','2e1e7edc8401f395c8089b1769bc6496'),
      ('teskeid_event_private_finish_participation_request_v2','7da1e4c2af949efc9434be98ace4eb7d'),
      ('teskeid_event_private_guard_participation_request_v2','abbca6ba554f3a1d0d4d71b9918d2abd'),
      ('teskeid_event_private_ensure_person_v2','fa593d9afce6ceb40e3fd15f9f4a30ba'),
      ('teskeid_event_private_expire_bound_invitations_v2','23a268c468e1d61a508b16c80bd08daa'),
      ('teskeid_event_private_guard_bound_invitation_v2','18c2e356417113e8e06cfc568f763713'),
      ('teskeid_event_private_auth_email_invitations_v2','b7805535363aa4fc020668a71c5a5171'),
      ('teskeid_event_private_participation_unlink_v2','5fe72ac8d08536cde7229359023cbb08'),
      ('teskeid_event_private_auth_delete_participations_v2','f0444e3a30a939ee42ea528a09cd1e0e'),
      ('teskeid_event_private_apply_participation_v2','ee8872c3b0d91786993e4ffbfb266293'),
      ('teskeid_event_private_v1_participation_bridge_v2','f2901d82fd392cd406a5dfbfc3173759'),
      ('teskeid_event_private_claim_participations_v2','b57bf9fa43754dfcd05cb7e063829bc6'),
      ('teskeid_event_private_assert_viewer_v2','211fbfb65b4edaa4b0307c2fb5878a60'),
      ('teskeid_event_private_safe_profile_name_v2','53f29b4c6872d3e76d6c9cbc17a767e0'),
      ('teskeid_event_private_viewer_relationship_v2','ad66614815b29a02ee3dc928c17886c3'),
      ('teskeid_event_private_person_projection_v2','dd6d4f6b57c109fb46d6992ce66462e8'),
      ('teskeid_event_private_organizer_projection_v2','d42c11caf87eaac45646535539029977'),
      ('teskeid_event_private_people_projection_v2','2eb6db6c327de83f1bf241f9368c3a0c'),
      ('teskeid_event_list_for_actor_v2','6d20e61af6c56e4c3c02d53340ff2bc6'),
      ('teskeid_event_get_actor_view_v2','eb2da9a9c2c0463f76636ded02a6747a'),
      ('teskeid_event_get_roster_management_v2','baf7ef85dbbdc487fe3ca67abb0ecba8'),
      ('teskeid_event_list_person_source_events_v2','0959d2725cd7db9b3510d123a81819eb'),
      ('teskeid_event_get_person_source_roster_v2','3c689e2f05035a67d58fbb8ca39dcd40'),
      ('teskeid_event_private_legacy_person_v2','25394edc6b084676921c3a65b1f19a8a'),
      ('teskeid_event_private_legacy_people_v2','1abbd25362561a9f7b2aaba642412356'),
      ('teskeid_event_list_legacy_expense_sources_v2','e5532869077cbc11e0bcb3b846baf172'),
      ('teskeid_event_get_legacy_expense_source_v2','aec7d0cf817826697338e74de645dc4e'),
      ('teskeid_event_private_canonical_roster_input_v2','cbede437498c588a385a6cb4bdd04610'),
      ('teskeid_event_private_legacy_roster_input_v2','5332b4a24406be464bb51d2148578b75'),
      ('teskeid_event_create_with_details_and_participations_v2','3b72c4710731c6d467475665e6bb5d48'),
      ('teskeid_event_replace_roster_with_participations_v2','c8738b2a21735bac895c3e25335f6ee8'),
      ('teskeid_event_repair_person_label_v2','3352c37bbf3883c991c658de37fde1d3'),
      ('teskeid_event_set_rsvp_v2','0b161601a4b91a521c42288b8279ff83')
  )
  SELECT pg_catalog.count(procedure_row.oid) = 37
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
   AND procedure_row.proname = expected.function_name;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_function_source_mismatch';
  END IF;

  WITH expected(trigger_name, relation_name, function_signature,
      trigger_type, is_deferrable, initially_deferred, update_columns) AS (
    VALUES
      ('teskeid_event_participation_requests_mutation_guard',
        'public.teskeid_event_participation_mutation_requests',
        'public.teskeid_event_private_guard_participation_request_v2()',
        27, false, false, ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_sql149_bound_guard',
        'public.teskeid_event_guest_invitations',
        'public.teskeid_event_private_guard_bound_invitation_v2()',
        23, false, false, ARRAY[]::text[]),
      ('teskeid_event_sql149_participation_account_email',
        'auth.users',
        'public.teskeid_event_private_auth_email_invitations_v2()',
        17, false, false, ARRAY['email','email_confirmed_at']::text[]),
      ('teskeid_event_participations_account_unlink',
        'public.teskeid_event_participations',
        'public.teskeid_event_private_participation_unlink_v2()',
        19, false, false, ARRAY['recipient_user_id']::text[]),
      ('teskeid_event_sql149_participation_account_delete',
        'auth.users',
        'public.teskeid_event_private_auth_delete_participations_v2()',
        11, false, false, ARRAY[]::text[]),
      ('teskeid_event_guests_sql149_participation_deferred',
        'public.teskeid_event_guests',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29, true, true, ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_sql149_participation_deferred',
        'public.teskeid_event_guest_invitations',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29, true, true, ARRAY[]::text[]),
      ('teskeid_event_attendance_memberships_sql149_sync_deferred',
        'public.teskeid_event_attendance_memberships',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29, true, true, ARRAY[]::text[])
  )
  SELECT pg_catalog.count(*) = 8 AND pg_catalog.bool_and(
    trigger_row.oid IS NOT NULL
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O'
    AND trigger_row.tgtype = expected.trigger_type
    AND trigger_row.tgdeferrable = expected.is_deferrable
    AND trigger_row.tginitdeferred = expected.initially_deferred
    AND trigger_row.tgqual IS NULL
    AND trigger_row.tgnargs = 0
    AND pg_catalog.octet_length(trigger_row.tgargs) = 0
    AND actual_columns.update_columns = expected.update_columns
    AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
      expected.function_signature
    )
  ) AND (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS installed_trigger
    WHERE NOT installed_trigger.tgisinternal
      AND (
        installed_trigger.tgname LIKE '%sql149%'
        OR installed_trigger.tgname IN (
          'teskeid_event_participation_requests_mutation_guard',
          'teskeid_event_participations_account_unlink'
        )
      )
  ) = 8 INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
   AND trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attname),
      ARRAY[]::text[]
    ) AS update_columns
    FROM pg_catalog.unnest(
      COALESCE(trigger_row.tgattr::smallint[], ARRAY[]::smallint[])
    ) AS trigger_attribute(attnum)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = trigger_row.tgrelid
     AND attribute.attnum = trigger_attribute.attnum
  ) AS actual_columns ON true;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_trigger_shape_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    LEFT JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    LEFT JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE label_row.event_guest_id IS NULL
       OR participation.event_guest_id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    WHERE NOT pg_catalog.isfinite(event_row.created_at)
       OR event_row.created_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR NOT pg_catalog.isfinite(event_row.updated_at)
       OR event_row.updated_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR (details.event_date IS NOT NULL
         AND (
           NOT pg_catalog.isfinite(details.event_date)
           OR details.event_date NOT BETWEEN
             date '0001-01-01' AND date '9999-12-31'
         ))
       OR (details.event_time IS NOT NULL AND (
         details.event_time >= time '24:00:00'
         OR details.event_time IS DISTINCT FROM details.event_time::time(0)
       ))
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    CROSS JOIN LATERAL (
      SELECT
        public.teskeid_event_private_normalize_shared_name_v2(
          event_row.name
        ) AS event_name,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.description, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS description,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.agenda, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS agenda
    ) AS normalized
    WHERE NOT public.teskeid_event_valid_text(
        normalized.event_name, 1, 160
      )
       OR (normalized.description IS NOT NULL AND (
         pg_catalog.char_length(normalized.description) > 2000
         OR pg_catalog.replace(normalized.description, E'\n', '')
           ~ '[[:cntrl:]]'
         OR normalized.description
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
       OR (normalized.agenda IS NOT NULL AND (
         pg_catalog.char_length(normalized.agenda) > 4000
         OR pg_catalog.replace(normalized.agenda, E'\n', '')
           ~ '[[:cntrl:]]'
         OR normalized.agenda
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
    WHERE participation.recipient_user_id IS NOT NULL
      AND invitation.status = 'pending'
      AND invitation.invitation_kind = 'identity_and_access'
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_person_labels AS label_row
    WHERE (label_row.label_state = 'resolved') IS DISTINCT FROM
      (label_row.shared_display_name IS NOT NULL)
       OR (
         label_row.shared_display_name IS NOT NULL
         AND NOT public.teskeid_event_private_valid_shared_name_v2(
           label_row.shared_display_name
         )
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    WHERE participation.recipient_email_canonical IS NOT NULL
      AND NOT public.teskeid_event_private_valid_canonical_email_v2(
        participation.recipient_email_canonical
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    WHERE participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical IS NULL
      AND participation.identity_claimed_at IS NOT NULL
      AND participation.access_state = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participation_invitation_terminalizations
      AS terminalization
    LEFT JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = terminalization.event_id
     AND participation.event_guest_id = terminalization.event_guest_id
     AND participation.identity_generation =
       terminalization.identity_generation
     AND participation.claim_source_invitation_id =
       terminalization.invitation_id
    LEFT JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = terminalization.invitation_id
     AND invitation.event_id = terminalization.event_id
     AND invitation.event_guest_id = terminalization.event_guest_id
    WHERE participation.event_guest_id IS NULL
       OR invitation.id IS NULL
       OR invitation.status <> 'cancelled'
       OR invitation.recipient_email_canonical IS NOT NULL
       OR invitation.accepted_user_id IS NOT NULL
       OR invitation.accepted_at IS NOT NULL
       OR invitation.terminal_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
     AND invitation.status = 'pending'
    LEFT JOIN auth.users AS account
      ON account.id = participation.recipient_user_id
    WHERE participation.recipient_user_id IS NOT NULL
      AND invitation.recipient_email_canonical IS DISTINCT FROM CASE
        WHEN account.email_confirmed_at IS NOT NULL
          AND public.teskeid_event_private_valid_canonical_email_v2(
            public.normalize_email_canonical(account.email)
          ) THEN public.normalize_email_canonical(account.email)
        ELSE NULL END
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    LEFT JOIN auth.users AS owner_account
      ON owner_account.id = event_row.owner_user_id
    WHERE (
        participation.recipient_user_id = event_row.owner_user_id
        OR (
          participation.access_state = 'active'
          AND
          participation.recipient_user_id IS NULL
          AND owner_account.email_confirmed_at IS NOT NULL
          AND participation.recipient_email_canonical =
            public.normalize_email_canonical(owner_account.email)
        )
      )
  ) THEN
    RAISE EXCEPTION 'sql149_data_postcondition_failed';
  END IF;

  -- At the migration boundary every target row is a deterministic projection
  -- of the final locked v1 guest/membership/latest-invitation facts.  This
  -- checks exact row-level semantics, not merely matching row counts.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    LEFT JOIN LATERAL (
      SELECT membership.user_id, membership.accepted_invitation_id,
        membership.accepted_at
      FROM public.teskeid_event_attendance_memberships AS membership
      WHERE membership.event_id = guest.event_id
        AND membership.event_guest_id = guest.id
      ORDER BY membership.accepted_at DESC, membership.user_id
      LIMIT 1
    ) AS membership ON true
    LEFT JOIN LATERAL (
      SELECT invitation.id, invitation.status,
        invitation.recipient_email_canonical,
        invitation.accepted_user_id, invitation.accepted_at,
        invitation.updated_at
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.event_id = guest.event_id
        AND invitation.event_guest_id = guest.id
      ORDER BY invitation.created_at DESC, invitation.id DESC
      LIMIT 1
    ) AS invitation ON true
    LEFT JOIN public.profiles AS profile
      ON profile.id = guest.linked_user_id
    CROSS JOIN LATERAL (
      SELECT
        public.teskeid_event_private_normalize_shared_name_v2(
          guest.display_name_snapshot
        ) AS snapshot_name,
        public.teskeid_event_private_normalize_shared_name_v2(
          profile.display_name
        ) AS profile_name
    ) AS normalized
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN public.teskeid_event_private_valid_shared_name_v2(
            normalized.profile_name
          ) THEN normalized.profile_name
          WHEN guest.source_kind = 'manual_email'
            OR (
              guest.source_kind = 'relationship'
              AND pg_catalog.lower(normalized.snapshot_name) =
                'teskeiðarnotandi'
            )
            OR NOT public.teskeid_event_private_valid_shared_name_v2(
              normalized.snapshot_name
            ) THEN NULL
          ELSE normalized.snapshot_name
        END AS shared_name,
        COALESCE(
          membership.user_id,
          CASE WHEN invitation.status IN ('accepted', 'left', 'revoked')
            THEN invitation.accepted_user_id ELSE NULL END,
          guest.linked_user_id
        ) AS recipient_user_id,
        CASE
          WHEN guest.status = 'removed' THEN 'revoked'
          WHEN membership.user_id IS NOT NULL THEN 'active'
          WHEN invitation.status = 'left' THEN 'left'
          WHEN invitation.status IN ('revoked', 'cancelled') THEN 'revoked'
          ELSE 'active'
        END AS access_state,
        CASE
          WHEN membership.user_id IS NOT NULL
            OR invitation.status IN ('accepted', 'left', 'revoked')
            THEN 'attending'
          WHEN invitation.status = 'declined' THEN 'not_attending'
          ELSE 'no_response'
        END AS rsvp_state
    ) AS expected
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN expected.recipient_user_id IS NOT NULL THEN NULL
          WHEN guest.status = 'removed'
            OR invitation.status IN ('cancelled', 'revoked', 'left')
            THEN NULL
          WHEN invitation.status = 'pending'
            THEN invitation.recipient_email_canonical
          WHEN guest.source_kind = 'manual_email'
            THEN guest.email_canonical
          ELSE NULL
        END AS recipient_email_canonical,
        CASE WHEN expected.recipient_user_id IS NOT NULL
          THEN COALESCE(
            membership.accepted_at,
            invitation.accepted_at,
            guest.created_at
          ) ELSE NULL END AS identity_claimed_at,
        CASE WHEN expected.recipient_user_id IS NOT NULL
          THEN COALESCE(
            membership.accepted_invitation_id, invitation.id
          ) ELSE NULL END AS claim_source_invitation_id
    ) AS expected_identity
    WHERE label_row.label_state IS DISTINCT FROM CASE
            WHEN expected.shared_name IS NULL
              THEN 'needs_owner_input' ELSE 'resolved' END
       OR label_row.shared_display_name IS DISTINCT FROM expected.shared_name
       OR label_row.label_version <> 1
       OR participation.recipient_user_id IS DISTINCT FROM
            expected.recipient_user_id
       OR participation.recipient_email_canonical IS DISTINCT FROM
            expected_identity.recipient_email_canonical
       OR participation.identity_claimed_at IS DISTINCT FROM
            expected_identity.identity_claimed_at
       OR participation.claim_source_invitation_id IS DISTINCT FROM
            expected_identity.claim_source_invitation_id
       OR participation.identity_generation <> 1
       OR participation.identity_version <> 1
       OR participation.access_state IS DISTINCT FROM expected.access_state
       OR participation.access_version <> 1
       OR participation.rsvp_state IS DISTINCT FROM expected.rsvp_state
       OR participation.rsvp_version <> 1
  ) THEN
    RAISE EXCEPTION 'sql149_backfill_source_mismatch';
  END IF;
END;
$sql149_final_attestation$;

COMMIT;
