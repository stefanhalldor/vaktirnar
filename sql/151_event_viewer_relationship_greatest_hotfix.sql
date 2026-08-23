-- SQL151_EVENT_VIEWER_RELATIONSHIP_GREATEST_HOTFIX
--
-- PostgreSQL GREATEST is conditional-expression syntax, not a normal
-- pg_catalog function. SQL149 schema-qualified it, so the private viewer
-- relationship projection failed when first planned at runtime. Replace the
-- exact function body and leave SQL149, SQL150, data and permissions intact.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Share SQL150's lineage lock so SQL150 replay/recovery cannot race the
-- successor boundary attestation or function replacement.
SELECT pg_catalog.pg_advisory_xact_lock(15001);

DO $sql151_preflight$
DECLARE
  v_function_oid oid;
  v_source_md5 text;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql151_server_version_mismatch';
  END IF;
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql151_executor_mismatch';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)'
  );
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'sql151_predecessor_missing';
  END IF;
  SELECT pg_catalog.md5(pg_catalog.replace(
    procedure_row.prosrc, E'\r\n', E'\n'
  )) INTO v_source_md5
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_function_oid;
  IF v_source_md5 NOT IN (
    'ad66614815b29a02ee3dc928c17886c3',
    'cfb3afa33af8fd230e6c26930424387f'
  ) THEN
    RAISE EXCEPTION 'sql151_predecessor_body_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_function_oid
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 's'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname =
            'teskeid_event_private_viewer_relationship_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql151_predecessor_shape_mismatch';
  END IF;
  IF pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.grantee <> procedure_row.proowner
           OR privilege.is_grantable
         )
     ) THEN
    RAISE EXCEPTION 'sql151_predecessor_acl_mismatch';
  END IF;

  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
        'df539138c44252719575a9d0d090968b'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
        '2eb6db6c327de83f1bf241f9368c3a0c'),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
        'dd6d4f6b57c109fb46d6992ce66462e8'),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
        'd42c11caf87eaac45646535539029977'),
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',
        'd118ab08bc0346cdf31519344a2f65a7'),
      ('public.teskeid_event_private_valid_canonical_email_v2(text)',
        '3e64bc04485bc06cc544f59f46a2fb0e'),
      ('public.teskeid_event_valid_text(text,integer,integer)',
        '28c80b083a90683f15fd04f4d7d547d1')
    ) AS expected(signature, source_md5)
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR (
      SELECT pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_dependency_oid
    ) IS DISTINCT FROM v_dependency.source_md5 THEN
      RAISE EXCEPTION 'sql151_dependency_mismatch:%', v_dependency.signature;
    END IF;
  END LOOP;
  v_dependency_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
  );
  IF v_dependency_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_dependency_oid
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = 'df539138c44252719575a9d0d090968b'
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = 'teskeid_event_get_actor_view_v2'
      ) = 1
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = 'service_role'
          AND privilege.privilege_type = 'EXECUTE'
          AND NOT privilege.is_grantable
      )
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
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'sql151_sql150_boundary_mismatch';
  END IF;
  IF GREATEST(3, 0) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'sql151_greatest_expression_unavailable';
  END IF;
END;
$sql151_preflight$;

CREATE OR REPLACE FUNCTION public.teskeid_event_private_viewer_relationship_v2(
  p_actor_id uuid,
  p_relationship_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email_canonical text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_relationship public.relationships%ROWTYPE;
  v_relationship_id uuid;
  v_candidate_count integer;
  v_current_email text;
  v_built_in_tags jsonb;
  v_custom_labels jsonb;
  v_custom_label_count integer;
  v_alias text;
  v_email text;
  v_note text;
BEGIN
  -- After bind the durable user id is the sole identity authority.  An Auth
  -- email must never be exposed or used as an actor-controlled lookup oracle.
  -- Email matching remains available only for an unbound participation that
  -- itself carries that exact canonical recipient email.
  v_current_email := CASE WHEN p_recipient_user_id IS NULL
      AND public.teskeid_event_private_valid_canonical_email_v2(
        p_recipient_email_canonical
      )
    THEN p_recipient_email_canonical
    ELSE NULL END;

  -- All exact proofs participate in one de-duplicated candidate set.  Direct
  -- Event provenance is accepted only while it still proves the current
  -- identity; user/email proofs never priority-pick over a conflicting row.
  SELECT pg_catalog.count(DISTINCT relationship.id)::integer,
    (pg_catalog.array_agg(
      DISTINCT relationship.id ORDER BY relationship.id
    ))[1]
  INTO v_candidate_count, v_relationship_id
  FROM public.relationships AS relationship
  WHERE relationship.owner_id = p_actor_id
    AND (
      (
        relationship.id = p_relationship_id
        AND (
          (
            p_recipient_user_id IS NOT NULL
            AND relationship.counterpart_user_id = p_recipient_user_id
          )
          OR (
            v_current_email IS NOT NULL
            AND relationship.email_canonical = v_current_email
          )
          OR (
            p_recipient_user_id IS NULL
            AND v_current_email IS NULL
            AND relationship.counterpart_user_id IS NULL
            AND relationship.email_canonical IS NULL
          )
        )
      )
      OR (
        p_recipient_user_id IS NOT NULL
        AND relationship.counterpart_user_id = p_recipient_user_id
      )
      OR (
        v_current_email IS NOT NULL
        AND relationship.email_canonical = v_current_email
      )
    );
  IF v_candidate_count <> 1 OR v_relationship_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.relationships AS relationship
  WHERE relationship.id = v_relationship_id
    AND relationship.owner_id = p_actor_id;

  v_alias := public.teskeid_event_private_normalize_shared_name_v2(
    v_relationship.private_display_name
  );
  IF NOT COALESCE(
    public.teskeid_event_valid_text(v_alias, 1, 120)
    AND v_alias !~ '[[:cntrl:]]'
    AND v_alias !~ U&'[\202A-\202E\2066-\2069]',
    false
  ) THEN
    v_alias := NULL;
  END IF;
  v_email := v_relationship.email_canonical;
  IF v_email IS NOT NULL AND NOT
    public.teskeid_event_private_valid_canonical_email_v2(v_email)
  THEN
    v_email := NULL;
  END IF;
  v_note := NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
    pg_catalog.replace(pg_catalog.replace(
      v_relationship.note, E'\r\n', E'\n'
    ), E'\r', E'\n')
  ), '');
  IF pg_catalog.char_length(v_note) > 1000
     OR pg_catalog.replace(v_note, E'\n', '') ~ '[[:cntrl:]]'
     OR v_note ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
  THEN
    v_note := NULL;
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(tag_row.tag ORDER BY tag_row.sort_order),
    '[]'::jsonb)
  INTO v_built_in_tags
  FROM (
    SELECT tag.tag,
      CASE tag.tag
        WHEN 'unclassified' THEN 0 WHEN 'family' THEN 1
        WHEN 'friends' THEN 2 ELSE 3
      END AS sort_order
    FROM public.relationship_tags AS tag
    WHERE tag.relationship_id = v_relationship.id
    ORDER BY sort_order
    LIMIT 4
  ) AS tag_row;

  SELECT COALESCE(pg_catalog.jsonb_agg(label_row.name
    ORDER BY label_row.name, label_row.id), '[]'::jsonb)
  INTO v_custom_labels
  FROM (
    SELECT DISTINCT ON (canonical_label.name)
      canonical_label.id, canonical_label.name
    FROM (
      SELECT definition.id,
        public.teskeid_event_private_normalize_shared_name_v2(
          definition.name
        ) AS name
      FROM public.relationship_label_assignments AS assignment
      JOIN public.relationship_label_definitions AS definition
        ON definition.id = assignment.label_id
       AND definition.owner_id = assignment.owner_id
      WHERE assignment.owner_id = p_actor_id
        AND assignment.relationship_id = v_relationship.id
    ) AS canonical_label
    WHERE public.teskeid_event_valid_text(
      canonical_label.name, 1, 60
    )
    ORDER BY canonical_label.name, canonical_label.id
    LIMIT 20
  ) AS label_row;

  SELECT pg_catalog.count(*)::integer INTO v_custom_label_count
  FROM public.relationship_label_assignments AS assignment
  WHERE assignment.owner_id = p_actor_id
    AND assignment.relationship_id = v_relationship.id;

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'relationship',
    'alias', v_alias,
    'email', v_email,
    'built_in_tags', v_built_in_tags,
    'custom_labels', v_custom_labels,
    'hidden_custom_label_count', GREATEST(
      v_custom_label_count - pg_catalog.jsonb_array_length(v_custom_labels), 0
    ),
    'note', v_note
  );
END;
$function$;

ALTER FUNCTION public.teskeid_event_private_viewer_relationship_v2(
  uuid,uuid,uuid,text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $sql151_postflight$
DECLARE
  v_function_oid oid;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)'
  );
  IF v_function_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_function_oid
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = 'cfb3afa33af8fd230e6c26930424387f'
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 's'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname =
            'teskeid_event_private_viewer_relationship_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql151_postflight_shape_mismatch';
  END IF;
  IF pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.grantee <> procedure_row.proowner
           OR privilege.is_grantable
         )
     ) THEN
    RAISE EXCEPTION 'sql151_postflight_acl_mismatch';
  END IF;
  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
        'df539138c44252719575a9d0d090968b'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
        '2eb6db6c327de83f1bf241f9368c3a0c'),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
        'dd6d4f6b57c109fb46d6992ce66462e8'),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
        'd42c11caf87eaac45646535539029977'),
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',
        'd118ab08bc0346cdf31519344a2f65a7'),
      ('public.teskeid_event_private_valid_canonical_email_v2(text)',
        '3e64bc04485bc06cc544f59f46a2fb0e'),
      ('public.teskeid_event_valid_text(text,integer,integer)',
        '28c80b083a90683f15fd04f4d7d547d1')
    ) AS expected(signature, source_md5)
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR (
      SELECT pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_dependency_oid
    ) IS DISTINCT FROM v_dependency.source_md5 THEN
      RAISE EXCEPTION 'sql151_postflight_dependency_mismatch:%',
        v_dependency.signature;
    END IF;
  END LOOP;
  v_dependency_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
  );
  IF v_dependency_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_dependency_oid
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = 'df539138c44252719575a9d0d090968b'
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = 'teskeid_event_get_actor_view_v2'
      ) = 1
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = 'service_role'
          AND privilege.privilege_type = 'EXECUTE'
          AND NOT privilege.is_grantable
      )
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
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'sql151_postflight_sql150_boundary_mismatch';
  END IF;
  IF GREATEST(3, 0) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'sql151_postflight_greatest_mismatch';
  END IF;
END;
$sql151_postflight$;

COMMIT;
