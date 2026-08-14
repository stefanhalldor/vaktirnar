import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION,
  FERDALAGID_ROUTE_RESTORE_TTL_MS,
  isLegacyFerdalagidRouteResult,
  isValidFerdalagidRouteRestorePayload,
} from '@/lib/road-intelligence/ferdalagidRouteRestore'

function payload(savedAtIso: string, selectedRouteId: string | null = 'google-legacy') {
  return {
    schemaVersion: FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION,
    savedAtIso,
    step: 'result',
    origin: { lat: 64, lon: -21 },
    destination: { lat: 63, lon: -20 },
    selectedRouteId,
    result: { id: 'old-result' },
  }
}

describe('Ferðalagið v238 legacy restore', () => {
  const now = Date.parse('2026-08-13T12:00:00.000Z')

  it('accepts an old Google result only inside its original TTL', () => {
    const savedAt = new Date(now - FERDALAGID_ROUTE_RESTORE_TTL_MS + 1).toISOString()
    expect(isValidFerdalagidRouteRestorePayload(payload(savedAt), now)).toBe(true)
    expect(isLegacyFerdalagidRouteResult('google-route-0')).toBe(true)
  })

  it('expires at the original boundary rather than granting a sliding refresh TTL', () => {
    const originalSavedAt = new Date(now - FERDALAGID_ROUTE_RESTORE_TTL_MS + 1).toISOString()
    const restored = payload(originalSavedAt)
    expect(isValidFerdalagidRouteRestorePayload(restored, now)).toBe(true)
    expect(isValidFerdalagidRouteRestorePayload(restored, now + 2)).toBe(false)
  })

  it('rejects future timestamps and recognizes current Teskeið results', () => {
    expect(isValidFerdalagidRouteRestorePayload(
      payload(new Date(now + 1).toISOString()),
      now,
    )).toBe(false)
    expect(isLegacyFerdalagidRouteResult('teskeid-road-graph-v1-alt-1-test')).toBe(false)
  })

  it('never re-persists a read-only legacy result with a fresh savedAt timestamp', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/auth-mvp/vedrid/FerdalagidClient.tsx'),
      'utf8',
    )
    const persistEffect = source.slice(
      source.indexOf('// Persist route-result context'),
      source.indexOf('// Fetch saved places once on mount'),
    )
    expect(persistEffect).toContain('if (restoredLegacyRouteResult) return')
    expect(persistEffect).toContain('savedAtIso: new Date().toISOString()')
  })

  it('gates freshness fetch/poll and preserves ready Teskeið options on reselection', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/auth-mvp/vedrid/FerdalagidClient.tsx'),
      'utf8',
    )
    expect(source.match(/\|\| restoredLegacyRouteResult/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('const recommendedRoute = routeOptions?.[0] ?? null')
    expect(source).toContain('if (!recommendedRoute) setRouteRetryCount(count => count + 1)')
    expect(source).not.toContain("setRouteOptions(null)\n                setRouteEnvelopes([])")
  })
})
