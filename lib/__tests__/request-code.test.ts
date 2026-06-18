/**
 * Unit tests for app/api/auth-mvp/request-code/route.ts
 *
 * Covers:
 *   - Valid email: creates code and sends email
 *   - API responses never reveal rate-limit status (always { success: true })
 *   - Invalid payload: still returns success (no validation leak)
 *   - IP rate-limit: blocked IPs return { success: true } without further work
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockCheckIpRateLimit } = vi.hoisted(() => ({
  mockCheckIpRateLimit: vi.fn(),
}))
vi.mock('@/lib/auth/ip-rate-limit', () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
}))

const { mockCreateUserCode } = vi.hoisted(() => ({
  mockCreateUserCode: vi.fn(),
}))
vi.mock('@/lib/auth/user-codes', () => ({
  createUserCode: mockCreateUserCode,
}))

const { mockSendUserLoginCode } = vi.hoisted(() => ({
  mockSendUserLoginCode: vi.fn(),
}))
vi.mock('@/lib/auth/email', () => ({
  sendUserLoginCode: mockSendUserLoginCode,
}))

import { POST } from '@/app/api/auth-mvp/request-code/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new Request('https://teskeid.is/api/auth-mvp/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckIpRateLimit.mockResolvedValue(true) // allowed by default
  mockSendUserLoginCode.mockResolvedValue(undefined)
  mockCreateUserCode.mockResolvedValue('123456')
})

// ── Valid email — OTP flow ────────────────────────────────────────────────────

describe('POST /api/auth-mvp/request-code — valid email', () => {
  it('returns { success: true }', async () => {
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('creates an OTP code', async () => {
    await POST(makeRequest({ email: 'user@example.com' }))
    expect(mockCreateUserCode).toHaveBeenCalledWith('user@example.com')
  })

  it('sends a login email', async () => {
    await POST(makeRequest({ email: 'user@example.com' }))
    expect(mockSendUserLoginCode).toHaveBeenCalledWith('user@example.com', '123456')
  })

  it('normalizes email to lowercase', async () => {
    await POST(makeRequest({ email: 'User@Example.COM' }))
    expect(mockCreateUserCode).toHaveBeenCalledWith('user@example.com')
  })
})

// ── Response never reveals internals ─────────────────────────────────────────

describe('POST /api/auth-mvp/request-code — no information leak', () => {
  it('always returns { success: true } for any email', async () => {
    const res1 = await POST(makeRequest({ email: 'a@example.com' }))
    expect(await res1.json()).toEqual({ success: true })

    const res2 = await POST(makeRequest({ email: 'b@example.com' }))
    expect(await res2.json()).toEqual({ success: true })

    expect(res1.status).toBe(res2.status)
  })

  it('invalid email payload returns { success: true } (no validation leak)', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('empty payload returns { success: true }', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})

// ── IP rate-limit ─────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/request-code — IP rate-limit', () => {
  it('returns success:true with rateLimited:true and retryAfter when IP rate-limited', async () => {
    mockCheckIpRateLimit.mockResolvedValue(false)
    const res = await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.rateLimited).toBe(true)
    expect(typeof body.retryAfter).toBe('string')
  })

  it('does not create a code when rate-limited', async () => {
    mockCheckIpRateLimit.mockResolvedValue(false)
    await POST(makeRequest({ email: 'user@example.com' }))
    expect(mockCreateUserCode).not.toHaveBeenCalled()
  })

  it('does not send email when rate-limited', async () => {
    mockCheckIpRateLimit.mockResolvedValue(false)
    await POST(makeRequest({ email: 'user@example.com' }))
    expect(mockSendUserLoginCode).not.toHaveBeenCalled()
  })

  it('retryAfter is next midnight UTC (Reykjavik timezone)', async () => {
    mockCheckIpRateLimit.mockResolvedValue(false)
    const before = Date.now()
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    const body = await res.json()
    const retryAfter = new Date(body.retryAfter).getTime()
    // retryAfter must be in the future and within 48 hours
    expect(retryAfter).toBeGreaterThan(before)
    expect(retryAfter).toBeLessThan(before + 48 * 60 * 60 * 1000)
    // Must be exactly midnight UTC
    const d = new Date(body.retryAfter)
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
  })
})

// ── IP extraction ─────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/request-code — IP extraction', () => {
  it('passes the first x-forwarded-for IP to checkIpRateLimit', async () => {
    await POST(makeRequest({ email: 'x@x.com' }, { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith('1.2.3.4')
  })

  it('trims whitespace from the extracted x-forwarded-for IP', async () => {
    await POST(makeRequest({ email: 'x@x.com' }, { 'x-forwarded-for': '  9.8.7.6  , 1.1.1.1' }))
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith('9.8.7.6')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    await POST(makeRequest({ email: 'x@x.com' }, { 'x-real-ip': '10.0.0.1' }))
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith('10.0.0.1')
  })

  it('passes empty string to checkIpRateLimit when no IP header is present', async () => {
    await POST(makeRequest({ email: 'x@x.com' }))
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith('')
  })
})
