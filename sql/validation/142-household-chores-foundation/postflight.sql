-- SQL142 postflight: exact read-only attestation of the committed Household
-- Chores foundation. It returns one bounded row and no application data.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
expected_relations(
  relation_name,
  column_count,
  column_contract_md5,
  constraint_count,
  constraint_contract_md5,
  index_count,
  index_name_contract_md5
) AS (
  VALUES
    ('household_chore_assignment_events', 19, '63b446a95518b37e73315834f60a077d', 12, '6e39e39a1c5dadb38a8b8af2d225c9d6', 6, 'b5e02fc4fcf108e9f61adee469efe795'),
    ('household_chore_assignments', 23, '3fb87350a6ad2097d17cf2bd75506147', 20, '62c245abee4cb2515ae55f166b695552', 10, 'd94696453560f9497f0b54792c8c0d3e'),
    ('household_chore_circles', 7, 'a59393bcc01b47f5ad22ec770314bda2', 6, '9d3881fa768faa9b32d7a0a0de87e477', 3, '930dce706f6c04798513e1923ca8dcc1'),
    ('household_chore_definition_events', 7, '1dbdd96026de48fa481fe849b7691ed8', 5, '8b035d900af4170eb09938366df60b60', 3, 'acb7a587488369d481a10f007f770e97'),
    ('household_chore_definitions', 11, 'd15deab89e1dba63b52bf98869466fbf', 10, 'c031435d46283d4fe0d89f347ee0280c', 3, '45396215424bf80581eaa8d97202c7d7'),
    ('household_chore_delete_authorizations', 6, '215e2b178eb89fe5111441371f149522', 3, 'b2e07443ab5da7b3b3d3008e744ba143', 2, 'e41c5e58c53d3a229850fe1f8b3676db'),
    ('household_chore_delete_tombstones', 6, '6cc45ef30ed6450da04f0fe97cdeedd4', 5, '682b77bd477bcd1ef6b4e9d092a9cdfc', 2, '3853fab95425f042583f4442a0637ab8'),
    ('household_chore_deletion_markers', 6, '4438c05d32d35c7c2196e9cde79052f9', 4, 'b3549bb5421d1908d737982d765dca0f', 2, '72f140a5bbd916e3b2a6374b4d683d66'),
    ('household_chore_invitations', 14, '3ecc502406ff321a586c8fa1da928af8', 14, 'd54bc795b8789322c832aad8152a7632', 9, '565f32e966bd314a7ed33ef487dc601d'),
    ('household_chore_membership_events', 11, 'aed6ad9e3fe9c438b2ab52cd7e2ac50d', 8, '83cb808d1008fbddce18aea8573cccc7', 4, 'cd630efb9e2ec4f91b616b5b20599dd8'),
    ('household_chore_memberships', 15, '311a6bf90e775a134c3527d340f65f18', 12, '761189e92c88785b754522fde47cb51f', 7, '2f5117f88529d7b054450b663b1624fe'),
    ('household_chore_mutation_requests', 10, '5d6b08cddc871a335e00d191c0ef7256', 8, '6f7a5ad6e3ec539ce64fd59841741924', 3, 'c13cfff54b4d555555582b436482d624'),
    ('household_chore_participant_values', 9, 'e77ad29e1b7372fe9a3a98f2f8a1ab88', 9, 'e1dff659da5fd11612fd8cadfa6a527b', 4, 'b882a2f2ef36bbd36828649af5fbd32c'),
    ('household_chore_participants', 11, '18780758d349552e3745df08d571d57a', 11, '2b8f65891941c7218091daa7b3c21b4c', 5, '2ed401fe37b1adf213065642d0936165'),
    ('household_chore_point_entries', 11, 'c1c6dda8eb5a51feff340bfe2e574fe6', 10, '39bb52b4b1d2a4b09663b6890ab7a32f', 7, 'fbc576f3f9f7ef1d4dd6603c96aa7177'),
    ('household_chore_rate_events', 7, '170d0eee96635ddab9d48383bb91431c', 7, 'b7c2c59b3b1d1852fe206f5441abf1b0', 6, '702ab3c897d96d4b72dae88d093e36c0'),
    ('household_chore_type_authorizations', 8, '21376b8814472d96bd1ea7a672dfcb59', 5, '48975b6100376cfb22baf6feed9fa0f7', 4, '9de457a704898b4084cb39c46e22c0dc')
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
expected_triggers(
  trigger_name,
  relation_schema,
  relation_name,
  function_name,
  trigger_type,
  is_deferrable,
  is_initially_deferred,
  update_attribute_count
) AS (
  VALUES
    ('household_chore_assignment_events_immutable', 'public', 'household_chore_assignment_events', 'household_chore_private_immutable_guard', 27, false, false, 0),
    ('household_chore_assignments_touch', 'public', 'household_chore_assignments', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_auth_delete_guard', 'auth', 'users', 'household_chore_auth_delete_guard', 11, false, false, 0),
    ('household_chore_circle_invitation_integrity', 'public', 'household_chore_invitations', 'household_chore_private_validate_circle', 29, true, true, 0),
    ('household_chore_circle_membership_integrity', 'public', 'household_chore_memberships', 'household_chore_private_validate_circle', 29, true, true, 0),
    ('household_chore_circle_participant_integrity', 'public', 'household_chore_participants', 'household_chore_private_validate_circle', 29, true, true, 0),
    ('household_chore_circles_touch', 'public', 'household_chore_circles', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_definition_events_immutable', 'public', 'household_chore_definition_events', 'household_chore_private_immutable_guard', 27, false, false, 0),
    ('household_chore_definitions_touch', 'public', 'household_chore_definitions', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_invitation_provenance_guard', 'public', 'household_chore_invitations', 'household_chore_private_invitation_guard', 19, false, false, 0),
    ('household_chore_invitations_touch', 'public', 'household_chore_invitations', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_membership_events_immutable', 'public', 'household_chore_membership_events', 'household_chore_private_immutable_guard', 27, false, false, 0),
    ('household_chore_membership_provenance_guard', 'public', 'household_chore_memberships', 'household_chore_private_membership_guard', 23, false, false, 0),
    ('household_chore_membership_type_guard', 'public', 'household_chore_memberships', 'household_chore_private_type_guard', 19, false, false, 1),
    ('household_chore_memberships_touch', 'public', 'household_chore_memberships', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_participant_identity_guard', 'public', 'household_chore_participants', 'household_chore_private_participant_guard', 19, false, false, 0),
    ('household_chore_participants_touch', 'public', 'household_chore_participants', 'household_chore_private_touch_updated_at', 19, false, false, 0),
    ('household_chore_points_immutable', 'public', 'household_chore_point_entries', 'household_chore_private_immutable_guard', 27, false, false, 0),
    ('household_chore_points_insert_guard', 'public', 'household_chore_point_entries', 'household_chore_private_point_guard', 7, false, false, 0),
    ('household_chore_values_touch', 'public', 'household_chore_participant_values', 'household_chore_private_touch_updated_at', 19, false, false, 0)
),
catalog_relation_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      relation_row.relkind::text,
      relation_row.relpersistence::text,
      relation_row.relreplident::text,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(relation_row.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb)
    ) ORDER BY relation_row.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = relation_row.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
catalog_column_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      attribute_row.attnum,
      attribute_row.attname::text,
      pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod),
      attribute_row.attnotnull,
      attribute_row.attidentity::text,
      attribute_row.attgenerated::text,
      attribute_row.atthasdef,
      collation_namespace.nspname,
      collation_row.collname,
      pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, false)
    ) ORDER BY relation_row.relname::text COLLATE "C", attribute_row.attnum
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = relation_row.oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_row
    ON collation_row.oid = attribute_row.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_row.collnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
),
catalog_constraint_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      constraint_row.conname::text,
      constraint_row.contype::text,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.convalidated,
      constraint_row.connoinherit,
      constraint_row.conislocal,
      constraint_row.coninhcount,
      pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
    ) ORDER BY relation_row.relname::text COLLATE "C",
      constraint_row.conname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
catalog_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      index_namespace.nspname::text,
      index_relation.relname::text,
      access_method.amname::text,
      index_row.indisunique,
      index_row.indisprimary,
      index_row.indisexclusion,
      index_row.indimmediate,
      index_row.indisclustered,
      index_row.indisvalid,
      index_row.indisready,
      index_row.indislive,
      index_row.indisreplident,
      index_row.indnkeyatts,
      index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(index_relation.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY relation_row.relname::text COLLATE "C",
      index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
catalog_shared_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text,
      relation_row.relname::text,
      index_namespace.nspname::text,
      index_relation.relname::text,
      access_method.amname::text,
      index_row.indisunique,
      index_row.indisprimary,
      index_row.indisexclusion,
      index_row.indimmediate,
      index_row.indisclustered,
      index_row.indisvalid,
      index_row.indisready,
      index_row.indislive,
      index_row.indisreplident,
      index_row.indnkeyatts,
      index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(index_relation.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND relation_row.relname = 'recent_events'
    AND index_namespace.nspname = 'public'
    AND index_relation.relname = 'recent_events_household_chore_entity_idx'
),
catalog_sequence_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      sequence_namespace.nspname::text,
      sequence_relation.relname::text,
      pg_catalog.format_type(sequence_row.seqtypid, NULL),
      sequence_row.seqstart,
      sequence_row.seqincrement,
      sequence_row.seqmax,
      sequence_row.seqmin,
      sequence_row.seqcache,
      sequence_row.seqcycle
    ) ORDER BY sequence_namespace.nspname::text COLLATE "C",
      sequence_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_sequence AS sequence_row
  JOIN pg_catalog.pg_class AS sequence_relation
    ON sequence_relation.oid = sequence_row.seqrelid
  JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = sequence_relation.relnamespace
  WHERE sequence_namespace.nspname = 'public'
    AND sequence_relation.relname = 'household_chore_rate_events_id_seq'
),
catalog_function_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      function_row.proname::text,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid),
      pg_catalog.pg_get_function_arguments(function_row.oid),
      pg_catalog.pg_get_function_result(function_row.oid),
      pg_catalog.pg_get_functiondef(function_row.oid)
    ) ORDER BY function_row.proname::text COLLATE "C",
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
        COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE function_namespace.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
catalog_trigger_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text,
      relation_row.relname::text,
      trigger_row.tgname::text,
      pg_catalog.pg_get_triggerdef(trigger_row.oid, false)
    ) ORDER BY relation_namespace.nspname::text COLLATE "C",
      relation_row.relname::text COLLATE "C",
      trigger_row.tgname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND (
      (relation_namespace.nspname = 'public'
        AND pg_catalog.left(relation_row.relname::text, 16) =
          'household_chore_')
      OR (relation_namespace.nspname = 'auth'
        AND relation_row.relname = 'users'
        AND trigger_row.tgname = 'household_chore_auth_delete_guard')
    )
),
catalog_snapshot AS (
  SELECT
    pg_catalog.obj_description(
      'public.household_chore_circles'::pg_catalog.regclass, 'pg_class'
    ) AS stored_comment,
    pg_catalog.current_setting('server_version_num') AS server_version_num,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'contract_version', 1,
        'relations', catalog_relation_contract.value,
        'columns', catalog_column_contract.value,
        'constraints', catalog_constraint_contract.value,
        'indexes', catalog_index_contract.value,
        'shared_indexes', catalog_shared_index_contract.value,
        'sequences', catalog_sequence_contract.value,
        'functions', catalog_function_contract.value,
        'triggers', catalog_trigger_contract.value
      )::text,
      'UTF8'
    )), 'hex') AS current_digest
  FROM catalog_relation_contract
  CROSS JOIN catalog_column_contract
  CROSS JOIN catalog_constraint_contract
  CROSS JOIN catalog_index_contract
  CROSS JOIN catalog_shared_index_contract
  CROSS JOIN catalog_sequence_contract
  CROSS JOIN catalog_function_contract
  CROSS JOIN catalog_trigger_contract
),
catalog_snapshot_check AS (
  SELECT
    COALESCE(catalog_snapshot.stored_comment ~
      '^teskeid:sql142:catalog-v1:[0-9]{5,8}:[0-9a-f]{64}$', false)
    AND pg_catalog.split_part(catalog_snapshot.stored_comment, ':', 4) =
      catalog_snapshot.server_version_num
    AND pg_catalog.split_part(catalog_snapshot.stored_comment, ':', 5) =
      catalog_snapshot.current_digest
      AS catalog_unchanged_since_sql142_ok
  FROM catalog_snapshot
),
actual_columns AS (
  SELECT
    relation_row.relname::text AS relation_name,
    pg_catalog.count(*)::integer AS column_count,
    pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s:%s:%s:%s',
        attribute_row.attname,
        pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod),
        attribute_row.attnotnull::text,
        attribute_row.attidentity::text
      ),
      ',' ORDER BY attribute_row.attnum
    )) AS column_contract_md5
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = relation_row.oid
  WHERE namespace_row.nspname = 'public'
    AND relation_row.relkind = 'r'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
  GROUP BY relation_row.relname
),
actual_constraints AS (
  SELECT
    relation_row.relname::text AS relation_name,
    pg_catalog.count(*)::integer AS constraint_count,
    pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s:%s:%s:%s',
        constraint_row.conname,
        constraint_row.contype,
        constraint_row.condeferrable::text,
        constraint_row.condeferred::text
      ),
      ',' ORDER BY constraint_row.conname
    )) AS constraint_contract_md5
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
      index_relation.relname::text,
      ',' ORDER BY index_relation.relname
    )) AS index_name_contract_md5,
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
relation_checks AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM expected_relations) = 17
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS relation_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
        AND relation_row.relkind = 'r'
    ) = 17 AS relations_exact_ok,
    NOT EXISTS (
      SELECT 1
      FROM expected_relations AS expected
      LEFT JOIN actual_columns AS actual USING (relation_name)
      WHERE actual.relation_name IS NULL
        OR actual.column_count IS DISTINCT FROM expected.column_count
        OR actual.column_contract_md5 IS DISTINCT FROM expected.column_contract_md5
    ) AS columns_manifest_ok,
    NOT EXISTS (
      SELECT 1
      FROM expected_relations AS expected
      LEFT JOIN actual_constraints AS actual USING (relation_name)
      WHERE actual.relation_name IS NULL
        OR actual.constraint_count IS DISTINCT FROM expected.constraint_count
        OR actual.constraint_contract_md5 IS DISTINCT FROM
          expected.constraint_contract_md5
    ) AS constraints_manifest_ok,
    NOT EXISTS (
      SELECT 1
      FROM expected_relations AS expected
      LEFT JOIN actual_indexes AS actual USING (relation_name)
      WHERE actual.relation_name IS NULL
        OR actual.index_count IS DISTINCT FROM expected.index_count
        OR actual.index_name_contract_md5 IS DISTINCT FROM
          expected.index_name_contract_md5
        OR actual.indexes_ready IS NOT TRUE
    ) AS indexes_manifest_ok
),
privacy_contract AS (
  SELECT
    NOT EXISTS (
      SELECT 1
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
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy_row
      JOIN pg_catalog.pg_class AS relation_row
        ON relation_row.oid = policy_row.polrelid
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS sequence_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = sequence_row.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = sequence_row.relowner
      WHERE namespace_row.nspname = 'public'
        AND sequence_row.relname = 'household_chore_rate_events_id_seq'
        AND sequence_row.relkind = 'S'
        AND owner_role.rolname = 'postgres'
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            sequence_row.relacl,
            pg_catalog.acldefault('s', sequence_row.relowner)
          )) AS acl_row
        ) = 3
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            sequence_row.relacl,
            pg_catalog.acldefault('s', sequence_row.relowner)
          )) AS acl_row
          WHERE acl_row.grantor <> sequence_row.relowner
            OR acl_row.grantee <> sequence_row.relowner
            OR acl_row.is_grantable
            OR acl_row.privilege_type NOT IN ('SELECT', 'UPDATE', 'USAGE')
        )
    )
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS object_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = object_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND pg_catalog.left(object_row.relname::text, 16) = 'household_chore_'
    ) = 98 AS private_relations_ok
),
function_contract AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM expected_functions) = 66
    AND (
      SELECT pg_catalog.count(*)
      FROM expected_functions AS expected
      WHERE expected.service_execute
    ) = 38
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS function_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = function_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
    ) = 66
    AND NOT EXISTS (
      SELECT 1
      FROM expected_functions AS expected
      LEFT JOIN LATERAL (
        SELECT
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
          AND pg_catalog.format(
            '%s(%s)',
            function_row.proname,
            pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          ) = expected.function_signature
      ) AS actual ON true
      WHERE actual.oid IS NULL
        OR actual.owner_name <> 'postgres'
        OR actual.prokind <> 'f'
        OR actual.prorettype IS DISTINCT FROM
          pg_catalog.to_regtype(expected.result_identity)
        OR actual.lanname IS DISTINCT FROM expected.language_name
        OR actual.provolatile::text IS DISTINCT FROM expected.volatility
        OR actual.proisstrict IS DISTINCT FROM expected.is_strict
        OR actual.proretset
        OR actual.proleakproof
        OR actual.proparallel <> 'u'
        OR NOT actual.prosecdef
        OR pg_catalog.cardinality(
          COALESCE(actual.proconfig, ARRAY[]::text[])
        ) <> 1
        OR actual.proconfig[1] NOT IN ('search_path=', 'search_path=""')
        OR pg_catalog.md5(pg_catalog.replace(
          actual.prosrc, E'\r\n', E'\n'
        )) IS DISTINCT FROM expected.body_md5
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            actual.proacl,
            pg_catalog.acldefault('f', actual.proowner)
          )) AS acl_row
          WHERE acl_row.privilege_type = 'EXECUTE'
            AND acl_row.grantor = actual.proowner
            AND acl_row.grantee = actual.proowner
            AND NOT acl_row.is_grantable
        )
        OR COALESCE((
          SELECT pg_catalog.bool_or(
            acl_row.privilege_type = 'EXECUTE'
            AND grantee_role.rolname = 'service_role'
          )
          FROM pg_catalog.aclexplode(COALESCE(
            actual.proacl,
            pg_catalog.acldefault('f', actual.proowner)
          )) AS acl_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = acl_row.grantee
        ), false) IS DISTINCT FROM expected.service_execute
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            actual.proacl,
            pg_catalog.acldefault('f', actual.proowner)
          )) AS acl_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = acl_row.grantee
          WHERE acl_row.privilege_type = 'EXECUTE'
            AND NOT (
              acl_row.grantor = actual.proowner
              AND NOT acl_row.is_grantable
              AND (
                acl_row.grantee = actual.proowner
                OR (
                  expected.service_execute
                  AND grantee_role.rolname = 'service_role'
                )
              )
            )
        )
    ) AS functions_exact_ok
),
trigger_contract AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM expected_triggers) = 20
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation_row
        ON relation_row.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      WHERE NOT trigger_row.tgisinternal
        AND (
          (
            namespace_row.nspname = 'public'
            AND pg_catalog.left(relation_row.relname::text, 16) =
              'household_chore_'
          )
          OR (
            namespace_row.nspname = 'auth'
            AND relation_row.relname = 'users'
            AND trigger_row.tgname = 'household_chore_auth_delete_guard'
          )
        )
    ) = 20
    AND NOT EXISTS (
      SELECT 1
      FROM expected_triggers AS expected
      LEFT JOIN LATERAL (
        SELECT
          trigger_row.*,
          function_row.proname AS actual_function_name
        FROM pg_catalog.pg_trigger AS trigger_row
        JOIN pg_catalog.pg_class AS relation_row
          ON relation_row.oid = trigger_row.tgrelid
        JOIN pg_catalog.pg_namespace AS namespace_row
          ON namespace_row.oid = relation_row.relnamespace
        JOIN pg_catalog.pg_proc AS function_row
          ON function_row.oid = trigger_row.tgfoid
        JOIN pg_catalog.pg_namespace AS function_namespace
          ON function_namespace.oid = function_row.pronamespace
        WHERE namespace_row.nspname = expected.relation_schema
          AND relation_row.relname = expected.relation_name
          AND trigger_row.tgname = expected.trigger_name
          AND function_namespace.nspname = 'public'
      ) AS actual ON true
      WHERE actual.oid IS NULL
        OR actual.actual_function_name IS DISTINCT FROM expected.function_name
        OR actual.tgtype::integer IS DISTINCT FROM expected.trigger_type
        OR actual.tgdeferrable IS DISTINCT FROM expected.is_deferrable
        OR actual.tginitdeferred IS DISTINCT FROM expected.is_initially_deferred
        OR (actual.tgconstraint <> 0) IS DISTINCT FROM expected.is_deferrable
        OR actual.tgenabled <> 'O'
        OR actual.tgqual IS NOT NULL
        OR actual.tgnargs <> 0
        OR pg_catalog.cardinality(actual.tgattr::smallint[]) IS DISTINCT FROM
          expected.update_attribute_count
    ) AS triggers_exact_ok
),
dependency_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.normalize_email_canonical(text)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'text'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND NOT procedure_row.prosecdef
        AND procedure_row.provolatile = 'i'
        AND procedure_row.proisstrict
        AND procedure_row.proparallel = 's'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND language_row.lanname = 'sql'
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_email text'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = '3083103976aa8cb3780937b9da1be236'
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          WHERE privilege.privilege_type = 'EXECUTE'
        ) = 2
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR privilege.grantor <> procedure_row.proowner
             OR (
               privilege.grantee <> procedure_row.proowner
               AND grantee_role.rolname IS DISTINCT FROM 'service_role'
             )
        )
    ) AS email_normalizer_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'extensions.digest(bytea,text)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'bytea'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND NOT procedure_row.prosecdef
        AND procedure_row.provolatile = 'i'
        AND procedure_row.proisstrict
        AND procedure_row.proparallel = 's'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 0
        AND language_row.lanname = 'c'
        AND procedure_row.prosrc = 'pg_digest'
        AND procedure_row.probin = '$libdir/pgcrypto'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend AS dependency_row
          JOIN pg_catalog.pg_extension AS extension_row
            ON extension_row.oid = dependency_row.refobjid
          WHERE dependency_row.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency_row.objid = procedure_row.oid
            AND dependency_row.refclassid =
              'pg_catalog.pg_extension'::pg_catalog.regclass
            AND dependency_row.deptype = 'e'
            AND extension_row.extname = 'pgcrypto'
        )
    ) AS digest_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.expense_prepare_account_deletion(uuid)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'jsonb'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND procedure_row.prosecdef
        AND procedure_row.provolatile = 'v'
        AND NOT procedure_row.proisstrict
        AND procedure_row.proparallel = 'u'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND language_row.lanname = 'plpgsql'
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_user_id uuid'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = '0562edbfaa608cead23d23d49ec36a66'
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          WHERE privilege.privilege_type = 'EXECUTE'
        ) = 2
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR privilege.grantor <> procedure_row.proowner
             OR (
               privilege.grantee <> procedure_row.proowner
               AND grantee_role.rolname IS DISTINCT FROM 'service_role'
             )
        )
    ) AS account_deletion_ok
),
required_recent_columns(column_name, expected_type, expected_not_null) AS (
  VALUES
    ('id', 'bigint', true),
    ('user_id', 'uuid', true),
    ('source', 'text', true),
    ('event_type', 'text', true),
    ('entity_type', 'text', true),
    ('entity_id', 'uuid', false),
    ('event_key', 'text', true),
    ('payload', 'jsonb', true),
    ('href', 'text', true),
    ('occurred_at', 'timestamp with time zone', true),
    ('ack_at', 'timestamp with time zone', false),
    ('created_at', 'timestamp with time zone', true)
),
recent_column_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM required_recent_columns AS required_column
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.recent_events')
        AND attribute_row.attname = required_column.column_name
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
        AND pg_catalog.format_type(
          attribute_row.atttypid, attribute_row.atttypmod
        ) = required_column.expected_type
        AND attribute_row.attnotnull IS NOT DISTINCT FROM
          required_column.expected_not_null
    )
  ) AS ok
),
recent_default_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.recent_events')
        AND attribute_row.attname = 'id'
        AND attribute_row.attidentity = 'a'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute_row.attrelid
       AND default_row.adnum = attribute_row.attnum
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.recent_events')
        AND attribute_row.attname = 'created_at'
        AND attribute_row.atthasdef
        AND pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid, false
        ) = 'now()'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) AS ok
),
recent_conflict_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_attribute AS first_attribute
      ON first_attribute.attrelid = relation_row.oid
     AND first_attribute.attnum = index_row.indkey[0]
    JOIN pg_catalog.pg_attribute AS second_attribute
      ON second_attribute.attrelid = relation_row.oid
     AND second_attribute.attnum = index_row.indkey[1]
    WHERE namespace_row.nspname = 'public'
      AND relation_row.relname = 'recent_events'
      AND index_row.indisunique
      AND index_row.indimmediate
      AND NOT index_row.indisexclusion
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 2
      AND index_row.indnatts = 2
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND first_attribute.attname = 'user_id'
      AND second_attribute.attname = 'event_key'
  ) AS ok
),
recent_contract AS (
  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid,
    false
  ) AS expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.recent_events'::pg_catalog.regclass
    AND constraint_row.conname = 'recent_events_source_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated
),
recent_shape AS (
  SELECT
    pg_catalog.lower(pg_catalog.regexp_replace(
      COALESCE(recent_contract.expression, ''), '[[:space:]]+', '', 'g'
    )) AS normalized_expression,
    (
      SELECT pg_catalog.array_agg(match_row.value[1] ORDER BY match_row.value[1])
      FROM pg_catalog.regexp_matches(
        COALESCE(recent_contract.expression, ''),
        '''([^'']+)''',
        'g'
      ) AS match_row(value)
    ) AS sources
  FROM recent_contract
),
recent_check AS (
  SELECT
    COALESCE((
      SELECT
        recent_shape.sources IS NOT DISTINCT FROM
          ARRAY['events', 'expenses', 'heimilisverkin', 'loans']::text[]
        AND recent_shape.normalized_expression IN (
          'source=any(array[''loans''::text,''expenses''::text,''events''::text,''heimilisverkin''::text])',
          '(source=any(array[''loans''::text,''expenses''::text,''events''::text,''heimilisverkin''::text]))'
        )
      FROM recent_shape
    ), false)
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_row.indexrelid
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      WHERE index_namespace.nspname = 'public'
        AND index_relation.relname = 'recent_events_household_chore_entity_idx'
        AND index_row.indrelid = 'public.recent_events'::pg_catalog.regclass
        AND index_row.indisvalid
        AND index_row.indisready
        AND NOT index_row.indisunique
        AND index_row.indnkeyatts = 3
        AND index_row.indnatts = 3
        AND index_row.indexprs IS NULL
        AND index_row.indkey[0] = (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
            AND attribute_row.attname = 'entity_type'
            AND NOT attribute_row.attisdropped
        )
        AND index_row.indkey[1] = (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
            AND attribute_row.attname = 'entity_id'
            AND NOT attribute_row.attisdropped
        )
        AND index_row.indkey[2] = (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
            AND attribute_row.attname = 'user_id'
            AND NOT attribute_row.attisdropped
        )
        AND pg_catalog.replace(
          pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid),
          ' ', ''
        ) IN (
          '(source=''heimilisverkin''::text)',
          'source=''heimilisverkin''::text'
        )
    ) AS recent_source_exact_ok
),
initial_rows AS (
  SELECT pg_catalog.sum(row_count)::bigint AS total_rows
  FROM (
    SELECT pg_catalog.count(*)::bigint AS row_count FROM public.household_chore_circles
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_participants
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_invitations
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_memberships
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_membership_events
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_definitions
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_definition_events
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_participant_values
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_assignments
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_assignment_events
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_point_entries
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_mutation_requests
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_rate_events
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_deletion_markers
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_delete_authorizations
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_delete_tombstones
    UNION ALL SELECT pg_catalog.count(*) FROM public.household_chore_type_authorizations
  ) AS counts
),
rollout_contract AS (
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.feature_access AS access_row
      WHERE access_row.feature_key = 'heimilisverkin'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.feature_access'::pg_catalog.regclass
        AND constraint_row.conname = 'feature_access_feature_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND constraint_row.conkey = ARRAY[(
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = 'feature_key'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )]::smallint[]
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ))) = '97736909cf1a3a5432eeb34275cf3cfc'
        AND (
          SELECT pg_catalog.array_agg(
            match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
          )
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid, false
          ), '''([^'']+)''', 'g') AS match_row(value)
        ) = ARRAY[
          'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
          'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
          'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
          'tengsl', 'teskeid-routing-v1', 'umonnun',
          'utlagt-og-endurgreitt', 'vedrid',
          'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
          'weather-pulse'
        ]::text[]
    ) AS rollout_state_unchanged_ok
),
checks AS (
  SELECT
    (
      current_user = 'postgres'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_row
        WHERE role_row.rolname = current_user
          AND role_row.rolsuper
      )
    ) AS executor_ok,
    relation_checks.relations_exact_ok,
    relation_checks.columns_manifest_ok,
    relation_checks.constraints_manifest_ok,
    relation_checks.indexes_manifest_ok,
    catalog_snapshot_check.catalog_unchanged_since_sql142_ok,
    privacy_contract.private_relations_ok,
    function_contract.functions_exact_ok,
    dependency_contract.email_normalizer_ok
      AND dependency_contract.digest_ok
      AND dependency_contract.account_deletion_ok AS dependencies_exact_ok,
    trigger_contract.triggers_exact_ok,
    COALESCE(recent_column_contract.ok, false) AS recent_columns_contract_ok,
    COALESCE(recent_default_contract.ok, false) AS recent_defaults_contract_ok,
    COALESCE(recent_conflict_contract.ok, false)
      AS recent_conflict_key_contract_ok,
    recent_check.recent_source_exact_ok,
    rollout_contract.rollout_state_unchanged_ok,
    initial_rows.total_rows,
    initial_rows.total_rows = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.recent_events AS recent_row
      WHERE recent_row.source = 'heimilisverkin'
    ) AS initial_state_empty_ok
  FROM relation_checks
  CROSS JOIN catalog_snapshot_check
  CROSS JOIN privacy_contract
  CROSS JOIN function_contract
  CROSS JOIN dependency_contract
  CROSS JOIN trigger_contract
  CROSS JOIN recent_column_contract
  CROSS JOIN recent_default_contract
  CROSS JOIN recent_conflict_contract
  CROSS JOIN recent_check
  CROSS JOIN initial_rows
  CROSS JOIN rollout_contract
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  checks.executor_ok,
  checks.relations_exact_ok,
  checks.columns_manifest_ok,
  checks.constraints_manifest_ok,
  checks.indexes_manifest_ok,
  checks.catalog_unchanged_since_sql142_ok,
  checks.private_relations_ok,
  checks.functions_exact_ok,
  checks.dependencies_exact_ok,
  checks.triggers_exact_ok,
  checks.recent_columns_contract_ok,
  checks.recent_defaults_contract_ok,
  checks.recent_conflict_key_contract_ok,
  checks.recent_source_exact_ok,
  checks.rollout_state_unchanged_ok,
  checks.total_rows AS foundation_rows,
  checks.initial_state_empty_ok,
  (
    checks.executor_ok
    AND checks.relations_exact_ok
    AND checks.columns_manifest_ok
    AND checks.constraints_manifest_ok
    AND checks.indexes_manifest_ok
    AND checks.catalog_unchanged_since_sql142_ok
    AND checks.private_relations_ok
    AND checks.functions_exact_ok
    AND checks.dependencies_exact_ok
    AND checks.triggers_exact_ok
    AND checks.recent_columns_contract_ok
    AND checks.recent_defaults_contract_ok
    AND checks.recent_conflict_key_contract_ok
    AND checks.recent_source_exact_ok
    AND checks.rollout_state_unchanged_ok
    AND checks.initial_state_empty_ok
  ) AS postconditions_ok
FROM checks;

ROLLBACK;
