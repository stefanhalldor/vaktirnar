// lib/__tests__/otp-verification.test.ts
//
// Unit tests for Phase C atomic OTP verification.
//
// Coverage:
//   A. verifyUserCode (lib/auth/user-codes.ts) — real function, mocked RPC
//   B. verifyLoginCode (lib/auth/codes.ts)     — real function, mocked RPC
//   C. Route-level generic responses            — real verify fns via mocked RPC
//   D. Static migration contract               — SQL file text assertions
//
// IMPORTANT: Mocked-RPC tests do NOT prove Postgres-level atomicity, correct
// attempt serialisation under concurrency, or permission enforcement.
// Those properties are guaranteed by the Postgres FOR UPDATE mechanism and
// must be confirmed by the post-deployment gate described at the bottom.
//
// No email, OTP value, hash or token appears in any assertion or log output.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { NextRequest } from 'next/server'

// ── Shared RPC mock ───────────────────────────────────────────────────────────
// Controls what getAdmin().rpc() returns across all sections.
// Sections A and B call the real verifyUserCode/verifyLoginCode — those
// functions call mockRpc. Section C routes call the real functions too.

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    rpc:  mockRpc,
    from: vi.fn(),       // defensive: not called by verify* functions
  })),
}))

// ── Session and allowlist mocks (needed for section C route handlers) ─────────

const { mockCreateUserSession, mockCreateAdminSession } = vi.hoisted(() => ({
  mockCreateUserSession:  vi.fn(),
  mockCreateAdminSession: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  createUserSession:  mockCreateUserSession,
  createAdminSession: mockCreateAdminSession,
}))

vi.mock('@/lib/auth/allowlist', () => ({
  isAuthMvpAllowedEmail: vi.fn().mockResolvedValue(true),
}))

// ── Imports under test ────────────────────────────────────────────────────────
// verifyUserCode and verifyLoginCode are the real implementations.
// Their only external dependency is getAdmin().rpc(), which is mocked above.

import { verifyUserCode }  from '@/lib/auth/user-codes'
import { verifyLoginCode } from '@/lib/auth/codes'
import { POST as postUserVerify }  from '@/app/api/auth-mvp/verify-code/route'
import { POST as postAdminVerify } from '@/app/api/auth/verify-code/route'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_EMAIL    = 'test@example.com'
const TEST_CODE     = '123456'
const VALID_SECRET  = 'test-secret-for-unit-tests-only-phase-c'
const MIGRATION_SQL = join(__dirname, '..', '..', 'sql', '38_atomic_otp_verification.sql')

// ── Helpers ───────────────────────────────────────────────────────────────────

function saveSecret(value: string | undefined): () => void {
  const saved = process.env.AUTH_CODE_SECRET
  if (value === undefined) {
    delete process.env.AUTH_CODE_SECRET
  } else {
    process.env.AUTH_CODE_SECRET = value
  }
  return () => {
    if (saved === undefined) delete process.env.AUTH_CODE_SECRET
    else process.env.AUTH_CODE_SECRET = saved
  }
}

function makeRequest(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function captureErrors() {
  const calls: unknown[][] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    calls.push(args)
  })
  return { calls, restore: () => spy.mockRestore() }
}

// ── A. verifyUserCode ─────────────────────────────────────────────────────────

describe('verifyUserCode', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('returns true when RPC data is true', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    expect(await verifyUserCode(TEST_EMAIL, TEST_CODE)).toBe(true)
  })

  it('returns false when RPC data is false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    expect(await verifyUserCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('returns false when RPC data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    expect(await verifyUserCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('returns false when RPC returns an error object', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    expect(await verifyUserCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('logs only a fixed string on RPC error — no email, OTP or db detail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'pg internal detail' } })
    const { calls, restore } = captureErrors()
    await verifyUserCode(TEST_EMAIL, TEST_CODE)
    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
    expect(output).not.toContain(TEST_CODE)
    expect(output).not.toContain('pg internal detail')
  })

  it('returns false without throwing when AUTH_CODE_SECRET is absent', async () => {
    restoreSecret()
    restoreSecret = saveSecret(undefined)
    // Must resolve to false, not throw
    await expect(verifyUserCode(TEST_EMAIL, TEST_CODE)).resolves.toBe(false)
    // RPC must NOT be called — hash could not be computed
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls the RPC with name verify_user_otp_code', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode(TEST_EMAIL, TEST_CODE)
    expect(mockRpc).toHaveBeenCalledWith('verify_user_otp_code', expect.any(Object))
  })

  it('passes normalized (lowercased, trimmed) email as p_email', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode('  UPPER@EXAMPLE.COM  ', TEST_CODE)
    const [, args] = mockRpc.mock.calls[0]
    expect(args.p_email).toBe('upper@example.com')
  })

  it('normalizes email before hashing: hash of " UPPER@X.COM " equals hash of "upper@x.com"', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode('  UPPER@X.COM  ', TEST_CODE)
    const [, argsUpper] = mockRpc.mock.calls[0]
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode('upper@x.com', TEST_CODE)
    const [, argsLower] = mockRpc.mock.calls[0]
    expect(argsUpper.p_submitted_hash).toBe(argsLower.p_submitted_hash)
  })

  it('passes p_submitted_hash as exactly 64 lowercase hex characters', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode(TEST_EMAIL, TEST_CODE)
    const [, args] = mockRpc.mock.calls[0]
    expect(args.p_submitted_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not pass the plaintext OTP in any RPC argument', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode(TEST_EMAIL, TEST_CODE)
    const serialised = JSON.stringify(mockRpc.mock.calls[0])
    expect(serialised).not.toContain(TEST_CODE)
  })

  it('does not pass AUTH_CODE_SECRET in any RPC argument', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyUserCode(TEST_EMAIL, TEST_CODE)
    const serialised = JSON.stringify(mockRpc.mock.calls[0])
    expect(serialised).not.toContain(VALID_SECRET)
  })
})

// ── B. verifyLoginCode ────────────────────────────────────────────────────────

describe('verifyLoginCode', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('returns true when RPC data is true', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    expect(await verifyLoginCode(TEST_EMAIL, TEST_CODE)).toBe(true)
  })

  it('returns false when RPC data is false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    expect(await verifyLoginCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('returns false when RPC data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    expect(await verifyLoginCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('returns false when RPC returns an error object', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    expect(await verifyLoginCode(TEST_EMAIL, TEST_CODE)).toBe(false)
  })

  it('logs only a fixed string on RPC error — no email, OTP or db detail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'pg error text' } })
    const { calls, restore } = captureErrors()
    await verifyLoginCode(TEST_EMAIL, TEST_CODE)
    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
    expect(output).not.toContain(TEST_CODE)
    expect(output).not.toContain('pg error text')
  })

  it('returns false without throwing when AUTH_CODE_SECRET is absent', async () => {
    restoreSecret()
    restoreSecret = saveSecret(undefined)
    await expect(verifyLoginCode(TEST_EMAIL, TEST_CODE)).resolves.toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls the RPC with name verify_admin_otp_code', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode(TEST_EMAIL, TEST_CODE)
    expect(mockRpc).toHaveBeenCalledWith('verify_admin_otp_code', expect.any(Object))
  })

  it('passes normalized (lowercased, trimmed) email as p_email', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode('  ADMIN@EXAMPLE.COM  ', TEST_CODE)
    const [, args] = mockRpc.mock.calls[0]
    expect(args.p_email).toBe('admin@example.com')
  })

  it('normalizes email before hashing: hash of " ADMIN@X.COM " equals hash of "admin@x.com"', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode('  ADMIN@X.COM  ', TEST_CODE)
    const [, argsUpper] = mockRpc.mock.calls[0]
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode('admin@x.com', TEST_CODE)
    const [, argsLower] = mockRpc.mock.calls[0]
    expect(argsUpper.p_submitted_hash).toBe(argsLower.p_submitted_hash)
  })

  it('passes p_submitted_hash as exactly 64 lowercase hex characters', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode(TEST_EMAIL, TEST_CODE)
    const [, args] = mockRpc.mock.calls[0]
    expect(args.p_submitted_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not pass the plaintext OTP in any RPC argument', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode(TEST_EMAIL, TEST_CODE)
    const serialised = JSON.stringify(mockRpc.mock.calls[0])
    expect(serialised).not.toContain(TEST_CODE)
  })

  it('does not pass AUTH_CODE_SECRET in any RPC argument', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await verifyLoginCode(TEST_EMAIL, TEST_CODE)
    const serialised = JSON.stringify(mockRpc.mock.calls[0])
    expect(serialised).not.toContain(VALID_SECRET)
  })

  it('user and admin paths return consistent results for the same RPC data', async () => {
    for (const rpcData of [true, false, null] as const) {
      vi.clearAllMocks()
      mockRpc.mockResolvedValue({ data: rpcData, error: null })
      const userResult = await verifyUserCode(TEST_EMAIL, TEST_CODE)
      vi.clearAllMocks()
      mockRpc.mockResolvedValue({ data: rpcData, error: null })
      const adminResult = await verifyLoginCode(TEST_EMAIL, TEST_CODE)
      expect(userResult).toBe(adminResult)
    }
  })
})

// ── C. Route-level: generic invalid_code responses ────────────────────────────
//
// Routes call the real verifyUserCode / verifyLoginCode which call mockRpc.
// Route outcome is controlled by what mockRpc returns.

describe('POST /api/auth-mvp/verify-code', () => {
  let restoreSecret: () => void
  const URL = 'https://teskeid.is/api/auth-mvp/verify-code'

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
    mockCreateUserSession.mockResolvedValue({ error: undefined })
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('valid code: 200 with { success: true }', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    const res = await postUserVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('wrong code: 400 with { error: "invalid_code" }', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const res = await postUserVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
  })

  it('response body does not contain the submitted email', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const res = await postUserVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(JSON.stringify(await res.json())).not.toContain(TEST_EMAIL)
  })

  it('response body does not contain the submitted OTP', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const res = await postUserVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(JSON.stringify(await res.json())).not.toContain(TEST_CODE)
  })

  it('invalid schema returns 400 with invalid_code (no schema leak)', async () => {
    const res = await postUserVerify(makeRequest(URL, { email: 'not-an-email', code: TEST_CODE }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
  })
})

describe('POST /api/auth/verify-code', () => {
  let restoreSecret: () => void
  let restoreAdminEmails: string | undefined
  const URL = 'https://teskeid.is/api/auth/verify-code'

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
    restoreAdminEmails = process.env.ADMIN_EMAILS
    process.env.ADMIN_EMAILS = TEST_EMAIL
    mockCreateAdminSession.mockResolvedValue({ error: undefined })
  })

  afterEach(() => {
    restoreSecret()
    if (restoreAdminEmails === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = restoreAdminEmails
    vi.restoreAllMocks()
  })

  it('valid code for admin email: 200 with { success: true, redirect: "/admin" }', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    const res = await postAdminVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, redirect: '/admin' })
  })

  it('wrong code: 400 with { error: "invalid_code" }', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const res = await postAdminVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
  })

  it('non-admin email: 400 before RPC is called', async () => {
    process.env.ADMIN_EMAILS = 'other@example.com'
    const res = await postAdminVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('response body does not contain the submitted email or OTP', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const res = await postAdminVerify(makeRequest(URL, { email: TEST_EMAIL, code: TEST_CODE }))
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain(TEST_EMAIL)
    expect(body).not.toContain(TEST_CODE)
  })
})

// ── D. Static migration contract ──────────────────────────────────────────────
//
// Reads sql/38_atomic_otp_verification.sql as text and asserts the presence
// of required security and correctness constructs. This is a static text scan
// (no SQL execution). It catches accidental omissions during editing.

describe('sql/38_atomic_otp_verification.sql — static contract', () => {
  let sql: string

  beforeEach(() => {
    sql = readFileSync(MIGRATION_SQL, 'utf-8')
  })

  // Function definitions
  it('defines verify_user_otp_code', () => {
    expect(sql).toContain('verify_user_otp_code')
  })

  it('defines verify_admin_otp_code', () => {
    expect(sql).toContain('verify_admin_otp_code')
  })

  // Security context
  it('both functions declare SECURITY INVOKER (not DEFINER)', () => {
    const matches = (sql.match(/SECURITY INVOKER/g) ?? []).length
    expect(matches).toBeGreaterThanOrEqual(2)
    // SECURITY DEFINER must not appear outside a comment line
    const nonCommentLines = sql.split('\n').filter((l) => !l.trimStart().startsWith('--'))
    expect(nonCommentLines.join('\n')).not.toContain('SECURITY DEFINER')
  })

  it('both functions declare SET search_path = empty string', () => {
    const matches = (sql.match(/SET search_path = ''/g) ?? []).length
    expect(matches).toBeGreaterThanOrEqual(2)
  })

  // Correctness: row locking
  it('uses FOR UPDATE (exclusive row lock)', () => {
    expect(sql).toContain('FOR UPDATE')
  })

  // Correctness: ordering with tiebreaker
  it('orders by created_at DESC, id DESC', () => {
    expect(sql).toContain('created_at DESC, id DESC')
  })

  // Fallback-prevention: SELECT must not filter by used_at or expires_at.
  // Filtering in WHERE would allow the query to skip the latest (consumed/expired)
  // code and fall back to an older code, breaking the "only newest code is valid"
  // invariant. State checks happen after the row lock is acquired.
  it('SELECT does not have "AND used_at IS NULL" in WHERE (no fallback to older codes)', () => {
    // If "AND used_at IS NULL" appeared in a WHERE clause, the query would skip
    // the latest (already-consumed) code and fall back to an older one.
    // State is checked post-lock instead.
    expect(sql).not.toMatch(/AND\s+used_at\s+IS\s+NULL/)
  })

  it('SELECT does not have "AND expires_at >" in WHERE (no fallback to older codes)', () => {
    // If "AND expires_at > now()" appeared in WHERE, the query could fall back
    // to an older unexpired code after the latest one expires.
    // State is checked post-lock instead.
    expect(sql).not.toMatch(/AND\s+expires_at\s*[><=]/)
  })

  it('checks used_at IS NOT NULL after acquiring the lock (post-lock guard)', () => {
    expect(sql).toContain('v_used_at IS NOT NULL')
  })

  it('checks expires_at <= now() after acquiring the lock (post-lock guard)', () => {
    expect(sql).toContain('v_expires_at <= now()')
  })

  // Correctness: attempt increment
  it('increments attempts atomically (attempts = attempts + 1)', () => {
    expect(sql).toContain('attempts = attempts + 1')
  })

  // Correctness: conditional used_at
  it('sets used_at conditionally via CASE inside UPDATE', () => {
    expect(sql).toContain('used_at')
    expect(sql).toContain('CASE')
    expect(sql).toContain('THEN now()')
  })

  it('uses ELSE used_at (preserves column value) not ELSE NULL', () => {
    expect(sql).toContain('ELSE used_at')
    expect(sql).not.toContain('ELSE NULL')
  })

  // Permissions: REVOKE EXECUTE
  it('REVOKEs EXECUTE from PUBLIC', () => {
    expect(sql).toMatch(/REVOKE EXECUTE.*FROM PUBLIC/)
  })

  it('REVOKEs EXECUTE from anon', () => {
    expect(sql).toMatch(/REVOKE EXECUTE.*anon/)
  })

  it('REVOKEs EXECUTE from authenticated', () => {
    expect(sql).toMatch(/REVOKE EXECUTE.*authenticated/)
  })

  // Permissions: GRANT EXECUTE
  it('GRANTs EXECUTE to service_role', () => {
    expect(sql).toMatch(/GRANT EXECUTE.*TO service_role/)
  })

  it('does not GRANT EXECUTE to PUBLIC, anon or authenticated', () => {
    expect(sql).not.toMatch(/GRANT EXECUTE.*TO (PUBLIC|anon\b|authenticated)/)
  })

  // Table grants
  it('GRANTs table access to service_role', () => {
    expect(sql).toMatch(/GRANT SELECT.*TO service_role/)
  })

  it('REVOKEs table access from PUBLIC, anon, authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM PUBLIC.*anon.*authenticated/)
  })

  // Transaction wrap
  it('is transaction-wrapped (BEGIN … COMMIT)', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
  })

  // Deployment documentation
  it('documents that SQL must be deployed before the app', () => {
    expect(sql).toContain('BEFORE deploying')
  })

  // No data mutation (INSERT INTO / DELETE FROM / ALTER TABLE are DML/DDL on rows)
  // "GRANT SELECT, INSERT, ..." is a privilege list, not DML — excluded by specificity.
  it('contains no INSERT INTO, DELETE FROM or ALTER TABLE statements', () => {
    const nonComments = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(nonComments).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(nonComments).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(nonComments).not.toMatch(/\bALTER\s+TABLE\b/i)
  })
})

// =============================================================================
// POST-DEPLOYMENT VERIFICATION GATE
//
// Status: IMPLEMENTED — database concurrency NOT YET verified.
//
// The mocked-RPC tests above confirm TypeScript behaviour only. They do NOT
// prove that Postgres serialises concurrent requests correctly.
//
// Required steps after sql/38 is applied to a real Postgres instance:
//
// 1. Request a fresh OTP for a test account:
//      POST /api/auth-mvp/request-code  { email: "<test-email>" }
//
// 2. Fire two simultaneous correct verify requests:
//      Promise.all([
//        fetch('/api/auth-mvp/verify-code', { method:'POST',
//          body: JSON.stringify({ email, code }) }),
//        fetch('/api/auth-mvp/verify-code', { method:'POST',
//          body: JSON.stringify({ email, code }) }),
//      ])
//    Assert: exactly one 200, exactly one 400 { error: 'invalid_code' }.
//    Inspect the row: SELECT attempts, used_at FROM auth_email_codes WHERE ...
//    Assert: attempts = 1 and used_at IS NOT NULL (one winner, one loser, no
//    double-spend and no runaway attempt counter).
//
// 3. Replay the consumed code:
//      POST /api/auth-mvp/verify-code  { email, code }
//    Assert: 400 { error: 'invalid_code' }.
//
// 4. Request another fresh OTP.
//
// 5. Derive a wrong code that is guaranteed to differ from the received OTP:
//      wrongCode = String((Number(receivedOtp) + 1) % 1_000_000).padStart(6, '0')
//    Fire eight simultaneous wrong-code requests:
//      Promise.all(Array.from({ length: 8 }, () =>
//        fetch('/api/auth-mvp/verify-code', { method:'POST',
//          body: JSON.stringify({ email, code: wrongCode }) })
//      ))
//    Assert: all 8 are 400.
//    Inspect the row: SELECT attempts FROM auth_email_codes WHERE ...
//    Assert: attempts = 5 exactly (FOR UPDATE serialisation stops the counter
//    at the limit; overshooting to 6, 7 or 8 indicates a serialisation bug).
//
// 6. After step 5, submit the correct code:
//      POST /api/auth-mvp/verify-code  { email, code: receivedOtp }
//    Assert: 400 { error: 'invalid_code' } — the code is locked out even
//    though it was never consumed, because attempt exhaustion is permanent.
//
// 7. Test anon RPC permission (use Supabase anon-keyed client):
//      supabase.rpc('verify_user_otp_code',
//        { p_email: 'x@x.com', p_submitted_hash: 'a'.repeat(64) })
//    Assert: error is present AND data === null.
//    (data: false with no error would mean the function ran and returned false,
//    which is NOT a permission failure — the call must be rejected outright.)
//    Record the actual PostgREST error code returned (e.g. PGRST301, 42501,
//    or similar); do not require exactly 42501.
//    Note: has_function_privilege catalog checks are authoritative for
//    confirming the EXECUTE privilege was revoked.
//
// 8. Test authenticated RPC permission (use auth'd client):
//    Same call. Assert: error is present AND data === null.
//    Record the actual error code. has_function_privilege is authoritative
//    here as well.
//
// 9. Latest-code fallback test (invalidation of superseded codes):
//    a. Request OTP A for <test-email>.
//    b. Request OTP B for <test-email> (supersedes A).
//    c. Consume B with a correct verify request — Assert: 200.
//    d. Submit A:  Assert: 400 { error: 'invalid_code' } (A is superseded).
//    e. Replay B:  Assert: 400 { error: 'invalid_code' } (B already consumed).
//
// Phase C may be marked fully verified only after all nine steps pass.
//
// NOTE — Secret rotation (AUTH_CODE_SECRET):
//   Rotating AUTH_CODE_SECRET invalidates all active codes within their
//   10-minute TTL window: codes are stored as HMAC(email:code, old_secret),
//   and the new secret produces a different digest for the same inputs.
//   After rotation, any user mid-flow (code requested but not yet verified)
//   must request a new code with the new secret active.
//   Verify post-rotation behaviour: (a) request a code, (b) rotate the
//   secret in the environment, (c) submit the pre-rotation code —
//   Assert: 400 { error: 'invalid_code' }.
// =============================================================================
