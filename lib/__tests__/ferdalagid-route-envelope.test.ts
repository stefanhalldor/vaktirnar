import { describe, expect, it } from 'vitest'
import {
  ROUTE_ENVELOPE_MIN_TTL_MS,
  findFreshRouteEnvelope,
} from '@/lib/iceland-routes/routeEnvelopeClient'

function envelope(routeId: string, expiresAtMs: number) {
  return {
    route: { id: routeId },
    expiresAt: new Date(expiresAtMs).toISOString(),
    signature: `signature-${routeId}`,
  }
}

describe('findFreshRouteEnvelope', () => {
  const nowMs = Date.parse('2026-07-27T20:00:00.000Z')

  it('returns the fresh envelope matching the selected route id', () => {
    const selected = envelope('teskeid-route', nowMs + ROUTE_ENVELOPE_MIN_TTL_MS + 1)
    const result = findFreshRouteEnvelope([
      envelope('google-route', nowMs + 10 * 60_000),
      selected,
    ], 'teskeid-route', nowMs)

    expect(result).toBe(selected)
  })

  it('requires a refresh when the matching envelope is at the safety boundary', () => {
    const result = findFreshRouteEnvelope([
      envelope('teskeid-route', nowMs + ROUTE_ENVELOPE_MIN_TTL_MS),
    ], 'teskeid-route', nowMs)

    expect(result).toBeNull()
  })

  it('never substitutes another provider route when the selected id is missing', () => {
    const result = findFreshRouteEnvelope([
      envelope('google-route', nowMs + 10 * 60_000),
    ], 'teskeid-route', nowMs)

    expect(result).toBeNull()
  })
})
