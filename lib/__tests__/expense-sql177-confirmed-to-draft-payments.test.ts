import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const migration = read('sql/177_expense_confirmed_to_draft_payments.sql')
const rehearsal = read(
  'sql/validation/177-expense-confirmed-to-draft-payments/rehearse-migration.sql',
)
const preflight = read(
  'sql/validation/177-expense-confirmed-to-draft-payments/preflight.sql',
)
const postflight = read(
  'sql/validation/177-expense-confirmed-to-draft-payments/postflight.sql',
)

function functionBody(source: string, name: string) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `missing ${name}`).toBeGreaterThanOrEqual(0)
  const delimiter = '$' + 'function' + '$'
  const bodyStart = source.indexOf(`AS ${delimiter}`, start)
  const end = source.indexOf(`${delimiter};`, bodyStart)
  expect(bodyStart, `missing body start for ${name}`).toBeGreaterThanOrEqual(0)
  expect(end, `missing body end for ${name}`).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart + `AS ${delimiter}`.length, end)
}

function installBody(source: string) {
  const match = source.match(
    /-- SQL177 INSTALL BODY START\n([\s\S]*?)\n-- SQL177 INSTALL BODY END/,
  )
  expect(match).not.toBeNull()
  return match?.[1] ?? ''
}

// Hash canonical UTF-8 content; checkout line endings are not artifact identity.
function canonicalLf(source: string) {
  return source.replace(/\r\n?/g, '\n')
}

function canonicalSha256(source: string) {
  return createHash('sha256').update(canonicalLf(source), 'utf8').digest('hex')
}

describe('SQL177 confirmed-to-draft payments contract', () => {
  it.each([preflight, migration, postflight])('rejects nullable function rows before aggregation', (sql) => {
    for (const name of ['predecessor_state', 'target_function_state']) {
      const block = sql.split(`${name} AS MATERIALIZED (`)[1]?.split('\n),')[0] ?? ''
      expect(block).toContain('pg_catalog.bool_and((')
      expect(block).toContain(') IS TRUE), false)')
      expect(block).toContain('routine.oid IS NOT NULL')
    }
    const block = sql.split('target_function_state AS MATERIALIZED (')[1]?.split('\n),')[0] ?? ''
    const expectedConfig = block.match(/routine\.proconfig = ARRAY\['([^']+)'\]::text\[\]/)?.[1]
    expect(expectedConfig).toBe('search_path=""')
    // Bounded three-valued-logic model of the extracted catalog comparison;
    // not a database execution. Other valid function rows must not hide NULL.
    const classify = (config: string[] | null) => {
      const row: boolean | null = config === null ? null
        : config.length === 1 && config[0] === expectedConfig
      return [true, row, true].map((value) => value === true).every(Boolean)
    }
    expect(classify(null)).toBe(false)
    expect(classify(['search_path=public'])).toBe(false)
    expect(classify(['search_path='])).toBe(false)
    expect(classify(['search_path=""'])).toBe(true)
    expect(classify(['search_path=""', 'other_setting=value'])).toBe(false)
    // IS TRUE applies to the entire conjunction, including other nullable fields.
    for (const predicate of [false, null]) {
      expect([true, predicate, true].map((value) => value === true).every(Boolean)).toBe(false)
    }
  })

  it.each([preflight, migration, postflight])('rejects wrong trigger relation and event bits', (sql) => {
    const block = sql.split('target_trigger_state AS MATERIALIZED (')[1]?.split('\n),')[0] ?? ''
    const pairs = [...block.matchAll(/\('(expense_sql177_[^']+)', '(public\.[^']+)'\)/g)]
    expect(pairs).toHaveLength(2)
    expect(block).toContain('trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)')
    const expectedType = Number(block.match(/trigger_row\.tgtype = (\d+)/)?.[1])
    expect(expectedType).toBe(31)
    // Test the exact table/type restrictions extracted above for both triggers.
    for (const [, , expectedTable] of pairs) {
      const accepts = (table: string, type: number) => table === expectedTable && type === expectedType
      expect(accepts(expectedTable!, 31)).toBe(true)
      expect(accepts('public.unrelated_table', 31)).toBe(false)
      for (const wrongType of [30, 29, 7, 15, 23, 63]) {
        expect(accepts(expectedTable!, wrongType)).toBe(false)
      }
    }
  })

  it('uses identical catalog classification in preflight, apply guard and postflight', () => {
    const classification = (sql: string) => {
      const start = sql.indexOf('WITH expected_predecessors')
      const end = sql.indexOf('\nSELECT executor_ok,', start)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThan(start)
      return sql.slice(start, end)
    }
    const common = classification(preflight)
    expect(classification(migration)).toBe(common)
    expect(classification(postflight)).toBe(common)
    expect(common).toContain(`routine.proconfig = ARRAY['search_path=""']::text[]`)
    expect(common).not.toContain(`ARRAY['search_path=']`)
    expect(common).toContain("('expense_sql177_repayment_edit_lock', 'public.expense_repayments')")
    expect(common).toContain("('expense_sql177_settlement_item_edit_lock', 'public.expense_settlement_batch_items')")
    expect(common).toContain('LEFT JOIN pg_catalog.pg_trigger AS trigger_row')
    expect(common).toContain('trigger_row.oid IS NOT NULL')
    expect(common).toContain('pg_catalog.count(*) = 2')
    expect(common).toContain('trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)')
    // PostgreSQL tgtype: ROW | BEFORE | INSERT | DELETE | UPDATE, no other events.
    expect(common).toContain(`trigger_row.tgtype = ${1 | 2 | 4 | 8 | 16}`)
    expect(common).toContain("trigger_row.tgenabled = 'O'")
    expect(common).toContain('trigger_row.tgfoid = pg_catalog.to_regprocedure(')
    expect(common).toContain('trigger_row.tgnargs = 0')
    expect(common).toContain('trigger_row.tgqual IS NULL')
    expect(common).toContain("trigger_row.tgattr = ''::pg_catalog.int2vector")
    expect(common).toContain('trigger_row.tgconstraint = 0')
    expect(migration).toContain('IF v_installation_allowed IS DISTINCT FROM true THEN')
  })

  it('keeps installation forward-only and application-data-nondestructive', () => {
    expect(migration.startsWith('-- SQL177 MIGRATION:')).toBe(true)
    expect(preflight.startsWith('-- SQL177 PREFLIGHT:')).toBe(true)
    expect(rehearsal.startsWith('-- SQL177 REHEARSAL:')).toBe(true)
    expect(postflight.startsWith('-- SQL177 POSTFLIGHT:')).toBe(true)
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE) public\.(?:expenses|expense_private_drafts|expense_edit_revision_bindings|expense_repayments|expense_obligations|expense_payments|expense_shares)\b/i)
    expect(migration).not.toContain("expenses.status = 'revising'")
  })

  it('uses the exact creator and keeps repayment history out of edit-open eligibility', () => {
    const body = functionBody(migration, 'expense_can_open_edit_revision_v1')
    expect(body).toContain('v_expense.created_by IS DISTINCT FROM p_actor_id')
    expect(body).toContain("v_group.status <> 'active'")
    expect(body).not.toContain("v_role NOT IN ('owner', 'admin')")
    expect(body).not.toContain("repayment.status IN ('reported', 'confirmed')")
    expect(body).toContain("RETURN 'ineligible_settlement'")
    expect(functionBody(migration, 'expense_get_edit_revision_state_v1'))
      .toContain("WHEN 'ineligible_settlement' THEN 'settlement'")
  })

  it('uses one edit binding as the financial mutation lock', () => {
    const context = functionBody(
      migration,
      'expense_get_eligible_settlement_context_v1',
    )
    const guard = functionBody(
      migration,
      'expense_guard_edit_revision_financial_mutation_v1',
    )
    expect(context).toMatch(
      /EXISTS \([\s\S]+?expense_edit_revision_bindings AS binding[\s\S]+?binding\.group_id = p_group_id/,
    )
    expect(guard).toContain('expense_edit_revision_bindings AS binding')
    expect(guard).toContain('expense_edit_revision_financial_locked')
    expect(migration).toMatch(
      /CREATE TRIGGER expense_sql177_repayment_edit_lock\nBEFORE INSERT OR UPDATE OR DELETE ON public\.expense_repayments/,
    )
    expect(migration).toMatch(
      /CREATE TRIGGER expense_sql177_settlement_item_edit_lock\nBEFORE INSERT OR UPDATE OR DELETE ON public\.expense_settlement_batch_items/,
    )
  })

  it('projects the edit binding once as a group/Event draft and not confirmed Event activity', () => {
    const group = functionBody(
      migration,
      'expense_list_group_creation_drafts_v1',
    )
    const eventDraft = functionBody(
      migration,
      'teskeid_event_get_expense_pre_active_v2',
    )
    const eventConfirmed = functionBody(
      migration,
      'teskeid_event_get_expense_activity_v3',
    )
    for (const body of [group, eventDraft]) {
      expect(body).toContain('public.expense_edit_revision_bindings AS binding')
      expect(body).toContain("'kind', 'edit_draft'")
      expect(body).toContain("'kind', 'shared_draft'")
    }
    expect(group).toContain("binding.mode = 'private'")
    expect(group).toContain("binding.mode = 'shared'")
    expect(eventDraft).toContain('public.teskeid_event_expense_links AS link')
    expect(eventConfirmed).toMatch(
      /visible_candidates AS MATERIALIZED \([\s\S]+?NOT EXISTS \([\s\S]+?expense_edit_revision_bindings AS edit_binding[\s\S]+?visible_count AS MATERIALIZED/,
    )
  })

  it('keeps edit draft authority exact and active', () => {
    const body = functionBody(migration, 'expense_assert_private_draft_context')
    expect(body).toContain("v_group_status <> 'active'")
    expect(body).toContain('v_expense_created_by IS DISTINCT FROM p_actor_id')
    expect(body).not.toContain("v_role NOT IN ('owner', 'admin')")
  })

  it('keeps migration and rehearsal installation bodies byte-identical', () => {
    expect(installBody(rehearsal)).toBe(installBody(migration))
    expect(rehearsal).toContain('ROLLBACK;')
    expect(rehearsal).toContain('candidate_catalog_verified')
    expect(rehearsal).toContain('predecessor_restored')
    expect(rehearsal).toContain('rehearsal_pass')
  })

  it('pins every installed function source hash to its exact body', () => {
    const expected = new Map([
      ['expense_sql177_edit_draft_summary', '167b94bba5a026ace42be0170932e2cd'],
      ['expense_can_open_edit_revision_v1', '6af21a74dc87da961818814734d5596d'],
      ['expense_get_eligible_settlement_context_v1', 'ceb16d2aaf29fc2e9bd057aeba69e376'],
      ['expense_assert_private_draft_context', '58e08589a18db2a20ff406d22b98ba91'],
      ['expense_get_edit_revision_state_v1', '4033c7f15a7e0dcf9eef6f827d002e02'],
      ['expense_guard_edit_revision_financial_mutation_v1', '247667a7aa6450800ab1f6f0ac612d0a'],
      ['expense_list_group_creation_drafts_v1', 'e29788e5ab52bd15ac05427065168886'],
      ['teskeid_event_get_expense_pre_active_v1', '832083d8dde3c68e56115991f2d29b8e'],
      ['teskeid_event_get_expense_pre_active_v2', 'f890668e54cad0eec483a06f87ad635c'],
      ['teskeid_event_get_expense_activity_v3', '54eea919f2990d0d69dbbc03884e6b69'],
    ])
    for (const [name, hash] of expected) {
      const actual = createHash('md5').update(functionBody(migration, name)).digest('hex')
      expect(actual, name).toBe(hash)
      for (const artifact of [migration, rehearsal, preflight, postflight]) {
        expect(artifact, `${name} hash missing`).toContain(hash)
      }
    }
  })

  it('keeps operator validation read-only and classifies predecessor/installed state', () => {
    for (const artifact of [preflight, postflight]) {
      expect(artifact).toContain('SET TRANSACTION READ ONLY')
      expect(artifact).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
    }
    expect(preflight).toContain("'PREDECESSOR_READY'")
    expect(preflight).toContain("'EXACT_INSTALLED'")
    expect(preflight).toContain("'DRIFT_STOP'")
    expect(postflight).toContain('postconditions_ok')
  })

  // Pinned to LF Git object bytes from base b9e579eda98ac44ab43cf56fc5fd50e5c05d5bc1.
  it.each([
    ['sql/103_expense_revisions_and_recalculation.sql', '627936152401b5219594c4ce71e8b9c7ec9587c27117365b84cca69972ec9c30'],
    ['sql/168_expense_confirmed_edit_revision_lifecycle.sql', 'b36800b2af66b4f8a0c6b6419b72a8c0a518200e9efcdd3343121d7506b7cb91'],
    ['sql/173_expense_creator_safe_hard_delete.sql', '5cc70dcb100b3e4a31cb6744b16319eb96db961fc221c4881edfe3b08143a319'],
    ['sql/175_expense_unified_creator_draft_delete.sql', 'b876812c221bc5c2555c05f6e61768bee68789a536dfcd6627152d5919658ef0'],
    ['sql/176_expense_finalize_receipt_classifier_fix.sql', 'fc4423e04c4c4272575d68e7d88c9b05ffc803f0a668cb8fa72555808f039b60'],
  ])('protects canonical LF predecessor content: %s', (path, expectedHash) => {
    const source = canonicalLf(readFileSync(path, 'utf8'))
    const variants = [source, source.replace(/\n/g, '\r\n'), source.replace(/\n/g, '\r')]
    for (const variant of variants) {
      expect(canonicalSha256(variant)).toBe(expectedHash)
      // Real content changes remain forbidden in every newline representation.
      expect(canonicalSha256('X' + variant.slice(1))).not.toBe(expectedHash)
      expect(canonicalSha256(variant.slice(1))).not.toBe(expectedHash)
      expect(canonicalSha256(variant + 'X')).not.toBe(expectedHash)
    }
  })
})
