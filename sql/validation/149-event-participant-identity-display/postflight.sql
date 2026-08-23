-- Read-only SQL149 postflight. postconditions_ok and every gating boolean must
-- be true; bridge/baseline/source-projection diagnostics may be false after
-- compatible traffic. Copy and review the complete result row.
BEGIN;
SET TRANSACTION READ ONLY;

WITH target_relations(relation_name) AS (
  VALUES
    ('public.teskeid_event_person_labels'),
    ('public.teskeid_event_participations'),
    ('public.teskeid_event_participation_mutation_requests'),
    ('public.teskeid_event_participation_invitation_terminalizations')
), relation_check AS (
  SELECT pg_catalog.count(class_row.oid) = 4
    AND pg_catalog.bool_and(
      class_row.relrowsecurity
      AND class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM target_relations AS target
      JOIN pg_catalog.pg_class AS class_row
        ON class_row.oid = pg_catalog.to_regclass(target.relation_name)
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
    )
    AND NOT EXISTS (
      SELECT 1
      FROM target_relations AS target
      JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(target.relation_name)
    ) AS relation_security_exact_ok
  FROM target_relations AS target
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(target.relation_name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner
), sequence_check AS (
  SELECT COALESCE(
    class_row.relkind = 'S'
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
    ), false
  ) AS bridge_observation_sequence_exact_ok,
  COALESCE((
    SELECT sequence_state.last_value = 1 AND NOT sequence_state.is_called
    FROM public.teskeid_event_v1_bridge_observation_seq AS sequence_state
  ), false) AS bridge_observation_unused,
  COALESCE((
    SELECT sequence_state.last_value = 1 AND NOT sequence_state.is_called
    FROM public.teskeid_event_v1_bridge_observation_seq AS sequence_state
  ), false)
    AND NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_person_labels AS label_row
      WHERE label_row.label_version <> 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_participations AS participation
      WHERE participation.identity_generation <> 1
         OR participation.identity_version <> 1
         OR participation.access_version <> 1
         OR participation.rsvp_version <> 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participation_mutation_requests
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participation_invitation_terminalizations
    ) AS baseline_projection_applicable
  FROM (SELECT 1) AS singleton
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(
      'public.teskeid_event_v1_bridge_observation_seq'
    )
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner
  LEFT JOIN pg_catalog.pg_sequence AS sequence_row
    ON sequence_row.seqrelid = class_row.oid
), required_columns(
  relation_name, column_name, type_name, not_null, default_expr
) AS (
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
), column_check AS (
  SELECT pg_catalog.count(attribute_row.attname) = 36
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_attribute AS actual
      WHERE actual.attrelid = ANY(ARRAY[
        pg_catalog.to_regclass('public.teskeid_event_person_labels'),
        pg_catalog.to_regclass('public.teskeid_event_participations'),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_mutation_requests'
        ),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_invitation_terminalizations'
        )
      ])
        AND actual.attnum > 0
        AND NOT actual.attisdropped
    ) = 36
    AND pg_catalog.bool_and(
      pg_catalog.format_type(
        attribute_row.atttypid, attribute_row.atttypmod
      ) = expected.type_name
      AND attribute_row.attnotnull = expected.not_null
      AND attribute_row.attidentity = ''
      AND attribute_row.attgenerated = ''
      AND attribute_row.attinhcount = 0
      AND attribute_row.attislocal
      AND attribute_row.attcollation = (
        SELECT type_row.typcollation
        FROM pg_catalog.pg_type AS type_row
        WHERE type_row.oid = attribute_row.atttypid
      )
      AND pg_catalog.pg_get_expr(
        default_row.adbin, default_row.adrelid
      ) IS NOT DISTINCT FROM expected.default_expr
    ) AS columns_exact_ok
  FROM required_columns AS expected
  LEFT JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND attribute_row.attname = expected.column_name
   AND attribute_row.attnum > 0
   AND NOT attribute_row.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
), expected_constraints(
  relation_name, constraint_name, constraint_type,
  referenced_relation, delete_action, is_deferrable, initially_deferred,
  required_fragments
) AS (
  VALUES
    ('teskeid_event_person_labels','teskeid_event_person_labels_pkey','p',
      NULL,NULL,false,false,'[]'::jsonb),
    ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk','f',
      'public.teskeid_event_guests','c',false,false,'[]'::jsonb),
    ('teskeid_event_person_labels','teskeid_event_person_labels_state_check','c',
      NULL,NULL,false,false,'["resolved","needs_owner_input"]'::jsonb),
    ('teskeid_event_person_labels','teskeid_event_person_labels_shape_check','c',
      NULL,NULL,false,false,'["shared_display_name","valid_shared_name_v2"]'::jsonb),
    ('teskeid_event_person_labels','teskeid_event_person_labels_version_check','c',
      NULL,NULL,false,false,'["label_version"," > 0"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_pkey','p',
      NULL,NULL,false,false,'[]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_guest_fk','f',
      'public.teskeid_event_guests','c',false,false,'[]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_recipient_fk','f',
      'auth.users','n',true,true,'[]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk','f',
      'public.teskeid_event_guest_invitations','n',true,true,'[]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_email_check','c',
      NULL,NULL,false,false,
      '["recipient_email_canonical","valid_canonical_email_v2","recipient_user_id"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_identity_version_check','c',
      NULL,NULL,false,false,'["identity_generation","identity_version"," > 0"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_claim_shape_check','c',
      NULL,NULL,false,false,
      '["identity_claimed_at","claim_source_invitation_id","recipient_user_id"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_access_check','c',
      NULL,NULL,false,false,'["active","left","revoked"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_tombstone_access_check','c',
      NULL,NULL,false,false,
      '["identity_claimed_at","recipient_email_canonical","access_state"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_rsvp_check','c',
      NULL,NULL,false,false,'["no_response","attending","not_attending"]'::jsonb),
    ('teskeid_event_participations','teskeid_event_participations_state_versions_check','c',
      NULL,NULL,false,false,'["access_version","rsvp_version"," > 0"]'::jsonb),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey','p',
      NULL,NULL,false,false,'[]'::jsonb),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk','f',
      'auth.users','c',true,true,'[]'::jsonb),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_operation_check','c',
      NULL,NULL,false,false,
      '["create_with_participations_v2","replace_roster_with_participations_v2","repair_person_label_v2","set_rsvp_v2"]'::jsonb),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_fingerprint_check','c',
      NULL,NULL,false,false,'["fingerprint","0-9a-f","32"]'::jsonb),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_result_check','c',
      NULL,NULL,false,false,'["jsonb_typeof","object","octet_length","32768"]'::jsonb),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey','p',
      NULL,NULL,false,false,'[]'::jsonb),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk','f',
      'public.teskeid_event_guest_invitations','c',false,false,'[]'::jsonb),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk','f',
      'public.teskeid_event_guests','c',false,false,'[]'::jsonb),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_generation_check','c',
      NULL,NULL,false,false,'["identity_generation"," > 0"]'::jsonb),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_reason_check','c',
      NULL,NULL,false,false,'["reason","identity_claim"]'::jsonb)
), constraint_check AS (
  SELECT pg_catalog.count(constraint_row.oid) = 26
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS actual
      WHERE actual.conrelid = ANY(ARRAY[
        pg_catalog.to_regclass('public.teskeid_event_person_labels'),
        pg_catalog.to_regclass('public.teskeid_event_participations'),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_mutation_requests'
        ),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_invitation_terminalizations'
        )
      ])
    ) = 26
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND constraint_row.contype = expected.constraint_type::"char"
      AND constraint_row.condeferrable = expected.is_deferrable
      AND constraint_row.condeferred = expected.initially_deferred
      AND (
        expected.constraint_type <> 'f'
        OR (
          constraint_row.confrelid =
            pg_catalog.to_regclass(expected.referenced_relation)
          AND constraint_row.confdeltype = expected.delete_action::"char"
          AND constraint_row.confupdtype = 'a'
          AND constraint_row.confmatchtype = 's'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements_text(
          expected.required_fragments
        ) AS fragment(value)
        WHERE pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.pg_get_constraintdef(
            constraint_row.oid, true
          )),
          pg_catalog.lower(fragment.value)
        ) = 0
      )
    ) AS constraints_exact_ok
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
), expected_check_definitions(
  relation_name, constraint_name, normalized_expression
) AS (
  VALUES
    ('teskeid_event_person_labels','teskeid_event_person_labels_state_check',
      'label_state=anyarray[''resolved'',''needs_owner_input'']'),
    ('teskeid_event_person_labels','teskeid_event_person_labels_shape_check',
      'label_state=''resolved''andteskeid_event_private_valid_shared_name_v2shared_display_nameorlabel_state=''needs_owner_input''andshared_display_nameisnull'),
    ('teskeid_event_person_labels','teskeid_event_person_labels_version_check',
      'label_version>0'),
    ('teskeid_event_participations','teskeid_event_participations_email_check',
      'recipient_email_canonicalisnullorrecipient_user_idisnullandteskeid_event_private_valid_canonical_email_v2recipient_email_canonical'),
    ('teskeid_event_participations','teskeid_event_participations_identity_version_check',
      'identity_generation>0andidentity_version>0'),
    ('teskeid_event_participations','teskeid_event_participations_claim_shape_check',
      'recipient_user_idisnotnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullorrecipient_user_idisnullandrecipient_email_canonicalisnotnullandidentity_claimed_atisnullandclaim_source_invitation_idisnullorrecipient_email_canonicalisnullandidentity_claimed_atisnullandclaim_source_invitation_idisnulloridentity_claimed_atisnotnull'),
    ('teskeid_event_participations','teskeid_event_participations_access_check',
      'access_state=anyarray[''active'',''left'',''revoked'']'),
    ('teskeid_event_participations','teskeid_event_participations_tombstone_access_check',
      'notrecipient_user_idisnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullandaccess_state=''active'''),
    ('teskeid_event_participations','teskeid_event_participations_rsvp_check',
      'rsvp_state=anyarray[''no_response'',''attending'',''not_attending'']'),
    ('teskeid_event_participations','teskeid_event_participations_state_versions_check',
      'access_version>0andrsvp_version>0'),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_operation_check',
      'operation=anyarray[''create_with_participations_v2'',''replace_roster_with_participations_v2'',''repair_person_label_v2'',''set_rsvp_v2'']'),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_fingerprint_check',
      'fingerprint~''^[0-9a-f]{32}$'''),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_result_check',
      'resultisnullorjsonb_typeofresult=''object''andoctet_lengthresult<=32768'),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_generation_check',
      'identity_generation>0'),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_reason_check',
      'reason=''identity_claim''')
), check_definition_check AS (
  SELECT pg_catalog.count(constraint_row.oid) = 15
    AND pg_catalog.bool_and(
      pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, true
        )),
        'public[.]|pg_catalog[.]|[()[:space:]]|::text', '', 'g'
      ) = expected.normalized_expression
    ) AS check_definitions_exact_ok
  FROM expected_check_definitions AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
   AND constraint_row.contype = 'c'
), expected_constraint_keys(
  relation_name, constraint_name, local_columns, referenced_columns
) AS (
  VALUES
    ('teskeid_event_person_labels','teskeid_event_person_labels_pkey',
      ARRAY['event_id','event_guest_id']::text[],NULL),
    ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk',
      ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_pkey',
      ARRAY['event_id','event_guest_id']::text[],NULL),
    ('teskeid_event_participations','teskeid_event_participations_guest_fk',
      ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_recipient_fk',
      ARRAY['recipient_user_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk',
      ARRAY['claim_source_invitation_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey',
      ARRAY['actor_user_id','request_id']::text[],NULL),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk',
      ARRAY['actor_user_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey',
      ARRAY['invitation_id']::text[],NULL),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk',
      ARRAY['invitation_id','event_id','event_guest_id']::text[],
      ARRAY['id','event_id','event_guest_id']::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk',
      ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[])
), constraint_key_check AS (
  SELECT pg_catalog.count(constraint_row.oid) = 11
    AND pg_catalog.bool_and(
      ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey)
          WITH ORDINALITY AS keyed(attnum, ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = keyed.attnum
        ORDER BY keyed.ordinal_position
      ) = expected.local_columns
      AND (
        expected.referenced_columns IS NULL
        OR ARRAY(
          SELECT attribute_row.attname::text
          FROM pg_catalog.unnest(constraint_row.confkey)
            WITH ORDINALITY AS keyed(attnum, ordinal_position)
          JOIN pg_catalog.pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.confrelid
           AND attribute_row.attnum = keyed.attnum
          ORDER BY keyed.ordinal_position
        ) = expected.referenced_columns
      )
    ) AS constraint_keys_exact_ok
  FROM expected_constraint_keys AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
), expected_indexes(
  index_name, table_name, is_unique, is_primary,
  column_names, operator_classes, collations, normalized_predicate
) AS (
  VALUES
    ('teskeid_event_person_labels_pkey',
      'public.teskeid_event_person_labels',true,true,
      ARRAY['event_id','event_guest_id']::text[],
      ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
    ('teskeid_event_participations_pkey',
      'public.teskeid_event_participations',true,true,
      ARRAY['event_id','event_guest_id']::text[],
      ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
    ('teskeid_event_participation_requests_pkey',
      'public.teskeid_event_participation_mutation_requests',true,true,
      ARRAY['actor_user_id','request_id']::text[],
      ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
    ('teskeid_event_participation_invitation_terminalizations_pkey',
      'public.teskeid_event_participation_invitation_terminalizations',
      true,true,ARRAY['invitation_id']::text[],ARRAY['uuid_ops']::text[],
      ARRAY['']::text[],NULL),
    ('teskeid_event_participations_active_user_uidx',
      'public.teskeid_event_participations',true,false,
      ARRAY['event_id','recipient_user_id']::text[],
      ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],
      'access_state=''active''andrecipient_user_idisnotnull'),
    ('teskeid_event_participations_active_email_uidx',
      'public.teskeid_event_participations',true,false,
      ARRAY['event_id','recipient_email_canonical']::text[],
      ARRAY['uuid_ops','text_ops']::text[],ARRAY['','default']::text[],
      'access_state=''active''andrecipient_email_canonicalisnotnull'),
    ('teskeid_event_participations_recipient_user_idx',
      'public.teskeid_event_participations',false,false,
      ARRAY['recipient_user_id','access_state','event_id']::text[],
      ARRAY['uuid_ops','text_ops','uuid_ops']::text[],
      ARRAY['','default','']::text[],
      'recipient_user_idisnotnull'),
    ('teskeid_event_participations_recipient_email_idx',
      'public.teskeid_event_participations',false,false,
      ARRAY['recipient_email_canonical','access_state','event_id','event_guest_id']::text[],
      ARRAY['text_ops','text_ops','uuid_ops','uuid_ops']::text[],
      ARRAY['default','default','','']::text[],
      'recipient_email_canonicalisnotnull'),
    ('teskeid_event_guest_invitations_sql149_identity_uidx',
      'public.teskeid_event_guest_invitations',true,false,
      ARRAY['id','event_id','event_guest_id']::text[],
      ARRAY['uuid_ops','uuid_ops','uuid_ops']::text[],
      ARRAY['','','']::text[],NULL)
), index_check AS (
  SELECT pg_catalog.count(index_row.indexrelid) = 9
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_index AS actual
      WHERE actual.indrelid = ANY(ARRAY[
        pg_catalog.to_regclass('public.teskeid_event_person_labels'),
        pg_catalog.to_regclass('public.teskeid_event_participations'),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_mutation_requests'
        ),
        pg_catalog.to_regclass(
          'public.teskeid_event_participation_invitation_terminalizations'
        )
      ])
    ) = 8
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS actual_index
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = actual_index.relnamespace
      WHERE index_namespace.nspname = 'public'
        AND actual_index.relkind = 'i'
        AND actual_index.relname LIKE '%sql149%'
    ) = 1
    AND pg_catalog.bool_and(
      index_row.indrelid = pg_catalog.to_regclass(expected.table_name)
      AND index_row.indisunique = expected.is_unique
      AND index_row.indisprimary = expected.is_primary
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND NOT index_row.indcheckxmin
      AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident
      AND NOT index_row.indnullsnotdistinct
      AND NOT index_row.indisexclusion
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions, ARRAY[]::text[]
      )) = 0
      AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts =
        pg_catalog.cardinality(expected.column_names)
      AND index_row.indnatts = index_row.indnkeyatts
      AND access_method.amname = 'btree'
      AND ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(index_row.indkey)
          WITH ORDINALITY AS indexed(attnum, ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = index_row.indrelid
         AND attribute_row.attnum = indexed.attnum
        ORDER BY indexed.ordinal_position
      ) = expected.column_names
      AND ARRAY(
        SELECT operator_class.opcname::text
        FROM pg_catalog.unnest(index_row.indclass)
          WITH ORDINALITY AS indexed(opclass_oid, ordinal_position)
        JOIN pg_catalog.pg_opclass AS operator_class
          ON operator_class.oid = indexed.opclass_oid
        ORDER BY indexed.ordinal_position
      ) = expected.operator_classes
      AND ARRAY(
        SELECT COALESCE(collation_row.collname, '')::text
        FROM pg_catalog.unnest(index_row.indcollation)
          WITH ORDINALITY AS indexed(collation_oid, ordinal_position)
        LEFT JOIN pg_catalog.pg_collation AS collation_row
          ON collation_row.oid = indexed.collation_oid
        ORDER BY indexed.ordinal_position
      ) = expected.collations
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(index_row.indoption) AS option_value
        WHERE option_value <> 0
      )
      AND pg_catalog.regexp_replace(
        COALESCE(pg_catalog.lower(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        )), ''),
        '[()[:space:]]|::text', '', 'g'
      ) = COALESCE(expected.normalized_predicate, '')
    ) AS indexes_exact_ok
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = pg_catalog.to_regclass(
      'public.' || expected.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = index_row.indexrelid
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_class.relam
), expected_functions(
  signature, exact_arguments, return_type, language_name,
  is_public, volatility
) AS (
  VALUES
    ('public.teskeid_event_private_normalize_shared_name_v2(text)',
      'p_value text','text','sql',false,'i'),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
      'p_value timestamp with time zone','text','sql',false,'s'),
    ('public.teskeid_event_private_valid_shared_name_v2(text)',
      'p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_valid_canonical_email_v2(text)',
      'p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',
      'jsonb','plpgsql',false,'v'),
    ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)',
      'p_actor_id uuid, p_request_id uuid, p_result jsonb',
      'void','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_participation_request_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)',
      'p_event_id uuid, p_event_guest_id uuid','void','plpgsql',false,'v'),
    ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)',
      'p_recipient_user_id uuid, p_confirmed_email_canonical text',
      'integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_bound_invitation_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_email_invitations_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_participation_unlink_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_delete_participations_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
      'p_event_id uuid, p_event_guest_id uuid, p_identity_action text, p_recipient_user_id uuid, p_recipient_email_canonical text, p_claim_source_invitation_id uuid, p_increment_generation boolean, p_access_state text, p_rsvp_state text',
      'void','plpgsql',false,'v'),
    ('public.teskeid_event_private_v1_participation_bridge_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_claim_participations_v2(uuid)',
      'p_actor_id uuid','integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_safe_profile_name_v2(uuid)',
      'p_user_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
      'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
      'p_actor_id uuid, p_event_id uuid, p_position integer',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
      'p_actor_id uuid, p_event_id uuid, p_viewer_role text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_for_actor_v2(uuid)',
      'p_actor_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_roster_management_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)',
      'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)',
      'p_actor_id uuid, p_event_id uuid, p_viewer_role text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_legacy_expense_sources_v2(uuid)',
      'p_actor_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)',
      'p_guests jsonb, p_allow_retained boolean','jsonb','plpgsql',false,'i'),
    ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)',
      'p_canonical_guests jsonb','jsonb','sql',false,'i'),
    ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)',
      'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_expected_label_version bigint, p_shared_display_name text, p_request_id uuid',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid',
      'jsonb','plpgsql',true,'v')
), function_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 37
    AND pg_catalog.bool_and(
      owner_role.rolname = 'postgres'
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = pg_catalog.split_part(
            pg_catalog.split_part(expected.signature, '(', 1), '.', 2
          )
      ) = 1
      AND procedure_row.prosecdef
      AND procedure_row.prokind = 'f'
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.prolang = (
        SELECT language_row.oid
        FROM pg_catalog.pg_language AS language_row
        WHERE language_row.lanname = expected.language_name
      )
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
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
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.is_public
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS functions_security_exact_ok
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), expected_function_bodies(function_name, expected_md5) AS (
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
), function_body_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 37
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
    ) AS function_bodies_exact_ok
  FROM expected_function_bodies AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
   AND procedure_row.proname = expected.function_name
), trigger_expected(trigger_name, relation_name, function_signature,
    trigger_type, is_deferrable, initially_deferred, update_columns) AS (
  VALUES
    ('teskeid_event_participation_requests_mutation_guard',
      'public.teskeid_event_participation_mutation_requests',
      'public.teskeid_event_private_guard_participation_request_v2()',
      27,false,false,ARRAY[]::text[]),
    ('teskeid_event_guest_invitations_sql149_bound_guard',
      'public.teskeid_event_guest_invitations',
      'public.teskeid_event_private_guard_bound_invitation_v2()',
      23,false,false,ARRAY[]::text[]),
    ('teskeid_event_sql149_participation_account_email',
      'auth.users',
      'public.teskeid_event_private_auth_email_invitations_v2()',
      17,false,false,ARRAY['email','email_confirmed_at']::text[]),
    ('teskeid_event_participations_account_unlink',
      'public.teskeid_event_participations',
      'public.teskeid_event_private_participation_unlink_v2()',
      19,false,false,ARRAY['recipient_user_id']::text[]),
    ('teskeid_event_sql149_participation_account_delete',
      'auth.users',
      'public.teskeid_event_private_auth_delete_participations_v2()',
      11,false,false,ARRAY[]::text[]),
    ('teskeid_event_guests_sql149_participation_deferred',
      'public.teskeid_event_guests',
      'public.teskeid_event_private_v1_participation_bridge_v2()',
      29,true,true,ARRAY[]::text[]),
    ('teskeid_event_guest_invitations_sql149_participation_deferred',
      'public.teskeid_event_guest_invitations',
      'public.teskeid_event_private_v1_participation_bridge_v2()',
      29,true,true,ARRAY[]::text[]),
    ('teskeid_event_attendance_memberships_sql149_sync_deferred',
      'public.teskeid_event_attendance_memberships',
      'public.teskeid_event_private_v1_participation_bridge_v2()',
      29,true,true,ARRAY[]::text[])
), trigger_check AS (
  SELECT pg_catalog.count(trigger_row.oid) = 8
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal
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
    )
    AND (
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
    ) = 8 AS triggers_exact_ok
  FROM trigger_expected AS expected
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
  ) AS actual_columns ON true
), data_check AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests)
      AS source_guest_count,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_person_labels)
      AS label_backfill_count,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_participations)
      AS participation_backfill_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_person_labels
      WHERE label_state = 'needs_owner_input') AS unresolved_label_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_participation_invitation_terminalizations)
      AS identity_claim_marker_count,
    NOT EXISTS (
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
    ) AS event_temporal_exact_ok,
    NOT EXISTS (
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
    ) AS event_text_projection_safe_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS participation
      JOIN public.teskeid_event_guest_invitations AS invitation
        ON invitation.event_id = participation.event_id
       AND invitation.event_guest_id = participation.event_guest_id
      WHERE participation.recipient_user_id IS NOT NULL
        AND invitation.status = 'pending'
        AND invitation.invitation_kind = 'identity_and_access'
    ) AS bound_identity_pending_absent_ok,
    NOT EXISTS (
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
    ) AS backfill_exact_ok,
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_person_labels AS label_row
      WHERE (label_row.label_state = 'resolved') IS DISTINCT FROM
        (label_row.shared_display_name IS NOT NULL)
         OR (label_row.shared_display_name IS NOT NULL
           AND NOT public.teskeid_event_private_valid_shared_name_v2(
             label_row.shared_display_name
           ))
    ) AS labels_safe_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS participation
      WHERE participation.recipient_email_canonical IS NOT NULL
        AND NOT public.teskeid_event_private_valid_canonical_email_v2(
          participation.recipient_email_canonical
        )
    ) AS participation_emails_exact_ok,
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_participations AS participation
      WHERE participation.recipient_user_id IS NULL
        AND participation.recipient_email_canonical IS NULL
        AND participation.identity_claimed_at IS NOT NULL
        AND participation.access_state = 'active'
    ) AS tombstones_inactive_ok,
    NOT EXISTS (
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
    ) AS claim_markers_exact_ok,
    NOT EXISTS (
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
    ) AS bound_pending_email_exact_ok,
    NOT EXISTS (
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
    ) AS owner_self_absent_ok,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_participations AS unbound
      JOIN public.teskeid_event_participations AS bound_self
        ON bound_self.event_id = unbound.event_id
       AND bound_self.event_guest_id <> unbound.event_guest_id
       AND bound_self.recipient_user_id IS NOT NULL
      JOIN auth.users AS account
        ON account.id = bound_self.recipient_user_id
       AND account.email_confirmed_at IS NOT NULL
      WHERE unbound.access_state = 'active'
        AND unbound.recipient_user_id IS NULL
        AND unbound.recipient_email_canonical =
          public.normalize_email_canonical(account.email)
    ) AS claim_skip_candidate_count
), source_projection_check AS (
  SELECT NOT EXISTS (
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
  ) AS source_projection_exact_ok
), protected_direct(
  signature, exact_arguments, return_type, volatility,
  service_execute, expected_md5
) AS (
  VALUES
    ('public.teskeid_event_assert_actor(uuid)', 'p_actor_id uuid',
      'void','s',false,'9dd7c34f6cc6c78131e7ebbb9a718ea4'),
    ('public.teskeid_event_uuid_from_text(text)', 'p_value text',
      'uuid','i',false,'27229cbc71c621e5a8592265b07f874d'),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
      'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
      'text','s',false,'2377be525ed29f2d4bc26d453fa8cf51'),
    ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)',
      'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
      'jsonb','v',true,'0022e19d8853709247583b7ddb38ef45'),
    ('public.expense_prepare_account_deletion(uuid)', 'p_user_id uuid',
      'jsonb','v',true,'0562edbfaa608cead23d23d49ec36a66'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid',
      'jsonb','s',true,'3d01501bdb03f0f6bca83e0817688006'),
    ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
      'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
      'bigint','v',false,'819b2e024aac1e00c7e14145b0d6b373'),
    ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
      'jsonb','v',true,'7e6426c8e43efa3bb7d725bf6b1c807c'),
    ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
      'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
      'jsonb','s',true,'a31fc1caa0cf009e4daad9c3e3ed1875'),
    ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid',
      'jsonb','s',true,'ae418825a7d7f8ebe056272dde9448fd')
), protected_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 10
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
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
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS protected_catalog_unchanged_ok
  FROM protected_direct AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), protected_additional(
  signature, exact_arguments, return_type, volatility,
  security_definer, is_strict, parallel_safety, service_execute, expected_md5
) AS (
  VALUES
    ('public.normalize_email_canonical(text)', 'p_email text',
      'text','i',false,true,'s',true,
      '3083103976aa8cb3780937b9da1be236'),
    ('public.teskeid_event_normalize_text(text)', 'p_value text',
      'text','i',true,false,'u',false,
      'ced5cfb2427fe7331f4416497614f7d1'),
    ('public.teskeid_event_valid_text(text,integer,integer)',
      'p_value text, p_minimum integer, p_maximum integer',
      'boolean','i',true,false,'u',false,
      '28c80b083a90683f15fd04f4d7d547d1'),
    ('public.teskeid_event_assert_financial_actor(uuid)', 'p_actor_id uuid',
      'void','s',true,false,'u',false,
      '7f6ced4f5e7472aff27d9a6d5c624355'),
    ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
      'p_invitation_ids uuid[], p_status text',
      'integer','v',true,false,'u',false,
      'a2a85bca2a456177ab67b7817dc6e19d'),
    ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
      'jsonb','v',true,false,'u',true,
      '3e1b846ec2a4540e6ee51becb2590ec2')
), protected_additional_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 6
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = expected.security_definer
      AND procedure_row.proisstrict = expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = expected.parallel_safety::"char"
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
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
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS protected_additional_unchanged_ok
  FROM protected_additional AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), protected_sql147(
  signature, exact_arguments, return_type, expected_md5
) AS (
  VALUES
    ('public.teskeid_event_list_for_actor(uuid)',
      'p_actor_id uuid','jsonb','4ccf01e6251a7e7ee187fcba21a88c36'),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
      'p_actor_id uuid, p_invitation_id uuid','jsonb',
      'e268003d1f916f6a987e8d47dbef5971'),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
      'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid',
      'jsonb','45bab121e346e77fa4a4035b7cf88f16'),
    ('public.teskeid_event_list_my_pending_invitations(uuid)',
      'p_actor_id uuid','jsonb','295ca440e9caa334986f664ce2bc7398')
), protected_sql147_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 4
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
        '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n', ''
      )) = expected.expected_md5
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
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
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
      )
    ) AS protected_sql147_unchanged_ok
  FROM protected_sql147 AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), checks AS (
  SELECT
    current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.now() AS checked_at,
    relation_check.*,
    sequence_check.*,
    column_check.*,
    constraint_check.*,
    check_definition_check.*,
    constraint_key_check.*,
    index_check.*,
    function_check.*,
    function_body_check.*,
    trigger_check.*,
    data_check.*,
    source_projection_check.*,
    protected_check.*,
    protected_additional_check.*,
    protected_sql147_check.*
  FROM relation_check
  CROSS JOIN sequence_check
  CROSS JOIN column_check
  CROSS JOIN constraint_check
  CROSS JOIN check_definition_check
  CROSS JOIN constraint_key_check
  CROSS JOIN index_check
  CROSS JOIN function_check
  CROSS JOIN function_body_check
  CROSS JOIN trigger_check
  CROSS JOIN data_check
  CROSS JOIN source_projection_check
  CROSS JOIN protected_check
  CROSS JOIN protected_additional_check
  CROSS JOIN protected_sql147_check
)
SELECT checks.*,
  checks.relation_security_exact_ok
    AND checks.bridge_observation_sequence_exact_ok
    AND checks.columns_exact_ok
    AND checks.constraints_exact_ok
    AND checks.check_definitions_exact_ok
    AND checks.constraint_keys_exact_ok
    AND checks.indexes_exact_ok
    AND checks.functions_security_exact_ok
    AND checks.function_bodies_exact_ok
    AND checks.triggers_exact_ok
    AND checks.backfill_exact_ok
    AND checks.event_temporal_exact_ok
    AND checks.event_text_projection_safe_ok
    AND checks.bound_identity_pending_absent_ok
    AND checks.labels_safe_ok
    AND checks.participation_emails_exact_ok
    AND checks.tombstones_inactive_ok
    AND checks.claim_markers_exact_ok
    AND checks.bound_pending_email_exact_ok
    AND checks.owner_self_absent_ok
    AND checks.protected_catalog_unchanged_ok
    AND checks.protected_additional_unchanged_ok
    AND checks.protected_sql147_unchanged_ok
    AND checks.source_guest_count = checks.label_backfill_count
    AND checks.source_guest_count = checks.participation_backfill_count
    AS postconditions_ok
FROM checks;

ROLLBACK;
