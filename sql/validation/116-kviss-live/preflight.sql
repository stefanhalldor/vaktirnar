-- SQL116 Kviss live preflight — READ ONLY.
-- Run manually on the explicitly selected production project and share the
-- complete single result row with Codex. This file changes nothing.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), missing_roles AS (
  SELECT required.role_name
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present ON present.rolname = required.role_name
  WHERE present.oid IS NULL
), execution_role AS (
  SELECT role.oid, role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), service_role_state AS (
  SELECT role.oid,
    pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_schema_usage
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'service_role'
), prerequisites AS (
  SELECT
    pg_catalog.to_regclass('auth.users') AS auth_users,
    pg_catalog.to_regclass('public.kviss_templates') AS templates,
    pg_catalog.to_regclass('public.kviss_template_questions') AS template_questions,
    pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)') AS assert_author,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function,
    pg_catalog.to_regprocedure('extensions.crypt(text,text)') AS crypt_function,
    pg_catalog.to_regprocedure('extensions.gen_salt(text,integer)') AS salt_function,
    pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') AS random_bytes_function
), authoring_tables AS (
  SELECT relation.oid, relation.relname, relation.relrowsecurity,
    relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN ('kviss_templates', 'kviss_template_questions')
), assert_author_state AS (
  SELECT procedure.oid, procedure.proowner, procedure.prosecdef,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
      ) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
      WHERE COALESCE(role.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated')
        AND privilege.privilege_type = 'EXECUTE'
    ) AS no_browser_execute
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)')
), target_relation_names(name) AS (
  VALUES
    ('kviss_sessions'),
    ('kviss_sessions_pkey'),
    ('kviss_sessions_join_code_key'),
    ('kviss_sessions_broadcast_topic_key'),
    ('kviss_sessions_space_id_id_key'),
    ('kviss_session_questions'),
    ('kviss_session_questions_pkey'),
    ('kviss_session_questions_session_id_sort_order_key'),
    ('kviss_session_questions_session_id_id_key'),
    ('kviss_participants'),
    ('kviss_participants_pkey'),
    ('kviss_participants_capability_digest_key'),
    ('kviss_participants_session_id_id_key'),
    ('kviss_answers'),
    ('kviss_answers_pkey'),
    ('kviss_answers_participant_id_activation_id_key'),
    ('kviss_answers_participant_id_command_id_key'),
    ('kviss_session_messages'),
    ('kviss_session_messages_pkey'),
    ('kviss_session_messages_participant_id_client_message_id_key'),
    ('kviss_session_commands'),
    ('kviss_session_commands_pkey'),
    ('kviss_join_attempts'),
    ('kviss_join_attempts_pkey'),
    ('kviss_join_attempts_id_seq'),
    ('kviss_sessions_space_created_idx'),
    ('kviss_session_questions_order_idx'),
    ('kviss_participants_session_joined_idx'),
    ('kviss_answers_session_question_idx'),
    ('kviss_messages_session_created_idx'),
    ('kviss_join_attempts_scope_time_idx'),
    ('kviss_join_attempts_time_idx')
), relation_collisions AS (
  SELECT target.name
  FROM target_relation_names AS target
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
), target_function_names(name) AS (
  VALUES
    ('kviss_create_session'),
    ('kviss_join_session'),
    ('kviss_host_command'),
    ('kviss_answer_question'),
    ('kviss_send_message'),
    ('kviss_touch_participant')
), function_collisions AS (
  SELECT procedure.proname || '(' ||
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')' AS signature
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (SELECT target.name FROM target_function_names AS target)
), authoring_contract AS (
  SELECT
    (SELECT pg_catalog.count(*) = 2 FROM authoring_tables) AS tables_present,
    NOT EXISTS (
      SELECT 1 FROM authoring_tables
      WHERE NOT relrowsecurity OR NOT relforcerowsecurity
    ) AS force_rls,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid IN (SELECT present.oid FROM authoring_tables AS present)
    ) AS no_policies,
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants AS privilege
      WHERE privilege.table_schema = 'public'
        AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
        AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.column_privileges AS privilege
      WHERE privilege.table_schema = 'public'
        AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
        AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AS no_browser_grants,
    (SELECT pg_catalog.count(*) = 2
        AND pg_catalog.count(*) FILTER (WHERE privilege_type = 'SELECT') = 2
        AND pg_catalog.count(*) FILTER (WHERE privilege_type <> 'SELECT') = 0
      FROM information_schema.role_table_grants AS privilege
      WHERE privilege.table_schema = 'public'
        AND privilege.table_name IN ('kviss_templates', 'kviss_template_questions')
        AND privilege.grantee = 'service_role') AS service_select_only,
    (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(prosecdef)
        AND pg_catalog.bool_and(fixed_empty_search_path)
        AND pg_catalog.bool_and(no_browser_execute)
        AND pg_catalog.bool_and(proowner = pg_catalog.to_regrole(current_user))
      FROM assert_author_state) AS assert_author_secure
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  prerequisites.auth_users,
  prerequisites.templates,
  prerequisites.template_questions,
  prerequisites.assert_author,
  prerequisites.uuid_function,
  prerequisites.crypt_function,
  prerequisites.salt_function,
  prerequisites.random_bytes_function,
  NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name) FROM missing_roles),
    '[]'::jsonb
  ) AS missing_required_roles,
  COALESCE(
    (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
    false
  ) AS execution_role_bypasses_rls,
  COALESCE(
    (SELECT state.public_schema_usage FROM service_role_state AS state),
    false
  ) AS service_role_public_schema_usage,
  (SELECT contract.tables_present AND contract.force_rls AND contract.no_policies
      AND contract.no_browser_grants
      AND contract.service_select_only AND contract.assert_author_secure
    FROM authoring_contract AS contract) AS sql115_contract_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(name ORDER BY name) FROM relation_collisions),
    '[]'::jsonb
  ) AS relation_collisions,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(signature ORDER BY signature) FROM function_collisions),
    '[]'::jsonb
  ) AS function_collisions,
  NOT EXISTS (SELECT 1 FROM relation_collisions)
    AND NOT EXISTS (SELECT 1 FROM function_collisions)
    AS target_objects_absent,
  prerequisites.auth_users IS NOT NULL
    AND prerequisites.templates IS NOT NULL
    AND prerequisites.template_questions IS NOT NULL
    AND prerequisites.assert_author IS NOT NULL
    AND prerequisites.uuid_function IS NOT NULL
    AND prerequisites.crypt_function IS NOT NULL
    AND prerequisites.salt_function IS NOT NULL
    AND prerequisites.random_bytes_function IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM missing_roles)
    AND COALESCE(
      (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
      false
    )
    AND COALESCE(
      (SELECT state.public_schema_usage FROM service_role_state AS state),
      false
    )
    AND (SELECT contract.tables_present AND contract.force_rls AND contract.no_policies
      AND contract.no_browser_grants
      AND contract.service_select_only AND contract.assert_author_secure
      FROM authoring_contract AS contract)
    AND NOT EXISTS (SELECT 1 FROM relation_collisions)
    AND NOT EXISTS (SELECT 1 FROM function_collisions)
    AND NOT pg_catalog.pg_is_in_recovery()
    AS prerequisites_ok,
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes'
  ) AS transactions_older_than_five_minutes
FROM prerequisites;

ROLLBACK;
