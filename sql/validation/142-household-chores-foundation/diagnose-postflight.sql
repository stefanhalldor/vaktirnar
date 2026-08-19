-- SQL142 committed-state diagnosis. Catalog-only, bounded, and read-only.
-- Run only after SQL142 committed and postflight returned false.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
expected_relations(
  relation_name,
  constraint_count,
  constraint_contract_md5,
  index_count,
  index_name_contract_md5
) AS (
  VALUES
    ('household_chore_assignment_events', 12, '6e39e39a1c5dadb38a8b8af2d225c9d6', 6, 'b5e02fc4fcf108e9f61adee469efe795'),
    ('household_chore_assignments', 20, '62c245abee4cb2515ae55f166b695552', 10, 'd94696453560f9497f0b54792c8c0d3e'),
    ('household_chore_circles', 6, '9d3881fa768faa9b32d7a0a0de87e477', 3, '930dce706f6c04798513e1923ca8dcc1'),
    ('household_chore_definition_events', 5, '8b035d900af4170eb09938366df60b60', 3, 'acb7a587488369d481a10f007f770e97'),
    ('household_chore_definitions', 10, 'c031435d46283d4fe0d89f347ee0280c', 3, '45396215424bf80581eaa8d97202c7d7'),
    ('household_chore_delete_authorizations', 3, 'b2e07443ab5da7b3b3d3008e744ba143', 2, 'e41c5e58c53d3a229850fe1f8b3676db'),
    ('household_chore_delete_tombstones', 5, '682b77bd477bcd1ef6b4e9d092a9cdfc', 2, '3853fab95425f042583f4442a0637ab8'),
    ('household_chore_deletion_markers', 4, 'b3549bb5421d1908d737982d765dca0f', 2, '72f140a5bbd916e3b2a6374b4d683d66'),
    ('household_chore_invitations', 14, 'd54bc795b8789322c832aad8152a7632', 9, '565f32e966bd314a7ed33ef487dc601d'),
    ('household_chore_membership_events', 8, '83cb808d1008fbddce18aea8573cccc7', 4, 'cd630efb9e2ec4f91b616b5b20599dd8'),
    ('household_chore_memberships', 12, '761189e92c88785b754522fde47cb51f', 7, '2f5117f88529d7b054450b663b1624fe'),
    ('household_chore_mutation_requests', 8, '6f7a5ad6e3ec539ce64fd59841741924', 3, 'c13cfff54b4d555555582b436482d624'),
    ('household_chore_participant_values', 9, 'e1dff659da5fd11612fd8cadfa6a527b', 4, 'b882a2f2ef36bbd36828649af5fbd32c'),
    ('household_chore_participants', 11, '2b8f65891941c7218091daa7b3c21b4c', 5, '2ed401fe37b1adf213065642d0936165'),
    ('household_chore_point_entries', 10, '39bb52b4b1d2a4b09663b6890ab7a32f', 7, 'fbc576f3f9f7ef1d4dd6603c96aa7177'),
    ('household_chore_rate_events', 7, 'b7c2c59b3b1d1852fe206f5441abf1b0', 6, '702ab3c897d96d4b72dae88d093e36c0'),
    ('household_chore_type_authorizations', 5, '48975b6100376cfb22baf6feed9fa0f7', 4, '9de457a704898b4084cb39c46e22c0dc')
),
expected_functions(
  function_signature,
  result_identity,
  language_name,
  volatility,
  is_strict,
  body_md5,
  service_execute
) AS (
  VALUES
    ('household_chore_private_lock_user(p_user_id uuid)', 'pg_catalog.void', 'sql', 'v', false, 'd076df528726fff6ea25ff012caa64b2', false),
    ('household_chore_private_fingerprint(p_canonical_input jsonb)', 'pg_catalog.bytea', 'sql', 'i', true, '86753c25b3ad02dff88f8f3b25b837e0', false),
    ('household_chore_private_result(p_ok boolean, p_code text, p_request_id uuid, p_data jsonb)', 'pg_catalog.jsonb', 'sql', 'i', false, 'a726c7188fd375f767f302817b27698d', false),
    ('household_chore_private_read_result(p_ok boolean, p_code text, p_data jsonb)', 'pg_catalog.jsonb', 'sql', 'i', false, 'e595c179f19fe09c97ddcc1352893db0', false),
    ('household_chore_private_safe_user_label(p_user_id uuid)', 'pg_catalog.text', 'sql', 's', false, '8e3a558b1bbf34a473c0740e465c3dff', false),
    ('household_chore_private_is_entitled(p_user_id uuid)', 'pg_catalog.bool', 'sql', 's', false, 'd17faa0d965f08e995a50c2e59bacc71', false),
    ('household_chore_private_actor_ready(p_user_id uuid)', 'pg_catalog.bool', 'sql', 's', false, '1d5f57c53a6ac219148544f51d2e2233', false),
    ('household_chore_private_begin_request(p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_resolved_target_user_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '11f03fc500eee2ae3a3a0c4a44ceda16', false),
    ('household_chore_private_finish_request(p_actor_id uuid, p_request_id uuid, p_result jsonb)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'c2c8142f070e46aca3d2fd0b52655003', false),
    ('household_chore_private_touch_updated_at()', 'pg_catalog.trigger', 'plpgsql', 'v', false, 'a3f7b451ded31cc96c977ff172329ecb', false),
    ('household_chore_private_immutable_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, 'c346068825031ab65a9e6bb34db8b3f1', false),
    ('household_chore_private_type_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '151d1728cc9532724b39c4a9782118cc', false),
    ('household_chore_private_membership_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '76e1150100ec6b243f14c30022fe7d0d', false),
    ('household_chore_private_invitation_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '120bb1d6080320f0491c967dfc106233', false),
    ('household_chore_private_participant_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '2e716aa96f68dd8567f69a8f7430758a', false),
    ('household_chore_private_point_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '5fdd2581a51947cd4bc66ade369dedc4', false),
    ('household_chore_private_validate_circle()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '33a48537952811e6c289bb52dd187381', false),
    ('household_chore_get_root(p_actor_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, '9d4bad1038bdbe6c802c1003d6182905', true),
    ('household_chore_get_invitation_preview(p_actor_id uuid, p_invitation_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'fa002f31957a987e6e2d3d7cd9c1077c', true),
    ('household_chore_get_memberships(p_actor_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'b00ea08f5af0093d9dc9cde6fe981e99', true),
    ('household_chore_get_circle(p_actor_id uuid, p_circle_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, '7aba626843911e23fda91b469b1b3292', true),
    ('household_chore_get_definition_detail(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'db30a9a9487b84cb1c04c9ab36eecde4', true),
    ('household_chore_get_invite_candidates(p_actor_id uuid, p_circle_id uuid, p_cursor_label text, p_cursor_relationship_id uuid, p_limit integer)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'e8d0668bd81a891368b7bd74d0cc751a', true),
    ('household_chore_get_self_service(p_actor_id uuid, p_circle_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'd71bedd78a382c6082e6742eb0e45f4b', true),
    ('household_chore_private_history_page(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid, p_assignment_id uuid, p_include_created boolean, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'd97003a86f94801f56f6dd9f99dc1920', false),
    ('household_chore_get_definition_history(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)', 'pg_catalog.jsonb', 'plpgsql', 's', false, '7879dacb788526a88366ed93dbf57988', true),
    ('household_chore_get_assignment_timeline(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)', 'pg_catalog.jsonb', 'plpgsql', 's', false, 'e7ccdb048ecefa35a9347be5113bcb91', true),
    ('household_chore_get_assignment(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 's', false, '27b4bab93d0808a5c0c7e541ee3570c4', true),
    ('household_chore_sync_recent(p_actor_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '847564180abe8bd6f75087c7fd26ff00', true),
    ('household_chore_private_start_mutation(p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_require_entitlement boolean)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '0639649555e07e3ac075086568ba76cb', false),
    ('household_chore_private_start_target_mutation(p_actor_id uuid, p_target_user_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_require_actor_entitlement boolean)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'eeb4e50f6ddb09222fc021b5272ebb9c', false),
    ('household_chore_private_expire_invitations(p_circle_id uuid, p_invitee_user_id uuid)', 'pg_catalog.int4', 'plpgsql', 'v', false, 'a96629b932a0208602df3e7fc9acf6b4', false),
    ('household_chore_private_prune_rates(p_actor_id uuid, p_circle_id uuid, p_target_user_id uuid, p_participant_id uuid)', 'pg_catalog.int4', 'plpgsql', 'v', false, 'dc71e97d8ee55f081d5bc01c7b87f7ba', false),
    ('household_chore_private_insert_assignment_event(p_assignment household_chore_assignments, p_event_type text, p_status_after text, p_actor_user_id uuid, p_actor_identity_marker text, p_completion_sequence integer, p_points_delta integer, p_cancellation_reason text, p_reopen_outcome text)', 'pg_catalog.uuid', 'plpgsql', 'v', false, 'f8c619d99e6a5ff30164046421ed5d49', false),
    ('household_chore_create_circle(p_actor_id uuid, p_request_id uuid, p_name text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'bda1dd9b271c868e9bf9edd4e0ec9907', true),
    ('household_chore_rename_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_name text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '36ec9ee072288c85ee6d7f261b6b20b1', true),
    ('household_chore_delete_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_display_reference text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'a46a079d968a8db0d263cc599984cf68', true),
    ('household_chore_create_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_relationship_id uuid, p_requested_type text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '4d9b2165e470b6216f6123f4352c2b45', true),
    ('household_chore_cancel_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_invitation_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'd1033c014519bcf6ddc733044ed86cc5', true),
    ('household_chore_accept_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'cadf7686e3559adbe35ffeaaaff4aeb8', true),
    ('household_chore_decline_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '8c790e1d9a249e280714936157712bf6', true),
    ('household_chore_change_membership_type(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint, p_new_type text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '4ee42e867507df4bd0d70f5f56f4b433', true),
    ('household_chore_private_end_membership(p_actor_id uuid, p_membership household_chore_memberships, p_new_status text, p_cancel_reason text)', 'pg_catalog.uuid', 'plpgsql', 'v', false, '5e20fe81d3b9770c203890cab5bf97a5', false),
    ('household_chore_remove_member(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '0ba7d569a31f4d1134045ac388268ce8', true),
    ('household_chore_leave_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '0659e49c33aca9fb121789bc9eacf83e', true),
    ('household_chore_create_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_label text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'dfd062c19781b33d312c718fef47f8ef', true),
    ('household_chore_archive_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'b124c2499d4a095946cc4937642d72c3', true),
    ('household_chore_reactivate_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'f845030f9bd83451743f9f28e1998c0e', true),
    ('household_chore_create_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_title text, p_description text, p_materials text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '3eac777abc780a853239636e4471bd11', true),
    ('household_chore_update_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint, p_title text, p_description text, p_materials text)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '9ec3a5542658310fea9558f64a86ecd7', true),
    ('household_chore_archive_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '54f5667ddd614609916cf6344fdd6044', true),
    ('household_chore_reactivate_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '996adc98ad82cb9b69fa781b2e718e2b', true),
    ('household_chore_set_participant_value(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint, p_points integer, p_active boolean)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'a4c632500184b1a27cf45bb241e1ebc1', true),
    ('household_chore_private_create_assignment(p_actor_id uuid, p_definition household_chore_definitions, p_participant household_chore_participants, p_value household_chore_participant_values, p_origin text, p_repeated_from_assignment_id uuid)', 'public.household_chore_assignments', 'plpgsql', 'v', false, 'caf16182de59d2672f22a7f4850d5d90', false),
    ('household_chore_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '1bd9a19d63ab128e743408d90872b2b3', true),
    ('household_chore_self_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '6e5aff713be520c2dfc091eb04b9b52a', true),
    ('household_chore_repeat_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_source_assignment_id uuid, p_expected_source_version bigint, p_expected_definition_version bigint, p_expected_value_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'a1fbf1bdfd8b3dad5bff038782b9600a', true),
    ('household_chore_complete_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '468878ebca04a98bdd04ed2445724ecc', true),
    ('household_chore_private_cancel_assignment(p_actor_id uuid, p_assignment household_chore_assignments, p_reason text)', 'public.household_chore_assignments', 'plpgsql', 'v', false, '6149f7e8b1365141b91ca0cf5a656853', false),
    ('household_chore_cancel_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '75b326c50dc69e9afc5f4db34d86be2a', true),
    ('household_chore_cancel_own_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, 'f4e2dc0b3349b199d1c5e1a0702de636', true),
    ('household_chore_undo_completion(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '11b546544c1569e428603f8c84da5577', true),
    ('household_chore_private_user_has_references(p_user_id uuid)', 'pg_catalog.bool', 'sql', 's', false, '19fb2bb7b58f1d41717c95f15307ae7a', false),
    ('household_chore_prepare_account_deletion(p_user_id uuid)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '4a5a115c0ee3fee3b1544b074e409d5f', true),
    ('household_chore_abort_account_deletion(p_user_id uuid, p_marker_token uuid)', 'pg_catalog.jsonb', 'plpgsql', 'v', false, '6b5e23ee3a7f2be490bc72b035cebf18', true),
    ('household_chore_auth_delete_guard()', 'pg_catalog.trigger', 'plpgsql', 'v', false, '81cf90760190160f5ecc4d6f6f2c8519', false)
),
actual_constraints AS (
  SELECT
    relation_row.relname::text AS relation_name,
    pg_catalog.count(*)::integer AS constraint_count,
    pg_catalog.md5(pg_catalog.string_agg(pg_catalog.format(
      '%s:%s:%s:%s', constraint_row.conname, constraint_row.contype,
      constraint_row.condeferrable::text, constraint_row.condeferred::text
    ), ',' ORDER BY constraint_row.conname)) AS constraint_contract_md5,
    pg_catalog.array_agg(pg_catalog.format(
      '%s:%s:%s:%s', constraint_row.conname, constraint_row.contype,
      constraint_row.condeferrable::text, constraint_row.condeferred::text
    ) ORDER BY constraint_row.conname) AS constraint_contracts
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')
    AND constraint_row.convalidated
  GROUP BY relation_row.relname
),
actual_indexes AS (
  SELECT
    relation_row.relname::text AS relation_name,
    pg_catalog.count(*)::integer AS index_count,
    pg_catalog.md5(pg_catalog.string_agg(
      index_relation.relname::text, ',' ORDER BY index_relation.relname
    )) AS index_name_contract_md5,
    pg_catalog.array_agg(
      index_relation.relname::text ORDER BY index_relation.relname
    ) AS index_names,
    pg_catalog.bool_and(index_row.indisvalid AND index_row.indisready)
      AS indexes_ready
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  WHERE relation_namespace.nspname = 'public'
    AND index_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
  GROUP BY relation_row.relname
),
constraint_mismatches AS (
  SELECT
    expected.relation_name,
    expected.constraint_count AS expected_count,
    actual.constraint_count AS actual_count,
    expected.constraint_contract_md5 AS expected_md5,
    actual.constraint_contract_md5 AS actual_md5,
    actual.constraint_contracts
  FROM expected_relations AS expected
  LEFT JOIN actual_constraints AS actual USING (relation_name)
  WHERE actual.relation_name IS NULL
     OR actual.constraint_count IS DISTINCT FROM expected.constraint_count
     OR actual.constraint_contract_md5 IS DISTINCT FROM
       expected.constraint_contract_md5
),
index_mismatches AS (
  SELECT
    expected.relation_name,
    expected.index_count AS expected_count,
    actual.index_count AS actual_count,
    expected.index_name_contract_md5 AS expected_md5,
    actual.index_name_contract_md5 AS actual_md5,
    actual.index_names,
    actual.indexes_ready
  FROM expected_relations AS expected
  LEFT JOIN actual_indexes AS actual USING (relation_name)
  WHERE actual.relation_name IS NULL
     OR actual.index_count IS DISTINCT FROM expected.index_count
     OR actual.index_name_contract_md5 IS DISTINCT FROM
       expected.index_name_contract_md5
     OR actual.indexes_ready IS NOT TRUE
),
actual_functions AS (
  SELECT
    pg_catalog.format(
      '%s(%s)', function_row.proname,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
    ) AS function_signature,
    function_row.*,
    language_row.lanname,
    owner_role.rolname AS owner_name
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = function_row.proowner
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
function_checks AS (
  SELECT
    expected.*,
    actual.oid,
    actual.owner_name,
    actual.prokind,
    actual.prorettype,
    actual.lanname AS actual_language,
    actual.provolatile::text AS actual_volatility,
    actual.proisstrict AS actual_strict,
    actual.proretset,
    actual.proleakproof,
    actual.proparallel::text AS actual_parallel,
    actual.prosecdef,
    actual.proconfig,
    pg_catalog.md5(pg_catalog.replace(
      actual.prosrc, E'\r\n', E'\n'
    )) AS actual_body_md5,
    CASE WHEN actual.oid IS NULL THEN false ELSE EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        actual.proacl, pg_catalog.acldefault('f', actual.proowner)
      )) AS acl_row
      WHERE acl_row.privilege_type = 'EXECUTE'
        AND acl_row.grantor = actual.proowner
        AND acl_row.grantee = actual.proowner
        AND NOT acl_row.is_grantable
    ) END AS owner_execute_ok,
    CASE WHEN actual.oid IS NULL THEN false ELSE COALESCE((
      SELECT pg_catalog.bool_or(
        acl_row.privilege_type = 'EXECUTE'
        AND grantee_role.rolname = 'service_role'
      )
      FROM pg_catalog.aclexplode(COALESCE(
        actual.proacl, pg_catalog.acldefault('f', actual.proowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
    ), false) END AS actual_service_execute,
    CASE WHEN actual.oid IS NULL THEN NULL ELSE (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.aclexplode(COALESCE(
        actual.proacl, pg_catalog.acldefault('f', actual.proowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
      WHERE acl_row.privilege_type <> 'EXECUTE'
         OR acl_row.grantor <> actual.proowner
         OR acl_row.is_grantable
         OR NOT (
           acl_row.grantee = actual.proowner
           OR (expected.service_execute
             AND grantee_role.rolname = 'service_role')
         )
    ) END AS unexpected_acl_count
  FROM expected_functions AS expected
  LEFT JOIN actual_functions AS actual USING (function_signature)
),
function_mismatches AS (
  SELECT
    function_signature,
    oid IS NULL AS missing,
    owner_name,
    prokind,
    pg_catalog.format_type(prorettype, NULL) AS actual_result,
    result_identity AS expected_result,
    actual_language,
    language_name AS expected_language,
    actual_volatility,
    volatility AS expected_volatility,
    actual_strict,
    is_strict AS expected_strict,
    proretset,
    proleakproof,
    actual_parallel,
    prosecdef,
    proconfig,
    actual_body_md5,
    body_md5 AS expected_body_md5,
    owner_execute_ok,
    actual_service_execute,
    service_execute AS expected_service_execute,
    unexpected_acl_count
  FROM function_checks
  WHERE oid IS NULL
     OR owner_name <> 'postgres'
     OR prokind <> 'f'
     OR prorettype IS DISTINCT FROM pg_catalog.to_regtype(result_identity)
     OR actual_language IS DISTINCT FROM language_name
     OR actual_volatility IS DISTINCT FROM volatility
     OR actual_strict IS DISTINCT FROM is_strict
     OR proretset
     OR proleakproof
     OR actual_parallel <> 'u'
     OR NOT prosecdef
     OR pg_catalog.cardinality(COALESCE(proconfig, ARRAY[]::text[])) <> 1
     OR proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR actual_body_md5 IS DISTINCT FROM body_md5
     OR NOT owner_execute_ok
     OR actual_service_execute IS DISTINCT FROM service_execute
     OR unexpected_acl_count <> 0
),
private_table_issues AS (
  SELECT
    relation_row.relname::text AS relation_name,
    owner_role.rolname AS owner_name,
    relation_row.relrowsecurity,
    relation_row.relforcerowsecurity,
    (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = relation_row.oid
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
        AND attribute_row.attacl IS NOT NULL
    ) AS column_acl_count,
    (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r', relation_row.relowner)
      )) AS acl_row
    ) AS relation_acl_count,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
        'grantor', grantor_role.rolname,
        'privilege', acl_row.privilege_type,
        'grantable', acl_row.is_grantable
      ) ORDER BY acl_row.privilege_type)
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r', relation_row.relowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
      LEFT JOIN pg_catalog.pg_roles AS grantor_role
        ON grantor_role.oid = acl_row.grantor
    ), '[]'::jsonb) AS acl_entries
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = relation_row.relowner
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
    AND (
      owner_role.rolname <> 'postgres'
      OR NOT relation_row.relrowsecurity
      OR NOT relation_row.relforcerowsecurity
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_row.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
      ) <> 8
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
        WHERE acl_row.grantor <> relation_row.relowner
           OR acl_row.grantee <> relation_row.relowner
           OR acl_row.is_grantable
           OR acl_row.privilege_type NOT IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
             'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
      )
    )
),
sequence_state AS (
  SELECT pg_catalog.jsonb_build_object(
    'present', true,
    'owner', owner_role.rolname,
    'acl_count', (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(COALESCE(
        sequence_row.relacl,
        pg_catalog.acldefault('s', sequence_row.relowner)
      )) AS acl_row
    ),
    'acl_entries', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
        'privilege', acl_row.privilege_type,
        'grantable', acl_row.is_grantable
      ) ORDER BY acl_row.privilege_type)
      FROM pg_catalog.aclexplode(COALESCE(
        sequence_row.relacl,
        pg_catalog.acldefault('s', sequence_row.relowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
    ), '[]'::jsonb)
  ) AS value
  FROM pg_catalog.pg_class AS sequence_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = sequence_row.relnamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = sequence_row.relowner
  WHERE namespace_row.nspname = 'public'
    AND sequence_row.relname = 'household_chore_rate_events_id_seq'
    AND sequence_row.relkind = 'S'
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(to_jsonb(mismatch)
      ORDER BY mismatch.relation_name)
    FROM constraint_mismatches AS mismatch
  ), '[]'::jsonb) AS constraint_mismatches,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(to_jsonb(mismatch)
      ORDER BY mismatch.relation_name)
    FROM index_mismatches AS mismatch
  ), '[]'::jsonb) AS index_mismatches,
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_class AS object_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = object_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(object_row.relname::text, 16) = 'household_chore_'
  ) AS private_object_count,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(to_jsonb(issue)
      ORDER BY issue.relation_name)
    FROM private_table_issues AS issue
  ), '[]'::jsonb) AS private_table_issues,
  COALESCE((SELECT value FROM sequence_state),
    '{"present":false}'::jsonb) AS sequence_state,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.format(
      '%s.%s', namespace_row.nspname, relation_row.relname
    ) ORDER BY namespace_row.nspname, relation_row.relname)
    FROM pg_catalog.pg_policy AS policy_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = policy_row.polrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
  ), '[]'::jsonb) AS policy_relations,
  (SELECT pg_catalog.count(*) FROM actual_functions) AS actual_function_count,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(to_jsonb(mismatch)
      ORDER BY mismatch.function_signature)
    FROM function_mismatches AS mismatch
  ), '[]'::jsonb) AS function_mismatches;

ROLLBACK;
