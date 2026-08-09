-- SQL116 Kviss live postflight — READ ONLY.
-- Run only after a separately approved SQL116 apply and share the complete
-- single result row with Codex. Every *_ok value must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_live_tables(table_name, column_count) AS (
  VALUES
    ('kviss_sessions', 18),
    ('kviss_session_questions', 11),
    ('kviss_participants', 10),
    ('kviss_answers', 9),
    ('kviss_session_messages', 6),
    ('kviss_session_commands', 7),
    ('kviss_join_attempts', 5)
), expected_all_kviss_tables(table_name) AS (
  VALUES
    ('kviss_questions'),
    ('kviss_templates'),
    ('kviss_template_questions'),
    ('kviss_sessions'),
    ('kviss_session_questions'),
    ('kviss_participants'),
    ('kviss_answers'),
    ('kviss_session_messages'),
    ('kviss_session_commands'),
    ('kviss_join_attempts')
), table_state AS (
  SELECT relation.oid, relation.relname AS table_name,
    relation.relrowsecurity, relation.relforcerowsecurity, relation.relowner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      SELECT expected.table_name FROM expected_live_tables AS expected
    )
), expected_indexes(index_name) AS (
  VALUES
    ('kviss_sessions_pkey'),
    ('kviss_sessions_join_code_key'),
    ('kviss_sessions_broadcast_topic_key'),
    ('kviss_sessions_space_id_id_key'),
    ('kviss_session_questions_pkey'),
    ('kviss_session_questions_session_id_sort_order_key'),
    ('kviss_session_questions_session_id_id_key'),
    ('kviss_participants_pkey'),
    ('kviss_participants_capability_digest_key'),
    ('kviss_participants_session_id_id_key'),
    ('kviss_answers_pkey'),
    ('kviss_answers_participant_id_activation_id_key'),
    ('kviss_answers_participant_id_command_id_key'),
    ('kviss_session_messages_pkey'),
    ('kviss_session_messages_participant_id_client_message_id_key'),
    ('kviss_session_commands_pkey'),
    ('kviss_join_attempts_pkey'),
    ('kviss_sessions_space_created_idx'),
    ('kviss_session_questions_order_idx'),
    ('kviss_participants_session_joined_idx'),
    ('kviss_answers_session_question_idx'),
    ('kviss_messages_session_created_idx'),
    ('kviss_join_attempts_scope_time_idx'),
    ('kviss_join_attempts_time_idx')
), present_indexes AS (
  SELECT index_relation.relname AS index_name,
    index_state.indisvalid, index_state.indisready
  FROM pg_catalog.pg_index AS index_state
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_state.indexrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_relation.relname IN (
      SELECT expected.index_name FROM expected_indexes AS expected
    )
), expected_foreign_keys(table_name, constraint_name, delete_action) AS (
  VALUES
    ('kviss_sessions', 'kviss_sessions_created_by_fk', 'c'),
    ('kviss_sessions', 'kviss_sessions_template_fk', 'c'),
    ('kviss_sessions', 'kviss_sessions_active_question_fk', 'a'),
    ('kviss_session_questions', 'kviss_session_questions_session_fk', 'c'),
    ('kviss_participants', 'kviss_participants_session_fk', 'c'),
    ('kviss_answers', 'kviss_answers_participant_fk', 'c'),
    ('kviss_answers', 'kviss_answers_question_fk', 'c'),
    ('kviss_session_messages', 'kviss_messages_participant_fk', 'c'),
    ('kviss_session_commands', 'kviss_session_commands_session_fk', 'c'),
    ('kviss_session_commands', 'kviss_session_commands_actor_fk', 'n')
), present_foreign_keys AS (
  SELECT relation.relname AS table_name, constraint_row.conname AS constraint_name,
    constraint_row.confdeltype::text AS delete_action, constraint_row.convalidated,
    constraint_row.condeferrable, constraint_row.condeferred
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND constraint_row.contype = 'f'
    AND relation.relname IN (
      SELECT expected.table_name FROM expected_live_tables AS expected
    )
), expected_functions(signature) AS (
  VALUES
    ('public.kviss_create_session(uuid,uuid,uuid,text,text)'),
    ('public.kviss_join_session(text,text,text,text,text)'),
    ('public.kviss_host_command(uuid,uuid,bigint,uuid,text,uuid)'),
    ('public.kviss_answer_question(text,uuid,integer,uuid)'),
    ('public.kviss_send_message(text,uuid,text)'),
    ('public.kviss_touch_participant(text,uuid)')
), function_state AS (
  SELECT expected.signature, procedure.oid, procedure.proowner,
    procedure.prosecdef, procedure.prosrc,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature)
), function_acl AS (
  SELECT procedure.proname,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'kviss_create_session',
      'kviss_join_session',
      'kviss_host_command',
      'kviss_answer_question',
      'kviss_send_message',
      'kviss_touch_participant'
    )
), sequence_state AS (
  SELECT relation.oid, relation.relowner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'S'
    AND relation.relname = 'kviss_join_attempts_id_seq'
), sequence_acl AS (
  SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM sequence_state AS sequence
  JOIN pg_catalog.pg_class AS relation ON relation.oid = sequence.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('S', relation.relowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), topic_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.kviss_sessions')
    AND constraint_row.contype = 'c'
    AND pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      pg_catalog.quote_literal('^[A-Za-z0-9_-]{43}$')
    ) > 0
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 7 FROM table_state) AS tables_ok,
  NOT EXISTS (
    SELECT 1
    FROM expected_live_tables AS expected
    WHERE (SELECT pg_catalog.count(*)
      FROM information_schema.columns AS column_row
      WHERE column_row.table_schema = 'public'
        AND column_row.table_name = expected.table_name) <> expected.column_count
  ) AS exact_column_counts_ok,
  NOT EXISTS (
    SELECT expected.table_name FROM expected_all_kviss_tables AS expected
    EXCEPT
    SELECT relation.relname
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname LIKE 'kviss\_%' ESCAPE '\'
  ) AND NOT EXISTS (
    SELECT relation.relname
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname LIKE 'kviss\_%' ESCAPE '\'
    EXCEPT
    SELECT expected.table_name FROM expected_all_kviss_tables AS expected
  ) AS exact_kviss_table_set_ok,
  NOT EXISTS (
    SELECT expected.index_name FROM expected_indexes AS expected
    EXCEPT
    SELECT present.index_name FROM present_indexes AS present
    WHERE present.indisvalid AND present.indisready
  ) AND (SELECT pg_catalog.count(*) = 24 FROM present_indexes)
    AS required_indexes_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.constraint_name, expected.delete_action
    FROM expected_foreign_keys AS expected
    EXCEPT
    SELECT present.table_name, present.constraint_name, present.delete_action
    FROM present_foreign_keys AS present
    WHERE present.convalidated
  ) AND (SELECT pg_catalog.count(*) = 10 FROM present_foreign_keys)
    AS exact_foreign_key_lifecycle_ok,
  EXISTS (
    SELECT 1 FROM present_foreign_keys AS present
    WHERE present.table_name = 'kviss_sessions'
      AND present.constraint_name = 'kviss_sessions_active_question_fk'
      AND present.condeferrable AND present.condeferred
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'kviss_session_commands'
      AND column_row.column_name = 'actor_user_id'
      AND column_row.is_nullable = 'YES'
  ) AS account_deletion_lifecycle_ok,
  NOT EXISTS (
    SELECT 1 FROM table_state
    WHERE NOT relrowsecurity OR NOT relforcerowsecurity
  ) AS force_rls_ok,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (SELECT present.oid FROM table_state AS present)
  ) AS default_deny_no_policies_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (
        SELECT expected.table_name FROM expected_live_tables AS expected
      )
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (
        SELECT expected.table_name FROM expected_live_tables AS expected
      )
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS no_browser_table_or_column_grants_ok,
  (SELECT pg_catalog.count(*) = 7
      AND pg_catalog.count(*) FILTER (WHERE privilege_type = 'SELECT') = 7
      AND pg_catalog.count(*) FILTER (WHERE privilege_type <> 'SELECT') = 0
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (
        SELECT expected.table_name FROM expected_live_tables AS expected
      )
      AND privilege.grantee = 'service_role') AS service_role_select_only_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (
        SELECT expected.table_name FROM expected_live_tables AS expected
      )
      AND privilege.grantee = 'service_role'
      AND privilege.privilege_type <> 'SELECT'
  ) AS no_service_role_column_mutation_grants_ok,
  (SELECT pg_catalog.count(*) = 1 FROM sequence_state)
    AND NOT EXISTS (
      SELECT 1 FROM sequence_acl
      WHERE grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ) AS no_direct_sequence_grants_ok,
  (SELECT pg_catalog.count(*) = 6
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 6
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(fixed_empty_search_path)
    FROM function_state) AS function_security_ok,
  (SELECT pg_catalog.count(*) = 6
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'kviss_create_session',
        'kviss_join_session',
        'kviss_host_command',
        'kviss_answer_question',
        'kviss_send_message',
        'kviss_touch_participant'
      )) AS exact_function_overloads_ok,
  NOT EXISTS (
    SELECT 1 FROM function_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) AS no_browser_function_execute_ok,
  NOT EXISTS (
    SELECT 1 FROM function_state AS state
    WHERE state.oid IS NULL
      OR NOT pg_catalog.has_function_privilege('service_role', state.oid, 'EXECUTE')
  ) AND (SELECT pg_catalog.count(*) = 6
    FROM function_acl
    WHERE grantee = 'service_role' AND privilege_type = 'EXECUTE')
    AS exact_service_role_function_grants_ok,
  (SELECT pg_catalog.count(*) = 7
      AND pg_catalog.count(DISTINCT table_state.relowner) = 1
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
    FROM table_state
    JOIN pg_catalog.pg_roles AS role ON role.oid = table_state.relowner)
    AND (SELECT pg_catalog.count(*) = 6
        AND pg_catalog.count(DISTINCT function_state.proowner) = 1
        AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
      FROM function_state
      JOIN pg_catalog.pg_roles AS role ON role.oid = function_state.proowner
      WHERE function_state.oid IS NOT NULL)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
      FROM sequence_state
      JOIN pg_catalog.pg_roles AS role ON role.oid = sequence_state.relowner)
    AND NOT EXISTS (
      SELECT 1 FROM table_state
      CROSS JOIN function_state
      WHERE function_state.oid IS NOT NULL
        AND function_state.proowner <> table_state.relowner
    ) AND NOT EXISTS (
      SELECT 1 FROM table_state
      CROSS JOIN sequence_state
      WHERE sequence_state.relowner <> table_state.relowner
    ) AS object_owner_bypasses_rls_ok,
  EXISTS (SELECT 1 FROM topic_constraint)
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.kviss_create_session(%'
        AND prosrc LIKE '%p_broadcast_topic !~ ''^[A-Za-z0-9_-]{43}$''%'
        AND prosrc LIKE '%octet_length(p_password) > 72%'
        AND prosrc LIKE '%ON CONFLICT (join_code) DO NOTHING%'
    ) AS topic_and_join_code_contract_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_join_session(%'
      AND prosrc LIKE '%p_capability_digest IS NULL%'
      AND prosrc LIKE '%p_actor_scope_hash IS NULL%'
      AND prosrc LIKE '%octet_length(coalesce(p_password, '''')) > 72%'
      AND prosrc LIKE '%LIMIT 1000%'
  ) AND EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_host_command(%'
      AND prosrc LIKE '%p_expected_revision IS NULL%'
      AND prosrc LIKE '%p_command_type <> ''activate_question'' AND p_question_id IS NOT NULL%'
  ) AND EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_answer_question(%'
      AND prosrc LIKE '%p_selected_option IS NULL%'
      AND prosrc LIKE '%p_command_id IS NULL%'
  ) AND EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_send_message(%'
      AND prosrc LIKE '%p_client_message_id IS NULL%'
      AND prosrc LIKE '%NOT BETWEEN 1 AND 500%'
  ) AND EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_touch_participant(%'
      AND prosrc LIKE '%p_session_id IS NULL%'
      AND prosrc LIKE '%last_seen_at < now() - interval ''30 seconds''%'
  ) AS rpc_payload_guards_ok,
  (SELECT pg_catalog.count(*) FROM public.kviss_sessions) AS session_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_session_questions) AS session_question_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_participants) AS participant_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_answers) AS answer_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_session_messages) AS message_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_session_commands) AS command_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_join_attempts) AS join_attempt_rows,
  (SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

ROLLBACK;
