-- SQL133 Event guest identity/attendance preflight -- READ ONLY.
-- Run immediately before SQL133. Continue only when prerequisites_ok = true.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

WITH role_contract AS (
  SELECT
    (
      current_user = 'postgres'
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS role_row
        WHERE role_row.rolname = current_user AND role_row.rolsuper
      )
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = 'postgres'
        AND (role_row.rolsuper OR role_row.rolbypassrls)
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = 'service_role'
        AND role_row.rolbypassrls
        AND pg_catalog.has_schema_privilege(
          role_row.oid, 'public', 'USAGE'
        )
    )
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname IN ('anon', 'authenticated')
    ) = 2 AS roles_ok
), expected_relations(name) AS (
  VALUES
    ('auth.users'), ('public.profiles'), ('public.feature_access'),
    ('public.relationships'), ('public.otp_ip_rate_limit'),
    ('public.teskeid_events'), ('public.teskeid_event_guests'),
    ('public.teskeid_event_mutation_requests'),
    ('public.teskeid_event_expense_links'),
    ('public.teskeid_event_expense_participant_sources'),
    ('public.expense_groups'), ('public.expense_group_members'),
    ('public.expenses'), ('public.expense_payments'),
    ('public.expense_shares'), ('public.expense_obligations'),
    ('public.expense_repayments'),
    ('public.expense_repayment_allocations'),
    ('public.expense_member_invitations'), ('public.expense_activity'),
    ('public.expense_activity_audience'),
    ('public.expense_mutation_requests'),
    ('public.expense_payment_preferences'),
    ('public.expense_settlement_batches'),
    ('public.expense_settlement_batch_items'),
    ('public.expense_event_contexts'),
    ('public.expense_event_participants'),
    ('public.recent_events')
), relation_contract AS (
  SELECT pg_catalog.count(pg_catalog.to_regclass(expected.name))
    = pg_catalog.count(*) AS relations_ok
  FROM expected_relations AS expected
), target_relations(name) AS (
  VALUES
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
), target_relation_contract AS (
  SELECT pg_catalog.bool_and(
    pg_catalog.to_regclass('public.' || target.name) IS NULL
  ) AS target_relations_clear
  FROM target_relations AS target
), target_functions(name) AS (
  VALUES
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
), target_function_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM target_functions AS target
    JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
     AND procedure_row.proname = target.name
  ) AS target_functions_clear
), target_trigger_contract AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'teskeid_event_guest_invitations_touch_updated_at',
      'teskeid_event_attendance_receipts_mutation_guard',
      'teskeid_event_attendance_memberships_integrity_deferred',
      'teskeid_event_guest_invitations_integrity_deferred',
      'teskeid_event_guests_attendance_integrity_deferred',
      'teskeid_event_identity_authorizations_consumed_deferred'
    ) AND NOT trigger_row.tgisinternal
  ) AS target_triggers_clear
), expected_columns(table_name, column_name, type_name, not_null) AS (
  VALUES
    ('teskeid_events', 'id', 'uuid', true),
    ('teskeid_events', 'owner_user_id', 'uuid', true),
    ('teskeid_events', 'name', 'text', true),
    ('teskeid_events', 'roster_revision', 'bigint', true),
    ('teskeid_events', 'legacy_expense_group_id', 'uuid', false),
    ('teskeid_events', 'created_at', 'timestamp with time zone', true),
    ('teskeid_events', 'updated_at', 'timestamp with time zone', true),
    ('teskeid_event_guests', 'id', 'uuid', true),
    ('teskeid_event_guests', 'event_id', 'uuid', true),
    ('teskeid_event_guests', 'status', 'text', true),
    ('teskeid_event_guests', 'position', 'smallint', false),
    ('teskeid_event_guests', 'source_kind', 'text', true),
    ('teskeid_event_guests', 'display_name_snapshot', 'text', true),
    ('teskeid_event_guests', 'email_canonical', 'text', false),
    ('teskeid_event_guests', 'linked_user_id', 'uuid', false),
    ('teskeid_event_guests', 'relationship_id', 'uuid', false),
    ('teskeid_event_guests', 'created_at', 'timestamp with time zone', true),
    ('teskeid_event_guests', 'updated_at', 'timestamp with time zone', true),
    ('teskeid_event_guests', 'removed_at', 'timestamp with time zone', false)
), column_contract AS (
  SELECT pg_catalog.count(column_row.column_name) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      column_row.data_type = expected.type_name
      AND (column_row.is_nullable = 'NO') = expected.not_null
    ) AS baseline_columns_ok
  FROM expected_columns AS expected
  LEFT JOIN information_schema.columns AS column_row
    ON column_row.table_schema = 'public'
   AND column_row.table_name = expected.table_name
   AND column_row.column_name = expected.column_name
), baseline_private_contract AS (
  SELECT pg_catalog.count(relation.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      relation.relkind = 'r'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('anon'::name), ('authenticated'::name), ('service_role'::name)
        ) AS role_row(role_name)
        WHERE pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'SELECT'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'INSERT'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'UPDATE'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'DELETE'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'TRUNCATE'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'REFERENCES'
              )
           OR pg_catalog.has_table_privilege(
                role_row.role_name, relation.oid, 'TRIGGER'
              )
           OR pg_catalog.has_any_column_privilege(
                role_row.role_name, relation.oid, 'SELECT'
              )
           OR pg_catalog.has_any_column_privilege(
                role_row.role_name, relation.oid, 'INSERT'
              )
           OR pg_catalog.has_any_column_privilege(
                role_row.role_name, relation.oid, 'UPDATE'
              )
           OR pg_catalog.has_any_column_privilege(
                role_row.role_name, relation.oid, 'REFERENCES'
              )
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
            privilege.grantee <> relation.relowner
            OR privilege.is_grantable
          )
      )
    ) AS baseline_private_tables_ok
  FROM (VALUES
    ('teskeid_events'), ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources')
  ) AS expected(table_name)
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
), baseline_constraint_contract AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
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
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
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
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        ), '''([^'']+)''', 'g') AS match(value)
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
  ) AS baseline_constraints_ok
), expected_sql132_event_constraints(
  table_name, constraint_name, exact_definition
) AS (
  VALUES
    ('teskeid_events', 'teskeid_events_pkey', 'primarykeyid'),
    ('teskeid_events', 'teskeid_events_owner_fk', 'foreignkeyowner_user_idreferencesauth.usersidondeleterestrict'),
    ('teskeid_events', 'teskeid_events_legacy_context_fk', 'foreignkeylegacy_expense_group_idreferencesexpense_event_contextsgroup_idondeleterestrict'),
    ('teskeid_events', 'teskeid_events_legacy_context_key', 'uniquelegacy_expense_group_id'),
    ('teskeid_events', 'teskeid_events_name_check', 'checkteskeid_event_valid_textname,1,160'),
    ('teskeid_events', 'teskeid_events_revision_check', 'checkroster_revision>0'),
    ('teskeid_events', 'teskeid_events_legacy_id_check', 'checklegacy_expense_group_idisnullorid=legacy_expense_group_id'),
    ('teskeid_event_guests', 'teskeid_event_guests_pkey', 'primarykeyid'),
    ('teskeid_event_guests', 'teskeid_event_guests_event_id_id_key', 'uniqueevent_id,id'),
    ('teskeid_event_guests', 'teskeid_event_guests_event_fk', 'foreignkeyevent_idreferencesteskeid_eventsidondeletecascade'),
    ('teskeid_event_guests', 'teskeid_event_guests_linked_user_fk', 'foreignkeylinked_user_idreferencesauth.usersidondeletesetnull'),
    ('teskeid_event_guests', 'teskeid_event_guests_relationship_fk', 'foreignkeyrelationship_idreferencesrelationshipsidondeletesetnull'),
    ('teskeid_event_guests', 'teskeid_event_guests_status_check', 'checkstatus=anyarray[active,removed]'),
    ('teskeid_event_guests', 'teskeid_event_guests_position_check', 'checkstatus=activeandposition>=0andposition<=48andremoved_atisnullorstatus=removedandpositionisnullandremoved_atisnotnull'),
    ('teskeid_event_guests', 'teskeid_event_guests_source_check', 'checksource_kind=anyarray[relationship,manual_name,manual_email]'),
    ('teskeid_event_guests', 'teskeid_event_guests_name_check', 'checkteskeid_event_valid_textdisplay_name_snapshot,1,120'),
    ('teskeid_event_guests', 'teskeid_event_guests_identity_shape_check', 'checksource_kind=manual_nameandemail_canonicalisnullandlinked_user_idisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andlinked_user_idisnullandrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_pkey', 'primarykeyactor_user_id,request_id'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_actor_fk', 'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_operation_check', 'checkchar_lengthoperation>=1andchar_lengthoperation<=80'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_fingerprint_check', 'checkfingerprint~^[0-9a-f]{32}$'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_result_check', 'checkresultisnullorjsonb_typeofresult=objectandoctet_lengthresult<=8192'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_pkey', 'primarykeyevent_id,expense_id'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_scope_key', 'uniqueevent_id,group_id,expense_id'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_event_fk', 'foreignkeyevent_idreferencesteskeid_eventsidondeletecascade'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeleterestrict'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_actor_fk', 'foreignkeylinked_by_user_idreferencesauth.usersidondeletesetnull'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_revision_check', 'checklink_revision=1'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_pkey', 'primarykeyevent_id,expense_id,event_guest_id'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_link_fk', 'foreignkeyevent_id,group_id,expense_idreferencesteskeid_event_expense_linksevent_id,group_id,expense_idondeletecascade'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_guest_fk', 'foreignkeyevent_id,event_guest_idreferencesteskeid_event_guestsevent_id,idondeletecascade'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_member_fk', 'foreignkeygroup_id,expense_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict')
), expected_sql132_event_indexes(
  index_name, unique_index, partial_index, exact_definition
) AS (
  VALUES
    ('teskeid_events_owner_created_idx', false, false, 'createindexteskeid_events_owner_created_idxonteskeid_eventsusingbtreeowner_user_id,created_atdesc,iddesc'),
    ('teskeid_event_guests_active_position_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_position_uidxonteskeid_event_guestsusingbtreeevent_id,positionwherestatus=active'),
    ('teskeid_event_guests_active_linked_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_linked_uidxonteskeid_event_guestsusingbtreeevent_id,linked_user_idwherestatus=activeandlinked_user_idisnotnull'),
    ('teskeid_event_guests_active_email_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_email_uidxonteskeid_event_guestsusingbtreeevent_id,email_canonicalwherestatus=activeandemail_canonicalisnotnull'),
    ('teskeid_event_expense_links_expense_uidx', true, false, 'createuniqueindexteskeid_event_expense_links_expense_uidxonteskeid_event_expense_linksusingbtreeexpense_id'),
    ('teskeid_event_expense_sources_member_uidx', true, false, 'createuniqueindexteskeid_event_expense_sources_member_uidxonteskeid_event_expense_participant_sourcesusingbtreeevent_id,expense_id,expense_member_id')
), sql132_event_schema_contract AS (
  SELECT
    (
      SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
        AND pg_catalog.bool_and(
          constraint_row.convalidated
          AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(constraint_row.oid),
              '::[a-z0-9_]+(\[\])?', '', 'g'
            ), '[[:space:]()''"]', '', 'g'
          ), 'public.', '')) = expected.exact_definition
        )
      FROM expected_sql132_event_constraints AS expected
      LEFT JOIN pg_catalog.pg_constraint AS constraint_row
        ON constraint_row.conrelid = pg_catalog.to_regclass(
             'public.' || expected.table_name
           )
       AND constraint_row.conname = expected.constraint_name
    ) AND (
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
    ) = 32 AND (
      SELECT pg_catalog.count(index_row.indexrelid) = pg_catalog.count(*)
        AND pg_catalog.bool_and(
          index_row.indisvalid AND index_row.indisready
          AND index_row.indisunique = expected.unique_index
          AND (index_row.indpred IS NOT NULL) = expected.partial_index
          AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.pg_get_indexdef(index_row.indexrelid),
              '::[a-z0-9_]+(\[\])?', '', 'g'
            ), '[[:space:]()''"]', '', 'g'
          ), 'public.', '')) = expected.exact_definition
        )
      FROM expected_sql132_event_indexes AS expected
      LEFT JOIN pg_catalog.pg_index AS index_row
        ON index_row.indexrelid = pg_catalog.to_regclass(
             'public.' || expected.index_name
           )
    ) AND (
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
    ) = 6 AS sql132_event_schema_ok
), expected_functions(
  signature, source_md5, security_definer, service_execute, search_path_kind
) AS (
  VALUES
    ('public.normalize_email_canonical(text)',
      '3083103976aa8cb3780937b9da1be236', false, true, 'empty'),
    ('public.teskeid_event_normalize_text(text)',
      'ced5cfb2427fe7331f4416497614f7d1', true, false, 'empty'),
    ('public.teskeid_event_valid_text(text,integer,integer)',
      '28c80b083a90683f15fd04f4d7d547d1', true, false, 'empty'),
    ('public.teskeid_event_uuid_from_text(text)',
      '27229cbc71c621e5a8592265b07f874d', true, false, 'empty'),
    ('public.teskeid_event_has_access(uuid)',
      '7b69311a107381a1891da01c32780f5f', true, false, 'empty'),
    ('public.teskeid_event_assert_actor(uuid)',
      '9dd7c34f6cc6c78131e7ebbb9a718ea4', true, false, 'empty'),
    ('public.teskeid_event_assert_financial_actor(uuid)',
      '7f6ced4f5e7472aff27d9a6d5c624355', true, false, 'empty'),
    ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)',
      '4e70b62a5fa28cfe2b884d703935a16c', true, false, 'empty'),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)',
      'eaa006157dc5377e0ae1f8979651f8aa', true, false, 'empty'),
    ('public.teskeid_event_assert_roster(uuid)',
      '644432e94fb9b27e434403d84d32db4b', true, false, 'empty'),
    ('public.teskeid_event_roster_integrity_trigger()',
      'e3f28f3ef917e7eca8766de4dc35bed0', true, false, 'empty'),
    ('public.teskeid_event_touch_updated_at()',
      'bb0914d96897242328a9ade9661bf1a7', true, false, 'empty'),
    ('public.teskeid_event_guard_event_update()',
      'd536d617b6bc13a556c39ad2ec0948e7', true, false, 'empty'),
    ('public.teskeid_event_guard_guest_update()',
      '889aa5388d3000147c811c35d990562e', true, false, 'empty'),
    ('public.teskeid_event_guard_receipt_mutation()',
      'abbca6ba554f3a1d0d4d71b9918d2abd', true, false, 'empty'),
    ('public.teskeid_event_assert_expense_link(uuid,uuid,uuid)',
      'a4e3a67ed697f395b8b5a2740b879f63', true, false, 'empty'),
    ('public.teskeid_event_expense_link_integrity_trigger()',
      '8709da16e3724ca30f3da159c9d0eed9', true, false, 'empty'),
    ('public.teskeid_event_financial_parent_integrity_trigger()',
      'c1ad7695de1c73a5c08eb02a9b3aa7f4', true, false, 'empty'),
    ('public.teskeid_event_immutable_history()',
      'f50c07cc5132e30f93aad4e5bdde806c', true, false, 'empty'),
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)',
      '9129bb5800d742b5f3f9ab09c3f196fb', true, true, 'empty'),
    ('public.teskeid_event_list(uuid)',
      '8fc1eebd38b5499edc9204991529d2a4', true, true, 'empty'),
    ('public.teskeid_event_get(uuid,uuid)',
      '5ca3a5428bd45a41b170edf76577d8ca', true, true, 'empty'),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)',
      'b6f8566f735fc02be284d17aeca68b62', true, true, 'empty'),
    ('public.teskeid_event_list_expense_sources(uuid)',
      '784451720df975223032ed426f21b869', true, true, 'empty'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)',
      '0c3511019afdb7918c15dc325dec2759', true, true, 'empty'),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'f91e0b44f3997b931126e2c827367d76', true, true, 'empty'),
    ('public.teskeid_event_get_expense_preview(uuid,uuid)',
      '6032a2b98aceda4d5c146467cc96c6d8', true, true, 'empty'),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)',
      'ea94b1c0d070ac44bf3c64c2b16b699e', true, true, 'empty'),
    ('public.expense_assert_beta_actor(uuid)',
      'ea6c329f5c13bd7d0bfbd9df41e5931d', true, false, 'empty'),
    ('public.expense_begin_request(uuid,uuid,text,text)',
      'd8631d60cc2f0df56dd9e958537db2a7', true, false, 'empty'),
    ('public.expense_finish_request(uuid,uuid,jsonb)',
      '194c5812642b4aaaafe888bc0ba5aa29', true, false, 'empty'),
    ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)',
      '1cdc6208ab4cc926fa9b1e6b6182aab1', true, true, 'empty'),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)',
      'ad3e4ade2c93001e2a8b2180288107a5', true, false, 'empty'),
    ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
      '536efe2584ce8b45ad8ecacf5574dfd4', true, true, 'empty'),
    ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'ad0fd30363a3c9f5d8e7b51be6f1bfa2', true, true, 'pg_public'),
    ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)',
      '5e47f31edbe4f0550f07e7b65f79e5af', true, false, 'empty'),
    ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      '4ab3fda8e416a10560504cf50b175ca3', true, true, 'empty'),
    ('public.expense_terminalize_member_invitations(uuid[],text)',
      '483db189da284fb0e2e7b40a0e774f11', true, false, 'empty'),
    ('public.expense_has_beta_access(uuid)',
      'ebe4628dbda84e79b395c9da0ae39899', true, false, 'empty'),
    ('public.expense_active_member_role(uuid,uuid)',
      'b25f994a64dde4a3f94ec8bad8535b17', true, false, 'empty'),
    ('public.expense_reported_repayments_need_review(uuid)',
      '5746ec747ae675e4bc99119b0833cc9f', true, false, 'empty'),
    ('public.expense_group_balances(uuid,boolean)',
      'f257b83aefd92169687ab2a516da24d9', true, false, 'empty'),
    ('public.expense_simplified_settlement(uuid,text,boolean)',
      'fe9016a12b1ac987b3b00f314c800c89', true, false, 'empty'),
    ('public.expense_guard_new_reported_repayment()',
      '2a1b9b3bc481b522724aa45e6febc172', true, false, 'empty'),
    ('public.expense_touch_updated_at()',
      '5bdc21b8fa8fb1231bdb021e09a5bc8e', false, false, 'empty'),
    ('public.expense_attach_encrypted_payment_snapshot()',
      '711bcb8e3e204e2164d58849a84fe5a5', true, false, 'empty'),
    ('public.expense_guard_settlement_batch_mutation()',
      '3e6cdede1440af689f0ea00ae909e99d', true, false, 'empty'),
    ('public.expense_guard_settlement_batch_item_mutation()',
      '41d3eab8ea4fc3d4f17da22e0086031f', true, false, 'empty'),
    ('public.expense_guard_batch_repayment_mutation()',
      '7a7c0e5e23944e060509a0ae4cdbb728', true, false, 'empty'),
    ('public.expense_cancel_batches_before_user_unlink()',
      '309e995f2078ea44b35430785fcc121a', true, false, 'empty'),
    ('public.expense_record_settlement_batch_activity(uuid,uuid,uuid,text)',
      'd751cf49def7888821fae86730ec2c53', true, false, 'empty'),
    ('public.expense_insert_settlement_batch_item(uuid,integer,uuid,uuid,uuid,text,bigint,text,date,text,uuid)',
      'ba68cffeba62f462a518fa97fc137d46', true, false, 'empty'),
    ('public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)',
      '804c8b2b4565b72b2ad07a8b2fb5328f', true, true, 'empty'),
    ('public.expense_transition_settlement_batch(uuid,uuid,text,uuid)',
      'f7bce33d51b0cef08b8ce39984d046d9', true, true, 'empty'),
    ('public.expense_event_valid_label(text,integer,integer)',
      '17e566582027334d68b4106493b44abf', true, false, 'empty'),
    ('public.expense_event_has_beta_access(uuid)',
      '2354b817c135e94ba6f651a3c124938a', true, false, 'empty'),
    ('public.expense_event_assert_actor(uuid)',
      'e2ec7008b57e628adf5aa21af6f5573d', true, false, 'empty'),
    ('public.expense_event_assert_integrity(uuid)',
      'de867d4dd1d0afb6a9be11f66c1d3f9e', true, false, 'empty'),
    ('public.expense_event_integrity_trigger()',
      '51528b525bb574dd67a82e8a1b6cebdc', true, false, 'empty'),
    ('public.expense_event_group_integrity_trigger()',
      '34366fafe3a1faccba50632ac241083a', true, false, 'empty'),
    ('public.expense_event_context_immutable()',
      'd72317fdea310e90c1a46fb8aeb4b88a', true, false, 'empty'),
    ('public.expense_event_participant_immutable()',
      '9953d3c479075a608853c3d61c058c5d', true, false, 'empty'),
    ('public.expense_event_roster_frozen()',
      'c72c6b904c6d1fac619bda62b2677d4c', true, false, 'empty'),
    ('public.expense_event_invitation_blocked()',
      'af2dc14f2a96195f48dcd2eaa00e454d', true, false, 'empty'),
    ('public.expense_list_event_contexts(uuid)',
      'c737a057a019a45b32d553c8a9a34935', true, true, 'empty'),
    ('public.expense_get_event_context(uuid,uuid)',
      '6ea385edacafacccced825d0d39ccfeb', true, true, 'empty'),
    ('public.expense_is_event_context(uuid,uuid)',
      '73d299e648e224c45e71e67753a1abb6', true, true, 'empty'),
    ('public.expense_prepare_account_deletion(uuid)',
      'ddaf4745ab92546e65697c5f6cd59075', true, true, 'empty'),
    ('public.check_and_increment_ip_rate_limit(text,date,integer)',
      'b9be1160205c288d653a9f4ac2b7f9ee', true, true, 'public')
), expected_service_function_arguments(signature, exact_arguments) AS (
  VALUES
    ('public.normalize_email_canonical(text)', 'p_email text'),
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb'),
    ('public.teskeid_event_list(uuid)', 'p_actor_id uuid'),
    ('public.teskeid_event_get(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid'),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)', 'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb'),
    ('public.teskeid_event_list_expense_sources(uuid)', 'p_actor_id uuid'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid'),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb'),
    ('public.teskeid_event_get_expense_preview(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid'),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_name text, p_participants jsonb'),
    ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_name text, p_description text, p_emoji text, p_default_currency text, p_default_include_creator boolean, p_members jsonb'),
    ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb'),
    ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_known_relationship_members jsonb DEFAULT ''[]''::jsonb'),
    ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_participant_invitations jsonb DEFAULT ''[]''::jsonb'),
    ('public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)', 'p_actor_id uuid, p_anchor_group_id uuid, p_anchor_from_member_id uuid, p_anchor_to_member_id uuid, p_currency text, p_expected_contexts jsonb, p_expected_profile_id uuid, p_expected_profile_version bigint, p_expected_profile_state_token text, p_cash_minor bigint, p_use_offset boolean, p_occurred_on date, p_note text, p_request_id uuid'),
    ('public.expense_transition_settlement_batch(uuid,uuid,text,uuid)', 'p_actor_id uuid, p_batch_id uuid, p_action text, p_request_id uuid'),
    ('public.expense_list_event_contexts(uuid)', 'p_actor_id uuid'),
    ('public.expense_get_event_context(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid'),
    ('public.expense_is_event_context(uuid,uuid)', 'p_actor_id uuid, p_group_id uuid'),
    ('public.expense_prepare_account_deletion(uuid)', 'p_user_id uuid'),
    ('public.check_and_increment_ip_rate_limit(text,date,integer)', 'p_ip_hash text, p_window_date date, p_max_requests integer')
), expected_function_contract AS (
  SELECT expected.*,
    CASE
      WHEN expected.signature IN (
        'public.normalize_email_canonical(text)',
        'public.teskeid_event_normalize_text(text)',
        'public.expense_active_member_role(uuid,uuid)'
      ) THEN 'text'
      WHEN expected.signature IN (
        'public.teskeid_event_uuid_from_text(text)',
        'public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)',
        'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)',
        'public.expense_record_settlement_batch_activity(uuid,uuid,uuid,text)',
        'public.expense_insert_settlement_batch_item(uuid,integer,uuid,uuid,uuid,text,bigint,text,date,text,uuid)'
      ) THEN 'uuid'
      WHEN expected.signature IN (
        'public.teskeid_event_valid_text(text,integer,integer)',
        'public.teskeid_event_has_access(uuid)',
        'public.expense_has_beta_access(uuid)',
        'public.expense_reported_repayments_need_review(uuid)',
        'public.expense_event_valid_label(text,integer,integer)',
        'public.expense_event_has_beta_access(uuid)',
        'public.expense_is_event_context(uuid,uuid)',
        'public.check_and_increment_ip_rate_limit(text,date,integer)'
      ) THEN 'boolean'
      WHEN expected.signature IN (
        'public.teskeid_event_assert_actor(uuid)',
        'public.teskeid_event_assert_financial_actor(uuid)',
        'public.teskeid_event_finish_request(uuid,uuid,jsonb)',
        'public.teskeid_event_assert_roster(uuid)',
        'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)',
        'public.expense_assert_beta_actor(uuid)',
        'public.expense_finish_request(uuid,uuid,jsonb)',
        'public.expense_event_assert_actor(uuid)',
        'public.expense_event_assert_integrity(uuid)'
      ) THEN 'void'
      WHEN expected.signature =
        'public.expense_terminalize_member_invitations(uuid[],text)'
        THEN 'integer'
      WHEN expected.signature IN (
        'public.teskeid_event_list(uuid)',
        'public.expense_group_balances(uuid,boolean)',
        'public.expense_simplified_settlement(uuid,text,boolean)',
        'public.expense_list_event_contexts(uuid)'
      ) THEN 'record'
      WHEN expected.signature IN (
        'public.teskeid_event_roster_integrity_trigger()',
        'public.teskeid_event_touch_updated_at()',
        'public.teskeid_event_guard_event_update()',
        'public.teskeid_event_guard_guest_update()',
        'public.teskeid_event_guard_receipt_mutation()',
        'public.teskeid_event_expense_link_integrity_trigger()',
        'public.teskeid_event_financial_parent_integrity_trigger()',
        'public.teskeid_event_immutable_history()',
        'public.expense_guard_new_reported_repayment()',
        'public.expense_touch_updated_at()',
        'public.expense_attach_encrypted_payment_snapshot()',
        'public.expense_guard_settlement_batch_mutation()',
        'public.expense_guard_settlement_batch_item_mutation()',
        'public.expense_guard_batch_repayment_mutation()',
        'public.expense_cancel_batches_before_user_unlink()',
        'public.expense_event_integrity_trigger()',
        'public.expense_event_group_integrity_trigger()',
        'public.expense_event_context_immutable()',
        'public.expense_event_participant_immutable()',
        'public.expense_event_roster_frozen()',
        'public.expense_event_invitation_blocked()'
      ) THEN 'trigger'
      ELSE 'jsonb'
    END AS return_type
  FROM expected_functions AS expected
), expected_internal_default_arguments(signature, exact_arguments) AS (
  VALUES
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)', 'p_group_id uuid, p_actor_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_summary_code text, p_expense_title text DEFAULT NULL::text, p_group_title text DEFAULT NULL::text, p_extra_user_ids uuid[] DEFAULT ARRAY[]::uuid[], p_project_recent boolean DEFAULT true'),
    ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)', 'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_recipient_email text DEFAULT NULL::text, p_relationship_id uuid DEFAULT NULL::uuid, p_participant_source text DEFAULT ''guest_link''::text'),
    ('public.expense_group_balances(uuid,boolean)', 'p_group_id uuid, p_include_reported boolean DEFAULT false'),
    ('public.expense_simplified_settlement(uuid,text,boolean)', 'p_group_id uuid, p_currency text, p_include_reported boolean DEFAULT true')
), function_contract AS (
  SELECT pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = pg_catalog.split_part(
            pg_catalog.split_part(expected.signature, '(', 1), '.', 2
          )
      ) = 1
      AND procedure_row.prokind = 'f'
      AND procedure_row.prorettype = pg_catalog.to_regtype(
        expected.return_type
      )
      AND CASE
        WHEN expected.return_type = 'record' THEN
          procedure_row.proretset
          AND pg_catalog.pg_get_function_result(procedure_row.oid) = CASE
            WHEN expected.signature = 'public.teskeid_event_list(uuid)'
              THEN 'TABLE(event_id uuid, name text, active_guest_count integer, roster_revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone)'
            WHEN expected.signature =
              'public.expense_group_balances(uuid,boolean)'
              THEN 'TABLE(member_id uuid, currency text, amount_minor bigint)'
            WHEN expected.signature =
              'public.expense_simplified_settlement(uuid,text,boolean)'
              THEN 'TABLE(from_member_id uuid, to_member_id uuid, amount_minor bigint, currency text)'
            WHEN expected.signature =
              'public.expense_list_event_contexts(uuid)'
              THEN 'TABLE(event_id uuid, name text, participant_count integer, expense_count integer, created_at timestamp with time zone)'
            ELSE NULL
          END
        ELSE
          NOT procedure_row.proretset
          AND pg_catalog.pg_get_function_result(procedure_row.oid) =
            expected.return_type
      END
      AND (
        (
          expected.service_execute
          AND expected_arguments.signature IS NOT NULL
          AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
            expected_arguments.exact_arguments
        ) OR (
          NOT expected.service_execute
          AND CASE WHEN internal_arguments.signature IS NOT NULL THEN
            pg_catalog.pg_get_function_arguments(procedure_row.oid) =
              internal_arguments.exact_arguments
          ELSE procedure_row.pronargdefaults = 0 END
        )
      )
      AND procedure_row.prosecdef = expected.security_definer
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.source_md5
      AND (
        SELECT language_row.lanname
        FROM pg_catalog.pg_language AS language_row
        WHERE language_row.oid = procedure_row.prolang
      ) = CASE WHEN expected.signature IN (
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
        WHEN expected.signature IN (
          'public.normalize_email_canonical(text)',
          'public.teskeid_event_normalize_text(text)',
          'public.teskeid_event_valid_text(text,integer,integer)',
          'public.teskeid_event_uuid_from_text(text)',
          'public.expense_event_valid_label(text,integer,integer)'
        ) THEN 'i'::"char"
        WHEN expected.signature IN (
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
        WHEN expected.signature = 'public.normalize_email_canonical(text)'
          THEN 's'::"char" ELSE 'u'::"char" END
      AND procedure_row.proisstrict = (
        expected.signature = 'public.normalize_email_canonical(text)'
      )
      AND NOT procedure_row.proleakproof
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND CASE expected.search_path_kind
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
      ) = expected.service_execute
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
    ) AS baseline_functions_ok
  FROM expected_function_contract AS expected
  LEFT JOIN expected_service_function_arguments AS expected_arguments
    ON expected_arguments.signature = expected.signature
  LEFT JOIN expected_internal_default_arguments AS internal_arguments
    ON internal_arguments.signature = expected.signature
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), expected_triggers(
  table_name, trigger_name, function_signature, deferred, trigger_type
) AS (
  VALUES
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
), expected_trigger_definition_digests(trigger_name, definition_md5) AS (
  VALUES
    ('teskeid_events_touch_updated_at', '573d2130576e33a2e0051aa5a53ee8da'),
    ('teskeid_event_guests_touch_updated_at', '6ab521c4a591f84b98ec4e9fcf510284'),
    ('teskeid_events_update_guard', '6f89ed31bd0f8ccd4287b2e45c52af60'),
    ('teskeid_event_guests_update_guard', 'c95d9d09d7ea3561f953ffb95cb811da'),
    ('teskeid_event_receipts_mutation_guard', '848754f56bd8a534919b139b3f0cc458'),
    ('teskeid_event_guests_roster_deferred', '4b8716b13b134e7d6832c117af96515c'),
    ('teskeid_event_expense_links_integrity_deferred', 'b894a0a3b041c416aebd9a71a873f627'),
    ('teskeid_event_expense_groups_integrity_deferred', 'bc5cf7c042812deacfd2f794d65a5f86'),
    ('teskeid_event_expenses_integrity_deferred', '561df7a8c634e5d2bab26bdb9b2936d6'),
    ('teskeid_event_expense_members_integrity_deferred', '5d0863a8c09e3d8b7262515e39384045'),
    ('teskeid_event_expense_links_immutable_guard', 'c104d270839920cbef7d54860efedc13'),
    ('teskeid_event_expense_sources_immutable_guard', '79d1621908f82e44486623f230a83ac4'),
    ('expense_groups_touch_updated_at', 'd45bd188fa0176d4fa61c63cb424c009'),
    ('expense_group_members_touch_updated_at', 'ccc0eb4a0b013ad4c986f5341287e413'),
    ('expenses_touch_updated_at', 'ca572fab2b75ee46c873836490a644d4'),
    ('expense_repayments_touch_updated_at', 'b0eecd854d61f45803dbdd499aae8045'),
    ('expense_member_invitations_touch_updated_at', 'a3e6713cf26d93675d048d8f65b9bf6c'),
    ('expense_repayments_encrypted_snapshot', 'e5c03e7b03c09a6ab927f1715b4acd95'),
    ('expense_event_context_integrity_deferred', '7c8cbb816f61c1939189e112347fd0ad'),
    ('expense_event_participant_integrity_deferred', '34ef57122946b539ddb2561776d1c578'),
    ('expense_event_group_integrity_deferred', 'b36feb66029f7227ffeeb8815917e555'),
    ('expense_event_context_immutable_guard', '6f320f1e7e7dfb5e5bd81bc2a7a80846'),
    ('expense_event_participant_immutable_guard', '796bd35e3b8578b04f946a596e8fbf56'),
    ('expense_event_group_members_frozen_guard', '7745e7a8d3e0c9725504c4bafbed5138'),
    ('expense_event_member_invitations_guard', 'e6a83614273083bd2d0cea63f0a3b0a2'),
    ('expense_repayments_review_guard', 'e415e6473a9d8c79dcaafd2e18ddb1d9'),
    ('expense_repayments_batch_guard', 'f48761fb749274d9eeb44338f7513816'),
    ('expense_settlement_batches_touch_updated_at', '4e51b9bef5ccbb179133953b79fb4a8a'),
    ('expense_settlement_batches_immutable_guard', '974c27452bc0ed04baca1d867165a593'),
    ('expense_settlement_batch_items_immutable_guard', 'dbf47d9dbb0356750956625ff907bb67'),
    ('expense_group_members_cancel_batches_before_unlink', '4c18ef1467d6fdbb22c1f4b0fbd1ef4e')
), trigger_contract AS (
  SELECT pg_catalog.count(trigger_row.oid) = pg_catalog.count(*)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger AS actual
      WHERE actual.tgrelid IN (
        pg_catalog.to_regclass('public.teskeid_events'),
        pg_catalog.to_regclass('public.teskeid_event_guests'),
        pg_catalog.to_regclass('public.teskeid_event_mutation_requests'),
        pg_catalog.to_regclass('public.teskeid_event_expense_links'),
        pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources'),
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
    ) = 31
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND trigger_row.tgdeferrable = expected.deferred
      AND trigger_row.tginitdeferred = expected.deferred
      AND trigger_row.tgtype = expected.trigger_type
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_triggerdef(trigger_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'), 'public.', ''
      ))) = expected_digest.definition_md5
      AND CASE WHEN expected.trigger_name =
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
    ) AS baseline_triggers_ok
  FROM expected_triggers AS expected
  JOIN expected_trigger_definition_digests AS expected_digest
    ON expected_digest.trigger_name = expected.trigger_name
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgrelid = pg_catalog.to_regclass(
         'public.' || expected.table_name
       )
   AND trigger_row.tgname = expected.trigger_name
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) FROM public.teskeid_events) AS event_rows,
  (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests) AS guest_rows,
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_mutation_requests) AS event_receipt_rows,
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_expense_links) AS tagged_expense_rows,
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_expense_participant_sources) AS source_rows,
  role_contract.roles_ok,
  relation_contract.relations_ok,
  target_relation_contract.target_relations_clear,
  target_function_contract.target_functions_clear,
  target_trigger_contract.target_triggers_clear,
  column_contract.baseline_columns_ok,
  baseline_private_contract.baseline_private_tables_ok,
  baseline_constraint_contract.baseline_constraints_ok,
  sql132_event_schema_contract.sql132_event_schema_ok,
  function_contract.baseline_functions_ok,
  trigger_contract.baseline_triggers_ok,
  role_contract.roles_ok
    AND relation_contract.relations_ok
    AND target_relation_contract.target_relations_clear
    AND target_function_contract.target_functions_clear
    AND target_trigger_contract.target_triggers_clear
    AND column_contract.baseline_columns_ok
    AND baseline_private_contract.baseline_private_tables_ok
    AND baseline_constraint_contract.baseline_constraints_ok
    AND sql132_event_schema_contract.sql132_event_schema_ok
    AND function_contract.baseline_functions_ok
    AND trigger_contract.baseline_triggers_ok AS prerequisites_ok
FROM role_contract
CROSS JOIN relation_contract
CROSS JOIN target_relation_contract
CROSS JOIN target_function_contract
CROSS JOIN target_trigger_contract
CROSS JOIN column_contract
CROSS JOIN baseline_private_contract
CROSS JOIN baseline_constraint_contract
CROSS JOIN sql132_event_schema_contract
CROSS JOIN function_contract
CROSS JOIN trigger_contract;

ROLLBACK;
