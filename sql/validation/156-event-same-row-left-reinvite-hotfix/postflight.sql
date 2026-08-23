-- SQL156 postflight (100% read-only).
BEGIN;
SET TRANSACTION READ ONLY;

WITH targets AS (
  SELECT procedure_row.oid::regprocedure::text AS signature,
    owner_role.rolname AS owner_name,
    language_row.lanname AS language_name,
    procedure_row.prokind,
    procedure_row.prorettype,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proisstrict,
    procedure_row.proleakproof,
    procedure_row.proparallel,
    procedure_row.proconfig,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) AS source_md5
  FROM pg_catalog.pg_proc AS procedure_row
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure_row.prolang
  WHERE procedure_row.oid IN (
    pg_catalog.to_regprocedure(
      'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'
    )
  )
), sql155_expected(signature, target_md5, service_execute) AS (VALUES
  ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
    '41487888c688c3280904d78772443b07',false),
  ('public.teskeid_event_list_scoped_participations_v3(uuid)',
    'f0c26c4743874f680239a5b3d2f1ca38',true),
  ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)',
    '5b4206f25cfeb04311fbbeab5ebc72da',true),
  ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)',
    'b2767b261eaa909d064c6f5fe4b737fd',true),
  ('public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)',
    'fcdbc2930ca742fa4452f20a83ce0114',false)
), sql155_targets AS (
  SELECT expected.*,
    procedure_row.oid,
    owner_role.rolname AS owner_name,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) AS source_md5,
    COALESCE(pg_catalog.has_function_privilege(
      'service_role', procedure_row.oid, 'EXECUTE'
    ), false) AS service_has_execute,
    COALESCE(pg_catalog.has_function_privilege(
      'anon', procedure_row.oid, 'EXECUTE'
    ), false) AS anon_has_execute,
    COALESCE(pg_catalog.has_function_privilege(
      'authenticated', procedure_row.oid, 'EXECUTE'
    ), false) AS authenticated_has_execute
  FROM sql155_expected AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), helper_dependencies AS (
  SELECT pg_catalog.count(*) = 6 AND pg_catalog.bool_and(
    procedure_row.oid IS NOT NULL
    AND pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc,E'\r\n',E'\n'
    )) = expected.source_md5
    AND owner_role.rolname = 'postgres'
    AND procedure_row.prosecdef
    AND procedure_row.provolatile = 'v'
    AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
  ) AS ok
  FROM (VALUES
    ('public.teskeid_event_private_guard_bound_invitation_v2()',
     '18c2e356417113e8e06cfc568f763713'),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
     'ee8872c3b0d91786993e4ffbfb266293'),
    ('public.teskeid_event_private_v1_participation_bridge_v2()',
     'f2901d82fd392cd406a5dfbfc3173759'),
    ('public.teskeid_event_private_bump_generation_rsvp_v3()',
     '9f7c2be934e4e3db5be808e4b0800e42'),
    ('public.teskeid_event_private_sync_rsvp_v3()',
     '7126c130f7f17ad07d443a39d9aa57de'),
    ('public.teskeid_event_private_anchor_sync_v3()',
     'db82578fc700fc64590c0b1d65b0ab00')
  ) AS expected(signature,source_md5)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), expected_triggers(
  trigger_name,relation_name,function_signature,trigger_type,
  is_deferrable,initially_deferred,update_columns,definition_md5
) AS (VALUES
  ('teskeid_event_guest_invitations_sql149_bound_guard',
   'public.teskeid_event_guest_invitations',
   'public.teskeid_event_private_guard_bound_invitation_v2()',
   23,false,false,ARRAY[]::text[],'4140321dd7400e9f0678e83519d1928b'),
  ('teskeid_event_guest_invitations_sql149_participation_deferred',
   'public.teskeid_event_guest_invitations',
   'public.teskeid_event_private_v1_participation_bridge_v2()',
   29,true,true,ARRAY[]::text[],'c64f7878dc0c9680b752f67cd3736547'),
  ('teskeid_event_participations_sql153_generation_rsvp_bump',
   'public.teskeid_event_participations',
   'public.teskeid_event_private_bump_generation_rsvp_v3()',
   19,false,false,ARRAY['identity_generation']::text[],
   '79dd9233e23f7c3ca18405df5c00f62b'),
  ('teskeid_event_participations_sql153_rsvp_sync',
   'public.teskeid_event_participations',
   'public.teskeid_event_private_sync_rsvp_v3()',
   21,false,false,ARRAY[]::text[],'5aac98d0010360050b49f3ae294e2f77'),
  ('teskeid_event_guest_invitations_sql153_anchor_deferred',
   'public.teskeid_event_guest_invitations',
   'public.teskeid_event_private_anchor_sync_v3()',
   21,true,true,ARRAY[]::text[],'d9b51df3760832dc2a0c872b3098ec42')
), trigger_boundary AS (
  SELECT pg_catalog.count(*) = 5 AND pg_catalog.bool_and(
    trigger_row.oid IS NOT NULL
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O'
    AND trigger_row.tgtype = expected.trigger_type
    AND trigger_row.tgdeferrable = expected.is_deferrable
    AND trigger_row.tginitdeferred = expected.initially_deferred
    AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
    AND pg_catalog.octet_length(trigger_row.tgargs) = 0
    AND trigger_row.tgfoid =
      pg_catalog.to_regprocedure(expected.function_signature)
    AND actual_columns.update_columns = expected.update_columns
    AND trigger_row.tgoldtable IS NULL
    AND trigger_row.tgnewtable IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_triggerdef(trigger_row.oid),
        '::[a-z0-9_]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'), 'public.', ''
    ))) = expected.definition_md5
    AND ((expected.is_deferrable AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS trigger_constraint
      WHERE trigger_constraint.oid = trigger_row.tgconstraint
        AND trigger_constraint.conname = expected.trigger_name
        AND trigger_constraint.contype = 't'
        AND trigger_constraint.conrelid = trigger_row.tgrelid
        AND trigger_constraint.condeferrable
        AND trigger_constraint.condeferred
        AND trigger_constraint.convalidated
    )) OR (NOT expected.is_deferrable AND trigger_row.tgconstraint = 0))
  ) AS ok
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
   AND trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)
  LEFT JOIN LATERAL (
    SELECT COALESCE(pg_catalog.array_agg(
      attribute_row.attname::text ORDER BY attribute_row.attname
    ),ARRAY[]::text[]) AS update_columns
    FROM pg_catalog.unnest(COALESCE(
      trigger_row.tgattr::smallint[],ARRAY[]::smallint[]
    )) AS trigger_attribute(attnum)
    JOIN pg_catalog.pg_attribute AS attribute_row
      ON attribute_row.attrelid = trigger_row.tgrelid
     AND attribute_row.attnum = trigger_attribute.attnum
  ) AS actual_columns ON true
), unique_boundaries AS (
  SELECT pg_catalog.count(*) = 3 AS ok
  FROM pg_catalog.pg_index AS index_row
  WHERE ((
    index_row.indexrelid = pg_catalog.to_regclass(
      'public.teskeid_event_participations_active_user_uidx')
    AND index_row.indrelid = pg_catalog.to_regclass(
      'public.teskeid_event_participations')
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
      'recipient_user_id'
    AND pg_catalog.regexp_replace(pg_catalog.lower(
      pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
    ), '[()[:space:]]|::text', '', 'g') =
      'access_state=''active''andrecipient_user_idisnotnull'
  ) OR (
    index_row.indexrelid = pg_catalog.to_regclass(
      'public.teskeid_event_participations_active_email_uidx')
    AND index_row.indrelid = pg_catalog.to_regclass(
      'public.teskeid_event_participations')
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
      'recipient_email_canonical'
    AND pg_catalog.regexp_replace(pg_catalog.lower(
      pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
    ), '[()[:space:]]|::text', '', 'g') =
      'access_state=''active''andrecipient_email_canonicalisnotnull'
  ) OR (
    index_row.indexrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guest_invitations_pending_email_uidx')
    AND index_row.indrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guest_invitations')
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
    AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
      'recipient_email_canonical'
    AND pg_catalog.regexp_replace(pg_catalog.lower(
      pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
    ), '[()[:space:]]|::text', '', 'g') = 'status=''pending'''
  ))
  AND index_row.indisunique AND index_row.indisvalid
  AND index_row.indisready AND index_row.indislive
  AND index_row.indnkeyatts = 2 AND index_row.indexprs IS NULL
), invitation_time_columns AS (
  SELECT attribute_row.attname,
    attribute_row.attnotnull,
    pg_catalog.format_type(
      attribute_row.atttypid, attribute_row.atttypmod
    ) AS type_name,
    pg_catalog.regexp_replace(pg_catalog.lower(
      pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
    ), '[()[:space:]]|::interval', '', 'g') AS normalized_default
  FROM pg_catalog.pg_attribute AS attribute_row
  JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  WHERE attribute_row.attrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guest_invitations'
    )
    AND attribute_row.attname IN ('expires_at', 'created_at', 'updated_at')
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
), metrics AS (
  SELECT
    pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    (SELECT pg_catalog.count(*) = 2 FROM targets) AS functions_exist_ok,
    COALESCE((SELECT pg_catalog.bool_and(
      (signature =
        'teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)'
        AND source_md5 = '98031fa21f1f710a8df822849edf80c5')
      OR (signature =
        'teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'
        AND source_md5 = '1120d176c335185f258d8ef824ef1f05')
    ) FROM targets), false) AS same_row_left_reinvite_exact_ok,
    COALESCE((SELECT pg_catalog.count(*) = 5 AND pg_catalog.bool_and(
      oid IS NOT NULL
      AND source_md5 = target_md5
      AND owner_name = 'postgres'
      AND prosecdef
      AND provolatile = 'v'
      AND proconfig = ARRAY['search_path=""']::text[]
      AND service_has_execute = service_execute
      AND NOT anon_has_execute
      AND NOT authenticated_has_execute
    ) FROM sql155_targets), false) AS sql155_exact_ok,
    COALESCE((SELECT ok FROM helper_dependencies),false)
      AS helper_dependencies_ok,
    COALESCE((SELECT ok FROM trigger_boundary),false)
      AS trigger_boundaries_ok,
    COALESCE((SELECT ok FROM unique_boundaries),false)
      AS unique_boundaries_ok,
    COALESCE((SELECT pg_catalog.bool_and(
      owner_name = 'postgres'
      AND language_name = 'plpgsql'
      AND prokind = 'f'
      AND prorettype = 'jsonb'::pg_catalog.regtype
      AND prosecdef AND provolatile = 'v'
      AND NOT proisstrict AND NOT proleakproof AND proparallel = 'u'
      AND proconfig = ARRAY['search_path=""']::text[]
    ) FROM targets), false) AS security_shape_ok,
    NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    ) AND pg_catalog.has_function_privilege(
      'service_role',
      'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
      'EXECUTE'
    ) AS acl_ok,
    (SELECT pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
      owner_role.rolname = 'postgres'
      AND relation_row.relrowsecurity
      AND relation_row.relforcerowsecurity
    )
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE relation_row.oid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_participations')
    )) AS relations_security_ok,
    (SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(
      attnotnull AND type_name = 'timestamp with time zone'
      AND normalized_default = CASE attname
        WHEN 'expires_at' THEN 'now+''30days'''
        ELSE 'now'
      END
    ) FROM invitation_time_columns) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = pg_catalog.to_regclass(
          'public.teskeid_event_guest_invitations'
        )
        AND constraint_row.conname =
          'teskeid_event_guest_invitations_expiry_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND NOT constraint_row.connoinherit
        AND pg_catalog.regexp_replace(pg_catalog.lower(
          pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          )
        ), '[()[:space:]]', '', 'g') = 'expires_at>created_at'
    ) AS invitation_time_shape_ok
)
SELECT *, functions_exist_ok AND same_row_left_reinvite_exact_ok
  AND sql155_exact_ok AND helper_dependencies_ok AND trigger_boundaries_ok
  AND unique_boundaries_ok
  AND security_shape_ok AND acl_ok AND relations_security_ok
  AND invitation_time_shape_ok AS postconditions_ok
FROM metrics;

ROLLBACK;
