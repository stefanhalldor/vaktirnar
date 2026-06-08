// lib/__tests__/legacy-access.test.ts
//
// Unit tests for guardLegacyAccess (lib/legacy/access.ts).
//
// Coverage:
//   - Returns null (passes) when user is in legacy_access allowlist
//   - Returns 404 when user is NOT in the allowlist (missing row)
//   - Returns 404 on database error (fail-closed)
//   - userId never appears in log output in any path
//
// Also includes static regression for layout redirect targets:
//   - Authenticated-but-not-entitled users are redirected to /  (not /login).
//     Redirecting to /login would cause a loop: middleware sends authenticated
//     users from /login → /home, which re-triggers the entitlement check.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Mock ──────────────────────────────────────────────────────────────────────

const { mockMaybeSingle } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  })),
}))

import { guardLegacyAccess } from '@/lib/legacy/access'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('guardLegacyAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when user is in legacy_access (access granted)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_id: TEST_USER_ID }, error: null })
    const result = await guardLegacyAccess(TEST_USER_ID)
    expect(result).toBeNull()
  })

  it('returns 404 response when user is NOT in legacy_access (missing row)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await guardLegacyAccess(TEST_USER_ID)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(404)
  })

  it('returns 404 response on database error (fail-closed)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection error' } })
    const result = await guardLegacyAccess(TEST_USER_ID)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(404)
  })

  it('response body is { error: "Not found" } when user is missing', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await guardLegacyAccess(TEST_USER_ID)
    expect(await result?.json()).toEqual({ error: 'Not found' })
  })

  it('response body is { error: "Not found" } on database error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const result = await guardLegacyAccess(TEST_USER_ID)
    expect(await result?.json()).toEqual({ error: 'Not found' })
  })

  it('does not include userId in log output on database error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db fail' } })
    const logCalls: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { logCalls.push(args) })
    await guardLegacyAccess(TEST_USER_ID)
    spy.mockRestore()
    expect(logCalls.flat().join(' ')).not.toContain(TEST_USER_ID)
  })

  it('does not include userId in log output when user is missing (no DB error)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const logCalls: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { logCalls.push(args) })
    await guardLegacyAccess(TEST_USER_ID)
    spy.mockRestore()
    // No log is emitted for missing row — confirm userId is not leaked
    expect(logCalls.flat().join(' ')).not.toContain(TEST_USER_ID)
  })
})

// ── Static regression: entitlement failure must redirect to / not /login ──────
//
// If guardLegacyAccess returns a non-null response inside a layout,
// the layout must redirect to / (landing page), not /login.
// Redirecting to /login would cause an infinite loop:
//   middleware detects authenticated user on /login → redirects to /home
//   → layout hits guardLegacyAccess → redirect /login → loop.

describe('layout-guards — entitlement redirect target', () => {
  it('app/(app)/layout.tsx redirects to / (not /login) on entitlement failure', () => {
    const src = readFileSync(join(ROOT, 'app/(app)/layout.tsx'), 'utf-8')
    expect(src).toContain("if (ag) redirect('/')")
    expect(src).not.toContain("if (ag) redirect('/login')")
  })

  it('app/dashboard/layout.tsx redirects to / (not /login) on entitlement failure', () => {
    const src = readFileSync(join(ROOT, 'app/dashboard/layout.tsx'), 'utf-8')
    expect(src).toContain("if (ag) redirect('/')")
    expect(src).not.toContain("if (ag) redirect('/login')")
  })

  it('app/(app)/layout.tsx still redirects unauthenticated users to /login', () => {
    const src = readFileSync(join(ROOT, 'app/(app)/layout.tsx'), 'utf-8')
    expect(src).toContain("redirect('/login')")
  })

  it('app/dashboard/layout.tsx still redirects unauthenticated users to /login', () => {
    const src = readFileSync(join(ROOT, 'app/dashboard/layout.tsx'), 'utf-8')
    expect(src).toContain("redirect('/login')")
  })
})
