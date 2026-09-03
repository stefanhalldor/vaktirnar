import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const validationRoot = join(
  process.cwd(),
  'sql/validation/170-expense-dashboard-presentations',
)
const operatorPath = join(validationRoot, 'harden-predecessor-acl.sql')

function read(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function compact(value: string) {
  return value.replace(/\s+/g, '')
}

describe('SQL170 predecessor ACL hardening operator design', () => {
  it('is one standalone atomic statement with bounded locking and catalog-only fail-closed checks', () => {
    const source = read(operatorPath)

    expect(source.startsWith('-- SQL170 ACL-HARDENING OPERATOR DESIGN:')).toBe(true)
    expect(source).toContain(
      'Run this single DO statement standalone; do not wrap it in a caller-created explicit transaction.',
    )
    expect(source).not.toMatch(/^\s*(?:BEGIN|COMMIT|ROLLBACK);$/gm)
    expect(source.match(/^DO \$acl_hardening\$$/gm)).toHaveLength(1)
    expect(source.match(/^\$acl_hardening\$;$/gm)).toHaveLength(1)
    expect(source).toContain("SET LOCAL lock_timeout = '5s';")
    expect(source).toContain("SET LOCAL search_path = '';")
    expect(source).toContain(
      'LOCK TABLE public.profiles, public.relationships IN ACCESS EXCLUSIVE MODE;',
    )
    expect(source).not.toMatch(/^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\s+|MERGE\s+)/im)
    expect(source).not.toMatch(/(?:FROM|JOIN)\s+public\.(?:profiles|relationships)/i)
    expect(source.match(/^\s*EXECUTE 'REVOKE /gm)).toHaveLength(4)
    expect(source).not.toMatch(/\b(?:format|quote_ident|quote_literal)\s*\(/i)
    expect(source).not.toMatch(/(?:^|')GRANT /m)

    for (const token of [
      "CURRENT_USER <> 'postgres'",
      "rolname IN ('anon', 'authenticated', 'service_role')",
      "namespace_row.nspname = 'public'",
      "class_row.relkind = 'r'",
      "class_row.relpersistence = 'p'",
      'class_row.relrowsecurity',
      'NOT class_row.relforcerowsecurity',
      'acl.grantor <> class_row.relowner OR acl.is_grantable',
      'attribute.attacl IS NOT NULL',
      'sql170_acl_hardening_stop_profiles_acl',
      'sql170_acl_hardening_stop_relationships_acl',
      'sql170_acl_hardening_postcondition_failed',
    ]) {
      expect(source).toContain(token)
    }
  })

  it('admits only the frozen known-before or exact target manifests', () => {
    const source = compact(read(operatorPath))

    expect(source).toContain(compact(`
      v_profiles_before constant text[] := ARRAY[
        'anon:DELETE','anon:INSERT','anon:MAINTAIN','anon:REFERENCES',
        'anon:SELECT','anon:TRIGGER','anon:TRUNCATE','anon:UPDATE',
        'authenticated:DELETE','authenticated:INSERT','authenticated:MAINTAIN',
        'authenticated:REFERENCES','authenticated:SELECT','authenticated:TRIGGER',
        'authenticated:TRUNCATE','authenticated:UPDATE',
        'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
        'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
        'service_role:TRUNCATE','service_role:UPDATE'
      ]::text[]
    `))
    expect(source).toContain(compact(`
      v_relationships_before constant text[] := ARRAY[
        'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
        'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
        'service_role:TRUNCATE','service_role:UPDATE'
      ]::text[]
    `))
    expect(source.match(/v_profiles_targetconstanttext\[\]:=ARRAY\['authenticated:INSERT','authenticated:SELECT','authenticated:UPDATE','service_role:INSERT','service_role:SELECT'\]::text\[\]/g)).toHaveLength(1)
    expect(source.match(/v_relationships_targetconstanttext\[\]:=ARRAY\['service_role:DELETE','service_role:INSERT','service_role:SELECT','service_role:UPDATE'\]::text\[\]/g)).toHaveLength(1)
    expect(source).toContain(
      'v_profiles_aclISDISTINCTFROMv_profiles_beforeANDv_profiles_aclISDISTINCTFROMv_profiles_target',
    )
    expect(source).toContain(
      'v_relationships_aclISDISTINCTFROMv_relationships_beforeANDv_relationships_aclISDISTINCTFROMv_relationships_target',
    )
  })

  it('revokes only known excess and retains relationships CRUD', () => {
    const source = read(operatorPath)
    const compactSource = compact(source)

    expect(compactSource).toContain(compact(`
      EXECUTE 'REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles FROM anon';
    `))
    expect(compactSource).toContain(compact(`
      EXECUTE 'REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profiles FROM authenticated';
    `))
    expect(compactSource).toContain(compact(`
      EXECUTE 'REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles FROM service_role';
    `))
    expect(compactSource).toContain(compact(`
      EXECUTE 'REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.relationships FROM service_role';
    `))
    expect(source).not.toMatch(/REVOKE[^;]*DELETE[^;]*ON TABLE public\.relationships/)
    expect(source).toContain(
      'DELETE is intentionally retained as an approved product capability',
    )
  })
})
