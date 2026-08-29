BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

DO $diagnostic$
DECLARE
  v_expense_input constant text := '<REPLACE_WITH_EXACT_EXPENSE_UUID>';
  v_expense_id uuid;
  v_group_id uuid;
  v_actor_id uuid;
  v_actor_count bigint := 0;
  v_result jsonb;
  v_member jsonb;
  v_candidate jsonb;
  v_member_count integer := 0;
  v_candidate_count integer := 0;
  v_result_shape boolean := false;
  v_sqlstate text := 'unknown';
  v_classification text := 'STOP_RUNTIME_OTHER';
  v_evidence_token text;
BEGIN
  <<classify>>
  BEGIN
    IF v_expense_input !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      v_classification := 'STOP_EXPENSE_OR_ACTOR_CONTEXT';
      EXIT classify;
    END IF;
    v_expense_id := v_expense_input::uuid;

    SELECT expense.group_id
    INTO v_group_id
    FROM public.expenses AS expense
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    WHERE expense.id = v_expense_id
      AND expense.status = 'active'
      AND group_row.kind = 'one_off'
      AND group_row.status <> 'closed';

    IF v_group_id IS NULL THEN
      v_classification := 'STOP_EXPENSE_OR_ACTOR_CONTEXT';
      EXIT classify;
    END IF;

    SELECT
      pg_catalog.count(DISTINCT member.user_id),
      (pg_catalog.array_agg(DISTINCT member.user_id ORDER BY member.user_id))[1]
    INTO v_actor_count, v_actor_id
    FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id
      AND member.user_id IS NOT NULL
      AND member.status = 'active'
      AND member.role IN ('owner','admin')
      AND public.expense_active_member_role(member.user_id, v_group_id) IN ('owner','admin');

    IF v_actor_count <> 1 OR v_actor_id IS NULL THEN
      v_classification := 'STOP_EXPENSE_OR_ACTOR_CONTEXT';
      EXIT classify;
    END IF;

    SELECT public.expense_get_relationship_identity_management_v1(v_actor_id, v_expense_id)
    INTO v_result;

    IF v_result IS NULL
      OR pg_catalog.jsonb_typeof(v_result) <> 'object'
      OR NOT (v_result ?& ARRAY['expense_id','financial_version','members'])
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_object_keys(v_result) AS result_key(key)
        WHERE result_key.key <> ALL (ARRAY['expense_id','financial_version','members'])
      )
      OR pg_catalog.jsonb_typeof(v_result->'expense_id') <> 'string'
      OR v_result->>'expense_id' <> v_expense_id::text
      OR pg_catalog.jsonb_typeof(v_result->'financial_version') <> 'number'
      OR pg_catalog.jsonb_typeof(v_result->'members') <> 'array'
      OR pg_catalog.jsonb_array_length(v_result->'members') > 50
    THEN
      v_classification := 'STOP_RUNTIME_OTHER';
      EXIT classify;
    END IF;

    v_member_count := pg_catalog.jsonb_array_length(v_result->'members');
    FOR v_member IN
      SELECT member_item.value
      FROM pg_catalog.jsonb_array_elements(v_result->'members') AS member_item(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_member) <> 'object'
        OR NOT (v_member ?& ARRAY['member_id','candidates'])
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_object_keys(v_member) AS member_key(key)
          WHERE member_key.key <> ALL (ARRAY['member_id','candidates'])
        )
        OR pg_catalog.jsonb_typeof(v_member->'member_id') <> 'string'
        OR v_member->>'member_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        OR pg_catalog.jsonb_typeof(v_member->'candidates') <> 'array'
        OR pg_catalog.jsonb_array_length(v_member->'candidates') > 50
      THEN
        v_classification := 'STOP_RUNTIME_OTHER';
        EXIT classify;
      END IF;

      v_candidate_count := v_candidate_count
        + pg_catalog.jsonb_array_length(v_member->'candidates');
      FOR v_candidate IN
        SELECT candidate_item.value
        FROM pg_catalog.jsonb_array_elements(v_member->'candidates') AS candidate_item(value)
      LOOP
        IF pg_catalog.jsonb_typeof(v_candidate) <> 'object'
          OR NOT (v_candidate ?& ARRAY['relationship_id','display_name'])
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_object_keys(v_candidate) AS candidate_key(key)
            WHERE candidate_key.key <> ALL (ARRAY['relationship_id','display_name'])
          )
          OR pg_catalog.jsonb_typeof(v_candidate->'relationship_id') <> 'string'
          OR v_candidate->>'relationship_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          OR pg_catalog.jsonb_typeof(v_candidate->'display_name') <> 'string'
          OR pg_catalog.char_length(pg_catalog.btrim(v_candidate->>'display_name')) NOT BETWEEN 1 AND 120
          OR pg_catalog.strpos(v_candidate->>'display_name', '@') <> 0
        THEN
          v_classification := 'STOP_RUNTIME_OTHER';
          EXIT classify;
        END IF;
      END LOOP;
    END LOOP;

    v_result_shape := true;
    v_classification := 'OK_BOUNDED_RESULT';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    v_sqlstate := CASE
      WHEN v_sqlstate ~ '^[0-9A-Z]{5}$' THEN v_sqlstate
      ELSE 'unknown'
    END;
    v_classification := CASE
      WHEN v_sqlstate = '42883' THEN 'STOP_FUNCTION_RESOLUTION'
      WHEN v_sqlstate = '42501' THEN 'STOP_PRIVILEGE'
      WHEN v_sqlstate IN ('42P01','42703','42704','3F000') THEN 'STOP_UNDEFINED_DEPENDENCY'
      ELSE 'STOP_RUNTIME_OTHER'
    END;
  END classify;

  v_evidence_token := pg_catalog.md5(pg_catalog.concat_ws(
    '|',
    'sql163-runtime-read-v1',
    v_classification,
    v_sqlstate,
    v_result_shape::text,
    v_member_count::text,
    v_candidate_count::text,
    COALESCE(v_expense_id::text, ''::text)
  ));

  PERFORM pg_catalog.set_config(
    'teskeid.sql163_runtime_read_result',
    pg_catalog.jsonb_build_object(
      'classification', v_classification,
      'sqlstate', v_sqlstate,
      'result_shape', v_result_shape,
      'member_count', v_member_count,
      'candidate_count', v_candidate_count,
      'evidence_token', v_evidence_token
    )::text,
    true
  );
END;
$diagnostic$;

SELECT pg_catalog.current_setting(
  'teskeid.sql163_runtime_read_result',
  true
)::jsonb AS diagnostic;

ROLLBACK;
