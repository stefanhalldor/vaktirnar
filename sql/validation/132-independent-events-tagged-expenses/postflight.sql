-- SQL132 independent events/tagged expenses postflight -- READ ONLY.
-- Run immediately after SQL132. Require postconditions_ok=true and compare all
-- legacy financial counts with the SQL132 preflight output.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH counts AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.expense_event_contexts) AS legacy_event_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_event_participants) AS legacy_participant_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_groups) AS group_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_group_members) AS member_rows,
    (SELECT pg_catalog.count(*) FROM public.expenses) AS expense_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_payments) AS payment_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_shares) AS share_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_obligations) AS obligation_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_repayments) AS repayment_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_repayment_allocations) AS repayment_allocation_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_member_invitations) AS invitation_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_activity) AS activity_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_mutation_requests) AS mutation_receipt_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_settlement_batches) AS settlement_batch_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_settlement_batch_items) AS settlement_item_rows,
    (SELECT pg_catalog.count(*) FROM public.teskeid_events) AS event_rows,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests) AS guest_rows,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_expense_links) AS tagged_expense_rows,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_expense_participant_sources) AS provenance_rows,
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_mutation_requests) AS event_receipt_rows
), preservation_rows(relation_name, row_count, id_digest, content_digest) AS (
  SELECT 'expense_groups', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(id::text, '|' ORDER BY id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_groups AS row_value
  UNION ALL SELECT 'expense_group_members', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || id::text,
      '|' ORDER BY group_id, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_group_members AS row_value
  UNION ALL SELECT 'expenses', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || id::text,
      '|' ORDER BY group_id, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expenses AS row_value
  UNION ALL SELECT 'expense_payments', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' ||
      expense_id::text || ':' || member_id::text, '|' ORDER BY group_id,
      expense_id, member_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_payments AS row_value
  UNION ALL SELECT 'expense_shares', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' ||
      expense_id::text || ':' || member_id::text, '|' ORDER BY group_id,
      expense_id, member_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_shares AS row_value
  UNION ALL SELECT 'expense_obligations', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || id::text,
      '|' ORDER BY group_id, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_obligations AS row_value
  UNION ALL SELECT 'expense_repayments', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || id::text,
      '|' ORDER BY group_id, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_repayments AS row_value
  UNION ALL SELECT 'expense_repayment_allocations', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' ||
      repayment_id::text || ':' || obligation_id::text, '|' ORDER BY group_id,
      repayment_id, obligation_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_repayment_allocations AS row_value
  UNION ALL SELECT 'expense_member_invitations', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || id::text,
      '|' ORDER BY group_id, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_member_invitations AS row_value
  UNION ALL SELECT 'expense_activity', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(sequence_no::text || ':' || id::text,
      '|' ORDER BY sequence_no, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_activity AS row_value
  UNION ALL SELECT 'expense_mutation_requests', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(actor_user_id::text || ':' ||
      request_id::text, '|' ORDER BY actor_user_id, request_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_mutation_requests AS row_value
  UNION ALL SELECT 'expense_settlement_batches', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(id::text, '|' ORDER BY id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_settlement_batches AS row_value
  UNION ALL SELECT 'expense_settlement_batch_items', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(batch_id::text || ':' ||
      sequence_no::text || ':' || id::text, '|' ORDER BY batch_id, sequence_no, id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_settlement_batch_items AS row_value
  UNION ALL SELECT 'expense_event_contexts', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text, '|' ORDER BY group_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_event_contexts AS row_value
  UNION ALL SELECT 'expense_event_participants', pg_catalog.count(*),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(group_id::text || ':' || member_id::text,
      '|' ORDER BY group_id, member_id), '')),
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(pg_catalog.to_jsonb(row_value)::text,
      '|' ORDER BY pg_catalog.to_jsonb(row_value)::text), ''))
  FROM public.expense_event_participants AS row_value
), preservation_contract AS (
  SELECT pg_catalog.jsonb_object_agg(relation_name,
    pg_catalog.jsonb_build_object('row_count', row_count,
      'id_digest', id_digest, 'content_digest', content_digest)
    ORDER BY relation_name) AS preservation_digests
  FROM preservation_rows
), expected_relations(name) AS (
  VALUES
    ('teskeid_events'), ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources')
), relation_contract AS (
  SELECT
    pg_catalog.count(relation.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      ) AS rls_force_owner_ok,
    pg_catalog.count(relation.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )) AS no_policies_ok,
    pg_catalog.count(relation.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            relation.relacl, pg_catalog.acldefault('r', relation.relowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE privilege.grantee = 0
             OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
        )
        AND NOT EXISTS (
          SELECT 1 FROM (VALUES
            ('anon'::name), ('authenticated'::name), ('service_role'::name)
          ) AS role_row(role_name)
          WHERE pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'UP' || 'DATE')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'DE' || 'LETE')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRUNCATE')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'REFERENCES')
             OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRIGGER')
             OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'SELECT')
             OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'INSERT')
             OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'UP' || 'DATE')
             OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'REFERENCES')
        )
      ) AS no_effective_table_or_column_privileges_ok
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
), canonical_relations(table_name, service_select, force_rls) AS (
  VALUES
    ('expense_groups', true, false),
    ('expense_group_members', true, false),
    ('expenses', true, false),
    ('expense_payments', true, false),
    ('expense_shares', true, false),
    ('expense_obligations', true, false),
    ('expense_repayments', true, false),
    ('expense_repayment_allocations', true, false),
    ('expense_member_invitations', true, false),
    ('expense_activity', true, false),
    ('expense_activity_audience', false, false),
    ('expense_mutation_requests', false, false),
    ('expense_settlement_batches', true, true),
    ('expense_settlement_batch_items', true, true),
    ('expense_event_contexts', false, true),
    ('expense_event_participants', false, true)
), canonical_relation_contract AS (
  SELECT pg_catalog.count(relation.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      relation.relrowsecurity
      AND relation.relforcerowsecurity = expected.force_rls
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0 OR privilege.is_grantable
           OR (privilege.grantee <> relation.relowner AND (
             grantee.rolname IS DISTINCT FROM 'service_role'
             OR NOT expected.service_select
             OR privilege.privilege_type <> 'SELECT'
           ))
      )
      AND pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'SELECT'
      ) = expected.service_select
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRUNCATE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'REFERENCES')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRIGGER')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND (privilege.grantee <> relation.relowner
            OR privilege.is_grantable)
      )
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('anon'::name), ('authenticated'::name)
        ) AS browser(role_name)
        WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
      )
    ) AS canonical_relation_acl_ok
  FROM canonical_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
), recent_events_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        privilege.privilege_type
        ORDER BY privilege.privilege_type COLLATE "C"
      ), ARRAY[]::text[]) AS privilege_types
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = privilege.grantee
      WHERE grantee.rolname = 'service_role'
    ) AS service_acl
    WHERE relation.oid = pg_catalog.to_regclass('public.recent_events')
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND service_acl.privilege_types = ARRAY[
        'DELETE', 'INSERT', 'SELECT', 'UPDATE'
      ]::text[]
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
      AND pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRUNCATE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'REFERENCES')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRIGGER')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'MAINTAIN')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0 OR privilege.is_grantable
           OR (privilege.grantee <> relation.relowner AND (
             grantee.rolname IS DISTINCT FROM 'service_role'
             OR privilege.privilege_type NOT IN (
               'SELECT', 'INSERT', 'UPDATE', 'DELETE'
             )
           ))
           OR (
             grantee.rolname = 'service_role'
             AND privilege.grantor <> relation.relowner
           )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('anon'::name), ('authenticated'::name)
        ) AS browser(role_name)
        WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'MAINTAIN')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
      )
  ) AS recent_events_acl_exact_ok
), relationship_index_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.relationships_owner_counterpart_user_idx'
      )
      AND index_row.indrelid = pg_catalog.to_regclass('public.relationships')
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) =
        'createuniqueindexrelationships_owner_counterpart_user_idxonrelationshipsusingbtreeowner_id,counterpart_user_idwherecounterpart_user_idisnotnull'
  ) AS relationship_index_exact_ok
), expected_canonical_columns(table_name, column_name, data_type, is_nullable) AS (
  VALUES
    ('expense_groups', 'id', 'uuid', 'NO'),
    ('expense_groups', 'kind', 'text', 'NO'),
    ('expense_group_members', 'group_id', 'uuid', 'NO'),
    ('expense_group_members', 'id', 'uuid', 'NO'),
    ('expense_group_members', 'user_id', 'uuid', 'YES'),
    ('expense_group_members', 'role', 'text', 'NO'),
    ('expense_group_members', 'status', 'text', 'NO'),
    ('expenses', 'group_id', 'uuid', 'NO'),
    ('expenses', 'id', 'uuid', 'NO'),
    ('expenses', 'status', 'text', 'NO'),
    ('expenses', 'currency', 'text', 'NO'),
    ('expense_payments', 'group_id', 'uuid', 'NO'),
    ('expense_payments', 'expense_id', 'uuid', 'NO'),
    ('expense_payments', 'member_id', 'uuid', 'NO'),
    ('expense_payments', 'amount_minor', 'bigint', 'NO'),
    ('expense_shares', 'group_id', 'uuid', 'NO'),
    ('expense_shares', 'expense_id', 'uuid', 'NO'),
    ('expense_shares', 'member_id', 'uuid', 'NO'),
    ('expense_shares', 'amount_minor', 'bigint', 'NO'),
    ('expense_obligations', 'group_id', 'uuid', 'NO'),
    ('expense_obligations', 'id', 'uuid', 'NO'),
    ('expense_obligations', 'from_member_id', 'uuid', 'NO'),
    ('expense_obligations', 'to_member_id', 'uuid', 'NO'),
    ('expense_obligations', 'amount_minor', 'bigint', 'NO'),
    ('expense_obligations', 'currency', 'text', 'NO'),
    ('expense_repayments', 'group_id', 'uuid', 'NO'),
    ('expense_repayments', 'id', 'uuid', 'NO'),
    ('expense_repayments', 'from_member_id', 'uuid', 'NO'),
    ('expense_repayments', 'to_member_id', 'uuid', 'NO'),
    ('expense_repayments', 'amount_minor', 'bigint', 'NO'),
    ('expense_repayments', 'currency', 'text', 'NO'),
    ('expense_repayments', 'status', 'text', 'NO'),
    ('expense_repayment_allocations', 'group_id', 'uuid', 'NO'),
    ('expense_repayment_allocations', 'repayment_id', 'uuid', 'NO'),
    ('expense_repayment_allocations', 'obligation_id', 'uuid', 'NO'),
    ('expense_repayment_allocations', 'amount_minor', 'bigint', 'NO'),
    ('expense_settlement_batches', 'id', 'uuid', 'NO'),
    ('expense_settlement_batches', 'currency', 'text', 'NO'),
    ('expense_settlement_batches', 'status', 'text', 'NO'),
    ('expense_settlement_batch_items', 'id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'batch_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'group_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'from_member_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'to_member_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'repayment_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'obligation_id', 'uuid', 'NO'),
    ('expense_settlement_batch_items', 'amount_minor', 'bigint', 'NO')
), canonical_column_contract AS (
  SELECT pg_catalog.count(column_row.column_name) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      column_row.data_type = expected.data_type
      AND column_row.is_nullable = expected.is_nullable
    ) AS canonical_columns_ok
  FROM expected_canonical_columns AS expected
  LEFT JOIN information_schema.columns AS column_row
    ON column_row.table_schema = 'public'
   AND column_row.table_name = expected.table_name
   AND column_row.column_name = expected.column_name
), expected_sql131_constraints(table_name, constraint_name, exact_definition) AS (
  VALUES
    ('expense_event_contexts', 'expense_event_contexts_pkey', 'primarykeygroup_id'),
    ('expense_event_contexts', 'expense_event_contexts_group_fk', 'foreignkeygroup_idreferencesexpense_groupsidondeleterestrict'),
    ('expense_event_contexts', 'expense_event_contexts_owner_fk', 'foreignkeyowner_user_idreferencesauth.usersidondeleterestrict'),
    ('expense_event_participants', 'expense_event_participants_pkey', 'primarykeygroup_id,member_id'),
    ('expense_event_participants', 'expense_event_participants_position_check', 'checkposition>=0andposition<=48'),
    ('expense_event_participants', 'expense_event_participants_position_key', 'uniquegroup_id,positiondeferrableinitiallydeferred'),
    ('expense_event_participants', 'expense_event_participants_linked_user_key', 'uniquegroup_id,linked_user_iddeferrableinitiallydeferred'),
    ('expense_event_participants', 'expense_event_participants_context_fk', 'foreignkeygroup_idreferencesexpense_event_contextsgroup_idondeletecascadedeferrableinitiallydeferred'),
    ('expense_event_participants', 'expense_event_participants_member_fk', 'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrictdeferrableinitiallydeferred'),
    ('expense_event_participants', 'expense_event_participants_linked_user_fk', 'foreignkeylinked_user_idreferencesauth.usersidondeletesetnulldeferrableinitiallydeferred')
), sql131_constraint_contract AS (
  SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ) AS sql131_constraints_exact_ok
  FROM expected_sql131_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.table_name
    )
   AND constraint_row.conname = expected.constraint_name
), expected_sql131_indexes(index_name, exact_definition) AS (
  VALUES
    ('expense_event_contexts_owner_created_idx',
      'createindexexpense_event_contexts_owner_created_idxonexpense_event_contextsusingbtreeowner_user_id,created_atdesc,group_iddesc'),
    ('expense_event_participants_linked_user_idx',
      'createindexexpense_event_participants_linked_user_idxonexpense_event_participantsusingbtreelinked_user_idwherelinked_user_idisnotnull')
), sql131_index_contract AS (
  SELECT pg_catalog.count(index_row.indexrelid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      index_row.indisvalid AND index_row.indisready
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ) AS sql131_indexes_exact_ok
  FROM expected_sql131_indexes AS expected
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = pg_catalog.to_regclass('public.' || expected.index_name)
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = index_relation.oid
), expected_canonical_constraints(table_name, constraint_name, exact_definition) AS (
  VALUES
    ('expense_groups', 'expense_groups_kind_check', 'checkkind=anyarray[group,one_off]'),
    ('expense_group_members', 'expense_group_members_group_id_id_unique', 'uniquegroup_id,id'),
    ('expenses', 'expenses_group_id_id_unique', 'uniquegroup_id,id'),
    ('expenses', 'expenses_status_check', 'checkstatus=anyarray[active,cancelled]'),
    ('expenses', 'expenses_total_check', 'checktotal_minor>=1andtotal_minor<=9007199254740991'),
    ('expenses', 'expenses_currency_check', 'checkcurrency~^[a-z]{3}$'),
    ('expense_payments', 'expense_payments_group_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeletecascade'),
    ('expense_payments', 'expense_payments_group_member_fk', 'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_payments', 'expense_payments_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
    ('expense_shares', 'expense_shares_group_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeletecascade'),
    ('expense_shares', 'expense_shares_group_member_fk', 'foreignkeygroup_id,member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_shares', 'expense_shares_amount_check', 'checkamount_minor>=0andamount_minor<=9007199254740991'),
    ('expense_obligations', 'expense_obligations_group_id_id_unique', 'uniquegroup_id,id'),
    ('expense_obligations', 'expense_obligations_distinct_members_check', 'checkfrom_member_id<>to_member_id'),
    ('expense_obligations', 'expense_obligations_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
    ('expense_obligations', 'expense_obligations_currency_check', 'checkcurrency~^[a-z]{3}$'),
    ('expense_obligations', 'expense_obligations_group_from_member_fk', 'foreignkeygroup_id,from_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_obligations', 'expense_obligations_group_to_member_fk', 'foreignkeygroup_id,to_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_repayments', 'expense_repayments_group_id_id_unique', 'uniquegroup_id,id'),
    ('expense_repayments', 'expense_repayments_distinct_members_check', 'checkfrom_member_id<>to_member_id'),
    ('expense_repayments', 'expense_repayments_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
    ('expense_repayments', 'expense_repayments_currency_check', 'checkcurrency~^[a-z]{3}$'),
    ('expense_repayments', 'expense_repayments_status_check', 'checkstatus=anyarray[reported,confirmed,rejected,cancelled]'),
    ('expense_repayments', 'expense_repayments_group_from_member_fk', 'foreignkeygroup_id,from_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_repayments', 'expense_repayments_group_to_member_fk', 'foreignkeygroup_id,to_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict'),
    ('expense_repayment_allocations', 'expense_repayment_allocations_group_repayment_fk', 'foreignkeygroup_id,repayment_idreferencesexpense_repaymentsgroup_id,idondeleterestrict'),
    ('expense_repayment_allocations', 'expense_repayment_allocations_group_obligation_fk', 'foreignkeygroup_id,obligation_idreferencesexpense_obligationsgroup_id,idondeleterestrict'),
    ('expense_repayment_allocations', 'expense_repayment_allocations_amount_check', 'checkamount_minor>=1andamount_minor<=9007199254740991'),
    ('expense_settlement_batches', 'expense_settlement_batches_status_check', 'checkstatus=anyarray[proposed,confirmed,rejected,cancelled]'),
    ('expense_settlement_batch_items', 'expense_settlement_batch_items_repayment_fk', 'foreignkeygroup_id,repayment_idreferencesexpense_repaymentsgroup_id,idondeleterestrict'),
    ('expense_settlement_batch_items', 'expense_settlement_batch_items_obligation_fk', 'foreignkeygroup_id,obligation_idreferencesexpense_obligationsgroup_id,idondeleterestrict')
), canonical_constraint_contract AS (
  SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS status_constraint
      WHERE status_constraint.conrelid = pg_catalog.to_regclass(
          'public.expenses'
        )
        AND status_constraint.conname = 'expenses_status_check'
        AND status_constraint.contype = 'c' AND status_constraint.convalidated
        AND status_constraint.conkey = ARRAY[(
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = status_constraint.conrelid
            AND attribute.attname = 'status' AND NOT attribute.attisdropped
        )]::smallint[]
        AND (
          SELECT pg_catalog.array_agg(
            (match.value)[1] ORDER BY (match.value)[1] COLLATE "C"
          )
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            status_constraint.conbin, status_constraint.conrelid
          ), '''([^'']+)''', 'g') AS match(value)
        ) = ARRAY['active', 'cancelled']::text[]
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          status_constraint.conbin, status_constraint.conrelid
        )) !~ '(true|false|is null|is not|<>|!=|not |func|(^|[^a-z])(or|and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS status_constraint
      WHERE status_constraint.conrelid = pg_catalog.to_regclass(
          'public.expense_repayments'
        )
        AND status_constraint.conname = 'expense_repayments_status_check'
        AND status_constraint.contype = 'c' AND status_constraint.convalidated
        AND status_constraint.conkey = ARRAY[(
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = status_constraint.conrelid
            AND attribute.attname = 'status' AND NOT attribute.attisdropped
        )]::smallint[]
        AND (
          SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            status_constraint.conbin, status_constraint.conrelid
          ), '''([^'']+)''', 'g') AS match(value)
        ) = ARRAY['cancelled', 'confirmed', 'rejected', 'reported']::text[]
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          status_constraint.conbin, status_constraint.conrelid
        )) !~ '(true|false|is null|is not|<>|!=|not |func|(^|[^a-z])(or|and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_relation
      JOIN pg_catalog.pg_index AS index_row
        ON index_row.indexrelid = index_relation.oid
      WHERE index_relation.oid = pg_catalog.to_regclass(
          'public.expense_repayment_single_allocation'
        )
        AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
        AND index_row.indpred IS NULL AND index_row.indexprs IS NULL
        AND index_row.indnkeyatts = 1 AND index_row.indnatts = 1
        AND index_row.indkey[0] = (
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = pg_catalog.to_regclass(
              'public.expense_repayment_allocations'
            )
            AND attribute.attname = 'repayment_id'
            AND NOT attribute.attisdropped
        )
        AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_indexdef(index_row.indexrelid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'
        ), 'public.', '')) =
          'createuniqueindexexpense_repayment_single_allocationonexpense_repayment_allocationsusingbtreerepayment_id'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      WHERE index_row.indexrelid = pg_catalog.to_regclass(
          'public.expense_group_members_registered_unique'
        )
        AND index_row.indrelid = pg_catalog.to_regclass(
          'public.expense_group_members'
        )
        AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
        AND index_row.indexprs IS NULL AND index_row.indpred IS NOT NULL
        AND index_row.indnkeyatts = 2 AND index_row.indnatts = 2
        AND index_row.indkey[0] = (
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = index_row.indrelid
            AND attribute.attname = 'group_id' AND NOT attribute.attisdropped
        )
        AND index_row.indkey[1] = (
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = index_row.indrelid
            AND attribute.attname = 'user_id' AND NOT attribute.attisdropped
        )
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        )) LIKE '%user_id is not null%'
        AND (
          SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            index_row.indpred, index_row.indrelid
          ), '''([^'']+)''', 'g') AS match(value)
        ) = ARRAY['active', 'invited']::text[]
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        )) !~ '(true|false|(^|[^a-z])(or|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
        AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_indexdef(index_row.indexrelid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'
        ), 'public.', '')) =
          'createuniqueindexexpense_group_members_registered_uniqueonexpense_group_membersusingbtreegroup_id,user_idwhereuser_idisnotnullandstatus=anyarray[invited,active]'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      WHERE index_row.indexrelid = pg_catalog.to_regclass(
          'public.expense_group_members_owner_unique'
        )
        AND index_row.indrelid = pg_catalog.to_regclass(
          'public.expense_group_members'
        )
        AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready
        AND index_row.indexprs IS NULL AND index_row.indpred IS NOT NULL
        AND index_row.indnkeyatts = 1 AND index_row.indnatts = 1
        AND index_row.indkey[0] = (
          SELECT attribute.attnum FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = index_row.indrelid
            AND attribute.attname = 'group_id' AND NOT attribute.attisdropped
        )
        AND (
          SELECT pg_catalog.array_agg((match.value)[1] ORDER BY (match.value)[1])
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            index_row.indpred, index_row.indrelid
          ), '''([^'']+)''', 'g') AS match(value)
        ) = ARRAY['active', 'owner']::text[]
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          index_row.indpred, index_row.indrelid
        )) !~ '(true|false|(^|[^a-z])(or|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
        AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_indexdef(index_row.indexrelid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'
        ), 'public.', '')) =
          'createuniqueindexexpense_group_members_owner_uniqueonexpense_group_membersusingbtreegroup_idwhererole=ownerandstatus=active'
    ) AS canonical_constraints_indexes_ok
  FROM expected_canonical_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND constraint_row.conname = expected.constraint_name
), expected_constraints(table_name, constraint_name, exact_definition) AS (
  VALUES
    ('teskeid_events', 'teskeid_events_owner_fk', 'foreignkeyowner_user_idreferencesauth.usersidondeleterestrict'),
    ('teskeid_events', 'teskeid_events_legacy_context_fk', 'foreignkeylegacy_expense_group_idreferencesexpense_event_contextsgroup_idondeleterestrict'),
    ('teskeid_events', 'teskeid_events_legacy_context_key', 'uniquelegacy_expense_group_id'),
    ('teskeid_events', 'teskeid_events_name_check', 'checkteskeid_event_valid_textname,1,160'),
    ('teskeid_event_guests', 'teskeid_event_guests_event_id_id_key', 'uniqueevent_id,id'),
    ('teskeid_event_guests', 'teskeid_event_guests_event_fk', 'foreignkeyevent_idreferencesteskeid_eventsidondeletecascade'),
    ('teskeid_event_guests', 'teskeid_event_guests_position_check', 'checkstatus=activeandposition>=0andposition<=48andremoved_atisnullorstatus=removedandpositionisnullandremoved_atisnotnull'),
    ('teskeid_event_guests', 'teskeid_event_guests_identity_shape_check', 'checksource_kind=manual_nameandemail_canonicalisnullandlinked_user_idisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andlinked_user_idisnullandrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'),
    ('teskeid_event_mutation_requests', 'teskeid_event_mutation_requests_pkey', 'primarykeyactor_user_id,request_id'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_scope_key', 'uniqueevent_id,group_id,expense_id'),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_expense_fk', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,idondeleterestrict'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_link_fk', 'foreignkeyevent_id,group_id,expense_idreferencesteskeid_event_expense_linksevent_id,group_id,expense_idondeletecascade'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_guest_fk', 'foreignkeyevent_id,event_guest_idreferencesteskeid_event_guestsevent_id,idondeletecascade'),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_member_fk', 'foreignkeygroup_id,expense_member_idreferencesexpense_group_membersgroup_id,idondeleterestrict')
), constraint_contract AS (
  SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ) AS critical_constraints_ok
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND constraint_row.conname = expected.constraint_name
), expected_indexes(index_name, unique_index, partial_index, exact_definition) AS (
  VALUES
    ('teskeid_events_owner_created_idx', false, false,
      'createindexteskeid_events_owner_created_idxonteskeid_eventsusingbtreeowner_user_id,created_atdesc,iddesc'),
    ('teskeid_event_guests_active_position_uidx', true, true,
      'createuniqueindexteskeid_event_guests_active_position_uidxonteskeid_event_guestsusingbtreeevent_id,positionwherestatus=active'),
    ('teskeid_event_guests_active_linked_uidx', true, true,
      'createuniqueindexteskeid_event_guests_active_linked_uidxonteskeid_event_guestsusingbtreeevent_id,linked_user_idwherestatus=activeandlinked_user_idisnotnull'),
    ('teskeid_event_guests_active_email_uidx', true, true,
      'createuniqueindexteskeid_event_guests_active_email_uidxonteskeid_event_guestsusingbtreeevent_id,email_canonicalwherestatus=activeandemail_canonicalisnotnull'),
    ('teskeid_event_expense_links_expense_uidx', true, false,
      'createuniqueindexteskeid_event_expense_links_expense_uidxonteskeid_event_expense_linksusingbtreeexpense_id'),
    ('teskeid_event_expense_sources_member_uidx', true, false,
      'createuniqueindexteskeid_event_expense_sources_member_uidxonteskeid_event_expense_participant_sourcesusingbtreeevent_id,expense_id,expense_member_id')
), index_contract AS (
  SELECT pg_catalog.count(index_row.indexrelid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      index_row.indisvalid AND index_row.indisready
      AND index_row.indisunique = expected.unique_index
      AND (index_row.indpred IS NOT NULL) = expected.partial_index
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ) AS critical_indexes_ok
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = pg_catalog.to_regclass('public.' || expected.index_name)
  LEFT JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_relation.oid
), expected_functions(signature, return_type, source_md5, service_execute) AS (
  VALUES
    ('public.teskeid_event_normalize_text(text)', 'text', 'ced5cfb2427fe7331f4416497614f7d1', false),
    ('public.teskeid_event_valid_text(text,integer,integer)', 'boolean', '28c80b083a90683f15fd04f4d7d547d1', false),
    ('public.teskeid_event_uuid_from_text(text)', 'uuid', '27229cbc71c621e5a8592265b07f874d', false),
    ('public.teskeid_event_has_access(uuid)', 'boolean', '7b69311a107381a1891da01c32780f5f', false),
    ('public.teskeid_event_assert_actor(uuid)', 'void', '9dd7c34f6cc6c78131e7ebbb9a718ea4', false),
    ('public.teskeid_event_assert_financial_actor(uuid)', 'void', '7f6ced4f5e7472aff27d9a6d5c624355', false),
    ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', 'jsonb', '4e70b62a5fa28cfe2b884d703935a16c', false),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'void', 'eaa006157dc5377e0ae1f8979651f8aa', false),
    ('public.teskeid_event_assert_roster(uuid)', 'void', '644432e94fb9b27e434403d84d32db4b', false),
    ('public.teskeid_event_roster_integrity_trigger()', 'trigger', 'e3f28f3ef917e7eca8766de4dc35bed0', false),
    ('public.teskeid_event_touch_updated_at()', 'trigger', 'bb0914d96897242328a9ade9661bf1a7', false),
    ('public.teskeid_event_guard_event_update()', 'trigger', 'd536d617b6bc13a556c39ad2ec0948e7', false),
    ('public.teskeid_event_guard_guest_update()', 'trigger', '889aa5388d3000147c811c35d990562e', false),
    ('public.teskeid_event_guard_receipt_mutation()', 'trigger', 'abbca6ba554f3a1d0d4d71b9918d2abd', false),
    ('public.teskeid_event_assert_expense_link(uuid,uuid,uuid)', 'void', 'a4e3a67ed697f395b8b5a2740b879f63', false),
    ('public.teskeid_event_expense_link_integrity_trigger()', 'trigger', '8709da16e3724ca30f3da159c9d0eed9', false),
    ('public.teskeid_event_financial_parent_integrity_trigger()', 'trigger', 'c1ad7695de1c73a5c08eb02a9b3aa7f4', false),
    ('public.teskeid_event_immutable_history()', 'trigger', 'f50c07cc5132e30f93aad4e5bdde806c', false),
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)', 'jsonb', '9129bb5800d742b5f3f9ab09c3f196fb', true),
    ('public.teskeid_event_list(uuid)', 'record', '8fc1eebd38b5499edc9204991529d2a4', true),
    ('public.teskeid_event_get(uuid,uuid)', 'jsonb', '5ca3a5428bd45a41b170edf76577d8ca', true),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)', 'jsonb', 'b6f8566f735fc02be284d17aeca68b62', true),
    ('public.teskeid_event_list_expense_sources(uuid)', 'jsonb', '784451720df975223032ed426f21b869', true),
    ('public.teskeid_event_get_expense_source(uuid,uuid)', 'jsonb', '0c3511019afdb7918c15dc325dec2759', true),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', 'jsonb', 'f91e0b44f3997b931126e2c827367d76', true),
    ('public.teskeid_event_get_expense_preview(uuid,uuid)', 'jsonb', '6032a2b98aceda4d5c146467cc96c6d8', true),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)', 'jsonb', 'ea94b1c0d070ac44bf3c64c2b16b699e', true),
    ('public.expense_prepare_account_deletion(uuid)', 'jsonb', 'ddaf4745ab92546e65697c5f6cd59075', true)
), function_contract AS (
  SELECT pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = pg_catalog.split_part(
            pg_catalog.split_part(expected.signature, '(', 1), '.', 2
          )
      ) = 1
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND procedure_row.prorettype = pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.source_md5
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS sql132_function_acl_owner_ok
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), expected_dependencies(signature, source_md5, security_definer, service_execute) AS (
  VALUES
    ('public.normalize_email_canonical(text)', '3083103976aa8cb3780937b9da1be236', false, true),
    ('public.expense_has_beta_access(uuid)', 'ebe4628dbda84e79b395c9da0ae39899', true, false),
    ('public.expense_assert_beta_actor(uuid)', 'ea6c329f5c13bd7d0bfbd9df41e5931d', true, false),
    ('public.expense_active_member_role(uuid,uuid)', 'b25f994a64dde4a3f94ec8bad8535b17', true, false),
    ('public.expense_begin_request(uuid,uuid,text,text)', 'd8631d60cc2f0df56dd9e958537db2a7', true, false),
    ('public.expense_finish_request(uuid,uuid,jsonb)', '194c5812642b4aaaafe888bc0ba5aa29', true, false),
    ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)', '1cdc6208ab4cc926fa9b1e6b6182aab1', true, true),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)', 'ad3e4ade2c93001e2a8b2180288107a5', true, false),
    ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', '536efe2584ce8b45ad8ecacf5574dfd4', true, true),
    ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'ad0fd30363a3c9f5d8e7b51be6f1bfa2', true, true),
    ('public.expense_terminalize_member_invitations(uuid[],text)', '483db189da284fb0e2e7b40a0e774f11', true, false),
    ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)', '5e47f31edbe4f0550f07e7b65f79e5af', true, false),
    ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', '4ab3fda8e416a10560504cf50b175ca3', true, true),
    ('public.expense_reported_repayments_need_review(uuid)', '5746ec747ae675e4bc99119b0833cc9f', true, false),
    ('public.expense_group_balances(uuid,boolean)', 'f257b83aefd92169687ab2a516da24d9', true, false),
    ('public.expense_simplified_settlement(uuid,text,boolean)', 'fe9016a12b1ac987b3b00f314c800c89', true, false),
    ('public.expense_guard_new_reported_repayment()', '2a1b9b3bc481b522724aa45e6febc172', true, false),
    ('public.expense_touch_updated_at()', '5bdc21b8fa8fb1231bdb021e09a5bc8e', false, false),
    ('public.expense_guard_settlement_batch_mutation()', '3e6cdede1440af689f0ea00ae909e99d', true, false),
    ('public.expense_guard_settlement_batch_item_mutation()', '41d3eab8ea4fc3d4f17da22e0086031f', true, false),
    ('public.expense_guard_batch_repayment_mutation()', '7a7c0e5e23944e060509a0ae4cdbb728', true, false),
    ('public.expense_cancel_batches_before_user_unlink()', '309e995f2078ea44b35430785fcc121a', true, false),
    ('public.expense_record_settlement_batch_activity(uuid,uuid,uuid,text)', 'd751cf49def7888821fae86730ec2c53', true, false),
    ('public.expense_insert_settlement_batch_item(uuid,integer,uuid,uuid,uuid,text,bigint,text,date,text,uuid)', 'ba68cffeba62f462a518fa97fc137d46', true, false),
    ('public.expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)', '804c8b2b4565b72b2ad07a8b2fb5328f', true, true),
    ('public.expense_transition_settlement_batch(uuid,uuid,text,uuid)', 'f7bce33d51b0cef08b8ce39984d046d9', true, true),
    ('public.expense_event_valid_label(text,integer,integer)', '17e566582027334d68b4106493b44abf', true, false),
    ('public.expense_event_has_beta_access(uuid)', '2354b817c135e94ba6f651a3c124938a', true, false),
    ('public.expense_event_assert_actor(uuid)', 'e2ec7008b57e628adf5aa21af6f5573d', true, false),
    ('public.expense_event_assert_integrity(uuid)', 'de867d4dd1d0afb6a9be11f66c1d3f9e', true, false),
    ('public.expense_event_integrity_trigger()', '51528b525bb574dd67a82e8a1b6cebdc', true, false),
    ('public.expense_event_group_integrity_trigger()', '34366fafe3a1faccba50632ac241083a', true, false),
    ('public.expense_event_context_immutable()', 'd72317fdea310e90c1a46fb8aeb4b88a', true, false),
    ('public.expense_event_participant_immutable()', '9953d3c479075a608853c3d61c058c5d', true, false),
    ('public.expense_event_roster_frozen()', 'c72c6b904c6d1fac619bda62b2677d4c', true, false),
    ('public.expense_event_invitation_blocked()', 'af2dc14f2a96195f48dcd2eaa00e454d', true, false),
    ('public.expense_list_event_contexts(uuid)', 'c737a057a019a45b32d553c8a9a34935', true, true),
    ('public.expense_get_event_context(uuid,uuid)', '6ea385edacafacccced825d0d39ccfeb', true, true),
    ('public.expense_is_event_context(uuid,uuid)', '73d299e648e224c45e71e67753a1abb6', true, true)
), dependency_contract AS (
  SELECT pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = pg_catalog.split_part(
            pg_catalog.split_part(expected.signature, '(', 1), '.', 2
          )
      ) = 1
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = expected.security_definer
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.source_md5
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND CASE
        WHEN expected.signature =
          'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
          THEN procedure_row.proconfig[1] = 'search_path=pg_catalog, public'
        ELSE procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      END
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS unchanged_dependencies_exact_ok
  FROM expected_dependencies AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), overload_contract AS (
  SELECT NOT EXISTS (
    SELECT procedure_row.proname
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname IN (
        'teskeid_event_create', 'teskeid_event_list', 'teskeid_event_get',
        'teskeid_event_replace_roster', 'teskeid_event_list_expense_sources',
        'teskeid_event_get_expense_source',
        'teskeid_event_create_tagged_expense',
        'teskeid_event_get_expense_preview'
      )
    GROUP BY procedure_row.proname
    HAVING pg_catalog.count(*) <> 1
  ) AS no_unexpected_event_overloads_ok
), expected_triggers(table_name, trigger_name, function_signature, deferred, trigger_type) AS (
  VALUES
    ('teskeid_events', 'teskeid_events_touch_updated_at', 'public.teskeid_event_touch_updated_at()', false, 19::smallint),
    ('teskeid_event_guests', 'teskeid_event_guests_touch_updated_at', 'public.teskeid_event_touch_updated_at()', false, 19::smallint),
    ('teskeid_events', 'teskeid_events_update_guard', 'public.teskeid_event_guard_event_update()', false, 19::smallint),
    ('teskeid_event_guests', 'teskeid_event_guests_update_guard', 'public.teskeid_event_guard_guest_update()', false, 19::smallint),
    ('teskeid_event_mutation_requests', 'teskeid_event_receipts_mutation_guard', 'public.teskeid_event_guard_receipt_mutation()', false, 27::smallint),
    ('teskeid_event_guests', 'teskeid_event_guests_roster_deferred', 'public.teskeid_event_roster_integrity_trigger()', true, 29::smallint),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_integrity_deferred', 'public.teskeid_event_expense_link_integrity_trigger()', true, 21::smallint),
    ('expense_groups', 'teskeid_event_expense_groups_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 25::smallint),
    ('expenses', 'teskeid_event_expenses_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 29::smallint),
    ('expense_group_members', 'teskeid_event_expense_members_integrity_deferred', 'public.teskeid_event_financial_parent_integrity_trigger()', true, 25::smallint),
    ('teskeid_event_expense_links', 'teskeid_event_expense_links_immutable_guard', 'public.teskeid_event_immutable_history()', false, 19::smallint),
    ('teskeid_event_expense_participant_sources', 'teskeid_event_expense_sources_immutable_guard', 'public.teskeid_event_immutable_history()', false, 19::smallint),
    ('expense_event_contexts', 'expense_event_context_integrity_deferred', 'public.expense_event_integrity_trigger()', true, 29::smallint),
    ('expense_event_participants', 'expense_event_participant_integrity_deferred', 'public.expense_event_integrity_trigger()', true, 29::smallint),
    ('expense_groups', 'expense_event_group_integrity_deferred', 'public.expense_event_group_integrity_trigger()', true, 25::smallint),
    ('expense_event_contexts', 'expense_event_context_immutable_guard', 'public.expense_event_context_immutable()', false, 19::smallint),
    ('expense_event_participants', 'expense_event_participant_immutable_guard', 'public.expense_event_participant_immutable()', false, 19::smallint),
    ('expense_group_members', 'expense_event_group_members_frozen_guard', 'public.expense_event_roster_frozen()', false, 31::smallint),
    ('expense_member_invitations', 'expense_event_member_invitations_guard', 'public.expense_event_invitation_blocked()', false, 23::smallint)
    ,('expense_repayments', 'expense_repayments_review_guard', 'public.expense_guard_new_reported_repayment()', false, 7::smallint)
    ,('expense_repayments', 'expense_repayments_batch_guard', 'public.expense_guard_batch_repayment_mutation()', false, 19::smallint)
    ,('expense_settlement_batches', 'expense_settlement_batches_touch_updated_at', 'public.expense_touch_updated_at()', false, 19::smallint)
    ,('expense_settlement_batches', 'expense_settlement_batches_immutable_guard', 'public.expense_guard_settlement_batch_mutation()', false, 27::smallint)
    ,('expense_settlement_batch_items', 'expense_settlement_batch_items_immutable_guard', 'public.expense_guard_settlement_batch_item_mutation()', false, 27::smallint)
    ,('expense_group_members', 'expense_group_members_cancel_batches_before_unlink', 'public.expense_cancel_batches_before_user_unlink()', false, 19::smallint)
), trigger_contract AS (
  SELECT pg_catalog.count(trigger_row.oid) = pg_catalog.count(*)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger AS actual
      WHERE actual.tgrelid IN (
        pg_catalog.to_regclass('public.expense_event_contexts'),
        pg_catalog.to_regclass('public.expense_event_participants')
      ) AND NOT actual.tgisinternal
    ) = 4
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(expected.function_signature)
      AND trigger_row.tgdeferrable = expected.deferred
      AND trigger_row.tginitdeferred = expected.deferred
      AND trigger_row.tgtype = expected.trigger_type
      AND (
        expected.trigger_name <> 'expense_group_members_cancel_batches_before_unlink'
        OR (
          pg_catalog.strpos(pg_catalog.pg_get_triggerdef(trigger_row.oid),
            'UPDATE OF user_id') > 0
          AND pg_catalog.strpos(pg_catalog.pg_get_triggerdef(trigger_row.oid),
            'old.user_id IS NOT NULL') > 0
          AND pg_catalog.strpos(pg_catalog.pg_get_triggerdef(trigger_row.oid),
            'new.user_id IS NULL') > 0
        )
      )
    ) AS exact_trigger_bindings_ok
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND trigger_row.tgname = expected.trigger_name
), backfill_contract AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.teskeid_events
      WHERE legacy_expense_group_id IS NOT NULL)
      = (SELECT pg_catalog.count(*) FROM public.expense_event_contexts)
    AND (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_guests AS guest
      JOIN public.teskeid_events AS event_row ON event_row.id = guest.event_id
      WHERE event_row.legacy_expense_group_id IS NOT NULL)
      = (SELECT pg_catalog.count(*) FROM public.expense_event_participants)
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      JOIN public.expense_groups AS group_row ON group_row.id = context_row.group_id
      LEFT JOIN public.teskeid_events AS event_row
        ON event_row.id = context_row.group_id
       AND event_row.legacy_expense_group_id = context_row.group_id
      WHERE event_row.id IS NULL
         OR event_row.owner_user_id <> context_row.owner_user_id
         OR event_row.name <> pg_catalog.normalize(pg_catalog.btrim(group_row.name))
         OR event_row.roster_revision <> 1
         OR event_row.created_at <> context_row.created_at
         OR event_row.updated_at <> context_row.created_at
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_event_participants AS participant
      JOIN public.expense_group_members AS member
        ON member.group_id = participant.group_id AND member.id = participant.member_id
      LEFT JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = participant.group_id AND guest.id = participant.member_id
      WHERE guest.id IS NULL
         OR guest.status <> 'active'
         OR guest.position <> participant.position
         OR guest.source_kind <> CASE WHEN participant.linked_user_id IS NULL
           THEN 'manual_name' ELSE 'relationship' END
         OR guest.display_name_snapshot <>
           pg_catalog.normalize(pg_catalog.btrim(member.display_name))
         OR guest.email_canonical IS NOT NULL
         OR guest.linked_user_id IS DISTINCT FROM participant.linked_user_id
         OR guest.relationship_id IS DISTINCT FROM (
           SELECT relationship.id
           FROM public.expense_event_contexts AS context_row
           JOIN public.relationships AS relationship
             ON relationship.owner_id = context_row.owner_user_id
            AND relationship.counterpart_user_id = participant.linked_user_id
           WHERE context_row.group_id = participant.group_id
           ORDER BY relationship.id
           LIMIT 1
         )
         OR guest.created_at <> participant.created_at
         OR guest.updated_at <> participant.created_at
         OR guest.removed_at IS NOT NULL
    ) AS exact_legacy_event_guest_parity_ok,
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_links AS link
      JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
      WHERE event_row.legacy_expense_group_id IS NOT NULL
    ) AS no_implicit_legacy_tags_ok
), roster_contract AS (
  SELECT NOT EXISTS (
    SELECT event_row.id
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = event_row.id AND guest.status = 'active'
    GROUP BY event_row.id
    HAVING pg_catalog.count(guest.id) > 49
       OR (
         pg_catalog.count(guest.id) > 0 AND NOT (
           pg_catalog.min(guest.position) = 0
           AND pg_catalog.max(guest.position) = pg_catalog.count(guest.id) - 1
           AND pg_catalog.count(DISTINCT guest.position) = pg_catalog.count(guest.id)
         )
       )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.teskeid_event_guests AS guest
    WHERE (guest.status = 'active' AND (guest.position IS NULL OR guest.removed_at IS NOT NULL))
       OR (guest.status = 'removed' AND (guest.position IS NOT NULL OR guest.removed_at IS NULL))
  ) AS roster_invariants_ok
), link_contract AS (
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_links AS link
      LEFT JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
      LEFT JOIN public.expense_groups AS group_row
        ON group_row.id = link.group_id AND group_row.kind = 'one_off'
      LEFT JOIN public.expenses AS expense
        ON expense.group_id = link.group_id AND expense.id = link.expense_id
      LEFT JOIN public.expense_group_members AS owner_member
        ON owner_member.group_id = link.group_id
       AND owner_member.user_id = event_row.owner_user_id
       AND owner_member.role = 'owner' AND owner_member.status = 'active'
      WHERE event_row.id IS NULL OR group_row.id IS NULL OR expense.id IS NULL
         OR owner_member.id IS NULL
         OR link.linked_by_user_id IS DISTINCT FROM event_row.owner_user_id
         OR (
           SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
           WHERE group_expense.group_id = link.group_id
         ) <> 1
    ) AS exact_one_off_link_scope_ok,
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_participant_sources AS source
      LEFT JOIN public.teskeid_event_expense_links AS link
        ON link.event_id = source.event_id AND link.group_id = source.group_id
       AND link.expense_id = source.expense_id
      LEFT JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = source.event_id AND guest.id = source.event_guest_id
      LEFT JOIN public.expense_group_members AS member
        ON member.group_id = source.group_id AND member.id = source.expense_member_id
      WHERE link.event_id IS NULL OR guest.id IS NULL OR member.id IS NULL
    ) AS exact_provenance_scope_ok
), source_contract AS (
  SELECT
    COALESCE(pg_catalog.strpos(event_create.prosrc,
      'public.expense_create_group'), 0) > 0
    AND COALESCE(pg_catalog.strpos(event_create.prosrc,
      'IN' || 'SERT INTO public.teskeid_events'), 0) > 0
    AND COALESCE(pg_catalog.strpos(event_create.prosrc,
      'public.expense_finish_request'), 0) > 0
      AS sql131_dual_write_bridge_ok,
    COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      'public.expense_create_expense_with_participants'), 0) > 0
    AND COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      'IN' || 'SERT INTO public.teskeid_event_expense_links'), 0) > 0
    AND COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      'IN' || 'SERT INTO public.teskeid_event_expense_participant_sources'), 0) > 0
    AND COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      '__teskeid_server_owner__'), 0) > 0
    AND COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      '__teskeid_server_event_guest__'), 0) > 0
    AND COALESCE(pg_catalog.strpos(tagged_create.prosrc,
      '__teskeid_server_relationship__'), 0) > 0
      AS tagged_atomic_delegate_ok,
    COALESCE(pg_catalog.strpos(preview.prosrc,
      'payment.amount_minor::bigint'), 0) > 0
    AND COALESCE(pg_catalog.strpos(preview.prosrc,
      '-share.amount_minor::bigint'), 0) > 0
    AND COALESCE(pg_catalog.strpos(preview.prosrc,
      'repayment.status = ''confirmed'''), 0) > 0
    AND COALESCE(pg_catalog.strpos(preview.prosrc,
      'expense_reported_repayments_need_review'), 0) > 0
    AND COALESCE(pg_catalog.strpos(preview.prosrc,
      'allocation.amount_minor = repayment.amount_minor'), 0) > 0
    AND COALESCE(pg_catalog.strpos(preview.prosrc,
      'obligation.amount_minor = allocation.amount_minor'), 0) > 0
    AND pg_catalog.strpos(preview.prosrc,
      'Repayments are group-level rows') > 0
    AND pg_catalog.strpos(preview.prosrc,
      'Repayments are group-level rows') < pg_catalog.strpos(
        preview.prosrc, 'INTO v_pending_count'
      )
      AS preview_financial_semantics_ok,
    pg_catalog.strpos(account_delete.prosrc,
      'hashtextextended(p_user_id::text, 9601)') > 0
    AND pg_catalog.strpos(account_delete.prosrc,
      'hashtextextended(p_user_id::text, 9601)') < pg_catalog.strpos(
        account_delete.prosrc, 'hashtextextended(p_user_id::text, 13201)')
    AND pg_catalog.strpos(account_delete.prosrc,
      'hashtextextended(p_user_id::text, 13201)') < pg_catalog.strpos(
        account_delete.prosrc, 'hashtextextended(v_email_canonical, 9702)')
    AND pg_catalog.strpos(account_delete.prosrc,
      'hashtextextended(v_email_canonical, 9702)') < pg_catalog.strpos(
        account_delete.prosrc, 'expense_terminalize_member_invitations')
    AND pg_catalog.strpos(account_delete.prosrc,
      'expense_terminalize_member_invitations') < pg_catalog.strpos(
        account_delete.prosrc, 'hashtextextended(p_user_id::text, 9602)')
    AND pg_catalog.strpos(account_delete.prosrc,
      'hashtextextended(p_user_id::text, 9602)') < pg_catalog.strpos(
        account_delete.prosrc, 'PERFORM event_row.id')
    AND pg_catalog.strpos(account_delete.prosrc,
      'PERFORM event_row.id') < pg_catalog.strpos(
        account_delete.prosrc, 'UP' || 'DATE public.teskeid_event_guests')
    AND pg_catalog.strpos(account_delete.prosrc,
      'UP' || 'DATE public.teskeid_event_guests') < pg_catalog.strpos(
        account_delete.prosrc, 'DE' || 'LETE FROM public.teskeid_events')
    AND pg_catalog.strpos(account_delete.prosrc,
      'DE' || 'LETE FROM public.teskeid_events') < pg_catalog.strpos(
        account_delete.prosrc, 'UP' || 'DATE public.expense_event_participants')
    AND pg_catalog.strpos(account_delete.prosrc,
      'UP' || 'DATE public.expense_event_participants') < pg_catalog.strpos(
        account_delete.prosrc, 'DE' || 'LETE FROM public.expense_event_contexts')
    AND pg_catalog.strpos(account_delete.prosrc,
      'DE' || 'LETE FROM public.expense_event_contexts') < pg_catalog.strpos(
        account_delete.prosrc, 'UP' || 'DATE public.expense_group_members')
      AS account_deletion_order_and_parity_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_feature_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND constraint_row.conkey = ARRAY[(
          SELECT attribute.attnum
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = constraint_row.conrelid
            AND attribute.attname = 'feature_key'
            AND NOT attribute.attisdropped
        )]::smallint[]
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        ))) = '97736909cf1a3a5432eeb34275cf3cfc'
        AND (
          SELECT pg_catalog.array_agg(
            (match.value)[1] ORDER BY (match.value)[1] COLLATE "C"
          )
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid
          ), '''([^'']+)''', 'g') AS match(value)
        ) = ARRAY[
          'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
          'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
          'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
          'tengsl', 'teskeid-routing-v1', 'umonnun',
          'utlagt-og-endurgreitt', 'vedrid',
          'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
          'weather-pulse'
        ]::text[]
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.regexp_matches(
            pg_catalog.lower(pg_catalog.pg_get_expr(
              constraint_row.conbin, constraint_row.conrelid
            )), E'\\mor\\M', 'g'
          )
        ) = 5
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        )) !~ '(true|false|is null|is not|<>|!=|not |func|feature_key[[:space:]]*=[[:space:]]*feature_key|(^|[^a-z])(and|case|coalesce)([^a-z]|$)|[0-9]+[[:space:]]*(=|<|>)[[:space:]]*[0-9]+)'
    ) AS feature_constraint_exact_ok
  FROM (SELECT 1 AS singleton) AS seed
  LEFT JOIN pg_catalog.pg_proc AS event_create
    ON event_create.oid = pg_catalog.to_regprocedure(
      'public.expense_create_event_context(uuid,uuid,text,jsonb)'
    )
  LEFT JOIN pg_catalog.pg_proc AS tagged_create
    ON tagged_create.oid = pg_catalog.to_regprocedure(
      'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'
    )
  LEFT JOIN pg_catalog.pg_proc AS preview
    ON preview.oid = pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_preview(uuid,uuid)'
    )
  LEFT JOIN pg_catalog.pg_proc AS account_delete
    ON account_delete.oid = pg_catalog.to_regprocedure(
      'public.expense_prepare_account_deletion(uuid)'
    )
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  counts.*,
  preservation_contract.preservation_digests,
  true AS preservation_comparison_required,
  relation_contract.rls_force_owner_ok,
  relation_contract.no_policies_ok,
  relation_contract.no_effective_table_or_column_privileges_ok,
  canonical_relation_contract.canonical_relation_acl_ok,
  recent_events_contract.recent_events_acl_exact_ok,
  relationship_index_contract.relationship_index_exact_ok,
  canonical_column_contract.canonical_columns_ok,
  sql131_constraint_contract.sql131_constraints_exact_ok,
  sql131_index_contract.sql131_indexes_exact_ok,
  canonical_constraint_contract.canonical_constraints_indexes_ok,
  constraint_contract.critical_constraints_ok,
  index_contract.critical_indexes_ok,
  function_contract.sql132_function_acl_owner_ok,
  dependency_contract.unchanged_dependencies_exact_ok,
  overload_contract.no_unexpected_event_overloads_ok,
  trigger_contract.exact_trigger_bindings_ok,
  backfill_contract.exact_legacy_event_guest_parity_ok,
  backfill_contract.no_implicit_legacy_tags_ok,
  roster_contract.roster_invariants_ok,
  link_contract.exact_one_off_link_scope_ok,
  link_contract.exact_provenance_scope_ok,
  source_contract.sql131_dual_write_bridge_ok,
  source_contract.tagged_atomic_delegate_ok,
  source_contract.preview_financial_semantics_ok,
  source_contract.account_deletion_order_and_parity_ok,
  source_contract.feature_constraint_exact_ok,
  relation_contract.rls_force_owner_ok
    AND relation_contract.no_policies_ok
    AND relation_contract.no_effective_table_or_column_privileges_ok
    AND canonical_relation_contract.canonical_relation_acl_ok
    AND recent_events_contract.recent_events_acl_exact_ok
    AND relationship_index_contract.relationship_index_exact_ok
    AND canonical_column_contract.canonical_columns_ok
    AND sql131_constraint_contract.sql131_constraints_exact_ok
    AND sql131_index_contract.sql131_indexes_exact_ok
    AND canonical_constraint_contract.canonical_constraints_indexes_ok
    AND constraint_contract.critical_constraints_ok
    AND index_contract.critical_indexes_ok
    AND function_contract.sql132_function_acl_owner_ok
    AND dependency_contract.unchanged_dependencies_exact_ok
    AND overload_contract.no_unexpected_event_overloads_ok
    AND trigger_contract.exact_trigger_bindings_ok
    AND backfill_contract.exact_legacy_event_guest_parity_ok
    AND backfill_contract.no_implicit_legacy_tags_ok
    AND roster_contract.roster_invariants_ok
    AND link_contract.exact_one_off_link_scope_ok
    AND link_contract.exact_provenance_scope_ok
    AND source_contract.sql131_dual_write_bridge_ok
    AND source_contract.tagged_atomic_delegate_ok
    AND source_contract.preview_financial_semantics_ok
    AND source_contract.account_deletion_order_and_parity_ok
    AND source_contract.feature_constraint_exact_ok AS postconditions_ok
FROM counts
CROSS JOIN preservation_contract
CROSS JOIN relation_contract
CROSS JOIN canonical_relation_contract
CROSS JOIN recent_events_contract
CROSS JOIN relationship_index_contract
CROSS JOIN canonical_column_contract
CROSS JOIN sql131_constraint_contract
CROSS JOIN sql131_index_contract
CROSS JOIN canonical_constraint_contract
CROSS JOIN constraint_contract
CROSS JOIN index_contract
CROSS JOIN function_contract
CROSS JOIN dependency_contract
CROSS JOIN overload_contract
CROSS JOIN trigger_contract
CROSS JOIN backfill_contract
CROSS JOIN roster_contract
CROSS JOIN link_contract
CROSS JOIN source_contract;

ROLLBACK;
