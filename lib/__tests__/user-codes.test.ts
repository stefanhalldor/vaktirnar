/**
 * Tests for createUserCode() in lib/auth/user-codes.ts
 * and static contract for sql/72_auth_email_code_request_idempotency.sql
 *
 * Coverage:
 *   A. createUserCode — RPC return paths (inserted, recent_active, rate_limited, error)
 *   B. createUserCode — privacy (no email, hash, or secret in RPC args or error logs)
 *   C. sql/72 — static migration contract
 *
 * These tests use a mocked RPC and do NOT prove Postgres-level advisory lock
 * atomicity or permission enforcement. Those require a live Postgres instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Shared RPC mock ───────────────────────────────────────────────────────────

const { mockRpc, mockUpdate, mockEq, mockIs } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockIs: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => {
    const updateChain = {
      eq: (...args: unknown[]) => {
        mockEq(...args)
        return updateChain
      },
      is: (...args: unknown[]) => mockIs(...args),
    }
    return {
      rpc: mockRpc,
      from: vi.fn(() => ({
        update: (...args: unknown[]) => {
          mockUpdate(...args)
          return updateChain
        },
      })),
    }
  }),
}))

import { createUserCode, invalidateUserCodeAfterSendFailure } from '@/lib/auth/user-codes'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_EMAIL    = 'user@example.com'
const VALID_SECRET  = 'test-secret-for-unit-tests-only-user-codes-32b'
const MIGRATION_SQL = join(__dirname, '..', '..', 'sql', '72_auth_email_code_request_idempotency.sql')

// ── Helpers ───────────────────────────────────────────────────────────────────

function saveSecret(value: string | undefined): () => void {
  const saved = process.env.AUTH_CODE_SECRET
  if (value === undefined) delete process.env.AUTH_CODE_SECRET
  else process.env.AUTH_CODE_SECRET = value
  return () => {
    if (saved === undefined) delete process.env.AUTH_CODE_SECRET
    else process.env.AUTH_CODE_SECRET = saved
  }
}

function captureErrors() {
  const calls: unknown[][] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => calls.push(args))
  return { calls, restore: () => spy.mockRestore() }
}

// ── A. createUserCode return paths ────────────────────────────────────────────

describe('createUserCode — return paths', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('returns a 6-digit plaintext code string when RPC status is inserted', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'inserted' }, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/^\d{6}$/)
  })

  it('returns { recentActive: true } when RPC status is recent_active', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'recent_active' }, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toEqual({ recentActive: true })
  })

  it('returns { rateLimited: true, retryAfter } when RPC status is rate_limited', async () => {
    const retry_after = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockRpc.mockResolvedValue({ data: { status: 'rate_limited', retry_after }, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toEqual({ rateLimited: true, retryAfter: retry_after })
  })

  it('returns fallback retryAfter when RPC rate_limited response omits retry_after', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toMatchObject({ rateLimited: true })
    expect(typeof (result as { rateLimited: true; retryAfter: string }).retryAfter).toBe('string')
  })

  it('returns null when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toBeNull()
  })

  it('returns null when RPC returns an unexpected status', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'unknown_status' }, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toBeNull()
  })

  it('returns null when RPC returns null data and no error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toBeNull()
  })

  it('returns null and does not call RPC when AUTH_CODE_SECRET is absent', async () => {
    restoreSecret()
    restoreSecret = saveSecret(undefined)
    const result = await createUserCode(TEST_EMAIL)
    expect(result).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ── B. createUserCode privacy ─────────────────────────────────────────────────

describe('createUserCode — privacy', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('calls RPC with name create_user_otp_code_if_allowed', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'inserted' }, error: null })
    await createUserCode(TEST_EMAIL)
    expect(mockRpc).toHaveBeenCalledWith('create_user_otp_code_if_allowed', expect.any(Object))
  })

  it('p_code_hash is exactly 64 lowercase hex characters', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'inserted' }, error: null })
    await createUserCode(TEST_EMAIL)
    const [, args] = mockRpc.mock.calls[0]
    expect(args.p_code_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not pass AUTH_CODE_SECRET in any RPC argument', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'inserted' }, error: null })
    await createUserCode(TEST_EMAIL)
    const serialised = JSON.stringify(mockRpc.mock.calls[0])
    expect(serialised).not.toContain(VALID_SECRET)
  })

  it('error log on RPC failure does not contain email or db error detail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sensitive pg detail for user@example.com' } })
    const { calls, restore } = captureErrors()
    await createUserCode(TEST_EMAIL)
    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
    expect(output).not.toContain('sensitive pg detail')
  })

  it('error log on unexpected RPC status does not contain email', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'error', email: TEST_EMAIL }, error: null })
    const { calls, restore } = captureErrors()
    await createUserCode(TEST_EMAIL)
    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
  })
})

describe('invalidateUserCodeAfterSendFailure', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
    mockIs.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('marks only the matching unused email/code hash as used', async () => {
    await expect(invalidateUserCodeAfterSendFailure(TEST_EMAIL, '123456')).resolves.toBe(true)

    expect(mockUpdate).toHaveBeenCalledWith({ used_at: expect.any(String) })
    expect(mockEq).toHaveBeenCalledWith('email', TEST_EMAIL)
    expect(mockEq).toHaveBeenCalledWith('code_hash', expect.stringMatching(/^[0-9a-f]{64}$/))
    expect(mockIs).toHaveBeenCalledWith('used_at', null)
  })

  it('returns false without logging sensitive DB details when invalidation fails', async () => {
    mockIs.mockResolvedValue({ error: { message: `failure for ${TEST_EMAIL} code 123456` } })
    const { calls, restore } = captureErrors()

    await expect(invalidateUserCodeAfterSendFailure(TEST_EMAIL, '123456')).resolves.toBe(false)

    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
    expect(output).not.toContain('123456')
  })

  it('returns false when the database request throws', async () => {
    mockIs.mockRejectedValue(new Error(`failure for ${TEST_EMAIL} code 123456`))
    const { calls, restore } = captureErrors()

    await expect(invalidateUserCodeAfterSendFailure(TEST_EMAIL, '123456')).resolves.toBe(false)

    restore()
    const output = calls.flat().join(' ')
    expect(output).not.toContain(TEST_EMAIL)
    expect(output).not.toContain('123456')
  })
})

describe('createUserCode — expiry, dedupe, and rate-limit arguments', () => {
  let restoreSecret: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreSecret = saveSecret(VALID_SECRET)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T18:00:00.000Z'))
    mockRpc.mockResolvedValue({ data: { status: 'inserted' }, error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreSecret()
    vi.restoreAllMocks()
  })

  it('asks the RPC for a code expiring in exactly ten minutes', async () => {
    await createUserCode(TEST_EMAIL)

    expect(mockRpc).toHaveBeenCalledWith(
      'create_user_otp_code_if_allowed',
      expect.objectContaining({ p_expires_at: '2026-08-24T18:10:00.000Z' }),
    )
  })

  it('keeps the dedupe and hourly abuse-limit arguments explicit', async () => {
    await createUserCode(TEST_EMAIL)

    expect(mockRpc).toHaveBeenCalledWith(
      'create_user_otp_code_if_allowed',
      expect.objectContaining({ p_dedupe_secs: 120, p_max_per_hour: 20 }),
    )
  })
})

// ── C. sql/72 static contract ─────────────────────────────────────────────────

describe('sql/72_auth_email_code_request_idempotency.sql — static contract', () => {
  let sql: string

  beforeEach(() => {
    sql = readFileSync(MIGRATION_SQL, 'utf-8')
  })

  it('defines create_user_otp_code_if_allowed', () => {
    expect(sql).toContain('create_user_otp_code_if_allowed')
  })

  it('declares SECURITY INVOKER', () => {
    expect(sql).toContain('SECURITY INVOKER')
  })

  it('sets search_path to empty string', () => {
    expect(sql).toContain("SET search_path = ''")
  })

  it('acquires per-email advisory transaction lock', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
  })

  it('dedupe check uses used_at IS NULL', () => {
    expect(sql).toMatch(/used_at\s+IS\s+NULL/)
  })

  it('dedupe check uses expires_at > now()', () => {
    expect(sql).toMatch(/expires_at\s+>\s+now\(\)/)
  })

  it('treats expires_at = now() as expired by keeping the comparison strict', () => {
    expect(sql).toMatch(/expires_at\s+>\s+now\(\)/)
    expect(sql).not.toMatch(/expires_at\s+>=\s+now\(\)/)
  })

  it('dedupe check uses make_interval with p_dedupe_secs', () => {
    expect(sql).toContain('p_dedupe_secs')
    expect(sql).toContain('make_interval')
  })

  it('rate limit check uses p_max_per_hour', () => {
    expect(sql).toContain('p_max_per_hour')
  })

  it('counts expired and used rows in the independent rolling-hour limit', () => {
    const rateLimitStart = sql.indexOf('-- Per-email hourly rate limit check.')
    const insertStart = sql.indexOf('-- All checks passed: insert the new code row.')
    const rateLimitSection = sql.slice(rateLimitStart, insertStart)

    expect(rateLimitSection).toMatch(/created_at\s+>=\s+now\(\)\s+-\s+INTERVAL '1 hour'/)
    expect(rateLimitSection).not.toMatch(/expires_at|used_at/)
  })

  it('inserts into auth_email_codes', () => {
    expect(sql).toContain('INSERT INTO public.auth_email_codes')
  })

  it('returns inserted status', () => {
    expect(sql).toContain("'inserted'")
  })

  it('returns recent_active status', () => {
    expect(sql).toContain("'recent_active'")
  })

  it('returns rate_limited status with retry_after', () => {
    expect(sql).toContain("'rate_limited'")
    expect(sql).toContain('retry_after')
  })

  it('returned JSON does not include p_code_hash key', () => {
    // json_build_object calls should not expose p_code_hash
    const returnStatements = sql.match(/RETURN json_build_object\([^;]+\);/g) ?? []
    for (const stmt of returnStatements) {
      expect(stmt).not.toContain('p_code_hash')
    }
  })

  it('REVOKEs EXECUTE from PUBLIC, anon, authenticated', () => {
    // Statement spans two lines — check key tokens separately
    expect(sql).toContain('REVOKE EXECUTE')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('GRANTs EXECUTE to service_role', () => {
    // Statement spans two lines — check key tokens separately
    expect(sql).toContain('GRANT EXECUTE')
    expect(sql).toContain('TO service_role')
  })

  it('does not GRANT EXECUTE to PUBLIC, anon, or authenticated', () => {
    // Only the REVOKE line has FROM PUBLIC/anon/authenticated; no TO clause targets them
    expect(sql).not.toContain('TO anon')
    expect(sql).not.toContain('TO authenticated')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.create_user_otp_code_if_allowed(text, text, timestamptz, int, int)\n  TO PUBLIC')
  })

  it('is transaction-wrapped (BEGIN ... COMMIT)', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
  })

  it('documents rollback instructions', () => {
    expect(sql).toContain('Rollback')
  })
})
