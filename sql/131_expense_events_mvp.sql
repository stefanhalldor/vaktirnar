-- TODO #095 / SQL131: owner-private expense event contexts.
-- Additive and forward-only. DO NOT RUN automatically. Stebbi applies this
-- migration manually only after the dedicated read-only preflight is green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';
SET LOCAL search_path = pg_catalog;

DO $expense_event_preconditions$
DECLARE
  v_collision text;
  v_feature_expression text;
  v_function oid;
  v_expected record;
  v_source text;
BEGIN
  IF current_user <> 'postgres'
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS role_row
       WHERE role_row.rolname = current_user
         AND role_row.rolsuper
     ) THEN
    RAISE EXCEPTION 'expense_event_migration_owner_invalid:%', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'postgres'
      AND (role_row.rolsuper OR role_row.rolbypassrls)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = 'service_role'
      AND pg_catalog.has_schema_privilege(role_row.oid, 'public', 'USAGE')
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname IN ('anon', 'authenticated')
  ) <> 2 THEN
    RAISE EXCEPTION 'expense_event_required_roles_missing';
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL
     OR pg_catalog.to_regclass('public.expense_payment_preferences') IS NULL
     OR pg_catalog.to_regclass('public.expense_member_invitations') IS NULL
     OR pg_catalog.to_regclass('public.expense_share_collaborators') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity_audience') IS NULL
     OR pg_catalog.to_regclass('public.recent_events') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_has_beta_access(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_begin_request(uuid,uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_terminalize_member_invitations(uuid[],text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_remove_group_member(uuid,uuid,uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_cancel_member_invitation(uuid,uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_prepare_account_deletion(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'expense_event_prerequisites_missing';
  END IF;

  SELECT target.name
  INTO v_collision
  FROM (VALUES
    ('expense_event_contexts'),
    ('expense_event_participants'),
    ('expense_event_contexts_owner_created_idx'),
    ('expense_event_participants_linked_user_idx')
  ) AS target(name)
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
  ORDER BY target.name
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'expense_event_relation_collision:%', v_collision;
  END IF;

  SELECT target.signature
  INTO v_collision
  FROM (VALUES
    ('public.expense_event_valid_label(text,integer,integer)'),
    ('public.expense_event_has_beta_access(uuid)'),
    ('public.expense_event_assert_actor(uuid)'),
    ('public.expense_event_assert_integrity(uuid)'),
    ('public.expense_event_integrity_trigger()'),
    ('public.expense_event_group_integrity_trigger()'),
    ('public.expense_event_context_immutable()'),
    ('public.expense_event_participant_immutable()'),
    ('public.expense_event_roster_frozen()'),
    ('public.expense_event_invitation_blocked()'),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)'),
    ('public.expense_list_event_contexts(uuid)'),
    ('public.expense_get_event_context(uuid,uuid)'),
    ('public.expense_is_event_context(uuid,uuid)')
  ) AS target(signature)
  WHERE pg_catalog.to_regprocedure(target.signature) IS NOT NULL
  ORDER BY target.signature
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'expense_event_function_collision:%', v_collision;
  END IF;

  SELECT procedure_row.proname
  INTO v_collision
  FROM pg_catalog.pg_proc AS procedure_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = procedure_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND procedure_row.proname IN (
      'expense_event_valid_label',
      'expense_event_has_beta_access',
      'expense_event_assert_actor',
      'expense_event_assert_integrity',
      'expense_event_integrity_trigger',
      'expense_event_group_integrity_trigger',
      'expense_event_context_immutable',
      'expense_event_participant_immutable',
      'expense_event_roster_frozen',
      'expense_event_invitation_blocked',
      'expense_create_event_context',
      'expense_list_event_contexts',
      'expense_get_event_context',
      'expense_is_event_context'
    )
  ORDER BY procedure_row.proname
  LIMIT 1;
  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'expense_event_function_name_collision:%', v_collision;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname IN (
      'expense_event_context_integrity_deferred',
      'expense_event_participant_integrity_deferred',
      'expense_event_group_integrity_deferred',
      'expense_event_context_immutable_guard',
      'expense_event_participant_immutable_guard',
      'expense_event_group_members_frozen_guard',
      'expense_event_member_invitations_guard'
    )
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'expense_event_trigger_collision';
  END IF;

  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid
  )
  INTO v_feature_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;

  IF v_feature_expression IS NULL
     OR pg_catalog.strpos(v_feature_expression, 'utlagt-og-endurgreitt') = 0
     OR pg_catalog.strpos(v_feature_expression, 'afmaeli-og-vidburdir') > 0 THEN
    RAISE EXCEPTION 'expense_event_feature_constraint_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'relationships'
      AND column_row.column_name = 'owner_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'relationships'
      AND column_row.column_name = 'counterpart_user_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'profiles'
      AND column_row.column_name = 'display_name'
  ) THEN
    RAISE EXCEPTION 'expense_event_identity_schema_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('auth', 'users', 'id'),
      ('auth', 'users', 'email'),
      ('public', 'feature_access', 'email'),
      ('public', 'feature_access', 'feature_key'),
      ('public', 'relationships', 'id'),
      ('public', 'relationships', 'owner_id'),
      ('public', 'relationships', 'counterpart_user_id'),
      ('public', 'profiles', 'id'),
      ('public', 'profiles', 'display_name'),
      ('public', 'expense_groups', 'id'),
      ('public', 'expense_groups', 'kind'),
      ('public', 'expense_groups', 'name'),
      ('public', 'expense_groups', 'description'),
      ('public', 'expense_groups', 'emoji'),
      ('public', 'expense_groups', 'default_currency'),
      ('public', 'expense_groups', 'default_include_creator'),
      ('public', 'expense_groups', 'created_by'),
      ('public', 'expense_group_members', 'id'),
      ('public', 'expense_group_members', 'group_id'),
      ('public', 'expense_group_members', 'user_id'),
      ('public', 'expense_group_members', 'display_name'),
      ('public', 'expense_group_members', 'role'),
      ('public', 'expense_group_members', 'status'),
      ('public', 'expense_member_invitations', 'id'),
      ('public', 'expense_member_invitations', 'group_id'),
      ('public', 'expense_member_invitations', 'invited_by'),
      ('public', 'expense_member_invitations', 'status'),
      ('public', 'expense_member_invitations', 'recipient_email_canonical'),
      ('public', 'expense_member_invitations', 'inviter_display_name_snapshot'),
      ('public', 'expense_member_invitations', 'guest_display_name_snapshot'),
      ('public', 'expense_share_collaborators', 'group_id'),
      ('public', 'expense_payment_preferences', 'owner_user_id'),
      ('public', 'expense_repayments', 'payment_preference_snapshot'),
      ('public', 'expense_repayments', 'reported_by'),
      ('public', 'recent_events', 'source'),
      ('public', 'recent_events', 'user_id'),
      ('public', 'recent_events', 'payload'),
      ('public', 'expense_activity_audience', 'user_id'),
      ('public', 'expense_mutation_requests', 'actor_user_id'),
      ('public', 'expense_activity', 'actor_user_id'),
      ('public', 'expense_activity', 'actor_display_name'),
      ('public', 'expenses', 'group_id'),
      ('public', 'expenses', 'status'),
      ('public', 'expenses', 'created_by')
    ) AS expected(table_schema, table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS column_row
      WHERE column_row.table_schema = expected.table_schema
        AND column_row.table_name = expected.table_name
        AND column_row.column_name = expected.column_name
    )
  ) THEN
    RAISE EXCEPTION 'expense_event_baseline_column_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
      'public.expense_group_members'
    )
      AND constraint_row.contype IN ('p', 'u')
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = constraint_row.conrelid
            AND attribute.attname = 'group_id'
            AND NOT attribute.attisdropped
        ),
        (
          SELECT attribute.attnum
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = constraint_row.conrelid
            AND attribute.attname = 'id'
            AND NOT attribute.attisdropped
        )
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'expense_event_member_composite_key_drift';
  END IF;

  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('expense_groups', true),
      ('expense_group_members', true),
      ('expenses', true),
      ('expense_repayments', true),
      ('expense_payment_preferences', true),
      ('expense_member_invitations', true),
      ('expense_share_collaborators', true),
      ('expense_activity', true),
      ('expense_activity_audience', false),
      ('expense_mutation_requests', false)
    ) AS expected(relation_name, service_select)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = pg_catalog.to_regclass(
        'public.' || v_expected.relation_name
      )
        AND relation.relrowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy AS policy
          WHERE policy.polrelid = relation.oid
        )
        AND pg_catalog.has_table_privilege(
          'service_role', relation.oid, 'SELECT'
        ) = v_expected.service_select
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRUNCATE')
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'REFERENCES')
        AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRIGGER')
        AND (
          v_expected.service_select
          OR NOT pg_catalog.has_any_column_privilege(
            'service_role', relation.oid, 'SELECT'
          )
        )
        AND NOT pg_catalog.has_any_column_privilege(
          'service_role', relation.oid, 'INSERT'
        )
        AND NOT pg_catalog.has_any_column_privilege(
          'service_role', relation.oid, 'UPDATE'
        )
        AND NOT pg_catalog.has_any_column_privilege(
          'service_role', relation.oid, 'REFERENCES'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (VALUES ('anon'::name), ('authenticated'::name)) AS browser(role_name)
          WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
             OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
             OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
             OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
        )
    ) THEN
      RAISE EXCEPTION 'expense_event_baseline_relation_drift:%',
        v_expected.relation_name;
    END IF;
  END LOOP;

  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('public.expense_has_beta_access(uuid)', false),
      ('public.expense_assert_beta_actor(uuid)', false),
      ('public.expense_active_member_role(uuid,uuid)', false),
      ('public.expense_begin_request(uuid,uuid,text,text)', false),
      ('public.expense_finish_request(uuid,uuid,jsonb)', false),
      ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)', true),
      ('public.expense_terminalize_member_invitations(uuid[],text)', false),
      ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)', false),
      ('public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)', true),
      ('public.expense_remove_group_member(uuid,uuid,uuid,uuid)', true),
      ('public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)', true),
      ('public.expense_cancel_member_invitation(uuid,uuid,uuid)', true),
      ('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)', true),
      ('public.expense_prepare_account_deletion(uuid)', true)
    ) AS expected(signature, service_execute)
  LOOP
    v_function := pg_catalog.to_regprocedure(v_expected.signature);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_function
        AND procedure_row.prosecdef
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(
            COALESCE(procedure_row.proconfig, ARRAY[]::text[])
          ) AS setting
          WHERE setting IN ('search_path=', 'search_path=""')
        )
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_expected.service_execute
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              procedure_row.proacl,
              pg_catalog.acldefault('f', procedure_row.proowner)
            )
          ) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type = 'EXECUTE'
            AND privilege.grantee <> procedure_row.proowner
            AND (
              NOT v_expected.service_execute
              OR grantee.rolname IS DISTINCT FROM 'service_role'
              OR privilege.is_grantable
            )
        )
    ) THEN
      RAISE EXCEPTION 'expense_event_app_function_contract_drift:%', v_function;
    END IF;
  END LOOP;

  v_function := pg_catalog.to_regprocedure(
    'public.expense_prepare_account_deletion(uuid)'
  );
  SELECT procedure_row.prosrc
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_function
    AND procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.jsonb')
    AND procedure_row.prolang = (
      SELECT language_row.oid
      FROM pg_catalog.pg_language AS language_row
      WHERE language_row.lanname = 'plpgsql'
    );

  IF v_source IS NULL
     OR pg_catalog.strpos(v_source, 'hashtextextended(p_user_id::text, 9601)') = 0
     OR pg_catalog.strpos(v_source, 'hashtextextended(v_email_canonical, 9702)') = 0
     OR pg_catalog.strpos(v_source, 'public.expense_terminalize_member_invitations') = 0
     OR pg_catalog.strpos(v_source, 'hashtextextended(p_user_id::text, 9602)') = 0
     OR pg_catalog.strpos(v_source, 'DELETE FROM public.expense_payment_preferences') = 0
     OR pg_catalog.strpos(v_source, 'DELETE FROM public.recent_events') = 0
     OR pg_catalog.strpos(v_source, 'DELETE FROM public.expense_activity_audience') = 0
     OR pg_catalog.strpos(v_source, 'UPDATE public.expense_group_members') = 0
     OR pg_catalog.strpos(v_source, '''invitations_scrubbed''') = 0 THEN
    RAISE EXCEPTION 'expense_event_account_deletion_body_drift';
  END IF;

  v_function := pg_catalog.to_regprocedure(
    'public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)'
  );
  SELECT procedure_row.prosrc
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_function;
  IF v_source IS NULL
     OR pg_catalog.strpos(v_source, '''expense_create_group''') = 0
     OR pg_catalog.strpos(v_source, 'public.expense_begin_request') = 0
     OR pg_catalog.strpos(v_source, 'public.expense_finish_request') = 0
     OR pg_catalog.strpos(v_source, 'public.expense_group_members') = 0
     OR pg_catalog.strpos(v_source, 'user_id IS NULL') = 0 THEN
    RAISE EXCEPTION 'expense_event_group_creator_body_drift';
  END IF;
END;
$expense_event_preconditions$;

DO $expense_event_feature_key$
DECLARE
  v_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid
  )
  INTO v_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;

  IF v_expression IS NULL
     OR pg_catalog.strpos(v_expression, 'utlagt-og-endurgreitt') = 0
     OR pg_catalog.strpos(v_expression, 'afmaeli-og-vidburdir') > 0 THEN
    RAISE EXCEPTION 'expense_event_feature_constraint_changed_during_apply';
  END IF;

  ALTER TABLE public.feature_access
    DROP CONSTRAINT feature_access_feature_key_check;
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
    v_expression,
    'afmaeli-og-vidburdir'
  );
END;
$expense_event_feature_key$;

CREATE TABLE public.expense_event_contexts (
  group_id      uuid        PRIMARY KEY,
  owner_user_id uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT expense_event_contexts_group_fk
    FOREIGN KEY (group_id)
    REFERENCES public.expense_groups(id)
    ON DELETE RESTRICT,
  CONSTRAINT expense_event_contexts_owner_fk
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT
);

CREATE TABLE public.expense_event_participants (
  group_id       uuid        NOT NULL,
  member_id      uuid        NOT NULL,
  linked_user_id uuid        NULL,
  position       smallint    NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT expense_event_participants_pkey
    PRIMARY KEY (group_id, member_id),
  CONSTRAINT expense_event_participants_position_check
    CHECK (position BETWEEN 0 AND 48),
  CONSTRAINT expense_event_participants_position_key
    UNIQUE (group_id, position)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT expense_event_participants_linked_user_key
    UNIQUE (group_id, linked_user_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT expense_event_participants_context_fk
    FOREIGN KEY (group_id)
    REFERENCES public.expense_event_contexts(group_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT expense_event_participants_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT expense_event_participants_linked_user_fk
    FOREIGN KEY (linked_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX expense_event_contexts_owner_created_idx
  ON public.expense_event_contexts (
    owner_user_id, created_at DESC, group_id DESC
  );
CREATE INDEX expense_event_participants_linked_user_idx
  ON public.expense_event_participants (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

ALTER TABLE public.expense_event_contexts OWNER TO postgres;
ALTER TABLE public.expense_event_participants OWNER TO postgres;

ALTER TABLE public.expense_event_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_event_contexts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_event_participants FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.expense_event_contexts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.expense_event_participants
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (group_id, owner_user_id, created_at)
  ON TABLE public.expense_event_contexts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL (group_id, member_id, linked_user_id, position, created_at)
  ON TABLE public.expense_event_participants
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.expense_event_valid_label(
  p_value text,
  p_minimum integer,
  p_maximum integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_value IS NOT NULL
    AND p_minimum >= 1
    AND p_maximum >= p_minimum
    AND pg_catalog.char_length(pg_catalog.btrim(p_value))
      BETWEEN p_minimum AND p_maximum
    AND pg_catalog.btrim(p_value) !~ '[[:cntrl:]]'
    AND pg_catalog.btrim(p_value)
      !~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]',
    false
  );
$function$;

CREATE FUNCTION public.expense_event_has_beta_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    public.expense_has_beta_access(p_user_id)
    AND EXISTS (
      SELECT 1
      FROM auth.users AS account
      JOIN public.feature_access AS access_row
        ON public.normalize_email_canonical(access_row.email)
         = public.normalize_email_canonical(account.email)
       AND access_row.feature_key = 'afmaeli-og-vidburdir'
      WHERE account.id = p_user_id
    ),
    false
  );
$function$;

CREATE FUNCTION public.expense_event_assert_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL
     OR NOT public.expense_event_has_beta_access(p_actor_id) THEN
    RAISE EXCEPTION 'expense_event_unavailable';
  END IF;
END;
$function$;

CREATE FUNCTION public.expense_event_assert_integrity(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context public.expense_event_contexts%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_member_count integer;
  v_participant_count integer;
BEGIN
  SELECT context_row.*
  INTO v_context
  FROM public.expense_event_contexts AS context_row
  WHERE context_row.group_id = p_group_id;

  -- Context deletion intentionally cascades only its owner-private mappings.
  IF v_context.group_id IS NULL THEN
    RETURN;
  END IF;

  SELECT group_row.*
  INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id;

  IF v_group.id IS NULL
     OR v_group.kind <> 'group'
     OR v_group.description IS NOT NULL
     OR v_group.emoji IS NOT NULL
     OR v_group.default_currency <> 'ISK'
     OR NOT v_group.default_include_creator
     OR v_group.created_by IS DISTINCT FROM v_context.owner_user_id
     OR NOT public.expense_event_valid_label(v_group.name, 1, 160) THEN
    RAISE EXCEPTION 'expense_event_integrity_invalid';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_member_count
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id;

  SELECT pg_catalog.count(*)::integer
  INTO v_participant_count
  FROM public.expense_event_participants AS participant
  WHERE participant.group_id = p_group_id;

  IF v_member_count NOT BETWEEN 1 AND 50
     OR v_participant_count <> v_member_count - 1
     OR (
       SELECT pg_catalog.count(*)
       FROM public.expense_group_members AS owner_member
       WHERE owner_member.group_id = p_group_id
         AND owner_member.user_id = v_context.owner_user_id
         AND owner_member.role = 'owner'
         AND owner_member.status = 'active'
     ) <> 1
     OR EXISTS (
       SELECT 1
       FROM public.expense_group_members AS member
       WHERE member.group_id = p_group_id
       AND NOT (
           member.user_id IS NOT DISTINCT FROM v_context.owner_user_id
           AND member.role = 'owner'
           AND member.status = 'active'
         )
         AND (
           member.user_id IS NOT NULL
           OR member.role <> 'member'
           OR member.status <> 'active'
           OR NOT public.expense_event_valid_label(member.display_name, 1, 120)
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_event_participants AS participant
       JOIN public.expense_group_members AS member
         ON member.group_id = participant.group_id
        AND member.id = participant.member_id
       WHERE participant.group_id = p_group_id
         AND (
           member.user_id IS NOT NULL
           OR member.role <> 'member'
           OR member.status <> 'active'
           OR participant.linked_user_id = v_context.owner_user_id
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_group_members AS member
       WHERE member.group_id = p_group_id
         AND member.role <> 'owner'
         AND NOT EXISTS (
           SELECT 1
           FROM public.expense_event_participants AS participant
           WHERE participant.group_id = member.group_id
             AND participant.member_id = member.id
         )
     )
     OR (
       v_participant_count > 0
       AND (
         SELECT pg_catalog.min(participant.position)
              = 0
            AND pg_catalog.max(participant.position)
              = v_participant_count - 1
         FROM public.expense_event_participants AS participant
         WHERE participant.group_id = p_group_id
       ) IS NOT TRUE
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_event_participants AS participant
       JOIN public.expense_group_members AS financial_member
         ON financial_member.group_id = participant.group_id
        AND financial_member.user_id = participant.linked_user_id
        AND financial_member.status IN ('active', 'invited')
       WHERE participant.group_id = p_group_id
         AND participant.linked_user_id IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_member_invitations AS invitation
       WHERE invitation.group_id = p_group_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.expense_share_collaborators AS collaboration
       WHERE collaboration.group_id = p_group_id
     ) THEN
    RAISE EXCEPTION 'expense_event_integrity_invalid';
  END IF;
END;
$function$;

CREATE FUNCTION public.expense_event_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.expense_event_assert_integrity(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.expense_event_group_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.expense_event_assert_integrity(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.expense_event_context_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'expense_event_context_immutable';
END;
$function$;

CREATE FUNCTION public.expense_event_participant_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Auth account deletion may only erase the optional private identity link.
  IF OLD.group_id = NEW.group_id
     AND OLD.member_id = NEW.member_id
     AND OLD.position = NEW.position
     AND OLD.created_at = NEW.created_at
     AND OLD.linked_user_id IS NOT NULL
     AND NEW.linked_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'expense_event_participant_immutable';
END;
$function$;

CREATE FUNCTION public.expense_event_roster_frozen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_group_id uuid;
  v_new_group_id uuid;
BEGIN
  v_old_group_id := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.group_id END;
  v_new_group_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.group_id END;

  IF EXISTS (
    SELECT 1
    FROM public.expense_event_contexts AS context_row
    WHERE context_row.group_id = v_old_group_id
       OR context_row.group_id = v_new_group_id
  ) THEN
    RAISE EXCEPTION 'expense_event_roster_frozen';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.expense_event_invitation_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.expense_event_contexts AS context_row
    WHERE context_row.group_id = NEW.group_id
       OR context_row.group_id = CASE
         WHEN TG_OP = 'UPDATE' THEN OLD.group_id
         ELSE NULL
       END
  ) THEN
    RAISE EXCEPTION 'expense_event_invitation_blocked';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER expense_event_context_immutable_guard
BEFORE UPDATE ON public.expense_event_contexts
FOR EACH ROW EXECUTE FUNCTION public.expense_event_context_immutable();

CREATE TRIGGER expense_event_participant_immutable_guard
BEFORE UPDATE ON public.expense_event_participants
FOR EACH ROW EXECUTE FUNCTION public.expense_event_participant_immutable();

CREATE TRIGGER expense_event_group_members_frozen_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.expense_group_members
FOR EACH ROW EXECUTE FUNCTION public.expense_event_roster_frozen();

CREATE TRIGGER expense_event_member_invitations_guard
BEFORE INSERT OR UPDATE ON public.expense_member_invitations
FOR EACH ROW EXECUTE FUNCTION public.expense_event_invitation_blocked();

CREATE CONSTRAINT TRIGGER expense_event_context_integrity_deferred
AFTER INSERT OR UPDATE OR DELETE ON public.expense_event_contexts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.expense_event_integrity_trigger();

CREATE CONSTRAINT TRIGGER expense_event_participant_integrity_deferred
AFTER INSERT OR UPDATE OR DELETE ON public.expense_event_participants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.expense_event_integrity_trigger();

CREATE CONSTRAINT TRIGGER expense_event_group_integrity_deferred
AFTER UPDATE OR DELETE ON public.expense_groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.expense_event_group_integrity_trigger();

CREATE FUNCTION public.expense_create_event_context(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
  v_canonical_participants jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_owner_member_id uuid := pg_catalog.gen_random_uuid();
  v_owner_display_name text;
  v_member_id uuid;
  v_relationship_id uuid;
  v_linked_user_id uuid;
  v_display_name text;
  v_member_payload jsonb;
  v_participant_rows jsonb := '[]'::jsonb;
  v_item jsonb;
  v_position integer := 0;
  v_inner_request_id uuid := pg_catalog.gen_random_uuid();
  v_group_result jsonb;
  v_group_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.expense_event_assert_actor(p_actor_id);

  IF p_request_id IS NULL
     OR NOT public.expense_event_valid_label(p_name, 1, 160)
     OR p_participants IS NULL
     OR pg_catalog.jsonb_typeof(p_participants) <> 'array' THEN
    RAISE EXCEPTION 'expense_event_invalid_input';
  END IF;

  IF pg_catalog.jsonb_array_length(p_participants) > 49
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_participants) AS participant(value)
       WHERE pg_catalog.jsonb_typeof(participant.value) <> 'object'
          OR NOT (participant.value ? 'type')
          OR (
            participant.value->>'type' = 'guest'
            AND (
              NOT (participant.value ? 'display_name')
              OR (participant.value - ARRAY['type', 'display_name']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(participant.value->'display_name')
                <> 'string'
              OR NOT public.expense_event_valid_label(
                participant.value->>'display_name', 1, 120
              )
              OR pg_catalog.strpos(
                participant.value->>'display_name', '@'
              ) > 0
            )
          )
          OR (
            participant.value->>'type' = 'relationship'
            AND (
              NOT (participant.value ? 'relationship_id')
              OR (participant.value - ARRAY['type', 'relationship_id']::text[])
                <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(participant.value->'relationship_id')
                <> 'string'
              OR (participant.value->>'relationship_id')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
          OR participant.value->>'type' NOT IN ('guest', 'relationship')
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_participants) AS participant(value)
       WHERE participant.value->>'type' = 'relationship'
       GROUP BY (participant.value->>'relationship_id')::uuid
       HAVING pg_catalog.count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_event_invalid_input';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      CASE participant.value->>'type'
        WHEN 'guest' THEN pg_catalog.jsonb_build_object(
          'type', 'guest',
          'displayName', pg_catalog.btrim(participant.value->>'display_name')
        )
        ELSE pg_catalog.jsonb_build_object(
          'type', 'relationship',
          'relationshipId', (participant.value->>'relationship_id')::uuid
        )
      END
      ORDER BY participant.ordinal
    ),
    '[]'::jsonb
  )
  INTO v_canonical_participants
  FROM pg_catalog.jsonb_array_elements(p_participants)
    WITH ORDINALITY AS participant(value, ordinal);

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'name', v_name,
    'participants', v_canonical_participants
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id,
    p_request_id,
    'expense_create_event_context',
    v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;
  -- The expense receipt lock serializes account cleanup. Recheck the separate
  -- event entitlement after waiting for that lock.
  PERFORM public.expense_event_assert_actor(p_actor_id);

  SELECT CASE
    WHEN public.expense_event_valid_label(profile.display_name, 1, 120)
      THEN pg_catalog.btrim(profile.display_name)
    ELSE 'Teskeiðarnotandi'
  END
  INTO v_owner_display_name
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id;
  v_owner_display_name := COALESCE(v_owner_display_name, 'Teskeiðarnotandi');

  v_member_payload := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', v_owner_member_id,
      'user_id', p_actor_id,
      'display_name', v_owner_display_name,
      'role', 'owner',
      'status', 'active'
    )
  );

  FOR v_item IN
    SELECT participant.value
    FROM pg_catalog.jsonb_array_elements(p_participants)
      WITH ORDINALITY AS participant(value, ordinal)
    ORDER BY participant.ordinal
  LOOP
    v_member_id := pg_catalog.gen_random_uuid();
    v_linked_user_id := NULL;

    IF v_item->>'type' = 'guest' THEN
      v_display_name := pg_catalog.btrim(v_item->>'display_name');
    ELSE
      v_relationship_id := (v_item->>'relationship_id')::uuid;
      SELECT
        relationship.counterpart_user_id,
        CASE
          WHEN public.expense_event_valid_label(profile.display_name, 1, 120)
            THEN pg_catalog.btrim(profile.display_name)
          ELSE 'Teskeiðarnotandi'
        END
      INTO v_linked_user_id, v_display_name
      FROM public.relationships AS relationship
      JOIN auth.users AS account
        ON account.id = relationship.counterpart_user_id
      LEFT JOIN public.profiles AS profile
        ON profile.id = relationship.counterpart_user_id
      WHERE relationship.id = v_relationship_id
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;

      IF v_linked_user_id IS NULL THEN
        RAISE EXCEPTION 'expense_event_participant_invalid';
      END IF;
      v_display_name := COALESCE(v_display_name, 'Teskeiðarnotandi');
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS prior(value)
        WHERE prior.value->>'linked_user_id' = v_linked_user_id::text
      ) THEN
        RAISE EXCEPTION 'expense_event_participant_conflict';
      END IF;
    END IF;

    v_member_payload := v_member_payload || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_member_id,
        'user_id', NULL,
        'display_name', v_display_name,
        'role', 'member',
        'status', 'active'
      )
    );
    v_participant_rows := v_participant_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'member_id', v_member_id,
        'linked_user_id', v_linked_user_id,
        'position', v_position
      )
    );
    v_position := v_position + 1;
  END LOOP;

  FOR v_linked_user_id IN
    SELECT DISTINCT (participant.value->>'linked_user_id')::uuid
    FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS participant(value)
    WHERE pg_catalog.jsonb_typeof(participant.value->'linked_user_id') = 'string'
    ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_linked_user_id::text, 9602)
    );
  END LOOP;

  v_group_result := public.expense_create_group(
    p_actor_id,
    v_inner_request_id,
    v_name,
    NULL,
    NULL,
    'ISK',
    true,
    v_member_payload
  );
  BEGIN
    v_group_id := (v_group_result->>'group_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'expense_event_create_failed';
  END;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_event_create_failed';
  END IF;

  INSERT INTO public.expense_event_contexts (
    group_id, owner_user_id
  ) VALUES (
    v_group_id, p_actor_id
  );

  INSERT INTO public.expense_event_participants (
    group_id, member_id, linked_user_id, position
  )
  SELECT
    v_group_id,
    (participant.value->>'member_id')::uuid,
    CASE
      WHEN pg_catalog.jsonb_typeof(participant.value->'linked_user_id') = 'string'
        THEN (participant.value->>'linked_user_id')::uuid
      ELSE NULL
    END,
    (participant.value->>'position')::smallint
  FROM pg_catalog.jsonb_array_elements(v_participant_rows) AS participant(value);

  PERFORM public.expense_event_assert_integrity(v_group_id);

  v_result := pg_catalog.jsonb_build_object('event_id', v_group_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_list_event_contexts(p_actor_id uuid)
RETURNS TABLE (
  event_id uuid,
  name text,
  participant_count integer,
  expense_count integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.expense_event_assert_actor(p_actor_id);
  RETURN QUERY
  SELECT
    context_row.group_id,
    group_row.name,
    (
      SELECT pg_catalog.count(*)::integer
      FROM public.expense_event_participants AS participant
      WHERE participant.group_id = context_row.group_id
    ),
    (
      SELECT pg_catalog.count(*)::integer
      FROM public.expenses AS expense
      WHERE expense.group_id = context_row.group_id
        AND expense.status = 'active'
    ),
    context_row.created_at
  FROM public.expense_event_contexts AS context_row
  JOIN public.expense_groups AS group_row
    ON group_row.id = context_row.group_id
  WHERE context_row.owner_user_id = p_actor_id
  ORDER BY context_row.created_at DESC, context_row.group_id DESC
  LIMIT 100;
END;
$function$;

CREATE FUNCTION public.expense_get_event_context(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.expense_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'expense_event_not_found';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', context_row.group_id,
    'name', group_row.name,
    'created_at', context_row.created_at,
    'participants', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'member_id', participant.member_id,
          'display_name', member.display_name,
          'is_teskeid_user', participant.linked_user_id IS NOT NULL,
          'position', participant.position
        )
        ORDER BY participant.position
      )
      FROM public.expense_event_participants AS participant
      JOIN public.expense_group_members AS member
        ON member.group_id = participant.group_id
       AND member.id = participant.member_id
      WHERE participant.group_id = context_row.group_id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.expense_event_contexts AS context_row
  JOIN public.expense_groups AS group_row
    ON group_row.id = context_row.group_id
  WHERE context_row.group_id = p_event_id
    AND context_row.owner_user_id = p_actor_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'expense_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_is_event_context(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_group_id IS NULL
     OR public.expense_active_member_role(p_actor_id, p_group_id) IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.expense_event_contexts AS context_row
    WHERE context_row.group_id = p_group_id
  );
END;
$function$;

-- SQL97 account cleanup, preserved in full, plus owner-private event identity
-- scrubbing. Event contexts disappear before canonical owner/member auth links;
-- financial groups, members, expenses, shares and audit history remain.
CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_email_canonical text;
  v_preferences integer := 0;
  v_snapshots integer := 0;
  v_members integer := 0;
  v_invitations integer := 0;
  v_event_links integer := 0;
  v_event_contexts integer := 0;
  v_terminal_invitation_ids uuid[];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );

  SELECT account.email INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_user_id;
  v_email_canonical := public.normalize_email_canonical(v_email);

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
  )
  ORDER BY group_row.id
  FOR UPDATE;

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
    'event_contexts_removed', v_event_contexts
  );
END;
$function$;

ALTER FUNCTION public.expense_event_valid_label(text,integer,integer)
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_has_beta_access(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_assert_actor(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_assert_integrity(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_integrity_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_group_integrity_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_context_immutable()
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_participant_immutable()
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_roster_frozen()
  OWNER TO postgres;
ALTER FUNCTION public.expense_event_invitation_blocked()
  OWNER TO postgres;
ALTER FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.expense_list_event_contexts(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_get_event_context(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_is_event_context(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_prepare_account_deletion(uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_event_valid_label(text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_has_beta_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_assert_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_assert_integrity(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_group_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_context_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_participant_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_roster_frozen()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_event_invitation_blocked()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_list_event_contexts(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_event_context(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_is_event_context(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_event_contexts(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_event_context(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_is_event_context(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_prepare_account_deletion(uuid)
  TO service_role;

COMMENT ON TABLE public.expense_event_contexts IS
  'Owner-private event marker over one canonical expense group. It grants no financial access.';
COMMENT ON TABLE public.expense_event_participants IS
  'Frozen ordered mapping for every non-owner event guest. linked_user_id is owner-private identity metadata and never financial membership.';
COMMENT ON FUNCTION public.expense_create_event_context(uuid,uuid,text,jsonb) IS
  'Atomic idempotent owner-only event creation. Registered identities remain NULL-user financial guest snapshots.';
COMMENT ON FUNCTION public.expense_is_event_context(uuid,uuid) IS
  'Expense-authorized boolean classifier. It returns no event metadata and never grants access.';

COMMIT;
