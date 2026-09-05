import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), 'sql/validation/173-expense-creator-safe-hard-delete')
const read = (name: string) => readFileSync(join(root, name), 'utf8')
const migration = readFileSync(
  join(process.cwd(), 'sql/173_expense_creator_safe_hard_delete.sql'),
  'utf8',
)

function canonicalManifestLines(source: string, kind: 'fk' | 'trigger') {
  return source.split(/\r?\n/)
    .map((line) => line.trim().replace(/[;,]$/, ''))
    .filter((line) => kind === 'fk'
      ? line.startsWith("('public'") && line.includes("'FOREIGN KEY ")
      : /^\('(?:expense|relationship|teskeid)[^']*','[^']*','public\.[^']+\(\)',\d+::smallint,/.test(line))
    .sort()
}

describe('SQL173 operator bundle', () => {
  it.each(['preflight.sql', 'rehearse-migration.sql', 'postflight.sql'])(
    '%s is catalog-only and never invokes runtime deletion',
    (name) => {
      const source = read(name)
      expect(source).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\./i)
      expect(source).not.toMatch(/(?:PERFORM|SELECT)\s+public\.expense_delete_own_unsettled_expense\s*\(/i)
    },
  )

  it('recovery restores only catalog installation and stops after runtime use', () => {
    const recovery = read('recovery.sql')
    const lock = recovery.indexOf('pg_advisory_xact_lock(173, 107)')
    const emptyState = recovery.indexOf(
      'EXISTS (SELECT 1 FROM public.expense_deleted_expense_tombstones)',
    )
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(lock).toBeLessThan(emptyState)
    expect(recovery).toContain('expense_sql173_recovery_runtime_state_present')
    expect(recovery.match(/expense_sql173_recovery_runtime_state_present/g)).toHaveLength(2)
    expect(recovery).toContain('EXISTS (SELECT 1 FROM public.expense_deleted_expense_tombstones)')
    expect(recovery).toContain(
      'DROP FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)',
    )
    expect(recovery).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.(?:expenses|expense_groups|expense_group_members|expense_activity|expense_repayments)\b/i)
    expect(recovery).not.toMatch(/(?:PERFORM|SELECT)\s+public\.expense_delete_own_unsettled_expense\s*\(/i)
    expect(recovery).not.toMatch(/\bDROP\b[^;]+\bCASCADE\b/i)
  })

  it('hardens only the exact legacy relationship_sources ACL overgrant', () => {
    const hardening = read('harden-predecessor-acl.sql')
    expect(hardening).toContain('BEGIN;')
    expect(hardening).toContain('COMMIT;')
    expect(hardening).toContain("pg_catalog.to_regclass('public.relationship_sources')")
    expect(hardening).toContain("pg_catalog.to_regclass('public.expense_mutation_requests')")
    expect(hardening).toContain(
      "acl.grantee = pg_catalog.to_regrole('postgres')::oid",
    )
    expect(hardening).toContain(
      "acl.grantor = pg_catalog.to_regrole('postgres')::oid",
    )
    expect(hardening).toContain('AND NOT acl.is_grantable')
    expect(hardening).toContain('v_total_entries = 16')
    expect(hardening).toContain('v_total_entries = 12')
    expect(hardening).toContain('v_owner_entries = 8')
    expect(hardening).toContain('v_service_dml_entries = 4')
    expect(hardening).toContain('v_service_all_entries = 8')
    expect(hardening).toContain('v_service_all_entries = 4')
    expect(hardening).toContain(
      'expense_sql173_acl_hardening_postcondition_failed',
    )
    expect(hardening).toMatch(
      /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON TABLE public\.relationship_sources\s+FROM service_role;/,
    )
    expect(hardening).not.toMatch(/REVOKE ALL/i)
    expect(hardening).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\./i,
    )
    expect(hardening).not.toMatch(
      /(?:PERFORM|SELECT)\s+public\.expense_delete_own_unsettled_expense\s*\(/i,
    )
  })

  it.each(['preflight.sql', 'rehearse-migration.sql', 'postflight.sql', 'recovery.sql'])(
    '%s freezes the exact SQL173 FK and trigger closure',
    (name) => {
      const source = read(name)
      expect(source).toContain('pg_get_constraintdef')
      expect(source).toContain('relationship_sources_relationship_id_source_type_source_id_key')
      expect(source).toContain('relationship_sources_source_type_check')
      expect(source).toContain('convalidated')
      expect(source).toContain('condeferrable')
      expect(source).toContain('condeferred')
      expect(source).toContain('expected_triggers')
      expect(source).toContain('actual_triggers')
      expect(source).toContain('tgenabled')
      expect(source).toContain('tgconstraint')
      expect(source).toContain('tgdeferrable')
      expect(source).toContain('tginitdeferred')
      expect(source).toContain('tgattr')
      expect(source).toContain('pg_get_triggerdef(trigger_row.oid, false)')
      expect(source).not.toContain(
        'pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid, false)',
      )
      expect(source).toContain("'old.user_idisnotnullandnew.user_idisnull'")
      expect(source).not.toContain('strpos(actual.trigger_definition')
      expect(source).toContain('expense_activity_audience')
      expect(source).toContain('expense_repayment_allocations')
      expect(source).toContain('expected_sql173_function_identities')
      expect(source).toContain('actual.function_oid = pg_catalog.to_regprocedure(expected.signature)')
      expect(source).toContain('expected_private_columns')
      expect(source).toContain('expected_private_constraints')
      expect(source).toContain('expected_private_indexes')
      expect(source).toContain('FULL JOIN actual_private_columns')
      expect(source).toContain('FULL JOIN actual_private_constraints')
      expect(source).toContain('FULL JOIN actual_private_indexes')
      expect(source).toContain('pg_get_indexdef')
      expect(source).toContain('NOT routine.proisstrict')
      expect(source).toContain("pg_catalog.acldefault('r', relation.relowner)")
      expect(source).not.toContain('information_schema.role_table_grants')
      expect(source).not.toMatch(/^\+/m)
      expect(source).toMatch(/(?:count\(\*\)|count\(\*\)\s*)\s*=\s*(?:48|47)/)
      expect(source).toMatch(/(?:count\(\*\)|count\(\*\)\s*)\s*=\s*(?:35|39)/)
    },
  )

  it.each(['preflight.sql', 'rehearse-migration.sql', 'postflight.sql', 'recovery.sql'])(
    '%s carries the canonical 48-FK/39-trigger manifests without drift',
    (name) => {
      const source = read(name)
      const expectedFks = canonicalManifestLines(migration, 'fk')
      const expectedTriggers = canonicalManifestLines(migration, 'trigger')
      expect(expectedFks).toHaveLength(48)
      expect(expectedTriggers).toHaveLength(39)
      expect(canonicalManifestLines(source, 'fk')).toEqual(expectedFks)
      expect(canonicalManifestLines(source, 'trigger')).toEqual(expectedTriggers)
    },
  )

  it('rejects same-name FK/action drift and every trigger inventory drift structurally', () => {
    for (const source of [migration, read('preflight.sql'), read('rehearse-migration.sql'), read('postflight.sql'), read('recovery.sql')]) {
      expect(source).toContain('FULL JOIN actual_fks')
      expect(source).toContain('actual.exact_definition = expected.exact_definition')
      expect(source).toContain('actual.convalidated')
      expect(source).toContain('actual.condeferrable = expected.is_deferrable')
      expect(source).toContain('actual.condeferred = expected.is_initially_deferred')
      expect(source).toContain('FULL JOIN actual_triggers')
      expect(source).toContain("actual.tgenabled = 'O'")
      expect(source).toContain('actual.function_signature = expected.function_signature')
      expect(source).toContain('actual.trigger_type = expected.trigger_type')
      expect(source).toContain('actual.when_expression =')
    }
  })

  it('freezes the PostgreSQL-version-aware predecessor constraint and ACL contract', () => {
    for (const source of [
      migration,
      read('preflight.sql'),
      read('rehearse-migration.sql'),
      read('postflight.sql'),
      read('recovery.sql'),
    ]) {
      expect(source).toContain(
        "('relationship_sources_relationship_id_source_type_source_id_key', 'u', 'UNIQUE (relationship_id, source_type, source_id)', true)",
      )
      expect(source).toContain(
        "('relationship_sources_source_type_check', 'c', 'CHECK ((source_type = ANY (ARRAY[''loans''::text, ''expenses''::text])))', false)",
      )
      expect(source).toContain(
        'constraint_row.connoinherit = expected.no_inherit',
      )
      expect(source).toContain('AND actual.connoinherit')
      expect(source).not.toContain('AND NOT actual.connoinherit')
      expect(source).toContain(
        'CASE WHEN expected.service_dml THEN 12 ELSE 8 END',
      )
      expect(source).toContain(
        "ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']",
      )
    }
  })

  it.each(['preflight.sql', 'rehearse-migration.sql', 'postflight.sql', 'recovery.sql'])(
    '%s freezes the direct-writer provenance guard and private receipt classifier',
    (name) => {
      const source = read(name)
      expect(source).toContain('relationship_sources_expense_live_context_guard')
      expect(source).toContain('public.expense_validate_relationship_source_live_context()')
      expect(source).toContain('public.expense_hard_delete_receipt_shape_known(text,jsonb)')
      expect(source).toContain('expense_mutation_requests')
    },
  )

  it('documents the explicit UI-only runtime boundary and localhost safety', () => {
    const readme = read('README.md')
    expect(readme).toContain('SQL rollout = install capability')
    expect(readme).toContain('UI confirmation = user decides')
    expect(readme).toContain('runtime RPC = delete one exact eligible Expense')
    expect(readme).toContain('## Localhost checks for Stebbi')
    expect(readme).toMatch(/Do not call the deletion RPC\s+from SQL Editor/)
  })
})
