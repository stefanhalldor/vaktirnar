import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createGuestCapabilityForRequest,
  digestBookingToken,
  verifiedCanonicalEmail,
} from '../security.server'
import { createBookingRateLimitInput } from '../rate-limit.server'
import {
  bookingActionSchema,
  bookingMessageListQuerySchema,
  bookingProviderListQuerySchema,
  bookingPublicIdSchema,
  bookingWorkflowGraphInputSchema,
  createBookingRequestSchema,
  resolveRequestedStartUtc,
} from '../validation'

const REQUEST_ID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  process.env.AUTH_CODE_SECRET = 'booking-test-secret-that-is-at-least-32-bytes'
  delete process.env.BOOKINGS_PUBLIC_IP_DAILY_LIMIT
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.BOOKINGS_PUBLIC_IP_DAILY_LIMIT
})

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    businessProfileSlug: 'quizbadour',
    requestId: REQUEST_ID,
    requestedDate: '2026-09-12',
    requestedTime: '18:30',
    contactName: 'Stebbi',
    contactEmail: 'stebbi@example.com',
    contactPhone: '5551234',
    message: 'Mig langar að bóka kvöldið.',
    website: '',
    ...overrides,
  }
}

describe('booking public validation', () => {
  it('canonicalizes every UUID spelling before HMAC, cookie or database use', () => {
    expect(bookingPublicIdSchema.parse(REQUEST_ID.toUpperCase())).toBe(REQUEST_ID)
    const parsed = createBookingRequestSchema.parse(validCreate({
      requestId: REQUEST_ID.toUpperCase(),
    }))
    expect(parsed.requestId).toBe(REQUEST_ID)
    expect(createGuestCapabilityForRequest('quizbadour', parsed.requestId)).toEqual(
      createGuestCapabilityForRequest('quizbadour', REQUEST_ID),
    )
  })

  it('requires a non-empty message and caps it at the UI/SQL limit', () => {
    expect(createBookingRequestSchema.safeParse(validCreate({ message: '  ' })).success).toBe(false)
    expect(createBookingRequestSchema.safeParse(validCreate({ message: 'x'.repeat(1_000) })).success).toBe(true)
    expect(createBookingRequestSchema.safeParse(validCreate({ message: 'x'.repeat(1_001) })).success).toBe(false)
  })

  it('requires a contact phone while keeping the requested time mandatory', () => {
    expect(createBookingRequestSchema.safeParse(validCreate({ contactPhone: null })).success).toBe(false)
    expect(createBookingRequestSchema.safeParse(validCreate({ contactPhone: '  ' })).success).toBe(false)
    expect(createBookingRequestSchema.safeParse(validCreate({ requestedTime: '' })).success).toBe(false)
    expect(createBookingRequestSchema.safeParse(validCreate({
      contactPhone: '5551234',
      requestedTime: '21:15',
    })).success).toBe(true)
  })

  it('caps contact, claim and member email addresses at 254 characters', () => {
    const longEmail = `${'a'.repeat(243)}@example.com`
    expect(longEmail).toHaveLength(255)
    expect(createBookingRequestSchema.safeParse(validCreate({ contactEmail: longEmail })).success).toBe(false)
    expect(bookingActionSchema.safeParse({
      action: 'claim',
      expectedAccessVersion: 1,
      additionalEmails: [longEmail],
      idempotencyKey: REQUEST_ID,
    }).success).toBe(false)
    expect(bookingActionSchema.safeParse({
      action: 'addMember',
      expectedAccessVersion: 1,
      email: longEmail,
      role: 'member',
      idempotencyKey: REQUEST_ID,
    }).success).toBe(false)
  })

  it('reserves one of ten booking member slots for the claimant', () => {
    const base = {
      action: 'claim' as const,
      expectedAccessVersion: 1,
      idempotencyKey: REQUEST_ID,
    }
    const emails = Array.from({ length: 10 }, (_, index) => `person${index}@example.com`)
    expect(bookingActionSchema.safeParse({ ...base, additionalEmails: emails.slice(0, 9) }).success)
      .toBe(true)
    expect(bookingActionSchema.safeParse({ ...base, additionalEmails: emails }).success)
      .toBe(false)
  })

  it('accepts revoke by member id only and rejects a client-supplied email', () => {
    const payload = {
      action: 'revokeMember',
      expectedAccessVersion: 2,
      memberId: REQUEST_ID,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    }
    expect(bookingActionSchema.safeParse(payload).success).toBe(true)
    expect(bookingActionSchema.safeParse({ ...payload, email: 'victim@example.com' }).success).toBe(false)
  })

  it('accepts only public cancellation reasons and never legacy or free text', () => {
    const base = {
      action: 'cancel' as const,
      expectedRevision: 2,
      idempotencyKey: REQUEST_ID,
    }
    expect(bookingActionSchema.safeParse({ ...base, reason: 'provider_unavailable' }).success).toBe(true)
    expect(bookingActionSchema.safeParse({ ...base, reason: 'legacy_unspecified' }).success).toBe(false)
    expect(bookingActionSchema.safeParse({ ...base, reason: 'other', explanation: 'private note' }).success)
      .toBe(false)
  })

  it('accepts only an opaque target for provider workflow transitions', () => {
    const payload = {
      action: 'transitionWorkflow' as const,
      expectedRevision: 2,
      targetStateId: '00000000-0000-4000-8000-000000000002',
      idempotencyKey: REQUEST_ID,
    }
    expect(bookingActionSchema.safeParse(payload).success).toBe(true)
    expect(bookingActionSchema.safeParse({
      ...payload,
      actorUserId: '00000000-0000-4000-8000-000000000003',
      fromStateId: '00000000-0000-4000-8000-000000000004',
    }).success).toBe(false)
  })

  it('keeps translated defaults distinct from bounded custom labels', () => {
    const base = {
      id: REQUEST_ID,
      logicalKey: 'new_request',
      sortOrder: 0,
      isInitial: true,
      semanticKind: 'active' as const,
      attentionSide: 'provider' as const,
    }
    expect(bookingWorkflowGraphInputSchema.safeParse({
      states: [{ ...base, systemLabelKey: 'new_request', providerLabel: null, customerLabel: null }],
      transitions: [],
    }).success).toBe(true)
    expect(bookingWorkflowGraphInputSchema.safeParse({
      states: [{ ...base, systemLabelKey: null, providerLabel: 'Sérstaða', customerLabel: null }],
      transitions: [],
    }).success).toBe(false)
    expect(bookingWorkflowGraphInputSchema.safeParse({
      states: [{ ...base, systemLabelKey: null, providerLabel: 'Ógilt\nheiti', customerLabel: 'Heiti' }],
      transitions: [],
    }).success).toBe(false)
    expect(bookingWorkflowGraphInputSchema.safeParse({
      states: [{ ...base, systemLabelKey: null, providerLabel: '<b>Staða</b>', customerLabel: '**Staða**' }],
      transitions: [],
    }).success).toBe(false)
  })

  it('requires a stable timestamp/id cursor pair', () => {
    expect(bookingMessageListQuerySchema.safeParse({
      before: '2026-08-11T10:00:00.000Z',
      limit: '20',
    }).success).toBe(false)
    expect(bookingMessageListQuerySchema.safeParse({
      before: '2026-08-11T10:00:00.000Z',
      beforeId: REQUEST_ID,
      limit: '20',
    }).success).toBe(true)
  })

  it('rejects impossible, past and excessively distant local times', () => {
    expect(resolveRequestedStartUtc('2026-02-30', '12:00', 'Atlantic/Reykjavik', {
      now: new Date('2026-01-01T00:00:00.000Z'),
    })).toBeNull()
    expect(resolveRequestedStartUtc('2025-12-31', '12:00', 'Atlantic/Reykjavik', {
      now: new Date('2026-01-01T00:00:00.000Z'),
    })).toBeNull()
    expect(resolveRequestedStartUtc('2030-01-01', '12:00', 'Atlantic/Reykjavik', {
      now: new Date('2026-01-01T00:00:00.000Z'),
    })).toBeNull()
    expect(resolveRequestedStartUtc('2026-02-01', '12:00', 'Atlantic/Reykjavik', {
      now: new Date('2026-01-01T00:00:00.000Z'),
    })).toBe('2026-02-01T12:00:00.000Z')
  })

  it('accepts the exact 548-day instant and rejects the next provider-local minute', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    expect(resolveRequestedStartUtc('2027-07-03', '12:00', 'Atlantic/Reykjavik', { now }))
      .toBe('2027-07-03T12:00:00.000Z')
    expect(resolveRequestedStartUtc('2027-07-03', '12:01', 'Atlantic/Reykjavik', { now }))
      .toBeNull()
  })

  it('rejects a DST gap and resolves an ambiguous provider-local time consistently', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(resolveRequestedStartUtc('2026-03-29', '02:30', 'Europe/Copenhagen', { now }))
      .toBeNull()
    expect(resolveRequestedStartUtc('2026-10-25', '02:30', 'Europe/Copenhagen', { now }))
      .toBe('2026-10-25T01:30:00.000Z')
    expect(resolveRequestedStartUtc('2026-11-01', '01:30', 'America/New_York', { now }))
      .toBe('2026-11-01T05:30:00.000Z')
  })
})

describe('provider inbox filter validation', () => {
  it('requires an opaque workflow id and logical key as one filter pair', () => {
    expect(bookingProviderListQuerySchema.safeParse({
      workflowId: REQUEST_ID,
      stateLogicalKey: 'new_request',
      attentionSide: 'customer',
    }).success).toBe(true)
    expect(bookingProviderListQuerySchema.safeParse({ workflowId: REQUEST_ID }).success).toBe(false)
    expect(bookingProviderListQuerySchema.safeParse({ stateLogicalKey: 'new_request' }).success).toBe(false)
    expect(bookingProviderListQuerySchema.safeParse({
      workflowId: REQUEST_ID,
      stateLogicalKey: 'Provider label',
    }).success).toBe(false)
  })
})

describe('booking capability and rate-limit inputs', () => {
  it('derives a deterministic opaque guest capability without persisting the raw token', () => {
    const first = createGuestCapabilityForRequest('quizbadour', REQUEST_ID)
    const replay = createGuestCapabilityForRequest('quizbadour', REQUEST_ID)
    const otherProvider = createGuestCapabilityForRequest('annar', REQUEST_ID)
    expect(first).toEqual(replay)
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(first.digest).toBe(digestBookingToken(first.token))
    expect(otherProvider.token).not.toBe(first.token)
  })

  it('treats only a confirmed auth email as a signed-in booking identity', () => {
    expect(verifiedCanonicalEmail({
      id: 'user-1',
      email: 'First.Last+tag@gmail.com',
      email_confirmed_at: '2026-08-11T00:00:00.000Z',
    } as never)).toBe('firstlast+tag@gmail.com')
    expect(verifiedCanonicalEmail({
      id: 'user-1',
      email: 'user@example.com',
      email_confirmed_at: null,
    } as never)).toBeNull()
  })

  it('fails closed without an IP in production but uses one shared localhost bucket outside production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL', '1')
    expect(createBookingRateLimitInput(
      new NextRequest('https://teskeid.is/api/bookings/public/requests'),
      REQUEST_ID,
    )).toBeNull()

    vi.stubEnv('NODE_ENV', 'test')
    const local = createBookingRateLimitInput(
      new NextRequest('http://localhost/api/bookings/public/requests'),
      REQUEST_ID,
    )
    expect(local).toMatchObject({ maxRequests: 20 })
    expect(local?.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses only Vercel-authored client addressing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL', '1')
    const spoofableOnly = new NextRequest('https://teskeid.is/api/bookings/public/requests', {
      headers: { 'x-forwarded-for': '203.0.113.44' },
    })
    expect(createBookingRateLimitInput(spoofableOnly, REQUEST_ID)).toBeNull()

    const vercel = new NextRequest('https://teskeid.is/api/bookings/public/requests', {
      headers: {
        'x-forwarded-for': '198.51.100.99',
        'x-vercel-forwarded-for': '203.0.113.44',
      },
    })
    expect(createBookingRateLimitInput(vercel, REQUEST_ID)?.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('scopes the daily HMAC by provider/service and never carries the raw IP', () => {
    const request = new NextRequest('https://teskeid.is/api/bookings/public/requests', {
      headers: { 'x-forwarded-for': '203.0.113.44' },
    })
    const first = createBookingRateLimitInput(request, REQUEST_ID)
    const second = createBookingRateLimitInput(
      request,
      '00000000-0000-4000-8000-000000000002',
    )
    expect(first?.hash).not.toContain('203.0.113.44')
    expect(first?.hash).not.toBe(second?.hash)
  })

  it('fails closed on a weak secret and caps configured intake quota', () => {
    const request = new NextRequest('https://teskeid.is/api/bookings/public/requests', {
      headers: { 'x-forwarded-for': '203.0.113.44' },
    })
    process.env.AUTH_CODE_SECRET = 'short'
    expect(createBookingRateLimitInput(request, REQUEST_ID)).toBeNull()
    process.env.AUTH_CODE_SECRET = 'booking-test-secret-that-is-at-least-32-bytes'
    process.env.BOOKINGS_PUBLIC_IP_DAILY_LIMIT = '999999'
    expect(createBookingRateLimitInput(request, REQUEST_ID)?.maxRequests).toBe(1_000)
  })
})
