-- SQL155 preflight (100% read-only).
BEGIN;
SET TRANSACTION READ ONLY;

WITH expected(signature,predecessor_md5,target_md5,may_be_absent) AS (VALUES
  ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
    '5b7eecb3f7e9aebb6a376ffd312989be',
    '41487888c688c3280904d78772443b07',false),
  ('public.teskeid_event_list_scoped_participations_v3(uuid)',
    '0269211156c600c6411ecf0590eff295',
    'f0c26c4743874f680239a5b3d2f1ca38',false),
  ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)',
    'adc9e9bb4bb79081112c69dd00a6cdff',
    '5b4206f25cfeb04311fbbeab5ebc72da',false),
  ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)',
    '49b11bb0f39c308b5eacfe01e0fcd47b',
    'b2767b261eaa909d064c6f5fe4b737fd',false),
  ('public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)',
    NULL,'fcdbc2930ca742fa4452f20a83ce0114',true)
), functions AS (
  SELECT expected.*,
    procedure_row.oid,
    owner_role.rolname AS owner_name,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc,E'\r\n',E'\n'
    )) AS source_md5
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), relation_boundary AS (
  SELECT pg_catalog.bool_and(
    pg_catalog.to_regclass(expected.relation_name) IS NOT NULL
  ) AS ok
  FROM (VALUES
    ('auth.users'),
    ('public.teskeid_event_attendance_mutation_requests'),
    ('public.teskeid_event_participation_mutation_requests_v3'),
    ('public.teskeid_events'),
    ('public.teskeid_event_guests'),
    ('public.teskeid_event_guest_invitations'),
    ('public.teskeid_event_attendance_memberships'),
    ('public.teskeid_event_participations'),
    ('public.teskeid_event_participation_invitation_terminalizations'),
    ('public.teskeid_event_participation_rsvp_v3'),
    ('public.teskeid_event_participation_invitation_generations_v3')
  ) AS expected(relation_name)
), index_boundary AS (
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
    ),'[()[:space:]]|::text','','g') =
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
    ),'[()[:space:]]|::text','','g') =
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
    ),'[()[:space:]]|::text','','g') = 'status=''pending'''
  ))
  AND index_row.indisunique AND index_row.indisvalid
  AND index_row.indisready AND index_row.indislive
  AND index_row.indnkeyatts = 2 AND index_row.indexprs IS NULL
), dependency_boundary AS (
  SELECT pg_catalog.count(*) = 5 AS ok
  FROM (VALUES
    ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
      'a2a85bca2a456177ab67b7817dc6e19d'),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
      'ee8872c3b0d91786993e4ffbfb266293'),
    ('public.teskeid_event_private_v1_participation_bridge_v2()',
      'f2901d82fd392cd406a5dfbfc3173759'),
    ('public.teskeid_event_private_sync_rsvp_v3()',
      '7126c130f7f17ad07d443a39d9aa57de'),
    ('public.teskeid_event_private_anchor_sync_v3()',
      'db82578fc700fc64590c0b1d65b0ab00')
  ) AS expected(signature,source_md5)
  JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
   AND pg_catalog.md5(pg_catalog.replace(
     procedure_row.prosrc,E'\r\n',E'\n')) = expected.source_md5
), expected_triggers(
  trigger_name,relation_name,function_signature,trigger_type,
  is_deferrable,initially_deferred,update_columns,definition_md5
) AS (VALUES
  ('teskeid_event_guest_invitations_sql149_participation_deferred',
   'public.teskeid_event_guest_invitations',
   'public.teskeid_event_private_v1_participation_bridge_v2()',
   29,true,true,ARRAY[]::text[],'c64f7878dc0c9680b752f67cd3736547'),
  ('teskeid_event_participations_sql153_rsvp_sync',
   'public.teskeid_event_participations',
   'public.teskeid_event_private_sync_rsvp_v3()',
   21,false,false,ARRAY[]::text[],'5aac98d0010360050b49f3ae294e2f77'),
  ('teskeid_event_guest_invitations_sql153_anchor_deferred',
   'public.teskeid_event_guest_invitations',
   'public.teskeid_event_private_anchor_sync_v3()',
   21,true,true,ARRAY[]::text[],'d9b51df3760832dc2a0c872b3098ec42')
), trigger_boundary AS (
  SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(
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
), metrics AS (
  SELECT pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    COALESCE((SELECT pg_catalog.bool_and(
      (oid IS NOT NULL AND (
        COALESCE(source_md5 = predecessor_md5,false)
        OR source_md5 = target_md5
      ))
      OR (may_be_absent AND oid IS NULL)
    ) FROM functions),false) AS predecessor_or_applied_exact_ok,
    COALESCE((SELECT pg_catalog.bool_and(
      oid IS NULL OR (
        owner_name = 'postgres' AND prosecdef AND provolatile = 'v'
        AND proconfig = ARRAY['search_path=""']::text[]
      )
    ) FROM functions),false) AS security_shape_ok,
    COALESCE((SELECT pg_catalog.bool_and(
      COALESCE(source_md5 = target_md5,false)
    ) FROM functions),false) AS already_applied,
    (
      (
        (SELECT source_md5 FROM functions WHERE signature =
          'public.teskeid_event_private_claim_scoped_v3(uuid,uuid)') =
          '5b7eecb3f7e9aebb6a376ffd312989be'
        AND (SELECT source_md5 FROM functions WHERE signature =
          'public.teskeid_event_list_scoped_participations_v3(uuid)') =
          '0269211156c600c6411ecf0590eff295'
      ) OR (
        (SELECT source_md5 FROM functions WHERE signature =
          'public.teskeid_event_private_claim_scoped_v3(uuid,uuid)') =
          '41487888c688c3280904d78772443b07'
        AND (SELECT source_md5 FROM functions WHERE signature =
          'public.teskeid_event_list_scoped_participations_v3(uuid)') =
          'f0c26c4743874f680239a5b3d2f1ca38'
      )
    ) AS phase2_pair_exact_ok,
    (SELECT ok FROM relation_boundary) AS required_relations_ok,
    (SELECT ok FROM index_boundary) AS unique_boundaries_ok,
    (SELECT ok FROM dependency_boundary) AS helper_dependencies_ok,
    (SELECT ok FROM trigger_boundary) AS trigger_boundaries_ok
)
SELECT *,
  executor_ok AND predecessor_or_applied_exact_ok
  AND security_shape_ok AND phase2_pair_exact_ok
  AND required_relations_ok AND unique_boundaries_ok
  AND helper_dependencies_ok AND trigger_boundaries_ok
    AS prerequisites_ok
FROM metrics;

ROLLBACK;
