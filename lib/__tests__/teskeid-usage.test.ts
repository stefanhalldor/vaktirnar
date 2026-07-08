/**
 * Unit tests for lib/teskeid/usage.server.ts
 *
 * Tests sanitizeUsageMetadata and routePairFingerprint as pure functions,
 * plus recordTeskeidUsageEvent insert behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}))

const { mockInsert } = vi.hoisted(() => ({ mockInsert: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
  })),
}))

import { sanitizeUsageMetadata, routePairFingerprint, recordTeskeidUsageEvent } from '@/lib/teskeid/usage.server'

// ── sanitizeUsageMetadata ──────────────────────────────────────────────────────

describe('sanitizeUsageMetadata', () => {
  it('passes through safe scalar fields', () => {
    expect(sanitizeUsageMetadata({ routeCount: 2, provider: 'google', flag: true }))
      .toEqual({ routeCount: 2, provider: 'google', flag: true })
  })

  it('strips keys matching email', () => {
    expect(sanitizeUsageMetadata({ email: 'a@b.com', routeCount: 1 }))
      .not.toHaveProperty('email')
  })

  it('strips keys matching lat / lon', () => {
    const result = sanitizeUsageMetadata({ lat: 64.1, lon: -21.9, routeCount: 1 })
    expect(result).not.toHaveProperty('lat')
    expect(result).not.toHaveProperty('lon')
    expect(result).toEqual({ routeCount: 1 })
  })

  it('strips keys matching place', () => {
    expect(sanitizeUsageMetadata({ placeName: 'Garðabær', routeCount: 1 }))
      .not.toHaveProperty('placeName')
  })

  it('strips keys matching forecast', () => {
    expect(sanitizeUsageMetadata({ forecastHour: '14:00', routeCount: 1 }))
      .not.toHaveProperty('forecastHour')
  })

  it('strips keys matching secret / token', () => {
    const result = sanitizeUsageMetadata({ apiSecret: 'x', authToken: 'y', routeCount: 1 })
    expect(result).not.toHaveProperty('apiSecret')
    expect(result).not.toHaveProperty('authToken')
    expect(result).toEqual({ routeCount: 1 })
  })

  it('strips string values exceeding 200 characters', () => {
    const long = 'x'.repeat(201)
    expect(sanitizeUsageMetadata({ desc: long })).not.toHaveProperty('desc')
  })

  it('allows string arrays of safe short values', () => {
    const result = sanitizeUsageMetadata({ curatedRouteLabels: ['CURATED_VIA_THRENGSLAVEGUR'] })
    expect(result).toEqual({ curatedRouteLabels: ['CURATED_VIA_THRENGSLAVEGUR'] })
  })

  it('drops nested objects', () => {
    expect(sanitizeUsageMetadata({ nested: { key: 'value' } })).not.toHaveProperty('nested')
  })

  it('returns empty object when all keys are blocked', () => {
    expect(sanitizeUsageMetadata({ email: 'a@b.com', lat: 64 })).toEqual({})
  })
})

// ── routePairFingerprint ───────────────────────────────────────────────────────

describe('routePairFingerprint', () => {
  const ORIGIN = { lat: 64.135, lon: -21.895 }
  const DEST   = { lat: 63.933, lon: -21.0 }
  const DEST2  = { lat: 65.682, lon: -18.085 }

  beforeEach(() => {
    process.env.USAGE_EVENT_SECRET = 'test-secret-for-fingerprint'
  })

  afterEach(() => {
    delete process.env.USAGE_EVENT_SECRET
  })

  it('returns null when USAGE_EVENT_SECRET is not set', () => {
    delete process.env.USAGE_EVENT_SECRET
    expect(routePairFingerprint(ORIGIN, DEST)).toBeNull()
  })

  it('returns a 64-char hex string (SHA-256) when secret is set', () => {
    expect(routePairFingerprint(ORIGIN, DEST)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same pair', () => {
    expect(routePairFingerprint(ORIGIN, DEST)).toBe(routePairFingerprint(ORIGIN, DEST))
  })

  it('changes when destination changes', () => {
    expect(routePairFingerprint(ORIGIN, DEST)).not.toBe(routePairFingerprint(ORIGIN, DEST2))
  })

  it('changes when origin changes', () => {
    const other = { lat: 64.0, lon: -22.0 }
    expect(routePairFingerprint(ORIGIN, DEST)).not.toBe(routePairFingerprint(other, DEST))
  })

  it('treats coordinates within toFixed(3) as the same pair', () => {
    // Same to 3 decimal places → same fingerprint
    const a = routePairFingerprint({ lat: 64.1351, lon: -21.8951 }, DEST)
    const b = routePairFingerprint({ lat: 64.135, lon: -21.895 }, DEST)
    expect(a).toBe(b)
  })
})

// ── recordTeskeidUsageEvent ────────────────────────────────────────────────────

describe('recordTeskeidUsageEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls insert with sanitized metadata', async () => {
    mockInsert.mockResolvedValue({ error: null })
    await recordTeskeidUsageEvent({
      userId: 'u1',
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      path: '/api/teskeid/weather/travel/routes',
      metadata: { routeCount: 2, provider: 'google' },
    })
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      feature_key: 'vedrid',
      event_name: 'weather_route_options_calculated',
      metadata: { routeCount: 2, provider: 'google' },
    }))
  })

  it('swallows insert errors and does not throw', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } })
    await expect(recordTeskeidUsageEvent({ userId: 'u1', featureKey: 'vedrid', eventName: 'test' }))
      .resolves.toBeUndefined()
  })

  it('swallows thrown exceptions and does not rethrow', async () => {
    mockInsert.mockRejectedValue(new Error('network'))
    await expect(recordTeskeidUsageEvent({ userId: 'u1', featureKey: 'vedrid', eventName: 'test' }))
      .resolves.toBeUndefined()
  })

  it('uses empty object metadata when none provided', async () => {
    mockInsert.mockResolvedValue({ error: null })
    await recordTeskeidUsageEvent({ userId: 'u1', featureKey: 'vedrid', eventName: 'test' })
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: {} }))
  })

  it('strips blocked metadata keys before insert', async () => {
    mockInsert.mockResolvedValue({ error: null })
    await recordTeskeidUsageEvent({
      userId: 'u1',
      featureKey: 'vedrid',
      eventName: 'test',
      metadata: { lat: 64, routeCount: 1 },
    })
    const inserted = mockInsert.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(inserted.metadata).not.toHaveProperty('lat')
    expect(inserted.metadata).toHaveProperty('routeCount', 1)
  })
})
