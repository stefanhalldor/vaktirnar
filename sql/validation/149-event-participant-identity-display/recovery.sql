-- Guarded SQL149 recovery. This is deliberately fail-closed and is not a
-- general rollback. Run only after Codex has reviewed an exact postflight.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'teskeid:sql149:event-participant-identity-display', 14901
  )
);

DO $sql149_recovery_presence$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sql149_recovery_executor_not_allowed';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_event_person_labels') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_participations') IS NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_participation_mutation_requests'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_participation_invitation_terminalizations'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_v1_bridge_observation_seq'
     ) IS NULL THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;
END;
$sql149_recovery_presence$;

-- Auth is always locked first. Auth lifecycle hooks can reach Event rows;
-- Event writers only take a compatible Auth RowShare lock before Event rows.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_details IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_guests IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_guest_invitations
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_attendance_memberships
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_person_labels
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_participations
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_participation_mutation_requests
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.teskeid_event_participation_invitation_terminalizations
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $sql149_recovery_catalog_guard$
DECLARE
  v_ok boolean;
  v_expected record;
  v_source text;
BEGIN
  -- All four target relations remain postgres-owned FORCE-RLS/no-policy and
  -- expose no privileges to app roles.
  WITH expected(name) AS (VALUES
    ('public.teskeid_event_person_labels'),
    ('public.teskeid_event_participations'),
    ('public.teskeid_event_participation_mutation_requests'),
    ('public.teskeid_event_participation_invitation_terminalizations')
  )
  SELECT pg_catalog.count(class_row.oid) = 4
    AND pg_catalog.bool_and(
      class_row.relkind = 'r'
      AND owner_role.rolname = 'postgres'
      AND class_row.relrowsecurity
      AND class_row.relforcerowsecurity
    )
    AND NOT EXISTS (
      SELECT 1
      FROM expected
      JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.name)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM expected
      JOIN pg_catalog.pg_class AS protected_class
        ON protected_class.oid = pg_catalog.to_regclass(expected.name)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        protected_class.relacl,
        pg_catalog.acldefault('r', protected_class.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = acl.grantee
      WHERE acl.grantee = 0
         OR COALESCE(grantee.rolname, '') IN (
           'anon','authenticated','service_role'
         )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected.name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- Exact target columns. attidentity/attgenerated/collation are sealed too;
  -- a later forward fix under an existing name must not be dropped.
  WITH expected(relation_name,column_name,type_name,not_null,default_expr) AS (
    VALUES
      ('teskeid_event_person_labels','event_id','uuid',true,NULL),
      ('teskeid_event_person_labels','event_guest_id','uuid',true,NULL),
      ('teskeid_event_person_labels','label_state','text',true,NULL),
      ('teskeid_event_person_labels','shared_display_name','text',false,NULL),
      ('teskeid_event_person_labels','label_version','bigint',true,'1'),
      ('teskeid_event_person_labels','created_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_person_labels','updated_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participations','event_id','uuid',true,NULL),
      ('teskeid_event_participations','event_guest_id','uuid',true,NULL),
      ('teskeid_event_participations','recipient_user_id','uuid',false,NULL),
      ('teskeid_event_participations','recipient_email_canonical','text',false,NULL),
      ('teskeid_event_participations','identity_generation','bigint',true,'1'),
      ('teskeid_event_participations','identity_version','bigint',true,'1'),
      ('teskeid_event_participations','identity_claimed_at','timestamp with time zone',false,NULL),
      ('teskeid_event_participations','claim_source_invitation_id','uuid',false,NULL),
      ('teskeid_event_participations','access_state','text',true,'''active''::text'),
      ('teskeid_event_participations','access_version','bigint',true,'1'),
      ('teskeid_event_participations','access_updated_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participations','rsvp_state','text',true,'''no_response''::text'),
      ('teskeid_event_participations','rsvp_version','bigint',true,'1'),
      ('teskeid_event_participations','rsvp_updated_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participations','created_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participations','updated_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participation_mutation_requests','actor_user_id','uuid',true,NULL),
      ('teskeid_event_participation_mutation_requests','request_id','uuid',true,NULL),
      ('teskeid_event_participation_mutation_requests','operation','text',true,NULL),
      ('teskeid_event_participation_mutation_requests','fingerprint','text',true,NULL),
      ('teskeid_event_participation_mutation_requests','result','jsonb',false,NULL),
      ('teskeid_event_participation_mutation_requests','created_at','timestamp with time zone',true,'now()'),
      ('teskeid_event_participation_mutation_requests','completed_at','timestamp with time zone',false,NULL),
      ('teskeid_event_participation_invitation_terminalizations','invitation_id','uuid',true,NULL),
      ('teskeid_event_participation_invitation_terminalizations','event_id','uuid',true,NULL),
      ('teskeid_event_participation_invitation_terminalizations','event_guest_id','uuid',true,NULL),
      ('teskeid_event_participation_invitation_terminalizations','identity_generation','bigint',true,NULL),
      ('teskeid_event_participation_invitation_terminalizations','reason','text',true,NULL),
      ('teskeid_event_participation_invitation_terminalizations','created_at','timestamp with time zone',true,'now()')
  ), actual AS (
    SELECT namespace_row.nspname || '.' || class_row.relname AS relation_name,
      attribute.attname AS column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS type_name,
      attribute.attnotnull AS not_null,
      pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, true)
        AS default_expr,
      attribute.attidentity, attribute.attgenerated,
      attribute.attinhcount, attribute.attislocal,
      attribute.attcollation
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS class_row
      ON class_row.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = class_row.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute.attrelid
     AND default_row.adnum = attribute.attnum
    WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
      AND attribute.attrelid = ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass
      ])
  )
  SELECT (SELECT pg_catalog.count(*) FROM expected) = 36
    AND (SELECT pg_catalog.count(*) FROM actual) = 36
    AND NOT EXISTS (
      SELECT 1 FROM expected
      LEFT JOIN actual
        ON actual.relation_name = 'public.' || expected.relation_name
       AND actual.column_name = expected.column_name
      WHERE actual.column_name IS NULL
         OR actual.type_name IS DISTINCT FROM expected.type_name
         OR actual.not_null IS DISTINCT FROM expected.not_null
         OR actual.default_expr IS DISTINCT FROM expected.default_expr
         OR actual.attidentity <> '' OR actual.attgenerated <> ''
         OR actual.attinhcount <> 0 OR NOT actual.attislocal
         OR actual.attcollation <> (
           SELECT type_row.typcollation
           FROM pg_catalog.pg_type AS type_row
           WHERE type_row.oid = pg_catalog.to_regtype(actual.type_name)
         )
    ) INTO v_ok;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  WITH expected(relation_name,constraint_name,constraint_type,
      referenced_relation,delete_action,is_deferrable,initially_deferred) AS (
    VALUES
      ('teskeid_event_person_labels','teskeid_event_person_labels_pkey','p',NULL,NULL,false,false),
      ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk','f','public.teskeid_event_guests','c',false,false),
      ('teskeid_event_participations','teskeid_event_participations_pkey','p',NULL,NULL,false,false),
      ('teskeid_event_participations','teskeid_event_participations_guest_fk','f','public.teskeid_event_guests','c',false,false),
      ('teskeid_event_participations','teskeid_event_participations_recipient_fk','f','auth.users','n',true,true),
      ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk','f','public.teskeid_event_guest_invitations','n',true,true),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey','p',NULL,NULL,false,false),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk','f','auth.users','c',true,true),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey','p',NULL,NULL,false,false),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk','f','public.teskeid_event_guest_invitations','c',false,false),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk','f','public.teskeid_event_guests','c',false,false)
  )
  SELECT pg_catalog.count(constraint_row.oid) = 11
    AND pg_catalog.bool_and(
      constraint_row.contype = expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND constraint_row.condeferrable = expected.is_deferrable
      AND constraint_row.condeferred = expected.initially_deferred
      AND (
        expected.constraint_type <> 'f' OR (
          constraint_row.confrelid =
            pg_catalog.to_regclass(expected.referenced_relation)
          AND constraint_row.confdeltype = expected.delete_action::"char"
          AND constraint_row.confupdtype = 'a'
          AND constraint_row.confmatchtype = 's'
        )
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  WITH expected(relation_name,constraint_name,local_columns,referenced_columns) AS (
    VALUES
      ('teskeid_event_person_labels','teskeid_event_person_labels_pkey',ARRAY['event_id','event_guest_id']::text[],NULL),
      ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk',ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_pkey',ARRAY['event_id','event_guest_id']::text[],NULL),
      ('teskeid_event_participations','teskeid_event_participations_guest_fk',ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_recipient_fk',ARRAY['recipient_user_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk',ARRAY['claim_source_invitation_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey',ARRAY['actor_user_id','request_id']::text[],NULL),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk',ARRAY['actor_user_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey',ARRAY['invitation_id']::text[],NULL),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk',ARRAY['invitation_id','event_id','event_guest_id']::text[],ARRAY['id','event_id','event_guest_id']::text[]),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk',ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[])
  )
  SELECT pg_catalog.count(constraint_row.oid) = 11
    AND pg_catalog.bool_and(
      ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey)
          WITH ORDINALITY AS keyed(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = keyed.attnum
        ORDER BY keyed.ordinal_position
      ) = expected.local_columns
      AND (
        expected.referenced_columns IS NULL OR ARRAY(
          SELECT attribute.attname::text
          FROM pg_catalog.unnest(constraint_row.confkey)
            WITH ORDINALITY AS keyed(attnum,ordinal_position)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.confrelid
           AND attribute.attnum = keyed.attnum
          ORDER BY keyed.ordinal_position
        ) = expected.referenced_columns
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- Exact constraint and index object sets. Full definitions are protected by
  -- the source-sealed SQL149 helper/check-function catalog below.
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass
      ])) <> 26
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = ANY(ARRAY[
         'public.teskeid_event_person_labels'::regclass,
         'public.teskeid_event_participations'::regclass,
         'public.teskeid_event_participation_mutation_requests'::regclass,
         'public.teskeid_event_participation_invitation_terminalizations'::regclass
       ]) AND conname <> ALL(ARRAY[
         'teskeid_event_person_labels_pkey','teskeid_event_person_labels_guest_fk',
         'teskeid_event_person_labels_state_check','teskeid_event_person_labels_shape_check',
         'teskeid_event_person_labels_version_check','teskeid_event_participations_pkey',
         'teskeid_event_participations_guest_fk','teskeid_event_participations_recipient_fk',
         'teskeid_event_participations_claim_invitation_fk','teskeid_event_participations_email_check',
         'teskeid_event_participations_identity_version_check','teskeid_event_participations_claim_shape_check',
         'teskeid_event_participations_access_check','teskeid_event_participations_tombstone_access_check',
         'teskeid_event_participations_rsvp_check','teskeid_event_participations_state_versions_check',
         'teskeid_event_participation_requests_pkey','teskeid_event_participation_requests_actor_fk',
         'teskeid_event_participation_requests_operation_check','teskeid_event_participation_requests_fingerprint_check',
         'teskeid_event_participation_requests_result_check',
         'teskeid_event_participation_invitation_terminalizations_pkey',
         'teskeid_event_participation_terminalizations_invitation_fk',
         'teskeid_event_participation_terminalizations_guest_fk',
         'teskeid_event_participation_terminalizations_generation_check',
         'teskeid_event_participation_terminalizations_reason_check'
       ])
     ) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  WITH expected(relation_name,constraint_name,normalized_expression) AS (
    VALUES
      ('teskeid_event_person_labels','teskeid_event_person_labels_state_check','label_state=anyarray[''resolved'',''needs_owner_input'']'),
      ('teskeid_event_person_labels','teskeid_event_person_labels_shape_check','label_state=''resolved''andteskeid_event_private_valid_shared_name_v2shared_display_nameorlabel_state=''needs_owner_input''andshared_display_nameisnull'),
      ('teskeid_event_person_labels','teskeid_event_person_labels_version_check','label_version>0'),
      ('teskeid_event_participations','teskeid_event_participations_email_check','recipient_email_canonicalisnullorrecipient_user_idisnullandteskeid_event_private_valid_canonical_email_v2recipient_email_canonical'),
      ('teskeid_event_participations','teskeid_event_participations_identity_version_check','identity_generation>0andidentity_version>0'),
      ('teskeid_event_participations','teskeid_event_participations_claim_shape_check','recipient_user_idisnotnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullorrecipient_user_idisnullandrecipient_email_canonicalisnotnullandidentity_claimed_atisnullandclaim_source_invitation_idisnullorrecipient_email_canonicalisnullandidentity_claimed_atisnullandclaim_source_invitation_idisnulloridentity_claimed_atisnotnull'),
      ('teskeid_event_participations','teskeid_event_participations_access_check','access_state=anyarray[''active'',''left'',''revoked'']'),
      ('teskeid_event_participations','teskeid_event_participations_tombstone_access_check','notrecipient_user_idisnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullandaccess_state=''active'''),
      ('teskeid_event_participations','teskeid_event_participations_rsvp_check','rsvp_state=anyarray[''no_response'',''attending'',''not_attending'']'),
      ('teskeid_event_participations','teskeid_event_participations_state_versions_check','access_version>0andrsvp_version>0'),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_operation_check','operation=anyarray[''create_with_participations_v2'',''replace_roster_with_participations_v2'',''repair_person_label_v2'',''set_rsvp_v2'']'),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_fingerprint_check','fingerprint~''^[0-9a-f]{32}$'''),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_result_check','resultisnullorjsonb_typeofresult=''object''andoctet_lengthresult<=32768'),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_generation_check','identity_generation>0'),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_reason_check','reason=''identity_claim''')
  )
  SELECT pg_catalog.count(constraint_row.oid) = 15
    AND pg_catalog.bool_and(
      pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, true
        )),
        'public[.]|pg_catalog[.]|[()[:space:]]|::text', '', 'g'
      ) = expected.normalized_expression
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
   AND constraint_row.contype = 'c';
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  WITH expected(index_name,index_definition) AS (VALUES
    ('teskeid_event_person_labels_pkey','CREATE UNIQUE INDEX teskeid_event_person_labels_pkey ON public.teskeid_event_person_labels USING btree (event_id, event_guest_id)'),
    ('teskeid_event_participations_pkey','CREATE UNIQUE INDEX teskeid_event_participations_pkey ON public.teskeid_event_participations USING btree (event_id, event_guest_id)'),
    ('teskeid_event_participation_requests_pkey','CREATE UNIQUE INDEX teskeid_event_participation_requests_pkey ON public.teskeid_event_participation_mutation_requests USING btree (actor_user_id, request_id)'),
    ('teskeid_event_participation_invitation_terminalizations_pkey','CREATE UNIQUE INDEX teskeid_event_participation_invitation_terminalizations_pkey ON public.teskeid_event_participation_invitation_terminalizations USING btree (invitation_id)'),
    ('teskeid_event_participations_active_user_uidx','CREATE UNIQUE INDEX teskeid_event_participations_active_user_uidx ON public.teskeid_event_participations USING btree (event_id, recipient_user_id) WHERE ((access_state = ''active''::text) AND (recipient_user_id IS NOT NULL))'),
    ('teskeid_event_participations_active_email_uidx','CREATE UNIQUE INDEX teskeid_event_participations_active_email_uidx ON public.teskeid_event_participations USING btree (event_id, recipient_email_canonical) WHERE ((access_state = ''active''::text) AND (recipient_email_canonical IS NOT NULL))'),
    ('teskeid_event_participations_recipient_user_idx','CREATE INDEX teskeid_event_participations_recipient_user_idx ON public.teskeid_event_participations USING btree (recipient_user_id, access_state, event_id) WHERE (recipient_user_id IS NOT NULL)'),
    ('teskeid_event_participations_recipient_email_idx','CREATE INDEX teskeid_event_participations_recipient_email_idx ON public.teskeid_event_participations USING btree (recipient_email_canonical, access_state, event_id, event_guest_id) WHERE (recipient_email_canonical IS NOT NULL)'),
    ('teskeid_event_guest_invitations_sql149_identity_uidx','CREATE UNIQUE INDEX teskeid_event_guest_invitations_sql149_identity_uidx ON public.teskeid_event_guest_invitations USING btree (id, event_id, event_guest_id)')
  )
  SELECT pg_catalog.count(index_row.indexrelid) = 9
    AND pg_catalog.bool_and(
      pg_catalog.pg_get_indexdef(index_row.indexrelid) =
        expected.index_definition
      AND index_row.indisvalid AND index_row.indisready AND index_row.indislive
      AND NOT index_row.indcheckxmin AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident AND NOT index_row.indisexclusion
      AND NOT index_row.indnullsnotdistinct
      AND index_row.indexprs IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions, ARRAY[]::text[]
      )) = 0
      AND access_method.amname = 'btree'
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = pg_catalog.to_regclass(
      'public.' || expected.index_name
    )
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = index_class.oid
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_class.relam;
  IF NOT COALESCE(v_ok, false) OR
     (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index AS index_row
      WHERE index_row.indrelid = ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass
      ])) <> 8 THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- Exact private sequence and its permanent no-v1-bridge evidence.
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
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
        AND dependency.objid = class_row.oid
        AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
        AND dependency.deptype IN ('a','i')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl, pg_catalog.acldefault('S', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE acl.grantee = 0 OR COALESCE(grantee.rolname,'') IN (
        'anon','authenticated','service_role'
      )
    ) INTO v_ok
  FROM pg_catalog.pg_class AS class_row
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class_row.relowner
  JOIN pg_catalog.pg_sequence AS sequence_row
    ON sequence_row.seqrelid = class_row.oid
  WHERE class_row.oid =
    'public.teskeid_event_v1_bridge_observation_seq'::regclass;
  IF NOT COALESCE(v_ok, false) OR NOT (
    SELECT sequence_state.last_value = 1 AND NOT sequence_state.is_called
    FROM public.teskeid_event_v1_bridge_observation_seq AS sequence_state
  ) THEN
    RAISE EXCEPTION 'sql149_recovery_forward_fix_only';
  END IF;

  -- Frozen SQL132/133/137/141/147/148 helpers are part of the rollback
  -- baseline too. Recovery must not run over an unknown forward fix.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_assert_actor(uuid)','p_actor_id uuid','void','s',true,false,'u',false,'9dd7c34f6cc6c78131e7ebbb9a718ea4',false),
      ('public.teskeid_event_uuid_from_text(text)','p_value text','uuid','i',true,false,'u',false,'27229cbc71c621e5a8592265b07f874d',false),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)','p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid','text','s',true,false,'u',false,'2377be525ed29f2d4bc26d453fa8cf51',false),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb','jsonb','v',true,false,'u',true,'0022e19d8853709247583b7ddb38ef45',false),
      ('public.expense_prepare_account_deletion(uuid)','p_user_id uuid','jsonb','v',true,false,'u',true,'0562edbfaa608cead23d23d49ec36a66',false),
      ('public.teskeid_event_get_expense_source(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,'3d01501bdb03f0f6bca83e0817688006',false),
      ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)','p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean','bigint','v',true,false,'u',false,'819b2e024aac1e00c7e14145b0d6b373',false),
      ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)','p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint','jsonb','v',true,false,'u',true,'7e6426c8e43efa3bb7d725bf6b1c807c',false),
      ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)','p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer','jsonb','s',true,false,'u',true,'a31fc1caa0cf009e4daad9c3e3ed1875',false),
      ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','s',true,false,'u',true,'ae418825a7d7f8ebe056272dde9448fd',false),
      ('public.normalize_email_canonical(text)','p_email text','text','i',false,true,'s',true,'3083103976aa8cb3780937b9da1be236',false),
      ('public.teskeid_event_normalize_text(text)','p_value text','text','i',true,false,'u',false,'ced5cfb2427fe7331f4416497614f7d1',false),
      ('public.teskeid_event_valid_text(text,integer,integer)','p_value text, p_minimum integer, p_maximum integer','boolean','i',true,false,'u',false,'28c80b083a90683f15fd04f4d7d547d1',false),
      ('public.teskeid_event_assert_financial_actor(uuid)','p_actor_id uuid','void','s',true,false,'u',false,'7f6ced4f5e7472aff27d9a6d5c624355',false),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)','p_invitation_ids uuid[], p_status text','integer','v',true,false,'u',false,'a2a85bca2a456177ab67b7817dc6e19d',false),
      ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text','jsonb','v',true,false,'u',true,'3e1b846ec2a4540e6ee51becb2590ec2',false),
      ('public.teskeid_event_list_for_actor(uuid)','p_actor_id uuid','jsonb','v',true,false,'u',true,'4ccf01e6251a7e7ee187fcba21a88c36',true),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)','p_actor_id uuid, p_invitation_id uuid','jsonb','v',true,false,'u',true,'e268003d1f916f6a987e8d47dbef5971',true),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)','p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid','jsonb','v',true,false,'u',true,'45bab121e346e77fa4a4035b7cf88f16',true),
      ('public.teskeid_event_list_my_pending_invitations(uuid)','p_actor_id uuid','jsonb','v',true,false,'u',true,'295ca440e9caa334986f664ce2bc7398',true)
    ) AS expected(signature,exact_arguments,return_type,volatility,
      security_definer,is_strict,parallel_safety,service_execute,source_md5,
      strip_sql147_marker)
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prolang = (
        SELECT language_row.oid
        FROM pg_catalog.pg_language AS language_row
        WHERE language_row.lanname = CASE
          WHEN v_expected.signature IN (
            'public.teskeid_event_uuid_from_text(text)',
            'public.normalize_email_canonical(text)',
            'public.teskeid_event_normalize_text(text)',
            'public.teskeid_event_valid_text(text,integer,integer)'
          ) THEN 'sql' ELSE 'plpgsql' END
      )
      AND procedure_row.prosecdef = v_expected.security_definer
      AND procedure_row.proisstrict = v_expected.is_strict
      AND NOT procedure_row.proleakproof AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = v_expected.volatility::"char"
      AND procedure_row.proparallel = v_expected.parallel_safety::"char"
      AND procedure_row.prorettype = pg_catalog.to_regtype(v_expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = v_expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) = v_expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=','search_path=""')
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
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0 OR privilege.is_grantable
           OR (privilege.grantee <> procedure_row.proowner AND (
             NOT v_expected.service_execute
             OR grantee.rolname IS DISTINCT FROM 'service_role'
           ))
      );
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    IF v_expected.strip_sql147_marker THEN
      v_source := pg_catalog.replace(
        v_source,
        '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',
        ''
      );
    END IF;
    IF v_source IS NULL OR pg_catalog.md5(v_source) <> v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
    END IF;
    v_source := NULL;
  END LOOP;

  WITH expected(signature,exact_arguments,return_type,language_name,
      is_public,volatility) AS (VALUES
    ('public.teskeid_event_private_normalize_shared_name_v2(text)','p_value text','text','sql',false,'i'),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)','p_value timestamp with time zone','text','sql',false,'s'),
    ('public.teskeid_event_private_valid_shared_name_v2(text)','p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_valid_canonical_email_v2(text)','p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text','jsonb','plpgsql',false,'v'),
    ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_participation_request_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)','p_event_id uuid, p_event_guest_id uuid','void','plpgsql',false,'v'),
    ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)','p_recipient_user_id uuid, p_confirmed_email_canonical text','integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_bound_invitation_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_email_invitations_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_participation_unlink_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_delete_participations_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)','p_event_id uuid, p_event_guest_id uuid, p_identity_action text, p_recipient_user_id uuid, p_recipient_email_canonical text, p_claim_source_invitation_id uuid, p_increment_generation boolean, p_access_state text, p_rsvp_state text','void','plpgsql',false,'v'),
    ('public.teskeid_event_private_v1_participation_bridge_v2()','','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_claim_participations_v2(uuid)','p_actor_id uuid','integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_safe_profile_name_v2(uuid)','p_user_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)','p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)','p_actor_id uuid, p_event_id uuid, p_position integer','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)','p_actor_id uuid, p_event_id uuid, p_viewer_role text','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_for_actor_v2(uuid)','p_actor_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_roster_management_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)','p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)','p_actor_id uuid, p_event_id uuid, p_viewer_role text','jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_legacy_expense_sources_v2(uuid)','p_actor_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)','p_guests jsonb, p_allow_retained boolean','jsonb','plpgsql',false,'i'),
    ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)','p_canonical_guests jsonb','jsonb','sql',false,'i'),
    ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_expected_label_version bigint, p_shared_display_name text, p_request_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid','jsonb','plpgsql',true,'v')
  )
  SELECT pg_catalog.count(procedure_row.oid) = 37
    AND pg_catalog.bool_and(
      owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f' AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset AND procedure_row.pronargdefaults = 0
      AND procedure_row.prolang = (
        SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
        WHERE language_row.lanname = expected.language_name
      )
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype = pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=','search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.is_public
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
           OR privilege.grantee = 0 OR privilege.is_grantable
           OR (privilege.grantee <> procedure_row.proowner AND (
             NOT expected.is_public
             OR grantee.rolname IS DISTINCT FROM 'service_role'
           ))
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- New function bodies are exact as well.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',false,'d118ab08bc0346cdf31519344a2f65a7'),
      ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',false,'7017190619681901af3813e1fc3b305c'),
      ('public.teskeid_event_private_valid_shared_name_v2(text)',false,'7a3223263c138e04713dbc87e7dc6576'),
      ('public.teskeid_event_private_valid_canonical_email_v2(text)',false,'3e64bc04485bc06cc544f59f46a2fb0e'),
      ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)',false,'2e1e7edc8401f395c8089b1769bc6496'),
      ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)',false,'7da1e4c2af949efc9434be98ace4eb7d'),
      ('public.teskeid_event_private_guard_participation_request_v2()',false,'abbca6ba554f3a1d0d4d71b9918d2abd'),
      ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)',false,'fa593d9afce6ceb40e3fd15f9f4a30ba'),
      ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)',false,'23a268c468e1d61a508b16c80bd08daa'),
      ('public.teskeid_event_private_guard_bound_invitation_v2()',false,'18c2e356417113e8e06cfc568f763713'),
      ('public.teskeid_event_private_auth_email_invitations_v2()',false,'b7805535363aa4fc020668a71c5a5171'),
      ('public.teskeid_event_private_participation_unlink_v2()',false,'5fe72ac8d08536cde7229359023cbb08'),
      ('public.teskeid_event_private_auth_delete_participations_v2()',false,'f0444e3a30a939ee42ea528a09cd1e0e'),
      ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',false,'ee8872c3b0d91786993e4ffbfb266293'),
      ('public.teskeid_event_private_v1_participation_bridge_v2()',false,'f2901d82fd392cd406a5dfbfc3173759'),
      ('public.teskeid_event_private_claim_participations_v2(uuid)',false,'b57bf9fa43754dfcd05cb7e063829bc6'),
      ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',false,'211fbfb65b4edaa4b0307c2fb5878a60'),
      ('public.teskeid_event_private_safe_profile_name_v2(uuid)',false,'53f29b4c6872d3e76d6c9cbc17a767e0'),
      ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',false,'ad66614815b29a02ee3dc928c17886c3'),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',false,'dd6d4f6b57c109fb46d6992ce66462e8'),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',false,'d42c11caf87eaac45646535539029977'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',false,'2eb6db6c327de83f1bf241f9368c3a0c'),
      ('public.teskeid_event_list_for_actor_v2(uuid)',true,'6d20e61af6c56e4c3c02d53340ff2bc6'),
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',true,'eb2da9a9c2c0463f76636ded02a6747a'),
      ('public.teskeid_event_get_roster_management_v2(uuid,uuid)',true,'baf7ef85dbbdc487fe3ca67abb0ecba8'),
      ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)',true,'0959d2725cd7db9b3510d123a81819eb'),
      ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',true,'3c689e2f05035a67d58fbb8ca39dcd40'),
      ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',false,'25394edc6b084676921c3a65b1f19a8a'),
      ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)',false,'1abbd25362561a9f7b2aaba642412356'),
      ('public.teskeid_event_list_legacy_expense_sources_v2(uuid)',true,'e5532869077cbc11e0bcb3b846baf172'),
      ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',true,'aec7d0cf817826697338e74de645dc4e'),
      ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)',false,'cbede437498c588a385a6cb4bdd04610'),
      ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)',false,'5332b4a24406be464bb51d2148578b75'),
      ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)',true,'3b72c4710731c6d467475665e6bb5d48'),
      ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)',true,'c8738b2a21735bac895c3e25335f6ee8'),
      ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)',true,'3352c37bbf3883c991c658de37fde1d3'),
      ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)',true,'0b161601a4b91a521c42288b8279ff83')
    ) AS expected(signature,is_public,source_md5)
  LOOP
    SELECT procedure_row.prosrc INTO v_source
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=','search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = v_expected.is_public
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      );
    IF v_source IS NULL OR pg_catalog.md5(pg_catalog.replace(
      v_source, E'\r\n', E'\n'
    )) <> v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
    END IF;
    v_source := NULL;
  END LOOP;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
        AND procedure_row.proname = ANY(ARRAY[
          'teskeid_event_private_normalize_shared_name_v2','teskeid_event_private_format_utc_timestamp_v2',
          'teskeid_event_private_valid_shared_name_v2',
          'teskeid_event_private_valid_canonical_email_v2','teskeid_event_private_begin_participation_request_v2',
          'teskeid_event_private_finish_participation_request_v2','teskeid_event_private_guard_participation_request_v2',
          'teskeid_event_private_ensure_person_v2','teskeid_event_private_expire_bound_invitations_v2',
          'teskeid_event_private_guard_bound_invitation_v2','teskeid_event_private_auth_email_invitations_v2',
          'teskeid_event_private_participation_unlink_v2','teskeid_event_private_auth_delete_participations_v2',
          'teskeid_event_private_apply_participation_v2','teskeid_event_private_v1_participation_bridge_v2',
          'teskeid_event_private_claim_participations_v2','teskeid_event_private_assert_viewer_v2',
          'teskeid_event_private_safe_profile_name_v2','teskeid_event_private_viewer_relationship_v2',
          'teskeid_event_private_person_projection_v2','teskeid_event_private_organizer_projection_v2',
          'teskeid_event_private_people_projection_v2','teskeid_event_list_for_actor_v2',
          'teskeid_event_get_actor_view_v2','teskeid_event_get_roster_management_v2',
          'teskeid_event_list_person_source_events_v2','teskeid_event_get_person_source_roster_v2',
          'teskeid_event_private_legacy_person_v2','teskeid_event_private_legacy_people_v2',
          'teskeid_event_list_legacy_expense_sources_v2','teskeid_event_get_legacy_expense_source_v2',
          'teskeid_event_private_canonical_roster_input_v2','teskeid_event_private_legacy_roster_input_v2',
          'teskeid_event_create_with_details_and_participations_v2','teskeid_event_replace_roster_with_participations_v2',
          'teskeid_event_repair_person_label_v2','teskeid_event_set_rsvp_v2'
        ])) <> 37 THEN
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- Exact trigger set and timing/event bits; no same-prefix forward-fix trigger
  -- may be silently detached.
  WITH expected(name,relation_name,function_signature,tgtype,
      is_deferrable,initially_deferred,update_columns) AS (VALUES
    ('teskeid_event_participation_requests_mutation_guard','public.teskeid_event_participation_mutation_requests','public.teskeid_event_private_guard_participation_request_v2()',27,false,false,ARRAY[]::text[]),
    ('teskeid_event_guest_invitations_sql149_bound_guard','public.teskeid_event_guest_invitations','public.teskeid_event_private_guard_bound_invitation_v2()',23,false,false,ARRAY[]::text[]),
    ('teskeid_event_sql149_participation_account_email','auth.users','public.teskeid_event_private_auth_email_invitations_v2()',17,false,false,ARRAY['email','email_confirmed_at']::text[]),
    ('teskeid_event_participations_account_unlink','public.teskeid_event_participations','public.teskeid_event_private_participation_unlink_v2()',19,false,false,ARRAY['recipient_user_id']::text[]),
    ('teskeid_event_sql149_participation_account_delete','auth.users','public.teskeid_event_private_auth_delete_participations_v2()',11,false,false,ARRAY[]::text[]),
    ('teskeid_event_guests_sql149_participation_deferred','public.teskeid_event_guests','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[]),
    ('teskeid_event_guest_invitations_sql149_participation_deferred','public.teskeid_event_guest_invitations','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[]),
    ('teskeid_event_attendance_memberships_sql149_sync_deferred','public.teskeid_event_attendance_memberships','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[])
  )
  SELECT pg_catalog.count(trigger_row.oid) = 8
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgtype = expected.tgtype
      AND trigger_row.tgdeferrable = expected.is_deferrable
      AND trigger_row.tginitdeferred = expected.initially_deferred
      AND trigger_row.tgfoid =
        pg_catalog.to_regprocedure(expected.function_signature)
      AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
      AND pg_catalog.octet_length(trigger_row.tgargs) = 0
      AND actual_columns.update_columns = expected.update_columns
    )
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS installed
      WHERE NOT installed.tgisinternal AND (
        installed.tgname LIKE '%sql149%'
        OR installed.tgname IN (
          'teskeid_event_participation_requests_mutation_guard',
          'teskeid_event_participations_account_unlink'
        )
      )) = 8 INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.name
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
    RAISE EXCEPTION 'sql149_recovery_shape_mismatch';
  END IF;

  -- Any v2 mutation/claim/repair or any postinstall bridge invocation makes
  -- recovery forward-fix-only. Version=1 is not used as proof of no bridge;
  -- the nontransactional sequence above is that proof.
  IF EXISTS (SELECT 1 FROM public.teskeid_event_participation_mutation_requests)
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participation_invitation_terminalizations
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_person_labels
       WHERE label_version <> 1
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_participations
       WHERE identity_generation <> 1 OR identity_version <> 1
          OR access_version <> 1 OR rsvp_version <> 1
     )
     OR (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests)
       <> (SELECT pg_catalog.count(*) FROM public.teskeid_event_person_labels)
     OR (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests)
       <> (SELECT pg_catalog.count(*) FROM public.teskeid_event_participations)
  THEN
    RAISE EXCEPTION 'sql149_recovery_forward_fix_only';
  END IF;

  -- Prove exact key/value equality with the deterministic migration baseline;
  -- equal counts and version=1 alone cannot detect a missing+extra pair or a
  -- direct administrative rewrite.
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    LEFT JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    LEFT JOIN public.teskeid_event_participations AS participation
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
    LEFT JOIN public.profiles AS profile ON profile.id = guest.linked_user_id
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
          CASE WHEN invitation.status IN ('accepted','left','revoked')
            THEN invitation.accepted_user_id ELSE NULL END,
          guest.linked_user_id
        ) AS recipient_user_id,
        CASE
          WHEN guest.status = 'removed' THEN 'revoked'
          WHEN membership.user_id IS NOT NULL THEN 'active'
          WHEN invitation.status = 'left' THEN 'left'
          WHEN invitation.status IN ('revoked','cancelled') THEN 'revoked'
          ELSE 'active'
        END AS access_state,
        CASE
          WHEN membership.user_id IS NOT NULL
            OR invitation.status IN ('accepted','left','revoked')
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
            OR invitation.status IN ('cancelled','revoked','left') THEN NULL
          WHEN invitation.status = 'pending'
            THEN invitation.recipient_email_canonical
          WHEN guest.source_kind = 'manual_email' THEN guest.email_canonical
          ELSE NULL
        END AS recipient_email_canonical,
        CASE WHEN expected.recipient_user_id IS NOT NULL THEN COALESCE(
          membership.accepted_at, invitation.accepted_at, guest.created_at
        ) ELSE NULL END AS identity_claimed_at,
        CASE WHEN expected.recipient_user_id IS NOT NULL THEN COALESCE(
          membership.accepted_invitation_id, invitation.id
        ) ELSE NULL END AS claim_source_invitation_id
    ) AS expected_identity
    WHERE label_row.event_guest_id IS NULL
       OR participation.event_guest_id IS NULL
       OR label_row.label_state IS DISTINCT FROM CASE
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
    RAISE EXCEPTION 'sql149_recovery_forward_fix_only';
  END IF;
END;
$sql149_recovery_catalog_guard$;

-- Detach every old/auth source hook first so there is no triggerless bridge
-- gap and no dependency left behind. All locks remain held to COMMIT.
DROP TRIGGER teskeid_event_sql149_participation_account_email ON auth.users;
DROP TRIGGER teskeid_event_sql149_participation_account_delete ON auth.users;
DROP TRIGGER teskeid_event_guest_invitations_sql149_bound_guard
  ON public.teskeid_event_guest_invitations;
DROP TRIGGER teskeid_event_guests_sql149_participation_deferred
  ON public.teskeid_event_guests;
DROP TRIGGER teskeid_event_guest_invitations_sql149_participation_deferred
  ON public.teskeid_event_guest_invitations;
DROP TRIGGER teskeid_event_attendance_memberships_sql149_sync_deferred
  ON public.teskeid_event_attendance_memberships;
DROP TRIGGER teskeid_event_participations_account_unlink
  ON public.teskeid_event_participations;
DROP TRIGGER teskeid_event_participation_requests_mutation_guard
  ON public.teskeid_event_participation_mutation_requests;

DROP TABLE public.teskeid_event_participation_invitation_terminalizations;
DROP TABLE public.teskeid_event_participation_mutation_requests;
DROP TABLE public.teskeid_event_participations;
DROP TABLE public.teskeid_event_person_labels;
DROP INDEX public.teskeid_event_guest_invitations_sql149_identity_uidx;
DROP SEQUENCE public.teskeid_event_v1_bridge_observation_seq;

DROP FUNCTION public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid);
DROP FUNCTION public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid);
DROP FUNCTION public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb);
DROP FUNCTION public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text);
DROP FUNCTION public.teskeid_event_private_legacy_roster_input_v2(jsonb);
DROP FUNCTION public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean);
DROP FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_list_legacy_expense_sources_v2(uuid);
DROP FUNCTION public.teskeid_event_private_legacy_people_v2(uuid,uuid,text);
DROP FUNCTION public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer);
DROP FUNCTION public.teskeid_event_get_person_source_roster_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer);
DROP FUNCTION public.teskeid_event_get_roster_management_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_get_actor_view_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_list_for_actor_v2(uuid);
DROP FUNCTION public.teskeid_event_private_people_projection_v2(uuid,uuid,text);
DROP FUNCTION public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer);
DROP FUNCTION public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean);
DROP FUNCTION public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text);
DROP FUNCTION public.teskeid_event_private_safe_profile_name_v2(uuid);
DROP FUNCTION public.teskeid_event_private_assert_viewer_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_claim_participations_v2(uuid);
DROP FUNCTION public.teskeid_event_private_v1_participation_bridge_v2();
DROP FUNCTION public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text);
DROP FUNCTION public.teskeid_event_private_auth_delete_participations_v2();
DROP FUNCTION public.teskeid_event_private_participation_unlink_v2();
DROP FUNCTION public.teskeid_event_private_auth_email_invitations_v2();
DROP FUNCTION public.teskeid_event_private_guard_bound_invitation_v2();
DROP FUNCTION public.teskeid_event_private_expire_bound_invitations_v2(uuid,text);
DROP FUNCTION public.teskeid_event_private_ensure_person_v2(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_guard_participation_request_v2();
DROP FUNCTION public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb);
DROP FUNCTION public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text);
DROP FUNCTION public.teskeid_event_private_valid_canonical_email_v2(text);
DROP FUNCTION public.teskeid_event_private_valid_shared_name_v2(text);
DROP FUNCTION public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone);
DROP FUNCTION public.teskeid_event_private_normalize_shared_name_v2(text);

COMMIT;
