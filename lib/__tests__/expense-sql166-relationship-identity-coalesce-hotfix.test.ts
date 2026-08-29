import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql163Path = 'sql/163_expense_existing_member_relationship_identity.sql'
const sql163 = readFileSync(sql163Path, 'utf8').replace(/\r\n/g, '\n')
const sql163ValidationPath = 'sql/validation/163-expense-existing-member-relationship-identity'
const sql166Path = 'sql/166_expense_relationship_identity_coalesce_hotfix.sql'
const sql166ValidationPath = 'sql/validation/166-expense-relationship-identity-coalesce-hotfix'

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

function bodyAfter(source: string, declaration: string): string {
  const declarationStart = source.indexOf(declaration)
  expect(declarationStart, declaration).toBeGreaterThanOrEqual(0)
  const bodyStartMarker = 'AS $function$'
  const bodyStart = source.indexOf(bodyStartMarker, declarationStart)
  expect(bodyStart, `${declaration} body start`).toBeGreaterThan(declarationStart)
  const contentStart = bodyStart + bodyStartMarker.length
  const bodyEnd = source.indexOf('$function$;', contentStart)
  expect(bodyEnd, `${declaration} body end`).toBeGreaterThan(contentStart)
  return source.slice(contentStart, bodyEnd)
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

const discoveryDeclaration =
  'CREATE FUNCTION public.expense_get_relationship_identity_management_v1'
const mutationDeclaration =
  'CREATE FUNCTION public.expense_bind_member_relationship_identity_v1'
const predecessorBody = bodyAfter(sql163, discoveryDeclaration)
const mutationBody = bodyAfter(sql163, mutationDeclaration)
const invalidToken = 'pg_catalog.coalesce('
const correctedToken = 'COALESCE('
const correctedBody = predecessorBody.replace(invalidToken, correctedToken)

const migration = readOptional(sql166Path)
const preflight = readOptional(`${sql166ValidationPath}/preflight.sql`)
const postflight = readOptional(`${sql166ValidationPath}/postflight.sql`)
const recovery = readOptional(`${sql166ValidationPath}/recovery.sql`)
const readme = readOptional(`${sql166ValidationPath}/README.md`)
const sql163Preflight = readOptional(`${sql163ValidationPath}/preflight.sql`)
const sql163Postflight = readOptional(`${sql163ValidationPath}/postflight.sql`)

describe('SQL166 Relationship identity COALESCE runtime hotfix', () => {
  it('reconstructs the exact broken predecessor and its single invalid token', () => {
    expect(md5(predecessorBody)).toBe('3ac32ce091028d0c73476c88c7fa208f')
    expect(predecessorBody.split(invalidToken)).toHaveLength(2)
    expect(predecessorBody).toContain(
      "pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(",
    )
  })

  it('derives the exact target with one token replacement and no other body delta', () => {
    expect(md5(correctedBody)).toBe('d97158cb09a138b962382747c6badbca')
    expect(correctedBody).not.toContain(invalidToken)
    expect(correctedBody.split(correctedToken)).toHaveLength(2)
    expect(correctedBody.replace(correctedToken, invalidToken)).toBe(predecessorBody)
    expect(correctedBody.length).toBe(
      predecessorBody.length - invalidToken.length + correctedToken.length,
    )
  })

  it('freezes the mutation body and proves SQL163 validators accepted the broken source', () => {
    expect(md5(mutationBody)).toBe('257e4ad0dc53277b984272baadd8a3bf')
    for (const validator of [sql163Preflight, sql163Postflight]) {
      expect(validator).toContain('3ac32ce091028d0c73476c88c7fa208f')
      expect(validator).not.toContain('d97158cb09a138b962382747c6badbca')
      expect(validator).not.toContain(invalidToken)
    }
  })

  it('adds the canonical SQL166 migration and complete operator bundle', () => {
    for (const artifact of [migration, preflight, postflight, recovery, readme]) {
      expect(artifact.length).toBeGreaterThan(0)
    }
    expect(migration).toContain('SELECT pg_catalog.pg_advisory_xact_lock(104166);')
    expect(migration.trimStart().startsWith('-- SQL166:')).toBe(true)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  it('fails closed around exact predecessor, target, contract, ACL and dependencies', () => {
    for (const artifact of [migration, preflight, postflight]) {
      for (const evidence of [
        '3ac32ce091028d0c73476c88c7fa208f',
        'd97158cb09a138b962382747c6badbca',
        '257e4ad0dc53277b984272baadd8a3bf',
        'pg_catalog.pg_get_function_arguments',
        'pg_catalog.aclexplode',
        'EXCEPT ALL',
        'public.expense_active_member_role(uuid,uuid)',
        'public.teskeid_event_expense_participant_sources',
        'public.relationships',
        'auth.users',
        'public.profiles',
      ]) expect(artifact).toContain(evidence)
    }
    expect(migration).toContain('expense_sql166_partial_or_predecessor_drift')
    expect(migration).toContain('expense_sql166_postcondition_failed')
  })

  it('implements exact predecessor-ready, exact-installed and drift-stop gates', () => {
    for (const classification of [
      'PREDECESSOR_READY',
      'EXACT_INSTALLED',
      'STOP_PARTIAL_OR_PREDECESSOR_DRIFT',
    ]) expect(preflight).toContain(classification)
    expect(preflight).toMatch(/^BEGIN TRANSACTION READ ONLY;/)
    expect(preflight.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('invalid_token_absent')
    expect(postflight).toContain('corrected_token_present')
  })

  it('replaces only discovery and leaves mutation, tables, RLS and data untouched', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.expense_get_relationship_identity_management_v1',
    )
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.expense_bind_member_relationship_identity_v1',
    )
    expect(migration).toContain('INTO v_post_mutation_body, v_post_mutation_contract_exact')
    expect(migration).toContain('INTO v_post_dependencies_exact')
    expect(migration).not.toContain('v_post_dependencies_exact := v_dependencies_exact')
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(migration).not.toMatch(/^\s*(CREATE|ALTER|DROP)\s+TABLE\b/im)
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY|CREATE POLICY|DROP POLICY/i)
  })

  it('uses emergency recovery only to disable exact discovery capability', () => {
    const revoke = recovery.indexOf(
      'REVOKE EXECUTE ON FUNCTION public.expense_get_relationship_identity_management_v1',
    )
    expect(recovery).toContain('teskeid.sql166_capability_disable_confirmed')
    expect(recovery).toContain('expense_sql166_recovery_target_mismatch')
    expect(revoke).toBeGreaterThan(recovery.indexOf('expense_sql166_recovery_target_mismatch'))
    expect(recovery).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(recovery).not.toContain(
      'REVOKE EXECUTE ON FUNCTION public.expense_bind_member_relationship_identity_v1',
    )
    expect(recovery).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(readme).toMatch(/does not\s+restore the broken SQL163 predecessor/)
    expect(readme).toContain('optional discovery capability')
  })

  it('rejects inherited browser EXECUTE and proves effective service authority', () => {
    for (const gate of [migration, preflight, postflight]) {
      expect(gate).toMatch(
        /pg_catalog\.has_function_privilege\(\s*roles\.service_role_oid,\s*(?:expected\.function_oid|function_row\.function_oid),\s*'EXECUTE'\s*\)/,
      )
      expect(gate).toMatch(
        /NOT pg_catalog\.has_function_privilege\(\s*roles\.anon_oid,\s*(?:expected\.function_oid|function_row\.function_oid),\s*'EXECUTE'\s*\)/,
      )
      expect(gate).toMatch(
        /NOT pg_catalog\.has_function_privilege\(\s*roles\.authenticated_oid,\s*(?:expected\.function_oid|function_row\.function_oid),\s*'EXECUTE'\s*\)/,
      )
    }
    expect(recovery).toMatch(
      /NOT pg_catalog\.has_function_privilege\(\s*roles\.anon_oid,\s*v_mutation_oid,\s*'EXECUTE'\s*\)/,
    )
    expect(recovery).toMatch(
      /NOT pg_catalog\.has_function_privilege\(\s*roles\.authenticated_oid,\s*v_mutation_oid,\s*'EXECUTE'\s*\)/,
    )
  })

  it('contains no browser grants, schema-cache action or production UUID', () => {
    const artifacts = [migration, preflight, postflight, recovery, readme].join('\n')
    const executableSql = [migration, preflight, postflight, recovery].join('\n')
    expect(artifacts).not.toMatch(/GRANT EXECUTE[^;]+TO\s+(PUBLIC|anon|authenticated)/i)
    expect(executableSql).not.toMatch(/NOTIFY\s+pgrst/i)
    expect(artifacts).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
  })
})
