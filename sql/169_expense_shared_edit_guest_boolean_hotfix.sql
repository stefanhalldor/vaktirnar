-- SQL169 MIGRATION: make shared TES-24 edit-publication guest booleans non-null.
-- Function-only hotfix. No Expense, draft, publication, payment or settlement data is changed.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(104169);

DO $preflight$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure(
    'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)'
  );
  v_source_hash text;
  v_metadata_exact boolean := false;
  v_acl_exact boolean := false;
  v_dependencies_exact boolean := false;
  v_state text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql169_executor_not_postgres';
  END IF;

  SELECT
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 5
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_request_id','p_draft_id',
        'p_expected_draft_version','p_expected_publication_version'
      ]::text[]
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
  INTO v_source_hash, v_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL
    SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), actual_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
    WHERE routine.oid = v_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, v_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(roles.anon_oid, v_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_oid, 'EXECUTE'
      ), false
  ) INTO v_acl_exact
  FROM roles;

  SELECT COALESCE(
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public')
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid
        AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
        AND language_row.lanname = 'plpgsql'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid AND dependency.deptype = 'e'
    ), false
  ) INTO v_dependencies_exact;

  v_state := CASE
    WHEN v_metadata_exact AND v_acl_exact AND v_dependencies_exact
      AND v_source_hash = '3314017996b86c4cda29ef1c3b36a1f2'
      THEN 'PREDECESSOR_READY'
    WHEN v_metadata_exact AND v_acl_exact AND v_dependencies_exact
      AND v_source_hash = '23ffdadcbb51a19fa1e2432e0ee4b402'
      THEN 'EXACT_INSTALLED'
    ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
  END;

  IF v_state = 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT' THEN
    RAISE EXCEPTION 'expense_sql169_partial_or_predecessor_drift';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.expense_share_edit_revision_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.expense_private_drafts%ROWTYPE;
  v_binding public.expense_edit_revision_bindings%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_next_version bigint;
  v_publication_id uuid;
  v_result jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_title text;
  v_total_minor bigint;
  v_currency text;
  v_incurred_on date;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'draftId', p_draft_id, 'draftVersion', p_expected_draft_version,
    'publicationVersion', p_expected_publication_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_share_edit_revision_v1', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT draft.* INTO v_draft FROM public.expense_private_drafts AS draft
  WHERE draft.id = p_draft_id AND draft.actor_user_id = p_actor_id FOR UPDATE;
  SELECT binding.* INTO v_binding FROM public.expense_edit_revision_bindings AS binding
  WHERE binding.draft_id = p_draft_id AND binding.actor_user_id = p_actor_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_binding.draft_id IS NULL
     OR v_draft.context_type <> 'edit'
     OR v_draft.version <> p_expected_draft_version
     OR v_draft.expense_id IS DISTINCT FROM v_binding.expense_id THEN
    RAISE EXCEPTION 'expense_unconfirmed_draft_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, 'edit', v_binding.group_id, v_binding.expense_id
  );
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = v_binding.expense_id FOR UPDATE;
  IF pg_catalog.jsonb_typeof(v_draft.payload->'members') <> 'array'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'included') <> 'object'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'payerKeys') <> 'array'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'title') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'total') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'currency') <> 'string'
     OR pg_catalog.jsonb_typeof(v_draft.payload->'incurredOn') <> 'string' THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  v_title := pg_catalog.btrim(v_draft.payload->>'title');
  v_currency := v_draft.payload->>'currency';
  v_total_minor := public.expense_sql159_amount_minor(
    v_draft.payload->>'total', v_currency, false
  );
  v_incurred_on := (v_draft.payload->>'incurredOn')::date;
  IF pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 200
     OR v_currency NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')
     OR v_total_minor NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_unconfirmed_invalid_draft';
  END IF;
  SELECT publication.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication
  WHERE publication.draft_id = p_draft_id FOR UPDATE;
  IF v_publication.draft_id IS NULL THEN
    IF p_expected_publication_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := 1;
    v_publication_id := public.teskeid_event_uuid_from_text(
      'expense-sql168-edit-publication-v1:' || p_draft_id::text
    );
  ELSE
    IF p_expected_publication_version IS NULL
       OR v_publication.publication_version <> p_expected_publication_version
       OR v_publication.publication_version = 9007199254740991 THEN
      RAISE EXCEPTION 'expense_unconfirmed_publication_conflict';
    END IF;
    v_next_version := v_publication.publication_version + 1;
    v_publication_id := v_publication.publication_id;
  END IF;
  DELETE FROM public.expense_unconfirmed_publication_audience AS audience
  WHERE audience.draft_id = p_draft_id;
  DELETE FROM public.expense_unconfirmed_publication_parties AS party
  WHERE party.draft_id = p_draft_id;
  INSERT INTO public.expense_unconfirmed_publications (
    draft_id, publication_id, actor_user_id, publication_version, is_live,
    source_draft_version, shareable_fingerprint, authority_fingerprint,
    context_type, group_id, event_id, event_roster_revision, link_to_event,
    visibility, title, total_minor, currency, incurred_on, allocation_state,
    published_at, updated_at, withdrawn_at
  ) VALUES (
    p_draft_id, v_publication_id, p_actor_id, v_next_version, true,
    v_draft.version, pg_catalog.md5(v_draft.payload::text),
    pg_catalog.md5(v_binding.group_id::text || ':' || p_actor_id::text),
    'group', v_binding.group_id, NULL, NULL, false,
    'participants_only', v_title, v_total_minor,
    v_currency, v_incurred_on, 'incomplete',
    pg_catalog.now(), pg_catalog.now(), NULL
  ) ON CONFLICT (draft_id) DO UPDATE SET
    publication_version = EXCLUDED.publication_version,
    is_live = true,
    source_draft_version = EXCLUDED.source_draft_version,
    shareable_fingerprint = EXCLUDED.shareable_fingerprint,
    authority_fingerprint = EXCLUDED.authority_fingerprint,
    context_type = EXCLUDED.context_type,
    group_id = EXCLUDED.group_id,
    event_id = NULL,
    event_roster_revision = NULL,
    link_to_event = false,
    visibility = 'participants_only',
    title = EXCLUDED.title,
    total_minor = EXCLUDED.total_minor,
    currency = EXCLUDED.currency,
    incurred_on = EXCLUDED.incurred_on,
    allocation_state = 'incomplete',
    published_at = EXCLUDED.published_at,
    updated_at = EXCLUDED.updated_at,
    withdrawn_at = NULL;
  INSERT INTO public.expense_unconfirmed_publication_parties (
    draft_id, allocation_state, ordinal, party_key_hash,
    identity_token_hash, display_name, is_author, is_payer,
    is_participant, paid_minor, share_minor
  )
  SELECT p_draft_id, 'incomplete', row_number() OVER (ORDER BY member.id)::smallint,
         pg_catalog.md5(member.id::text), pg_catalog.md5(member.id::text),
         pg_catalog.btrim(member.display_name), COALESCE(member.user_id = p_actor_id, false),
         v_draft.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text),
         COALESCE((v_draft.payload->'included'->>member.id::text)::boolean, false)
           OR COALESCE(member.user_id = p_actor_id, false),
         NULL, NULL
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_binding.group_id
    AND member.status = 'active'
    AND pg_catalog.strpos(member.display_name, '@') = 0
    AND (
      member.user_id = p_actor_id
      OR v_draft.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text)
      OR COALESCE((v_draft.payload->'included'->>member.id::text)::boolean, false)
    );
  INSERT INTO public.expense_unconfirmed_publication_audience (
    draft_id, user_id, audience_kind, identity_token_hash,
    binding_id, binding_generation
  ) VALUES (p_draft_id, p_actor_id, 'author', NULL, NULL, NULL);
  INSERT INTO public.expense_unconfirmed_publication_audience (
    draft_id, user_id, audience_kind, identity_token_hash,
    binding_id, binding_generation
  )
  SELECT p_draft_id, member.user_id, 'group', pg_catalog.md5(member.id::text),
         member.id, NULL
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_binding.group_id
    AND member.status = 'active'
    AND member.user_id IS NOT NULL
    AND member.user_id <> p_actor_id
    AND EXISTS (
      SELECT 1 FROM public.expense_unconfirmed_publication_parties AS party
      WHERE party.draft_id = p_draft_id
        AND party.identity_token_hash = pg_catalog.md5(member.id::text)
    );
  UPDATE public.expense_edit_revision_bindings AS binding
  SET mode = 'shared', updated_at = pg_catalog.now()
  WHERE binding.draft_id = p_draft_id;
  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1, 'state', 'shared_draft',
    'draft_id', p_draft_id, 'draft_version', v_draft.version,
    'publication_id', v_publication_id,
    'publication_version', v_next_version,
    'allocation_state', 'incomplete',
    'shareable_fingerprint', pg_catalog.md5(v_draft.payload::text)
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  TO service_role;

DO $postcondition$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure(
    'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)'
  );
  v_source text;
  v_source_hash text;
  v_metadata_exact boolean := false;
  v_acl_exact boolean := false;
  v_dependencies_exact boolean := false;
BEGIN
  SELECT routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f' AND routine.pronargs = 5
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_request_id','p_draft_id',
        'p_expected_draft_version','p_expected_publication_version'
      ]::text[]
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
  INTO v_source, v_source_hash, v_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), actual_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl WHERE routine.oid = v_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_acl) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND pg_catalog.has_function_privilege(service_role_oid, v_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(anon_oid, v_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(authenticated_oid, v_oid, 'EXECUTE'),
    false
  ) INTO v_acl_exact FROM roles;

  SELECT COALESCE(
    EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public'))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_language AS language_row ON language_row.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid
        AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
        AND language_row.lanname = 'plpgsql')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_oid AND dependency.deptype = 'e'), false
  ) INTO v_dependencies_exact;

  IF NOT COALESCE(v_metadata_exact, false)
    OR NOT COALESCE(v_acl_exact, false)
    OR NOT COALESCE(v_dependencies_exact, false)
    OR v_source_hash <> '23ffdadcbb51a19fa1e2432e0ee4b402'
    OR (pg_catalog.length(v_source) - pg_catalog.length(pg_catalog.replace(
      v_source, 'COALESCE(member.user_id = p_actor_id, false)', ''
    ))) / pg_catalog.length('COALESCE(member.user_id = p_actor_id, false)') <> 2
  THEN
    RAISE EXCEPTION 'expense_sql169_postcondition_failed';
  END IF;
END;
$postcondition$;

COMMIT;
