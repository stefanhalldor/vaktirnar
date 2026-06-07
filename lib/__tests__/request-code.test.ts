/**
 * Unit tests for app/api/auth-mvp/request-code/route.ts
 *
 * Covers:
 *   - Allowlisted email: creates code and sends email
 *   - Non-allowlisted email: inserts into login_waitlist, no code, no email
 *   - Duplicate waitlist entry: idempotent success (23505 is not an error)
 *   - API responses never reveal whitelist status (always { success: true })
 *   - Invalid payload: still returns success (no validation leak)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockIsAllowedEmail } = vi.hoisted(() => ({
  mockIsAllowedEmail: vi.fn(),
}))
vi.mock('@/lib/auth/allowlist', () => ({
  isAuthMvpAllowedEmail: mockIsAllowedEmail,
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

const { mockInsert, mockFrom, mockGetAdmin } = vi.hoisted(() => {
  const mockInsert = vi.fn()
  const mockFrom = vi.fn()
  const mockGetAdmin = vi.fn()
  return { mockInsert, mockFrom, mockGetAdmin }
})
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

import { POST } from '@/app/api/auth-mvp/request-code/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new Request('https://teskeid.is/api/auth-mvp/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ from: mockFrom })
  mockFrom.mockReturnValue({ insert: mockInsert })
  mockInsert.mockResolvedValue({ error: null })
  mockSendUserLoginCode.mockResolvedValue(undefined)
  mockCreateUserCode.mockResolvedValue('123456')
})

// ── Allowlisted email — OTP flow ──────────────────────────────────────────────

describe('POST /api/auth-mvp/request-code — allowlisted email', () => {
  it('returns { success: true }', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    const res = await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('creates an OTP code', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(mockCreateUserCode).toHaveBeenCalledWith('allowed@example.com')
  })

  it('sends a login email', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(mockSendUserLoginCode).toHaveBeenCalledWith('allowed@example.com', '123456')
  })

  it('does not insert into login_waitlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(mockFrom).not.toHaveBeenCalledWith('login_waitlist')
  })
})

// ── Non-allowlisted email — waitlist flow ─────────────────────────────────────

describe('POST /api/auth-mvp/request-code — non-allowlisted email', () => {
  it('returns { success: true }', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    const res = await POST(makeRequest({ email: 'unknown@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('inserts the normalized email into login_waitlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    await POST(makeRequest({ email: 'Unknown@Example.COM' }))
    expect(mockFrom).toHaveBeenCalledWith('login_waitlist')
    // zod schema lowercases and trims before insertion
    expect(mockInsert).toHaveBeenCalledWith({ email: 'unknown@example.com' })
  })

  it('does not create an OTP code', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    await POST(makeRequest({ email: 'unknown@example.com' }))
    expect(mockCreateUserCode).not.toHaveBeenCalled()
  })

  it('does not send a login email', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    await POST(makeRequest({ email: 'unknown@example.com' }))
    expect(mockSendUserLoginCode).not.toHaveBeenCalled()
  })
})

// ── Duplicate waitlist entry — idempotent success ─────────────────────────────

describe('POST /api/auth-mvp/request-code — duplicate waitlist entry', () => {
  it('returns { success: true } when the email is already on the waitlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    mockInsert.mockResolvedValue({ error: { code: '23505' } })
    const res = await POST(makeRequest({ email: 'existing@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})

// ── Response never reveals whitelist status ───────────────────────────────────

describe('POST /api/auth-mvp/request-code — no whitelist enumeration', () => {
  it('allowlisted and non-allowlisted emails both return the same { success: true } response', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    const res1 = await POST(makeRequest({ email: 'allowed@example.com' }))
    expect(await res1.json()).toEqual({ success: true })

    mockIsAllowedEmail.mockResolvedValue(false)
    const res2 = await POST(makeRequest({ email: 'unknown@example.com' }))
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
