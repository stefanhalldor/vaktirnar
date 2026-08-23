import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/154_event_scoped_participation_pairing_hotfix.sql'),
  'utf8',
)
const validationRoot = join(
  process.cwd(),
  'sql/validation/154-event-scoped-participation-pairing-hotfix',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

describe('SQL154 scoped-participation pairing hotfix', () => {
  it('is a fail-closed one-function forward fix', () => {
    expect(migration).toContain("'49ab80161d27a7a73df7491bf04ac6cd'")
    expect(migration).toContain("'0269211156c600c6411ecf0590eff295'")
    expect(migration).toContain('pg_catalog.generate_subscripts(')
    expect(migration).toContain('v_candidate_event_ids[expected_ordinal.array_index]')
    expect(migration).toContain('v_candidate_owner_ids[expected_ordinal.array_index]')
    expect(migration).toContain('sql154_predecessor_body_mismatch')
    expect(migration).toContain('sql154_broken_fragment_not_exactly_once')
    expect(migration).not.toContain('pg_catalog.position(')
    expect(migration).not.toContain('pg_catalog.overlay(')
    expect(migration).toContain('pg_catalog.strpos(')
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).not.toMatch(/^CREATE TABLE|^ALTER TABLE|^DROP\b|^INSERT\b|^UPDATE\b|^DELETE\b/gm)
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
    for (const source of [preflight, postflight]) {
      expect(source).toContain('SET TRANSACTION READ ONLY;')
      expect(source).toContain('ROLLBACK;')
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(readme).toContain('Localhost checks for Stebbi')
  })
})
