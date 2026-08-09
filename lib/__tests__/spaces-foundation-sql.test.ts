import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const withoutLineComments = (sql: string) => sql.replace(/--.*$/gm, '')

const migration = read('sql/29_spaces.sql')
const preflight = read('sql/validation/29-spaces-foundation/preflight.sql')
const postflight = read('sql/validation/29-spaces-foundation/postflight.sql')
const runbook = read('sql/validation/29-spaces-foundation/README.md')
const sql115Runbook = read('sql/validation/115-kviss-authoring/README.md')

describe('SQL29 production personal-space foundation', () => {
  it('is a bounded one-transaction catch-up that fails closed on dependencies or collisions', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'")
    expect(migration).toContain("SET LOCAL statement_timeout = '60s'")
    expect(migration).toContain('SET LOCAL search_path = pg_catalog')
    expect(migration).toContain('spaces_foundation_missing_dependency')
    expect(migration).toContain('spaces_foundation_missing_required_role')
    expect(migration).toContain('spaces_foundation_owner_cannot_bypass_rls')
    expect(migration).toContain('spaces_foundation_authenticated_missing_public_schema_usage')
    expect(migration).toContain('spaces_foundation_collision')
    expect(migration).toMatch(/COMMIT;\s*$/)
    expect(withoutLineComments(migration)).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|TYPE)\b/i)
  })

  it('creates only personal spaces and enforces one personal space per auth user', () => {
    expect(migration).toContain('CREATE TABLE public.spaces')
    expect(migration).toContain('CREATE TABLE public.space_members')
    expect(migration).toContain("CONSTRAINT spaces_type_check CHECK (type = 'personal')")
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX spaces_one_personal_per_user\s+ON public\.spaces \(created_by\)\s+WHERE type = 'personal'/,
    )
    expect(migration).toContain('REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(migration).toContain('REFERENCES public.spaces(id) ON DELETE CASCADE')
  })

  it('keeps both tables default-deny with forced RLS and no direct client or service-role grants', () => {
    expect(migration).toContain('ALTER TABLE public.spaces FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE public.space_members FORCE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.spaces\s+FROM PUBLIC, anon, authenticated, service_role/,
    )
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.space_members\s+FROM PUBLIC, anon, authenticated, service_role/,
    )
    expect(migration).not.toMatch(/GRANT\s+[^;]*\s+ON TABLE public\.(spaces|space_members)/i)
  })

  it('exposes only authenticated membership helpers with fixed empty search paths', () => {
    const statements = withoutLineComments(migration)
    expect(migration).toContain('CREATE FUNCTION public.is_space_member(p_space_id uuid)')
    expect(migration).toContain('CREATE FUNCTION public.ensure_personal_space()')
    expect(statements.match(/SECURITY DEFINER/g)).toHaveLength(2)
    expect(statements.match(/SET search_path = ''/g)).toHaveLength(2)
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.ensure_personal_space() TO authenticated')
    expect(migration).not.toMatch(/GRANT EXECUTE[^;]+TO (PUBLIC|anon|service_role)/i)
  })

  it('creates lazily, handles concurrent first access and repairs the creator owner role', () => {
    expect(migration).toContain('uuid := auth.uid()')
    expect(migration).toMatch(
      /ON CONFLICT \(created_by\) WHERE type = 'personal' DO NOTHING/,
    )
    expect(migration).toMatch(
      /ON CONFLICT \(space_id, user_id\) DO UPDATE\s+SET role = EXCLUDED\.role/,
    )
    expect(migration).toContain("VALUES (v_space_id, v_user_id, 'owner')")
    expect(migration).not.toMatch(/INSERT INTO public\.spaces[\s\S]*SELECT[\s\S]*FROM auth\.users/i)
  })

  it('keeps preflight and postflight read-only and rolls both transactions back', () => {
    for (const validation of [preflight, postflight]) {
      const statements = withoutLineComments(validation)
      expect(statements).toContain('BEGIN;')
      expect(statements).toContain('SET TRANSACTION READ ONLY;')
      expect(statements).toMatch(/ROLLBACK;\s*$/)
      expect(statements).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i,
      )
    }
  })

  it('preflight reports exact dependencies, target collisions, target identity and long transactions', () => {
    expect(preflight).toContain("pg_catalog.to_regclass('auth.users')")
    expect(preflight).toContain("pg_catalog.to_regprocedure('auth.uid()')")
    expect(preflight).toContain("pg_catalog.to_regprocedure('public.teskeid_set_updated_at()')")
    expect(preflight).toContain("pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()')")
    expect(preflight).toContain('execution_role_bypasses_rls')
    expect(preflight).toContain('authenticated_public_schema_usage')
    expect(preflight).toContain('existing_target_relations')
    expect(preflight).toContain('existing_target_functions')
    expect(preflight).toContain('existing_target_triggers')
    expect(preflight).toContain('target_objects_absent')
    expect(preflight).toContain('transactions_older_than_five_minutes')
  })

  it('postflight checks schema, constraints, indexes, RLS, grants, RPC security and owner integrity', () => {
    expect(postflight).toContain('exact_column_counts_ok')
    expect(postflight).toContain('exact_validated_constraints_ok')
    expect(postflight).toContain('one_personal_index_ok')
    expect(postflight).toContain('force_rls_ok')
    expect(postflight).toContain('default_deny_no_policies_ok')
    expect(postflight).toContain('no_direct_table_grants_ok')
    expect(postflight).toContain('authenticated_public_schema_usage_ok')
    expect(postflight).toContain('updated_at_trigger_ok')
    expect(postflight).toContain('function_security_ok')
    expect(postflight).toContain('object_owner_bypasses_rls_ok')
    expect(postflight).toContain('function_execute_scope_ok')
    expect(postflight).toContain('personal_owner_invariant_ok')
    expect(postflight).toContain('personal_owner_violations')
  })

  it('runbook assigns every Supabase action to Stebbi and gates SQL115 on a green postflight', () => {
    expect(runbook).toContain('Only Stebbi may use Supabase or run any SQL')
    expect(runbook).toContain('Codex and Claude Code')
    expect(runbook).toContain('may never connect to the database')
    expect(runbook).toContain('A clean preflight is not apply permission')
    expect(runbook).toContain('Only after green SQL29 postflight should Stebbi rerun the SQL115 preflight')
    expect(sql115Runbook).toMatch(/personal-space foundation must first pass/)
    expect(sql115Runbook).toContain('../29-spaces-foundation/README.md')
    expect(sql115Runbook).toContain('It must not be used as authorization against the')
  })
})
