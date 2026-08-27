-- SQL162 diagnostic. 100% read-only; no user-facing content is returned.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH expected_relation_security(
  signature, expected_rls, expected_force, expected_policy_count,
  expected_nonowner_acl
) AS (VALUES
  ('public.expense_private_drafts',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publications',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publication_parties',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_publication_audience',true,true,0,ARRAY[]::text[]),
  ('public.expense_unconfirmed_finalizations',true,true,0,ARRAY[]::text[]),
  ('public.expense_private_draft_tombstones',true,true,0,ARRAY[]::text[]),
  ('public.expense_groups',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_group_members',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expenses',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_payments',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_shares',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_obligations',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_repayments',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_repayment_allocations',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_mutation_requests',true,false,0,ARRAY[]::text[]),
  ('public.teskeid_events',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_guests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_mutation_requests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_attendance_memberships',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participations',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participation_rsvp_v3',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_expense_links',true,true,0,ARRAY[]::text[])
), relation_security_observed AS MATERIALIZED (
  SELECT expected_relation_security.*,
    relation.oid AS relation_oid, relation.relkind,
    relation.relpersistence, relation.relrowsecurity,
    relation.relforcerowsecurity, relation.relowner, relation.relacl,
    pg_catalog.pg_get_userbyid(relation.relowner) AS actual_owner,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_policy AS policy_row
     WHERE policy_row.polrelid = relation.oid) AS actual_policy_count,
    COALESCE((SELECT pg_catalog.array_agg(
      (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(privilege.grantee) END) || ':' ||
        privilege.privilege_type
      ORDER BY ((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(privilege.grantee) END) || ':' ||
        privilege.privilege_type) COLLATE pg_catalog."C"
    )::text[] FROM pg_catalog.aclexplode(COALESCE(
      relation.relacl, pg_catalog.acldefault('r', relation.relowner)
    )) AS privilege
    WHERE privilege.grantee <> relation.relowner), ARRAY[]::text[])
      AS actual_nonowner_acl,
    NOT EXISTS (
      SELECT 1
      FROM (VALUES ('anon'), ('authenticated'), ('service_role'))
        AS checked_role(role_name)
      CROSS JOIN (VALUES
        ('SELECT', 0), ('INSERT', 0), ('UPDATE', 0), ('DELETE', 0),
        ('TRUNCATE', 0), ('REFERENCES', 0), ('TRIGGER', 0),
        ('MAINTAIN', 170000)
      ) AS checked_privilege(privilege_type, minimum_version)
      WHERE CASE
        WHEN pg_catalog.current_setting('server_version_num')::integer <
          checked_privilege.minimum_version THEN false
        ELSE pg_catalog.has_table_privilege(
            checked_role.role_name::name, relation.oid,
            checked_privilege.privilege_type
          ) IS DISTINCT FROM (
            (checked_role.role_name || ':' ||
              checked_privilege.privilege_type) = ANY(
                expected_relation_security.expected_nonowner_acl
              )
          )
        END
    ) AS effective_nonowner_acl_exact
  FROM expected_relation_security
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass(
      expected_relation_security.signature
    )
), relation_security_checks AS MATERIALIZED (
  SELECT relation_security_observed.*,
    COALESCE(relation_oid IS NOT NULL AND relkind = 'r'
      AND relpersistence = 'p' AND actual_owner = 'postgres'
      AND relrowsecurity = expected_rls
      AND relforcerowsecurity = expected_force
      AND actual_policy_count = expected_policy_count
      AND actual_nonowner_acl = expected_nonowner_acl
      AND effective_nonowner_acl_exact
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_oid
          AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (SELECT pg_catalog.count(*) = 7 + CASE
        WHEN pg_catalog.current_setting('server_version_num')::integer >=
          170000 THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation_security_observed.relacl,
          pg_catalog.acldefault('r', relation_security_observed.relowner)
        )) AS privilege
        WHERE privilege.grantee = relation_security_observed.relowner
          AND privilege.grantor = relation_security_observed.relowner
          AND NOT privilege.is_grantable
          AND privilege.privilege_type IN (
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
            'TRIGGER','MAINTAIN'
          ))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          relation_security_observed.relacl,
          pg_catalog.acldefault('r', relation_security_observed.relowner)
        )) AS privilege
        WHERE privilege.grantor <> relation_security_observed.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
             'TRIGGER','MAINTAIN'
           )
      ), false) AS relation_exact
  FROM relation_security_observed
), relation_security_contract AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 22
      AND COALESCE(pg_catalog.bool_and(relation_exact), false)
        AS relation_security_exact,
    pg_catalog.count(*)::integer AS relation_security_count,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'relation', signature, 'expected_rls', expected_rls,
      'actual_rls', relrowsecurity, 'expected_force', expected_force,
      'actual_force', relforcerowsecurity,
      'expected_policy_count', expected_policy_count,
      'actual_policy_count', actual_policy_count,
      'expected_nonowner_acl', expected_nonowner_acl,
      'actual_nonowner_acl', actual_nonowner_acl,
      'effective_nonowner_acl_exact', effective_nonowner_acl_exact,
      'exact', relation_exact
    ) ORDER BY signature COLLATE pg_catalog."C") AS relation_security_evidence
  FROM relation_security_checks
), old_graph AS MATERIALIZED (
  SELECT membership.event_id, membership.user_id,
    membership.event_guest_id
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_events AS event_row
    ON event_row.id = membership.event_id
   AND event_row.owner_user_id <> membership.user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = membership.event_id
   AND guest.id = membership.event_guest_id
   AND guest.status = 'active'
   AND guest.linked_user_id = membership.user_id
), current_graph AS MATERIALIZED (
  SELECT participation.event_id,
    participation.recipient_user_id AS user_id,
    participation.event_guest_id,
    participation.identity_generation,
    participation.rsvp_version
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
   AND event_row.owner_user_id <> participation.recipient_user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
   AND decision.identity_generation = participation.identity_generation
   AND decision.decision_version = participation.rsvp_version
  WHERE participation.recipient_user_id IS NOT NULL
    AND participation.access_state = 'active'
), current_identity AS MATERIALIZED (
  SELECT event_id, user_id, event_guest_id FROM current_graph
), malformed_current AS MATERIALIZED (
  SELECT participation.event_id, participation.recipient_user_id,
    participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
   AND event_row.owner_user_id <> participation.recipient_user_id
  LEFT JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
   AND decision.identity_generation = participation.identity_generation
   AND decision.decision_version = participation.rsvp_version
  WHERE participation.recipient_user_id IS NOT NULL
    AND participation.access_state = 'active'
    AND (guest.id IS NULL OR decision.event_guest_id IS NULL)
), duplicate_current AS MATERIALIZED (
  SELECT current_row.event_id, current_row.user_id
  FROM current_identity AS current_row
  GROUP BY current_row.event_id, current_row.user_id
  HAVING pg_catalog.count(*) <> 1
), targets(signature) AS (
  VALUES
    ('public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)'),
    ('public.teskeid_event_list_expense_contexts_v1(uuid)'),
    ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)'),
    ('public.expense_sql162_event_relation_tuple(jsonb)'),
    ('public.expense_sql162_assert_event_context(uuid,uuid,bigint)'),
    ('public.teskeid_event_get_expense_source_v3(uuid,uuid)'),
    ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'),
    ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)'),
    ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'),
    ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'),
    ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)'),
    ('public.expense_active_member_role(uuid,uuid)'),
    ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)'),
    ('public.expense_begin_request(uuid,uuid,text,text)'),
    ('public.expense_finish_request(uuid,uuid,jsonb)'),
    ('public.expense_identity_request_id(text,uuid)'),
    ('public.expense_sql159_event_scope_read_only(uuid,uuid)'),
    ('public.expense_sql159_event_scope_allows(uuid,uuid)'),
    ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'),
    ('public.teskeid_event_assert_financial_actor(uuid)'),
    ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)'),
    ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)'),
    ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)'),
    ('public.teskeid_event_private_normalize_shared_name_v2(text)')
), protected_names(relation_name) AS (VALUES
  ('expense_private_drafts'), ('expense_unconfirmed_publications'),
  ('expense_unconfirmed_publication_parties'),
  ('expense_unconfirmed_publication_audience'), ('expense_groups'),
  ('expense_group_members'), ('expenses'), ('expense_payments'),
  ('expense_shares'), ('expense_obligations'),
  ('expense_repayments'), ('expense_repayment_allocations'),
  ('expense_unconfirmed_finalizations'),
  ('expense_private_draft_tombstones'),
  ('teskeid_event_expense_links'), ('expense_mutation_requests'),
  ('teskeid_event_mutation_requests')
), protected_rows AS MATERIALIZED (
  SELECT 'expense_private_drafts'::text AS relation_name,
    pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) AS row_digest
  FROM public.expense_private_drafts AS row_value
  UNION ALL SELECT 'expense_unconfirmed_publications', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_unconfirmed_publications AS row_value
  UNION ALL SELECT 'expense_unconfirmed_publication_parties', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_unconfirmed_publication_parties AS row_value
  UNION ALL SELECT 'expense_unconfirmed_publication_audience', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_unconfirmed_publication_audience AS row_value
  UNION ALL SELECT 'expense_groups', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_groups AS row_value
  UNION ALL SELECT 'expense_group_members', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_group_members AS row_value
  UNION ALL SELECT 'expenses', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expenses AS row_value
  UNION ALL SELECT 'expense_payments', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_payments AS row_value
  UNION ALL SELECT 'expense_shares', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_shares AS row_value
  UNION ALL SELECT 'expense_obligations', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_obligations AS row_value
  UNION ALL SELECT 'expense_repayments', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_repayments AS row_value
  UNION ALL SELECT 'expense_repayment_allocations', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_repayment_allocations AS row_value
  UNION ALL SELECT 'expense_unconfirmed_finalizations', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_unconfirmed_finalizations AS row_value
  UNION ALL SELECT 'expense_private_draft_tombstones', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_private_draft_tombstones AS row_value
  UNION ALL SELECT 'teskeid_event_expense_links', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.teskeid_event_expense_links AS row_value
  UNION ALL SELECT 'expense_mutation_requests', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.expense_mutation_requests AS row_value
  UNION ALL SELECT 'teskeid_event_mutation_requests', pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text) FROM public.teskeid_event_mutation_requests AS row_value
), protected_relation_evidence AS MATERIALIZED (
  SELECT protected_names.relation_name,
    pg_catalog.count(protected_rows.row_digest) AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      protected_rows.row_digest, E'\n'
      ORDER BY protected_rows.row_digest COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM protected_names LEFT JOIN protected_rows USING (relation_name)
  GROUP BY protected_names.relation_name
), protected_complete AS MATERIALIZED (
  SELECT pg_catalog.jsonb_object_agg(
      relation_name,
      pg_catalog.jsonb_build_object('count', row_count, 'digest', row_digest)
      ORDER BY relation_name COLLATE pg_catalog."C"
    ) AS protected_relation_evidence,
    pg_catalog.md5(pg_catalog.string_agg(
      relation_name || '|' || row_count::text || '|' || row_digest,
      E'\n' ORDER BY relation_name COLLATE pg_catalog."C"
    )) AS protected_baseline_token
  FROM protected_relation_evidence
)
SELECT current_user AS current_executor, session_user AS session_executor,
  relation_security_contract.relation_security_exact,
  relation_security_contract.relation_security_count,
  relation_security_contract.relation_security_evidence,
  (SELECT pg_catalog.count(*) FROM old_graph) AS old_graph_count,
  (SELECT pg_catalog.count(*) FROM current_identity) AS current_graph_count,
  (SELECT pg_catalog.count(*) FROM (
    SELECT * FROM old_graph EXCEPT SELECT * FROM current_identity
  ) AS old_only) AS old_minus_current_count,
  (SELECT pg_catalog.count(*) FROM (
    SELECT * FROM current_identity EXCEPT SELECT * FROM old_graph
  ) AS current_only) AS current_minus_old_count,
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.md5(
      current_only.event_id::text || '|' || current_only.user_id::text ||
        '|' || current_only.event_guest_id::text
    ), E'\n' ORDER BY current_only.event_id, current_only.user_id,
      current_only.event_guest_id
  ), '')) FROM (
    SELECT * FROM current_identity EXCEPT SELECT * FROM old_graph
  ) AS current_only) AS current_minus_old_digest,
  (SELECT pg_catalog.count(*) FROM malformed_current)
    AS malformed_current_count,
  (SELECT pg_catalog.count(*) FROM duplicate_current)
    AS duplicate_current_identity_count,
  (SELECT pg_catalog.count(*)
   FROM current_identity AS current_row
   JOIN public.teskeid_events AS event_row
     ON event_row.id = current_row.event_id
    AND event_row.owner_user_id = current_row.user_id)
    AS owner_attendee_overlap_count,
  NOT EXISTS (
    SELECT * FROM old_graph EXCEPT SELECT * FROM current_identity
  ) AS legacy_subset_current,
  NOT EXISTS (SELECT 1 FROM malformed_current)
    AND NOT EXISTS (SELECT 1 FROM duplicate_current)
    AND NOT EXISTS (
      SELECT 1
      FROM current_identity AS current_row
      JOIN public.teskeid_events AS event_row
        ON event_row.id = current_row.event_id
       AND event_row.owner_user_id = current_row.user_id
    )
      AS current_graph_integrity_exact,
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    current_graph.identity_generation::text || '|' ||
      current_graph.rsvp_version::text,
    E'\n' ORDER BY current_graph.event_id, current_graph.user_id,
      current_graph.event_guest_id
  ), '')) FROM current_graph) AS current_generation_digest,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', target.signature,
    'exists', routine.oid IS NOT NULL,
    'arguments', CASE WHEN routine.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_arguments(routine.oid) END,
    'result', CASE WHEN routine.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_function_result(routine.oid) END,
    'source_hash', pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    'owner', pg_catalog.pg_get_userbyid(routine.proowner),
    'security_definer', routine.prosecdef,
    'strict', routine.proisstrict,
    'volatility', routine.provolatile::text,
    'parallel', routine.proparallel::text,
    'config', routine.proconfig,
    'acl', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee_oid', privilege.grantee,
      'grantee', grantee_role.rolname,
      'privilege', privilege.privilege_type,
      'grantable', privilege.is_grantable
    ) ORDER BY privilege.grantee, privilege.privilege_type)
    FROM pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee)
  ) ORDER BY target.signature)
  FROM targets AS target
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(target.signature)) AS function_state,
  protected_complete.protected_relation_evidence,
  protected_complete.protected_baseline_token
FROM protected_complete CROSS JOIN relation_security_contract;

COMMIT;
