import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizeToArea,
  buildRouteFamilyKey,
  buildRouteObservation,
  recordRouteObservation,
  getStoredRouteObservations,
} from '@/lib/iceland-routes/routeObservation'
import type { DeterministicResult, RouteWeatherPoint } from '@/lib/weather/types'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'

// ── normalizeToArea ───────────────────────────────────────────────────────────

describe('normalizeToArea', () => {
  it('recognizes Reykjavík as capital area', () => {
    expect(normalizeToArea('Reykjavík')).toEqual({
      key: 'hofudborgarsvaedi',
      label: 'Höfuðborgarsvæðið',
    })
  })

  it('recognizes Kópavogur as capital area', () => {
    expect(normalizeToArea('Kópavogur')).toEqual({
      key: 'hofudborgarsvaedi',
      label: 'Höfuðborgarsvæðið',
    })
  })

  it('normalizes a street address in Kópavogur to capital area (not raw address)', () => {
    const result = normalizeToArea('Melás 8', 'Melás 8, 201 Kópavogur, Iceland')
    expect(result?.key).toBe('hofudborgarsvaedi')
    expect(result?.label).toBe('Höfuðborgarsvæðið')
    // Confirms raw street address is normalized away, not stored as-is
  })

  it('recognizes Akureyri', () => {
    expect(normalizeToArea('Akureyri')).toEqual({ key: 'akureyri', label: 'Akureyri' })
  })

  it('recognizes Egilsstaðir as austurland', () => {
    expect(normalizeToArea('Egilsstaðir')).toEqual({ key: 'austurland', label: 'Austurland' })
  })

  it('recognizes Ísafjörður as vestfirdir', () => {
    expect(normalizeToArea('Ísafjörður')).toEqual({ key: 'vestfirdir', label: 'Vestfirðir' })
  })

  it('recognizes Selfoss as sudurland', () => {
    expect(normalizeToArea('Selfoss')).toEqual({ key: 'sudurland', label: 'Suðurland' })
  })

  it('recognizes Höfn', () => {
    expect(normalizeToArea('Höfn')).toEqual({ key: 'hofn', label: 'Höfn' })
  })

  it('returns null for an unrecognized farm or place not in registry', () => {
    // Private/rural places not in any area pattern must be skipped — no observation stored
    expect(normalizeToArea('Bólstaðarhlíð 42')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeToArea('')).toBeNull()
  })
})

// ── buildRouteFamilyKey ───────────────────────────────────────────────────────

describe('buildRouteFamilyKey', () => {
  it('joins from and to with double dash', () => {
    expect(buildRouteFamilyKey('hofudborgarsvaedi', 'akureyri')).toBe(
      'hofudborgarsvaedi--akureyri',
    )
  })
})

// ── buildRouteObservation ─────────────────────────────────────────────────────

const MOCK_POINT: RouteWeatherPoint = {
  id: 'p1', routeIndex: 0, totalRouteWeatherPoints: 1,
  lat: 64.9, lon: -18.1, forecastLat: 64.9, forecastLon: -18.1,
  distanceFromOriginM: 100000, routeFraction: 0.5,
  googleMapsUrl: '', metnoUrl: '', yrnoUrl: '',
  vedurstofanStation: {
    stationId: 'S100', stationName: 'Hveravellir', distanceM: 500,
    confidence: 'good', status: 'ok', atimeIso: null,
  },
}

const MINIMAL_RESULT: DeterministicResult = {
  id: 'test',
  source: 'deterministic',
  toolName: 'travel',
  createdAt: new Date().toISOString(),
  svar: '',
  stada: 'graent',
  travelPlan: {
    route: { originName: 'Reykjavík', destinationName: 'Akureyri', distanceKm: 388, durationMinutes: 270 },
    outbound: { earliestDepartureIso: '', candidates: [], badWindows: [], windowMode: false },
    routeWeatherPoints: [MOCK_POINT],
  },
}

describe('buildRouteObservation', () => {
  it('returns an observation for known areas', () => {
    const obs = buildRouteObservation('Reykjavík', 'Akureyri', MINIMAL_RESULT)
    expect(obs).not.toBeNull()
    expect(obs!.routeFamilyKey).toBe('hofudborgarsvaedi--akureyri')
    expect(obs!.fromAreaKey).toBe('hofudborgarsvaedi')
    expect(obs!.toAreaKey).toBe('akureyri')
    expect(obs!.vedurstofanStationIds).toContain('S100')
  })

  it('returns null when origin is not in any area', () => {
    const obs = buildRouteObservation('Bólstaðarhlíð 42', 'Akureyri', MINIMAL_RESULT)
    expect(obs).toBeNull()
  })

  it('returns null when destination is not in any area', () => {
    const obs = buildRouteObservation('Reykjavík', 'Bólstaðarhlíð 42', MINIMAL_RESULT)
    expect(obs).toBeNull()
  })

  it('does not store routeFamilyLabel containing raw address text', () => {
    // Even if somehow a raw address reaches buildRouteObservation,
    // the label must come from normalizeToArea, not the raw input.
    const obs = buildRouteObservation(
      'Melás 8',
      'Akureyri',
      MINIMAL_RESULT,
      undefined,
    )
    // 'Melás 8' normalizes via formattedAddress — but here only name is passed.
    // Without formattedAddress 'Melás 8' alone does not match any area → null.
    expect(obs).toBeNull()
  })

  it('prefers vedurstofanLayer station IDs over routeWeatherPoints', () => {
    const layer: VedurstofanTravelLayer = {
      experimental: true,
      status: 'available',
      mappedPointCount: 1,
      availablePointCount: 1,
      stalePointCount: 0,
      unavailablePointCount: 0,
      layerAtimeIso: null,
      lastWarmAttemptIso: null,
      points: [
        {
          routePointId: 'vedurstofan_S200',
          stationId: 'S200',
          stationName: 'Holtavörðuheiði',
          distanceM: 300,
          distanceFromOriginM: 200000,
          routeFraction: 0.6,
          status: 'ok',
          atimeIso: null,
          fetchedAtIso: new Date().toISOString(),
          expiresAtIso: new Date().toISOString(),
          sourceUrl: null,
          forecastRows: [],
          lat: null, lon: null,
        },
      ],
    }
    const obs = buildRouteObservation('Reykjavík', 'Akureyri', MINIMAL_RESULT, layer)
    expect(obs!.vedurstofanStationIds).toContain('S200')
    // S100 from routeWeatherPoints is NOT included when layer has data
    expect(obs!.vedurstofanStationIds).not.toContain('S100')
  })
})

// ── recordRouteObservation / getStoredRouteObservations ───────────────────────

let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
  })
})

describe('recordRouteObservation + getStoredRouteObservations', () => {
  const OBS = {
    source: 'ferdalagid_google_routes' as const,
    routeFamilyKey: 'hofudborgarsvaedi--akureyri',
    routeFamilyLabel: 'Höfuðborgarsvæðið → Akureyri',
    fromAreaKey: 'hofudborgarsvaedi',
    fromAreaLabel: 'Höfuðborgarsvæðið',
    toAreaKey: 'akureyri',
    toAreaLabel: 'Akureyri',
    vedurstofanStationIds: ['S100'],
    vegagerdinStationIds: [],
    routeSegmentIds: [],
    routeCautionIds: [],
  }

  it('stores and retrieves an observation', () => {
    recordRouteObservation(OBS)
    const results = getStoredRouteObservations()
    expect(results).toHaveLength(1)
    expect(results[0].routeFamilyKey).toBe('hofudborgarsvaedi--akureyri')
    expect(results[0].vedurstofanStationIds).toContain('S100')
  })

  it('deduplicates by routeFamilyKey, updating to newest', () => {
    recordRouteObservation(OBS)
    recordRouteObservation({ ...OBS, vedurstofanStationIds: ['S200'] })
    const results = getStoredRouteObservations()
    expect(results).toHaveLength(1)
    expect(results[0].vedurstofanStationIds).toContain('S200')
  })

  it('returns empty array when nothing is stored', () => {
    expect(getStoredRouteObservations()).toEqual([])
  })

  it('returns empty array on corrupt storage', () => {
    store['vaktirnar:route-observations'] = 'not-json'
    expect(getStoredRouteObservations()).toEqual([])
  })
})
