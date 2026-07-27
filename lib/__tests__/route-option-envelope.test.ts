import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RouteOption } from '@/lib/weather/provider.types'
import {
  signRouteOptionEnvelope,
  verifyRouteOptionEnvelope,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'

const SECRET = 'route-envelope-test-secret-that-is-at-least-32-bytes'
const NOW = new Date('2026-07-26T22:30:00.000Z')
const ORIGIN = { lat: 64.1466, lon: -21.9426 }
const DESTINATION = { lat: 65.6885, lon: -18.1262 }

const ROUTE: RouteOption = {
  id: 'teskeid-road-graph-v1',
  routeIndex: -1,
  provider: 'teskeid',
  labels: ['TESKEID_EXPERIMENTAL', 'TESKEID_DERIVED_DURATION'],
  isDefault: false,
  points: [ORIGIN, { lat: 64.8, lon: -20.3 }, DESTINATION],
  providerMatchingPoints: [ORIGIN, { lat: 64.8, lon: -20.3 }, DESTINATION],
  distanceM: 389_000,
  durationS: 16_500,
  cautions: [{
    id: 'wind-sensitive',
    severity: 'caution',
    labelKey: 'teskeid.routes.cautions.windSensitive',
    appliesTo: ['all'],
  }],
  experimental: {
    derivedDuration: true,
    surface: { pavedM: 380_000, gravelM: 9_000, mixedM: 0, unknownM: 0 },
  },
}

describe('route option envelope', () => {
  const savedSecret = process.env.AUTH_CODE_SECRET

  beforeEach(() => {
    process.env.AUTH_CODE_SECRET = SECRET
  })

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.AUTH_CODE_SECRET
    else process.env.AUTH_CODE_SECRET = savedSecret
  })

  it('signs for 15 minutes and verifies the expected endpoints', () => {
    const envelope = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )

    expect(envelope).toMatchObject({
      version: 1,
      issuedAt: '2026-07-26T22:30:00.000Z',
      expiresAt: '2026-07-26T22:45:00.000Z',
      origin: ORIGIN,
      destination: DESTINATION,
      route: ROUTE,
    })
    expect(envelope.signature).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyRouteOptionEnvelope(
      envelope,
      { origin: ORIGIN, destination: DESTINATION },
      { now: new Date('2026-07-26T22:44:59.999Z') },
    )).toEqual(envelope)
  })

  it('rejects route tampering and endpoint mismatches', () => {
    const envelope = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )

    const tampered = structuredClone(envelope)
    tampered.route.durationS -= 1_000
    expect(verifyRouteOptionEnvelope(
      tampered,
      { origin: ORIGIN, destination: DESTINATION },
      { now: NOW },
    )).toBeNull()

    expect(verifyRouteOptionEnvelope(
      envelope,
      { origin: { ...ORIGIN, lat: ORIGIN.lat + 0.001 }, destination: DESTINATION },
      { now: NOW },
    )).toBeNull()
  })

  it('rejects expired, future-issued, and malformed envelopes', () => {
    const expired = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW, ttlMs: 1_000 },
    )
    expect(verifyRouteOptionEnvelope(
      expired,
      { origin: ORIGIN, destination: DESTINATION },
      { now: new Date(NOW.getTime() + 1_000) },
    )).toBeNull()

    const future = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: new Date(NOW.getTime() + 31_000) },
    )
    expect(verifyRouteOptionEnvelope(
      future,
      { origin: ORIGIN, destination: DESTINATION },
      { now: NOW },
    )).toBeNull()

    expect(verifyRouteOptionEnvelope(
      { ...expired, signature: 'not-a-signature' },
      { origin: ORIGIN, destination: DESTINATION },
      { now: NOW },
    )).toBeNull()
    expect(verifyRouteOptionEnvelope(null, { origin: ORIGIN, destination: DESTINATION })).toBeNull()
  })

  it('enforces bounded route structure and TTL', () => {
    const tooManyPoints: RouteOption = {
      ...ROUTE,
      points: Array.from({ length: 25_001 }, () => ORIGIN),
    }

    expect(() => signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: tooManyPoints,
    }, { now: NOW })).toThrow('Invalid route option envelope input')

    expect(() => signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: ROUTE,
    }, { now: NOW, ttlMs: 15 * 60 * 1_000 + 1 })).toThrow('15 minutes')
  })

  it('fails closed without a secret and refuses a short signing secret', () => {
    const envelope = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )

    delete process.env.AUTH_CODE_SECRET
    expect(verifyRouteOptionEnvelope(
      envelope,
      { origin: ORIGIN, destination: DESTINATION },
      { now: NOW },
    )).toBeNull()
    expect(() => signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )).toThrow('AUTH_CODE_SECRET is not configured')

    process.env.AUTH_CODE_SECRET = 'short'
    expect(() => signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )).toThrow('at least 32 bytes')
  })

  it('uses canonical payload ordering during verification', () => {
    const envelope = signRouteOptionEnvelope(
      { origin: ORIGIN, destination: DESTINATION, route: ROUTE },
      { now: NOW },
    )
    const reordered = {
      signature: envelope.signature,
      route: { ...envelope.route },
      destination: envelope.destination,
      origin: envelope.origin,
      expiresAt: envelope.expiresAt,
      issuedAt: envelope.issuedAt,
      version: envelope.version,
    }

    expect(verifyRouteOptionEnvelope(
      reordered,
      { origin: ORIGIN, destination: DESTINATION },
      { now: NOW },
    )).toEqual(reordered)
  })
})
