import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const diagnosticPath =
  'sql/validation/174-expense-dashboard-runtime-diagnostic/diagnose-runtime-unavailable.sql'
const readmePath =
  'sql/validation/174-expense-dashboard-runtime-diagnostic/README.md'
const postflightPath =
  'sql/validation/172-expense-dashboard-private-projection-compatibility/postflight.sql'
const migrationPath =
  'sql/172_expense_dashboard_private_projection_compatibility.sql'
const sql170Path = 'sql/170_expense_dashboard_presentations.sql'

const diagnosticRaw = readFileSync(diagnosticPath, 'utf8')
const diagnostic = diagnosticRaw.replace(/\r\n/g, '\n')
const readme = readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n')
const postflight = readFileSync(postflightPath, 'utf8').replace(/\r\n/g, '\n')
const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
const sql170 = readFileSync(sql170Path, 'utf8').replace(/\r\n/g, '\n')
const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'
const expectedDiagnosticLfSha256 =
  'e5004c175f9e045e89097f234d9ba86a553660fe212ba76f4216dbcee24d9a10'

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThan(-1)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex + start.length, endIndex)
}

function betweenLast(source: string, start: string, end: string): string {
  const startIndex = source.lastIndexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThan(-1)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex + start.length, endIndex)
}

function dollarBody(source: string, tag: string): string {
  return between(source, `$${tag}$`, `$${tag}$`)
}

function replaceExactlyOnce(source: string, before: string, after: string): string {
  expect(occurrences(source, before), before).toBe(1)
  return source.replace(before, () => after)
}

function installedSource(source: string): string {
  return between(source, 'AS $function$', '$function$;')
}

function patchSql172Target(source: string): string {
  let result = source
  for (const [before, tag] of [
    ['  v_rows jsonb;', 'sql172_new_declarations'],
    ["      pg_catalog.btrim(draft.payload->>'title') AS title,", 'sql172_new_private_title'],
    ['      binding.expense_total_minor AS total_minor,', 'sql172_new_private_edit_attention'],
    ['      publication.title, publication.total_minor, publication.currency,', 'sql172_new_shared_attention'],
    ['      expense.title, expense.total_minor, expense.currency,', 'sql172_new_canonical_attention'],
    ["      'title', limited.title,", 'sql172_new_output_attention'],
  ] as const) {
    result = replaceExactlyOnce(result, before, dollarBody(migration, tag))
  }
  for (const [oldTag, newTag] of [
    ['sql172_old_private_from', 'sql172_new_private_from'],
    ['sql172_old_private_normalizer', 'sql172_new_private_normalizer'],
    ['sql172_old_private_visibility', 'sql172_new_private_visibility'],
  ] as const) {
    result = replaceExactlyOnce(
      result,
      dollarBody(migration, oldTag),
      dollarBody(migration, newTag),
    )
  }
  return result
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function compact(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

describe('SQL174 read-only dashboard runtime diagnostic', () => {
  it('is one bounded actor-specific DO statement with one controlled publisher', () => {
    expect(diagnostic).toMatch(/^-- SQL174 DASHBOARD RUNTIME DIAGNOSTIC:/)
    expect(occurrences(diagnostic, placeholder)).toBe(1)
    expect(diagnostic).toContain(`p_actor_id := '${placeholder}'::uuid;`)
    expect(occurrences(diagnostic, 'DO $sql174_dashboard_runtime_diagnostic$')).toBe(1)
    expect(diagnostic.trimEnd().endsWith('$sql174_dashboard_runtime_diagnostic$;')).toBe(true)
    expect(occurrences(diagnostic, 'RAISE EXCEPTION USING')).toBe(1)
    expect(occurrences(diagnostic, "ERRCODE = 'P1741'")).toBe(1)
    expect(diagnostic).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
  })

  it('subsumes the exact SQL172 postflight catalog closure before application reads', () => {
    for (const value of [
      'c27e4db0344e21ff660387dab9b3b36c',
      'f6f261b2f4405afa09c033b7a7b651be',
      'pg_catalog.count(check_row.oid) = 29',
      'pg_catalog.count(class_row.oid) = 17',
      'pg_catalog.count(attribute.attnum) = 31',
      'target_contract_exact',
      'target_acl_exact',
      'target_dependencies_exact',
      'adapter_contract_exact',
      'adapter_acl_exact',
      'adapter_dependencies_exact',
      'helper_lineage_exact',
      'relation_lineage_exact',
    ]) {
      expect(diagnostic).toContain(value)
      expect(postflight).toContain(value)
    }
    const catalogPosition = diagnostic.indexOf("v_stage := 'sql172_catalog'")
    const actorReadPosition = diagnostic.indexOf('FROM auth.users AS account')
    const firstApplicationRead = diagnostic.indexOf('FROM public.expense_group_members AS member', catalogPosition)
    expect(catalogPosition).toBeGreaterThan(-1)
    expect(actorReadPosition).toBeGreaterThan(catalogPosition)
    expect(firstApplicationRead).toBeGreaterThan(actorReadPosition)
    expect(diagnostic).toContain("v_classification := 'catalog_drift'")

    const postflightCatalog = between(postflight, 'WITH\n', '\nSELECT evidence.*,')
    const diagnosticCatalog = between(
      diagnostic,
      '      WITH\n',
      '\n      SELECT COALESCE((',
    ).replace(/^      /gm, '')
    expect(`WITH\n${diagnosticCatalog}`).toBe(`WITH\n${postflightCatalog}`)
  })

  it('forces the exact SQL172 projection CTEs and attention serialization', () => {
    const sql171Target = replaceExactlyOnce(
      installedSource(sql170),
      "|| '|' || party.value->>'party_key_hash'",
      "|| '|' || (party.value->>'party_key_hash')",
    )
    const sql172Target = patchSql172Target(sql171Target)
    const targetCtes = between(sql172Target, 'WITH actor_groups AS (', '\n  SELECT pg_catalog.count(*)::integer,')
    const diagnosticCtes = between(
      diagnostic,
      '    -- BEGIN EXACT SQL174 PROJECTION CTES\n',
      '\n    -- END EXACT SQL174 PROJECTION CTES',
    )
    expect(diagnosticCtes.trimStart()).toBe(`WITH actor_groups AS (${targetCtes}`)
    const serializerStart = 'COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('
    const targetSerializer = betweenLast(
      sql172Target,
      serializerStart,
      '\n  INTO v_candidate_count',
    )
    const diagnosticSerializer = betweenLast(
      diagnostic,
      serializerStart,
      '\n  INTO v_candidate_count',
    )
    expect(diagnosticSerializer).toBe(targetSerializer)
    expect(diagnosticSerializer).toContain("'needs_attention', limited.needs_attention")
    expect(diagnostic).toMatch(
      /INTO v_candidate_count, v_distinct_candidate_count,\n\s+v_invalid_visible_bindings_count, v_invalid_visible_publications_count,\n\s+v_invalid_visible_private_edits_count, v_discarded_rows\n\s+FROM limited;/,
    )
    expect(occurrences(diagnostic, 'v_discarded_rows')).toBe(2)
    expect(diagnostic).toContain("public.expense_sql172_project_private_draft(\n            p_actor_id, draft.id")
    const targetIdentityPredicate = between(
      sql172Target,
      '  IF EXISTS (\n',
      '\n  ) THEN',
    )
    const diagnosticIdentityPredicate = between(
      diagnostic,
      '-- BEGIN EXACT SQL172 IDENTITY-CONFLICT PREDICATE\n',
      '\n    -- END EXACT SQL172 IDENTITY-CONFLICT PREDICATE',
    )
    expect(compact(diagnosticIdentityPredicate)).toBe(compact(targetIdentityPredicate))
    expect(occurrences(diagnostic, 'PERFORM public.teskeid_event_assert_session_actor(p_actor_id);')).toBe(1)
    expect(occurrences(diagnostic, 'PERFORM public.expense_assert_beta_actor(p_actor_id);')).toBe(1)
  })

  it('isolates and caps every helper domain before the residual projection', () => {
    for (const marker of [
      'EXACT SQL174 PRIVATE-CREATION NORMALIZER DOMAIN',
      'EXACT SQL174 LIVE-PUBLICATION NORMALIZER DOMAIN',
      'EXACT SQL174 SETTLEMENT-CONSISTENCY DOMAIN',
    ]) {
      const domain = between(
        diagnostic,
        `      -- BEGIN ${marker}\n`,
        `\n      -- END ${marker}`,
      )
      expect(occurrences(domain, 'LIMIT 101')).toBe(1)
    }
    const liveDomain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL174 LIVE-PUBLICATION NORMALIZER DOMAIN\n',
      '\n      -- END EXACT SQL174 LIVE-PUBLICATION NORMALIZER DOMAIN',
    )
    for (const exactClause of [
      "binding_draft.context_type = 'edit'",
      'binding_draft.expense_id = binding.expense_id',
      'binding_draft.group_id = binding.group_id',
      'binding_draft.actor_user_id = binding.actor_user_id',
      "expense.status = 'active'",
      'publication.actor_user_id = p_actor_id',
      'public.expense_sql159_audience_allows(',
      'draft.actor_user_id = publication.actor_user_id',
      'NOT EXISTS (',
      'binding.draft_id = publication.draft_id',
      'publication.source_draft_version = draft.version',
    ]) expect(liveDomain).toContain(exactClause)
    expect(liveDomain).not.toContain('exact_bindings AS MATERIALIZED')
    expect(liveDomain).not.toContain('actor_relevant_live_publications AS MATERIALIZED')
    expect(diagnostic).toContain('v_private_adapter_contained_count')
    expect(diagnostic).toContain('public.expense_sql172_project_private_draft(\n          p_actor_id, v_probe_draft_id')
    expect(diagnostic).toContain('public.expense_sql159_normalize_private_draft(\n          v_probe_actor_id, v_probe_draft_id, false')
    expect(diagnostic).toContain('public.expense_settlement_eligible_balances_v1(\n          v_probe_group_id, false')
    expect(diagnostic).toContain("WHEN v_stage = 'private_adapter' THEN 'private_adapter_exception'")
    expect(diagnostic).toContain("WHEN v_stage = 'live_publication_normalizer'")
    expect(diagnostic).toContain("WHEN v_stage = 'settlement_helper' THEN 'settlement_helper_exception'")
    for (const predicate of [
      'invalid_visible_bindings',
      'invalid_visible_publications',
      'invalid_visible_private_edits',
    ]) {
      expect(diagnostic).toContain(`SELECT 1 FROM ${predicate} LIMIT 101`)
    }
  })

  it('uses only the fixed branch classifications and bounded P0001 token publisher', () => {
    const fixedClassifications = [
      'catalog_drift',
      'actor_admission',
      'identity_binding_conflict',
      'private_adapter_exception',
      'live_publication_normalizer_exception',
      'settlement_helper_exception',
      'invalid_visible_bindings',
      'invalid_visible_publications',
      'invalid_visible_private_edits',
      'candidate_limit_exceeded',
      'duplicate_presentation_keys',
      'projection_residual_exception',
      'unavailable_not_reproduced',
    ]
    for (const classification of fixedClassifications) {
      expect(diagnostic).toContain(`'${classification}'`)
    }

    const assignmentPattern = /v_classification\s*:=\s*(?:'([^']+)'|CASE([\s\S]*?)END;)/g
    const assignments = [...diagnostic.matchAll(assignmentPattern)]
    expect(assignments).not.toHaveLength(0)
    expect(occurrences(diagnostic, 'v_classification :=')).toBe(assignments.length)
    const assignedClassifications = assignments.flatMap((assignment) => {
      if (assignment[1]) return [assignment[1]]
      return [...assignment[2].matchAll(/(?:THEN|ELSE)\s+'([^']+)'/g)]
        .map((match) => match[1])
    })
    expect([...new Set(assignedClassifications)].sort())
      .toEqual([...fixedClassifications].sort())

    expect(occurrences(diagnostic, 'GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT')).toBe(4)
    expect(occurrences(diagnostic, "ELSE 'unrecognized_p0001'")).toBe(4)
    const tokenAssignments = [
      ...diagnostic.matchAll(/v_p0001_token\s*:=\s*CASE([\s\S]*?)\n\s+END;/g),
    ]
    expect(tokenAssignments).toHaveLength(4)
    expect(occurrences(diagnostic, 'v_p0001_token :=')).toBe(tokenAssignments.length)
    expect(new Set(tokenAssignments.map((assignment) => compact(assignment[1]))).size).toBe(1)
    for (const token of [
      'expense_unconfirmed_invalid_draft',
      'expense_unconfirmed_not_found',
      'expense_unconfirmed_event_unavailable',
      'expense_unconfirmed_source_changed',
      'expense_unconfirmed_duplicate_identity',
      'expense_unconfirmed_author_required',
      'teskeid_event_not_found',
      'teskeid_event_unavailable',
      'unrecognized_p0001',
    ]) expect(tokenAssignments[0][1]).toContain(`'${token}'`)
    expect(tokenAssignments[0][1]).toContain(') THEN v_message')
    const publisher = between(
      diagnostic,
      '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER\n',
      '\n  -- END SAFE CONTROLLED EXCEPTION PUBLISHER',
    )
    expect(publisher).toContain("'p0001_token', v_p0001_token")
    expect(publisher).toContain("v_sqlstate ~ '^[0-9A-Z]{5}$'")
    expect(publisher).not.toMatch(
      /p_actor_id|v_probe_(?:actor|draft|group)_id|v_discarded_rows|v_message|SQLERRM|DETAIL\s*=|HINT\s*=|CONTEXT\s*=/i,
    )
    expect(publisher).not.toMatch(/title|label|payload|amount|timestamp|email|href/i)
  })

  it('contains no mutation, object creation, target invocation or session mutation', () => {
    expect(diagnostic).not.toMatch(
      /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|BEGIN TRANSACTION|START TRANSACTION)\b/im,
    )
    expect(diagnostic).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+(?:public|auth)\.|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+(?:TABLE\s+)?(?:public|auth)\.)/i,
    )
    expect(diagnostic).not.toMatch(
      /set_config|current_setting|request\.jwt|SET\s+(LOCAL\s+)?(?:ROLE|SESSION|TRANSACTION|statement_timeout)|CREATE\s+(?:TEMP|TEMPORARY)/i,
    )
    expect(diagnostic).not.toMatch(
      /(?:PERFORM|SELECT)\s+public\.expense_list_dashboard_presentations_v1\s*\(/i,
    )
    expect(occurrences(diagnostic, 'expense_list_dashboard_presentations_v1')).toBe(2)
    expect(occurrences(diagnostic, 'public.expense_list_dashboard_presentations_v1(uuid)')).toBe(1)
    expect(occurrences(diagnostic, "overload.proname = 'expense_list_dashboard_presentations_v1'")).toBe(1)
  })

  it('documents the exact safe run and STOP contract', () => {
    expect(readme).toContain('one anonymous, read-only `DO` statement')
    expect(readme).toContain('SQLSTATE `P1741`')
    expect(readme).toContain('uncaught `ASSERT_FAILURE`')
    expect(readme).toContain('UNKNOWN / STOP')
    expect(readme).toContain('Do not run a repair from this result')
    expect(readme).toContain('## Localhost checks for Stebbi')
    expect(readme).toContain('Do not')
    expect(readme).toContain('create, share, delete or alter a real Expense')
    expect(readme).toContain('bounded pre-probe domain query or the full')
    expect(sha256(diagnostic)).toBe(expectedDiagnosticLfSha256)
  })
})
