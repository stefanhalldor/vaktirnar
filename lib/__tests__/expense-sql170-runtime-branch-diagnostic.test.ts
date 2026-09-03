import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const diagnosticPath =
  'sql/validation/170-expense-dashboard-presentations/diagnose-runtime-unavailable-branch.sql'
const migrationPath = 'sql/170_expense_dashboard_presentations.sql'

const diagnostic = readFileSync(diagnosticPath, 'utf8').replace(/\r\n/g, '\n')
const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
const targetFunction = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1('),
)
const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'
const publisherStartMarker = '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER'
const publisherEndMarker = '  -- END SAFE CONTROLLED EXCEPTION PUBLISHER'
const fourthHandlerClosureText = '    END;\n  END IF;'
const errorCategoryStartMarker = '  IF v_sqlstate IS NOT NULL THEN'
const fourthHandlerClosureBoundary = `${fourthHandlerClosureText}\n\n${errorCategoryStartMarker}`
const finalReadyBlock = [
  "  IF v_classification = 'diagnostic_ready' THEN",
  "    v_stage := 'complete';",
  '  END IF;',
].join('\n')

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThan(-1)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex + start.length, endIndex)
}

function uniqueIndex(source: string, needle: string): number {
  const first = source.indexOf(needle)
  if (first < 0) throw new Error(`missing structural token: ${needle}`)
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`duplicate structural token: ${needle}`)
  }
  return first
}

function locateControlledPublisher(source: string) {
  const handlerStarts = [...source.matchAll(/^[ \t]*EXCEPTION WHEN OTHERS THEN$/gm)]
    .map((match) => match.index ?? -1)
  if (handlerStarts.length !== 4) throw new Error('expected exactly four stage handlers')
  const fourthHandlerStart = handlerStarts[3]
  const projectionCtesEnd = uniqueIndex(source, '    -- END EXACT SQL170 PROJECTION CTES')
  if (fourthHandlerStart <= projectionCtesEnd) {
    throw new Error('fourth handler is not the projection handler')
  }
  const finalReadyStart = uniqueIndex(source, finalReadyBlock)
  if (finalReadyStart <= fourthHandlerStart) {
    throw new Error('final diagnostic_ready classification must follow the fourth handler')
  }
  const errorCategoryStart = uniqueIndex(source, errorCategoryStartMarker)
  if (errorCategoryStart <= fourthHandlerStart) {
    throw new Error('SQLSTATE classification must follow the fourth handler')
  }
  const boundedHandler = source.slice(fourthHandlerStart, finalReadyStart)
  const boundedClosureStart = boundedHandler.indexOf(fourthHandlerClosureBoundary)
  if (boundedClosureStart < 0) {
    throw new Error('final diagnostic_ready classification must begin after the fourth handler closure')
  }
  if (boundedHandler.indexOf(
    fourthHandlerClosureBoundary,
    boundedClosureStart + fourthHandlerClosureBoundary.length,
  ) >= 0) {
    throw new Error('expected exactly one fourth-handler closure before final classification')
  }
  const fourthHandlerClosureStart = fourthHandlerStart + boundedClosureStart
  const publisherStart = uniqueIndex(source, publisherStartMarker)
  const publisherEnd = uniqueIndex(source, publisherEndMarker)
    + publisherEndMarker.length
  return {
    projectionCtesEnd,
    fourthHandlerStart,
    fourthHandlerClosureStart,
    fourthHandlerClosureEnd: fourthHandlerClosureStart + fourthHandlerClosureText.length,
    errorCategoryStart,
    finalReadyStart,
    finalReadyEnd: finalReadyStart + finalReadyBlock.length,
    publisherStart,
    publisherEnd,
  }
}

function assertControlledPublisherPlacement(source: string): void {
  const position = locateControlledPublisher(source)
  if (!(position.projectionCtesEnd < position.fourthHandlerStart
    && position.fourthHandlerStart < position.fourthHandlerClosureStart)) {
    throw new Error('required handler-classification-publisher order is not exact')
  }
  if (position.publisherStart < position.fourthHandlerClosureEnd) {
    throw new Error('controlled publisher must begin after the fourth/projection handler closure')
  }
  if (!(position.fourthHandlerClosureEnd < position.errorCategoryStart
    && position.errorCategoryStart < position.finalReadyStart)) {
    throw new Error('final diagnostic_ready classification must begin after the fourth handler closure')
  }
  if (!(position.finalReadyStart < position.finalReadyEnd
    && position.finalReadyEnd < position.publisherStart)) {
    throw new Error('controlled publisher must begin after final diagnostic_ready classification')
  }
  if (!/^\nEND;\n\$sql170_runtime_diagnostic\$;\n?$/.test(source.slice(position.publisherEnd))) {
    throw new Error('controlled publisher must be followed directly by the outer DO closure')
  }
}

function movePublisherInsideFourthHandler(source: string): string {
  const position = locateControlledPublisher(source)
  const publisher = source.slice(position.publisherStart, position.publisherEnd)
  const withoutPublisher = source.slice(0, position.publisherStart)
    + source.slice(position.publisherEnd)
  return withoutPublisher.slice(0, position.fourthHandlerClosureStart)
    + publisher
    + '\n'
    + withoutPublisher.slice(position.fourthHandlerClosureStart)
}

function moveFinalReadyInsideFourthHandler(source: string): string {
  const position = locateControlledPublisher(source)
  const finalReady = source.slice(position.finalReadyStart, position.finalReadyEnd)
  const withoutFinalReady = source.slice(0, position.finalReadyStart)
    + source.slice(position.finalReadyEnd)
  return withoutFinalReady.slice(0, position.fourthHandlerClosureStart)
    + finalReady
    + '\n'
    + withoutFinalReady.slice(position.fourthHandlerClosureStart)
}

describe('SQL170 runtime unavailable branch diagnostic template', () => {
  it('is one anonymous DO statement with one typed private actor placeholder', () => {
    expect(diagnostic).toMatch(/^-- SQL170 RUNTIME DIAGNOSTIC TEMPLATE:/)
    expect(diagnostic.match(new RegExp(placeholder, 'g'))).toHaveLength(1)
    expect(diagnostic).toContain(`p_actor_id := '${placeholder}'::uuid;`)
    expect(diagnostic.match(/\bDO \$sql170_runtime_diagnostic\$/g)).toHaveLength(1)
    expect(diagnostic.trimEnd().endsWith('$sql170_runtime_diagnostic$;')).toBe(true)
    expect(diagnostic).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  it('keeps the identity-conflict predicate and projection CTE aligned with SQL170', () => {
    const conflictStart = '    SELECT 1\n    FROM public.expense_group_members AS member'
    const conflictEnd = '  ) THEN'
    expect(between(diagnostic, '-- BEGIN EXACT SQL170 IDENTITY-CONFLICT PREDICATE\n', '\n    -- END EXACT SQL170 IDENTITY-CONFLICT PREDICATE'))
      .toBe(between(targetFunction, '  IF EXISTS (\n', conflictEnd).replace(conflictStart, conflictStart).trimEnd())

    const diagnosticCtes = between(
      diagnostic,
      '    -- BEGIN EXACT SQL170 PROJECTION CTES\n',
      '\n    -- END EXACT SQL170 PROJECTION CTES',
    )
    const migrationCtes = between(targetFunction, '  WITH actor_groups AS (', '\n  SELECT pg_catalog.count(*)::integer,')
    expect(diagnosticCtes).toBe(`WITH actor_groups AS (${migrationCtes}`)

    const diagnosticTerminal = diagnostic.slice(
      diagnostic.indexOf('-- END EXACT SQL170 PROJECTION CTES'),
    )
    const migrationTerminal = targetFunction.slice(
      targetFunction.indexOf('\n  SELECT pg_catalog.count(*)::integer,'),
    )
    const diagnosticProjection = between(
      diagnosticTerminal,
      '    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(',
      '\n  INTO v_candidate_count,',
    )
    const migrationProjection = between(
      migrationTerminal,
      '    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(',
      '\n  INTO v_candidate_count,',
    )
    expect(diagnosticProjection).toBe(migrationProjection)
    expect(diagnostic).toContain('PERFORM public.teskeid_event_assert_session_actor(p_actor_id);')
    expect(diagnostic).toContain('PERFORM public.expense_assert_beta_actor(p_actor_id);')
  })

  it('distinguishes every required branch with bounded evidence', () => {
    for (const classification of [
      'actor_account_admission_failure',
      'actor_beta_admission_failure',
      'member_identity_binding_conflict',
      'invalid_visible_bindings',
      'invalid_visible_publications',
      'invalid_visible_private_edits',
      'candidate_limit_exceeded',
      'duplicate_presentation_keys',
      'execution_exception',
      'diagnostic_ready',
    ]) expect(diagnostic).toContain(`'${classification}'`)

    expect(diagnostic).toContain('LEAST(v_invalid_visible_bindings_count, 101)')
    expect(diagnostic).toContain('LEAST(v_invalid_visible_publications_count, 101)')
    expect(diagnostic).toContain('LEAST(v_invalid_visible_private_edits_count, 101)')
    expect(diagnostic).toContain('LEAST(v_candidate_count, 101)')
    expect(diagnostic).toContain('LEAST(v_distinct_candidate_count, 101)')
    expect(diagnostic).not.toMatch(/pg_catalog\.(?:least|greatest|coalesce|nullif|case)\b/i)
  })

  it('emits one controlled diagnostic exception with an exact safe schema', () => {
    expect(diagnostic.match(/RAISE NOTICE/g)).toBeNull()
    expect(diagnostic.match(/RAISE EXCEPTION/g)).toHaveLength(1)
    const publisher = between(
      diagnostic,
      '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER\n',
      '\n  -- END SAFE CONTROLLED EXCEPTION PUBLISHER',
    )
    const resultSqlState = publisher.match(/ERRCODE = '([^']+)'/)?.[1]
    expect(resultSqlState).toBe('P1701')
    expect(resultSqlState).toMatch(/^[A-Z0-9]{5}$/)
    expect(resultSqlState).not.toBe('00000')
    expect(publisher).toContain('MESSAGE = pg_catalog.jsonb_build_object(')
    expect(publisher).not.toMatch(/\b(?:DETAIL|HINT|CONTEXT)\s*=/i)
    const messageObject = between(
      publisher,
      'MESSAGE = pg_catalog.jsonb_build_object(\n',
      '\n  )::text;',
    )
    for (const key of [
      'diagnostic_contract_version',
      'classification',
      'stage',
      'actor_account_exists',
      'actor_beta_access',
      'identity_binding_conflict',
      'invalid_visible_bindings_count',
      'invalid_visible_publications_count',
      'invalid_visible_private_edits_count',
      'candidate_count',
      'distinct_presentation_key_count',
      'sqlstate',
      'error_category',
    ]) expect(publisher).toContain(`'${key}'`)

    expect([...messageObject.matchAll(/'([^']+)'\s*,/g)].map((match) => match[1])).toEqual([
      'diagnostic_contract_version',
      'classification',
      'stage',
      'actor_account_exists',
      'actor_beta_access',
      'identity_binding_conflict',
      'invalid_visible_bindings_count',
      'invalid_visible_publications_count',
      'invalid_visible_private_edits_count',
      'candidate_count',
      'distinct_presentation_key_count',
      'sqlstate',
      'error_category',
    ])

    expect(publisher).not.toMatch(/p_actor_id|v_discarded_rows|::uuid|'(?:actor_uuid|expense_id|group_id|draft_id|publication_id|title|label|href|amount|email|description|payment|payload)'|SQLERRM/i)

    expect(() => assertControlledPublisherPlacement(diagnostic)).not.toThrow()
  })

  it('rejects moving the controlled publisher inside the fourth handler', () => {
    const unsafePlacement = movePublisherInsideFourthHandler(diagnostic)
    const unsafePosition = locateControlledPublisher(unsafePlacement)
    expect(unsafePlacement.match(/RAISE EXCEPTION/g)).toHaveLength(1)
    expect(unsafePlacement.match(/RAISE NOTICE/g)).toBeNull()
    expect(unsafePosition.publisherStart).toBeGreaterThan(unsafePosition.fourthHandlerStart)
    expect(unsafePosition.publisherStart).toBeLessThan(unsafePosition.fourthHandlerClosureEnd)
    expect(between(
      unsafePlacement,
      `${publisherStartMarker}\n`,
      `\n${publisherEndMarker}`,
    )).toBe(between(
      diagnostic,
      `${publisherStartMarker}\n`,
      `\n${publisherEndMarker}`,
    ))
    expect(() => assertControlledPublisherPlacement(unsafePlacement)).toThrowError(
      'controlled publisher must begin after the fourth/projection handler closure',
    )
  })

  it('rejects moving final classification inside the fourth handler', () => {
    const unsafePlacement = moveFinalReadyInsideFourthHandler(diagnostic)
    const fourthHandlerStart = unsafePlacement.lastIndexOf('EXCEPTION WHEN OTHERS')
    const finalReadyStart = unsafePlacement.indexOf(finalReadyBlock, fourthHandlerStart)
    const fourthHandlerClosureStart = unsafePlacement.indexOf(
      fourthHandlerClosureText,
      fourthHandlerStart,
    )
    expect(finalReadyStart).toBeGreaterThan(fourthHandlerStart)
    expect(finalReadyStart + finalReadyBlock.length).toBeLessThan(fourthHandlerClosureStart)
    expect(unsafePlacement.slice(
      finalReadyStart,
      finalReadyStart + finalReadyBlock.length,
    )).toBe(finalReadyBlock)
    expect(() => assertControlledPublisherPlacement(unsafePlacement)).toThrowError(
      'final diagnostic_ready classification must begin after the fourth handler closure',
    )
  })

  it('retains only SQLSTATE and an allowlisted broad category on caught errors', () => {
    expect(diagnostic.match(/EXCEPTION WHEN OTHERS/g)).toHaveLength(4)
    expect(diagnostic.match(/v_sqlstate := SQLSTATE;/g)).toHaveLength(4)
    expect(diagnostic).not.toMatch(/SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_(DETAIL|HINT|CONTEXT)|GET STACKED DIAGNOSTICS/i)
    for (const category of [
      'data_exception',
      'integrity_constraint',
      'syntax_or_access_rule',
      'insufficient_resources',
      'program_limit',
      'object_state',
      'operator_intervention',
      'internal_error',
      'other',
    ]) expect(diagnostic).toContain(`'${category}'`)
    expect(diagnostic).toContain('QUERY_CANCELED and ASSERT_FAILURE are intentionally not caught by WHEN OTHERS')
  })

  it('contains no mutation, object creation, target invocation, or session-state bridge', () => {
    expect(diagnostic).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|BEGIN TRANSACTION|START TRANSACTION)\b/im)
    expect(diagnostic).not.toMatch(/set_config|current_setting|request\.jwt|SET\s+(LOCAL\s+)?(?:ROLE|SESSION|TRANSACTION|statement_timeout)|CREATE\s+(?:TEMP|TEMPORARY)/i)
    expect(diagnostic).not.toContain('public.expense_list_dashboard_presentations_v1(')
    expect(diagnostic).not.toMatch(/RETURN\s+QUERY/i)
  })
})
