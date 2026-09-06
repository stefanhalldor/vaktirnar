import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql159Path = 'sql/159_expense_unconfirmed_publication_and_finalization.sql'
const migrationPath = 'sql/174_expense_sql159_event_shared_precedence_fix.sql'
const validationRoot =
  'sql/validation/174-expense-sql159-event-shared-precedence-fix'
const preflightPath = `${validationRoot}/preflight.sql`
const rehearsalPath = `${validationRoot}/rehearse-migration.sql`
const postflightPath = `${validationRoot}/postflight.sql`
const recoveryPath = `${validationRoot}/recovery.sql`
const readmePath = `${validationRoot}/README.md`
const frozenDiagnosticPath =
  'sql/validation/174-expense-dashboard-runtime-diagnostic/diagnose-runtime-unavailable.sql'

const sql159 = normalized(sql159Path)
const migration = normalized(migrationPath)
const preflight = normalized(preflightPath)
const rehearsal = normalized(rehearsalPath)
const postflight = normalized(postflightPath)
const recovery = normalized(recoveryPath)
const readme = normalized(readmePath)
const frozenDiagnosticBytes = readFileSync(frozenDiagnosticPath)

const oldToken = "candidate.value->'shared' - ARRAY"
const newToken = "(candidate.value->'shared') - ARRAY"
const predecessorHash = '18a6e628bdb1d3c175b515541ab56787'
const installedHash = '9d703deec837fbffed4add9cf8b97b56'
const frozenDiagnosticSha256 =
  'e5004c175f9e045e89097f234d9ba86a553660fe212ba76f4216dbcee24d9a10'

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function md5(source: string): string {
  return createHash('md5').update(source).digest('hex')
}

function sha256(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex')
}

function normalizerBody(source: string): string {
  const signature =
    'CREATE FUNCTION public.expense_sql159_normalize_private_draft('
  const functionStart = source.indexOf(signature)
  expect(functionStart).toBeGreaterThan(-1)
  const bodyStartMarker = 'AS $function$'
  const bodyStart = source.indexOf(bodyStartMarker, functionStart)
  expect(bodyStart).toBeGreaterThan(functionStart)
  const bodyEnd = source.indexOf('$function$;', bodyStart + bodyStartMarker.length)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart + bodyStartMarker.length, bodyEnd)
}

function expectInOrder(source: string, values: readonly string[]): void {
  let cursor = -1
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1)
    expect(next, value).toBeGreaterThan(cursor)
    cursor = next
  }
}

function expectNoApplicationMutation(source: string): void {
  const executable = source.replace(/^\s*--.*$/gm, '')
  expect(executable).not.toMatch(
    /\b(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE)\b/i,
  )
  expect(executable).not.toMatch(
    /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|TYPE|TRIGGER|POLICY)\b/i,
  )
  expect(executable).not.toMatch(/\b(?:GRANT|REVOKE)\b/i)
}

function expectExactNormalizerMetadataGate(source: string): void {
  for (const fragment of [
    "routine.prokind = 'f'",
    'routine.pronargs = 3',
    "'p_actor_id','p_draft_id','p_require_balanced'",
    "= 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean'",
    "= 'jsonb'::pg_catalog.regtype",
    'NOT routine.proretset',
    "routine.provolatile = 'v'::\"char\"",
    'routine.prosecdef',
    'NOT routine.proisstrict',
    'NOT routine.proleakproof',
    "routine.proparallel = 'u'::\"char\"",
    'routine.pronargdefaults = 0',
    'routine.proargdefaults IS NULL',
    'routine.proallargtypes IS NULL',
    'routine.provariadic = 0::oid',
    'routine.procost = 100',
    'routine.prorows = 0',
    'routine.prosupport = 0::oid',
    'routine.protrftypes IS NULL',
    'routine.probin IS NULL',
    'routine.prosqlbody IS NULL',
    "routine.proconfig = ARRAY['search_path=\"\"']::text[]",
  ]) {
    expect(source, fragment).toContain(fragment)
  }
  expect(source).toMatch(/(?:routine|language_row)\.lanname = 'plpgsql'/)
  expect(source).toMatch(/(?:routine\.owner_name|owner_role\.rolname) = 'postgres'/)
}

function expectLockAndOidOrder(source: string): void {
  expectInOrder(source, [
    "current_user <> 'postgres' OR session_user <> 'postgres'",
    'pg_try_advisory_xact_lock(159159)',
    'pg_try_advisory_xact_lock(159160)',
    'pg_try_advisory_xact_lock(104170)',
    'pg_try_advisory_xact_lock(104171)',
    'pg_try_advisory_xact_lock(104172)',
    'pg_try_advisory_xact_lock(104174)',
    'v_function_oid := pg_catalog.to_regprocedure(',
  ])
}

function expectExactConsumerGate(source: string): void {
  for (const fragment of [
    'public.expense_list_dashboard_presentations_v1(uuid)',
    'public.expense_sql172_project_private_draft(uuid,uuid)',
    'c27e4db0344e21ff660387dab9b3b36c',
    'f6f261b2f4405afa09c033b7a7b651be',
    "ARRAY['p_actor_id']::text[]",
    "ARRAY['p_actor_id','p_draft_id']::text[]",
    "'p_actor_id uuid, p_draft_id uuid'",
    'observed.proargmodes IS NULL',
    "observed.prorettype = 'jsonb'::pg_catalog.regtype",
    'NOT observed.proretset',
    "observed.provolatile = 'v'::\"char\"",
    'NOT observed.proisstrict',
    'NOT observed.proleakproof',
    "observed.proparallel = 'u'::\"char\"",
    'observed.protrftypes IS NULL',
    'observed.probin IS NULL',
    'observed.prosqlbody IS NULL',
    "privilege_row.privilege_type = 'EXECUTE'",
    "dependency.deptype = 'n'::\"char\"",
  ]) {
    expect(source, fragment).toContain(fragment)
  }
}

function expectExactConsumerSnapshots(source: string): void {
  const statement = (target: string): string => {
    const into = source.indexOf(`INTO ${target}`)
    expect(into, target).toBeGreaterThan(-1)
    const start = source.lastIndexOf('SELECT pg_catalog.jsonb_agg(', into)
    expect(start, target).toBeGreaterThan(-1)
    const end = source.indexOf(';', into)
    expect(end, target).toBeGreaterThan(into)
    return source.slice(start, end + 1)
  }
  const before = statement('v_consumer_snapshot')
  const after = statement('v_post_consumer_snapshot').replace(
    'v_post_consumer_snapshot',
    'v_consumer_snapshot',
  )
  expect(after).toBe(before)
  for (const fragment of [
    "'catalog', pg_catalog.to_jsonb(routine)",
    "'language', language_row.lanname",
    "'owner', owner_role.rolname",
    "'comment', pg_catalog.obj_description(routine.oid, 'pg_proc')",
    "'dependencies', (",
    'JOIN pg_catalog.pg_language AS language_row',
    'JOIN pg_catalog.pg_roles AS owner_role',
  ]) expect(before, fragment).toContain(fragment)
}

describe('SQL174 Event shared JSONB precedence forward-fix', () => {
  it('derives the exact two-token repair from the frozen SQL159 normalizer', () => {
    const predecessor = normalizerBody(sql159)
    expect(md5(predecessor)).toBe(predecessorHash)
    expect(occurrences(predecessor, oldToken)).toBe(2)
    expect(occurrences(predecessor, newToken)).toBe(0)

    // SQL160 already repaired the analogous six member-input expressions.
    expect(occurrences(predecessor, "member.value->'input' - ARRAY")).toBe(0)
    expect(occurrences(predecessor, "(member.value->'input') - ARRAY")).toBe(6)

    const installed = predecessor.replaceAll(oldToken, newToken)
    expect(md5(installed)).toBe(installedHash)
    expect(occurrences(installed, oldToken)).toBe(0)
    expect(occurrences(installed, newToken)).toBe(2)
    expect(installed).not.toMatch(/->'[^']+'\s*-\s*ARRAY/)
    expect(Buffer.byteLength(installed) - Buffer.byteLength(predecessor)).toBe(4)
    expect(installed.replaceAll(newToken, oldToken)).toBe(predecessor)
  })

  it('ships one atomic, idempotent, metadata-preserving forward migration', () => {
    expect(occurrences(migration, 'DO $sql174_event_shared_precedence_fix$')).toBe(1)
    expect(migration.trimEnd().endsWith('$sql174_event_shared_precedence_fix$;')).toBe(true)
    expect(migration).not.toMatch(/^\s*(?:BEGIN|COMMIT);/m)
    expectLockAndOidOrder(migration)
    expectInOrder(migration, [
      "v_state := 'PREDECESSOR_READY'",
      "v_state := 'EXACT_INSTALLED'",
      "IF v_state = 'PREDECESSOR_READY' THEN",
      'CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft',
      "RAISE EXCEPTION 'expense_sql174_postcondition_failed'",
    ])
    expect(migration).toContain(
      'v_fixed_source := pg_catalog.replace(v_source, v_old_token, v_new_token)',
    )
    expect(migration).toContain(
      'pg_catalog.replace(v_fixed_source, v_new_token, v_old_token)',
    )
    expect(migration).toContain(predecessorHash)
    expect(migration).toContain(installedHash)
    expect(migration).toContain("v_old_count = 2 AND v_new_count = 0")
    expect(migration).toContain("v_old_count = 0 AND v_new_count = 2")
    expect(migration).toContain("'catalog', pg_catalog.to_jsonb(routine)")
    expect(migration).toContain('v_post_consumer_snapshot IS NOT DISTINCT FROM v_consumer_snapshot')
    expectExactNormalizerMetadataGate(migration)
    expectExactConsumerGate(migration)
    expectExactConsumerSnapshots(migration)
    expectNoApplicationMutation(migration)
    expect(migration).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public|auth)\./i)
    expect(migration).not.toMatch(/\b(?:ALTER\s+FUNCTION|DROP\s+FUNCTION)\b/i)
  })

  it('keeps mandatory preflight and postflight catalog-only and fail closed', () => {
    for (const gate of [preflight, postflight]) {
      expect(gate).not.toContain('DO $')
      expect(gate).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public|auth)\./i)
      expect(gate).not.toMatch(/__STEBBI_[A-Z0-9_]+__/)
      expectNoApplicationMutation(gate)
      expectExactNormalizerMetadataGate(gate)
      expectExactConsumerGate(gate)
      expect(gate).toContain('expense_list_dashboard_presentations_v1(uuid)')
      expect(gate).toContain('expense_sql172_project_private_draft(uuid,uuid)')
    }
    expect(preflight).toContain(predecessorHash)
    expect(preflight).toContain(installedHash)
    expect(preflight).toContain("THEN 'PREDECESSOR_READY'")
    expect(preflight).toContain("THEN 'EXACT_INSTALLED'")
    expect(preflight).toContain("ELSE 'DRIFT_STOP'")
    expect(preflight).toContain('AS operator_state_ok')
    expect(preflight).toContain('AS prerequisites_ok')

    expect(postflight).not.toContain(predecessorHash)
    expect(postflight).toContain(installedHash)
    expect(postflight).toContain('catalog_state.catalog_exact AS postconditions_ok')
    expect(postflight).toMatch(
      /\), catalog_state AS MATERIALIZED \([\s\S]*?FROM normalizer_state\s+CROSS JOIN consumer_state\s+\)\s+SELECT current_user/,
    )
    expect(postflight).not.toContain('runtime_state AS MATERIALIZED')
    expect(postflight).not.toMatch(
      /\n\s+public\.expense_list_dashboard_presentations_v1\s*\(/,
    )
    expect(postflight).not.toContain('__STEBBI_PRIVATE_ACTOR_UUID__')
  })

  it('rehearses only catalog/function DDL and proves rollback plus both expressions', () => {
    expect(occurrences(rehearsal, 'DO $sql174_rehearsal$')).toBe(1)
    expect(rehearsal.trimEnd().endsWith('$sql174_rehearsal$;')).toBe(true)
    expectLockAndOidOrder(rehearsal)
    expectInOrder(rehearsal, [
      'v_function_oid := pg_catalog.to_regprocedure(',
      'INTO v_normalizer_metadata_snapshot',
      'CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft',
      'INTO v_inside_normalizer_metadata_snapshot',
      "ERRCODE = 'P1742'",
      "WHEN SQLSTATE 'P1742' THEN",
      'INTO v_post_normalizer_metadata_snapshot',
      "ERRCODE = 'P1740'",
    ])
    expect(rehearsal).toContain(predecessorHash)
    expect(rehearsal).toContain(installedHash)
    expect(rehearsal).toContain("'{\"shared\":{\"label_state\":\"resolved\"")
    expect(rehearsal).toContain("'{\"shared\":{\"access_state\":\"active\"")
    for (const field of [
      'installation_rolled_back',
      'forced_rollback_seen',
      'organizer_expression_exact',
      'guest_expression_exact',
      'consumers_unchanged',
      'failure_sqlstate',
      'rehearsal_pass',
    ]) {
      expect(rehearsal).toContain(`'${field}'`)
    }
    expect(rehearsal).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public|auth)\./i)
    expect(rehearsal).not.toMatch(/\bPERFORM\s+public\./i)
    expectExactNormalizerMetadataGate(rehearsal)
    expectExactConsumerGate(rehearsal)
    expectExactConsumerSnapshots(rehearsal)
    expectNoApplicationMutation(rehearsal)
    const publishedResult = rehearsal.slice(rehearsal.lastIndexOf('RAISE EXCEPTION USING'))
    expect(publishedResult).not.toMatch(
      /SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_|v_(?:source|message|function_oid|probe_actor_id|probe_draft_id|probe_group_id)|\bUUID\b/i,
    )
  })

  it('keeps recovery an exact, separately gated reverse with full snapshots', () => {
    expect(occurrences(recovery, 'DO $sql174_recovery$')).toBe(1)
    expect(recovery.trimEnd().endsWith('$sql174_recovery$;')).toBe(true)
    expect(recovery).toContain("v_state := 'EXACT_INSTALLED'")
    expect(recovery).toContain("v_state := 'PREDECESSOR_READY'")
    expect(recovery).toContain("IF v_state = 'EXACT_INSTALLED' THEN")
    expectLockAndOidOrder(recovery)
    expectInOrder(recovery, [
      'v_function_oid := pg_catalog.to_regprocedure(',
      'INTO v_normalizer_metadata_snapshot',
      'CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft',
      'INTO v_post_normalizer_metadata_snapshot',
    ])
    expect(recovery).toContain(
      'v_recovered_source := pg_catalog.replace(v_source, v_new_token, v_old_token)',
    )
    expect(recovery).toContain(
      'pg_catalog.replace(v_recovered_source, v_old_token, v_new_token)',
    )
    expect(recovery).toContain("'catalog_without_source', pg_catalog.to_jsonb(routine) - 'prosrc'")
    expect(recovery).toContain("'catalog', pg_catalog.to_jsonb(routine)")
    expect(recovery).toMatch(
      /v_post_consumer_snapshot\s+IS NOT DISTINCT FROM v_consumer_snapshot/,
    )
    expect(recovery).toContain("RAISE EXCEPTION 'expense_sql174_recovery_target_drift'")
    expect(recovery).toContain("RAISE EXCEPTION 'expense_sql174_recovery_postcondition_failed'")
    expectExactNormalizerMetadataGate(recovery)
    expectExactConsumerGate(recovery)
    expectExactConsumerSnapshots(recovery)
    expectNoApplicationMutation(recovery)
    expect(recovery).not.toMatch(/\b(?:FROM|JOIN)\s+(?:public|auth)\./i)
  })

  it('preserves the prior diagnostic as immutable historical evidence', () => {
    expect(sha256(frozenDiagnosticBytes)).toBe(frozenDiagnosticSha256)
    expect(readme).toContain('Do not rerun the frozen')
    expect(readme).toContain('not current-state postflight or')
    expect(readme).toContain('100% catalog-only')
    expect(readme).toContain('requires no User')
    expect(readme).toContain('Never run recovery automatically')
    expect(readme).toContain('## Localhost checks for Stebbi')
    expect(readme).toContain('this step is not read-only')
  })
})
