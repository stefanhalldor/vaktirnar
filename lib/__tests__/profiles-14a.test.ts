// lib/__tests__/profiles-14a.test.ts
//
// Static regression tests for Phase 14A: profiles_select hardening.
//
// These tests do not run SQL or call Supabase. They verify source-level
// properties that must hold after the migration:
//
//   1. sql/41 changes profiles_select to USING (id = auth.uid()), not USING (true).
//   2. The legacy children page uses optional chaining on row.parent so a null
//      relation (after the policy tightens) does not crash the page.
//   3. No authenticated-client profiles read in Teskeid app code queries without
//      scoping to the calling user's own row.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

function src(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// ── sql/41 content checks ─────────────────────────────────────────────────────

describe('sql/41_profiles_select_own.sql', () => {
  const sql = src('sql/41_profiles_select_own.sql')

  it('drops the old profiles_select policy', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "profiles_select"')
  })

  it('creates profiles_select with USING (id = auth.uid())', () => {
    expect(sql).toContain('USING (id = auth.uid())')
  })

  it('does not contain USING (true)', () => {
    // The new policy must not reintroduce the broad USING (true) grant.
    // The rollback comment is allowed to contain it, so we check the
    // CREATE POLICY line specifically.
    const createLine = sql
      .split('\n')
      .find((l) => l.includes('CREATE POLICY') && l.includes('profiles_select'))
    expect(createLine).toBeDefined()
    expect(createLine).not.toContain('USING (true)')
  })

  it('targets authenticated role only', () => {
    expect(sql).toMatch(/FOR SELECT TO authenticated/)
  })

  it('is wrapped in a transaction', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
  })
})

// ── Legacy children page: optional chaining ──────────────────────────────────
//
// After sql/41, the embedded profiles relation returns null for co-parents.
// The page must use optional chaining so it degrades gracefully instead of
// crashing with "Cannot read properties of null".

describe('app/(app)/children/[id]/page.tsx — defensive optional chaining', () => {
  const page = src('app/(app)/children/[id]/page.tsx')

  it('uses optional chaining on row.parent.id (key prop)', () => {
    expect(page).toContain('row.parent?.id')
    expect(page).not.toMatch(/key=\{row\.parent\.id\}/)
  })

  it('uses optional chaining on row.parent.display_name', () => {
    expect(page).toContain('row.parent?.display_name')
    expect(page).not.toMatch(/row\.parent\.display_name/)
  })

  it('uses index-based fallback key to avoid duplicate React keys', () => {
    expect(page).toMatch(/parent-\$\{idx\}/)
  })
})

// ── Teskeid app: own-profile reads are scoped ─────────────────────────────────
//
// Teskeid authenticated-client reads from profiles must always be scoped to
// the calling user's own row (.eq('id', user.id) or equivalent).
// This prevents accidental cross-user reads after sql/41 tightens the policy.

describe('app/auth-mvp/heim/page.tsx — own-profile read is scoped', () => {
  const page = src('app/auth-mvp/heim/page.tsx')

  it('scopes the profiles select to the calling user', () => {
    // The page reads: supabase.from('profiles').select(...).eq('id', user.id)
    expect(page).toContain(".from('profiles')")
    expect(page).toContain('.eq(\'id\', user.id)')
  })
})

describe('app/api/teskeid/profile/route.ts — own-profile read is scoped', () => {
  const route = src('app/api/teskeid/profile/route.ts')

  it('scopes the profiles select to the calling user', () => {
    expect(route).toContain(".from('profiles')")
    expect(route).toContain('.eq(\'id\', user.id)')
  })
})
