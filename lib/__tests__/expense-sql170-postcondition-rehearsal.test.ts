import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'sql/170_expense_dashboard_presentations.sql',
)
const rehearsalPath = join(
  process.cwd(),
  'sql/validation/170-expense-dashboard-presentations/rehearse-migration-postcondition.sql',
)

function read(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function functionDefinition(source: string) {
  const definition = source.match(
    /CREATE OR REPLACE FUNCTION public\.expense_list_dashboard_presentations_v1\([\s\S]*?\n\$function\$;/,
  )?.[0]
  expect(definition, 'SQL170 target function definition').toBeDefined()
  return definition!
}

function functionBody(source: string) {
  const body = functionDefinition(source).match(
    /\nAS \$function\$\n([\s\S]*?)\n\$function\$;/,
  )?.[1]
  expect(body, 'SQL170 target function body').toBeDefined()
  return body!
}

function installSetup(source: string) {
  const setup = source.match(
    /COMMENT ON FUNCTION public\.expense_list_dashboard_presentations_v1\(uuid\)[\s\S]*?GRANT EXECUTE ON FUNCTION public\.expense_list_dashboard_presentations_v1\(uuid\)\s+TO service_role;/,
  )?.[0]
  expect(setup, 'SQL170 COMMENT/OWNER/ACL setup').toBeDefined()
  return setup!
}

function predecessorGuard(source: string) {
  const guard = source.match(/DO \$preflight\$[\s\S]*?\n\$preflight\$;/)?.[0]
  expect(guard, 'SQL170 inline predecessor guard').toBeDefined()
  return guard!
}

describe('SQL170 migration postcondition diagnostic rehearsal', () => {
  it('rehearses the exact migration target source and install setup', () => {
    const migration = read(migrationPath)
    const rehearsal = read(rehearsalPath)

    expect(functionDefinition(rehearsal)).toBe(functionDefinition(migration))
    expect(installSetup(rehearsal)).toBe(installSetup(migration))
    expect(predecessorGuard(rehearsal)).toBe(predecessorGuard(migration))
    expect(createHash('md5').update(functionBody(rehearsal)).digest('hex')).toBe(
      'cfaacddc089a3b7231ffbf48fb39bfac',
    )
  })

  it('is rollback-only and bounds explicit-transaction failure cleanup', () => {
    const source = read(rehearsalPath)

    expect(source.startsWith('-- SQL170 POSTCONDITION DIAGNOSTIC REHEARSAL:')).toBe(true)
    expect(source.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(source.match(/^ROLLBACK;$/gm)).toHaveLength(1)
    expect(source).not.toMatch(/^COMMIT;$/m)
    expect(source).toContain("SET LOCAL lock_timeout = '5s';")
    expect(source).toContain("SET LOCAL statement_timeout = '30s';")
    expect(source).toContain(
      "SET LOCAL idle_in_transaction_session_timeout = '30s';",
    )
    expect(source).toContain("SET LOCAL transaction_timeout = '60s';")
    expect(source).toContain("SET LOCAL search_path = '';")
    expect(source).toContain('SELECT pg_catalog.pg_advisory_xact_lock(104170);')
    expect(source).toContain('expense_sql170_rehearsal_requires_absent_target')
    expect(source).not.toContain('expense_sql170_postcondition_failed')

    const diagnostic = source.slice(source.lastIndexOf('WITH target AS MATERIALIZED'))
    expect(diagnostic.indexOf('SELECT evidence.*')).toBeGreaterThan(-1)
    expect(diagnostic.indexOf('SELECT evidence.*')).toBeLessThan(
      diagnostic.lastIndexOf('ROLLBACK;'),
    )
    expect(diagnostic).not.toMatch(/\bRAISE\b/i)
  })

  it('returns every granular predicate and observed mismatch value', () => {
    const source = read(rehearsalPath)
    const diagnostic = source.slice(source.lastIndexOf('WITH target AS MATERIALIZED'))

    for (const field of [
      'target_exists',
      'prokind_exact',
      'pronargs_exact',
      'proargnames_exact',
      'proargmodes_exact',
      'arguments_exact',
      'result_exact',
      'volatility_exact',
      'security_definer_exact',
      'strictness_exact',
      'leakproof_exact',
      'parallel_exact',
      'defaults_exact',
      'proconfig_exact',
      'source_hash_exact',
      'owner_exact',
      'language_exact',
      'acl_count_exact',
      'acl_grantees_exact',
      'acl_grantor_exact',
      'acl_privilege_exact',
      'acl_grantable_exact',
      'postcondition_exact',
      'actual_prokind',
      'actual_pronargs',
      'actual_proargnames',
      'actual_proargmodes',
      'actual_arguments',
      'actual_result',
      'actual_volatility',
      'actual_security_definer',
      'actual_is_strict',
      'actual_leakproof',
      'actual_parallel',
      'actual_default_count',
      'actual_proconfig',
      'actual_source_md5_raw',
      'actual_source_md5_normalized',
      'actual_owner',
      'actual_language',
      'actual_acl_entry_count',
      'actual_acl_grantees',
      'actual_acl_grantors',
      'actual_acl_privileges',
      'actual_acl_grantables',
      'actual_acl_exploded',
    ]) {
      expect(diagnostic, field).toContain(field)
    }
    expect(diagnostic).not.toMatch(/\bAS actual_source_md5\b/)
  })

  it('observes catalogs only and never calls the rehearsed target', () => {
    const source = read(rehearsalPath)
    const afterDefinition = source.slice(source.indexOf('\n$function$;') + 12)
    const diagnostic = source.slice(source.lastIndexOf('WITH target AS MATERIALIZED'))

    expect(diagnostic).not.toMatch(/(?:FROM|JOIN)\s+public\./i)
    expect(afterDefinition).not.toMatch(
      /(?:SELECT|PERFORM)\s+(?:\*\s+FROM\s+)?public\.expense_list_dashboard_presentations_v1\s*\(/i,
    )
    expect(source).not.toMatch(
      /^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+)/im,
    )
    expect(source.match(/^CREATE OR REPLACE FUNCTION /gm)).toHaveLength(1)
    expect(source.match(/^REVOKE ALL ON FUNCTION /gm)).toHaveLength(1)
    expect(source.match(/^GRANT EXECUTE ON FUNCTION /gm)).toHaveLength(1)
  })

  it('normalizes role names to text before building exact ACL evidence', () => {
    const source = read(rehearsalPath)
    const diagnostic = source.slice(source.lastIndexOf('WITH target AS MATERIALIZED'))

    expect(diagnostic).toContain(
      "COALESCE(grantee_role.rolname::text, 'PUBLIC') AS grantee",
    )
    expect(diagnostic).toContain(
      "COALESCE(grantor_role.rolname::text, '<missing>') AS grantor",
    )
    expect(diagnostic).not.toContain(
      "COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee",
    )
    expect(diagnostic).not.toContain(
      "COALESCE(grantor_role.rolname, '<missing>') AS grantor",
    )
    expect(diagnostic).toContain(
      "acl_state.actual_acl_grantees = ARRAY['postgres','service_role']::text[]",
    )
    expect(diagnostic).toContain('AS actual_acl_grantees')
    expect(diagnostic).toContain('AS actual_acl_grantors')
    expect(diagnostic).toContain('AS actual_acl_exploded')
  })
})
