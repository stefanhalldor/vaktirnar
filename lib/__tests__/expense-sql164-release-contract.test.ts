import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'sql/164_expense_single_edit_draft_identity.sql'
const validationPath = 'sql/validation/164-expense-single-edit-draft'
const migration = readFileSync(migrationPath, 'utf8')

function withoutLineComments(sql: string) {
  return sql.replace(/^\s*--.*$/gm, '')
}

function saveFunctionBody(sql: string) {
  const source = sql.match(
    /CREATE OR REPLACE FUNCTION public\.expense_save_private_draft\([\s\S]*?AS \$function\$(\r?\n[\s\S]*?\r?\n)\$function\$;/,
  )?.[1]
  if (!source) throw new Error('SQL164 save function body missing')
  return source.replace(/\r\n/g, '\n')
}

describe('SQL164 release contract', () => {
  it('normalizes predecessor source line endings exactly like preflight', () => {
    const preflight = readFileSync(`${validationPath}/preflight.sql`, 'utf8')
    expect(preflight).toContain(
      "pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n')) AS source_hash",
    )
    expect(migration).toContain(
      "pg_catalog.md5(pg_catalog.replace(proc.prosrc, E'\\r\\n', E'\\n'))",
    )
    expect(migration).not.toContain('pg_catalog.md5(proc.prosrc)')
  })

  it('fails closed on duplicates and adds only the exact partial unique invariant', () => {
    expect(migration).toContain("RAISE EXCEPTION 'expense_duplicate_edit_drafts_require_separate_cleanup'")
    expect(migration).toContain('CREATE UNIQUE INDEX expense_private_drafts_one_edit_per_actor_expense_idx')
    expect(migration).toContain('ON public.expense_private_drafts (actor_user_id, expense_id)')
    expect(migration).toContain("WHERE context_type = 'edit'")
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.expense_private_drafts/i)
    expect(migration).not.toMatch(/UPDATE\s+public\.(expenses|expense_payments|expense_shares|expense_obligations)/i)
  })

  it('serializes initial edit saves and reuses the canonical identity before payload write', () => {
    const body = saveFunctionBody(migration)
    expect(body).toContain("IF p_context_type = 'edit' THEN")
    expect(body).toContain('pg_catalog.pg_advisory_xact_lock(')
    expect(body).toContain("drafts.context_type = 'edit'")
    expect(body).toContain('drafts.actor_user_id = p_actor_id')
    expect(body).toContain('drafts.expense_id = p_expense_id')
    expect(body).toMatch(/v_row\.id = p_draft_id[\s\S]*?v_row\.payload <> p_payload[\s\S]*?RAISE EXCEPTION 'expense_draft_conflict'/)
    expect(body).toMatch(/IF v_row\.id IS NOT NULL THEN[\s\S]*?RETURN QUERY SELECT v_row\.id, v_row\.version, v_row\.updated_at;[\s\S]*?RETURN;/)
    expect(body.indexOf('IF v_row.id IS NOT NULL THEN')).toBeLessThan(
      body.indexOf('INSERT INTO public.expense_private_drafts'),
    )
  })

  it('preserves function authority and pins the PostgreSQL source hash in every validator', () => {
    const body = saveFunctionBody(migration)
    const hash = createHash('md5').update(body).digest('hex')
    expect(migration).toContain('RETURNS TABLE(draft_id uuid, draft_version bigint, saved_at timestamptz)')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('SET search_path = pg_catalog, public')
    expect(migration).toContain('TO service_role;')
    for (const validator of ['preflight.sql', 'postflight.sql', 'recovery.sql']) {
      expect(readFileSync(`${validationPath}/${validator}`, 'utf8')).toContain(hash)
    }
  })

  it('keeps preflight exact-state aware and recovery non-destructive', () => {
    const preflight = readFileSync(`${validationPath}/preflight.sql`, 'utf8')
    const postflight = readFileSync(`${validationPath}/postflight.sql`, 'utf8')
    const recovery = readFileSync(`${validationPath}/recovery.sql`, 'utf8')
    expect(preflight).toContain('HAVING count(*) > 1')
    expect(preflight).toContain('pass_no_duplicate_edit_identity')
    for (const sql of [preflight, postflight]) {
      expect(sql).toContain('indisvalid')
      expect(sql).toContain('indisready')
      expect(sql).toContain("access_method.amname = 'btree'")
      expect(sql).toContain("table_class.relname = 'expense_private_drafts'")
      expect(sql).toContain('pg_catalog.pg_get_function_arguments')
      expect(sql).toContain('pg_catalog.pg_get_function_result')
      expect(sql).toContain('pronargdefaults = 1')
      expect(sql).toContain('proargmodes')
      expect(sql).toContain('pg_catalog.aclexplode')
      expect(sql).toContain('pg_catalog.has_function_privilege')
      expect(sql).toContain("grantee_role.rolname = 'service_role'")
      expect(sql).toMatch(/privilege\.grantee = (routine|routine_state)\.proowner/)
    }
    expect(preflight).toContain('PARTIAL_OR_DRIFTED_STOP')
    expect(preflight).toContain('named_index_object AS MATERIALIZED')
    expect(preflight).toMatch(/FROM pg_catalog\.pg_class AS named_object[\s\S]*?LEFT JOIN pg_catalog\.pg_index AS index_row/)
    expect(recovery).toContain('REVOKE ALL ON FUNCTION public.expense_save_private_draft')
    const revokeIndex = recovery.indexOf('REVOKE ALL ON FUNCTION public.expense_save_private_draft')
    expect(recovery.indexOf('expense_sql164_recovery_installed_state_drift')).toBeLessThan(revokeIndex)
    const executableRecovery = withoutLineComments(recovery)
    expect(executableRecovery.slice(0, executableRecovery.indexOf(
      'REVOKE ALL ON FUNCTION public.expense_save_private_draft',
    ))).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+|DROP\s+|GRANT\s+|REVOKE\s+)/i)
    expect(executableRecovery).not.toMatch(
      /\b(DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+(TABLE|INDEX|FUNCTION|SCHEMA))\b/i,
    )
  })

  it('freezes the observed public-schema catalog contract everywhere', () => {
    const preflight = readFileSync(`${validationPath}/preflight.sql`, 'utf8')
    const postflight = readFileSync(`${validationPath}/postflight.sql`, 'utf8')
    const recovery = readFileSync(`${validationPath}/recovery.sql`, 'utf8')
    for (const sql of [preflight, postflight, recovery]) {
      expect(sql).toContain('schema_acl_exact')
      expect(sql).toContain("owner_name = 'pg_database_owner'")
      expect(sql).toContain('state.schema_oid = 2200::oid')
      expect(sql).toContain('state.owner_oid = 6171::oid')
      expect(sql).toContain('server_version_num')
      expect(sql).toContain('170006')
      expect(sql).toContain('stored_acl_is_null')
      expect(sql).toContain('pg_catalog.aclexplode')
      expect(sql).toContain('pg_catalog.has_schema_privilege')
      for (const roleName of ['PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres']) {
        expect(sql).toContain(`'${roleName}'`)
      }
    }
  })
})
