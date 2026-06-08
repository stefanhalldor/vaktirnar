/**
 * Unit tests for lib/auth/ip-rate-limit.ts and sql/42_ip_rate_limit.sql
 *
 * Covers:
 *   - hashIp: HMAC structure, no raw IP in output, different IPs differ
 *   - checkIpRateLimit: allowed, blocked, fail-open cases
 *   - Secret validation: missing or short AUTH_CODE_SECRET fails open, no RPC call
 *   - Missing IP: empty string fails open, no RPC call
 *   - RPC called with correct arguments (ip_hash, window_date, p_max_requests)
 *   - windowDate used consistently for both hash and RPC argument
 *   - sql/42: static contract (SECURITY DEFINER, REVOKE/GRANT, RLS, transaction)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRpc, mockGetAdmin } = vi.hoisted(() => {
  const mockRpc      = vi.fn()
  const mockGetAdmin = vi.fn(() => ({ rpc: mockRpc }))
  return { mockRpc, mockGetAdmin }
})

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

import { hashIp, checkIpRateLimit } from '@/lib/auth/ip-rate-limit'

// ── Env helpers ───────────────────────────────────────────────────────────────

let savedSecret: string | undefined

beforeEach(() => {
  vi.clearAllMocks()
  savedSecret = process.env.AUTH_CODE_SECRET
  // 32-byte valid secret
  process.env.AUTH_CODE_SECRET = 'abcdefghijklmnopqrstuvwxyz123456'
})

afterEach(() => {
  if (savedSecret !== undefined) process.env.AUTH_CODE_SECRET = savedSecret
  else delete process.env.AUTH_CODE_SECRET
})

// ── hashIp ────────────────────────────────────────────────────────────────────

describe('hashIp', () => {
  const DATE   = '2026-06-08'
  const SECRET = 'abcdefghijklmnopqrstuvwxyz123456'

  it('returns a 64-char lowercase hex string', () => {
    expect(hashIp('1.2.3.4', DATE, SECRET)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not contain the raw IP address', () => {
    expect(hashIp('203.0.113.99', DATE, SECRET)).not.toContain('203.0.113.99')
  })

  it('produces different hashes for different IPs', () => {
    expect(hashIp('1.2.3.4', DATE, SECRET)).not.toBe(hashIp('1.2.3.5', DATE, SECRET))
  })

  it('is deterministic for the same inputs', () => {
    expect(hashIp('10.0.0.1', DATE, SECRET)).toBe(hashIp('10.0.0.1', DATE, SECRET))
  })

  it('produces different hashes for different dates (key rotation)', () => {
    expect(hashIp('1.2.3.4', '2026-06-08', SECRET))
      .not.toBe(hashIp('1.2.3.4', '2026-06-09', SECRET))
  })
})

// ── AUTH_CODE_SECRET validation ───────────────────────────────────────────────

describe('checkIpRateLimit — AUTH_CODE_SECRET validation', () => {
  it('returns true and does not call RPC when AUTH_CODE_SECRET is missing', async () => {
    delete process.env.AUTH_CODE_SECRET
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns true and does not call RPC when AUTH_CODE_SECRET is empty string', async () => {
    process.env.AUTH_CODE_SECRET = ''
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns true and does not call RPC when AUTH_CODE_SECRET is shorter than 32 bytes', async () => {
    process.env.AUTH_CODE_SECRET = 'tooshort'
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns true and does not call RPC when AUTH_CODE_SECRET is exactly 31 bytes', async () => {
    process.env.AUTH_CODE_SECRET = 'a'.repeat(31)
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('proceeds to RPC when AUTH_CODE_SECRET is exactly 32 bytes', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    process.env.AUTH_CODE_SECRET = 'a'.repeat(32)
    await checkIpRateLimit('1.2.3.4')
    expect(mockRpc).toHaveBeenCalled()
  })
})

// ── Missing IP ────────────────────────────────────────────────────────────────

describe('checkIpRateLimit — missing IP', () => {
  it('returns true and does not call RPC when IP is empty string', async () => {
    expect(await checkIpRateLimit('')).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ── Allowed ───────────────────────────────────────────────────────────────────

describe('checkIpRateLimit — allowed', () => {
  it('returns true when RPC returns true', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
  })

  it('calls the RPC with the correct function name', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('1.2.3.4')
    expect(mockRpc).toHaveBeenCalledWith('check_and_increment_ip_rate_limit', expect.any(Object))
  })

  it('passes a 64-char hex ip_hash', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('5.6.7.8')
    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('passes a YYYY-MM-DD window_date', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('5.6.7.8')
    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_window_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('passes p_max_requests = 10', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('5.6.7.8')
    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_max_requests).toBe(10)
  })

  it('p_ip_hash and p_window_date are derived from the same date', async () => {
    // Both fields must be consistent: the hash must equal hashIp(ip, window_date, secret)
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('9.9.9.9')
    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>
    const expectedHash = hashIp('9.9.9.9', args.p_window_date as string, process.env.AUTH_CODE_SECRET!)
    expect(args.p_ip_hash).toBe(expectedHash)
  })

  it('passes different ip_hash values for different IPs', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await checkIpRateLimit('1.1.1.1')
    await checkIpRateLimit('2.2.2.2')
    const h1 = (mockRpc.mock.calls[0][1] as Record<string, unknown>).p_ip_hash
    const h2 = (mockRpc.mock.calls[1][1] as Record<string, unknown>).p_ip_hash
    expect(h1).not.toBe(h2)
  })
})

// ── Blocked ───────────────────────────────────────────────────────────────────

describe('checkIpRateLimit — blocked', () => {
  it('returns false when RPC returns false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    expect(await checkIpRateLimit('1.2.3.4')).toBe(false)
  })
})

// ── Fail open on error ────────────────────────────────────────────────────────

describe('checkIpRateLimit — fail open on error', () => {
  it('returns true when RPC returns an error object', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'db error' } })
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
  })

  it('returns true when RPC rejects', async () => {
    mockRpc.mockRejectedValue(new Error('connection refused'))
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
  })

  it('returns true when getAdmin() throws', async () => {
    mockGetAdmin.mockImplementationOnce(() => { throw new Error('admin init failed') })
    expect(await checkIpRateLimit('1.2.3.4')).toBe(true)
  })
})

// ── sql/42_ip_rate_limit.sql — static contract ───────────────────────────────

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe as describeSql, it as itSql, expect as expectSql } from 'vitest'

const SQL42 = readFileSync(
  join(__dirname, '..', '..', 'sql', '42_ip_rate_limit.sql'),
  'utf-8',
)

describeSql('sql/42_ip_rate_limit.sql — static contract', () => {
  itSql('defines check_and_increment_ip_rate_limit', () => {
    expectSql(SQL42).toContain('check_and_increment_ip_rate_limit')
  })

  itSql('declares SECURITY DEFINER', () => {
    expectSql(SQL42).toContain('SECURITY DEFINER')
  })

  itSql('sets search_path = public', () => {
    expectSql(SQL42).toContain('SET search_path = public')
  })

  itSql('creates the otp_ip_rate_limit table', () => {
    expectSql(SQL42).toContain('otp_ip_rate_limit')
  })

  itSql('enables RLS on the table', () => {
    expectSql(SQL42).toContain('ENABLE ROW LEVEL SECURITY')
  })

  itSql('creates index on window_date for bounded cleanup', () => {
    expectSql(SQL42).toContain('otp_ip_rate_limit_window_date_idx')
  })

  itSql('bounded DELETE uses LIMIT 100', () => {
    expectSql(SQL42).toContain('LIMIT  100')
  })

  itSql('REVOKEs EXECUTE from PUBLIC', () => {
    expectSql(SQL42).toMatch(/REVOKE\s+EXECUTE[\s\S]*FROM[\s\S]*PUBLIC/)
  })

  itSql('REVOKEs EXECUTE from anon', () => {
    expectSql(SQL42).toMatch(/REVOKE\s+EXECUTE[\s\S]*anon/)
  })

  itSql('REVOKEs EXECUTE from authenticated', () => {
    expectSql(SQL42).toMatch(/REVOKE\s+EXECUTE[\s\S]*authenticated/)
  })

  itSql('GRANTs EXECUTE to service_role', () => {
    expectSql(SQL42).toMatch(/GRANT\s+EXECUTE[\s\S]*service_role/)
  })

  itSql('does not GRANT EXECUTE to PUBLIC, anon or authenticated', () => {
    const grantLines = SQL42.split('\n').filter((l) => l.trimStart().startsWith('GRANT') && l.includes('EXECUTE'))
    for (const line of grantLines) {
      expectSql(line).not.toMatch(/\b(PUBLIC|anon|authenticated)\b/)
    }
  })

  itSql('REVOKEs table access from PUBLIC, anon, authenticated', () => {
    expectSql(SQL42).toMatch(/REVOKE\s+ALL\s+ON\s+public\.otp_ip_rate_limit[\s\S]*PUBLIC[\s\S]*anon[\s\S]*authenticated/)
  })

  itSql('GRANTs table access to service_role', () => {
    expectSql(SQL42).toMatch(/GRANT[\s\S]*ON\s+public\.otp_ip_rate_limit\s+TO\s+service_role/)
  })

  itSql('is wrapped in a transaction (BEGIN … COMMIT)', () => {
    expectSql(SQL42).toContain('BEGIN;')
    expectSql(SQL42).toContain('COMMIT;')
  })

  itSql('stores no raw IP addresses (ip_hash column, not ip)', () => {
    expectSql(SQL42).toContain('ip_hash')
    expectSql(SQL42).not.toMatch(/\bip\s+TEXT\b/)
  })
})
