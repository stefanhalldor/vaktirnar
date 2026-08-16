-- SQL133 Event guest identity/attendance preflight diagnostics -- READ ONLY.
-- Run only when sql132_event_schema_ok or baseline_triggers_ok is false.
-- This reports bounded catalog metadata only. It never reads application rows.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH expected_constraints(
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
), schema_tables(table_name) AS (
  VALUES
    ('teskeid_events'),
    ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources')
), actual_constraints AS (
  SELECT
    table_row.table_name,
    constraint_row.conname AS constraint_name,
    constraint_row.contype::text AS constraint_type,
    constraint_row.convalidated,
    pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_row.oid),
        '::[a-z0-9_]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'
    ), 'public.', '')) AS actual_definition
  FROM schema_tables AS table_row
  JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
         'public.' || table_row.table_name
       )
), constraint_components AS (
  SELECT
    pg_catalog.count(actual.constraint_name) = pg_catalog.count(*)
      AS mapped_constraints_present,
    COALESCE(pg_catalog.bool_and(
      actual.convalidated
      AND actual.actual_definition = expected.exact_definition
    ), false) AS mapped_constraints_exact
  FROM expected_constraints AS expected
  LEFT JOIN actual_constraints AS actual
    ON actual.table_name = expected.table_name
   AND actual.constraint_name = expected.constraint_name
), constraint_mismatches AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', expected.table_name,
    'constraint', expected.constraint_name,
    'reason', CASE
      WHEN actual.constraint_name IS NULL THEN 'missing'
      WHEN NOT actual.convalidated THEN 'not_validated'
      ELSE 'definition_mismatch'
    END,
    'expected_definition', expected.exact_definition,
    'actual_definition', actual.actual_definition
  ) ORDER BY expected.table_name, expected.constraint_name), '[]'::jsonb)
    AS rows
  FROM expected_constraints AS expected
  LEFT JOIN actual_constraints AS actual
    ON actual.table_name = expected.table_name
   AND actual.constraint_name = expected.constraint_name
  WHERE actual.constraint_name IS NULL
     OR NOT actual.convalidated
     OR actual.actual_definition IS DISTINCT FROM expected.exact_definition
), unmapped_constraints AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', actual.table_name,
    'constraint', actual.constraint_name,
    'type', actual.constraint_type,
    'validated', actual.convalidated,
    'actual_definition', actual.actual_definition
  ) ORDER BY actual.table_name, actual.constraint_name), '[]'::jsonb) AS rows
  FROM (
    SELECT actual.*
    FROM actual_constraints AS actual
    LEFT JOIN expected_constraints AS expected
      ON expected.table_name = actual.table_name
     AND expected.constraint_name = actual.constraint_name
    WHERE expected.constraint_name IS NULL
    ORDER BY actual.table_name, actual.constraint_name
    LIMIT 50
  ) AS actual
), expected_indexes(
  index_name, unique_index, partial_index, exact_definition
) AS (
  VALUES
    ('teskeid_events_owner_created_idx', false, false, 'createindexteskeid_events_owner_created_idxonteskeid_eventsusingbtreeowner_user_id,created_atdesc,iddesc'),
    ('teskeid_event_guests_active_position_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_position_uidxonteskeid_event_guestsusingbtreeevent_id,positionwherestatus=active'),
    ('teskeid_event_guests_active_linked_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_linked_uidxonteskeid_event_guestsusingbtreeevent_id,linked_user_idwherestatus=activeandlinked_user_idisnotnull'),
    ('teskeid_event_guests_active_email_uidx', true, true, 'createuniqueindexteskeid_event_guests_active_email_uidxonteskeid_event_guestsusingbtreeevent_id,email_canonicalwherestatus=activeandemail_canonicalisnotnull'),
    ('teskeid_event_expense_links_expense_uidx', true, false, 'createuniqueindexteskeid_event_expense_links_expense_uidxonteskeid_event_expense_linksusingbtreeexpense_id'),
    ('teskeid_event_expense_sources_member_uidx', true, false, 'createuniqueindexteskeid_event_expense_sources_member_uidxonteskeid_event_expense_participant_sourcesusingbtreeevent_id,expense_id,expense_member_id')
), actual_indexes AS (
  SELECT
    index_relation.relname AS index_name,
    table_relation.relname AS table_name,
    index_row.indisvalid,
    index_row.indisready,
    index_row.indisunique,
    index_row.indpred IS NOT NULL AS partial_index,
    pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.pg_get_indexdef(index_row.indexrelid),
        '::[a-z0-9_]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'
    ), 'public.', '')) AS actual_definition
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_class AS table_relation
    ON table_relation.oid = index_row.indrelid
  WHERE index_row.indrelid IN (
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
      WHERE backing_constraint.conindid = index_row.indexrelid
    )
), index_components AS (
  SELECT
    pg_catalog.count(actual.index_name) = pg_catalog.count(*)
      AS mapped_indexes_present,
    COALESCE(pg_catalog.bool_and(
      actual.indisvalid
      AND actual.indisready
      AND actual.indisunique = expected.unique_index
      AND actual.partial_index = expected.partial_index
      AND actual.actual_definition = expected.exact_definition
    ), false) AS mapped_indexes_exact
  FROM expected_indexes AS expected
  LEFT JOIN actual_indexes AS actual
    ON actual.index_name = expected.index_name
), index_mismatches AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'index', expected.index_name,
    'reason', CASE
      WHEN actual.index_name IS NULL THEN 'missing'
      WHEN NOT actual.indisvalid THEN 'invalid'
      WHEN NOT actual.indisready THEN 'not_ready'
      WHEN actual.indisunique IS DISTINCT FROM expected.unique_index
        THEN 'unique_mismatch'
      WHEN actual.partial_index IS DISTINCT FROM expected.partial_index
        THEN 'partial_mismatch'
      ELSE 'definition_mismatch'
    END,
    'expected_definition', expected.exact_definition,
    'actual_definition', actual.actual_definition
  ) ORDER BY expected.index_name), '[]'::jsonb) AS rows
  FROM expected_indexes AS expected
  LEFT JOIN actual_indexes AS actual
    ON actual.index_name = expected.index_name
  WHERE actual.index_name IS NULL
     OR NOT actual.indisvalid
     OR NOT actual.indisready
     OR actual.indisunique IS DISTINCT FROM expected.unique_index
     OR actual.partial_index IS DISTINCT FROM expected.partial_index
     OR actual.actual_definition IS DISTINCT FROM expected.exact_definition
), unexpected_indexes AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', actual.table_name,
    'index', actual.index_name,
    'unique', actual.indisunique,
    'partial', actual.partial_index,
    'actual_definition', actual.actual_definition
  ) ORDER BY actual.table_name, actual.index_name), '[]'::jsonb) AS rows
  FROM (
    SELECT actual.*
    FROM actual_indexes AS actual
    LEFT JOIN expected_indexes AS expected
      ON expected.index_name = actual.index_name
    WHERE expected.index_name IS NULL
    ORDER BY actual.table_name, actual.index_name
    LIMIT 50
  ) AS actual
), expected_triggers(
  table_name, trigger_name, function_signature, deferred, trigger_type,
  definition_md5
) AS (
  VALUES
    ('teskeid_events', 'teskeid_events_touch_updated_at', 'public.teskeid_event_touch_updated_at()', false, 19::smallint, '573d2130576e33a2e0051aa5a53ee8da'),
    ('teskeid_event_guests', 'teskeid_event_guests_touch_updated_at', 'public.teskeid_event_touch_updated_at()', false, 19::smallint, '6ab521c4a591f84b98ec4e9fcf510284'),
    ('teskeid_events', 'teskeid_events_update_guard', 'public.teskeid_event_guard_event_update()', false, 19::smallint, '6f89ed31bd0f8ccd4287b2e45c52af60'),
    ('teskeid_event_guests', 'teskeid_event_guests_update_guard', 'public.teskeid_event_guard_guest_update()', false, 19::smallint, 'c95d9d09d7ea3561f953ffb95cb811da'),
    ('teskeid_event_mutation_requests', 'teskeid_event_receipts_mutation_guard', 'public.teskeid_event_guard_receipt_mutation()', false, 27::smallint, '848754f56bd8a534919b139b3f0cc458'),
    ('teskeid_event_guests', 'teskeid_event_guests_roster_deferred', 'public.teskeid_event_roster_integrity_trigger()', true, 29::smallint, '4b8716b13b134e7d6832c117af96515c'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_integrity_deferred', 'public.teskeid_event_expense_link_integrity_trigger()', true, 21::smallint, 'b894a0a3b041c416aebd9a71a873f627'),
    ('expense_groups', 'teskeid_event_expense_groups_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 25::smallint, 'bc5cf7c042812deacfd2f794d65a5f86'),
    ('expenses', 'teskeid_event_expenses_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 29::smallint, '561df7a8c634e5d2bab26bdb9b2936d6'),
    ('expense_group_members', 'teskeid_event_expense_members_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 25::smallint, '5d0863a8c09e3d8b7262515e39384045'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_immutable_guard', 'public.teskeid_event_immutable_history()', false, 19::smallint, 'c104d270839920cbef7d54860efedc13'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_immutable_guard', 'public.teskeid_event_immutable_history()', false, 19::smallint, '79d1621908f82e44486623f230a83ac4'),
    ('expense_groups', 'expense_groups_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, 'd45bd188fa0176d4fa61c63cb424c009'),
    ('expense_group_members', 'expense_group_members_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, 'ccc0eb4a0b013ad4c986f5341287e413'),
    ('expenses', 'expenses_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, 'ca572fab2b75ee46c873836490a644d4'),
    ('expense_repayments', 'expense_repayments_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, 'b0eecd854d61f45803dbdd499aae8045'),
    ('expense_member_invitations', 'expense_member_invitations_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, 'a3e6713cf26d93675d048d8f65b9bf6c'),
    ('expense_repayments', 'expense_repayments_encrypted_snapshot', 'public.expense_attach_encrypted_payment_snapshot()', false, 7::smallint, 'e5c03e7b03c09a6ab927f1715b4acd95'),
    ('expense_event_contexts', 'expense_event_context_integrity_deferred', 'public.expense_event_integrity_trigger()', true, 29::smallint, '7c8cbb816f61c1939189e112347fd0ad'),
    ('expense_event_participants', 'expense_event_participant_integrity_deferred', 'public.expense_event_integrity_trigger()', true, 29::smallint, '34ef57122946b539ddb2561776d1c578'),
    ('expense_groups', 'expense_event_group_integrity_deferred', 'public.expense_event_group_integrity_trigger()', true, 25::smallint, 'b36feb66029f7227ffeeb8815917e555'),
    ('expense_event_contexts', 'expense_event_context_immutable_guard', 'public.expense_event_context_immutable()', false, 19::smallint, '6f320f1e7e7dfb5e5bd81bc2a7a80846'),
    ('expense_event_participants', 'expense_event_participant_immutable_guard', 'public.expense_event_participant_immutable()', false, 19::smallint, '796bd35e3b8578b04f946a596e8fbf56'),
    ('expense_group_members', 'expense_event_group_members_frozen_guard', 'public.expense_event_roster_frozen()', false, 31::smallint, '7745e7a8d3e0c9725504c4bafbed5138'),
    ('expense_member_invitations', 'expense_event_member_invitations_guard', 'public.expense_event_invitation_blocked()', false, 23::smallint, 'e6a83614273083bd2d0cea63f0a3b0a2'),
    ('expense_repayments', 'expense_repayments_review_guard', 'public.expense_guard_new_reported_repayment()', false, 7::smallint, 'e415e6473a9d8c79dcaafd2e18ddb1d9'),
    ('expense_repayments', 'expense_repayments_batch_guard', 'public.expense_guard_batch_repayment_mutation()', false, 19::smallint, 'f48761fb749274d9eeb44338f7513816'),
    ('expense_settlement_batches', 'expense_settlement_batches_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint, '4e51b9bef5ccbb179133953b79fb4a8a'),
    ('expense_settlement_batches', 'expense_settlement_batches_immutable_guard', 'public.expense_guard_settlement_batch_mutation()', false, 27::smallint, '974c27452bc0ed04baca1d867165a593'),
    ('expense_settlement_batch_items', 'expense_settlement_batch_items_immutable_guard', 'public.expense_guard_settlement_batch_item_mutation()', false, 27::smallint, 'dbf47d9dbb0356750956625ff907bb67'),
    ('expense_group_members', 'expense_group_members_cancel_batches_before_unlink', 'public.expense_cancel_batches_before_user_unlink()', false, 19::smallint, '4c18ef1467d6fdbb22c1f4b0fbd1ef4e')
), trigger_tables(table_name) AS (
  VALUES
    ('teskeid_events'),
    ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources'),
    ('expense_groups'),
    ('expenses'),
    ('expense_group_members'),
    ('expense_member_invitations'),
    ('expense_repayments'),
    ('expense_settlement_batches'),
    ('expense_settlement_batch_items'),
    ('expense_event_contexts'),
    ('expense_event_participants')
), actual_triggers AS (
  SELECT
    table_row.table_name,
    trigger_row.tgname AS trigger_name,
    trigger_row.tgfoid,
    trigger_row.tgtype,
    trigger_row.tgenabled,
    trigger_row.tgdeferrable,
    trigger_row.tginitdeferred,
    pg_catalog.cardinality(trigger_row.tgattr::smallint[])
      AS update_column_count,
    trigger_row.tgqual IS NOT NULL AS has_when_clause,
    pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_triggerdef(trigger_row.oid),
        '::[a-z0-9_]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'), 'public.', ''
    ))) AS actual_definition_md5,
    pg_catalog.pg_get_triggerdef(trigger_row.oid) AS actual_definition
  FROM trigger_tables AS table_row
  JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgrelid = pg_catalog.to_regclass(
         'public.' || table_row.table_name
       )
   AND NOT trigger_row.tgisinternal
), trigger_components AS (
  SELECT
    pg_catalog.count(actual.trigger_name) = pg_catalog.count(*)
      AS mapped_triggers_present,
    COALESCE(pg_catalog.bool_and(
      actual.tgenabled = 'O'
      AND actual.tgfoid = pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND actual.tgdeferrable = expected.deferred
      AND actual.tginitdeferred = expected.deferred
      AND actual.tgtype = expected.trigger_type
      AND actual.actual_definition_md5 = expected.definition_md5
      AND CASE WHEN expected.trigger_name =
        'expense_group_members_cancel_batches_before_unlink' THEN (
          actual.update_column_count = 1
          AND actual.has_when_clause
        ) ELSE actual.update_column_count = 0
          AND NOT actual.has_when_clause END
    ), false) AS mapped_triggers_exact
  FROM expected_triggers AS expected
  LEFT JOIN actual_triggers AS actual
    ON actual.table_name = expected.table_name
   AND actual.trigger_name = expected.trigger_name
), trigger_mismatches AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', expected.table_name,
    'trigger', expected.trigger_name,
    'reason', CASE
      WHEN actual.trigger_name IS NULL THEN 'missing'
      WHEN actual.tgenabled IS DISTINCT FROM 'O' THEN 'not_origin_enabled'
      WHEN actual.tgfoid IS DISTINCT FROM pg_catalog.to_regprocedure(
        expected.function_signature
      ) THEN 'function_mismatch'
      WHEN actual.tgdeferrable IS DISTINCT FROM expected.deferred
        OR actual.tginitdeferred IS DISTINCT FROM expected.deferred
        THEN 'deferral_mismatch'
      WHEN actual.tgtype IS DISTINCT FROM expected.trigger_type
        THEN 'type_mismatch'
      WHEN actual.actual_definition_md5 IS DISTINCT FROM
        expected.definition_md5 THEN 'definition_mismatch'
      ELSE 'column_or_when_mismatch'
    END,
    'expected_function', expected.function_signature,
    'expected_type', expected.trigger_type,
    'actual_type', actual.tgtype,
    'expected_definition_md5', expected.definition_md5,
    'actual_definition_md5', actual.actual_definition_md5,
    'actual_definition', actual.actual_definition
  ) ORDER BY expected.table_name, expected.trigger_name), '[]'::jsonb)
    AS rows
  FROM expected_triggers AS expected
  LEFT JOIN actual_triggers AS actual
    ON actual.table_name = expected.table_name
   AND actual.trigger_name = expected.trigger_name
  WHERE actual.trigger_name IS NULL
     OR actual.tgenabled IS DISTINCT FROM 'O'
     OR actual.tgfoid IS DISTINCT FROM pg_catalog.to_regprocedure(
          expected.function_signature
        )
     OR actual.tgdeferrable IS DISTINCT FROM expected.deferred
     OR actual.tginitdeferred IS DISTINCT FROM expected.deferred
     OR actual.tgtype IS DISTINCT FROM expected.trigger_type
     OR actual.actual_definition_md5 IS DISTINCT FROM expected.definition_md5
     OR CASE WHEN expected.trigger_name =
          'expense_group_members_cancel_batches_before_unlink' THEN NOT (
            actual.update_column_count = 1 AND actual.has_when_clause
          ) ELSE NOT (
            actual.update_column_count = 0 AND NOT actual.has_when_clause
          ) END
), unexpected_triggers AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', actual.table_name,
    'trigger', actual.trigger_name,
    'function', actual.tgfoid::pg_catalog.regprocedure::text,
    'type', actual.tgtype,
    'definition_md5', actual.actual_definition_md5,
    'definition', actual.actual_definition
  ) ORDER BY actual.table_name, actual.trigger_name), '[]'::jsonb) AS rows
  FROM (
    SELECT actual.*
    FROM actual_triggers AS actual
    LEFT JOIN expected_triggers AS expected
      ON expected.table_name = actual.table_name
     AND expected.trigger_name = actual.trigger_name
    WHERE expected.trigger_name IS NULL
    ORDER BY actual.table_name, actual.trigger_name
    LIMIT 50
  ) AS actual
), snapshot_function_contract AS (
  SELECT pg_catalog.jsonb_build_object(
    'signature', 'public.expense_attach_encrypted_payment_snapshot()',
    'exists', procedure_row.oid IS NOT NULL,
    'expected_latest_repo_source_md5',
      '711bcb8e3e204e2164d58849a84fe5a5',
    'actual_source_md5', pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )),
    'result', pg_catalog.pg_get_function_result(procedure_row.oid),
    'arguments', pg_catalog.pg_get_function_arguments(procedure_row.oid),
    'security_definer', procedure_row.prosecdef,
    'owner', pg_catalog.pg_get_userbyid(procedure_row.proowner),
    'configuration', procedure_row.proconfig,
    'language', language_row.lanname,
    'volatility', procedure_row.provolatile::text,
    'parallel', procedure_row.proparallel::text,
    'strict', procedure_row.proisstrict,
    'leakproof', procedure_row.proleakproof,
    'public_execute', EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )) AS privilege
      WHERE privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ),
    'service_execute', pg_catalog.has_function_privilege(
      'service_role', procedure_row.oid, 'EXECUTE'
    ),
    'contract_matches_latest_repo',
      procedure_row.oid IS NOT NULL
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = '711bcb8e3e204e2164d58849a84fe5a5'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'trigger'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) = ''
      AND procedure_row.prosecdef
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN (
        'search_path=', 'search_path=""'
      )
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.provolatile = 'v'::"char"
      AND procedure_row.proparallel = 'u'::"char"
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
    )
  ) AS diagnostic
  FROM (VALUES (
    pg_catalog.to_regprocedure(
      'public.expense_attach_encrypted_payment_snapshot()'
    )
  )) AS candidate(oid)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = candidate.oid
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure_row.prolang
), coupling AS (
  SELECT pg_catalog.jsonb_build_object(
    'constraint_trigger_rows_excluded_from_structural_total', (
      SELECT pg_catalog.count(*) FROM actual_constraints
      WHERE constraint_type = 't'
    ),
    'baseline_trigger_contract_expected', 31,
    'baseline_trigger_contract_complete',
      (SELECT pg_catalog.count(*) = 31 FROM expected_triggers),
    'validator_repairs_reflected', true
  ) AS diagnostic
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.current_setting('server_version_num')::integer
    AS server_version_num,
  pg_catalog.now() AS checked_at,
  pg_catalog.jsonb_build_object(
    'canonical_expected', (SELECT pg_catalog.count(*) FROM expected_constraints),
    'current_preflight_explicit_map', 32,
    'actual_total', (SELECT pg_catalog.count(*) FROM actual_constraints),
    'actual_structural_total', (
      SELECT pg_catalog.count(*) FROM actual_constraints
      WHERE constraint_type IN ('c', 'f', 'p', 'u', 'x')
    ),
    'gate_expected_structural_total', 32,
    'actual_by_type', COALESCE((
      SELECT pg_catalog.jsonb_object_agg(
        grouped.constraint_type, grouped.type_count
        ORDER BY grouped.constraint_type
      )
      FROM (
        SELECT constraint_type, pg_catalog.count(*) AS type_count
        FROM actual_constraints
        GROUP BY constraint_type
      ) AS grouped
    ), '{}'::jsonb),
    'unexpected_count', (
      SELECT pg_catalog.count(*)
      FROM actual_constraints AS actual
      LEFT JOIN expected_constraints AS expected
        ON expected.table_name = actual.table_name
       AND expected.constraint_name = actual.constraint_name
      WHERE expected.constraint_name IS NULL
    ),
    'mapped_present', constraint_components.mapped_constraints_present,
    'mapped_exact', constraint_components.mapped_constraints_exact,
    'actual_structural_total_exact', (
      SELECT pg_catalog.count(*) = 32 FROM actual_constraints
      WHERE constraint_type IN ('c', 'f', 'p', 'u', 'x')
    )
  ) AS constraint_summary,
  constraint_mismatches.rows AS constraint_mismatches,
  unmapped_constraints.rows AS unmapped_constraints,
  pg_catalog.jsonb_build_object(
    'mapped_expected', (SELECT pg_catalog.count(*) FROM expected_indexes),
    'actual_nonconstraint_total', (
      SELECT pg_catalog.count(*) FROM actual_indexes
    ),
    'gate_expected_total', 6,
    'mapped_present', index_components.mapped_indexes_present,
    'mapped_exact', index_components.mapped_indexes_exact,
    'unexpected_count', (
      SELECT pg_catalog.count(*)
      FROM actual_indexes AS actual
      LEFT JOIN expected_indexes AS expected
        ON expected.index_name = actual.index_name
      WHERE expected.index_name IS NULL
    ),
    'actual_total_exact', (SELECT pg_catalog.count(*) = 6 FROM actual_indexes)
  ) AS index_summary,
  index_mismatches.rows AS index_mismatches,
  unexpected_indexes.rows AS unexpected_indexes,
  pg_catalog.jsonb_build_object(
    'mapped_expected', (SELECT pg_catalog.count(*) FROM expected_triggers),
    'actual_total', (SELECT pg_catalog.count(*) FROM actual_triggers),
    'gate_expected_total', 31,
    'mapped_present', trigger_components.mapped_triggers_present,
    'mapped_exact', trigger_components.mapped_triggers_exact,
    'unexpected_count', (
      SELECT pg_catalog.count(*)
      FROM actual_triggers AS actual
      LEFT JOIN expected_triggers AS expected
        ON expected.table_name = actual.table_name
       AND expected.trigger_name = actual.trigger_name
      WHERE expected.trigger_name IS NULL
    ),
    'actual_total_exact', (SELECT pg_catalog.count(*) = 31 FROM actual_triggers)
  ) AS trigger_summary,
  trigger_mismatches.rows AS trigger_mismatches,
  unexpected_triggers.rows AS unexpected_triggers,
  snapshot_function_contract.diagnostic AS snapshot_function_contract,
  coupling.diagnostic AS coupling_diagnostic
FROM constraint_components
CROSS JOIN constraint_mismatches
CROSS JOIN unmapped_constraints
CROSS JOIN index_components
CROSS JOIN index_mismatches
CROSS JOIN unexpected_indexes
CROSS JOIN trigger_components
CROSS JOIN trigger_mismatches
CROSS JOIN unexpected_triggers
CROSS JOIN snapshot_function_contract
CROSS JOIN coupling;

ROLLBACK;
