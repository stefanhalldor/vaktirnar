import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migrationPath = join(root, 'sql/162_event_expense_bidirectional_context_contract.sql')

describe('SQL162 bidirectional Event and Expense context contract', () => {
  it('installs the current-attendance service contracts and semantic save guard', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('teskeid_event_list_attachable_expenses_v1')
    expect(sql).toContain('teskeid_event_list_expense_contexts_v1')
    expect(sql).toContain('expense_set_private_draft_event_relation_v1')
    expect(sql).toContain('teskeid_event_get_expense_source_v3')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.expense_save_private_draft(')
    expect(sql).toContain('expense_sql162_event_relation_tuple')
    expect(sql).toContain('expense_draft_event_relation_conflict')

    for (const signature of [
      'public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)',
      'public.teskeid_event_list_expense_contexts_v1(uuid)',
      'public.teskeid_event_get_expense_source_v3(uuid,uuid)',
      'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)',
      'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)',
      'public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature}`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`)
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('keeps visibility outside the semantic Event relation tuple', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const helper = sql.match(
      /CREATE FUNCTION public\.expense_sql162_event_relation_tuple[\s\S]*?\$function\$;/,
    )?.[0]

    expect(helper).toBeTruthy()
    expect(helper).toContain("'link_to_event'")
    expect(helper).toContain("'event_id'")
    expect(helper).toContain("'event_roster_revision'")
    expect(helper).not.toContain('eventVisibility')
    expect(helper).not.toContain("'visibility'")
  })

  it('mutates only the existing draft/publication identity and never financial rows', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const relation = sql.match(
      /CREATE FUNCTION public\.expense_set_private_draft_event_relation_v1[\s\S]*?\$function\$;/,
    )?.[0]

    expect(relation).toBeTruthy()
    expect(relation).toContain('UPDATE public.expense_private_drafts')
    expect(relation).toContain('UPDATE public.expense_unconfirmed_publications')
    expect(relation).toContain('source_draft_version = v_new_draft_version')
    expect(relation).toContain("'publication_id', v_publication.publication_id")
    expect(relation).toContain('v_existing_parties')
    expect(relation).toContain('v_existing_audience')
    expect(relation).not.toMatch(/INSERT INTO public\./)
    expect(relation).not.toMatch(/DELETE FROM public\./)
    for (const table of [
      'expenses', 'expense_payments', 'expense_shares', 'expense_obligations',
      'expense_repayments',
    ]) expect(relation).not.toContain(`UPDATE public.${table}`)
  })

  it('keeps discovery bounded and revalidates exact authority in mutation contracts', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql.match(/LIMIT 101/g)).toHaveLength(2)
    expect(sql).toContain('IF v_count > 100 THEN')
    expect(sql).toContain("'financial_version', candidate.financial_version::text")
    expect(sql).toContain('p_expected_roster_revision')
    expect(sql).toContain('expense_sql162_assert_event_context')
    expect(sql).toContain('ORDER BY event_row.id FOR UPDATE')
  })

  it('uses one current SQL153 Event predicate across all four entry directions', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const functionBody = (name: string) => sql.match(new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    ))?.[0] ?? ''
    const currentTargets = [
      'teskeid_event_list_expense_contexts_v1',
      'teskeid_event_get_expense_source_v3',
      'teskeid_event_list_attachable_expenses_v1',
      'teskeid_event_get_expense_link_management_v2',
      'teskeid_event_attach_expense_v2',
      'expense_sql162_assert_event_context',
      'expense_set_private_draft_event_relation_v1',
    ]

    for (const name of currentTargets) {
      const body = functionBody(name)
      expect(body, name).toBeTruthy()
      expect(body, name).not.toContain('teskeid_event_attendance_memberships')
      expect(body, name).not.toContain('linked_user_id')
      expect(body, name).not.toContain('effective_state')
    }
    for (const name of [
      'teskeid_event_list_expense_contexts_v1',
      'teskeid_event_list_attachable_expenses_v1',
      'teskeid_event_get_expense_link_management_v2',
      'teskeid_event_attach_expense_v2',
    ]) expect(functionBody(name)).toContain('expense_sql159_event_scope_allows')

    expect(functionBody('teskeid_event_get_expense_source_v3'))
      .toContain('expense_sql159_event_scope_read_only')
    expect(functionBody('teskeid_event_get_expense_source_v3'))
      .toContain('guest.id <> v_self_guest_id')
    expect(functionBody('teskeid_event_get_legacy_expense_source_v2'))
      .toContain('teskeid_event_get_expense_source_v3')
    expect(functionBody('expense_sql162_assert_event_context'))
      .toContain('teskeid_event_get_expense_source_v3')

    const attachable = functionBody('teskeid_event_list_attachable_expenses_v1')
    const management = functionBody('teskeid_event_get_expense_link_management_v2')
    const attach = functionBody('teskeid_event_attach_expense_v2')
    for (const body of [attachable, management, attach]) {
      expect(body).toContain('expense_active_member_role')
      expect(body).toContain("IN ('owner', 'admin')")
    }
    expect(attachable).toContain("group_row.kind = 'one_off'")
    expect(management).toContain("group_row.kind = 'one_off'")
    expect(attach).toContain("v_group.kind <> 'one_off'")
    expect(attach).toContain('p_expected_financial_version')
    expect(attach).toContain('p_expected_roster_revision')
  })

  it('keeps RSVP display state separate from canonical current Event access', () => {
    const sql159 = readFileSync(join(
      root,
      'sql/159_expense_unconfirmed_publication_and_finalization.sql',
    ), 'utf8')
    const scope = sql159.match(
      /CREATE FUNCTION public\.expense_sql159_event_scope_read_only[\s\S]*?\$function\$;/,
    )?.[0]

    expect(scope).toBeTruthy()
    expect(scope).toContain("participation.access_state = 'active'")
    expect(scope).toContain("guest.status = 'active'")
    expect(scope).toContain('decision.identity_generation = participation.identity_generation')
    expect(scope).toContain('decision.decision_version = participation.rsvp_version')
    expect(scope).not.toContain('effective_state')
  })

  it('treats current attendance as authority and legacy as subset evidence', () => {
    const preflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/preflight.sql',
    ), 'utf8')
    const sql = readFileSync(migrationPath, 'utf8')

    expect(preflight).toContain('old_minus_current_count')
    expect(preflight).toContain('current_minus_old_count')
    expect(preflight).toContain('old_graph_digest')
    expect(preflight).toContain('current_graph_digest')
    expect(preflight).toContain('legacy_subset_current')
    expect(preflight).toContain('current_graph_integrity_exact')
    expect(preflight).toContain('attendance_authority_compatible')
    expect(preflight).not.toContain('graphs_equivalent')
    expect(sql).toMatch(
      /v_visibility := CASE WHEN v_privacy_fail_closed\s+THEN 'participants_only'/,
    )
    expect(sql).toContain("'privacy_fail_closed', v_privacy_fail_closed")
  })

  it('keeps the manual gate read-only, lost-response-safe, and protected by exact source evidence', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const preflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/preflight.sql',
    ), 'utf8')
    const recovery = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/recovery.sql',
    ), 'utf8')

    expect(preflight).toContain('SET TRANSACTION READ ONLY')
    expect(preflight).toContain('lost_response_safe')
    expect(preflight).toContain('protected.draft_digest')
    expect(preflight).toContain('protected.publication_digest')
    expect(preflight).toContain('protected.link_digest')
    expect(preflight).toContain('save_contract.predecessor_save_shape_exact')
    expect(preflight).toContain('save_contract.save_acl_exact')
    expect(recovery).toContain("'59f7c91049839431bf068d58f8462673'")
    expect(recovery).toContain("'a1bba12665e8651121bac578d7e936d4'")
    expect(recovery).toContain("'ed635a847824d8c5669af82c93c3c57d'")
    expect(recovery).toContain("'279be97e3295b9d2ae6f2457bf106d6a'")
    expect(recovery).toContain("'e154667946fb4756b433d6e632dc0575'")
    expect(recovery).toContain("'7ab39825d58918dfc99ebb01b53128ec'")
    expect(recovery).toContain("'e6dc71178a96bb4f398d61b44b39c57a'")
    expect(recovery).toContain("'aec7d0cf817826697338e74de645dc4e'")
    expect(recovery).toContain('DROP FUNCTION public.teskeid_event_get_expense_source_v3')
    expect(recovery).toContain("IS DISTINCT FROM 'aa7eb65be2210108d99736fa2f7d8b37'")
    expect(recovery).toContain('sql162_recovery_state_mismatch')
    expect(recovery).toContain('sql162_recovery_restore_mismatch')
    for (const source of [sql, preflight, recovery]) {
      expect(source).not.toContain('pg_catalog.md5(routine.prosrc)')
    }
    expect(sql).toMatch(
      /DO \$sql162_precondition\$[\s\S]*?pg_catalog\.md5\(pg_catalog\.replace\(\s*routine\.prosrc, E'\\r\\n', E'\\n'\s*\)\)[\s\S]*?\$sql162_precondition\$;/,
    )
    expect(recovery).toMatch(
      /DO \$sql162_recovery_restore_guard\$[\s\S]*?pg_catalog\.md5\(pg_catalog\.replace\(\s*routine\.prosrc, E'\\r\\n', E'\\n'\s*\)\)[\s\S]*?\$sql162_recovery_restore_guard\$;/,
    )
  })

  it('checks exact non-owner EXECUTE grants without treating PUBLIC as a login role', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const postflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/postflight.sql',
    ), 'utf8')

    expect(postflight).toContain("pg_catalog.acldefault('f', routine.proowner)")
    expect(postflight).toContain("pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n')) <> state.source_hash")
    expect(postflight).toContain("grantee.rolname IS DISTINCT FROM 'service_role'")
    expect(postflight).not.toContain("has_function_privilege('PUBLIC'")
    expect(postflight).toContain('pg_catalog.strpos(')
    expect(postflight).not.toContain('pg_catalog.position(')
    expect(postflight).toContain('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)')
    for (const name of [
      'expense_sql162_event_relation_tuple',
      'expense_sql162_assert_event_context',
      'teskeid_event_get_expense_source_v3',
      'teskeid_event_list_expense_contexts_v1',
      'teskeid_event_list_attachable_expenses_v1',
      'teskeid_event_get_expense_link_management_v2',
      'teskeid_event_attach_expense_v2',
      'teskeid_event_get_legacy_expense_source_v2',
      'expense_save_private_draft',
      'expense_set_private_draft_event_relation_v1',
    ]) {
      const start = sql.indexOf(`FUNCTION public.${name}(`)
      const bodyStart = sql.indexOf('AS $function$', start) + 'AS $function$'.length
      const bodyEnd = sql.indexOf('$function$;', bodyStart)
      expect(start).toBeGreaterThan(-1)
      expect(bodyEnd).toBeGreaterThan(bodyStart)
      const hash = createHash('md5').update(sql.slice(bodyStart, bodyEnd)).digest('hex')
      expect(postflight).toContain(hash)
    }
  })

  it('uses canonical empty search paths and models every EXECUTE grantee exactly', () => {
    const preflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/preflight.sql',
    ), 'utf8')
    const postflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/postflight.sql',
    ), 'utf8')

    for (const validation of [preflight, postflight]) {
      expect(validation).toContain(`ARRAY['search_path=""']::text[]`)
      expect(validation).not.toContain(`ARRAY['search_path=']::text[]`)
      expect(validation).toContain('privilege.grantee = 0')
      expect(validation).toContain('privilege.is_grantable')
      expect(validation).toContain('service_role')
    }
    expect(preflight).toContain('installed_functions_exact')
    expect(preflight).toContain('save_acl_exact')
    expect(postflight).toContain('functions_security_exact')
  })

  it('strictly replays only the exact durable draft and publication state', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const relation = sql.match(
      /CREATE FUNCTION public\.expense_set_private_draft_event_relation_v1[\s\S]*?\$function\$;/,
    )?.[0]

    expect(relation).toBeTruthy()
    expect(relation).toContain('v_replay ?& ARRAY[')
    for (const field of [
      'receipt_publication_is_live',
      'receipt_publication_event_id',
      'receipt_publication_event_roster_revision',
      'receipt_publication_visibility',
    ]) expect(relation).toContain(`'${field}'`)
    expect(relation).toContain('expense_draft_event_replay_stale')
    expect(relation).toContain('v_publication.publication_id')
    expect(relation).toContain('v_publication.publication_version')
    expect(relation).toContain('v_publication.is_live')
    expect(relation).toContain('v_publication.visibility')
    expect(relation).toContain('v_publication.event_id')
    expect(relation).toContain('v_publication.event_roster_revision')
    expect(relation).toContain('RETURN v_replay - ARRAY[')
  })

  it('persists the live all-event removal fail-close in the private draft transaction', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const relation = sql.match(
      /CREATE FUNCTION public\.expense_set_private_draft_event_relation_v1[\s\S]*?\$function\$;/,
    )?.[0]

    expect(relation).toBeTruthy()
    expect(relation).toMatch(
      /v_privacy_fail_closed :=[\s\S]*?ARRAY\['eventVisibility'\]::text\[][\s\S]*?'participants_only'[\s\S]*?UPDATE public\.expense_private_drafts/,
    )
  })

  it('freezes every direct helper contract and emits complete operator baseline evidence', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const preflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/preflight.sql',
    ), 'utf8')
    const postflight = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/postflight.sql',
    ), 'utf8')
    const directDependencies = [
      'public.expense_active_member_role(uuid,uuid)',
      'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      'public.expense_begin_request(uuid,uuid,text,text)',
      'public.expense_finish_request(uuid,uuid,jsonb)',
      'public.expense_identity_request_id(text,uuid)',
      'public.expense_sql159_event_scope_read_only(uuid,uuid)',
      'public.expense_sql159_event_scope_allows(uuid,uuid)',
      'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)',
      'public.teskeid_event_assert_financial_actor(uuid)',
      'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)',
      'public.teskeid_event_finish_request(uuid,uuid,jsonb)',
      'public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
      'public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
      'public.teskeid_event_private_normalize_shared_name_v2(text)',
    ]
    for (const signature of directDependencies) {
      expect(migration).toContain(signature)
      expect(preflight).toContain(signature)
      expect(postflight).toContain(signature)
    }
    const attachArguments = 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text'
    for (const contract of [migration, preflight, postflight]) {
      expect(contract).toContain(attachArguments)
    }
    for (const validation of [preflight, postflight]) {
      expect(validation).toContain('direct_dependencies_exact')
      expect(validation).toContain('pg_catalog.pg_get_function_arguments')
      expect(validation).toContain('protected_baseline_token')
      for (const relation of [
        'expense_private_drafts',
        'expense_unconfirmed_publications',
        'expense_unconfirmed_publication_parties',
        'expense_unconfirmed_publication_audience',
        'expense_groups',
        'expense_group_members',
        'expenses',
        'expense_payments',
        'expense_shares',
        'expense_obligations',
        'teskeid_event_expense_links',
        'expense_mutation_requests',
        'teskeid_event_mutation_requests',
      ]) expect(validation).toContain(`FROM public.${relation}`)
      expect(validation).toContain('pg_catalog.to_jsonb(')
    }
    expect(postflight).toContain('NULL::boolean AS baseline_matches_preflight')
    expect(postflight).toContain('NULL::boolean AS manual_gate_ready')
  })

  it('keeps the relation tuple helper outside every non-one-off save path', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const save = sql.match(
      /CREATE OR REPLACE FUNCTION public\.expense_save_private_draft[\s\S]*?\$function\$;/,
    )?.[0]

    expect(save).toBeTruthy()
    expect(save).toMatch(
      /IF p_context_type = 'one_off' THEN\s+v_incoming_relation := public\.expense_sql162_event_relation_tuple\(p_payload\);\s+END IF;/,
    )
    expect(save).not.toMatch(
      /PERFORM public\.expense_assert_private_draft_context\([\s\S]*?\);\s+v_incoming_relation :=/,
    )
  })

  it('keeps attendance graph diagnosis read-only, classified, and privacy-safe', () => {
    const diagnostic = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/diagnose-attendance-graph.sql',
    ), 'utf8')

    expect(diagnostic).toContain('SET TRANSACTION READ ONLY')
    expect(diagnostic).toContain('SET LOCAL search_path = \'\'')
    expect(diagnostic).toContain('old_graph AS MATERIALIZED')
    expect(diagnostic).toContain('current_graph AS MATERIALIZED')
    expect(diagnostic).toContain('current_only AS MATERIALIZED')
    expect(diagnostic).toContain('owner_branch_classified_separately')
    expect(diagnostic).toContain("'legacy_membership_absent'")
    expect(diagnostic).toContain("'legacy_guest_user_mismatch'")
    expect(diagnostic).toContain("'legacy_user_guest_mismatch'")
    expect(diagnostic).toContain('guest_link_mismatch_count')
    expect(diagnostic).toContain('matching_rsvp_generation_count')
    expect(diagnostic).toContain('matching_rsvp_version_count')
    expect(diagnostic).toContain('current_only_rsvp_state_counts')
    expect(diagnostic).toContain('later_generation_count')
    expect(diagnostic).toContain('duplicate_exact_identity_count')
    expect(diagnostic).toContain('duplicate_active_event_user_count')
    expect(diagnostic).toContain('legacy_subset_current')
    expect(diagnostic).toContain('current_graph_integrity_exact')
    expect(diagnostic).toContain('attendance_authority_compatible')
    expect(diagnostic).toContain('all_current_only_match_current_contract')
    expect(diagnostic).toContain('classification_complete')
    expect(diagnostic).toContain('pg_catalog.md5(')
    expect(diagnostic).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CALL)\b/i,
    )
    expect(diagnostic).not.toContain('recipient_email')
    expect(diagnostic).not.toContain('display_name')
    expect(diagnostic).not.toContain('event_row.name')
    expect(diagnostic).not.toContain('public.profiles')
    expect(diagnostic).not.toContain('auth.users')
    expect(diagnostic).not.toMatch(/jsonb_build_object\(\s*'event_id'/)
  })

  it('freezes the complete protected baseline and exact 22-relation security inventory', () => {
    const validationDirectory = join(
      root,
      'sql/validation/162-event-expense-bidirectional-context',
    )
    const preflight = readFileSync(join(validationDirectory, 'preflight.sql'), 'utf8')
    const diagnostic = readFileSync(
      join(validationDirectory, 'diagnose-preflight.sql'),
      'utf8',
    )
    const postflight = readFileSync(join(validationDirectory, 'postflight.sql'), 'utf8')
    const validations = [preflight, diagnostic, postflight]
    const protectedRelations = [
      'expense_private_drafts',
      'expense_unconfirmed_publications',
      'expense_unconfirmed_publication_parties',
      'expense_unconfirmed_publication_audience',
      'expense_groups',
      'expense_group_members',
      'expenses',
      'expense_payments',
      'expense_shares',
      'expense_obligations',
      'expense_repayments',
      'expense_repayment_allocations',
      'expense_unconfirmed_finalizations',
      'expense_private_draft_tombstones',
      'teskeid_event_expense_links',
      'expense_mutation_requests',
      'teskeid_event_mutation_requests',
    ]
    const securityRelations = [
      'expense_private_drafts',
      'expense_unconfirmed_publications',
      'expense_unconfirmed_publication_parties',
      'expense_unconfirmed_publication_audience',
      'expense_unconfirmed_finalizations',
      'expense_private_draft_tombstones',
      'expense_groups',
      'expense_group_members',
      'expenses',
      'expense_payments',
      'expense_shares',
      'expense_obligations',
      'expense_repayments',
      'expense_repayment_allocations',
      'expense_mutation_requests',
      'teskeid_events',
      'teskeid_event_guests',
      'teskeid_event_mutation_requests',
      'teskeid_event_attendance_memberships',
      'teskeid_event_participations',
      'teskeid_event_participation_rsvp_v3',
      'teskeid_event_expense_links',
    ]

    for (const validation of validations) {
      expect(validation).toContain('relation_security_exact')
      expect(validation).toContain('relation_security_count')
      expect(validation).toContain('relation_security_evidence')
      expect(validation).toContain('relation.relrowsecurity')
      expect(validation).toContain('relation.relforcerowsecurity')
      expect(validation).toContain("pg_catalog.acldefault('r', relation.relowner)")
      expect(validation).toContain('pg_catalog.has_table_privilege(')
      expect(validation).toContain('effective_nonowner_acl_exact')
      expect(validation).toContain('attribute_row.attacl IS NOT NULL')
      expect(validation).toMatch(
        /WHERE CASE\s+WHEN pg_catalog\.current_setting\('server_version_num'\)::integer <\s+checked_privilege\.minimum_version\s+THEN false\s+ELSE pg_catalog\.has_table_privilege\([\s\S]*?\) IS DISTINCT FROM \([\s\S]*?\)\s+END/,
      )
      expect(validation).not.toMatch(
        /WHERE pg_catalog\.current_setting\('server_version_num'\)::integer >=[\s\S]*?checked_privilege\.minimum_version\s+AND pg_catalog\.has_table_privilege\(/,
      )
      for (const relation of protectedRelations) {
        expect(validation).toContain(`FROM public.${relation}`)
      }
      for (const relation of securityRelations) {
        expect(validation).toContain(`('public.${relation}',`)
      }
    }
    expect(new Set(securityRelations)).toHaveLength(22)
    const protectedNames = (validation: string) => [
      ...(validation.match(
        /protected_names\(relation_name\) AS \(VALUES([\s\S]*?)\n\), protected_rows/,
      )?.[1].matchAll(/\('([^']+)'\)/g) ?? []),
    ].map((match) => match[1])
    expect(protectedNames(preflight)).toEqual(protectedRelations)
    expect(protectedNames(diagnostic)).toEqual(protectedRelations)
    expect(protectedNames(postflight)).toEqual(protectedRelations)
    const relationTupleBlock = (validation: string) => validation.match(
      /expected_relation_security\([\s\S]*?\) AS \(VALUES([\s\S]*?)\n\), relation_security_observed/,
    )?.[1].replace(/\s+/g, '')
    expect(relationTupleBlock(preflight)).toBeTruthy()
    expect(relationTupleBlock(diagnostic)).toBe(relationTupleBlock(preflight))
    expect(relationTupleBlock(postflight)).toBe(relationTupleBlock(preflight))
    for (const validation of validations) {
      expect(validation).toContain(
        "('public.expense_repayments',true,false,0,ARRAY['service_role:SELECT']::text[])",
      )
      expect(validation).toContain(
        "('public.expense_repayment_allocations',true,false,0,ARRAY['service_role:SELECT']::text[])",
      )
    }
    expect(preflight).toMatch(
      /relation_security_contract\.relation_security_exact\s+AS lost_response_safe/,
    )
    expect(preflight).toMatch(
      /relation_security_contract\.relation_security_exact AS prerequisites_ok/,
    )
    expect(postflight).toMatch(
      /relation_security_contract\.relation_security_exact\s+AS postconditions_ok/,
    )
  })

  it('documents mutually exclusive initial and lost-response operator states', () => {
    const readme = readFileSync(join(
      root,
      'sql/validation/162-event-expense-bidirectional-context/README.md',
    ), 'utf8')

    expect(readme).toContain('### Normal initial installation')
    expect(readme).toContain('### Lost response / exact installed')
    expect(readme).toContain('`targets_absent = true`')
    expect(readme).toContain('`exact_installed = false`')
    expect(readme).toContain('`lost_response_safe = false`')
    expect(readme).toContain('`prerequisites_ok = true`')
    expect(readme).toContain('Do not rerun the migration')
    expect(readme).toContain('`exact_installed = true`')
    expect(readme).toContain('`lost_response_safe = true`')
    expect(readme).toContain('`operator_state_ok = true`')
    expect(readme).toContain('`relation_security_exact = true`')
  })

  it('keeps SQL157 and SQL159/160 source files unchanged in the SQL162 static bundle', () => {
    const sql157 = readFileSync(join(root, 'sql/157_event_expense_link_visibility.sql'), 'utf8')
    const sql159 = readFileSync(join(
      root,
      'sql/159_expense_unconfirmed_publication_and_finalization.sql',
    ), 'utf8')
    const sql160 = readFileSync(join(
      root,
      'sql/160_expense_sql159_jsonb_input_precedence_fix.sql',
    ), 'utf8')

    expect(sql157).toContain('CREATE FUNCTION public.teskeid_event_attach_expense_v2(')
    expect(sql159).toContain('CREATE FUNCTION public.expense_finalize_private_draft(')
    expect(sql160).toContain('CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft(')
  })
})
