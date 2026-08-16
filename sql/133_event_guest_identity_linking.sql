-- TODO #095 / SQL133: consent-gated Event attendance and guest identity.
-- Forward-only and DB-first compatible with production SHA
-- 1a8860529b3f0e641105adca5bbb604c6aff8eeb. DO NOT RUN automatically.
-- Stebbi applies this only after the dedicated read-only preflight is green.

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';
SET LOCAL search_path = pg_catalog;

DO $teskeid_event_attendance_preconditions$
DECLARE
  v_collision text;
  v_expected record;
  v_function oid;
BEGIN
  IF current_user <> 'postgres'
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS role_row
       WHERE role_row.rolname = current_user
         AND role_row.rolsuper
     ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_migration_owner_invalid:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'postgres'
      AND (role_row.rolsuper OR role_row.rolbypassrls)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'service_role'
      AND role_row.rolbypassrls
      AND pg_catalog.has_schema_privilege(role_row.oid, 'public', 'USAGE')
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname IN ('anon', 'authenticated')
  ) <> 2 THEN
    RAISE EXCEPTION 'teskeid_event_identity_required_roles_missing';
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass(
       'public.teskeid_event_expense_participant_sources'
     ) IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('public.expense_shares') IS NULL
     OR pg_catalog.to_regclass('public.expense_obligations') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayment_allocations') IS NULL
     OR pg_catalog.to_regclass('public.expense_member_invitations') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity_audience') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.expense_payment_preferences') IS NULL
     OR pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL
     OR pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL
     OR pg_catalog.to_regclass('public.expense_event_contexts') IS NULL
     OR pg_catalog.to_regclass('public.expense_event_participants') IS NULL
     OR pg_catalog.to_regclass('public.recent_events') IS NULL
     OR pg_catalog.to_regclass('public.otp_ip_rate_limit') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_identity_prerequisites_missing';
  END IF;

  SELECT target.name INTO v_collision
  FROM (VALUES
    ('teskeid_event_guest_invitations'),
    ('teskeid_event_attendance_memberships'),
    ('teskeid_event_attendance_mutation_requests'),
    ('teskeid_event_attendance_delivery_requests'),
    ('teskeid_event_guest_identity_mutation_authorizations'),
    ('teskeid_events_id_owner_key'),
    ('teskeid_event_guests_event_id_id_linked_key'),
    ('teskeid_event_guest_invitations_owner_key'),
    ('teskeid_event_guest_invitations_pending_guest_uidx'),
    ('teskeid_event_guest_invitations_pending_email_uidx'),
    ('teskeid_event_guest_invitations_recipient_pending_idx'),
    ('teskeid_event_guest_invitations_inviter_idx'),
    ('teskeid_event_guest_invitations_expiry_idx'),
    ('teskeid_event_guest_invitations_guest_history_idx'),
    ('teskeid_event_guest_invitations_accepted_user_idx'),
    ('teskeid_event_guests_linked_user_history_idx'),
    ('teskeid_event_guest_invitations_actor_recipient_rate_idx'),
    ('teskeid_event_guest_invitations_decline_cooldown_idx'),
    ('teskeid_event_attendance_memberships_guest_uidx'),
    ('teskeid_event_attendance_memberships_invitation_uidx'),
    ('teskeid_event_attendance_memberships_user_idx'),
    ('teskeid_event_guest_invitations_identity_key'),
    ('teskeid_event_attendance_delivery_invitation_attempt_key'),
    ('teskeid_event_attendance_delivery_requests_invitation_idx'),
    ('teskeid_event_expense_participant_sources_group_member_idx')
  ) AS target(name)
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
  ORDER BY target.name
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_identity_relation_collision:%', v_collision;
  END IF;

  SELECT target.name INTO v_collision
  FROM (VALUES
    ('teskeid_event_attendance_mask_email'),
    ('teskeid_event_attendance_safe_guest_label'),
    ('teskeid_event_attendance_lock_user_emails'),
    ('teskeid_event_attendance_terminalize_invitations'),
    ('teskeid_event_attendance_sweep_expired'),
    ('teskeid_event_attendance_create_pending'),
    ('teskeid_event_assert_session_actor'),
    ('teskeid_event_attendance_begin_response_request'),
    ('teskeid_event_attendance_finish_response_request'),
    ('teskeid_event_guard_attendance_receipt_mutation'),
    ('teskeid_event_guard_identity_authorization_commit'),
    ('teskeid_event_assert_attendance_integrity'),
    ('teskeid_event_attendance_integrity_trigger'),
    ('teskeid_event_create_with_attendance_invitations'),
    ('teskeid_event_replace_roster_with_attendance_invitations'),
    ('teskeid_event_get_guest_attendance_state'),
    ('teskeid_event_invite_guest_attendance'),
    ('teskeid_event_cancel_guest_attendance_invitation'),
    ('teskeid_event_prepare_guest_attendance_delivery'),
    ('teskeid_event_reserve_guest_attendance_delivery'),
    ('teskeid_event_update_guest_attendance_delivery'),
    ('teskeid_event_list_for_actor'),
    ('teskeid_event_get_attendee_view'),
    ('teskeid_event_get_guest_attendance_preview'),
    ('teskeid_event_respond_guest_attendance'),
    ('teskeid_event_leave_attendance'),
    ('teskeid_event_get_expense_member_sources')
  ) AS target(name)
  WHERE EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
      AND procedure_row.proname = target.name
  )
  ORDER BY target.name
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_identity_function_collision:%', v_collision;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'teskeid_event_guest_invitations_touch_updated_at',
      'teskeid_event_attendance_receipts_mutation_guard',
      'teskeid_event_attendance_memberships_integrity_deferred',
      'teskeid_event_guest_invitations_integrity_deferred',
      'teskeid_event_guests_attendance_integrity_deferred',
      'teskeid_event_identity_authorizations_consumed_deferred'
    ) AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_trigger_collision';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guests'
    )
      AND constraint_row.conname = 'teskeid_event_guests_identity_shape_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'checksource_kind=manual_nameandemail_canonicalisnullandlinked_user_idisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andlinked_user_idisnullandrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_shape_constraint_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(constraint_row.oid)
    FROM (VALUES
      ('teskeid_events', 'teskeid_events_pkey', 'primarykeyid'),
      ('teskeid_events', 'teskeid_events_owner_fk',
        'foreignkeyowner_user_idreferencesauth.usersidondeleterestrict'),
      ('teskeid_events', 'teskeid_events_legacy_context_fk',
        'foreignkeylegacy_expense_group_idreferencesexpense_event_contextsgroup_idondeleterestrict'),
      ('teskeid_events', 'teskeid_events_legacy_context_key',
        'uniquelegacy_expense_group_id'),
      ('teskeid_events', 'teskeid_events_name_check',
        'checkteskeid_event_valid_textname,1,160'),
      ('teskeid_events', 'teskeid_events_revision_check',
        'checkroster_revision>0'),
      ('teskeid_events', 'teskeid_events_legacy_id_check',
        'checklegacy_expense_group_idisnullorid=legacy_expense_group_id'),
      ('teskeid_event_guests', 'teskeid_event_guests_pkey', 'primarykeyid'),
      ('teskeid_event_guests', 'teskeid_event_guests_event_id_id_key',
        'uniqueevent_id,id'),
      ('teskeid_event_guests', 'teskeid_event_guests_event_fk',
        'foreignkeyevent_idreferencesteskeid_eventsidondeletecascade'),
      ('teskeid_event_guests', 'teskeid_event_guests_linked_user_fk',
        'foreignkeylinked_user_idreferencesauth.usersidondeletesetnull'),
      ('teskeid_event_guests', 'teskeid_event_guests_relationship_fk',
        'foreignkeyrelationship_idreferencesrelationshipsidondeletesetnull'),
      ('teskeid_event_guests', 'teskeid_event_guests_status_check',
        'checkstatus=anyarray[active,removed]'),
      ('teskeid_event_guests', 'teskeid_event_guests_position_check',
        'checkstatus=activeandposition>=0andposition<=48andremoved_atisnullorstatus=removedandpositionisnullandremoved_atisnotnull'),
      ('teskeid_event_guests', 'teskeid_event_guests_source_check',
        'checksource_kind=anyarray[relationship,manual_name,manual_email]'),
      ('teskeid_event_guests', 'teskeid_event_guests_name_check',
        'checkteskeid_event_valid_textdisplay_name_snapshot,1,120'),
      ('teskeid_event_guests',
        'teskeid_event_guests_identity_shape_check',
        'checksource_kind=manual_nameandemail_canonicalisnullandlinked_user_idisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andlinked_user_idisnullandrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'),
      ('teskeid_event_mutation_requests',
        'teskeid_event_mutation_requests_pkey',
        'primarykeyactor_user_id,request_id'),
      ('teskeid_event_mutation_requests',
        'teskeid_event_mutation_requests_actor_fk',
        'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
      ('teskeid_event_mutation_requests',
        'teskeid_event_mutation_requests_operation_check',
        'checkchar_lengthoperation>=1andchar_lengthoperation<=80'),
      ('teskeid_event_mutation_requests',
        'teskeid_event_mutation_requests_fingerprint_check',
        'checkfingerprint~^[0-9a-f]{32}$'),
      ('teskeid_event_mutation_requests',
        'teskeid_event_mutation_requests_result_check',
        'checkresultisnullorjsonb_typeofresult=objectandoctet_lengthresult<=8192'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_pkey',
        'primarykeyevent_id,expense_id'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_scope_key',
        'uniqueevent_id,group_id,expense_id'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_event_fk',
        'foreignkeyevent_idreferencesteskeid_eventsidondeletecascade'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_expense_fk',
        'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeleterestrict'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_actor_fk',
        'foreignkeylinked_by_user_idreferencesauth.usersidondeletesetnull'),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_revision_check',
        'checklink_revision=1'),
      ('teskeid_event_expense_participant_sources',
        'teskeid_event_expense_sources_pkey',
        'primarykeyevent_id,expense_id,event_guest_id'),
      ('teskeid_event_expense_participant_sources',
        'teskeid_event_expense_sources_link_fk',
        'foreignkeyevent_id,group_id,expense_idreferencesteskeid_event_expense_linksevent_id,group_id,expense_idondeletecascade'),
      ('teskeid_event_expense_participant_sources',
        'teskeid_event_expense_sources_guest_fk',
        'foreignkeyevent_id,event_guest_idreferencesteskeid_event_guestsevent_id,idondeletecascade'),
      ('teskeid_event_expense_participant_sources',
        'teskeid_event_expense_sources_member_fk',
        'foreignkeygroup_id,expense_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict')
    ) AS expected(table_name, constraint_name, exact_definition)
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
           'public.' || expected.table_name
         )
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.convalidated
     AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
       pg_catalog.regexp_replace(
         pg_catalog.pg_get_constraintdef(constraint_row.oid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'
     ), 'public.', '')) = expected.exact_definition
  ) <> 32 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_mutation_requests'),
      pg_catalog.to_regclass('public.teskeid_event_expense_links'),
      pg_catalog.to_regclass(
        'public.teskeid_event_expense_participant_sources'
      )
    )
      AND actual.contype IN ('c', 'f', 'p', 'u', 'x')
  ) <> 32 THEN
    RAISE EXCEPTION 'teskeid_event_identity_sql132_constraint_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(index_row.indexrelid)
    FROM (VALUES
      ('teskeid_events_owner_created_idx', false, false,
        'createindexteskeid_events_owner_created_idxonteskeid_eventsusingbtreeowner_user_id,created_atdesc,iddesc'),
      ('teskeid_event_guests_active_position_uidx', true, true,
        'createuniqueindexteskeid_event_guests_active_position_uidxonteskeid_event_guestsusingbtreeevent_id,positionwherestatus=active'),
      ('teskeid_event_guests_active_linked_uidx', true, true,
        'createuniqueindexteskeid_event_guests_active_linked_uidxonteskeid_event_guestsusingbtreeevent_id,linked_user_idwherestatus=activeandlinked_user_idisnotnull'),
      ('teskeid_event_guests_active_email_uidx', true, true,
        'createuniqueindexteskeid_event_guests_active_email_uidxonteskeid_event_guestsusingbtreeevent_id,email_canonicalwherestatus=activeandemail_canonicalisnotnull'),
      ('teskeid_event_expense_links_expense_uidx', true, false,
        'createuniqueindexteskeid_event_expense_links_expense_uidxonteskeid_event_expense_linksusingbtreeexpense_id'),
      ('teskeid_event_expense_sources_member_uidx', true, false,
        'createuniqueindexteskeid_event_expense_sources_member_uidxonteskeid_event_expense_participant_sourcesusingbtreeevent_id,expense_id,expense_member_id')
    ) AS expected(index_name, unique_index, partial_index, exact_definition)
    LEFT JOIN pg_catalog.pg_index AS index_row
      ON index_row.indexrelid = pg_catalog.to_regclass(
           'public.' || expected.index_name
         )
     AND index_row.indisvalid
     AND index_row.indisready
     AND index_row.indisunique = expected.unique_index
     AND (index_row.indpred IS NOT NULL) = expected.partial_index
     AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
       pg_catalog.regexp_replace(
         pg_catalog.pg_get_indexdef(index_row.indexrelid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'
     ), 'public.', '')) = expected.exact_definition
  ) <> 6 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_index AS actual
    WHERE actual.indrelid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_mutation_requests'),
      pg_catalog.to_regclass('public.teskeid_event_expense_links'),
      pg_catalog.to_regclass(
        'public.teskeid_event_expense_participant_sources'
      )
    )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint AS backing_constraint
        WHERE backing_constraint.conindid = actual.indexrelid
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'teskeid_event_identity_sql132_index_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
      'public.feature_access'
    )
      AND constraint_row.conname = 'feature_access_feature_key_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute.attnum
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_row.conrelid
          AND attribute.attname = 'feature_key'
          AND NOT attribute.attisdropped
      )]::smallint[]
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      ))) = '97736909cf1a3a5432eeb34275cf3cfc'
      AND (
        SELECT pg_catalog.array_agg(
          (match.value)[1] ORDER BY (match.value)[1] COLLATE "C"
        )
        FROM pg_catalog.regexp_matches(
          pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          ), '''([^'']+)''', 'g'
        ) AS match(value)
      ) = ARRAY[
        'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
        'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
        'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
        'tengsl', 'teskeid-routing-v1', 'umonnun',
        'utlagt-og-endurgreitt', 'vedrid',
        'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
        'weather-pulse'
      ]::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.regexp_matches(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          )), E'\\mor\\M', 'g'
        )
      ) = 5
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      )) !~ '(true|false|is null|is not|<>|!=|not |func|feature_key[[:space:]]*=[[:space:]]*feature_key|(^|[^a-z])(and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_feature_constraint_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_events'),
      ('teskeid_event_guests'),
      ('teskeid_event_mutation_requests'),
      ('teskeid_event_expense_links'),
      ('teskeid_event_expense_participant_sources')
    ) AS expected(table_name)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
     AND relation.relkind = 'r'
     AND relation.relrowsecurity
     AND relation.relforcerowsecurity
     AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
     AND NOT pg_catalog.has_table_privilege(
       'anon', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_table_privilege(
       'authenticated', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_table_privilege(
       'service_role', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'anon', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'authenticated', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'service_role', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid = relation.oid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(
         relation.relacl, pg_catalog.acldefault('r', relation.relowner)
       )) AS privilege
       WHERE privilege.grantee <> relation.relowner
          OR privilege.is_grantable
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (privilege.grantee <> relation.relowner OR privilege.is_grantable)
     )
  ) <> 5 THEN
    RAISE EXCEPTION 'teskeid_event_identity_sql132_table_acl_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guests'
    )
      AND trigger_row.tgname = 'teskeid_event_guests_update_guard'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.teskeid_event_guard_guest_update()'
      )
      AND trigger_row.tgtype = 19::smallint
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_guest_trigger_drift';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.normalize_email_canonical(text)', 'text',
        '3083103976aa8cb3780937b9da1be236', false, true, 'empty'),
      ('public.teskeid_event_normalize_text(text)', 'text',
        'ced5cfb2427fe7331f4416497614f7d1', true, false, 'empty'),
      ('public.teskeid_event_valid_text(text,integer,integer)', 'boolean',
        '28c80b083a90683f15fd04f4d7d547d1', true, false, 'empty'),
      ('public.teskeid_event_uuid_from_text(text)', 'uuid',
        '27229cbc71c621e5a8592265b07f874d', true, false, 'empty'),
      ('public.teskeid_event_has_access(uuid)', 'boolean',
        '7b69311a107381a1891da01c32780f5f', true, false, 'empty'),
      ('public.teskeid_event_assert_actor(uuid)', 'void',
        '9dd7c34f6cc6c78131e7ebbb9a718ea4', true, false, 'empty'),
      ('public.teskeid_event_assert_financial_actor(uuid)', 'void',
        '7f6ced4f5e7472aff27d9a6d5c624355', true, false, 'empty'),
      ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', 'jsonb',
        '4e70b62a5fa28cfe2b884d703935a16c', true, false, 'empty'),
      ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'void',
        'eaa006157dc5377e0ae1f8979651f8aa', true, false, 'empty'),
      ('public.teskeid_event_assert_roster(uuid)', 'void',
        '644432e94fb9b27e434403d84d32db4b', true, false, 'empty'),
      ('public.teskeid_event_roster_integrity_trigger()', 'trigger',
        'e3f28f3ef917e7eca8766de4dc35bed0', true, false, 'empty'),
      ('public.teskeid_event_touch_updated_at()', 'trigger',
        'bb0914d96897242328a9ade9661bf1a7', true, false, 'empty'),
      ('public.teskeid_event_guard_event_update()', 'trigger',
        'd536d617b6bc13a556c39ad2ec0948e7', true, false, 'empty'),
      ('public.teskeid_event_guard_guest_update()', 'trigger',
        '889aa5388d3000147c811c35d990562e', true, false, 'empty'),
      ('public.teskeid_event_guard_receipt_mutation()', 'trigger',
        'abbca6ba554f3a1d0d4d71b9918d2abd', true, false, 'empty'),
      ('public.teskeid_event_assert_expense_link(uuid,uuid,uuid)', 'void',
        'a4e3a67ed697f395b8b5a2740b879f63', true, false, 'empty'),
      ('public.teskeid_event_expense_link_integrity_trigger()', 'trigger',
        '8709da16e3724ca30f3da159c9d0eed9', true, false, 'empty'),
      ('public.teskeid_event_financial_parent_integrity_trigger()', 'trigger',
        'c1ad7695de1c73a5c08eb02a9b3aa7f4', true, false, 'empty'),
      ('public.teskeid_event_immutable_history()', 'trigger',
        'f50c07cc5132e30f93aad4e5bdde806c', true, false, 'empty'),
      ('public.teskeid_event_create(uuid,uuid,text,jsonb)', 'jsonb',
        '9129bb5800d742b5f3f9ab09c3f196fb', true, true, 'empty'),
      ('public.teskeid_event_list(uuid)', 'record',
        '8fc1eebd38b5499edc9204991529d2a4', true, true, 'empty'),
      ('public.teskeid_event_get(uuid,uuid)', 'jsonb',
        '5ca3a5428bd45a41b170edf76577d8ca', true, true, 'empty'),
      ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)', 'jsonb',
        'b6f8566f735fc02be284d17aeca68b62', true, true, 'empty'),
      ('public.teskeid_event_list_expense_sources(uuid)', 'jsonb',
        '784451720df975223032ed426f21b869', true, true, 'empty'),
      ('public.teskeid_event_get_expense_source(uuid,uuid)', 'jsonb',
        '0c3511019afdb7918c15dc325dec2759', true, true, 'empty'),
      ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', 'jsonb',
        'f91e0b44f3997b931126e2c827367d76', true, true, 'empty'),
      ('public.teskeid_event_get_expense_preview(uuid,uuid)', 'jsonb',
        '6032a2b98aceda4d5c146467cc96c6d8', true, true, 'empty'),
      ('public.expense_create_event_context(uuid,uuid,text,jsonb)', 'jsonb',
        'ea94b1c0d070ac44bf3c64c2b16b699e', true, true, 'empty'),
      ('public.expense_assert_beta_actor(uuid)', 'void',
        'ea6c329f5c13bd7d0bfbd9df41e5931d', true, false, 'empty'),
      ('public.expense_begin_request(uuid,uuid,text,text)', 'jsonb',
        'd8631d60cc2f0df56dd9e958537db2a7', true, false, 'empty'),
      ('public.expense_finish_request(uuid,uuid,jsonb)', 'void',
        '194c5812642b4aaaafe888bc0ba5aa29', true, false, 'empty'),
      ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)', 'jsonb',
        '1cdc6208ab4cc926fa9b1e6b6182aab1', true, true, 'empty'),
      ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)', 'uuid',
        'ad3e4ade2c93001e2a8b2180288107a5', true, false, 'empty'),
      ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', 'jsonb',
        '536efe2584ce8b45ad8ecacf5574dfd4', true, true, 'empty'),
      ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'jsonb',
        'ad0fd30363a3c9f5d8e7b51be6f1bfa2', true, true, 'pg_public'),
      ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)', 'uuid',
        '5e47f31edbe4f0550f07e7b65f79e5af', true, false, 'empty'),
      ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'jsonb',
        '4ab3fda8e416a10560504cf50b175ca3', true, true, 'empty'),
      ('public.expense_terminalize_member_invitations(uuid[],text)', 'integer',
        '483db189da284fb0e2e7b40a0e774f11', true, false, 'empty'),
      ('public.expense_has_beta_access(uuid)', 'boolean',
        'ebe4628dbda84e79b395c9da0ae39899', true, false, 'empty'),
      ('public.expense_active_member_role(uuid,uuid)', 'text',
        'b25f994a64dde4a3f94ec8bad8535b17', true, false, 'empty'),
      ('public.expense_reported_repayments_need_review(uuid)', 'boolean',
        '5746ec747ae675e4bc99119b0833cc9f', true, false, 'empty'),
      ('public.expense_group_balances(uuid,boolean)', 'record',
        'f257b83aefd92169687ab2a516da24d9', true, false, 'empty'),
      ('public.expense_simplified_settlement(uuid,text,boolean)', 'record',
        'fe9016a12b1ac987b3b00f314c800c89', true, false, 'empty'),
      ('public.expense_guard_new_reported_repayment()', 'trigger',
        '2a1b9b3bc481b522724aa45e6febc172', true, false, 'empty'),
      ('public.expense_touch_updated_at()', 'trigger',
        '5bdc21b8fa8fb1231bdb021e09a5bc8e', false, false, 'empty'),
      ('public.expense_attach_encrypted_payment_snapshot()', 'trigger',
        '711bcb8e3e204e2164d58849a84fe5a5', true, false, 'empty'),
      ('public.expense_guard_settlement_batch_mutation()', 'trigger',
        '3e6cdede1440af689f0ea00ae909e99d', true, false, 'empty'),
      ('public.expense_guard_settlement_batch_item_mutation()', 'trigger',
        '41d3eab8ea4fc3d4f17da22e0086031f', true, false, 'empty'),
      ('public.expense_guard_batch_repayment_mutation()', 'trigger',
        '7a7c0e5e23944e060509a0ae4cdbb728', true, false, 'empty'),
      ('public.expense_cancel_batches_before_user_unlink()', 'trigger',
        '309e995f2078ea44b35430785fcc121a', true, false, 'empty'),
      ('public.expense_record_settlement_batch_activity(uuid,uuid,uuid,text)', 'uuid',
        'd751cf49def7888821fae86730ec2c53', true, false, 'empty'),
      ('public.expense_insert_settlement_batch_item(uuid,integer,uuid,uuid,uuid,text,bigint,text,date,text,uuid)', 'uuid',
        'ba68cffeba62f462a518fa97fc137d46', true, false, 'empty'),
      ('public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)', 'jsonb',
        '804c8b2b4565b72b2ad07a8b2fb5328f', true, true, 'empty'),
      ('public.expense_transition_settlement_batch(uuid,uuid,text,uuid)', 'jsonb',
        'f7bce33d51b0cef08b8ce39984d046d9', true, true, 'empty'),
      ('public.expense_event_valid_label(text,integer,integer)', 'boolean',
        '17e566582027334d68b4106493b44abf', true, false, 'empty'),
      ('public.expense_event_has_beta_access(uuid)', 'boolean',
        '2354b817c135e94ba6f651a3c124938a', true, false, 'empty'),
      ('public.expense_event_assert_actor(uuid)', 'void',
        'e2ec7008b57e628adf5aa21af6f5573d', true, false, 'empty'),
      ('public.expense_event_assert_integrity(uuid)', 'void',
        'de867d4dd1d0afb6a9be11f66c1d3f9e', true, false, 'empty'),
      ('public.expense_event_integrity_trigger()', 'trigger',
        '51528b525bb574dd67a82e8a1b6cebdc', true, false, 'empty'),
      ('public.expense_event_group_integrity_trigger()', 'trigger',
        '34366fafe3a1faccba50632ac241083a', true, false, 'empty'),
      ('public.expense_event_context_immutable()', 'trigger',
        'd72317fdea310e90c1a46fb8aeb4b88a', true, false, 'empty'),
      ('public.expense_event_participant_immutable()', 'trigger',
        '9953d3c479075a608853c3d61c058c5d', true, false, 'empty'),
      ('public.expense_event_roster_frozen()', 'trigger',
        'c72c6b904c6d1fac619bda62b2677d4c', true, false, 'empty'),
      ('public.expense_event_invitation_blocked()', 'trigger',
        'af2dc14f2a96195f48dcd2eaa00e454d', true, false, 'empty'),
      ('public.expense_list_event_contexts(uuid)', 'record',
        'c737a057a019a45b32d553c8a9a34935', true, true, 'empty'),
      ('public.expense_get_event_context(uuid,uuid)', 'jsonb',
        '6ea385edacafacccced825d0d39ccfeb', true, true, 'empty'),
      ('public.expense_is_event_context(uuid,uuid)', 'boolean',
        '73d299e648e224c45e71e67753a1abb6', true, true, 'empty'),
      ('public.expense_prepare_account_deletion(uuid)', 'jsonb',
        'ddaf4745ab92546e65697c5f6cd59075', true, true, 'empty'),
      ('public.check_and_increment_ip_rate_limit(text,date,integer)', 'boolean',
        'b9be1160205c288d653a9f4ac2b7f9ee', true, true, 'public')
    ) AS expected(
      signature, return_type, source_md5, security_definer,
      service_execute, search_path_kind
    )
  LOOP
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = pg_catalog.split_part(
          pg_catalog.split_part(v_expected.signature, '(', 1), '.', 2
        )
    ) <> 1 THEN
      RAISE EXCEPTION 'teskeid_event_identity_dependency_overload_drift:%',
        v_expected.signature;
    END IF;

    v_function := pg_catalog.to_regprocedure(v_expected.signature);
    IF v_function IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_function
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = pg_catalog.to_regtype(
          v_expected.return_type
        )
        AND CASE
          WHEN v_expected.return_type = 'record' THEN
            procedure_row.proretset
            AND pg_catalog.pg_get_function_result(procedure_row.oid) = CASE
              WHEN v_expected.signature =
                'public.teskeid_event_list(uuid)'
                THEN 'TABLE(event_id uuid, name text, active_guest_count integer, roster_revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone)'
              WHEN v_expected.signature =
                'public.expense_group_balances(uuid,boolean)'
                THEN 'TABLE(member_id uuid, currency text, amount_minor bigint)'
              WHEN v_expected.signature =
                'public.expense_simplified_settlement(uuid,text,boolean)'
                THEN 'TABLE(from_member_id uuid, to_member_id uuid, amount_minor bigint, currency text)'
              WHEN v_expected.signature =
                'public.expense_list_event_contexts(uuid)'
                THEN 'TABLE(event_id uuid, name text, participant_count integer, expense_count integer, created_at timestamp with time zone)'
              ELSE NULL
            END
          ELSE
            NOT procedure_row.proretset
            AND pg_catalog.pg_get_function_result(procedure_row.oid) =
              v_expected.return_type
        END
        AND CASE
          WHEN v_expected.service_execute THEN
            pg_catalog.pg_get_function_arguments(procedure_row.oid) = CASE
              WHEN v_expected.signature =
                'public.normalize_email_canonical(text)'
                THEN 'p_email text'
              WHEN v_expected.signature =
                'public.teskeid_event_create(uuid,uuid,text,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb'
              WHEN v_expected.signature = 'public.teskeid_event_list(uuid)'
                THEN 'p_actor_id uuid'
              WHEN v_expected.signature =
                'public.teskeid_event_get(uuid,uuid)'
                THEN 'p_actor_id uuid, p_event_id uuid'
              WHEN v_expected.signature =
                'public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)'
                THEN 'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb'
              WHEN v_expected.signature =
                'public.teskeid_event_list_expense_sources(uuid)'
                THEN 'p_actor_id uuid'
              WHEN v_expected.signature =
                'public.teskeid_event_get_expense_source(uuid,uuid)'
                THEN 'p_actor_id uuid, p_event_id uuid'
              WHEN v_expected.signature =
                'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb'
              WHEN v_expected.signature =
                'public.teskeid_event_get_expense_preview(uuid,uuid)'
                THEN 'p_actor_id uuid, p_event_id uuid'
              WHEN v_expected.signature =
                'public.expense_create_event_context(uuid,uuid,text,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_name text, p_participants jsonb'
              WHEN v_expected.signature =
                'public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_name text, p_description text, p_emoji text, p_default_currency text, p_default_include_creator boolean, p_members jsonb'
              WHEN v_expected.signature =
                'public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb'
              WHEN v_expected.signature =
                'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_known_relationship_members jsonb DEFAULT ''[]''::jsonb'
              WHEN v_expected.signature =
                'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
                THEN 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_participant_invitations jsonb DEFAULT ''[]''::jsonb'
              WHEN v_expected.signature =
                'public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)'
                THEN 'p_actor_id uuid, p_anchor_group_id uuid, p_anchor_from_member_id uuid, p_anchor_to_member_id uuid, p_currency text, p_expected_contexts jsonb, p_expected_profile_id uuid, p_expected_profile_version bigint, p_expected_profile_state_token text, p_cash_minor bigint, p_use_offset boolean, p_occurred_on date, p_note text, p_request_id uuid'
              WHEN v_expected.signature =
                'public.expense_transition_settlement_batch(uuid,uuid,text,uuid)'
                THEN 'p_actor_id uuid, p_batch_id uuid, p_action text, p_request_id uuid'
              WHEN v_expected.signature =
                'public.expense_list_event_contexts(uuid)'
                THEN 'p_actor_id uuid'
              WHEN v_expected.signature =
                'public.expense_get_event_context(uuid,uuid)'
                THEN 'p_actor_id uuid, p_event_id uuid'
              WHEN v_expected.signature =
                'public.expense_is_event_context(uuid,uuid)'
                THEN 'p_actor_id uuid, p_group_id uuid'
              WHEN v_expected.signature =
                'public.expense_prepare_account_deletion(uuid)'
                THEN 'p_user_id uuid'
              WHEN v_expected.signature =
                'public.check_and_increment_ip_rate_limit(text,date,integer)'
                THEN 'p_ip_hash text, p_window_date date, p_max_requests integer'
              ELSE NULL
            END
          ELSE CASE
            WHEN v_expected.signature =
              'public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)'
              THEN pg_catalog.pg_get_function_arguments(procedure_row.oid) =
                'p_group_id uuid, p_actor_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_summary_code text, p_expense_title text DEFAULT NULL::text, p_group_title text DEFAULT NULL::text, p_extra_user_ids uuid[] DEFAULT ARRAY[]::uuid[], p_project_recent boolean DEFAULT true'
            WHEN v_expected.signature =
              'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
              THEN pg_catalog.pg_get_function_arguments(procedure_row.oid) =
                'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_recipient_email text DEFAULT NULL::text, p_relationship_id uuid DEFAULT NULL::uuid, p_participant_source text DEFAULT ''guest_link''::text'
            WHEN v_expected.signature =
              'public.expense_group_balances(uuid,boolean)'
              THEN pg_catalog.pg_get_function_arguments(procedure_row.oid) =
                'p_group_id uuid, p_include_reported boolean DEFAULT false'
            WHEN v_expected.signature =
              'public.expense_simplified_settlement(uuid,text,boolean)'
              THEN pg_catalog.pg_get_function_arguments(procedure_row.oid) =
                'p_group_id uuid, p_currency text, p_include_reported boolean DEFAULT true'
            ELSE procedure_row.pronargdefaults = 0
          END
        END
        AND procedure_row.prosecdef = v_expected.security_definer
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_expected.source_md5
        AND (
          SELECT language_row.lanname
          FROM pg_catalog.pg_language AS language_row
          WHERE language_row.oid = procedure_row.prolang
        ) = CASE WHEN v_expected.signature IN (
          'public.normalize_email_canonical(text)',
          'public.teskeid_event_normalize_text(text)',
          'public.teskeid_event_valid_text(text,integer,integer)',
          'public.teskeid_event_uuid_from_text(text)',
          'public.teskeid_event_has_access(uuid)',
          'public.expense_has_beta_access(uuid)',
          'public.expense_active_member_role(uuid,uuid)',
          'public.expense_reported_repayments_need_review(uuid)',
          'public.expense_group_balances(uuid,boolean)',
          'public.expense_event_valid_label(text,integer,integer)',
          'public.expense_event_has_beta_access(uuid)'
        ) THEN 'sql' ELSE 'plpgsql' END
        AND procedure_row.provolatile = CASE
          WHEN v_expected.signature IN (
            'public.normalize_email_canonical(text)',
            'public.teskeid_event_normalize_text(text)',
            'public.teskeid_event_valid_text(text,integer,integer)',
            'public.teskeid_event_uuid_from_text(text)',
            'public.expense_event_valid_label(text,integer,integer)'
          ) THEN 'i'::"char"
          WHEN v_expected.signature IN (
            'public.teskeid_event_has_access(uuid)',
            'public.teskeid_event_assert_actor(uuid)',
            'public.teskeid_event_assert_financial_actor(uuid)',
            'public.teskeid_event_list(uuid)',
            'public.teskeid_event_get(uuid,uuid)',
            'public.teskeid_event_list_expense_sources(uuid)',
            'public.teskeid_event_get_expense_source(uuid,uuid)',
            'public.teskeid_event_get_expense_preview(uuid,uuid)',
            'public.expense_assert_beta_actor(uuid)',
            'public.expense_has_beta_access(uuid)',
            'public.expense_active_member_role(uuid,uuid)',
            'public.expense_reported_repayments_need_review(uuid)',
            'public.expense_group_balances(uuid,boolean)',
            'public.expense_simplified_settlement(uuid,text,boolean)',
            'public.expense_event_has_beta_access(uuid)',
            'public.expense_event_assert_actor(uuid)',
            'public.expense_list_event_contexts(uuid)',
            'public.expense_get_event_context(uuid,uuid)',
            'public.expense_is_event_context(uuid,uuid)'
          ) THEN 's'::"char" ELSE 'v'::"char" END
        AND procedure_row.proparallel = CASE
          WHEN v_expected.signature =
            'public.normalize_email_canonical(text)'
            THEN 's'::"char" ELSE 'u'::"char" END
        AND procedure_row.proisstrict = (
          v_expected.signature = 'public.normalize_email_canonical(text)'
        )
        AND NOT procedure_row.proleakproof
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND CASE v_expected.search_path_kind
          WHEN 'public' THEN procedure_row.proconfig[1] = 'search_path=public'
          WHEN 'pg_public' THEN procedure_row.proconfig[1] =
            'search_path=pg_catalog, public'
          ELSE procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        END
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_expected.service_execute
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
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
        )
    ) THEN
      RAISE EXCEPTION 'teskeid_event_identity_dependency_acl_drift:%',
        v_expected.signature;
    END IF;
  END LOOP;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('teskeid_events', 'teskeid_events_touch_updated_at',
        'public.teskeid_event_touch_updated_at()', false, 19::smallint),
      ('teskeid_event_guests', 'teskeid_event_guests_touch_updated_at',
        'public.teskeid_event_touch_updated_at()', false, 19::smallint),
      ('teskeid_events', 'teskeid_events_update_guard',
        'public.teskeid_event_guard_event_update()', false, 19::smallint),
      ('teskeid_event_guests', 'teskeid_event_guests_update_guard',
        'public.teskeid_event_guard_guest_update()', false, 19::smallint),
      ('teskeid_event_mutation_requests',
        'teskeid_event_receipts_mutation_guard',
        'public.teskeid_event_guard_receipt_mutation()', false, 27::smallint),
      ('teskeid_event_guests', 'teskeid_event_guests_roster_deferred',
        'public.teskeid_event_roster_integrity_trigger()', true, 29::smallint),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_integrity_deferred',
        'public.teskeid_event_expense_link_integrity_trigger()', true,
        21::smallint),
      ('expense_groups', 'teskeid_event_expense_groups_integrity_deferred',
        'public.teskeid_event_financial_parent_integrity_trigger()', true,
        25::smallint),
      ('expenses', 'teskeid_event_expenses_integrity_deferred',
        'public.teskeid_event_financial_parent_integrity_trigger()', true,
        29::smallint),
      ('expense_group_members',
        'teskeid_event_expense_members_integrity_deferred',
        'public.teskeid_event_financial_parent_integrity_trigger()', true,
        25::smallint),
      ('teskeid_event_expense_links',
        'teskeid_event_expense_links_immutable_guard',
        'public.teskeid_event_immutable_history()', false, 19::smallint),
      ('teskeid_event_expense_participant_sources',
        'teskeid_event_expense_sources_immutable_guard',
        'public.teskeid_event_immutable_history()', false, 19::smallint),
      ('expense_groups', 'expense_groups_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_group_members', 'expense_group_members_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expenses', 'expenses_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_repayments', 'expense_repayments_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_member_invitations',
        'expense_member_invitations_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_repayments', 'expense_repayments_encrypted_snapshot',
        'public.expense_attach_encrypted_payment_snapshot()', false,
        7::smallint),
      ('expense_event_contexts', 'expense_event_context_integrity_deferred',
        'public.expense_event_integrity_trigger()', true, 29::smallint),
      ('expense_event_participants',
        'expense_event_participant_integrity_deferred',
        'public.expense_event_integrity_trigger()', true, 29::smallint),
      ('expense_groups', 'expense_event_group_integrity_deferred',
        'public.expense_event_group_integrity_trigger()', true, 25::smallint),
      ('expense_event_contexts', 'expense_event_context_immutable_guard',
        'public.expense_event_context_immutable()', false, 19::smallint),
      ('expense_event_participants',
        'expense_event_participant_immutable_guard',
        'public.expense_event_participant_immutable()', false, 19::smallint),
      ('expense_group_members', 'expense_event_group_members_frozen_guard',
        'public.expense_event_roster_frozen()', false, 31::smallint),
      ('expense_member_invitations',
        'expense_event_member_invitations_guard',
        'public.expense_event_invitation_blocked()', false, 23::smallint),
      ('expense_repayments', 'expense_repayments_review_guard',
        'public.expense_guard_new_reported_repayment()', false, 7::smallint),
      ('expense_repayments', 'expense_repayments_batch_guard',
        'public.expense_guard_batch_repayment_mutation()', false, 19::smallint),
      ('expense_settlement_batches',
        'expense_settlement_batches_touch_updated_at',
        'public.expense_touch_updated_at()', false, 19::smallint),
      ('expense_settlement_batches',
        'expense_settlement_batches_immutable_guard',
        'public.expense_guard_settlement_batch_mutation()', false,
        27::smallint),
      ('expense_settlement_batch_items',
        'expense_settlement_batch_items_immutable_guard',
        'public.expense_guard_settlement_batch_item_mutation()', false,
        27::smallint),
      ('expense_group_members',
        'expense_group_members_cancel_batches_before_unlink',
        'public.expense_cancel_batches_before_user_unlink()', false,
        19::smallint)
    ) AS expected(
      table_name, trigger_name, function_signature, deferred, trigger_type
    )
  LOOP
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass(
              'public.' || v_expected.table_name
            )
        AND trigger_row.tgname = v_expected.trigger_name
        AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
              v_expected.function_signature
            )
        AND trigger_row.tgdeferrable = v_expected.deferred
        AND trigger_row.tginitdeferred = v_expected.deferred
        AND trigger_row.tgtype = v_expected.trigger_type
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
          pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            pg_catalog.pg_get_triggerdef(trigger_row.oid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'), 'public.', ''
        ))) = CASE v_expected.trigger_name
          WHEN 'teskeid_events_touch_updated_at' THEN '573d2130576e33a2e0051aa5a53ee8da'
          WHEN 'teskeid_event_guests_touch_updated_at' THEN '6ab521c4a591f84b98ec4e9fcf510284'
          WHEN 'teskeid_events_update_guard' THEN '6f89ed31bd0f8ccd4287b2e45c52af60'
          WHEN 'teskeid_event_guests_update_guard' THEN 'c95d9d09d7ea3561f953ffb95cb811da'
          WHEN 'teskeid_event_receipts_mutation_guard' THEN '848754f56bd8a534919b139b3f0cc458'
          WHEN 'teskeid_event_guests_roster_deferred' THEN '4b8716b13b134e7d6832c117af96515c'
          WHEN 'teskeid_event_expense_links_integrity_deferred' THEN 'b894a0a3b041c416aebd9a71a873f627'
          WHEN 'teskeid_event_expense_groups_integrity_deferred' THEN 'bc5cf7c042812deacfd2f794d65a5f86'
          WHEN 'teskeid_event_expenses_integrity_deferred' THEN '561df7a8c634e5d2bab26bdb9b2936d6'
          WHEN 'teskeid_event_expense_members_integrity_deferred' THEN '5d0863a8c09e3d8b7262515e39384045'
          WHEN 'teskeid_event_expense_links_immutable_guard' THEN 'c104d270839920cbef7d54860efedc13'
          WHEN 'teskeid_event_expense_sources_immutable_guard' THEN '79d1621908f82e44486623f230a83ac4'
          WHEN 'expense_groups_touch_updated_at' THEN 'd45bd188fa0176d4fa61c63cb424c009'
          WHEN 'expense_group_members_touch_updated_at' THEN 'ccc0eb4a0b013ad4c986f5341287e413'
          WHEN 'expenses_touch_updated_at' THEN 'ca572fab2b75ee46c873836490a644d4'
          WHEN 'expense_repayments_touch_updated_at' THEN 'b0eecd854d61f45803dbdd499aae8045'
          WHEN 'expense_member_invitations_touch_updated_at' THEN 'a3e6713cf26d93675d048d8f65b9bf6c'
          WHEN 'expense_repayments_encrypted_snapshot' THEN 'e5c03e7b03c09a6ab927f1715b4acd95'
          WHEN 'expense_event_context_integrity_deferred' THEN '7c8cbb816f61c1939189e112347fd0ad'
          WHEN 'expense_event_participant_integrity_deferred' THEN '34ef57122946b539ddb2561776d1c578'
          WHEN 'expense_event_group_integrity_deferred' THEN 'b36feb66029f7227ffeeb8815917e555'
          WHEN 'expense_event_context_immutable_guard' THEN '6f320f1e7e7dfb5e5bd81bc2a7a80846'
          WHEN 'expense_event_participant_immutable_guard' THEN '796bd35e3b8578b04f946a596e8fbf56'
          WHEN 'expense_event_group_members_frozen_guard' THEN '7745e7a8d3e0c9725504c4bafbed5138'
          WHEN 'expense_event_member_invitations_guard' THEN 'e6a83614273083bd2d0cea63f0a3b0a2'
          WHEN 'expense_repayments_review_guard' THEN 'e415e6473a9d8c79dcaafd2e18ddb1d9'
          WHEN 'expense_repayments_batch_guard' THEN 'f48761fb749274d9eeb44338f7513816'
          WHEN 'expense_settlement_batches_touch_updated_at' THEN '4e51b9bef5ccbb179133953b79fb4a8a'
          WHEN 'expense_settlement_batches_immutable_guard' THEN '974c27452bc0ed04baca1d867165a593'
          WHEN 'expense_settlement_batch_items_immutable_guard' THEN 'dbf47d9dbb0356750956625ff907bb67'
          WHEN 'expense_group_members_cancel_batches_before_unlink' THEN '4c18ef1467d6fdbb22c1f4b0fbd1ef4e'
          ELSE NULL END
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
        AND CASE WHEN v_expected.trigger_name =
          'expense_group_members_cancel_batches_before_unlink' THEN (
            pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 1
            AND
            pg_catalog.strpos(pg_catalog.pg_get_triggerdef(trigger_row.oid),
              'UPDATE OF user_id') > 0
            AND trigger_row.tgqual IS NOT NULL
          ) ELSE pg_catalog.cardinality(
            trigger_row.tgattr::smallint[]
          ) = 0
            AND trigger_row.tgqual IS NULL END
    ) <> 1 THEN
      RAISE EXCEPTION 'teskeid_event_identity_dependency_trigger_drift:%',
        v_expected.trigger_name;
    END IF;
  END LOOP;
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_mutation_requests'),
      pg_catalog.to_regclass('public.teskeid_event_expense_links'),
      pg_catalog.to_regclass(
        'public.teskeid_event_expense_participant_sources'
      ),
      pg_catalog.to_regclass('public.expense_groups'),
      pg_catalog.to_regclass('public.expenses'),
      pg_catalog.to_regclass('public.expense_group_members'),
      pg_catalog.to_regclass('public.expense_member_invitations'),
      pg_catalog.to_regclass('public.expense_repayments'),
      pg_catalog.to_regclass('public.expense_settlement_batches'),
      pg_catalog.to_regclass('public.expense_settlement_batch_items'),
      pg_catalog.to_regclass('public.expense_event_contexts'),
      pg_catalog.to_regclass('public.expense_event_participants')
    ) AND NOT trigger_row.tgisinternal
  ) <> 31 THEN
    RAISE EXCEPTION 'teskeid_event_identity_legacy_event_trigger_drift';
  END IF;
END;
$teskeid_event_attendance_preconditions$;

-- Constant-memory content attestation for every existing Event row and the
-- canonical financial/history relations that SQL133 must not rewrite. Two
-- independently seeded 64-bit row hashes are summed as numeric values. The
-- REPEATABLE READ transaction makes the before/final comparison one snapshot
-- without ordered string aggregation, temp-file sorts or a 1GB varlena risk.
CREATE TEMP TABLE pg_temp.teskeid_event_identity_attestation (
  relation_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  content_digest text NOT NULL
) ON COMMIT DROP;

DO $teskeid_event_identity_snapshot$
DECLARE
  v_relation text;
  v_count bigint;
  v_digest text;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY[
    'teskeid_events',
    'teskeid_event_guests',
    'teskeid_event_mutation_requests',
    'teskeid_event_expense_links',
    'teskeid_event_expense_participant_sources',
    'expense_groups',
    'expense_group_members',
    'expenses',
    'expense_payments',
    'expense_shares',
    'expense_obligations',
    'expense_repayments',
    'expense_repayment_allocations',
    'expense_member_invitations',
    'expense_activity',
    'expense_activity_audience',
    'expense_mutation_requests',
    'expense_payment_preferences',
    'expense_settlement_batches',
    'expense_settlement_batch_items',
    'expense_event_contexts',
    'expense_event_participants',
    'recent_events'
  ]::text[] LOOP
    EXECUTE pg_catalog.format(
      'SELECT pg_catalog.count(*), pg_catalog.md5('
      || 'pg_catalog.count(*)::text || '':'' || '
      || 'COALESCE(pg_catalog.sum(pg_catalog.hashtextextended('
      || 'pg_catalog.to_jsonb(row_value)::text, 13311)::numeric), 0)::text '
      || '|| '':'' || COALESCE(pg_catalog.sum(pg_catalog.hashtextextended('
      || 'pg_catalog.to_jsonb(row_value)::text, 13312)::numeric), 0)::text) '
      || 'FROM public.%I AS row_value',
      v_relation
    ) INTO v_count, v_digest;
    INSERT INTO pg_temp.teskeid_event_identity_attestation (
      relation_name, row_count, content_digest
    ) VALUES (v_relation, v_count, v_digest);
  END LOOP;
END;
$teskeid_event_identity_snapshot$;

-- SQL132 owner RPCs remain byte-for-byte intact. SQL133 is additive at the
-- app boundary and broadens only the private guest identity invariant needed
-- after an exact-recipient attendance acceptance.
ALTER TABLE public.teskeid_events
  ADD CONSTRAINT teskeid_events_id_owner_key
  UNIQUE (id, owner_user_id);

ALTER TABLE public.teskeid_event_guests
  ADD CONSTRAINT teskeid_event_guests_event_id_id_linked_key
  UNIQUE (event_id, id, linked_user_id);

ALTER TABLE public.teskeid_event_guests
  DROP CONSTRAINT teskeid_event_guests_identity_shape_check;

ALTER TABLE public.teskeid_event_guests
  ADD CONSTRAINT teskeid_event_guests_identity_shape_check CHECK (
    (
      source_kind = 'manual_name'
      AND email_canonical IS NULL
      AND relationship_id IS NULL
    )
    OR (
      source_kind = 'manual_email'
      AND email_canonical IS NOT NULL
      AND email_canonical = public.normalize_email_canonical(email_canonical)
      AND public.teskeid_event_valid_text(email_canonical, 3, 320)
      AND email_canonical ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND relationship_id IS NULL
    )
    OR (
      source_kind = 'relationship'
      AND email_canonical IS NULL
    )
  ) NOT VALID;

ALTER TABLE public.teskeid_event_guests
  VALIDATE CONSTRAINT teskeid_event_guests_identity_shape_check;

CREATE TABLE public.teskeid_event_guest_invitations (
  id                            uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_id                      uuid        NOT NULL,
  event_guest_id                uuid        NOT NULL,
  invited_by                    uuid        NOT NULL,
  invitation_kind               text        NOT NULL,
  accepted_user_id              uuid        NULL,
  recipient_email_canonical     text        NULL,
  recipient_hash                text        NULL,
  actor_recipient_rate_hash     text        NULL,
  actor_total_rate_hash         text        NULL,
  recipient_label_snapshot      text        NOT NULL,
  event_name_snapshot           text        NOT NULL,
  guest_display_name_snapshot   text        NULL,
  inviter_display_name_snapshot text        NULL,
  status                        text        NOT NULL DEFAULT 'pending',
  email_template_version        text        NOT NULL DEFAULT 'event-attendance-v1',
  attempt_number                integer     NOT NULL DEFAULT 0,
  attempt_status                text        NULL,
  attempt_at                    timestamptz NULL,
  email_sent_at                 timestamptz NULL,
  accepted_at                   timestamptz NULL,
  terminal_at                   timestamptz NULL,
  expires_at                    timestamptz NOT NULL DEFAULT (
    pg_catalog.now() + interval '30 days'
  ),
  created_at                    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at                    timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_guest_invitations_event_guest_fk
    FOREIGN KEY (event_id, event_guest_id)
    REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_guest_invitations_owner_fk
    FOREIGN KEY (event_id, invited_by)
    REFERENCES public.teskeid_events(id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_guest_invitations_accepted_user_fk
    FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT teskeid_event_guest_invitations_identity_key
    UNIQUE (id, event_id, event_guest_id, accepted_user_id),
  CONSTRAINT teskeid_event_guest_invitations_owner_key
    UNIQUE (id, invited_by),
  CONSTRAINT teskeid_event_guest_invitations_kind_check
    CHECK (invitation_kind = ANY (ARRAY[
      'access_only'::text, 'identity_and_access'::text
    ])),
  CONSTRAINT teskeid_event_guest_invitations_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text, 'accepted'::text, 'declined'::text,
      'cancelled'::text, 'expired'::text, 'left'::text, 'revoked'::text
    ])),
  CONSTRAINT teskeid_event_guest_invitations_hash_bundle_check CHECK (
    (
      recipient_hash IS NULL
      AND actor_recipient_rate_hash IS NULL
      AND actor_total_rate_hash IS NULL
    ) OR (
      recipient_hash ~ '^[0-9a-f]{64}$'
      AND actor_recipient_rate_hash ~ '^[0-9a-f]{64}$'
      AND actor_total_rate_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT teskeid_event_guest_invitations_snapshot_check CHECK (
    public.teskeid_event_valid_text(recipient_label_snapshot, 5, 320)
    AND recipient_label_snapshot
      ~ '^[^[:space:]@*]\*{3}@[^[:space:]@*]+\.[^[:space:]@*]+$'
    AND public.teskeid_event_valid_text(event_name_snapshot, 1, 160)
    AND (
      guest_display_name_snapshot IS NULL
      OR (
        public.teskeid_event_valid_text(
          guest_display_name_snapshot, 1, 120
        )
        AND pg_catalog.strpos(guest_display_name_snapshot, '@') = 0
      )
    )
    AND (
      inviter_display_name_snapshot IS NULL
      OR (
        public.teskeid_event_valid_text(
          inviter_display_name_snapshot, 1, 120
        )
        AND pg_catalog.strpos(inviter_display_name_snapshot, '@') = 0
      )
    )
  ),
  CONSTRAINT teskeid_event_guest_invitations_template_check
    CHECK (email_template_version = 'event-attendance-v1'),
  CONSTRAINT teskeid_event_guest_invitations_attempt_check CHECK (
    attempt_number >= 0 AND attempt_number <= 3
    AND (
      (
        attempt_number = 0
        AND attempt_status IS NULL
        AND attempt_at IS NULL
      ) OR (
        attempt_number > 0
        AND attempt_status = ANY (ARRAY[
          'reserved'::text, 'sent'::text, 'failed'::text
        ])
        AND attempt_at IS NOT NULL
        AND recipient_hash IS NOT NULL
        AND actor_recipient_rate_hash IS NOT NULL
        AND actor_total_rate_hash IS NOT NULL
      )
    )
    AND (email_sent_at IS NULL OR attempt_number > 0)
  ),
  CONSTRAINT teskeid_event_guest_invitations_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT teskeid_event_guest_invitations_lifecycle_check CHECK (
    (
      status = 'pending'
      AND recipient_email_canonical IS NOT NULL
      AND recipient_email_canonical = public.normalize_email_canonical(
        recipient_email_canonical
      )
      AND public.teskeid_event_valid_text(
        recipient_email_canonical, 3, 320
      )
      AND recipient_email_canonical
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND recipient_label_snapshot =
        pg_catalog.left(recipient_email_canonical, 1) || '***'
        || pg_catalog.substr(
             recipient_email_canonical,
             pg_catalog.strpos(recipient_email_canonical, '@')
           )
      AND terminal_at IS NULL
      AND accepted_at IS NULL
      AND accepted_user_id IS NULL
    ) OR (
      status <> 'pending'
      AND recipient_email_canonical IS NULL
      AND terminal_at IS NOT NULL
      AND (
        (
          status = 'accepted'
          AND accepted_at IS NOT NULL
          AND accepted_user_id IS NOT NULL
        )
        OR (
          status = ANY (ARRAY['left'::text, 'revoked'::text])
          AND accepted_at IS NOT NULL
        )
        OR (
          status = ANY (ARRAY[
            'declined'::text, 'cancelled'::text, 'expired'::text
          ])
          AND accepted_at IS NULL
          AND accepted_user_id IS NULL
        )
      )
    )
  )
);

CREATE TABLE public.teskeid_event_attendance_memberships (
  event_id               uuid        NOT NULL,
  event_guest_id         uuid        NOT NULL,
  user_id                uuid        NOT NULL,
  accepted_invitation_id uuid        NOT NULL,
  accepted_at            timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_attendance_memberships_pkey
    PRIMARY KEY (event_id, user_id),
  CONSTRAINT teskeid_event_attendance_memberships_guest_fk
    FOREIGN KEY (event_id, event_guest_id, user_id)
    REFERENCES public.teskeid_event_guests(event_id, id, linked_user_id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT teskeid_event_attendance_memberships_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_attendance_memberships_invitation_fk
    FOREIGN KEY (
      accepted_invitation_id, event_id, event_guest_id, user_id
    ) REFERENCES public.teskeid_event_guest_invitations(
      id, event_id, event_guest_id, accepted_user_id
    ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE public.teskeid_event_attendance_mutation_requests (
  actor_user_id uuid        NOT NULL,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at  timestamptz NULL,

  CONSTRAINT teskeid_event_attendance_mutation_requests_pkey
    PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT teskeid_event_attendance_mutation_requests_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_attendance_mutation_requests_operation_check
    CHECK (operation = ANY (ARRAY[
      'teskeid_event_create_with_attendance_invitations'::text,
      'teskeid_event_replace_roster_with_attendance_invitations'::text,
      'teskeid_event_invite_guest_attendance'::text,
      'teskeid_event_cancel_guest_attendance_invitation'::text,
      'teskeid_event_respond_guest_attendance'::text,
      'teskeid_event_leave_attendance'::text
    ])),
  CONSTRAINT teskeid_event_attendance_mutation_requests_fingerprint_check
    CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT teskeid_event_attendance_mutation_requests_result_check CHECK (
    result IS NULL OR (
      pg_catalog.jsonb_typeof(result) = 'object'
      AND pg_catalog.octet_length(result::text) <= 32768
      AND (
        operation = ANY (ARRAY[
          'teskeid_event_create_with_attendance_invitations'::text,
          'teskeid_event_replace_roster_with_attendance_invitations'::text,
          'teskeid_event_invite_guest_attendance'::text,
          'teskeid_event_cancel_guest_attendance_invitation'::text
        ]) OR (
          operation = ANY (ARRAY[
            'teskeid_event_respond_guest_attendance'::text,
            'teskeid_event_leave_attendance'::text
          ])
          AND (result - 'status') = '{}'::jsonb
          AND result->>'status' = ANY (ARRAY[
            'accepted'::text, 'declined'::text,
            'expired'::text, 'left'::text
          ])
        )
      )
    )
  )
);

-- Durable delivery idempotency without retaining another copy of recipient
-- email. Actual sends occupy at most three attempt slots; authorized no-send
-- decisions are also receipted and the reserve function caps total request
-- receipts per invitation to twelve under the invitation row lock.
CREATE TABLE public.teskeid_event_attendance_delivery_requests (
  actor_user_id        uuid        NOT NULL,
  delivery_request_id  uuid        NOT NULL,
  invitation_id        uuid        NOT NULL,
  request_fingerprint  text        NOT NULL,
  decision_reason      text        NOT NULL,
  result_attempt_number integer     NOT NULL,
  attempt_number       integer     NULL,
  delivery_status      text        NULL,
  created_at           timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at           timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_attendance_delivery_requests_pkey
    PRIMARY KEY (actor_user_id, delivery_request_id),
  CONSTRAINT teskeid_event_attendance_delivery_requests_invitation_fk
    FOREIGN KEY (invitation_id, actor_user_id)
    REFERENCES public.teskeid_event_guest_invitations(id, invited_by)
    ON DELETE CASCADE,
  CONSTRAINT teskeid_event_attendance_delivery_requests_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_attendance_delivery_invitation_attempt_key
    UNIQUE (invitation_id, attempt_number),
  CONSTRAINT teskeid_event_attendance_delivery_requests_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT teskeid_event_attendance_delivery_requests_reason_check
    CHECK (decision_reason = ANY (ARRAY[
      'ok'::text, 'cooldown'::text, 'max_sends'::text,
      'rate_limited'::text, 'key_expired'::text
    ])),
  CONSTRAINT teskeid_event_attendance_delivery_requests_shape_check CHECK (
    result_attempt_number >= 0 AND result_attempt_number <= 3
    AND (
      (
        decision_reason = 'ok'
        AND result_attempt_number BETWEEN 1 AND 3
        AND (
          (
            attempt_number = result_attempt_number
            AND delivery_status = ANY (ARRAY[
              'reserved'::text, 'sent'::text, 'failed'::text
            ])
          ) OR (
            attempt_number IS NULL
            AND delivery_status IS NULL
          )
        )
      ) OR (
        decision_reason <> 'ok'
        AND attempt_number IS NULL
        AND delivery_status IS NULL
      )
    )
  )
);

-- Transaction-only, exact transition capability. Unlike a custom GUC, this
-- row cannot be forged through the service-role API because the table has no
-- grants; the guest guard consumes the exact old/new tuple atomically.
CREATE TABLE public.teskeid_event_guest_identity_mutation_authorizations (
  event_id                 uuid        NOT NULL,
  event_guest_id           uuid        NOT NULL,
  action                   text        NOT NULL,
  actor_user_id            uuid        NOT NULL,
  old_linked_user_id       uuid        NULL,
  new_linked_user_id       uuid        NULL,
  old_relationship_id     uuid        NULL,
  new_relationship_id     uuid        NULL,
  accepted_invitation_id  uuid        NULL,
  created_at               timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT teskeid_event_guest_identity_mutation_authorizations_pkey
    PRIMARY KEY (event_id, event_guest_id),
  CONSTRAINT teskeid_event_guest_identity_mutation_authorizations_guest_fk
    FOREIGN KEY (event_id, event_guest_id)
    REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_guest_identity_mutation_authorizations_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_guest_identity_mutation_authorizations_invite_fk
    FOREIGN KEY (
      accepted_invitation_id, event_id, event_guest_id, new_linked_user_id
    ) REFERENCES public.teskeid_event_guest_invitations(
      id, event_id, event_guest_id, accepted_user_id
    ) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT teskeid_event_guest_identity_authorizations_shape_check
    CHECK (
      (
        action = 'accept'
        AND old_linked_user_id IS NULL
        AND new_linked_user_id IS NOT NULL
        AND actor_user_id = new_linked_user_id
        AND accepted_invitation_id IS NOT NULL
        AND NOT (old_relationship_id IS DISTINCT FROM new_relationship_id)
      ) OR (
        action = 'account_delete'
        AND old_linked_user_id IS NOT NULL
        AND new_linked_user_id IS NULL
        AND actor_user_id = old_linked_user_id
        AND accepted_invitation_id IS NULL
        AND new_relationship_id IS NULL
      )
    )
);

CREATE UNIQUE INDEX teskeid_event_guest_invitations_pending_guest_uidx
  ON public.teskeid_event_guest_invitations (event_id, event_guest_id)
  WHERE status = 'pending';
CREATE UNIQUE INDEX teskeid_event_guest_invitations_pending_email_uidx
  ON public.teskeid_event_guest_invitations (
    event_id, recipient_email_canonical
  ) WHERE status = 'pending';
CREATE INDEX teskeid_event_guest_invitations_recipient_pending_idx
  ON public.teskeid_event_guest_invitations (
    recipient_email_canonical, created_at DESC, id DESC
  ) WHERE status = 'pending';
CREATE INDEX teskeid_event_guest_invitations_inviter_idx
  ON public.teskeid_event_guest_invitations (
    invited_by, created_at DESC, id DESC
  );
CREATE INDEX teskeid_event_guest_invitations_expiry_idx
  ON public.teskeid_event_guest_invitations (expires_at, id)
  WHERE status = 'pending';
CREATE INDEX teskeid_event_guest_invitations_guest_history_idx
  ON public.teskeid_event_guest_invitations (
    event_id, event_guest_id, created_at DESC, id DESC
  );
CREATE INDEX teskeid_event_guest_invitations_accepted_user_idx
  ON public.teskeid_event_guest_invitations (
    accepted_user_id, event_id, event_guest_id
  ) WHERE accepted_user_id IS NOT NULL;
CREATE INDEX teskeid_event_guests_linked_user_history_idx
  ON public.teskeid_event_guests (
    linked_user_id, event_id, id
  ) WHERE linked_user_id IS NOT NULL;
CREATE INDEX teskeid_event_guest_invitations_decline_cooldown_idx
  ON public.teskeid_event_guest_invitations (
    event_id, event_guest_id, recipient_hash, updated_at DESC, id DESC
  ) WHERE status = 'declined';
CREATE INDEX teskeid_event_guest_invitations_actor_recipient_rate_idx
  ON public.teskeid_event_guest_invitations (
    invited_by, actor_recipient_rate_hash, updated_at DESC, id DESC
  ) WHERE actor_recipient_rate_hash IS NOT NULL;
CREATE UNIQUE INDEX teskeid_event_attendance_memberships_guest_uidx
  ON public.teskeid_event_attendance_memberships (
    event_id, event_guest_id
  );
CREATE UNIQUE INDEX teskeid_event_attendance_memberships_invitation_uidx
  ON public.teskeid_event_attendance_memberships (accepted_invitation_id);
CREATE INDEX teskeid_event_attendance_memberships_user_idx
  ON public.teskeid_event_attendance_memberships (
    user_id, accepted_at DESC, event_id
  );
CREATE INDEX teskeid_event_attendance_delivery_requests_invitation_idx
  ON public.teskeid_event_attendance_delivery_requests (
    invitation_id, created_at, delivery_request_id
  );
CREATE INDEX teskeid_event_expense_participant_sources_group_member_idx
  ON public.teskeid_event_expense_participant_sources (
    group_id, expense_member_id
  );

ALTER TABLE public.teskeid_event_guest_invitations OWNER TO postgres;
ALTER TABLE public.teskeid_event_attendance_memberships OWNER TO postgres;
ALTER TABLE public.teskeid_event_attendance_mutation_requests OWNER TO postgres;
ALTER TABLE public.teskeid_event_attendance_delivery_requests OWNER TO postgres;
ALTER TABLE public.teskeid_event_guest_identity_mutation_authorizations
  OWNER TO postgres;

ALTER TABLE public.teskeid_event_guest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_guest_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_mutation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_delivery_requests
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_attendance_delivery_requests
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_guest_identity_mutation_authorizations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_guest_identity_mutation_authorizations
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teskeid_event_guest_invitations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_attendance_memberships
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_attendance_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.teskeid_event_attendance_delivery_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE
  public.teskeid_event_guest_identity_mutation_authorizations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (
  id, event_id, event_guest_id, invited_by, invitation_kind, accepted_user_id,
  recipient_email_canonical, recipient_hash, actor_recipient_rate_hash,
  actor_total_rate_hash, recipient_label_snapshot, event_name_snapshot,
  guest_display_name_snapshot, inviter_display_name_snapshot, status,
  email_template_version, attempt_number, attempt_status, attempt_at,
  email_sent_at, accepted_at, terminal_at, expires_at, created_at, updated_at
) ON TABLE public.teskeid_event_guest_invitations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (
  event_id, event_guest_id, user_id, accepted_invitation_id, accepted_at
) ON TABLE public.teskeid_event_attendance_memberships
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (
  actor_user_id, request_id, operation, fingerprint, result,
  created_at, completed_at
) ON TABLE public.teskeid_event_attendance_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (
  actor_user_id, delivery_request_id, invitation_id, request_fingerprint,
  decision_reason, result_attempt_number, attempt_number, delivery_status,
  created_at, updated_at
) ON TABLE public.teskeid_event_attendance_delivery_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (
  event_id, event_guest_id, action, actor_user_id, old_linked_user_id,
  new_linked_user_id, old_relationship_id, new_relationship_id,
  accepted_invitation_id, created_at
) ON TABLE public.teskeid_event_guest_identity_mutation_authorizations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.teskeid_event_attendance_mask_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text := public.normalize_email_canonical(p_email);
  v_at integer;
BEGIN
  v_at := pg_catalog.strpos(COALESCE(v_email, ''), '@');
  IF v_at <= 1
     OR NOT public.teskeid_event_valid_text(v_email, 3, 320)
     OR v_email
       !~ '^[^[:space:]@*][^[:space:]@]*@[^[:space:]@*]+\.[^[:space:]@*]+$'
  THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  RETURN pg_catalog.left(v_email, 1) || '***' || pg_catalog.substr(v_email, v_at);
END;
$function$;

CREATE FUNCTION public.teskeid_event_attendance_safe_guest_label(
  p_source_kind text,
  p_display_name_snapshot text,
  p_linked_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_name text;
BEGIN
  IF p_linked_user_id IS NOT NULL THEN
    SELECT public.teskeid_event_normalize_text(profile.display_name)
    INTO v_profile_name
    FROM public.profiles AS profile
    WHERE profile.id = p_linked_user_id;
    IF public.teskeid_event_valid_text(v_profile_name, 1, 120)
       AND pg_catalog.strpos(v_profile_name, '@') = 0 THEN
      RETURN v_profile_name;
    END IF;
    RETURN NULL;
  END IF;
  IF p_source_kind = 'manual_name'
     AND public.teskeid_event_valid_text(p_display_name_snapshot, 1, 120)
     AND pg_catalog.strpos(p_display_name_snapshot, '@') = 0 THEN
    RETURN p_display_name_snapshot;
  END IF;
  RETURN NULL;
END;
$function$;

-- Private lock-and-snapshot primitive. Callers invoke this before any Event
-- or guest row lock, then revalidate the exact linked user under those locks.
-- It has no service-role grant because the JSON contains current emails.
CREATE FUNCTION public.teskeid_event_attendance_lock_user_emails(
  p_user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_user_id uuid;
BEGIN
  IF p_user_ids IS NULL
     OR pg_catalog.cardinality(p_user_ids) > 49
     OR pg_catalog.array_position(p_user_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  FOR v_user_id IN
    SELECT DISTINCT requested.user_id
    FROM pg_catalog.unnest(p_user_ids) AS requested(user_id)
    ORDER BY requested.user_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 9602)
    );
  END LOOP;
  SELECT COALESCE(pg_catalog.jsonb_object_agg(
    locked_account.id::text,
    CASE WHEN locked_account.email_confirmed_at IS NOT NULL
      THEN public.normalize_email_canonical(locked_account.email)
      ELSE NULL END
    ORDER BY locked_account.id
  ), '{}'::jsonb)
  INTO v_result
  FROM (
    SELECT account.id, account.email, account.email_confirmed_at
    FROM auth.users AS account
    WHERE account.id = ANY(p_user_ids)
    ORDER BY account.id
    FOR SHARE OF account
  ) AS locked_account;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_attendance_terminalize_invitations(
  p_invitation_ids uuid[],
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_invitation_ids IS NULL
     OR p_status NOT IN ('declined', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET status = p_status,
      recipient_email_canonical = NULL,
      accepted_user_id = NULL,
      accepted_at = NULL,
      terminal_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invitation.id = ANY(p_invitation_ids)
    AND invitation.status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Bounded lazy privacy cleanup. Every broad attendance entry seam invokes this
-- before taking its own Event locks, so the next attendance traffic scrubs at
-- most 50 globally expired raw recipient emails in deterministic lock order.
CREATE FUNCTION public.teskeid_event_attendance_sweep_expired(
  p_limit integer,
  p_exclude_invitation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sweep_lock boolean := false;
  v_event_ids uuid[] := ARRAY[]::uuid[];
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  SELECT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('teskeid:event-attendance:expiry-sweep', 13303)
  ) INTO v_sweep_lock;
  IF v_sweep_lock IS DISTINCT FROM true THEN RETURN 0; END IF;

  -- The expiry index bounds candidate discovery before any grouping/sort over
  -- related rows. Every later lookup is restricted to this <= 50 UUID set.
  SELECT COALESCE(
    pg_catalog.array_agg(
      candidate.id ORDER BY candidate.expires_at, candidate.id
    ),
    ARRAY[]::uuid[]
  ) INTO v_invitation_ids
  FROM (
    SELECT invitation.id, invitation.expires_at
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.status = 'pending'
      AND invitation.expires_at <= pg_catalog.now()
      AND invitation.id IS DISTINCT FROM p_exclude_invitation_id
    ORDER BY invitation.expires_at, invitation.id
    LIMIT p_limit
  ) AS candidate;
  IF pg_catalog.cardinality(v_invitation_ids) = 0 THEN RETURN 0; END IF;

  -- Never wait behind an unrelated roster mutation while holding the global
  -- sweep advisory. SQL132 roster replacement may already hold an Event and
  -- later request a recipient identity advisory, while a delivery path holds
  -- that identity advisory before calling this helper. SKIP LOCKED makes lazy
  -- privacy cleanup opportunistic and breaks that otherwise-valid 3-way wait.
  SELECT COALESCE(
    pg_catalog.array_agg(locked_event.id ORDER BY locked_event.id),
    ARRAY[]::uuid[]
  ) INTO v_event_ids
  FROM (
    SELECT event_row.id
    FROM public.teskeid_events AS event_row
    WHERE event_row.id IN (
      SELECT invitation.event_id
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.id = ANY(v_invitation_ids)
    )
    ORDER BY event_row.id
    FOR UPDATE SKIP LOCKED
  ) AS locked_event;
  IF pg_catalog.cardinality(v_event_ids) = 0 THEN RETURN 0; END IF;

  -- Drop candidates whose Event could not be locked and revalidate expiry
  -- under the acquired Event rows. A later attendance call will retry skipped
  -- rows; no path waits while holding the sweep domain.
  SELECT COALESCE(pg_catalog.array_agg(
    invitation.id ORDER BY invitation.expires_at, invitation.id
  ), ARRAY[]::uuid[])
  INTO v_invitation_ids
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = ANY(v_invitation_ids)
    AND invitation.event_id = ANY(v_event_ids)
    AND invitation.status = 'pending'
    AND invitation.expires_at <= pg_catalog.now();
  IF pg_catalog.cardinality(v_invitation_ids) = 0 THEN RETURN 0; END IF;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE (guest.event_id, guest.id) IN (
    SELECT invitation.event_id, invitation.event_guest_id
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.id = ANY(v_invitation_ids)
  )
  ORDER BY guest.event_id, guest.id
  FOR UPDATE;

  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = ANY(v_invitation_ids)
  ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
  FOR UPDATE;

  RETURN public.teskeid_event_attendance_terminalize_invitations(
    v_invitation_ids, 'expired'
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_attendance_create_pending(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_recipient_email text,
  p_invitation_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_email text := public.normalize_email_canonical(p_recipient_email);
  v_inviter_name text;
  v_safe_guest_label text;
  v_invitation public.teskeid_event_guest_invitations%ROWTYPE;
  v_expired_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_invitation_kind NOT IN ('access_only', 'identity_and_access')
     OR NOT public.teskeid_event_valid_text(v_email, 3, 320)
     OR v_email
       !~ '^[^[:space:]@*][^[:space:]@]*@[^[:space:]@*]+\.[^[:space:]@*]+$'
  THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  -- Lock every guest whose expired pending invitation can be replaced before
  -- locking any invitation, in the global sorted guest order.
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND (
      guest.id = p_event_guest_id
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_guest_invitations AS invitation
        WHERE invitation.event_id = guest.event_id
          AND invitation.event_guest_id = guest.id
          AND invitation.status = 'pending'
          AND invitation.expires_at <= pg_catalog.now()
          AND invitation.recipient_email_canonical = v_email
      )
    )
  ORDER BY guest.id
  FOR UPDATE;

  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF v_guest.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  IF (p_invitation_kind = 'access_only' AND v_guest.linked_user_id IS NULL)
     OR (
       p_invitation_kind = 'identity_and_access'
       AND v_guest.linked_user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;
  IF p_invitation_kind = 'access_only' AND NOT EXISTS (
    SELECT 1 FROM auth.users AS recipient
    WHERE recipient.id = v_guest.linked_user_id
      AND recipient.email_confirmed_at IS NOT NULL
      AND public.normalize_email_canonical(recipient.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users AS owner_account
    WHERE owner_account.id = p_actor_id
      AND public.normalize_email_canonical(owner_account.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
    WHERE membership.event_id = p_event_id
      AND membership.event_guest_id = p_event_guest_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
    ARRAY[]::uuid[]
  ) INTO v_expired_ids
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.event_id = p_event_id
    AND invitation.status = 'pending'
    AND invitation.expires_at <= pg_catalog.now()
    AND (
      invitation.event_guest_id = p_event_guest_id
      OR invitation.recipient_email_canonical = v_email
    );
  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = ANY(v_expired_ids)
  ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
  FOR UPDATE;
  PERFORM public.teskeid_event_attendance_terminalize_invitations(
    v_expired_ids, 'expired'
  );

  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.event_guest_id = p_event_guest_id
      AND invitation.status = 'pending'
  ) OR EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.recipient_email_canonical = v_email
      AND invitation.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  -- Bounded owner-side creation quota. Recipient-specific durable quotas and
  -- decline cooldown are applied after server-only HMAC binding in reserve.
  IF (
    SELECT pg_catalog.count(*)
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.invited_by = p_actor_id
      AND invitation.created_at > pg_catalog.now() - interval '24 hours'
  ) >= 100 THEN
    RAISE EXCEPTION 'teskeid_event_invitation_rate_limited';
  END IF;

  SELECT CASE WHEN public.teskeid_event_valid_text(
    public.teskeid_event_normalize_text(profile.display_name), 1, 120
  ) AND pg_catalog.strpos(
    public.teskeid_event_normalize_text(profile.display_name), '@'
  ) = 0 THEN public.teskeid_event_normalize_text(profile.display_name)
  ELSE NULL END
  INTO v_inviter_name
  FROM auth.users AS account
  LEFT JOIN public.profiles AS profile ON profile.id = account.id
  WHERE account.id = p_actor_id;

  v_safe_guest_label := public.teskeid_event_attendance_safe_guest_label(
    v_guest.source_kind, v_guest.display_name_snapshot, v_guest.linked_user_id
  );

  INSERT INTO public.teskeid_event_guest_invitations (
    event_id, event_guest_id, invited_by, invitation_kind,
    recipient_email_canonical, recipient_label_snapshot,
    event_name_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot
  ) VALUES (
    p_event_id, p_event_guest_id, p_actor_id, p_invitation_kind,
    v_email, public.teskeid_event_attendance_mask_email(v_email),
    v_event.name, v_safe_guest_label, v_inviter_name
  )
  RETURNING * INTO v_invitation;

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation.id,
    'event_guest_id', v_invitation.event_guest_id,
    'invitation_kind', v_invitation.invitation_kind,
    'recipient_label', v_invitation.recipient_label_snapshot,
    'invited_at', v_invitation.created_at,
    'expires_at', v_invitation.expires_at
  );
END;
$function$;

-- Session-only consent actions intentionally do not require the Events
-- entitlement. Exact invitation/membership checks still authorize the target.
CREATE FUNCTION public.teskeid_event_assert_session_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_attendance_begin_response_request(
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
  v_existing public.teskeid_event_attendance_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_operation NOT IN (
       'teskeid_event_create_with_attendance_invitations',
       'teskeid_event_replace_roster_with_attendance_invitations',
       'teskeid_event_invite_guest_attendance',
       'teskeid_event_cancel_guest_attendance_invitation',
       'teskeid_event_respond_guest_attendance',
       'teskeid_event_leave_attendance'
     )
     OR p_fingerprint !~ '^[0-9a-f]{32}$'
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13302)
  );
  INSERT INTO public.teskeid_event_attendance_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, p_operation, p_fingerprint
  ) ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF FOUND THEN RETURN NULL; END IF;

  SELECT request_row.* INTO v_existing
  FROM public.teskeid_event_attendance_mutation_requests AS request_row
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

CREATE FUNCTION public.teskeid_event_attendance_finish_response_request(
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
     OR pg_catalog.octet_length(p_result::text) > 32768 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_result';
  END IF;
  UPDATE public.teskeid_event_attendance_mutation_requests AS request_row
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

CREATE OR REPLACE FUNCTION public.teskeid_event_guard_guest_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity_action text;
  v_legacy_relationship_unlink boolean :=
    OLD.linked_user_id IS NOT DISTINCT FROM NEW.linked_user_id
    AND OLD.relationship_id IS NOT NULL
    AND NEW.relationship_id IS NULL;
BEGIN
  IF OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id
     OR (
       OLD.relationship_id IS DISTINCT FROM NEW.relationship_id
       AND NOT v_legacy_relationship_unlink
     ) THEN
    DELETE FROM
      public.teskeid_event_guest_identity_mutation_authorizations
      AS identity_authorization_row
    WHERE identity_authorization_row.event_id = OLD.event_id
      AND identity_authorization_row.event_guest_id = OLD.id
      AND identity_authorization_row.old_linked_user_id IS NOT DISTINCT FROM
        OLD.linked_user_id
      AND identity_authorization_row.new_linked_user_id IS NOT DISTINCT FROM
        NEW.linked_user_id
      AND identity_authorization_row.old_relationship_id IS NOT DISTINCT FROM
        OLD.relationship_id
      AND identity_authorization_row.new_relationship_id IS NOT DISTINCT FROM
        NEW.relationship_id
      AND (
        identity_authorization_row.action = 'account_delete'
        OR (
          identity_authorization_row.action = 'accept'
          AND OLD.source_kind IN ('manual_name', 'manual_email')
          AND EXISTS (
            SELECT 1
            FROM public.teskeid_event_guest_invitations AS invitation
            WHERE invitation.id =
              identity_authorization_row.accepted_invitation_id
              AND invitation.event_id = OLD.event_id
              AND invitation.event_guest_id = OLD.id
              AND invitation.invitation_kind = 'identity_and_access'
              AND invitation.status = 'accepted'
              AND invitation.accepted_user_id = NEW.linked_user_id
          )
        )
      )
    RETURNING identity_authorization_row.action INTO v_identity_action;
    IF v_identity_action IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_guest_identity_unauthorized';
    END IF;
  END IF;

  IF OLD.id <> NEW.id
     OR OLD.event_id <> NEW.event_id
     OR OLD.source_kind <> NEW.source_kind
     OR OLD.display_name_snapshot <> NEW.display_name_snapshot
     OR OLD.email_canonical IS DISTINCT FROM NEW.email_canonical
     OR OLD.created_at <> NEW.created_at
     OR (
       OLD.relationship_id IS DISTINCT FROM NEW.relationship_id
       AND NOT v_legacy_relationship_unlink
       AND v_identity_action IS NULL
     )
     OR (
       OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id
       AND v_identity_action IS NULL
     )
     OR NOT (
       (
         OLD.status = NEW.status
         AND OLD.position IS NOT DISTINCT FROM NEW.position
         AND OLD.removed_at IS NOT DISTINCT FROM NEW.removed_at
       )
       OR (
         OLD.status = 'active' AND NEW.status = 'removed'
         AND NEW.position IS NULL AND NEW.removed_at IS NOT NULL
       )
       OR (
         OLD.status = 'removed' AND NEW.status = 'active'
         AND NEW.position BETWEEN 0 AND 48 AND NEW.removed_at IS NULL
       )
       OR (
         OLD.status = 'active' AND NEW.status = 'active'
         AND NEW.position BETWEEN 0 AND 48 AND NEW.removed_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_guest_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_guard_identity_authorization_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_guest_identity_mutation_authorizations
      AS identity_authorization_row
    WHERE identity_authorization_row.event_id = NEW.event_id
      AND identity_authorization_row.event_guest_id = NEW.event_guest_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_identity_authorization_unconsumed';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER
  teskeid_event_identity_authorizations_consumed_deferred
  AFTER INSERT OR UPDATE
  ON public.teskeid_event_guest_identity_mutation_authorizations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_guard_identity_authorization_commit();

CREATE FUNCTION public.teskeid_event_guard_attendance_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
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

CREATE TRIGGER teskeid_event_guest_invitations_touch_updated_at
  BEFORE UPDATE ON public.teskeid_event_guest_invitations
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_event_touch_updated_at();

CREATE TRIGGER teskeid_event_attendance_receipts_mutation_guard
  BEFORE UPDATE OR DELETE ON public.teskeid_event_attendance_mutation_requests
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_guard_attendance_receipt_mutation();

CREATE FUNCTION public.teskeid_event_assert_attendance_integrity(
  p_event_id uuid,
  p_event_guest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_id IS NULL OR p_event_guest_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_attendance_memberships AS membership
    LEFT JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = membership.event_id
     AND guest.id = membership.event_guest_id
    LEFT JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = membership.accepted_invitation_id
     AND invitation.event_id = membership.event_id
     AND invitation.event_guest_id = membership.event_guest_id
     AND invitation.accepted_user_id = membership.user_id
    WHERE membership.event_id = p_event_id
      AND membership.event_guest_id = p_event_guest_id
      AND (
        guest.id IS NULL
        OR guest.status <> 'active'
        OR guest.linked_user_id IS DISTINCT FROM membership.user_id
        OR invitation.id IS NULL
        OR invitation.status <> 'accepted'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.event_guest_id = p_event_guest_id
      AND invitation.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_attendance_memberships AS membership
        WHERE membership.accepted_invitation_id = invitation.id
          AND membership.event_id = invitation.event_id
          AND membership.event_guest_id = invitation.event_guest_id
          AND membership.user_id = invitation.accepted_user_id
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_attendance_integrity_failed';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_attendance_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid;
  v_event_guest_id uuid;
  v_pending_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
  IF TG_TABLE_NAME = 'teskeid_event_guests' THEN
    v_event_guest_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    v_event_guest_id := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.event_guest_id ELSE NEW.event_guest_id END;
  END IF;
  IF TG_TABLE_NAME = 'teskeid_event_guests' AND TG_OP <> 'DELETE'
     AND NOT EXISTS (
       SELECT 1 FROM public.teskeid_event_guests AS guest
       WHERE guest.event_id = v_event_id
         AND guest.id = v_event_guest_id
         AND guest.status = 'active'
     ) THEN
    SELECT COALESCE(
      pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
      ARRAY[]::uuid[]
    ) INTO v_pending_ids
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = v_event_id
      AND invitation.event_guest_id = v_event_guest_id
      AND invitation.status = 'pending';
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      v_pending_ids, 'cancelled'
    );
    DELETE FROM public.teskeid_event_attendance_memberships AS membership
    WHERE membership.event_id = v_event_id
      AND membership.event_guest_id = v_event_guest_id;
    UPDATE public.teskeid_event_guest_invitations AS invitation
    SET status = 'revoked',
        recipient_email_canonical = NULL,
        terminal_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE invitation.event_id = v_event_id
      AND invitation.event_guest_id = v_event_guest_id
      AND invitation.status = 'accepted';
  END IF;
  PERFORM public.teskeid_event_assert_attendance_integrity(
    v_event_id, v_event_guest_id
  );
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER teskeid_event_attendance_memberships_integrity_deferred
  AFTER INSERT OR UPDATE OR DELETE
  ON public.teskeid_event_attendance_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_attendance_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_guest_invitations_integrity_deferred
  AFTER INSERT OR UPDATE OR DELETE
  ON public.teskeid_event_guest_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_attendance_integrity_trigger();
CREATE CONSTRAINT TRIGGER teskeid_event_guests_attendance_integrity_deferred
  AFTER UPDATE OR DELETE ON public.teskeid_event_guests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_attendance_integrity_trigger();

-- Persist an exact catalog-definition seal for every new CHECK and critical
-- trigger. PostgreSQL can deparse equivalent source differently across object
-- kinds; the seal lets later read-only postflight compare the live normalized
-- definition byte-for-byte without trusting only names or loose substrings.
DO $teskeid_event_attendance_definition_seals$
DECLARE
  v_expected record;
  v_object oid;
  v_definition text;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_kind_check',
        '22b5d0993c33015d7700f92ab433ff33'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_status_check',
        'b101d50b384d87a7b66cf42b80b735aa'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_hash_bundle_check',
        '15455ec62890062c26c32bbab11cc600'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_snapshot_check',
        '8ae89b572efc55831870967cb780be9e'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_template_check',
        '6bac810125fe2b4f477b45b526dc83d4'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_attempt_check',
        'c432e69fd0c55951c935d6d851a94728'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_expiry_check',
        '81f15dca4d15c26bb132eb2e3d1ccf88'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_lifecycle_check',
        'f35892a5ae13facf775a300ce9259de0'),
      ('teskeid_event_attendance_mutation_requests',
        'teskeid_event_attendance_mutation_requests_operation_check',
        '043951bd32393961ac39a7c78d1f1007'),
      ('teskeid_event_attendance_mutation_requests',
        'teskeid_event_attendance_mutation_requests_fingerprint_check',
        'db81247a30fe80e62823c7ae4ceccec2'),
      ('teskeid_event_attendance_mutation_requests',
        'teskeid_event_attendance_mutation_requests_result_check',
        '63f8ecfd9306a01e17cac38793a3af1d'),
      ('teskeid_event_attendance_delivery_requests',
        'teskeid_event_attendance_delivery_requests_fingerprint_check',
        '15d67fb31665b2a184080de1006c1430'),
      ('teskeid_event_attendance_delivery_requests',
        'teskeid_event_attendance_delivery_requests_reason_check',
        '357cab2a73082c21e5046d2ae1240812'),
      ('teskeid_event_attendance_delivery_requests',
        'teskeid_event_attendance_delivery_requests_shape_check',
        'e87c1ced46e6b2f473385f36eb684067'),
      ('teskeid_event_guest_identity_mutation_authorizations',
        'teskeid_event_guest_identity_authorizations_shape_check',
        'ea49cffc2ae6918ffd37dad725d2ea74')
    ) AS expected(table_name, constraint_name, definition_md5)
  LOOP
    SELECT constraint_row.oid,
           pg_catalog.pg_get_constraintdef(constraint_row.oid)
    INTO v_object, v_definition
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
            'public.' || v_expected.table_name
          )
      AND constraint_row.conname = v_expected.constraint_name
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated;
    IF v_object IS NULL OR pg_catalog.md5(pg_catalog.lower(
      pg_catalog.replace(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          v_definition, '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'), 'public.', ''
      ), 'pg_catalog.', '')
    )) <> v_expected.definition_md5 THEN
      RAISE EXCEPTION 'teskeid_event_attendance_constraint_seal_failed:%',
        v_expected.constraint_name;
    END IF;
    EXECUTE pg_catalog.format(
      'COMMENT ON CONSTRAINT %I ON public.%I IS %L',
      v_expected.constraint_name, v_expected.table_name,
      'sql133:' || v_expected.definition_md5
    );
  END LOOP;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_touch_updated_at',
        'fa7142e0a8c566ccf190da63610cae40'),
      ('teskeid_event_attendance_mutation_requests',
        'teskeid_event_attendance_receipts_mutation_guard',
        '9e63014a2603cbe3557a062a8811f5c7'),
      ('teskeid_event_attendance_memberships',
        'teskeid_event_attendance_memberships_integrity_deferred',
        '90339fbdfb6ca44a0561893ef7595c1c'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_integrity_deferred',
        'c3acb696a05b8ae943adae3861e810c0'),
      ('teskeid_event_guests',
        'teskeid_event_guests_attendance_integrity_deferred',
        '1b19d5124b69fea189ffee1702be8217'),
      ('teskeid_event_guest_identity_mutation_authorizations',
        'teskeid_event_identity_authorizations_consumed_deferred',
        '2fd977aeca18d003379f1ea0df746f5f')
    ) AS expected(table_name, trigger_name, definition_md5)
  LOOP
    SELECT trigger_row.oid, pg_catalog.pg_get_triggerdef(trigger_row.oid)
    INTO v_object, v_definition
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = pg_catalog.to_regclass(
            'public.' || v_expected.table_name
          )
      AND trigger_row.tgname = v_expected.trigger_name
      AND NOT trigger_row.tgisinternal;
    IF v_object IS NULL OR pg_catalog.md5(pg_catalog.lower(
      pg_catalog.replace(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          v_definition, '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'), 'public.', ''
      ), 'pg_catalog.', '')
    )) <> v_expected.definition_md5 THEN
      RAISE EXCEPTION 'teskeid_event_attendance_trigger_seal_failed:%',
        v_expected.trigger_name;
    END IF;
    EXECUTE pg_catalog.format(
      'COMMENT ON TRIGGER %I ON public.%I IS %L',
      v_expected.trigger_name, v_expected.table_name,
      'sql133:' || v_expected.definition_md5
    );
  END LOOP;
END;
$teskeid_event_attendance_definition_seals$;

CREATE FUNCTION public.teskeid_event_create_with_attendance_invitations(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_guests jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_base_result jsonb;
  v_event_id uuid;
  v_linked_user_ids uuid[] := ARRAY[]::uuid[];
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_manual_emails text[] := ARRAY[]::text[];
  v_manual_email text;
  v_guest record;
  v_recipient_email text;
  v_invitation jsonb;
  v_invitations jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_request_id IS NULL
     OR NOT public.teskeid_event_valid_text(
       public.teskeid_event_normalize_text(p_name), 1, 160
     )
     OR p_guests IS NULL
     OR pg_catalog.jsonb_typeof(p_guests) <> 'array'
     OR pg_catalog.jsonb_array_length(p_guests) > 49
     OR pg_catalog.pg_column_size(p_guests) > 65536 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'name', public.teskeid_event_normalize_text(p_name),
    'guests', p_guests
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_with_attendance_invitations', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT public.normalize_email_canonical(item.value->>'email')
    ORDER BY public.normalize_email_canonical(item.value->>'email')
  ), ARRAY[]::text[])
  INTO v_manual_emails
  FROM pg_catalog.jsonb_array_elements(p_guests) AS item(value)
  WHERE pg_catalog.jsonb_typeof(item.value) = 'object'
    AND item.value->>'source_kind' = 'manual_email'
    AND pg_catalog.jsonb_typeof(item.value->'email') = 'string'
    AND public.normalize_email_canonical(item.value->>'email') IS NOT NULL;
  FOREACH v_manual_email IN ARRAY v_manual_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_manual_email, 9702)
    );
  END LOOP;
  SELECT COALESCE(
    pg_catalog.array_agg(
      DISTINCT relationship.counterpart_user_id
      ORDER BY relationship.counterpart_user_id
    ), ARRAY[]::uuid[]
  ) INTO v_linked_user_ids
  FROM pg_catalog.jsonb_array_elements(CASE
    WHEN pg_catalog.jsonb_typeof(p_guests) = 'array' THEN p_guests
    ELSE '[]'::jsonb
  END) AS item(value)
  JOIN public.relationships AS relationship
    ON relationship.id = CASE
      WHEN pg_catalog.jsonb_typeof(item.value) = 'object'
       AND pg_catalog.jsonb_typeof(item.value->'relationship_id') = 'string'
       AND (item.value->>'relationship_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item.value->>'relationship_id')::uuid ELSE NULL END
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id IS NOT NULL;
  v_linked_email_snapshot :=
    public.teskeid_event_attendance_lock_user_emails(v_linked_user_ids);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'sql133:event-create:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_base_result := public.teskeid_event_create(
    p_actor_id, v_inner_request_id, p_name, p_guests
  );
  v_event_id := (v_base_result->>'event_id')::uuid;

  FOR v_guest IN
    SELECT guest.*
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = v_event_id
      AND guest.status = 'active'
      AND guest.source_kind IN ('relationship', 'manual_email')
    ORDER BY guest.position, guest.id
  LOOP
    IF v_guest.source_kind = 'relationship' THEN
      v_recipient_email := v_linked_email_snapshot
        ->> v_guest.linked_user_id::text;
    ELSE
      v_recipient_email := v_guest.email_canonical;
    END IF;
    IF v_recipient_email IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
    END IF;
    v_invitation := public.teskeid_event_attendance_create_pending(
      p_actor_id, v_event_id, v_guest.id, v_recipient_email,
      CASE WHEN v_guest.linked_user_id IS NULL
        THEN 'identity_and_access' ELSE 'access_only' END
    );
    v_invitations := v_invitations || pg_catalog.jsonb_build_array(v_invitation);
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'event_id', v_event_id,
    'roster_revision', (v_base_result->>'roster_revision')::bigint,
    'invitations', v_invitations
  );
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_replace_roster_with_attendance_invitations(
  p_actor_id uuid,
  p_event_id uuid,
  p_request_id uuid,
  p_expected_roster_revision bigint,
  p_guests jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_base_result jsonb;
  v_existing_guest_ids uuid[] := ARRAY[]::uuid[];
  v_linked_user_ids uuid[] := ARRAY[]::uuid[];
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_manual_emails text[] := ARRAY[]::text[];
  v_manual_email text;
  v_terminal_ids uuid[] := ARRAY[]::uuid[];
  v_guest record;
  v_recipient_email text;
  v_invitation jsonb;
  v_invitations jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_request_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_guests IS NULL
     OR pg_catalog.jsonb_typeof(p_guests) <> 'array'
     OR pg_catalog.jsonb_array_length(p_guests) > 49
     OR pg_catalog.pg_column_size(p_guests) > 65536 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'guests', p_guests
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_replace_roster_with_attendance_invitations', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT public.normalize_email_canonical(item.value->>'email')
    ORDER BY public.normalize_email_canonical(item.value->>'email')
  ), ARRAY[]::text[])
  INTO v_manual_emails
  FROM pg_catalog.jsonb_array_elements(p_guests) AS item(value)
  WHERE pg_catalog.jsonb_typeof(item.value) = 'object'
    AND item.value->>'source_kind' = 'manual_email'
    AND pg_catalog.jsonb_typeof(item.value->'email') = 'string'
    AND public.normalize_email_canonical(item.value->>'email') IS NOT NULL;
  FOREACH v_manual_email IN ARRAY v_manual_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_manual_email, 9702)
    );
  END LOOP;
  SELECT COALESCE(
    pg_catalog.array_agg(
      DISTINCT relationship.counterpart_user_id
      ORDER BY relationship.counterpart_user_id
    ), ARRAY[]::uuid[]
  ) INTO v_linked_user_ids
  FROM pg_catalog.jsonb_array_elements(CASE
    WHEN pg_catalog.jsonb_typeof(p_guests) = 'array' THEN p_guests
    ELSE '[]'::jsonb
  END) AS item(value)
  JOIN public.relationships AS relationship
    ON relationship.id = CASE
      WHEN pg_catalog.jsonb_typeof(item.value) = 'object'
       AND pg_catalog.jsonb_typeof(item.value->'relationship_id') = 'string'
       AND (item.value->>'relationship_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item.value->>'relationship_id')::uuid ELSE NULL END
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id IS NOT NULL;
  v_linked_email_snapshot :=
    public.teskeid_event_attendance_lock_user_emails(v_linked_user_ids);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  SELECT COALESCE(
    pg_catalog.array_agg(guest.id ORDER BY guest.id), ARRAY[]::uuid[]
  ) INTO v_existing_guest_ids
  FROM public.teskeid_event_guests AS guest
  JOIN public.teskeid_events AS event_row ON event_row.id = guest.event_id
  WHERE guest.event_id = p_event_id
    AND guest.status = 'active'
    AND event_row.owner_user_id = p_actor_id;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'sql133:event-replace:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_base_result := public.teskeid_event_replace_roster(
    p_actor_id, p_event_id, v_inner_request_id,
    p_expected_roster_revision, p_guests
  );

  -- SQL132 temporarily removes every row. Revoke only after its complete final
  -- active set has been restored, so retained attendees never lose consent.
  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = invitation.event_id
   AND guest.id = invitation.event_guest_id
  WHERE invitation.event_id = p_event_id
    AND guest.status = 'removed'
  ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
  FOR UPDATE OF invitation;

  SELECT COALESCE(
    pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
    ARRAY[]::uuid[]
  ) INTO v_terminal_ids
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = invitation.event_id
   AND guest.id = invitation.event_guest_id
  WHERE invitation.event_id = p_event_id
    AND invitation.status = 'pending'
    AND guest.status = 'removed';
  PERFORM public.teskeid_event_attendance_terminalize_invitations(
    v_terminal_ids, 'cancelled'
  );

  DELETE FROM public.teskeid_event_attendance_memberships AS membership
  USING public.teskeid_event_guests AS guest
  WHERE membership.event_id = p_event_id
    AND guest.event_id = membership.event_id
    AND guest.id = membership.event_guest_id
    AND guest.status = 'removed';

  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET status = 'revoked',
      recipient_email_canonical = NULL,
      terminal_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  FROM public.teskeid_event_guests AS guest
  WHERE invitation.event_id = p_event_id
    AND invitation.status = 'accepted'
    AND guest.event_id = invitation.event_id
    AND guest.id = invitation.event_guest_id
    AND guest.status = 'removed';

  FOR v_guest IN
    SELECT guest.*
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND NOT (guest.id = ANY(v_existing_guest_ids))
      AND guest.source_kind IN ('relationship', 'manual_email')
    ORDER BY guest.position, guest.id
  LOOP
    IF v_guest.source_kind = 'relationship' THEN
      v_recipient_email := v_linked_email_snapshot
        ->> v_guest.linked_user_id::text;
    ELSE
      v_recipient_email := v_guest.email_canonical;
    END IF;
    IF v_recipient_email IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
    END IF;
    v_invitation := public.teskeid_event_attendance_create_pending(
      p_actor_id, p_event_id, v_guest.id, v_recipient_email,
      CASE WHEN v_guest.linked_user_id IS NULL
        THEN 'identity_and_access' ELSE 'access_only' END
    );
    v_invitations := v_invitations || pg_catalog.jsonb_build_array(v_invitation);
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'roster_revision', (v_base_result->>'roster_revision')::bigint,
    'invitations', v_invitations
  );
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_guest_attendance_state(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'roster_revision', event_row.roster_revision,
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', guest.id,
        'attendance_status', CASE
          WHEN membership.user_id IS NOT NULL THEN 'accepted'
          WHEN invitation.id IS NULL THEN 'not_invited'
          WHEN invitation.status = 'pending'
            AND invitation.expires_at <= pg_catalog.now() THEN 'expired'
          ELSE invitation.status
        END,
        'invitation_id', invitation.id,
        'invitation_kind', invitation.invitation_kind,
        'recipient_label', CASE
          WHEN invitation.status = 'pending'
            AND invitation.expires_at > pg_catalog.now()
          THEN invitation.recipient_label_snapshot ELSE NULL END,
        'delivery_status', CASE
          WHEN invitation.status <> 'pending'
            OR invitation.expires_at <= pg_catalog.now() THEN NULL
          WHEN invitation.email_sent_at IS NOT NULL THEN 'sent'
          WHEN invitation.attempt_number = 0 THEN 'not_sent'
          ELSE invitation.attempt_status
        END,
        'attempt_number', CASE
          WHEN invitation.status = 'pending'
            AND invitation.expires_at > pg_catalog.now()
          THEN invitation.attempt_number ELSE NULL END,
        'invited_at', invitation.created_at,
        'expires_at', CASE
          WHEN invitation.status = 'pending'
            AND invitation.expires_at > pg_catalog.now()
          THEN invitation.expires_at ELSE NULL END,
        'accepted_at', membership.accepted_at
      ) ORDER BY guest.position)
      FROM public.teskeid_event_guests AS guest
      LEFT JOIN public.teskeid_event_attendance_memberships AS membership
        ON membership.event_id = guest.event_id
       AND membership.event_guest_id = guest.id
      LEFT JOIN LATERAL (
        SELECT candidate.*
        FROM public.teskeid_event_guest_invitations AS candidate
        WHERE candidate.event_id = guest.event_id
          AND candidate.event_guest_id = guest.id
        ORDER BY
          (candidate.status = 'pending') DESC,
          candidate.created_at DESC,
          candidate.id DESC
        LIMIT 1
      ) AS invitation ON true
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

CREATE FUNCTION public.teskeid_event_invite_guest_attendance(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_expected_roster_revision bigint,
  p_request_id uuid,
  p_recipient_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_email text;
  v_kind text;
  v_probe_linked_user_id uuid;
  v_probe_source_kind text;
  v_probe_email text;
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_invitation jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_request_id IS NULL
     OR (
       p_recipient_email IS NOT NULL
       AND pg_catalog.octet_length(p_recipient_email) > 320
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'eventGuestId', p_event_guest_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'recipientEmail', public.normalize_email_canonical(p_recipient_email)
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_invite_guest_attendance', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  SELECT guest.linked_user_id, guest.source_kind, guest.email_canonical
  INTO v_probe_linked_user_id, v_probe_source_kind, v_probe_email
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active';
  IF v_probe_linked_user_id IS NULL THEN
    v_probe_email := CASE
      WHEN v_probe_source_kind = 'manual_email' THEN v_probe_email
      WHEN v_probe_source_kind = 'manual_name'
        THEN public.normalize_email_canonical(p_recipient_email)
      ELSE NULL
    END;
    IF v_probe_email IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_probe_email, 9702)
      );
    END IF;
  END IF;
  IF v_probe_linked_user_id IS NOT NULL THEN
    v_linked_email_snapshot :=
      public.teskeid_event_attendance_lock_user_emails(
        ARRAY[v_probe_linked_user_id]
      );
  END IF;
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
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
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  IF v_guest.linked_user_id IS NOT NULL THEN
    IF v_guest.linked_user_id IS DISTINCT FROM v_probe_linked_user_id THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot->>v_guest.linked_user_id::text;
    v_kind := 'access_only';
  ELSIF v_guest.source_kind = 'manual_email' THEN
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_guest.email_canonical;
    v_kind := 'identity_and_access';
  ELSIF v_guest.source_kind = 'manual_name' THEN
    v_email := public.normalize_email_canonical(p_recipient_email);
    v_kind := 'identity_and_access';
  ELSE
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  v_invitation := public.teskeid_event_attendance_create_pending(
    p_actor_id, p_event_id, p_event_guest_id, v_email, v_kind
  );
  v_result := pg_catalog.jsonb_build_object(
    'status', 'pending',
    'invitation_id', v_invitation->'invitation_id',
    'event_guest_id', v_invitation->'event_guest_id',
    'invitation_kind', v_invitation->'invitation_kind',
    'roster_revision', v_event.roster_revision,
    'recipient_label', v_invitation->'recipient_label',
    'attempt_number', 0,
    'delivery_status', 'not_sent',
    'invited_at', v_invitation->'invited_at',
    'expires_at', v_invitation->'expires_at'
  );
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_cancel_guest_attendance_invitation(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_invitation_id uuid,
  p_expected_roster_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_invitation_id IS NULL OR p_expected_roster_revision IS NULL
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'eventGuestId', p_event_guest_id,
    'invitationId', p_invitation_id,
    'expectedRosterRevision', p_expected_roster_revision
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_cancel_guest_attendance_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.id = p_invitation_id
      AND invitation.event_id = p_event_id
      AND invitation.event_guest_id = p_event_guest_id
      AND invitation.invited_by = p_actor_id
      AND invitation.status = 'pending'
    FOR UPDATE OF invitation
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  PERFORM public.teskeid_event_attendance_terminalize_invitations(
    ARRAY[p_invitation_id], 'cancelled'
  );
  v_result := pg_catalog.jsonb_build_object(
    'status', 'cancelled',
    'invitation_id', p_invitation_id,
    'event_guest_id', p_event_guest_id,
    'roster_revision', v_event.roster_revision
  );
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_prepare_guest_attendance_delivery(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);
  IF p_invitation_id IS NULL THEN RETURN NULL; END IF;
  SELECT pg_catalog.jsonb_build_object(
    'invitation_id', invitation.id,
    'event_id', invitation.event_id,
    'event_guest_id', invitation.event_guest_id,
    'recipient_email', invitation.recipient_email_canonical
  ) INTO v_result
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = invitation.event_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = invitation.event_id
   AND guest.id = invitation.event_guest_id
  WHERE invitation.id = p_invitation_id
    AND invitation.invited_by = p_actor_id
    AND event_row.owner_user_id = p_actor_id
    AND invitation.status = 'pending'
    AND invitation.expires_at > pg_catalog.now()
    AND guest.status = 'active'
    AND (
      invitation.invitation_kind = 'identity_and_access'
      OR EXISTS (
        SELECT 1
        FROM auth.users AS recipient_account
        WHERE recipient_account.id = guest.linked_user_id
          AND recipient_account.email_confirmed_at IS NOT NULL
          AND public.normalize_email_canonical(recipient_account.email)
            = invitation.recipient_email_canonical
      )
    );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_reserve_guest_attendance_delivery(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_delivery_request_id uuid,
  p_recipient_hash text,
  p_actor_recipient_rate_hash text,
  p_actor_total_rate_hash text,
  p_rate_limit_window_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation public.teskeid_event_guest_invitations%ROWTYPE;
  v_request public.teskeid_event_attendance_delivery_requests%ROWTYPE;
  v_attempt_request public.teskeid_event_attendance_delivery_requests%ROWTYPE;
  v_probe_event_id uuid;
  v_probe_guest_id uuid;
  v_probe_invitation_kind text;
  v_probe_linked_user_id uuid;
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_linked_recipient_email text;
  v_access_only_email_current boolean := true;
  v_request_fingerprint text;
  v_request_count integer := 0;
  v_reykjavik_date date := (
    pg_catalog.now() AT TIME ZONE 'Atlantic/Reykjavik'
  )::date;
  v_recipient_allowed boolean := false;
  v_total_allowed boolean := false;
  v_attempt integer;
  v_decision_reason text;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_invitation_id IS NULL OR p_delivery_request_id IS NULL
     OR p_recipient_hash !~ '^[0-9a-f]{64}$'
     OR p_actor_recipient_rate_hash !~ '^[0-9a-f]{64}$'
     OR p_actor_total_rate_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_request_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'invitationId', p_invitation_id,
    'recipientHash', p_recipient_hash,
    'actorRecipientRateHash', p_actor_recipient_rate_hash,
    'actorTotalRateHash', p_actor_total_rate_hash
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_actor_id::text || ':' || p_delivery_request_id::text, 13304
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 13201)
  );
  -- Discover only the canonical lock keys before taking any mutable Event
  -- row. Access-only delivery is also pinned to the currently confirmed
  -- email of the already-linked recipient. FOR SHARE makes that identity
  -- stable through the later Event -> guest -> invitation revalidation.
  SELECT invitation.event_id, invitation.event_guest_id,
         invitation.invitation_kind, guest.linked_user_id
  INTO v_probe_event_id, v_probe_guest_id,
       v_probe_invitation_kind, v_probe_linked_user_id
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = invitation.event_id
   AND guest.id = invitation.event_guest_id
  WHERE invitation.id = p_invitation_id
    AND invitation.invited_by = p_actor_id
    AND event_row.owner_user_id = p_actor_id;
  IF v_probe_event_id IS NULL OR v_probe_guest_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', 0, 'can_send', false, 'reason', 'not_found',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  IF v_probe_invitation_kind = 'access_only' THEN
    IF v_probe_linked_user_id IS NULL THEN
      v_access_only_email_current := false;
    ELSE
      -- The helper takes recipient 9602 before auth FOR SHARE. Combined with
      -- the owner 13201 above, this matches unchanged SQL132 roster mutation
      -- order and prevents Event -> 9602 / 9602 -> Event deadlocks.
      v_linked_email_snapshot :=
        public.teskeid_event_attendance_lock_user_emails(
          ARRAY[v_probe_linked_user_id]
        );
      v_linked_recipient_email :=
        v_linked_email_snapshot->>v_probe_linked_user_id::text;
    END IF;
    v_access_only_email_current := v_linked_recipient_email IS NOT NULL;
  END IF;
  -- Serialize the cross-invitation short cooldown and decline window for this
  -- exact actor/recipient HMAC after the recipient identity row and before
  -- any Event row lock is acquired.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'teskeid:event-attendance:actor-recipient-cooldown:'
      || p_actor_recipient_rate_hash,
    13305
  ));
  PERFORM public.teskeid_event_attendance_sweep_expired(
    50, p_invitation_id
  );
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = v_probe_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', 0, 'can_send', false, 'reason', 'not_found',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = v_probe_event_id
    AND guest.id = v_probe_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', 0, 'can_send', false, 'reason', 'not_found',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  SELECT invitation.* INTO v_invitation
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.event_id = v_probe_event_id
    AND invitation.event_guest_id = v_probe_guest_id
    AND invitation.invited_by = p_actor_id
  FOR UPDATE;
  IF v_invitation.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', 0, 'can_send', false, 'reason', 'not_found',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  v_access_only_email_current := (
    v_invitation.invitation_kind <> 'access_only'
    OR (
      v_probe_linked_user_id IS NOT NULL
      AND v_probe_linked_user_id = (
        SELECT guest.linked_user_id
        FROM public.teskeid_event_guests AS guest
        WHERE guest.event_id = v_probe_event_id
          AND guest.id = v_probe_guest_id
      )
      AND v_linked_recipient_email
        = v_invitation.recipient_email_canonical
    )
  );

  -- The historical delivery request is loaded only after the canonical
  -- Event -> guest -> invitation lock chain. It contains no recipient email.
  SELECT request_row.* INTO v_request
  FROM public.teskeid_event_attendance_delivery_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.delivery_request_id = p_delivery_request_id;
  IF v_request.delivery_request_id IS NOT NULL THEN
    IF v_request.invitation_id <> p_invitation_id
       OR v_request.request_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION 'teskeid_event_idempotency_conflict';
    END IF;
    IF v_request.decision_reason <> 'ok' THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', v_request.decision_reason,
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    SELECT request_row.* INTO v_attempt_request
    FROM public.teskeid_event_attendance_delivery_requests AS request_row
    WHERE request_row.invitation_id = p_invitation_id
      AND request_row.attempt_number = v_request.result_attempt_number
    FOR UPDATE;
    IF v_attempt_request.delivery_request_id IS NULL
       OR v_attempt_request.decision_reason <> 'ok' THEN
      RAISE EXCEPTION 'teskeid_event_delivery_receipt_integrity_failed';
    END IF;
    IF v_attempt_request.delivery_status = 'sent' THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'already_sent',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_attempt_request.delivery_status = 'failed' THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'already_failed',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_invitation.status <> 'pending' THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'not_pending',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_invitation.expires_at <= pg_catalog.now() THEN
      PERFORM public.teskeid_event_attendance_terminalize_invitations(
        ARRAY[v_invitation.id], 'expired'
      );
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'expired',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_attempt_request.delivery_status = 'reserved' AND (
      v_invitation.attempt_at IS NULL
      OR v_invitation.attempt_at <= pg_catalog.now() - interval '24 hours'
    ) THEN
      -- Never re-expose raw delivery context after the provider-idempotency
      -- retention window. The owner must cancel/re-invite this ambiguous send.
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'key_expired',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_access_only_email_current IS DISTINCT FROM true THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'key_expired',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    IF v_invitation.recipient_hash <> p_recipient_hash
       OR v_invitation.actor_recipient_rate_hash
         <> p_actor_recipient_rate_hash
       OR v_invitation.actor_total_rate_hash <> p_actor_total_rate_hash THEN
      RETURN pg_catalog.jsonb_build_object(
        'attempt_number', v_request.result_attempt_number,
        'can_send', false, 'reason', 'key_expired',
        'recipient_email', NULL, 'email_template_version', NULL,
        'event_name', NULL, 'guest_display_name', NULL,
        'inviter_display_name', NULL, 'invitation_kind', NULL
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_request.result_attempt_number,
      'can_send', true, 'reason', 'ok',
      'recipient_email', v_invitation.recipient_email_canonical,
      'email_template_version', v_invitation.email_template_version,
      'event_name', v_invitation.event_name_snapshot,
      'guest_display_name', v_invitation.guest_display_name_snapshot,
      'inviter_display_name', v_invitation.inviter_display_name_snapshot,
      'invitation_kind', v_invitation.invitation_kind
    );
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_invitation.attempt_number,
      'can_send', false, 'reason', 'not_pending',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  IF v_invitation.expires_at <= pg_catalog.now() THEN
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      ARRAY[v_invitation.id], 'expired'
    );
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_invitation.attempt_number,
      'can_send', false, 'reason', 'expired',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;
  SELECT pg_catalog.count(*) INTO v_request_count
  FROM public.teskeid_event_attendance_delivery_requests AS request_row
  WHERE request_row.invitation_id = p_invitation_id;
  -- This permanent saturation decision keeps the receipt relation bounded
  -- even if an authorized owner supplies unlimited fresh UUIDs during a
  -- cooldown. Existing request IDs above still replay their exact receipts.
  IF v_request_count >= 12 THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_invitation.attempt_number,
      'can_send', false, 'reason', 'rate_limited',
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;

  IF v_access_only_email_current IS DISTINCT FROM true THEN
    v_decision_reason := 'key_expired';
  ELSIF p_rate_limit_window_date IS DISTINCT FROM v_reykjavik_date THEN
    v_decision_reason := 'key_expired';
  ELSIF v_invitation.recipient_hash IS NOT NULL AND (
    v_invitation.recipient_hash <> p_recipient_hash
     OR v_invitation.actor_recipient_rate_hash
       <> p_actor_recipient_rate_hash
     OR v_invitation.actor_total_rate_hash <> p_actor_total_rate_hash
  ) THEN
    v_decision_reason := 'key_expired';
  ELSIF v_invitation.attempt_number >= 3
     AND v_invitation.attempt_status <> 'reserved' THEN
    v_decision_reason := 'max_sends';
  ELSIF v_invitation.attempt_status = 'reserved' AND (
    v_invitation.attempt_at IS NULL
    OR v_invitation.attempt_at <= pg_catalog.now() - interval '24 hours'
  ) THEN
    -- A new request cannot safely retry an ambiguous provider attempt after
    -- the provider-idempotency key's bounded retention window.
    v_decision_reason := 'key_expired';
  ELSIF v_invitation.attempt_status = 'reserved' THEN
    -- A fresh UI request aliases the same live provider-idempotency attempt.
    -- It consumes neither a quota token nor a new attempt slot, and therefore
    -- lets an uncertain provider call recover after reload without duplicate
    -- delivery.
    SELECT request_row.* INTO v_attempt_request
    FROM public.teskeid_event_attendance_delivery_requests AS request_row
    WHERE request_row.invitation_id = p_invitation_id
      AND request_row.attempt_number = v_invitation.attempt_number
    FOR UPDATE;
    IF v_attempt_request.delivery_request_id IS NULL
       OR v_attempt_request.decision_reason <> 'ok'
       OR v_attempt_request.delivery_status <> 'reserved' THEN
      RAISE EXCEPTION 'teskeid_event_delivery_receipt_integrity_failed';
    END IF;
    INSERT INTO public.teskeid_event_attendance_delivery_requests (
      actor_user_id, delivery_request_id, invitation_id,
      request_fingerprint, decision_reason, result_attempt_number
    ) VALUES (
      p_actor_id, p_delivery_request_id, p_invitation_id,
      v_request_fingerprint, 'ok', v_invitation.attempt_number
    );
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_invitation.attempt_number,
      'can_send', true, 'reason', 'ok',
      'recipient_email', v_invitation.recipient_email_canonical,
      'email_template_version', v_invitation.email_template_version,
      'event_name', v_invitation.event_name_snapshot,
      'guest_display_name', v_invitation.guest_display_name_snapshot,
      'inviter_display_name', v_invitation.inviter_display_name_snapshot,
      'invitation_kind', v_invitation.invitation_kind
    );
  ELSIF (
    v_invitation.attempt_at IS NOT NULL
    AND v_invitation.attempt_at > pg_catalog.now() - interval '5 minutes'
  ) OR EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS prior
    WHERE prior.id <> v_invitation.id
      AND prior.invited_by = p_actor_id
      AND prior.actor_recipient_rate_hash = p_actor_recipient_rate_hash
      AND prior.updated_at > pg_catalog.now() - interval '10 minutes'
  ) OR EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS prior
    WHERE prior.id <> v_invitation.id
      AND prior.event_id = v_invitation.event_id
      AND prior.event_guest_id = v_invitation.event_guest_id
      AND prior.recipient_hash = p_recipient_hash
      AND prior.status = 'declined'
      AND prior.updated_at > pg_catalog.now() - interval '24 hours'
  ) THEN
    v_decision_reason := 'cooldown';
  END IF;

  IF v_decision_reason IS NULL THEN
    -- The exception subtransaction also rolls back the first quota increment
    -- if the second bucket refuses or the limiter is unavailable.
    BEGIN
      SELECT public.check_and_increment_ip_rate_limit(
        p_actor_recipient_rate_hash, p_rate_limit_window_date, 3
      ) INTO v_recipient_allowed;
      IF v_recipient_allowed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'teskeid_event_rate_limit_refused';
      END IF;
      SELECT public.check_and_increment_ip_rate_limit(
        p_actor_total_rate_hash, p_rate_limit_window_date, 20
      ) INTO v_total_allowed;
      IF v_total_allowed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'teskeid_event_rate_limit_refused';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_recipient_allowed := false;
      v_total_allowed := false;
    END;
    IF v_recipient_allowed IS DISTINCT FROM true
       OR v_total_allowed IS DISTINCT FROM true THEN
      v_decision_reason := 'rate_limited';
    END IF;
  END IF;

  IF v_decision_reason IS NOT NULL THEN
    INSERT INTO public.teskeid_event_attendance_delivery_requests (
      actor_user_id, delivery_request_id, invitation_id,
      request_fingerprint, decision_reason, result_attempt_number
    ) VALUES (
      p_actor_id, p_delivery_request_id, p_invitation_id,
      v_request_fingerprint, v_decision_reason,
      v_invitation.attempt_number
    );
    RETURN pg_catalog.jsonb_build_object(
      'attempt_number', v_invitation.attempt_number,
      'can_send', false, 'reason', v_decision_reason,
      'recipient_email', NULL, 'email_template_version', NULL,
      'event_name', NULL, 'guest_display_name', NULL,
      'inviter_display_name', NULL, 'invitation_kind', NULL
    );
  END IF;

  v_attempt := v_invitation.attempt_number + 1;
  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET recipient_hash = COALESCE(invitation.recipient_hash, p_recipient_hash),
      actor_recipient_rate_hash = COALESCE(
        invitation.actor_recipient_rate_hash, p_actor_recipient_rate_hash
      ),
      actor_total_rate_hash = COALESCE(
        invitation.actor_total_rate_hash, p_actor_total_rate_hash
      ),
      attempt_number = v_attempt,
      attempt_status = 'reserved',
      attempt_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invitation.id = p_invitation_id;
  INSERT INTO public.teskeid_event_attendance_delivery_requests (
    actor_user_id, delivery_request_id, invitation_id,
    request_fingerprint, decision_reason, result_attempt_number,
    attempt_number, delivery_status
  ) VALUES (
    p_actor_id, p_delivery_request_id, p_invitation_id,
    v_request_fingerprint, 'ok', v_attempt, v_attempt, 'reserved'
  );

  RETURN pg_catalog.jsonb_build_object(
    'attempt_number', v_attempt,
    'can_send', true,
    'reason', 'ok',
    'recipient_email', v_invitation.recipient_email_canonical,
    'email_template_version', v_invitation.email_template_version,
    'event_name', v_invitation.event_name_snapshot,
    'guest_display_name', v_invitation.guest_display_name_snapshot,
    'inviter_display_name', v_invitation.inviter_display_name_snapshot,
    'invitation_kind', v_invitation.invitation_kind
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_update_guest_attendance_delivery(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_attempt_number integer,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invitation public.teskeid_event_guest_invitations%ROWTYPE;
  v_delivery_request public.teskeid_event_attendance_delivery_requests%ROWTYPE;
  v_probe_event_id uuid;
  v_probe_guest_id uuid;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_status NOT IN ('sent', 'failed') THEN RETURN 'invalid_status'; END IF;
  IF p_attempt_number IS NULL OR p_attempt_number < 1 THEN
    RETURN 'invalid_attempt';
  END IF;
  PERFORM public.teskeid_event_attendance_sweep_expired(
    50, p_invitation_id
  );
  SELECT invitation.event_id, invitation.event_guest_id
  INTO v_probe_event_id, v_probe_guest_id
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
  WHERE invitation.id = p_invitation_id
    AND invitation.invited_by = p_actor_id
    AND event_row.owner_user_id = p_actor_id;
  IF v_probe_event_id IS NULL OR v_probe_guest_id IS NULL THEN
    RETURN 'not_found';
  END IF;
  PERFORM event_row.id FROM public.teskeid_events AS event_row
  WHERE event_row.id = v_probe_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  PERFORM guest.id FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = v_probe_event_id
    AND guest.id = v_probe_guest_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT invitation.* INTO v_invitation
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.event_id = v_probe_event_id
    AND invitation.event_guest_id = v_probe_guest_id
    AND invitation.invited_by = p_actor_id
  FOR UPDATE;
  IF v_invitation.id IS NULL THEN RETURN 'not_found'; END IF;
  SELECT request_row.* INTO v_delivery_request
  FROM public.teskeid_event_attendance_delivery_requests AS request_row
  WHERE request_row.invitation_id = p_invitation_id
    AND request_row.attempt_number = p_attempt_number
  FOR UPDATE;
  IF v_delivery_request.delivery_request_id IS NULL
     OR v_delivery_request.actor_user_id <> p_actor_id
     OR v_delivery_request.decision_reason <> 'ok' THEN
    RETURN 'invalid_attempt';
  END IF;
  IF v_delivery_request.delivery_status = 'sent' THEN
    RETURN CASE WHEN p_status = 'sent' THEN 'ok' ELSE 'stale_attempt' END;
  END IF;
  IF v_delivery_request.delivery_status = 'failed'
     AND p_status = 'failed' THEN RETURN 'ok'; END IF;

  UPDATE public.teskeid_event_attendance_delivery_requests AS request_row
  SET delivery_status = p_status,
      updated_at = pg_catalog.now()
  WHERE request_row.actor_user_id = v_delivery_request.actor_user_id
    AND request_row.delivery_request_id =
      v_delivery_request.delivery_request_id;
  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET attempt_status = CASE
        WHEN invitation.attempt_number = p_attempt_number THEN p_status
        ELSE invitation.attempt_status
      END,
      email_sent_at = CASE WHEN p_status = 'sent' THEN COALESCE(
        invitation.email_sent_at, pg_catalog.now()
      ) ELSE invitation.email_sent_at END,
      updated_at = pg_catalog.now()
  WHERE invitation.id = p_invitation_id;
  RETURN 'ok';
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_for_actor(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_email text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);
  SELECT public.normalize_email_canonical(account.email)
  INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'owned', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', event_row.id,
        'name', event_row.name,
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS guest
          WHERE guest.event_id = event_row.id AND guest.status = 'active'
        ),
        'roster_revision', event_row.roster_revision,
        'viewer_role', 'owner',
        'created_at', event_row.created_at,
        'updated_at', event_row.updated_at
      ) ORDER BY event_row.created_at DESC, event_row.id DESC)
      FROM (
        SELECT candidate.*
        FROM public.teskeid_events AS candidate
        WHERE candidate.owner_user_id = p_actor_id
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 100
      ) AS event_row
    ), '[]'::jsonb),
    'pending', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'invitation_id', invitation.id,
        'event_id', invitation.event_id,
        'name', invitation.event_name_snapshot,
        'guest_display_name', invitation.guest_display_name_snapshot,
        'inviter_display_name', invitation.inviter_display_name_snapshot,
        'invitation_kind', invitation.invitation_kind,
        'status', 'pending',
        'expires_at', invitation.expires_at,
        'invited_at', invitation.created_at
      ) ORDER BY invitation.created_at DESC, invitation.id DESC)
      FROM (
        SELECT candidate.*
        FROM public.teskeid_event_guest_invitations AS candidate
        JOIN public.teskeid_event_guests AS candidate_guest
          ON candidate_guest.event_id = candidate.event_id
         AND candidate_guest.id = candidate.event_guest_id
        WHERE candidate.status = 'pending'
          AND candidate.expires_at > pg_catalog.now()
          AND candidate.attempt_number > 0
          AND candidate.recipient_email_canonical = v_actor_email
          AND candidate_guest.status = 'active'
          AND (
            candidate.invitation_kind = 'identity_and_access'
            OR candidate_guest.linked_user_id = p_actor_id
          )
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 100
      ) AS invitation
    ), '[]'::jsonb),
    'attending', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', event_row.id,
        'name', event_row.name,
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS roster_guest
          WHERE roster_guest.event_id = event_row.id
            AND roster_guest.status = 'active'
        ),
        'roster_revision', event_row.roster_revision,
        'viewer_role', 'attendee',
        'created_at', event_row.created_at,
        'updated_at', event_row.updated_at
      ) ORDER BY membership.accepted_at DESC, event_row.id DESC)
      FROM (
        SELECT candidate.*
        FROM public.teskeid_event_attendance_memberships AS candidate
        JOIN public.teskeid_events AS candidate_event
          ON candidate_event.id = candidate.event_id
        JOIN public.teskeid_event_guests AS candidate_guest
          ON candidate_guest.event_id = candidate.event_id
         AND candidate_guest.id = candidate.event_guest_id
         AND candidate_guest.linked_user_id = candidate.user_id
        WHERE candidate.user_id = p_actor_id
          AND candidate_guest.status = 'active'
          AND candidate_event.owner_user_id <> p_actor_id
        ORDER BY candidate.accepted_at DESC, candidate.event_id DESC
        LIMIT 100
      ) AS membership
      JOIN public.teskeid_events AS event_row
        ON event_row.id = membership.event_id
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_attendee_view(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', event_row.name,
    'roster_revision', event_row.roster_revision,
    'viewer_role', 'attendee',
    'owner_display_name', CASE WHEN public.teskeid_event_valid_text(
      public.teskeid_event_normalize_text(owner_profile.display_name), 1, 120
    ) AND pg_catalog.strpos(
      public.teskeid_event_normalize_text(owner_profile.display_name), '@'
    ) = 0 THEN public.teskeid_event_normalize_text(owner_profile.display_name)
    ELSE NULL END,
    'created_at', event_row.created_at,
    'updated_at', event_row.updated_at,
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', roster_guest.id,
        'display_name', public.teskeid_event_attendance_safe_guest_label(
          roster_guest.source_kind,
          roster_guest.display_name_snapshot,
          roster_guest.linked_user_id
        ),
        'position', roster_guest.position,
        'is_self', roster_guest.linked_user_id = p_actor_id
      ) ORDER BY roster_guest.position)
      FROM public.teskeid_event_guests AS roster_guest
      WHERE roster_guest.event_id = event_row.id
        AND roster_guest.status = 'active'
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_events AS event_row ON event_row.id = membership.event_id
  JOIN public.teskeid_event_guests AS self_guest
    ON self_guest.event_id = membership.event_id
   AND self_guest.id = membership.event_guest_id
   AND self_guest.linked_user_id = membership.user_id
  LEFT JOIN public.profiles AS owner_profile
    ON owner_profile.id = event_row.owner_user_id
  WHERE membership.event_id = p_event_id
    AND membership.user_id = p_actor_id
    AND self_guest.status = 'active'
    AND event_row.owner_user_id <> p_actor_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_guest_attendance_preview(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_email text;
  v_email_confirmed boolean := false;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL THEN RETURN NULL; END IF;
  SELECT
    public.normalize_email_canonical(account.email),
    account.email_confirmed_at IS NOT NULL
  INTO v_actor_email, v_email_confirmed
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  -- Consent management remains reachable after acceptance even if Events
  -- access is later absent. This exact-identity projection deliberately has no
  -- roster, current email, financial data or owner-only Event fields.
  SELECT pg_catalog.jsonb_build_object(
    'invitation_id', invitation.id,
    'event_id', invitation.event_id,
    'event_name', invitation.event_name_snapshot,
    'guest_display_name', invitation.guest_display_name_snapshot,
    'inviter_display_name', invitation.inviter_display_name_snapshot,
    'invitation_kind', invitation.invitation_kind,
    'status', 'accepted',
    'roster', '[]'::jsonb,
    'expires_at', NULL,
    'invited_at', invitation.created_at
  ) INTO v_result
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_event_attendance_memberships AS membership
    ON membership.accepted_invitation_id = invitation.id
   AND membership.event_id = invitation.event_id
   AND membership.event_guest_id = invitation.event_guest_id
   AND membership.user_id = invitation.accepted_user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = membership.event_id
   AND guest.id = membership.event_guest_id
   AND guest.linked_user_id = membership.user_id
  WHERE invitation.id = p_invitation_id
    AND invitation.status = 'accepted'
    AND invitation.accepted_user_id = p_actor_id
    AND membership.user_id = p_actor_id
    AND guest.status = 'active';
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  IF v_email_confirmed IS DISTINCT FROM true OR v_actor_email IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'invitation_id', invitation.id,
    'event_id', invitation.event_id,
    'event_name', invitation.event_name_snapshot,
    'guest_display_name', invitation.guest_display_name_snapshot,
    'inviter_display_name', invitation.inviter_display_name_snapshot,
    'invitation_kind', invitation.invitation_kind,
    'status', 'pending',
    'roster', '[]'::jsonb,
    'expires_at', invitation.expires_at,
    'invited_at', invitation.created_at
  ) INTO v_result
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = invitation.event_id
   AND guest.id = invitation.event_guest_id
  WHERE invitation.id = p_invitation_id
    AND invitation.status = 'pending'
    AND invitation.expires_at > pg_catalog.now()
    AND invitation.attempt_number > 0
    AND invitation.recipient_email_canonical = v_actor_email
    AND guest.status = 'active'
    AND (
      invitation.invitation_kind = 'identity_and_access'
      OR guest.linked_user_id = p_actor_id
    );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_respond_guest_attendance(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_actor_email text;
  v_probe_event_id uuid;
  v_probe_guest_id uuid;
  v_probe_owner_user_id uuid;
  v_probe_actor_recipient_rate_hash text;
  v_invitation public.teskeid_event_guest_invitations%ROWTYPE;
  v_event public.teskeid_events%ROWTYPE;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_identity_linked boolean := false;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL OR p_request_id IS NULL
     OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  -- A completed consent receipt is actor-bound and remains replayable after
  -- terminal email scrubbing or a later address change. First execution does
  -- the stronger confirmed exact-email check below under the global locks.
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'invitationId', p_invitation_id, 'action', p_action
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_respond_guest_attendance', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Probe the first-execution identity and owner without row locks. The probe
  -- is never authoritative: owner/recipient advisories and auth FOR SHARE are
  -- acquired next, then every value is revalidated before Event mutation.
  SELECT public.normalize_email_canonical(account.email)
  INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  SELECT invitation.event_id, invitation.event_guest_id,
         event_row.owner_user_id, invitation.actor_recipient_rate_hash
  INTO v_probe_event_id, v_probe_guest_id,
       v_probe_owner_user_id, v_probe_actor_recipient_rate_hash
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
  WHERE invitation.id = p_invitation_id
    AND invitation.status = 'pending'
    AND invitation.attempt_number > 0
    AND invitation.recipient_email_canonical = v_actor_email
    AND (
      invitation.invitation_kind = 'identity_and_access'
      OR EXISTS (
        SELECT 1 FROM public.teskeid_event_guests AS probe_guest
        WHERE probe_guest.event_id = invitation.event_id
          AND probe_guest.id = invitation.event_guest_id
          AND probe_guest.status = 'active'
          AND probe_guest.linked_user_id = p_actor_id
      )
    );
  IF v_probe_event_id IS NULL OR v_probe_guest_id IS NULL
     OR v_probe_owner_user_id IS NULL
     OR v_probe_actor_recipient_rate_hash IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;

  -- Unchanged SQL132 roster replacement holds owner 13201, then its Event,
  -- then recipient 9602. Taking that same owner advisory before recipient
  -- identity serialization prevents the inverse 9602 -> Event wait.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_probe_owner_user_id::text, 13201)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9602)
  );
  SELECT public.normalize_email_canonical(account.email)
  INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL
  FOR SHARE OF account;
  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_guest_invitations AS invitation
    JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
    LEFT JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = invitation.event_id
     AND guest.id = invitation.event_guest_id
    WHERE invitation.id = p_invitation_id
      AND invitation.event_id = v_probe_event_id
      AND invitation.event_guest_id = v_probe_guest_id
      AND event_row.owner_user_id = v_probe_owner_user_id
      AND invitation.status = 'pending'
      AND invitation.attempt_number > 0
      AND invitation.recipient_email_canonical = v_actor_email
      AND invitation.actor_recipient_rate_hash =
        v_probe_actor_recipient_rate_hash
      AND (
        invitation.invitation_kind = 'identity_and_access'
        OR (
          guest.status = 'active'
          AND guest.linked_user_id = p_actor_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'teskeid:event-attendance:actor-recipient-cooldown:'
      || v_probe_actor_recipient_rate_hash,
    13305
  ));
  PERFORM public.teskeid_event_attendance_sweep_expired(
    50, p_invitation_id
  );

  -- Global order: response receipt -> owner mutation advisory -> recipient
  -- identity -> auth row -> actor/recipient HMAC -> nonblocking expiry sweep
  -- -> event -> guest -> invitation -> membership.
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = v_probe_event_id
  FOR UPDATE;
  SELECT guest.* INTO v_guest
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = v_probe_event_id
    AND guest.id = v_probe_guest_id
  FOR UPDATE;
  IF v_event.id IS NULL OR v_guest.id IS NULL OR v_guest.status <> 'active'
     OR v_event.owner_user_id = p_actor_id THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  SELECT invitation.* INTO v_invitation
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.event_id = v_probe_event_id
    AND invitation.event_guest_id = v_probe_guest_id
    AND invitation.status = 'pending'
    AND invitation.attempt_number > 0
    AND invitation.recipient_email_canonical = v_actor_email
    AND (
      invitation.invitation_kind = 'identity_and_access'
      OR v_guest.linked_user_id = p_actor_id
    )
  FOR UPDATE;
  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invitation_not_found';
  END IF;
  IF v_invitation.expires_at <= pg_catalog.now() THEN
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      ARRAY[v_invitation.id], 'expired'
    );
    v_result := pg_catalog.jsonb_build_object('status', 'expired');
    PERFORM public.teskeid_event_attendance_finish_response_request(
      p_actor_id, p_request_id, v_result
    );
    RETURN v_result;
  END IF;
  IF p_action = 'decline' THEN
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      ARRAY[v_invitation.id], 'declined'
    );
    v_result := pg_catalog.jsonb_build_object('status', 'declined');
    PERFORM public.teskeid_event_attendance_finish_response_request(
      p_actor_id, p_request_id, v_result
    );
    RETURN v_result;
  END IF;

  IF v_invitation.invitation_kind = 'access_only' THEN
    IF v_guest.linked_user_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'teskeid_event_invitation_conflict';
    END IF;
  ELSE
    IF v_guest.linked_user_id IS NOT NULL
       AND v_guest.linked_user_id <> p_actor_id THEN
      RAISE EXCEPTION 'teskeid_event_invitation_conflict';
    END IF;
    IF v_guest.linked_user_id IS NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.teskeid_event_guests AS other_guest
        WHERE other_guest.event_id = v_invitation.event_id
          AND other_guest.status = 'active'
          AND other_guest.id <> v_guest.id
          AND other_guest.linked_user_id = p_actor_id
      ) THEN
        RAISE EXCEPTION 'teskeid_event_invitation_conflict';
      END IF;
      -- Move the invitation to accepted first, then issue an exact private
      -- transition capability whose composite FK proves this user/invite/
      -- Event/guest tuple. The guest guard consumes it in the next statement.
      UPDATE public.teskeid_event_guest_invitations AS invitation
      SET status = 'accepted',
          recipient_email_canonical = NULL,
          accepted_user_id = p_actor_id,
          accepted_at = pg_catalog.now(),
          terminal_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      WHERE invitation.id = v_invitation.id;
      INSERT INTO
        public.teskeid_event_guest_identity_mutation_authorizations (
          event_id, event_guest_id, action, actor_user_id,
          old_linked_user_id, new_linked_user_id,
          old_relationship_id, new_relationship_id,
          accepted_invitation_id
        ) VALUES (
          v_invitation.event_id, v_invitation.event_guest_id, 'accept',
          p_actor_id, NULL, p_actor_id,
          v_guest.relationship_id, v_guest.relationship_id,
          v_invitation.id
        );
      UPDATE public.teskeid_event_guests AS guest
      SET linked_user_id = p_actor_id
      WHERE guest.event_id = v_invitation.event_id
        AND guest.id = v_invitation.event_guest_id
        AND guest.status = 'active'
        AND guest.linked_user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'teskeid_event_invitation_conflict';
      END IF;
      v_identity_linked := true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
    WHERE membership.event_id = v_invitation.event_id
      AND (
        membership.user_id = p_actor_id
        OR membership.event_guest_id = v_invitation.event_guest_id
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;
  IF NOT v_identity_linked THEN
    UPDATE public.teskeid_event_guest_invitations AS invitation
    SET status = 'accepted',
        recipient_email_canonical = NULL,
        accepted_user_id = p_actor_id,
        accepted_at = pg_catalog.now(),
        terminal_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE invitation.id = v_invitation.id;
  END IF;
  INSERT INTO public.teskeid_event_attendance_memberships (
    event_id, event_guest_id, user_id, accepted_invitation_id, accepted_at
  ) VALUES (
    v_invitation.event_id, v_invitation.event_guest_id, p_actor_id,
    v_invitation.id, pg_catalog.now()
  );
  IF v_identity_linked THEN
    UPDATE public.teskeid_events AS event_row
    SET roster_revision = event_row.roster_revision + 1
    WHERE event_row.id = v_invitation.event_id;
  END IF;

  v_result := pg_catalog.jsonb_build_object('status', 'accepted');
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Preserve the SQL132 public signature and exact result keys while extending
-- its private cleanup before auth.users deletion. Event attendance never
-- touches financial history or turns attendance into financial membership.
CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_email_canonical text;
  v_locked_email text;
  v_locked_email_canonical text;
  v_account_present boolean := false;
  v_locked_account_present boolean := false;
  v_owner_user_id uuid;
  v_owner_user_ids uuid[] := ARRAY[]::uuid[];
  v_current_owner_user_ids uuid[] := ARRAY[]::uuid[];
  v_event_ids uuid[] := ARRAY[]::uuid[];
  v_current_event_ids uuid[] := ARRAY[]::uuid[];
  v_preferences integer := 0;
  v_snapshots integer := 0;
  v_members integer := 0;
  v_invitations integer := 0;
  v_event_links integer := 0;
  v_event_contexts integer := 0;
  v_v2_identity_links integer := 0;
  v_v2_events integer := 0;
  v_v2_receipts integer := 0;
  v_terminal_invitation_ids uuid[];
  v_attendance_invitation_ids uuid[];
  v_attendee_event_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 13302)
  );

  -- First take nonlocking snapshots used only to discover the complete lock
  -- domain. They are re-read after canonical advisories/rows are held; drift
  -- aborts the transaction instead of continuing on a partial snapshot.
  SELECT account.email INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_user_id;
  v_account_present := FOUND;
  v_email_canonical := public.normalize_email_canonical(v_email);

  SELECT COALESCE(pg_catalog.array_agg(owner_id ORDER BY owner_id),
                  ARRAY[]::uuid[])
  INTO v_owner_user_ids
  FROM (
    SELECT p_user_id AS owner_id
    UNION
    SELECT event_row.owner_user_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_user_id
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_guests AS guest
         WHERE guest.event_id = event_row.id
           AND guest.linked_user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
         WHERE membership.event_id = event_row.id
           AND membership.user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
         WHERE invitation.event_id = event_row.id
           AND (
             invitation.invited_by = p_user_id
             OR invitation.accepted_user_id = p_user_id
             OR (
               v_email_canonical IS NOT NULL
               AND invitation.status = 'pending'
               AND invitation.recipient_email_canonical = v_email_canonical
             )
           )
       )
       OR EXISTS (
         SELECT 1
         FROM public.teskeid_event_attendance_delivery_requests AS request_row
         JOIN public.teskeid_event_guest_invitations AS invitation
           ON invitation.id = request_row.invitation_id
         WHERE invitation.event_id = event_row.id
           AND request_row.actor_user_id = p_user_id
       )
  ) AS relevant_owner;
  FOREACH v_owner_user_id IN ARRAY v_owner_user_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_owner_user_id::text, 13201)
    );
  END LOOP;

  IF v_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_email_canonical, 9702)
    );
  END IF;

  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access_row
    WHERE access_row.feature_key IN (
        'utlagt-og-endurgreitt', 'afmaeli-og-vidburdir'
      )
      AND public.normalize_email_canonical(access_row.email) = v_email_canonical;
  END IF;

  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  WHERE group_row.id IN (
    SELECT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_user_id
    UNION
    SELECT invitation.group_id
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.invited_by = p_user_id
       OR (
         v_email_canonical IS NOT NULL
         AND invitation.status = 'pending'
         AND invitation.recipient_email_canonical = v_email_canonical
       )
    UNION
    SELECT context_row.group_id
    FROM public.expense_event_contexts AS context_row
    WHERE context_row.owner_user_id = p_user_id
    UNION
    SELECT participant.group_id
    FROM public.expense_event_participants AS participant
    WHERE participant.linked_user_id = p_user_id
    UNION
    SELECT link.group_id
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
    WHERE event_row.owner_user_id = p_user_id
  )
  ORDER BY group_row.id
  FOR UPDATE;

  -- Snapshot the complete affected Event set without row locks. Every known
  -- owner advisory is already held. A creator for an as-yet unknown owner must
  -- cross recipient 9602 before it can insert/link the guest, so the exact
  -- post-9602 comparison below either sees the new Event and aborts or the
  -- creator waits until deletion has finished.
  SELECT COALESCE(pg_catalog.array_agg(event_row.id ORDER BY event_row.id),
                  ARRAY[]::uuid[])
  INTO v_event_ids
  FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_guests AS guest
       WHERE guest.event_id = event_row.id
         AND guest.linked_user_id = p_user_id
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
       WHERE membership.event_id = event_row.id
         AND membership.user_id = p_user_id
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
       WHERE invitation.event_id = event_row.id
         AND (
           invitation.invited_by = p_user_id
           OR invitation.accepted_user_id = p_user_id
           OR (
             v_email_canonical IS NOT NULL
             AND invitation.status = 'pending'
             AND invitation.recipient_email_canonical = v_email_canonical
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_attendance_delivery_requests AS request_row
       JOIN public.teskeid_event_guest_invitations AS invitation
         ON invitation.id = request_row.invitation_id
       WHERE invitation.event_id = event_row.id
         AND request_row.actor_user_id = p_user_id
     );
  LOOP
    SELECT COALESCE(pg_catalog.array_agg(candidate.id), ARRAY[]::uuid[])
    INTO v_terminal_invitation_ids
    FROM (
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND (
          invitation.invited_by = p_user_id
          OR (
            v_email_canonical IS NOT NULL
            AND invitation.recipient_email_canonical = v_email_canonical
          )
        )
      ORDER BY invitation.id
      LIMIT 50
    ) AS candidate;
    EXIT WHEN pg_catalog.cardinality(v_terminal_invitation_ids) = 0;
    v_invitations := v_invitations
      + public.expense_terminalize_member_invitations(
          v_terminal_invitation_ids, 'cancelled'
        );
  END LOOP;

  UPDATE public.expense_member_invitations AS invitation
  SET invited_by = NULL,
      inviter_display_name_snapshot = NULL,
      guest_display_name_snapshot = NULL
  WHERE invitation.invited_by = p_user_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9602)
  );

  SELECT account.email INTO v_locked_email
  FROM auth.users AS account
  WHERE account.id = p_user_id
  FOR UPDATE OF account;
  v_locked_account_present := FOUND;
  v_locked_email_canonical := public.normalize_email_canonical(v_locked_email);
  IF v_locked_account_present IS DISTINCT FROM v_account_present
     OR v_locked_email_canonical IS DISTINCT FROM v_email_canonical THEN
    RAISE EXCEPTION 'expense_account_changed_retry';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(owner_id ORDER BY owner_id),
                  ARRAY[]::uuid[])
  INTO v_current_owner_user_ids
  FROM (
    SELECT p_user_id AS owner_id
    UNION
    SELECT event_row.owner_user_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_user_id
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_guests AS guest
         WHERE guest.event_id = event_row.id
           AND guest.linked_user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
         WHERE membership.event_id = event_row.id
           AND membership.user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
         WHERE invitation.event_id = event_row.id
           AND (
             invitation.invited_by = p_user_id
             OR invitation.accepted_user_id = p_user_id
             OR (
               v_email_canonical IS NOT NULL
               AND invitation.status = 'pending'
               AND invitation.recipient_email_canonical = v_email_canonical
             )
           )
       )
       OR EXISTS (
         SELECT 1
         FROM public.teskeid_event_attendance_delivery_requests AS request_row
         JOIN public.teskeid_event_guest_invitations AS invitation
           ON invitation.id = request_row.invitation_id
         WHERE invitation.event_id = event_row.id
           AND request_row.actor_user_id = p_user_id
       )
  ) AS relevant_owner;
  IF v_current_owner_user_ids IS DISTINCT FROM v_owner_user_ids THEN
    RAISE EXCEPTION 'expense_account_changed_retry';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(event_row.id ORDER BY event_row.id),
                  ARRAY[]::uuid[])
  INTO v_current_event_ids
  FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_guests AS guest
       WHERE guest.event_id = event_row.id
         AND guest.linked_user_id = p_user_id
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_attendance_memberships AS membership
       WHERE membership.event_id = event_row.id
         AND membership.user_id = p_user_id
     )
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
       WHERE invitation.event_id = event_row.id
         AND (
           invitation.invited_by = p_user_id
           OR invitation.accepted_user_id = p_user_id
           OR (
             v_email_canonical IS NOT NULL
             AND invitation.status = 'pending'
             AND invitation.recipient_email_canonical = v_email_canonical
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_attendance_delivery_requests AS request_row
       JOIN public.teskeid_event_guest_invitations AS invitation
         ON invitation.id = request_row.invitation_id
       WHERE invitation.event_id = event_row.id
         AND request_row.actor_user_id = p_user_id
     );
  IF v_current_event_ids IS DISTINCT FROM v_event_ids THEN
    RAISE EXCEPTION 'expense_account_changed_retry';
  END IF;

  -- No Event outside the probed set can now become linked to this identity.
  -- Lock the stable set only after recipient/auth serialization. New attendance
  -- paths take the relevant owner 13201 before recipient 9602, so unchanged
  -- SQL132 Event -> 9602 roster replacement cannot form an inverse cycle.
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = ANY(v_event_ids)
  ORDER BY event_row.id
  FOR UPDATE;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.linked_user_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.teskeid_events AS event_row
       WHERE event_row.id = guest.event_id
         AND event_row.owner_user_id = p_user_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_guest_invitations AS invitation
       WHERE invitation.event_id = guest.event_id
         AND invitation.event_guest_id = guest.id
         AND v_email_canonical IS NOT NULL
         AND invitation.status = 'pending'
         AND invitation.recipient_email_canonical = v_email_canonical
     )
  ORDER BY guest.event_id, guest.id
  FOR UPDATE;

  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
  WHERE event_row.owner_user_id = p_user_id
     OR invitation.invited_by = p_user_id
     OR invitation.accepted_user_id = p_user_id
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_guests AS linked_guest
       WHERE linked_guest.event_id = invitation.event_id
         AND linked_guest.id = invitation.event_guest_id
         AND linked_guest.linked_user_id = p_user_id
     )
     OR (
       v_email_canonical IS NOT NULL
       AND invitation.status = 'pending'
       AND invitation.recipient_email_canonical = v_email_canonical
     )
  ORDER BY invitation.event_id, invitation.event_guest_id, invitation.id
  FOR UPDATE OF invitation;

  PERFORM request_row.delivery_request_id
  FROM public.teskeid_event_attendance_delivery_requests AS request_row
  JOIN public.teskeid_event_guest_invitations AS invitation
    ON invitation.id = request_row.invitation_id
  JOIN public.teskeid_events AS event_row ON event_row.id = invitation.event_id
  WHERE request_row.actor_user_id = p_user_id
     OR event_row.owner_user_id = p_user_id
     OR invitation.accepted_user_id = p_user_id
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_guests AS linked_guest
       WHERE linked_guest.event_id = invitation.event_id
         AND linked_guest.id = invitation.event_guest_id
         AND linked_guest.linked_user_id = p_user_id
     )
     OR (
       v_email_canonical IS NOT NULL
       AND invitation.status = 'pending'
       AND invitation.recipient_email_canonical = v_email_canonical
     )
  ORDER BY request_row.invitation_id,
           request_row.attempt_number NULLS LAST,
           request_row.delivery_request_id
  FOR UPDATE OF request_row;

  DELETE FROM public.teskeid_event_attendance_delivery_requests AS request_row
  USING public.teskeid_event_guest_invitations AS invitation,
        public.teskeid_events AS event_row
  WHERE invitation.id = request_row.invitation_id
    AND event_row.id = invitation.event_id
    AND (
      request_row.actor_user_id = p_user_id
      OR event_row.owner_user_id = p_user_id
      OR invitation.accepted_user_id = p_user_id
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_guests AS linked_guest
        WHERE linked_guest.event_id = invitation.event_id
          AND linked_guest.id = invitation.event_guest_id
          AND linked_guest.linked_user_id = p_user_id
      )
      OR (
        v_email_canonical IS NOT NULL
        AND invitation.status = 'pending'
        AND invitation.recipient_email_canonical = v_email_canonical
      )
    );

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT guest.event_id ORDER BY guest.event_id),
    ARRAY[]::uuid[]
  ) INTO v_attendee_event_ids
  FROM public.teskeid_event_guests AS guest
  JOIN public.teskeid_events AS event_row ON event_row.id = guest.event_id
  WHERE guest.linked_user_id = p_user_id
    AND event_row.owner_user_id <> p_user_id;

  LOOP
    SELECT COALESCE(pg_catalog.array_agg(candidate.id), ARRAY[]::uuid[])
    INTO v_attendance_invitation_ids
    FROM (
      SELECT invitation.id
      FROM public.teskeid_event_guest_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND (
          invitation.invited_by = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.teskeid_events AS owned_event
            WHERE owned_event.id = invitation.event_id
              AND owned_event.owner_user_id = p_user_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.teskeid_event_guests AS linked_guest
            WHERE linked_guest.event_id = invitation.event_id
              AND linked_guest.id = invitation.event_guest_id
              AND linked_guest.linked_user_id = p_user_id
          )
          OR (
            v_email_canonical IS NOT NULL
            AND invitation.recipient_email_canonical = v_email_canonical
          )
        )
      ORDER BY invitation.id
      LIMIT 50
    ) AS candidate;
    EXIT WHEN pg_catalog.cardinality(v_attendance_invitation_ids) = 0;
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      v_attendance_invitation_ids, 'cancelled'
    );
  END LOOP;

  DELETE FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.user_id = p_user_id;
  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET status = 'left',
      accepted_user_id = NULL,
      recipient_email_canonical = NULL,
      terminal_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invitation.accepted_user_id = p_user_id
    AND invitation.status = 'accepted';
  DELETE FROM public.teskeid_event_attendance_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_user_id;

  INSERT INTO
    public.teskeid_event_guest_identity_mutation_authorizations (
      event_id, event_guest_id, action, actor_user_id,
      old_linked_user_id, new_linked_user_id,
      old_relationship_id, new_relationship_id,
      accepted_invitation_id
    )
  SELECT
    guest.event_id, guest.id, 'account_delete', p_user_id,
    guest.linked_user_id, NULL, guest.relationship_id, NULL, NULL
  FROM public.teskeid_event_guests AS guest
  WHERE guest.linked_user_id = p_user_id
  ORDER BY guest.event_id, guest.id;
  UPDATE public.teskeid_event_guests AS guest
  SET linked_user_id = NULL,
      relationship_id = NULL
  WHERE guest.linked_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_identity_links = ROW_COUNT;

  UPDATE public.teskeid_events AS event_row
  SET roster_revision = event_row.roster_revision + 1
  WHERE event_row.id = ANY(v_attendee_event_ids)
    AND event_row.owner_user_id <> p_user_id;

  DELETE FROM public.teskeid_events AS event_row
  WHERE event_row.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_events = ROW_COUNT;

  DELETE FROM public.teskeid_event_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_user_id;
  GET DIAGNOSTICS v_v2_receipts = ROW_COUNT;

  UPDATE public.expense_event_participants AS participant
  SET linked_user_id = NULL
  WHERE participant.linked_user_id = p_user_id;
  GET DIAGNOSTICS v_event_links = ROW_COUNT;

  DELETE FROM public.expense_event_contexts AS context_row
  WHERE context_row.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_event_contexts = ROW_COUNT;

  DELETE FROM public.expense_payment_preferences AS preference
  WHERE preference.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_preferences = ROW_COUNT;

  UPDATE public.expense_repayments AS repayment
  SET payment_preference_snapshot = NULL
  WHERE repayment.payment_preference_snapshot->>'owner_user_id' = p_user_id::text;
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  DELETE FROM public.recent_events AS event
  WHERE event.source = 'expenses'
    AND (event.user_id = p_user_id OR event.payload->>'actorUserId' = p_user_id::text);
  DELETE FROM public.expense_activity_audience AS audience
  WHERE audience.user_id = p_user_id;
  DELETE FROM public.expense_mutation_requests AS request
  WHERE request.actor_user_id = p_user_id;

  UPDATE public.expense_activity AS activity
  SET actor_user_id = NULL,
      actor_display_name = 'Teskeiðarnotandi'
  WHERE activity.actor_user_id = p_user_id;
  UPDATE public.expense_repayments AS repayment
  SET reported_by = NULL
  WHERE repayment.reported_by = p_user_id;
  UPDATE public.expenses AS expense
  SET created_by = NULL
  WHERE expense.created_by = p_user_id;
  UPDATE public.expense_groups AS group_row
  SET created_by = NULL
  WHERE group_row.created_by = p_user_id;

  UPDATE public.expense_group_members AS member
  SET user_id = NULL,
      status = CASE
        WHEN member.status IN ('invited', 'declined') THEN 'removed'
        ELSE member.status
      END
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'preferences_removed', v_preferences,
    'snapshots_removed', v_snapshots,
    'parties_unlinked', v_members,
    'invitations_scrubbed', v_invitations,
    'event_identity_links_unlinked', v_event_links,
    'event_contexts_removed', v_event_contexts,
    'v2_event_identity_links_unlinked', v_v2_identity_links,
    'v2_events_removed', v_v2_events,
    'v2_event_receipts_removed', v_v2_receipts
  );
END;
$function$;

-- Preserve the SQL132 tagged-expense signature/result while recognizing an
-- attendance-consented manual guest as a current account recipient. Expense
-- membership remains one-off until the separate Expense invite is accepted.
CREATE OR REPLACE FUNCTION public.teskeid_event_create_tagged_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_fingerprint text;
  v_fingerprint_payload jsonb;
  v_replay jsonb;
  v_expense_id uuid;
  v_inner_request_id uuid;
  v_group_id uuid;
  v_member_item jsonb;
  v_member_id uuid;
  v_event_guest_id uuid;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_relationship_id uuid;
  v_linked_recipient_email text;
  v_linked_user_ids uuid[] := ARRAY[]::uuid[];
  v_guest_link_probe jsonb := '[]'::jsonb;
  v_relationship_probe jsonb := '[]'::jsonb;
  v_serialization_email_snapshot jsonb := '{}'::jsonb;
  v_locked_serialization_email_snapshot jsonb := '{}'::jsonb;
  v_prelinked_email_snapshot jsonb := '{}'::jsonb;
  v_linked_email_snapshot jsonb := '{}'::jsonb;
  v_recipient_emails text[] := ARRAY[]::text[];
  v_recipient_email text;
  v_authoritative_display_name text;
  v_mapping_found boolean;
  v_resolved_members jsonb := '[]'::jsonb;
  v_event_invitations jsonb := '[]'::jsonb;
  v_all_invitations jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_canonical_result jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR (p_payload - ARRAY[
       'title', 'total_minor', 'currency', 'incurred_on', 'category', 'note',
       'split_method', 'one_off_members', 'payments', 'shares', 'obligations',
       'participant_invitations', 'event_guest_members'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_payload ?& ARRAY[
       'title', 'total_minor', 'currency', 'incurred_on', 'category', 'note',
       'split_method', 'one_off_members', 'payments', 'shares', 'obligations',
       'participant_invitations', 'event_guest_members'
     ]::text[])
     OR pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'total_minor') <> 'number'
     OR (p_payload->>'total_minor') !~ '^[0-9]+$'
     OR (p_payload->>'total_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
     OR pg_catalog.jsonb_typeof(p_payload->'currency') <> 'string'
     OR (p_payload->>'currency') !~ '^[A-Z]{3}$'
     OR pg_catalog.jsonb_typeof(p_payload->'incurred_on') <> 'string'
     OR (p_payload->>'incurred_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR (
       pg_catalog.jsonb_typeof(p_payload->'category') NOT IN ('string', 'null')
     )
     OR (
       pg_catalog.jsonb_typeof(p_payload->'note') NOT IN ('string', 'null')
     )
     OR pg_catalog.jsonb_typeof(p_payload->'split_method') <> 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'one_off_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'one_off_members')
          NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'payments') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'payments') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'shares') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'shares') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'obligations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'obligations') > 50
     OR pg_catalog.jsonb_typeof(p_payload->'participant_invitations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'participant_invitations') > 49
     OR pg_catalog.jsonb_typeof(p_payload->'event_guest_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'event_guest_members') > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       WHERE pg_catalog.jsonb_typeof(mapping.value) <> 'object'
          OR (mapping.value - ARRAY['event_guest_id', 'member_id']::text[])
            <> '{}'::jsonb
          OR NOT (mapping.value ?& ARRAY['event_guest_id', 'member_id']::text[])
          OR pg_catalog.jsonb_typeof(mapping.value->'event_guest_id') <> 'string'
          OR pg_catalog.jsonb_typeof(mapping.value->'member_id') <> 'string'
          OR (mapping.value->>'event_guest_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (mapping.value->>'member_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       GROUP BY mapping.value->>'event_guest_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
       GROUP BY mapping.value->>'member_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       WHERE pg_catalog.jsonb_typeof(invitation.value) <> 'object'
          OR NOT (invitation.value ? 'member_id')
          OR pg_catalog.jsonb_typeof(invitation.value->'member_id') <> 'string'
          OR (invitation.value->>'member_id')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (
            (invitation.value ? 'recipient_email')
              = (invitation.value ? 'relationship_id')
          )
          OR (
            invitation.value ? 'recipient_email'
            AND (
              (invitation.value - ARRAY['member_id', 'recipient_email']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(invitation.value->'recipient_email')
                <> 'string'
            )
          )
          OR (
            invitation.value ? 'relationship_id'
            AND (
              (invitation.value - ARRAY['member_id', 'relationship_id']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(invitation.value->'relationship_id')
                <> 'string'
              OR (invitation.value->>'relationship_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       GROUP BY invitation.value->>'member_id'
       HAVING pg_catalog.count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         p_payload->'participant_invitations'
       ) AS invitation(value)
       JOIN pg_catalog.jsonb_array_elements(
         p_payload->'event_guest_members'
       ) AS mapping(value)
         ON mapping.value->>'member_id' = invitation.value->>'member_id'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  -- Normalize only values whose display is server-authoritative. This keeps a
  -- lost-response replay stable across profile/relationship/roster label
  -- changes while manual-name and manual-email labels remain caller intent.
  SELECT pg_catalog.jsonb_set(
    p_payload,
    '{one_off_members}',
    COALESCE(pg_catalog.jsonb_agg(
      CASE WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(
          p_payload->'event_guest_members'
        ) AS mapping(value)
        WHERE mapping.value->>'member_id' = member.value->>'id'
      ) THEN member.value || pg_catalog.jsonb_build_object(
        'display_name', '__teskeid_server_event_guest__',
        'user_id', NULL,
        'role', 'member',
        'status', 'active'
      ) ELSE pg_catalog.jsonb_set(
        member.value, '{display_name}',
        COALESCE(pg_catalog.to_jsonb(CASE
          WHEN member.value->>'user_id' = p_actor_id::text
               AND member.value->>'role' = 'owner'
            THEN '__teskeid_server_owner__'
          WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(
              p_payload->'participant_invitations'
            ) AS invitation(value)
            WHERE invitation.value->>'member_id' = member.value->>'id'
              AND invitation.value ? 'relationship_id'
          ) THEN '__teskeid_server_relationship__'
          ELSE pg_catalog.btrim(member.value->>'display_name')
        END), 'null'::jsonb), true
      ) END ORDER BY member.ordinal
    ), '[]'::jsonb),
    true
  )
  INTO v_fingerprint_payload
  FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
    WITH ORDINALITY AS member(value, ordinal);

  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{title}',
    pg_catalog.to_jsonb(pg_catalog.btrim(p_payload->>'title')), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{category}',
    COALESCE(pg_catalog.to_jsonb(NULLIF(
      pg_catalog.btrim(p_payload->>'category'), ''
    )), 'null'::jsonb), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload, '{note}',
    COALESCE(pg_catalog.to_jsonb(NULLIF(
      pg_catalog.btrim(p_payload->>'note'), ''
    )), 'null'::jsonb), true
  );
  v_fingerprint_payload := pg_catalog.jsonb_set(
    v_fingerprint_payload,
    '{participant_invitations}',
    COALESCE((
      SELECT pg_catalog.jsonb_agg(CASE
        WHEN invitation.value ? 'recipient_email' THEN pg_catalog.jsonb_set(
          invitation.value, '{recipient_email}',
          pg_catalog.to_jsonb(public.normalize_email_canonical(
            invitation.value->>'recipient_email'
          )), true
        ) ELSE invitation.value
      END ORDER BY invitation.ordinal)
      FROM pg_catalog.jsonb_array_elements(
        p_payload->'participant_invitations'
      ) WITH ORDINALITY AS invitation(value, ordinal)
    ), '[]'::jsonb),
    true
  );

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'payload', v_fingerprint_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_create_tagged_expense',
    v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Probe every mapped guest without a row lock, then lock all currently
  -- linked recipient identities in UUID order before the Event. The exact
  -- guest/link set is revalidated after the canonical Event -> guest locks.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'event_guest_id', guest.id,
    'linked_user_id', guest.linked_user_id,
    'source_kind', guest.source_kind,
    'email_canonical', guest.email_canonical
  ) ORDER BY guest.id), '[]'::jsonb)
  INTO v_guest_link_probe
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
   AND guest.status = 'active'
  JOIN pg_catalog.jsonb_array_elements(
    p_payload->'event_guest_members'
  ) AS mapping(value)
    ON guest.id = (mapping.value->>'event_guest_id')::uuid
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id;
  IF pg_catalog.jsonb_array_length(v_guest_link_probe)
       <> pg_catalog.jsonb_array_length(
            p_payload->'event_guest_members'
          ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relationship_id', relationship.id,
    'linked_user_id', relationship.counterpart_user_id
  ) ORDER BY relationship.id), '[]'::jsonb)
  INTO v_relationship_probe
  FROM pg_catalog.jsonb_array_elements(
    p_payload->'participant_invitations'
  ) AS invitation(value)
  JOIN public.relationships AS relationship
    ON relationship.id = (invitation.value->>'relationship_id')::uuid
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id IS NOT NULL
   AND relationship.counterpart_user_id <> p_actor_id
  WHERE invitation.value ? 'relationship_id';
  IF pg_catalog.jsonb_array_length(v_relationship_probe) <> (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'participant_invitations'
    ) AS invitation(value)
    WHERE invitation.value ? 'relationship_id'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT linked_recipient.user_id ORDER BY linked_recipient.user_id
  ), ARRAY[]::uuid[])
  INTO v_linked_user_ids
  FROM (
    SELECT (probe.value->>'linked_user_id')::uuid AS user_id
    FROM pg_catalog.jsonb_array_elements(v_guest_link_probe) AS probe(value)
    WHERE probe.value->>'linked_user_id' IS NOT NULL
    UNION ALL
    SELECT (probe.value->>'linked_user_id')::uuid AS user_id
    FROM pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
  ) AS linked_recipient;

  -- Probe confirmed linked-account emails without locks only to derive the
  -- canonical 9702 set. The private helper later acquires sorted 9602 + auth
  -- FOR SHARE and the exact snapshot must match or the transaction aborts.
  SELECT COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    public.normalize_email_canonical(account.email)
    ORDER BY account.id
  ), '{}'::jsonb), COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    CASE WHEN account.email_confirmed_at IS NOT NULL
      THEN public.normalize_email_canonical(account.email) ELSE NULL END
    ORDER BY account.id
  ), '{}'::jsonb)
  INTO v_serialization_email_snapshot, v_prelinked_email_snapshot
  FROM auth.users AS account
  WHERE account.id = ANY(v_linked_user_ids);

  SELECT COALESCE(pg_catalog.array_agg(
    DISTINCT recipient.email ORDER BY recipient.email
  ), ARRAY[]::text[])
  INTO v_recipient_emails
  FROM (
    SELECT public.normalize_email_canonical(
      invitation.value->>'recipient_email'
    ) AS email
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'participant_invitations'
    ) AS invitation(value)
    WHERE invitation.value ? 'recipient_email'
    UNION ALL
    SELECT probe.value->>'email_canonical' AS email
    FROM pg_catalog.jsonb_array_elements(v_guest_link_probe) AS probe(value)
    WHERE probe.value->>'source_kind' = 'manual_email'
      AND probe.value->>'linked_user_id' IS NULL
    UNION ALL
    SELECT linked_email.value AS email
    FROM pg_catalog.jsonb_each_text(v_serialization_email_snapshot)
      AS linked_email(key, value)
  ) AS recipient
  WHERE recipient.email IS NOT NULL;
  FOREACH v_recipient_email IN ARRAY v_recipient_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email, 9702)
    );
  END LOOP;

  -- SQL110 takes 11002 before any Expense group lock. Pre-acquire the same
  -- sorted recipient set before 9602/auth so a mixed payload cannot hold a
  -- relationship identity lock while waiting on a raw-email invitation lock.
  FOREACH v_recipient_email IN ARRAY v_recipient_emails LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email, 11002)
    );
  END LOOP;

  v_linked_email_snapshot :=
    public.teskeid_event_attendance_lock_user_emails(v_linked_user_ids);
  IF v_linked_email_snapshot IS DISTINCT FROM v_prelinked_email_snapshot THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_object_agg(
    account.id::text,
    public.normalize_email_canonical(account.email)
    ORDER BY account.id
  ), '{}'::jsonb)
  INTO v_locked_serialization_email_snapshot
  FROM auth.users AS account
  WHERE account.id = ANY(v_linked_user_ids);
  IF v_locked_serialization_email_snapshot IS DISTINCT FROM
       v_serialization_email_snapshot THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;

  PERFORM relationship.id
  FROM public.relationships AS relationship
  JOIN pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
    ON relationship.id = (probe.value->>'relationship_id')::uuid
   AND relationship.owner_id = p_actor_id
   AND relationship.counterpart_user_id =
     (probe.value->>'linked_user_id')::uuid
  ORDER BY relationship.id
  FOR SHARE OF relationship;
  IF NOT FOUND AND pg_catalog.jsonb_array_length(v_relationship_probe) > 0 THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.relationships AS relationship
    JOIN pg_catalog.jsonb_array_elements(v_relationship_probe) AS probe(value)
      ON relationship.id = (probe.value->>'relationship_id')::uuid
     AND relationship.owner_id = p_actor_id
     AND relationship.counterpart_user_id =
       (probe.value->>'linked_user_id')::uuid
  ) <> pg_catalog.jsonb_array_length(v_relationship_probe) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
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

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  JOIN pg_catalog.jsonb_array_elements(
    p_payload->'event_guest_members'
  ) AS mapping(value)
    ON guest.id = (mapping.value->>'event_guest_id')::uuid
  WHERE guest.event_id = p_event_id
  ORDER BY guest.id
  FOR SHARE OF guest;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'event_guest_members'
    ) AS mapping(value)
    JOIN public.teskeid_event_guests AS current_guest
      ON current_guest.event_id = p_event_id
     AND current_guest.id = (mapping.value->>'event_guest_id')::uuid
    LEFT JOIN pg_catalog.jsonb_array_elements(v_guest_link_probe)
      AS probe(value)
      ON probe.value->>'event_guest_id' = current_guest.id::text
    WHERE current_guest.status <> 'active'
       OR probe.value IS NULL
       OR current_guest.linked_user_id IS DISTINCT FROM
          (probe.value->>'linked_user_id')::uuid
       OR current_guest.source_kind IS DISTINCT FROM
          probe.value->>'source_kind'
       OR current_guest.email_canonical IS DISTINCT FROM
          NULLIF(probe.value->>'email_canonical', '')
  ) THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  FOR v_member_item IN
    SELECT member.value
    FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
      WITH ORDINALITY AS member(value, ordinal)
    ORDER BY member.ordinal
  LOOP
    v_member_id := NULL;
    BEGIN
      v_member_id := (v_member_item->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END;

    SELECT
      (mapping.value->>'event_guest_id')::uuid,
      true
    INTO v_event_guest_id, v_mapping_found
    FROM pg_catalog.jsonb_array_elements(
      p_payload->'event_guest_members'
    ) AS mapping(value)
    WHERE (mapping.value->>'member_id')::uuid = v_member_id;

    IF COALESCE(v_mapping_found, false) THEN
      SELECT guest.* INTO v_guest
      FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = p_event_id
        AND guest.id = v_event_guest_id
        AND guest.status = 'active';
      IF v_guest.id IS NULL THEN
        RAISE EXCEPTION 'teskeid_event_roster_conflict';
      END IF;

      v_resolved_members := v_resolved_members || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_member_id,
          'user_id', NULL,
          'display_name', v_guest.display_name_snapshot,
          'role', 'member',
          'status', 'active'
        )
      );
      v_sources := v_sources || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'event_guest_id', v_event_guest_id,
          'member_id', v_member_id
        )
      );

      IF v_guest.linked_user_id IS NOT NULL
         AND v_guest.source_kind IN ('manual_name', 'manual_email') THEN
        -- Event identity consent is not Expense consent. Keep the financial
        -- member one-off/user_id NULL, but invite the currently confirmed
        -- canonical account email through the normal Expense flow.
        v_linked_recipient_email := v_linked_email_snapshot
          ->> v_guest.linked_user_id::text;
        IF v_linked_recipient_email IS NULL THEN
          RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
        END IF;
        v_event_invitations := v_event_invitations
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'member_id', v_member_id,
            'recipient_email', v_linked_recipient_email
          ));
      ELSIF v_guest.source_kind = 'manual_email' THEN
        v_event_invitations := v_event_invitations
          || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'member_id', v_member_id,
            'recipient_email', v_guest.email_canonical
          ));
      ELSIF v_guest.source_kind = 'relationship' THEN
        -- Account/relationship deletion must not strand an active owner-private
        -- roster snapshot. If no current actor-owned relationship resolves,
        -- retain the snapshot as a null-user financial member and create no
        -- invitation or access edge. Provenance still points at the event guest.
        v_relationship_id := NULL;
        IF v_guest.linked_user_id IS NOT NULL THEN
          SELECT relationship.id INTO v_relationship_id
          FROM public.relationships AS relationship
          WHERE relationship.owner_id = p_actor_id
            AND relationship.counterpart_user_id = v_guest.linked_user_id
            AND (
              v_guest.relationship_id IS NULL
              OR relationship.id = v_guest.relationship_id
            )
          ORDER BY relationship.id
          LIMIT 1;
        END IF;
        IF v_relationship_id IS NOT NULL THEN
          v_event_invitations := v_event_invitations
            || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
              'member_id', v_member_id,
              'relationship_id', v_relationship_id
            ));
        END IF;
      END IF;
    ELSE
      v_authoritative_display_name := NULL;
      IF v_member_item->>'user_id' = p_actor_id::text
         AND v_member_item->>'role' = 'owner' THEN
        SELECT COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''),
          'Teskeiðarnotandi')
        INTO v_authoritative_display_name
        FROM auth.users AS account
        LEFT JOIN public.profiles AS profile ON profile.id = account.id
        WHERE account.id = p_actor_id;
      ELSE
        SELECT COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''),
          'Teskeiðarnotandi')
        INTO v_authoritative_display_name
        FROM pg_catalog.jsonb_array_elements(
          p_payload->'participant_invitations'
        ) AS invitation(value)
        JOIN public.relationships AS relationship
          ON relationship.id = (invitation.value->>'relationship_id')::uuid
         AND relationship.owner_id = p_actor_id
         AND relationship.counterpart_user_id IS NOT NULL
         AND relationship.counterpart_user_id <> p_actor_id
        JOIN auth.users AS account
          ON account.id = relationship.counterpart_user_id
        LEFT JOIN public.profiles AS profile ON profile.id = account.id
        WHERE invitation.value->>'member_id' = v_member_id::text
          AND invitation.value ? 'relationship_id';
      END IF;

      IF v_authoritative_display_name IS NOT NULL THEN
        v_member_item := pg_catalog.jsonb_set(
          v_member_item, '{display_name}',
          pg_catalog.to_jsonb(pg_catalog.left(
            v_authoritative_display_name, 120
          )), true
        );
      END IF;
      v_resolved_members := v_resolved_members
        || pg_catalog.jsonb_build_array(v_member_item);
    END IF;

    v_event_guest_id := NULL;
    v_mapping_found := false;
    v_guest := NULL;
    v_relationship_id := NULL;
    v_linked_recipient_email := NULL;
    v_authoritative_display_name := NULL;
  END LOOP;

  IF pg_catalog.jsonb_array_length(v_sources)
       <> pg_catalog.jsonb_array_length(p_payload->'event_guest_members') THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;
  v_all_invitations := p_payload->'participant_invitations'
    || v_event_invitations;

  v_expense_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense-inner-request:'
      || p_actor_id::text || ':' || p_request_id::text
  );

  v_canonical_result := public.expense_create_expense_with_participants(
    p_actor_id,
    v_inner_request_id,
    v_expense_id,
    NULL,
    p_payload->>'title',
    (p_payload->>'total_minor')::bigint,
    p_payload->>'currency',
    (p_payload->>'incurred_on')::date,
    p_payload->>'category',
    p_payload->>'note',
    p_payload->>'split_method',
    v_resolved_members,
    p_payload->'payments',
    p_payload->'shares',
    p_payload->'obligations',
    v_all_invitations
  );
  BEGIN
    v_group_id := (v_canonical_result->>'group_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'teskeid_event_expense_create_failed';
  END;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_expense_create_failed';
  END IF;

  INSERT INTO public.teskeid_event_expense_links (
    event_id, group_id, expense_id, linked_by_user_id
  ) VALUES (
    p_event_id, v_group_id, v_expense_id, p_actor_id
  );

  INSERT INTO public.teskeid_event_expense_participant_sources (
    event_id, group_id, expense_id, event_guest_id, expense_member_id
  )
  SELECT
    p_event_id,
    v_group_id,
    v_expense_id,
    (source.value->>'event_guest_id')::uuid,
    (source.value->>'member_id')::uuid
  FROM pg_catalog.jsonb_array_elements(v_sources) AS source(value);

  PERFORM public.teskeid_event_assert_expense_link(
    p_event_id, v_group_id, v_expense_id
  );

  v_result := pg_catalog.jsonb_build_object(
    'group_id', v_group_id,
    'expense_id', v_expense_id,
    'invitation_ids', COALESCE(
      v_canonical_result->'invitation_ids', '[]'::jsonb
    )
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Narrow Expense-owner/admin projection used only to mask recipient emails for
-- event-derived one-off members. It intentionally does not require Events
-- access and returns no Event, guest, identity, label, email or amount data.
CREATE FUNCTION public.teskeid_event_get_expense_member_sources(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_member_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_actor_id IS NULL OR p_group_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
     )
     OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF COALESCE(v_role, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(
      source_row.expense_member_id ORDER BY source_row.expense_member_id
    ),
    ARRAY[]::uuid[]
  ) INTO v_member_ids
  FROM (
    SELECT DISTINCT source.expense_member_id
    FROM public.teskeid_event_expense_participant_sources AS source
    WHERE source.group_id = p_group_id
    ORDER BY source.expense_member_id
    LIMIT 51
  ) AS source_row;
  -- Never truncate this privacy provenance set: an omitted 51st member could
  -- make the caller render a current recipient email. Fail closed instead.
  IF pg_catalog.cardinality(v_member_ids) > 50 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'member_ids', pg_catalog.to_jsonb(v_member_ids)
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_leave_attendance(
  p_actor_id uuid,
  p_event_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;
  v_probe_guest_id uuid;
  v_probe_invitation_id uuid;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  -- Withdrawing consent is session-only and must remain available even after
  -- the actor loses the per-user Events entitlement.
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id
  )::text);
  v_replay := public.teskeid_event_attendance_begin_response_request(
    p_actor_id, p_request_id,
    'teskeid_event_leave_attendance', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  SELECT membership.event_guest_id, membership.accepted_invitation_id
  INTO v_probe_guest_id, v_probe_invitation_id
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.user_id = p_actor_id;
  IF v_probe_guest_id IS NULL OR v_probe_invitation_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  PERFORM event_row.id FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id <> p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM guest.id FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = v_probe_guest_id
    AND guest.status = 'active'
    AND guest.linked_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM invitation.id
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = v_probe_invitation_id
    AND invitation.event_id = p_event_id
    AND invitation.event_guest_id = v_probe_guest_id
    AND invitation.accepted_user_id = p_actor_id
    AND invitation.status = 'accepted'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  SELECT membership.* INTO v_membership
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.event_guest_id = v_probe_guest_id
    AND membership.user_id = p_actor_id
    AND membership.accepted_invitation_id = v_probe_invitation_id
  FOR UPDATE;
  IF v_membership.event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  DELETE FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.user_id = p_actor_id;
  UPDATE public.teskeid_event_guest_invitations AS invitation
  SET status = 'left',
      recipient_email_canonical = NULL,
      terminal_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invitation.id = v_membership.accepted_invitation_id
    AND invitation.status = 'accepted';
  v_result := pg_catalog.jsonb_build_object('status', 'left');
  PERFORM public.teskeid_event_attendance_finish_response_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_attendance_mask_email(text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_safe_guest_label(text,text,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_lock_user_emails(uuid[])
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_terminalize_invitations(uuid[],text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_sweep_expired(integer,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_session_actor(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_guest_update() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_identity_authorization_commit()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_guard_attendance_receipt_mutation()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_attendance_integrity(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attendance_integrity_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_guest_attendance_state(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_for_actor(uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_attendee_view(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_guest_attendance_preview(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_member_sources(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_attendance(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.expense_prepare_account_deletion(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_attendance_mask_email(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_safe_guest_label(text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_lock_user_emails(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_terminalize_invitations(uuid[],text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_sweep_expired(integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_session_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_guest_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_identity_authorization_commit()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_guard_attendance_receipt_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_attendance_integrity(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attendance_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_guest_attendance_state(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list_for_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_attendee_view(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_guest_attendance_preview(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_member_sources(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_leave_attendance(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_guest_attendance_state(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list_for_actor(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_attendee_view(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_guest_attendance_preview(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_member_sources(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_leave_attendance(uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_prepare_account_deletion(uuid)
  TO service_role;

DO $teskeid_event_attendance_final_attestation$
DECLARE
  v_expected record;
  v_relation text;
  v_count bigint;
  v_digest text;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_attendance_mask_email(text)', false),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)', false),
      ('public.teskeid_event_attendance_lock_user_emails(uuid[])', false),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)', false),
      ('public.teskeid_event_attendance_sweep_expired(integer,uuid)', false),
      ('public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)', false),
      ('public.teskeid_event_assert_session_actor(uuid)', false),
      ('public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)', false),
      ('public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)', false),
      ('public.teskeid_event_guard_guest_update()', false),
      ('public.teskeid_event_guard_identity_authorization_commit()', false),
      ('public.teskeid_event_guard_attendance_receipt_mutation()', false),
      ('public.teskeid_event_assert_attendance_integrity(uuid,uuid)', false),
      ('public.teskeid_event_attendance_integrity_trigger()', false),
      ('public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)', true),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)', true),
      ('public.teskeid_event_get_guest_attendance_state(uuid,uuid)', true),
      ('public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)', true),
      ('public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)', true),
      ('public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)', true),
      ('public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)', true),
      ('public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)', true),
      ('public.teskeid_event_list_for_actor(uuid)', true),
      ('public.teskeid_event_get_attendee_view(uuid,uuid)', true),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)', true),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)', true),
      ('public.teskeid_event_get_expense_member_sources(uuid,uuid)', true),
      ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)', true),
      ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', true),
      ('public.expense_prepare_account_deletion(uuid)', true)
    ) AS expected(signature, service_execute)
  LOOP
    IF pg_catalog.to_regprocedure(v_expected.signature) IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_expected.service_execute
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
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
        )
    ) THEN
      RAISE EXCEPTION 'teskeid_event_attendance_function_acl_failed:%',
        v_expected.signature;
    END IF;
    IF (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = pg_catalog.split_part(
          pg_catalog.split_part(v_expected.signature, '(', 1), '.', 2
        )
    ) <> 1 THEN
      RAISE EXCEPTION 'teskeid_event_attendance_function_overload:%',
        v_expected.signature;
    END IF;
  END LOOP;

  -- Same-transaction exact contract gate. Postflight repeats this map after
  -- commit, but the migration must also fail atomically if any declaration,
  -- body, return shape or semantic function attribute differs.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.expense_prepare_account_deletion(uuid)', 'jsonb', '0562edbfaa608cead23d23d49ec36a66', true, 'p_user_id uuid'),
      ('public.teskeid_event_assert_attendance_integrity(uuid,uuid)', 'void', '2870ed4aed519757199fbb19c0ce3975', false, 'p_event_id uuid, p_event_guest_id uuid'),
      ('public.teskeid_event_assert_session_actor(uuid)', 'void', '30238c0def94d573fd8265fd94da0757', false, 'p_actor_id uuid'),
      ('public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)', 'jsonb', '004d1a7505bf9eb03b9f06e1a265aed6', false, 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text'),
      ('public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)', 'jsonb', '68881d52023265e7edd893f727a16381', false, 'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_recipient_email text, p_invitation_kind text'),
      ('public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)', 'void', '3d9b5a2dc3cb0806802b48739169cb52', false, 'p_actor_id uuid, p_request_id uuid, p_result jsonb'),
      ('public.teskeid_event_attendance_integrity_trigger()', 'trigger', '776d0e3518021fb21bbcac1f8154ead9', false, ''),
      ('public.teskeid_event_attendance_lock_user_emails(uuid[])', 'jsonb', 'a746f7835eba9f759e6ae8af0d51f46f', false, 'p_user_ids uuid[]'),
      ('public.teskeid_event_attendance_mask_email(text)', 'text', '9eb6ce4530f4c816d4cc0c35ec022110', false, 'p_email text'),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)', 'text', '2377be525ed29f2d4bc26d453fa8cf51', false, 'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid'),
      ('public.teskeid_event_attendance_sweep_expired(integer,uuid)', 'integer', '087ba1156dd8f01f25673dc6b11dd21b', false, 'p_limit integer, p_exclude_invitation_id uuid'),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)', 'integer', 'a2a85bca2a456177ab67b7817dc6e19d', false, 'p_invitation_ids uuid[], p_status text'),
      ('public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)', 'jsonb', 'd9a5936ecafef2fb21e65bfd973f5405', true, 'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_invitation_id uuid, p_expected_roster_revision bigint, p_request_id uuid'),
      ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', 'jsonb', '712497ed70ba83a63008b2cf58fbaff3', true, 'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb'),
      ('public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)', 'jsonb', '018e330369033e939d9ada7b08e18516', true, 'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb'),
      ('public.teskeid_event_get_attendee_view(uuid,uuid)', 'jsonb', 'd93ffd501b56cdab685208093199a999', true, 'p_actor_id uuid, p_event_id uuid'),
      ('public.teskeid_event_get_expense_member_sources(uuid,uuid)', 'jsonb', '32c189f5633b17b68859e0f5da05ac94', true, 'p_actor_id uuid, p_group_id uuid'),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)', 'jsonb', '347c46a906dd1e1ce57807e2b399e80d', true, 'p_actor_id uuid, p_invitation_id uuid'),
      ('public.teskeid_event_get_guest_attendance_state(uuid,uuid)', 'jsonb', '0f8841e5f23fca8e5fc0ecae1cbf1557', true, 'p_actor_id uuid, p_event_id uuid'),
      ('public.teskeid_event_guard_attendance_receipt_mutation()', 'trigger', '2684938d7e8064656c58cc1f6e90ee53', false, ''),
      ('public.teskeid_event_guard_guest_update()', 'trigger', 'fc0f737a5c5757b621577e39e4f75b4e', false, ''),
      ('public.teskeid_event_guard_identity_authorization_commit()', 'trigger', '9b265d58159dadeb0ea1eb492aae085d', false, ''),
      ('public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)', 'jsonb', '23eea91f0b5ec29c50b3615c9cadcdfe', true, 'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_request_id uuid, p_recipient_email text'),
      ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)', 'jsonb', 'adc9e9bb4bb79081112c69dd00a6cdff', true, 'p_actor_id uuid, p_event_id uuid, p_request_id uuid'),
      ('public.teskeid_event_list_for_actor(uuid)', 'jsonb', 'b932c0d12fdb09e4ea184ead2607e4ff', true, 'p_actor_id uuid'),
      ('public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)', 'jsonb', 'a9a8e144423ce75d9c6556ec0fd62ff5', true, 'p_actor_id uuid, p_invitation_id uuid'),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)', 'jsonb', '0022e19d8853709247583b7ddb38ef45', true, 'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb'),
      ('public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)', 'jsonb', 'b38cd3a8ca639a4e0d42eddabec099d8', true, 'p_actor_id uuid, p_invitation_id uuid, p_delivery_request_id uuid, p_recipient_hash text, p_actor_recipient_rate_hash text, p_actor_total_rate_hash text, p_rate_limit_window_date date'),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)', 'jsonb', '6a9c34c368384415aa0a8ac4545b8f07', true, 'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid'),
      ('public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)', 'text', 'c68d4626399e3adb483fc6c3e575f132', true, 'p_actor_id uuid, p_invitation_id uuid, p_attempt_number integer, p_status text')
    ) AS expected(
      signature, return_type, source_md5, service_execute, exact_arguments
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
              v_expected.signature
            )
        AND procedure_row.prokind = 'f'
        AND language_row.lanname = 'plpgsql'
        AND procedure_row.provolatile = CASE v_expected.signature
          WHEN 'public.teskeid_event_attendance_mask_email(text)'
            THEN 'i'::"char"
          WHEN 'public.teskeid_event_attendance_safe_guest_label(text,text,uuid)'
            THEN 's'::"char"
          WHEN 'public.teskeid_event_assert_session_actor(uuid)'
            THEN 's'::"char"
          WHEN 'public.teskeid_event_get_expense_member_sources(uuid,uuid)'
            THEN 's'::"char"
          ELSE 'v'::"char" END
        AND procedure_row.proparallel = 'u'::"char"
        AND NOT procedure_row.proisstrict
        AND NOT procedure_row.proleakproof
        AND procedure_row.prorettype = pg_catalog.to_regtype(
          v_expected.return_type
        )
        AND NOT procedure_row.proretset
        AND pg_catalog.pg_get_function_result(procedure_row.oid) =
          v_expected.return_type
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          v_expected.exact_arguments
        AND procedure_row.pronargdefaults = 0
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_expected.source_md5
    ) THEN
      RAISE EXCEPTION 'teskeid_event_attendance_function_contract_failed:%',
        v_expected.signature;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_event_guest_invitations'),
      ('teskeid_event_attendance_memberships'),
      ('teskeid_event_attendance_mutation_requests'),
      ('teskeid_event_attendance_delivery_requests'),
      ('teskeid_event_guest_identity_mutation_authorizations')
    ) AS expected(table_name)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
     AND relation.relkind = 'r'
     AND relation.relrowsecurity
     AND relation.relforcerowsecurity
     AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
     AND NOT pg_catalog.has_table_privilege(
       'anon', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_table_privilege(
       'authenticated', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_table_privilege(
       'service_role', relation.oid,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'anon', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'authenticated', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT pg_catalog.has_any_column_privilege(
       'service_role', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid = relation.oid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(
         relation.relacl, pg_catalog.acldefault('r', relation.relowner)
       )) AS privilege
       WHERE privilege.grantee <> relation.relowner
          OR privilege.is_grantable
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (
           privilege.grantee <> relation.relowner OR privilege.is_grantable
         )
     )
  ) <> 5 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_table_privacy_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_event_guest_invitations',
        'f80c3ed0dc17bc09089b091751057ced'),
      ('teskeid_event_attendance_memberships',
        '279b55a946f0b59b1f8143f8d23bd055'),
      ('teskeid_event_attendance_mutation_requests',
        'a8aa1e56d297ce8c4823451ad43875c1'),
      ('teskeid_event_attendance_delivery_requests',
        'f93cea30bf1bca34f03446e4f3f017ae'),
      ('teskeid_event_guest_identity_mutation_authorizations',
        '448f222c898a79a3357fa599aef79546')
    ) AS expected(table_name, column_contract_md5)
    JOIN LATERAL (
      SELECT pg_catalog.md5(pg_catalog.string_agg(
        column_row.column_name || ':' || column_row.data_type || ':'
          || column_row.is_nullable || ':' || COALESCE(
            pg_catalog.lower(pg_catalog.replace(pg_catalog.replace(
              pg_catalog.regexp_replace(pg_catalog.regexp_replace(
                pg_catalog.pg_get_expr(
                  default_row.adbin, default_row.adrelid
                ), '::[a-z0-9_]+(\[\])?', '', 'g'
              ), '[[:space:]()''"]', '', 'g'), 'public.', ''
            ), 'pg_catalog.', '')), '-'
          ), ',' ORDER BY column_row.ordinal_position
      )) AS column_contract_md5
      FROM information_schema.columns AS column_row
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = pg_catalog.to_regclass(
             'public.' || expected.table_name
           )
       AND attribute.attname = column_row.column_name
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      LEFT JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute.attrelid
       AND default_row.adnum = attribute.attnum
      WHERE column_row.table_schema = 'public'
        AND column_row.table_name = expected.table_name
    ) AS actual
      ON actual.column_contract_md5 = expected.column_contract_md5
  ) <> 5 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_column_contract_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
      'public.teskeid_event_guests'
    )
      AND constraint_row.conname = 'teskeid_event_guests_identity_shape_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'checksource_kind=manual_nameandemail_canonicalisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_attendance_guest_constraint_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_events', 'teskeid_events_id_owner_key'),
      ('teskeid_event_guests',
        'teskeid_event_guests_event_id_id_linked_key'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_identity_key'),
      ('teskeid_event_guest_invitations',
        'teskeid_event_guest_invitations_owner_key'),
      ('teskeid_event_attendance_memberships',
        'teskeid_event_attendance_memberships_invitation_fk'),
      ('teskeid_event_attendance_delivery_requests',
        'teskeid_event_attendance_delivery_invitation_attempt_key'),
      ('teskeid_event_guest_identity_mutation_authorizations',
        'teskeid_event_guest_identity_mutation_authorizations_invite_fk')
    ) AS expected(table_name, constraint_name)
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
           'public.' || expected.table_name
         )
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.convalidated
  ) <> 7 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_critical_constraint_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(constraint_row.oid)
    FROM (VALUES
      ('teskeid_events', 'teskeid_events_id_owner_key', '701f1f848052d0743e2750523750bb3b', 'u', false, false),
      ('teskeid_event_guests', 'teskeid_event_guests_event_id_id_linked_key', '90dd7146ed3df819adba5e6d2892101d', 'u', false, false),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_pkey', '90276e02fff47d56621d4ea4039fa4fd', 'p', false, false),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_event_guest_fk', 'e30bc7454800b3b640f5c71ad4904d8b', 'f', false, false),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_owner_fk', '7c01e7245bc3d495698b5700b5749ea4', 'f', false, false),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_accepted_user_fk', 'd2c63a025432fe3658166ce54f45c7d8', 'f', true, true),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_identity_key', '3615b06f968c41e01bce6da061f85b51', 'u', false, false),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_owner_key', '4daa07ce723479bc9b766c0d29754164', 'u', false, false),
      ('teskeid_event_attendance_memberships', 'teskeid_event_attendance_memberships_pkey', 'd38ccf6e3c2749ce16c83b6110afbca9', 'p', false, false),
      ('teskeid_event_attendance_memberships', 'teskeid_event_attendance_memberships_guest_fk', '85b2d4b9ff75e94876239c15bea92d02', 'f', true, true),
      ('teskeid_event_attendance_memberships', 'teskeid_event_attendance_memberships_user_fk', 'c467eee102776713a837cf77fd7f87f8', 'f', false, false),
      ('teskeid_event_attendance_memberships', 'teskeid_event_attendance_memberships_invitation_fk', '41de059d1779a6496a35cbcec6907614', 'f', true, true),
      ('teskeid_event_attendance_mutation_requests', 'teskeid_event_attendance_mutation_requests_pkey', '35ca4084e928106e54024474e8a6e200', 'p', false, false),
      ('teskeid_event_attendance_mutation_requests', 'teskeid_event_attendance_mutation_requests_actor_fk', '6131c774862c10a823af7ba6b1192b8d', 'f', false, false),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_pkey', '4e3f469437b42216751c7620809d0a50', 'p', false, false),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_invitation_fk', '9051041ddef558d82346357de1c1c7ca', 'f', false, false),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_actor_fk', '6131c774862c10a823af7ba6b1192b8d', 'f', false, false),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_invitation_attempt_key', '254f7385e2a255e48c0f7dfb1ce78978', 'u', false, false),
      ('teskeid_event_guest_identity_mutation_authorizations', 'teskeid_event_guest_identity_mutation_authorizations_pkey', '8fc7dfdab4c334d2d7d44092ca80e9a4', 'p', false, false),
      ('teskeid_event_guest_identity_mutation_authorizations', 'teskeid_event_guest_identity_mutation_authorizations_guest_fk', 'e30bc7454800b3b640f5c71ad4904d8b', 'f', false, false),
      ('teskeid_event_guest_identity_mutation_authorizations', 'teskeid_event_guest_identity_mutation_authorizations_actor_fk', '6131c774862c10a823af7ba6b1192b8d', 'f', false, false),
      ('teskeid_event_guest_identity_mutation_authorizations', 'teskeid_event_guest_identity_mutation_authorizations_invite_fk', 'cc7791218e896f445d7f8d4c896a027d', 'f', true, true)
    ) AS expected(
      table_name, constraint_name, definition_md5, constraint_type,
      is_deferrable, is_initially_deferred
    )
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
           'public.' || expected.table_name
         )
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.contype::text = expected.constraint_type
     AND constraint_row.convalidated
     AND constraint_row.condeferrable = expected.is_deferrable
     AND constraint_row.condeferred = expected.is_initially_deferred
     AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
       pg_catalog.replace(pg_catalog.regexp_replace(
         pg_catalog.regexp_replace(
           pg_catalog.pg_get_constraintdef(constraint_row.oid),
           '::[a-z0-9_]+(\[\])?', '', 'g'
         ), '[[:space:]()''"]', '', 'g'
       ), 'public.', ''), 'pg_catalog.', ''
     ))) = expected.definition_md5
  ) <> 22 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_key_constraint_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(constraint_row.oid)
    FROM (VALUES
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_kind_check', '22b5d0993c33015d7700f92ab433ff33'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_status_check', 'b101d50b384d87a7b66cf42b80b735aa'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_hash_bundle_check', '15455ec62890062c26c32bbab11cc600'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_snapshot_check', '8ae89b572efc55831870967cb780be9e'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_template_check', '6bac810125fe2b4f477b45b526dc83d4'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_attempt_check', 'c432e69fd0c55951c935d6d851a94728'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_expiry_check', '81f15dca4d15c26bb132eb2e3d1ccf88'),
      ('teskeid_event_guest_invitations', 'teskeid_event_guest_invitations_lifecycle_check', 'f35892a5ae13facf775a300ce9259de0'),
      ('teskeid_event_attendance_mutation_requests', 'teskeid_event_attendance_mutation_requests_operation_check', '043951bd32393961ac39a7c78d1f1007'),
      ('teskeid_event_attendance_mutation_requests', 'teskeid_event_attendance_mutation_requests_fingerprint_check', 'db81247a30fe80e62823c7ae4ceccec2'),
      ('teskeid_event_attendance_mutation_requests', 'teskeid_event_attendance_mutation_requests_result_check', '63f8ecfd9306a01e17cac38793a3af1d'),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_fingerprint_check', '15d67fb31665b2a184080de1006c1430'),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_reason_check', '357cab2a73082c21e5046d2ae1240812'),
      ('teskeid_event_attendance_delivery_requests', 'teskeid_event_attendance_delivery_requests_shape_check', 'e87c1ced46e6b2f473385f36eb684067'),
      ('teskeid_event_guest_identity_mutation_authorizations', 'teskeid_event_guest_identity_authorizations_shape_check', 'ea49cffc2ae6918ffd37dad725d2ea74')
    ) AS expected(table_name, constraint_name, definition_md5)
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
           'public.' || expected.table_name
         )
     AND constraint_row.conname = expected.constraint_name
     AND constraint_row.contype = 'c'
     AND constraint_row.convalidated
     AND NOT constraint_row.condeferrable
     AND NOT constraint_row.condeferred
     AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
       pg_catalog.replace(pg_catalog.regexp_replace(
         pg_catalog.regexp_replace(
           pg_catalog.pg_get_constraintdef(constraint_row.oid),
           '::[a-z0-9_]+(\[\])?', '', 'g'
         ), '[[:space:]()''"]', '', 'g'
       ), 'public.', ''), 'pg_catalog.', ''
     ))) = expected.definition_md5
     AND pg_catalog.obj_description(
       constraint_row.oid, 'pg_constraint'
     ) = 'sql133:' || expected.definition_md5
  ) <> 15 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid IN (
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_attendance_memberships'),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_mutation_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_delivery_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_guest_identity_mutation_authorizations'
      )
    )
      AND actual.contype IN ('c', 'f', 'p', 'u', 'x')
  ) <> 35 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_constraint_definition_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_event_guest_invitations_pending_guest_uidx', '12573f55fe85953b18d88e418af36a77'),
      ('teskeid_event_guest_invitations_pending_email_uidx', 'c5f3928e96d4874f5c1e92f64c99cefb'),
      ('teskeid_event_guest_invitations_recipient_pending_idx', '7feed2a506c012adbba40e0f0e929efe'),
      ('teskeid_event_guest_invitations_inviter_idx', '5a9d56ef4ac45d32f50a396c00aa658f'),
      ('teskeid_event_guest_invitations_expiry_idx', 'b8033570188121ead975569ef9b23128'),
      ('teskeid_event_guest_invitations_guest_history_idx', 'a08b4f47d8f089855a4f5e8d9b3e2633'),
      ('teskeid_event_guest_invitations_accepted_user_idx', '4d4942fd43909fd840f6818b70fbbdc7'),
      ('teskeid_event_guests_linked_user_history_idx', '7fb7b81e2465906bd79f184a4fc20bcb'),
      ('teskeid_event_guest_invitations_actor_recipient_rate_idx', '45cc73eb29f3ccf8aab205ad7a54c71d'),
      ('teskeid_event_guest_invitations_decline_cooldown_idx', '80d39a26f2c84ba9952deb1319c28f7a'),
      ('teskeid_event_attendance_memberships_guest_uidx', '6cad7bc3c723c84a4613181959f22be1'),
      ('teskeid_event_attendance_memberships_invitation_uidx', '860e5ba2204b7e782af76606d1c965c5'),
      ('teskeid_event_attendance_memberships_user_idx', '6b2a4a5b0a84a8072d1f462c52ef153f'),
      ('teskeid_event_attendance_delivery_requests_invitation_idx', 'be5b10d14598dec54383becb77c29c95'),
      ('teskeid_event_expense_participant_sources_group_member_idx', 'a27a626f749c0a818559b2de80f807a5')
    ) AS expected(index_name, definition_md5)
    JOIN pg_catalog.pg_index AS index_row
      ON index_row.indexrelid = pg_catalog.to_regclass(
           'public.' || expected.index_name
         )
     AND index_row.indisvalid
     AND index_row.indisready
     AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
       pg_catalog.replace(pg_catalog.regexp_replace(
         pg_catalog.regexp_replace(
           pg_catalog.pg_get_indexdef(index_row.indexrelid),
           '::[a-z0-9_]+(\[\])?', '', 'g'
         ), '[[:space:]()''"]', '', 'g'
       ), 'public.', ''), 'pg_catalog.', ''
     ))) = expected.definition_md5
  ) <> 15 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_index AS actual
    WHERE actual.indrelid IN (
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_attendance_memberships'),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_mutation_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_delivery_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_guest_identity_mutation_authorizations'
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS backing_constraint
      WHERE backing_constraint.conindid = actual.indexrelid
    )
  ) <> 13 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_critical_index_failed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teskeid_event_guest_invitations)
     OR EXISTS (SELECT 1 FROM public.teskeid_event_attendance_memberships)
     OR EXISTS (
       SELECT 1 FROM public.teskeid_event_attendance_mutation_requests
     ) OR EXISTS (
       SELECT 1 FROM public.teskeid_event_attendance_delivery_requests
     ) OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_guest_identity_mutation_authorizations
     ) THEN
    RAISE EXCEPTION 'teskeid_event_attendance_historical_backfill_forbidden';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_create(uuid,uuid,text,jsonb)',
        '9129bb5800d742b5f3f9ab09c3f196fb'),
      ('public.teskeid_event_list(uuid)',
        '8fc1eebd38b5499edc9204991529d2a4'),
      ('public.teskeid_event_get(uuid,uuid)',
        '5ca3a5428bd45a41b170edf76577d8ca'),
      ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)',
        'b6f8566f735fc02be284d17aeca68b62')
    ) AS expected(signature, source_md5)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_expected.signature)
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_expected.source_md5
        AND procedure_row.prosecdef
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
    ) THEN
      RAISE EXCEPTION 'teskeid_event_attendance_legacy_rpc_changed:%',
        v_expected.signature;
    END IF;
  END LOOP;

  FOR v_expected IN
    SELECT * FROM pg_temp.teskeid_event_identity_attestation
    ORDER BY relation_name
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT pg_catalog.count(*), pg_catalog.md5('
      || 'pg_catalog.count(*)::text || '':'' || '
      || 'COALESCE(pg_catalog.sum(pg_catalog.hashtextextended('
      || 'pg_catalog.to_jsonb(row_value)::text, 13311)::numeric), 0)::text '
      || '|| '':'' || COALESCE(pg_catalog.sum(pg_catalog.hashtextextended('
      || 'pg_catalog.to_jsonb(row_value)::text, 13312)::numeric), 0)::text) '
      || 'FROM public.%I AS row_value',
      v_expected.relation_name
    ) INTO v_count, v_digest;
    IF v_count <> v_expected.row_count
       OR v_digest IS DISTINCT FROM v_expected.content_digest THEN
      RAISE EXCEPTION 'teskeid_event_attendance_existing_data_changed:%',
        v_expected.relation_name;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM (VALUES
      ('teskeid_events', 'teskeid_events_touch_updated_at',
       'public.teskeid_event_touch_updated_at()', 19::smallint, false, false,
       '573d2130576e33a2e0051aa5a53ee8da'),
      ('teskeid_event_guests', 'teskeid_event_guests_touch_updated_at',
       'public.teskeid_event_touch_updated_at()', 19::smallint, false, false,
       '6ab521c4a591f84b98ec4e9fcf510284'),
      ('teskeid_events', 'teskeid_events_update_guard',
       'public.teskeid_event_guard_event_update()', 19::smallint, false, false,
       '6f89ed31bd0f8ccd4287b2e45c52af60'),
      ('teskeid_event_guests', 'teskeid_event_guests_update_guard',
       'public.teskeid_event_guard_guest_update()', 19::smallint, false, false,
       'c95d9d09d7ea3561f953ffb95cb811da'),
      ('teskeid_event_mutation_requests',
       'teskeid_event_receipts_mutation_guard',
       'public.teskeid_event_guard_receipt_mutation()',
       27::smallint, false, false, '848754f56bd8a534919b139b3f0cc458'),
      ('teskeid_event_guests', 'teskeid_event_guests_roster_deferred',
       'public.teskeid_event_roster_integrity_trigger()',
       29::smallint, true, true, '4b8716b13b134e7d6832c117af96515c'),
      ('teskeid_event_expense_links',
       'teskeid_event_expense_links_integrity_deferred',
       'public.teskeid_event_expense_link_integrity_trigger()',
       21::smallint, true, true, 'b894a0a3b041c416aebd9a71a873f627'),
      ('expense_groups', 'teskeid_event_expense_groups_integrity_deferred',
       'public.teskeid_event_financial_parent_integrity_trigger()',
       25::smallint, true, true, 'bc5cf7c042812deacfd2f794d65a5f86'),
      ('expenses', 'teskeid_event_expenses_integrity_deferred',
       'public.teskeid_event_financial_parent_integrity_trigger()',
       29::smallint, true, true, '561df7a8c634e5d2bab26bdb9b2936d6'),
      ('expense_group_members',
       'teskeid_event_expense_members_integrity_deferred',
       'public.teskeid_event_financial_parent_integrity_trigger()',
       25::smallint, true, true, '5d0863a8c09e3d8b7262515e39384045'),
      ('teskeid_event_expense_links',
       'teskeid_event_expense_links_immutable_guard',
       'public.teskeid_event_immutable_history()',
       19::smallint, false, false, 'c104d270839920cbef7d54860efedc13'),
      ('teskeid_event_expense_participant_sources',
       'teskeid_event_expense_sources_immutable_guard',
       'public.teskeid_event_immutable_history()',
       19::smallint, false, false, '79d1621908f82e44486623f230a83ac4'),
      ('expense_groups', 'expense_groups_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, 'd45bd188fa0176d4fa61c63cb424c009'),
      ('expense_group_members', 'expense_group_members_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, 'ccc0eb4a0b013ad4c986f5341287e413'),
      ('expenses', 'expenses_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, 'ca572fab2b75ee46c873836490a644d4'),
      ('expense_repayments', 'expense_repayments_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, 'b0eecd854d61f45803dbdd499aae8045'),
      ('expense_member_invitations',
       'expense_member_invitations_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, 'a3e6713cf26d93675d048d8f65b9bf6c'),
      ('expense_repayments', 'expense_repayments_encrypted_snapshot',
       'public.expense_attach_encrypted_payment_snapshot()',
       7::smallint, false, false, 'e5c03e7b03c09a6ab927f1715b4acd95'),
      ('expense_event_contexts', 'expense_event_context_integrity_deferred',
       'public.expense_event_integrity_trigger()',
       29::smallint, true, true, '7c8cbb816f61c1939189e112347fd0ad'),
      ('expense_event_participants',
       'expense_event_participant_integrity_deferred',
       'public.expense_event_integrity_trigger()',
       29::smallint, true, true, '34ef57122946b539ddb2561776d1c578'),
      ('expense_groups', 'expense_event_group_integrity_deferred',
       'public.expense_event_group_integrity_trigger()',
       25::smallint, true, true, 'b36feb66029f7227ffeeb8815917e555'),
      ('expense_event_contexts', 'expense_event_context_immutable_guard',
       'public.expense_event_context_immutable()',
       19::smallint, false, false, '6f320f1e7e7dfb5e5bd81bc2a7a80846'),
      ('expense_event_participants',
       'expense_event_participant_immutable_guard',
       'public.expense_event_participant_immutable()',
       19::smallint, false, false, '796bd35e3b8578b04f946a596e8fbf56'),
      ('expense_group_members', 'expense_event_group_members_frozen_guard',
       'public.expense_event_roster_frozen()',
       31::smallint, false, false, '7745e7a8d3e0c9725504c4bafbed5138'),
      ('expense_member_invitations', 'expense_event_member_invitations_guard',
       'public.expense_event_invitation_blocked()',
       23::smallint, false, false, 'e6a83614273083bd2d0cea63f0a3b0a2'),
      ('expense_repayments', 'expense_repayments_review_guard',
       'public.expense_guard_new_reported_repayment()',
       7::smallint, false, false, 'e415e6473a9d8c79dcaafd2e18ddb1d9'),
      ('expense_repayments', 'expense_repayments_batch_guard',
       'public.expense_guard_batch_repayment_mutation()',
       19::smallint, false, false, 'f48761fb749274d9eeb44338f7513816'),
      ('expense_settlement_batches',
       'expense_settlement_batches_touch_updated_at',
       'public.expense_touch_updated_at()',
       19::smallint, false, false, '4e51b9bef5ccbb179133953b79fb4a8a'),
      ('expense_settlement_batches',
       'expense_settlement_batches_immutable_guard',
       'public.expense_guard_settlement_batch_mutation()',
       27::smallint, false, false, '974c27452bc0ed04baca1d867165a593'),
      ('expense_settlement_batch_items',
       'expense_settlement_batch_items_immutable_guard',
       'public.expense_guard_settlement_batch_item_mutation()',
       27::smallint, false, false, 'dbf47d9dbb0356750956625ff907bb67'),
      ('expense_group_members',
       'expense_group_members_cancel_batches_before_unlink',
       'public.expense_cancel_batches_before_user_unlink()',
       19::smallint, false, false, '4c18ef1467d6fdbb22c1f4b0fbd1ef4e'),
      ('teskeid_event_guest_invitations',
       'teskeid_event_guest_invitations_touch_updated_at',
       'public.teskeid_event_touch_updated_at()', 19::smallint, false, false,
       'fa7142e0a8c566ccf190da63610cae40'),
      ('teskeid_event_attendance_mutation_requests',
       'teskeid_event_attendance_receipts_mutation_guard',
       'public.teskeid_event_guard_attendance_receipt_mutation()',
       27::smallint, false, false, '9e63014a2603cbe3557a062a8811f5c7'),
      ('teskeid_event_attendance_memberships',
       'teskeid_event_attendance_memberships_integrity_deferred',
       'public.teskeid_event_attendance_integrity_trigger()',
       29::smallint, true, true, '90339fbdfb6ca44a0561893ef7595c1c'),
      ('teskeid_event_guest_invitations',
       'teskeid_event_guest_invitations_integrity_deferred',
       'public.teskeid_event_attendance_integrity_trigger()',
       29::smallint, true, true, 'c3acb696a05b8ae943adae3861e810c0'),
      ('teskeid_event_guests',
       'teskeid_event_guests_attendance_integrity_deferred',
       'public.teskeid_event_attendance_integrity_trigger()',
       25::smallint, true, true, '1b19d5124b69fea189ffee1702be8217'),
      ('teskeid_event_guest_identity_mutation_authorizations',
       'teskeid_event_identity_authorizations_consumed_deferred',
       'public.teskeid_event_guard_identity_authorization_commit()',
       21::smallint, true, true, '2fd977aeca18d003379f1ea0df746f5f')
    ) AS expected(
      table_name, trigger_name, function_signature, trigger_type,
      is_deferrable, is_initially_deferred, definition_md5
    )
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = pg_catalog.to_regclass(
           'public.' || expected.table_name
         )
     AND trigger_row.tgname = expected.trigger_name
     AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
           expected.function_signature
         )
     AND trigger_row.tgtype = expected.trigger_type
     AND trigger_row.tgdeferrable = expected.is_deferrable
     AND trigger_row.tginitdeferred = expected.is_initially_deferred
     AND trigger_row.tgenabled = 'O'
     AND NOT trigger_row.tgisinternal
     AND CASE WHEN expected.trigger_name =
       'expense_group_members_cancel_batches_before_unlink' THEN (
         pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 1
         AND pg_catalog.strpos(
           pg_catalog.pg_get_triggerdef(trigger_row.oid),
           'UPDATE OF user_id'
         ) > 0
         AND trigger_row.tgqual IS NOT NULL
       ) ELSE pg_catalog.cardinality(
         trigger_row.tgattr::smallint[]
       ) = 0
         AND trigger_row.tgqual IS NULL END
     AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
       pg_catalog.regexp_replace(pg_catalog.regexp_replace(
         pg_catalog.pg_get_triggerdef(trigger_row.oid),
         '::[a-z0-9_]+(\[\])?', '', 'g'
       ), '[[:space:]()''"]', '', 'g'), 'public.', ''
     ))) = expected.definition_md5
     AND CASE WHEN expected.trigger_name IN (
       'teskeid_event_identity_authorizations_consumed_deferred',
       'teskeid_event_guest_invitations_touch_updated_at',
       'teskeid_event_attendance_receipts_mutation_guard',
       'teskeid_event_attendance_memberships_integrity_deferred',
       'teskeid_event_guest_invitations_integrity_deferred',
       'teskeid_event_guests_attendance_integrity_deferred'
     ) THEN pg_catalog.obj_description(
       trigger_row.oid, 'pg_trigger'
     ) = 'sql133:' || expected.definition_md5 ELSE true END
  ) <> 37 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS actual
    WHERE actual.tgrelid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_mutation_requests'),
      pg_catalog.to_regclass('public.teskeid_event_expense_links'),
      pg_catalog.to_regclass(
        'public.teskeid_event_expense_participant_sources'
      ),
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_attendance_memberships'),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_mutation_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_attendance_delivery_requests'
      ),
      pg_catalog.to_regclass(
        'public.teskeid_event_guest_identity_mutation_authorizations'
      ),
      pg_catalog.to_regclass('public.expense_groups'),
      pg_catalog.to_regclass('public.expenses'),
      pg_catalog.to_regclass('public.expense_group_members'),
      pg_catalog.to_regclass('public.expense_member_invitations'),
      pg_catalog.to_regclass('public.expense_repayments'),
      pg_catalog.to_regclass('public.expense_settlement_batches'),
      pg_catalog.to_regclass('public.expense_settlement_batch_items'),
      pg_catalog.to_regclass('public.expense_event_contexts'),
      pg_catalog.to_regclass('public.expense_event_participants')
    ) AND NOT actual.tgisinternal
  ) <> 37 THEN
    RAISE EXCEPTION 'teskeid_event_attendance_trigger_failed';
  END IF;
END;
$teskeid_event_attendance_final_attestation$;

COMMENT ON TABLE public.teskeid_event_guest_invitations IS
  'Private exact-recipient Event attendance consent. Pending email is scrubbed on every terminal state.';
COMMENT ON TABLE public.teskeid_event_attendance_memberships IS
  'Private accepted Event read membership only. It grants no Expense, debt, payment or settlement access.';
COMMENT ON FUNCTION public.teskeid_event_get_attendee_view(uuid,uuid) IS
  'Accepted-attendee safe Event roster: display-only labels, never email, identity metadata or financial data.';
COMMENT ON FUNCTION public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid) IS
  'Server-only raw-email preparation seam. Its result must never reach browser DTOs or logs.';

COMMIT;
