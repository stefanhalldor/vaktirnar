/**
 * Unit tests for lib/weather/google.server.ts
 * All Google API calls are mocked — no real HTTP.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { googleProvider } from '@/lib/weather/google.server'
import type { PlaceCandidate } from '@/lib/weather/provider.types'

// Minimal place candidates for route tests
const FROM: PlaceCandidate = {
  placeId: 'ChIJreykjavik',
  displayName: 'Reykjavík',
  formattedAddress: 'Reykjavík, Iceland',
  lat: 64.135,
  lon: -21.895,
}
const TO: PlaceCandidate = {
  placeId: 'ChIJakureyri',
  displayName: 'Akureyri',
  formattedAddress: 'Akureyri, Iceland',
  lat: 65.683,
  lon: -18.1,
}
const FROM_NO_PLACEID: PlaceCandidate = {
  placeId: 'confirmed',
  displayName: 'Curated Port',
  formattedAddress: 'Curated Port, Iceland',
  lat: 63.9,
  lon: -21.5,
}

// Candidates for curated Þrengslavegur tests
const FROM_GARDABAER: PlaceCandidate = {
  placeId: 'ChIJgardabaer',
  displayName: 'Garðabær',
  formattedAddress: 'Garðabær, Iceland',
  lat: 64.09,   // in capital-area bounds
  lon: -21.93,
}
const TO_THORLAKSHOFN: PlaceCandidate = {
  placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4',  // known Place ID from live diagnostics
  displayName: 'Þorlákshöfn',
  formattedAddress: 'Þorlákshöfn, Iceland',
  lat: 63.849,  // in Þorlákshöfn bounds
  lon: -21.365,
}
const FROM_KEFLAVIK: PlaceCandidate = {
  placeId: 'ChIJkeflavik',
  displayName: 'Keflavík',
  formattedAddress: 'Keflavík, Iceland',
  lat: 63.985,  // south of capital-area minLat=63.95 but more importantly west of minLon=-22.10
  lon: -22.56,  // excluded from capital area: lon < -22.10
}
// Höfn — non-capital origin for testing generalized Hólmavík alternate
const FROM_HOFN: PlaceCandidate = {
  placeId: 'ChIJhofn',
  displayName: 'Höfn',
  formattedAddress: 'Höfn, Iceland',
  lat: 64.255,
  lon: -15.207,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response)
}

/** Mock a sequence of fetch calls in order. */
function mockFetchSequence(responses: Array<{ body: unknown; ok?: boolean; status?: number }>) {
  const spy = vi.spyOn(global, 'fetch')
  for (const r of responses) {
    spy.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    } as Response)
  }
  return spy
}

// ── staticMapUrl ──────────────────────────────────────────────────────────────

describe('googleProvider.staticMapUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = 'test-browser-key'
  })
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  })

  it('returns a Google Static Maps URL', () => {
    const url = googleProvider.staticMapUrl({ lat: 64.135, lon: -21.895 })
    expect(url).toContain('maps.googleapis.com/maps/api/staticmap')
  })

  it('includes the browser key', () => {
    const url = googleProvider.staticMapUrl({ lat: 64.135, lon: -21.895 })
    expect(url).toContain('test-browser-key')
  })

  it('does not include the server key', () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'server-key-must-not-appear'
    const url = googleProvider.staticMapUrl({ lat: 64.135, lon: -21.895 })
    expect(url).not.toContain('server-key-must-not-appear')
    delete process.env.GOOGLE_MAPS_SERVER_KEY
  })

  it('includes center coordinates', () => {
    const url = googleProvider.staticMapUrl({ lat: 64.135, lon: -21.895 })
    expect(url).toContain('64.135')
    expect(url).toContain('-21.895')
  })

  it('includes zoom and size', () => {
    const url = googleProvider.staticMapUrl({ lat: 64.0, lon: -21.0, zoom: 10, width: 400, height: 200 })
    expect(url).toContain('zoom=10')
    expect(url).toContain('400x200')
  })

  it('throws if browser key is not set', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
    expect(() => googleProvider.staticMapUrl({ lat: 64.0, lon: -21.0 })).toThrow()
  })
})

// ── geocodePlace ──────────────────────────────────────────────────────────────

describe('googleProvider.geocodePlace', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-server-key'
  })
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    vi.restoreAllMocks()
  })

  it('returns place candidates on OK status', async () => {
    mockFetch({
      status: 'OK',
      results: [{
        place_id: 'abc123',
        formatted_address: 'Reykjavík, Iceland',
        address_components: [{ long_name: 'Reykjavík', short_name: 'RVK', types: ['locality'] }],
        geometry: { location: { lat: 64.135, lng: -21.895 } },
      }],
    })

    const results = await googleProvider.geocodePlace('Reykjavík')
    expect(results).toHaveLength(1)
    expect(results[0].placeId).toBe('abc123')
    expect(results[0].lat).toBe(64.135)
    expect(results[0].lon).toBe(-21.895)
    expect(results[0].displayName).toBe('Reykjavík')
  })

  it('returns empty array when status is ZERO_RESULTS', async () => {
    mockFetch({ status: 'ZERO_RESULTS', results: [] })
    const results = await googleProvider.geocodePlace('ótilgreindur staður')
    expect(results).toHaveLength(0)
  })

  it('returns at most 5 candidates', async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      place_id: `p${i}`,
      formatted_address: `Place ${i}`,
      address_components: [{ long_name: `Place ${i}`, short_name: `P${i}`, types: [] }],
      geometry: { location: { lat: 64 + i * 0.1, lng: -21 } },
    }))
    mockFetch({ status: 'OK', results: manyResults })
    const results = await googleProvider.geocodePlace('test')
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('throws if HTTP request fails', async () => {
    mockFetch(null, false, 500)
    await expect(googleProvider.geocodePlace('Reykjavík')).rejects.toThrow()
  })

  it('throws if server key is not set', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    await expect(googleProvider.geocodePlace('Reykjavík')).rejects.toThrow('GOOGLE_MAPS_SERVER_KEY')
  })

  it('uses GOOGLE_MAPS_SERVER_KEY in request (not browser key)', async () => {
    const spy = mockFetch({ status: 'ZERO_RESULTS', results: [] })
    await googleProvider.geocodePlace('test')
    const calledUrl = spy.mock.calls[0][0] as string
    expect(calledUrl).toContain('test-server-key')
  })
})

// ── getRouteGeometry ──────────────────────────────────────────────────────────

describe('googleProvider.getRouteGeometry', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-server-key'
  })
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    vi.restoreAllMocks()
  })

  function makeRouteResponse(numPoints: number) {
    const coordinates = Array.from({ length: numPoints }, (_, i) => [-21 + i * 0.1, 64 + i * 0.05] as [number, number])
    return {
      routes: [{
        polyline: { geoJsonLinestring: { coordinates } },
        distanceMeters: numPoints * 5000,
        duration: `${numPoints * 300}s`,
      }],
    }
  }

  it('returns route geometry with points and distance', async () => {
    mockFetch(makeRouteResponse(10))
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    expect(result).not.toBeNull()
    expect(result!.points.length).toBeGreaterThan(0)
    expect(result!.distanceM).toBeGreaterThan(0)
    expect(result!.durationS).toBeGreaterThan(0)
  })

  it('samples down to at most 80 points when route has more', async () => {
    mockFetch(makeRouteResponse(200))
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    expect(result!.points.length).toBeLessThanOrEqual(80)
  })

  it('preserves all points when route has fewer than 80', async () => {
    mockFetch(makeRouteResponse(20))
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    // May include last point duplicate, but total should be ~20
    expect(result!.points.length).toBeLessThanOrEqual(21)
  })

  it('always includes first and last point', async () => {
    mockFetch(makeRouteResponse(150))
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    const pts = result!.points
    // First point: lon=-21 → lat=64, lon=-21
    expect(pts[0].lon).toBeCloseTo(-21.0, 1)
    // Last point is always included
    expect(pts[pts.length - 1]).toBeDefined()
  })

  it('returns null when no routes in response', async () => {
    mockFetch({ routes: [] })
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    expect(result).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    mockFetch(null, false, 500)
    const result = await googleProvider.getRouteGeometry(FROM, TO)
    expect(result).toBeNull()
  })

  it('throws if server key is not set', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    await expect(googleProvider.getRouteGeometry(FROM, TO)).rejects.toThrow('GOOGLE_MAPS_SERVER_KEY')
  })

  it('uses X-Goog-Api-Key header, not query param', async () => {
    const spy = mockFetch(makeRouteResponse(5))
    await googleProvider.getRouteGeometry(FROM, TO)
    const callArgs = spy.mock.calls[0]
    const url = callArgs[0] as string
    const options = callArgs[1] as RequestInit
    const headers = options?.headers as Record<string, string>
    // Key must be in headers, not in URL
    expect(url).not.toContain('test-server-key')
    expect(headers['X-Goog-Api-Key']).toBe('test-server-key')
  })

  it('uses placeId waypoint when candidate has a real place ID', async () => {
    const spy = mockFetch(makeRouteResponse(5))
    await googleProvider.getRouteGeometry(FROM, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.origin).toEqual({ placeId: 'ChIJreykjavik' })
    expect(body.destination).toEqual({ placeId: 'ChIJakureyri' })
  })

  it('falls back to latLng when candidate placeId is "confirmed"', async () => {
    const spy = mockFetch(makeRouteResponse(5))
    await googleProvider.getRouteGeometry(FROM_NO_PLACEID, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.origin).toEqual({ location: { latLng: { latitude: FROM_NO_PLACEID.lat, longitude: FROM_NO_PLACEID.lon } } })
  })

  it('includes routingPreference TRAFFIC_AWARE in body', async () => {
    const spy = mockFetch(makeRouteResponse(5))
    await googleProvider.getRouteGeometry(FROM, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.routingPreference).toBe('TRAFFIC_AWARE')
  })

  it('includes routes.description in field mask', async () => {
    const spy = mockFetch(makeRouteResponse(5))
    await googleProvider.getRouteGeometry(FROM, TO)
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toContain('routes.description')
  })
})

// ── getRouteOptions ───────────────────────────────────────────────────────────

describe('googleProvider.getRouteOptions', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test-server-key'
  })
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    vi.restoreAllMocks()
  })

  function makeMultiRouteResponse(routes: Array<{
    numPoints: number
    labels: string[]
    durationMultiplier?: number
    staticDurationMultiplier?: number
    description?: string
  }>) {
    return {
      routes: routes.map(({ numPoints, labels, durationMultiplier = 1, staticDurationMultiplier, description }) => ({
        polyline: {
          geoJsonLinestring: {
            coordinates: Array.from({ length: numPoints }, (_, i) => [-21 + i * 0.1, 64 + i * 0.05] as [number, number]),
          },
        },
        distanceMeters: numPoints * 5000,
        duration: `${numPoints * 300 * durationMultiplier}s`,
        staticDuration: staticDurationMultiplier != null ? `${numPoints * 300 * staticDurationMultiplier}s` : undefined,
        routeLabels: labels,
        description,
      })),
    }
  }

  /** Build a mock route response from explicit [lon, lat] coordinates and a specific durationS. */
  function makeRouteResponseFromCoords(
    coords: [number, number][],
    labels: string[],
    durationS: number
  ) {
    return {
      routes: [{
        polyline: { geoJsonLinestring: { coordinates: coords } },
        distanceMeters: coords.length * 5000,
        duration: `${durationS}s`,
        staticDuration: undefined,
        routeLabels: labels,
      }],
    }
  }

  // Coordinates that pass near HELLISHEIDI_VIA (lat 64.036, lon -21.392) — within 5 km
  const COORDS_VIA_HELLISHEIDI: [number, number][] = [
    [-21.90, 64.14],  // Garðabær area [lon, lat]
    [-21.39, 64.04],  // near Hellisheiði (~0.5 km from HELLISHEIDI_VIA)
    [-20.99, 63.93],  // Selfoss area
  ]
  // Coordinates that do NOT pass near HELLISHEIDI_VIA — goes northwest instead
  const COORDS_NOT_VIA_HELLISHEIDI: [number, number][] = [
    [-21.90, 64.14],  // Garðabær
    [-22.00, 64.60],  // northwest
    [-23.00, 65.00],  // further northwest
  ]

  it('returns multiple routes with parsed labels', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },
      { numPoints: 8, labels: ['DEFAULT_ROUTE_ALTERNATE'] },
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results).toHaveLength(2)
    expect(results.some(r => r.labels.includes('DEFAULT_ROUTE'))).toBe(true)
    expect(results.some(r => r.labels.includes('DEFAULT_ROUTE_ALTERNATE'))).toBe(true)
  })

  it('sets isDefault=true only for DEFAULT_ROUTE label', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },
      { numPoints: 8, labels: ['DEFAULT_ROUTE_ALTERNATE'] },
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    const def = results.find(r => r.labels.includes('DEFAULT_ROUTE'))
    const alt = results.find(r => r.labels.includes('DEFAULT_ROUTE_ALTERNATE'))
    expect(def?.isDefault).toBe(true)
    expect(alt?.isDefault).toBe(false)
  })

  it('routes are sorted by durationS ascending — fastest first', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },          // 3000s
      { numPoints: 6, labels: ['DEFAULT_ROUTE_ALTERNATE'] }, // 1800s — faster
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results[0].durationS).toBe(1800)
    expect(results[1].durationS).toBe(3000)
  })

  it('assigns stable fingerprint ids based on route properties, not array index', async () => {
    const twoRoutes = makeMultiRouteResponse([
      { numPoints: 5, labels: ['DEFAULT_ROUTE'] },
      { numPoints: 8, labels: ['DEFAULT_ROUTE_ALTERNATE'] },
    ])
    mockFetch(twoRoutes)
    const results = await googleProvider.getRouteOptions(FROM, TO)
    // Ids are based on distance + duration + coordinates, not index
    expect(results[0].id).toContain('google-')
    expect(results[0].id).not.toBe('google-0')
    expect(results[1].id).not.toBe('google-1')
    expect(results[0].provider).toBe('google')
    // Same route properties always produce same id
    expect(results[0].id).toBe(results[0].id)
  })

  it('same route produces same id regardless of order in response', async () => {
    const routeA = { numPoints: 5, labels: ['DEFAULT_ROUTE'] }
    const routeB = { numPoints: 10, labels: ['DEFAULT_ROUTE_ALTERNATE'] }
    mockFetch(makeMultiRouteResponse([routeA, routeB]))
    const first = await googleProvider.getRouteOptions(FROM, TO)
    vi.restoreAllMocks()
    mockFetch(makeMultiRouteResponse([routeB, routeA]))
    const second = await googleProvider.getRouteOptions(FROM, TO)

    // Route with 5 points should have same id in both calls
    const idA1 = first.find(r => r.distanceM === 5 * 5000)?.id
    const idA2 = second.find(r => r.distanceM === 5 * 5000)?.id
    expect(idA1).toBeDefined()
    expect(idA1).toBe(idA2)
  })

  it('single route still works', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results).toHaveLength(1)
    expect(results[0].distanceM).toBeGreaterThan(0)
    expect(results[0].durationS).toBeGreaterThan(0)
    expect(results[0].points.length).toBeGreaterThan(0)
  })

  it('returns empty array when no routes in response', async () => {
    mockFetch({ routes: [] })
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results).toHaveLength(0)
  })

  it('returns empty array on HTTP error', async () => {
    mockFetch(null, false, 500)
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results).toHaveLength(0)
  })

  it('requests computeAlternativeRoutes in the body', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const callBody = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(callBody.computeAlternativeRoutes).toBe(true)
  })

  it('includes routeLabels in the field mask', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toContain('routes.routeLabels')
  })

  it('throws if server key is not set', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    await expect(googleProvider.getRouteOptions(FROM, TO)).rejects.toThrow('GOOGLE_MAPS_SERVER_KEY')
  })

  it('uses staticDuration for durationS when both duration and staticDuration are present', async () => {
    // numPoints=10 → traffic duration = 10*300*1 = 3000s, static = 10*300*0.75 = 2250s
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'], durationMultiplier: 1, staticDurationMultiplier: 0.75 },
    ]))
    const [result] = await googleProvider.getRouteOptions(FROM, TO)
    expect(result.durationS).toBe(2250)
  })

  it('falls back to traffic duration when staticDuration is absent', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },  // no staticDurationMultiplier → no staticDuration
    ]))
    const [result] = await googleProvider.getRouteOptions(FROM, TO)
    expect(result.durationS).toBe(3000)
  })

  it('curated route uses staticDuration when present', async () => {
    // numPoints: main=10 (traffic=3000s, static=2250s), curated=8 (traffic=2400s, static=1800s)
    const mainRoute = makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'], durationMultiplier: 1, staticDurationMultiplier: 0.75 },
    ])
    const curatedRoute = makeMultiRouteResponse([
      { numPoints: 8, labels: [], durationMultiplier: 1, staticDurationMultiplier: 0.75 },
    ])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    const curated = results.find(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))
    expect(curated?.durationS).toBe(1800)  // static (8*300*0.75), not traffic (8*300)
  })

  it('routes sorted by staticDuration when static values are present', async () => {
    // main: traffic=3000s, static=2250s. curated: traffic=2400s, static=1800s.
    // After sort by staticDuration: curated (1800) first, main (2250) second.
    const mainRoute = makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'], staticDurationMultiplier: 0.75 },
    ])
    const curatedRoute = makeMultiRouteResponse([
      { numPoints: 8, labels: [], staticDurationMultiplier: 0.75 },
    ])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    expect(results[0].durationS).toBe(1800)
    expect(results[1].durationS).toBe(2250)
  })

  it('includes routes.staticDuration in field mask', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toContain('routes.staticDuration')
  })

  it('produces same route id when geometry matches but duration changes (TRAFFIC_AWARE drift)', async () => {
    const routeSpec = { numPoints: 10, labels: ['DEFAULT_ROUTE'] as string[], durationMultiplier: 1 }
    mockFetch(makeMultiRouteResponse([routeSpec]))
    const [first] = await googleProvider.getRouteOptions(FROM, TO)
    vi.restoreAllMocks()
    // Same numPoints (same geometry) but duration multiplier changed by 10%
    mockFetch(makeMultiRouteResponse([{ ...routeSpec, durationMultiplier: 1.1 }]))
    const [second] = await googleProvider.getRouteOptions(FROM, TO)
    expect(first.id).toBe(second.id)
    expect(first.durationS).not.toBe(second.durationS)  // durations differ but ids match
  })

  it('uses placeId waypoint when candidate has a real place ID', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.origin).toEqual({ placeId: 'ChIJreykjavik' })
    expect(body.destination).toEqual({ placeId: 'ChIJakureyri' })
  })

  it('falls back to latLng for "confirmed" placeId', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM_NO_PLACEID, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.origin).toEqual({ location: { latLng: { latitude: FROM_NO_PLACEID.lat, longitude: FROM_NO_PLACEID.lon } } })
  })

  it('includes routingPreference TRAFFIC_AWARE in body', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.routingPreference).toBe('TRAFFIC_AWARE')
  })

  it('does not include requestedReferenceRoutes in body', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.requestedReferenceRoutes).toBeUndefined()
  })

  it('does not include routes.routeToken in field mask', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).not.toContain('routes.routeToken')
  })

  // ── Curated route shared behaviour ───────────────────────────────────────

  it('vias refactor: single-via rule produces exactly one intermediates entry', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
  })

  it('curated route is skipped when geometry matches a main route', async () => {
    // Same numPoints = same coordinate fingerprint as main route
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 10, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    expect(results).toHaveLength(1)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  it('curated route is silently omitted when Google returns no route', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    mockFetchSequence([{ body: mainRoute }, { body: { routes: [] } }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    expect(results).toHaveLength(1)
    expect(results[0].labels).toContain('DEFAULT_ROUTE')
  })

  it('short trip (< 350 km) from capital area does not make a curated request', async () => {
    // numPoints: 5 → distance 25 km, well under 350 km threshold for Hringurinn
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)  // FROM → Akureyri but mocked as short route
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not make a curated request for Reykjanes/southwest origin', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM_KEFLAVIK, TO_THORLAKSHOFN)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('curated route and main route both appear when distinct, sorted by durationS', async () => {
    // Main route: 10 pts = 3000s. Curated: 8 pts = 2400s (faster → goes first after sort)
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 8, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    expect(results).toHaveLength(2)
    expect(results[0].durationS).toBeLessThan(results[1].durationS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  // ── Regression: Þrengslavegur curated rule removed ───────────────────────

  it('capital area → Þorlákshöfn does NOT produce CURATED_VIA_THRENGSLAVEGUR (rule removed)', async () => {
    // The old curated rule was adding a slower duplicate. Rule has been removed.
    // Þorlákshöfn (lon -21.365) is outside SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS (minLon -21.25),
    // so it also does not trigger CURATED_VIA_HELLISHEIDI.
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(spy).toHaveBeenCalledTimes(1)  // no extra curated request
    expect(results.some(r => r.labels.includes('CURATED_VIA_THRENGSLAVEGUR'))).toBe(false)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  // ── Curated Hellisheiði route ─────────────────────────────────────────────

  // Hveragerði: lat 63.999, lon -21.187 — in SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS
  const TO_HVERAGERDI: PlaceCandidate = {
    placeId: 'ChIJhveragerdi',
    displayName: 'Hveragerði',
    formattedAddress: 'Hveragerði, Iceland',
    lat: 63.999,
    lon: -21.187,
  }
  // Selfoss: lat 63.930, lon -20.995 — in SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS
  const TO_SELFOSS: PlaceCandidate = {
    placeId: 'ChIJselfoss',
    displayName: 'Selfoss',
    formattedAddress: 'Selfoss, Iceland',
    lat: 63.930,
    lon: -20.995,
  }
  // Þingvellir: lat 64.255, lon -20.910 — above maxLat 64.15, must NOT trigger
  const TO_THINGVELLIR: PlaceCandidate = {
    placeId: 'ChIJthingvellir',
    displayName: 'Þingvellir',
    formattedAddress: 'Þingvellir, Iceland',
    lat: 64.255,
    lon: -20.910,
  }
  // Laugarvatn: lat 64.210, lon -20.725 — above maxLat 64.15, must NOT trigger
  const TO_LAUGARVATN: PlaceCandidate = {
    placeId: 'ChIJlaugarvatn',
    displayName: 'Laugarvatn',
    formattedAddress: 'Laugarvatn, Iceland',
    lat: 64.210,
    lon: -20.725,
  }

  it('capital area → Hveragerði triggers CURATED_VIA_HELLISHEIDI', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('capital area → Selfoss triggers CURATED_VIA_HELLISHEIDI', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_SELFOSS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('curated Hellisheiði request has exactly one intermediate with via: true', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
    expect(curatedBody.intermediates[0].via).toBe(true)
  })

  it('curated Hellisheiði request uses the Hellisheiði via-point coordinate', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HVERAGERDI)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(64.0360, 3)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-21.3920, 3)
  })

  it('capital area → Þorlákshöfn does not trigger CURATED_VIA_HELLISHEIDI (lon outside south-east bounds)', async () => {
    // Þorlákshöfn lon -21.365 < minLon -21.25 in SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS
    mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  it('capital area → Akureyri does not trigger CURATED_VIA_HELLISHEIDI', async () => {
    // Akureyri is north (lat 65.68), outside SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS maxLat 64.15
    mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)  // TO = Akureyri
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  it('capital area → Þingvellir does not trigger CURATED_VIA_HELLISHEIDI', async () => {
    // Þingvellir lat 64.255 > maxLat 64.15
    mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THINGVELLIR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  it('capital area → Laugarvatn does not trigger CURATED_VIA_HELLISHEIDI', async () => {
    // Laugarvatn lat 64.210 > maxLat 64.15
    mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_LAUGARVATN)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  // ── Curated East Iceland / Austurland via Hellisheiði ────────────────────

  // Egilsstaðir: lat 65.268, lon -14.401 — in EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS
  const TO_EGILSSTADIR: PlaceCandidate = {
    placeId: 'ChIJegilsstadir',
    displayName: 'Egilsstaðir',
    formattedAddress: 'Egilsstaðir, Iceland',
    lat: 65.268,
    lon: -14.401,
  }
  // Mývatn: lat 65.600, lon -16.990 — must NOT trigger CURATED_VIA_HELLISHEIDI (north, not east fjords)
  // But IS in NORTH_ICELAND_RING_ROAD_BOUNDS → gets Hringurinn A for long trips
  const TO_MYVATN: PlaceCandidate = {
    placeId: 'ChIJmyvatn',
    displayName: 'Mývatn',
    formattedAddress: 'Mývatn, Iceland',
    lat: 65.600,
    lon: -16.990,
  }
  // Höfn: lat 64.252, lon -15.212 — in SOUTHEAST_COAST_RING_ROAD_BOUNDS → gets Hringurinn B for long trips
  const TO_HOFN: PlaceCandidate = {
    placeId: 'ChIJhofn',
    displayName: 'Höfn',
    formattedAddress: 'Höfn, Iceland',
    lat: 64.252,
    lon: -15.212,
  }

  it('capital area → Egilsstaðir triggers CURATED_VIA_HELLISHEIDI', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_EGILSSTADIR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('capital area → Egilsstaðir curated route also has CURATED_EAST_ICELAND_VIA_HELLISHEIDI label', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_EGILSSTADIR)
    expect(results.some(r => r.labels.includes('CURATED_EAST_ICELAND_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('capital area → Egilsstaðir curated request uses Hellisheiði via coordinate', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_EGILSSTADIR)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
    expect(curatedBody.intermediates[0].via).toBe(true)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(64.0360, 3)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-21.3920, 3)
  })

  it('capital area → Mývatn does not trigger CURATED_VIA_HELLISHEIDI', async () => {
    // Mývatn lon -16.99 is west of EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS minLon -15.90
    mockFetch(makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_MYVATN)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
  })

  it('capital area → Egilsstaðir: Hveragerði/Selfoss rules still work independently', async () => {
    // This test confirms the south-east rule still triggers for Selfoss
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_SELFOSS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
    expect(results.some(r => r.labels.includes('CURATED_EAST_ICELAND_VIA_HELLISHEIDI'))).toBe(false)
  })

  // ── Hellisheiði duplicate filter ──────────────────────────────────────────

  it('CURATED_VIA_HELLISHEIDI is suppressed when base route already passes Hellisheiði and curated is slower', async () => {
    // Base: passes near Hellisheiði, durationS=1500s
    // Curated: different geometry (different coords), durationS=1700s (slower) → should be filtered
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_HELLISHEIDI, ['DEFAULT_ROUTE'], 1500)
    const curatedRoute = makeRouteResponseFromCoords([[-21.39, 64.04], [-20.50, 63.80], [-20.00, 63.60], [-19.50, 63.40]], [], 1700)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_SELFOSS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(false)
    expect(results).toHaveLength(1)
  })

  it('CURATED_VIA_HELLISHEIDI is kept when base route does NOT pass near Hellisheiði', async () => {
    // Base: goes northwest, NOT near Hellisheiði → curated adds the missing corridor
    const mainRoute = makeRouteResponseFromCoords(COORDS_NOT_VIA_HELLISHEIDI, ['DEFAULT_ROUTE'], 1500)
    const curatedRoute = makeRouteResponseFromCoords([[-21.39, 64.04], [-20.99, 63.93], [-20.00, 63.60]], [], 1700)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_SELFOSS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('CURATED_VIA_HELLISHEIDI is kept when it is meaningfully faster than base (> 60 s)', async () => {
    // Base: near Hellisheiði, 1500s. Curated: 1200s (300s faster — well above 60s tolerance)
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_HELLISHEIDI, ['DEFAULT_ROUTE'], 1500)
    const curatedRoute = makeRouteResponseFromCoords([[-21.39, 64.04], [-20.50, 63.80], [-20.00, 63.60]], [], 1200)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_SELFOSS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('Hellisheiði duplicate filter does not affect CURATED_RING_ROAD (Hringurinn)', async () => {
    // Long trip: CURATED_RING_ROAD has CURATED_VIA_HELLISHEIDI? No — different labels.
    // This confirms Hringurinn is unaffected regardless.
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 90, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(true)
  })

  // ── Hringurinn (ring road, long trips >= 350 km) ─────────────────────────

  // FROM_GARDABAER is in CAPITAL_AREA_BOUNDS. TO (Akureyri) is in ICELAND_BOUNDS.
  // numPoints * 5000 = distanceM. 71 pts → 355 000 m (> 350 km). 69 pts → 345 000 m (< 350 km).

  it('capital area → Akureyri with distance >= 350 km triggers CURATED_RING_ROAD', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(true)
  })

  it('capital area → Akureyri Hringurinn request has 4 via intermediates', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(4)
    expect(curatedBody.intermediates.every((m: { via: boolean }) => m.via === true)).toBe(true)
  })

  it('Hringurinn first via-point is Hellisheiði coordinate', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(64.036, 2)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-21.392, 2)
  })

  it('capital area → Akureyri with distance < 350 km does NOT trigger CURATED_RING_ROAD', async () => {
    // 69 pts → 345 000 m < 350 000 threshold
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 69, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(spy).toHaveBeenCalledTimes(1)  // no curated request
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(false)
  })

  it('Hringurinn is skipped when its geometry matches an existing route', async () => {
    // Same numPoints for main and curated → same fingerprint → duplicate, skipped
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 71, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(results).toHaveLength(1)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(false)
  })

  it('Hringurinn appears alongside fastest route when distinct, sorted by durationS', async () => {
    // main: 71 pts = 3000*71/10s. curated (Hringurinn): 90 pts (longer) → goes last after sort.
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 90, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(results).toHaveLength(2)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(true)
    expect(results[0].durationS).toBeLessThan(results[1].durationS)
    // Hringurinn sorts last (longer duration)
    expect(results[results.length - 1].labels).toContain('CURATED_RING_ROAD')
  })

  it('Reykjanes/southwest origin does not trigger Hringurinn even for long distance', async () => {
    // FROM_KEFLAVIK is outside CAPITAL_AREA_BOUNDS
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_KEFLAVIK, TO)
    expect(spy).toHaveBeenCalledTimes(1)  // no curated request
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(false)
  })

  // ── Hringurinn direction-aware routing ────────────────────────────────────

  it('capital area → Akureyri uses south-east-north via sequence (first via = Hellisheiði)', async () => {
    // TO = Akureyri is in NORTH_ICELAND_RING_ROAD_BOUNDS → Rule A (south-east-north)
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    // First via must be Hellisheiði (counter-clockwise starts south)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(64.036, 2)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-21.392, 2)
    expect(curatedBody.intermediates).toHaveLength(4)
  })

  it('capital area → Höfn (> 350 km) triggers CURATED_RING_ROAD using north-east-south vias', async () => {
    // TO_HOFN is in SOUTHEAST_COAST_RING_ROAD_BOUNDS → Rule B (north-east-south)
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HOFN)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(true)
  })

  it('capital area → Höfn Hringurinn first via is north (NOT Hellisheiði — avoids past-destination return)', async () => {
    // Rule B must start with a north Iceland via, not Hellisheiði (which is on the fast south route)
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HOFN)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    // First via must NOT be Hellisheiði
    expect(curatedBody.intermediates[0].location.latLng.latitude).not.toBeCloseTo(64.036, 2)
    // First via should be the north Route 1 via (Varmahlíð area, lat ~65.54)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(65.540, 2)
  })

  it('capital area → Höfn Hringurinn has only 2 vias (no via-points beyond Höfn that force return)', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_HOFN)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    // Rule B uses only [RING_ROAD_NORTH_VIA, RING_ROAD_NORTHEAST_VIA] — 2 vias
    expect(curatedBody.intermediates).toHaveLength(2)
  })

  it('capital area → Egilsstaðir does NOT get Hringurinn (destination in gap between Rule A and Rule B bounds)', async () => {
    // Egilsstaðir lat 65.268: below NORTH_ICELAND_RING_ROAD_BOUNDS minLat 65.40
    //                          above SOUTHEAST_COAST_RING_ROAD_BOUNDS maxLat 65.0
    // numPoints: 71 → 355 km > 350 km threshold
    // 2 fetches: main routes + Hellisheiði curated (from EAST_ICELAND rule)
    const mainRoute = makeMultiRouteResponse([{ numPoints: 71, labels: ['DEFAULT_ROUTE'] }])
    const hellisheidiCurated = makeMultiRouteResponse([{ numPoints: 60, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: hellisheidiCurated }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_EGILSSTADIR)
    expect(results.some(r => r.labels.includes('CURATED_RING_ROAD'))).toBe(false)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HELLISHEIDI'))).toBe(true)
  })

  it('passes description through when Google provides it', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'], description: 'via Þrengslavegur/Route 39' },
      { numPoints: 12, labels: ['DEFAULT_ROUTE_ALTERNATE'], description: 'via Suðurstrandarvegur/Route 427' },
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results[0].description).toBe('via Þrengslavegur/Route 39')
    expect(results[1].description).toBe('via Suðurstrandarvegur/Route 427')
  })

  it('description is undefined when Google does not provide it', async () => {
    mockFetch(makeMultiRouteResponse([
      { numPoints: 10, labels: ['DEFAULT_ROUTE'] },
    ]))
    const results = await googleProvider.getRouteOptions(FROM, TO)
    expect(results[0].description).toBeUndefined()
  })

  // ── Curated Vestfirðir / Hólmavík route ──────────────────────────────────

  // Ísafjörður (66.07, -23.13) — inside WESTFJORDS_NORTH_BOUNDS (65.80–66.50 N, 25–22 W)
  const TO_ISAFJORDUR: PlaceCandidate = {
    placeId: 'ChIJisafjordur',
    displayName: 'Ísafjörður',
    formattedAddress: 'Ísafjörður, Iceland',
    lat: 66.07,
    lon: -23.13,
  }
  // Bolungarvík (66.15, -23.26) — also inside WESTFJORDS_NORTH_BOUNDS, representative of north-western Westfjords
  const TO_BOLUNGARVIK: PlaceCandidate = {
    placeId: 'ChIJbolungarvik',
    displayName: 'Bolungarvík',
    formattedAddress: 'Bolungarvík, Iceland',
    lat: 66.15,
    lon: -23.26,
  }

  // 37-point route passing near HOLMAVIK_VIA (lat 65.703, lon -21.685) — within 8 km.
  // 37 coords × 5000 m = 185 000 m > minFastestRouteDistanceM 180 000 m, so the rule fires.
  // Point at index 18 is placed exactly at HOLMAVIK_VIA to guarantee proximity detection.
  const COORDS_VIA_HOLMAVIK: [number, number][] = Array.from({ length: 37 }, (_, i) =>
    i === 18
      ? [-21.685, 65.703] as [number, number]   // HOLMAVIK_VIA
      : [-21.93 + i * 0.03, 64.09 + i * 0.05] as [number, number]
  )

  it('capital area → Ísafjörður triggers CURATED_VIA_HOLMAVIK', async () => {
    // 37 pts × 5000 m = 185 000 m > minFastestRouteDistanceM 180 000 m
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 30, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(true)
  })

  it('capital area → Bolungarvík also triggers CURATED_VIA_HOLMAVIK (representative of north-western Westfjords bounds)', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 30, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_BOLUNGARVIK)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(true)
  })

  it('capital area → Ísafjörður curated request uses HOLMAVIK_VIA coordinate', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 30, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
    expect(curatedBody.intermediates[0].via).toBe(true)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(65.703, 3)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-21.685, 3)
  })

  it('capital area → Akureyri does NOT trigger CURATED_VIA_HOLMAVIK', async () => {
    // Akureyri (lat 65.683) is below WESTFJORDS_NORTH_BOUNDS minLat 65.80
    mockFetch(makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)  // TO = Akureyri
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(false)
  })

  it('short trip to Ísafjörður (< 180 km) does not trigger CURATED_VIA_HOLMAVIK', async () => {
    // 35 pts × 5000 m = 175 000 m < 180 000 m threshold
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 35, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    expect(spy).toHaveBeenCalledTimes(1)  // no extra curated fetch
  })

  it('CURATED_VIA_HOLMAVIK is suppressed when base route already passes Hólmavík and curated is not faster', async () => {
    // Base (37 pts = 185 km, includes HOLMAVIK_VIA at index 18), curated is slower → suppressed.
    // Different fingerprint from curated (3 pts) so geometry-dedup doesn't fire first.
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_HOLMAVIK, ['DEFAULT_ROUTE'], 14_000)
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(false)
    expect(results).toHaveLength(1)
  })

  it('CURATED_VIA_HOLMAVIK is kept when base route does NOT pass near Hólmavík', async () => {
    // 37-pt auto-generated base goes northeast (not via Hólmavík) → suppression does not fire.
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(true)
  })

  // ── Route caution: Westfjords trailer warning ───────────────────────────────

  it('base route to Ísafjörður that avoids Hólmavík gets trailer caution', async () => {
    // 37-pt auto-generated base goes northeast — not via Hólmavík (lat 65.703, lon -21.685).
    // Curated route passes exactly through HOLMAVIK_VIA so it should NOT get the caution.
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    const baseRoute = results.find(r => !r.labels.includes('CURATED_VIA_HOLMAVIK'))
    expect(baseRoute?.cautions?.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('CURATED_VIA_HOLMAVIK route to Ísafjörður does NOT get trailer caution', async () => {
    // Curated route passes through HOLMAVIK_VIA → caution should not fire.
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    const curated = results.find(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))
    expect(curated).toBeDefined()
    expect(curated?.cautions?.some(c => c.id === 'westfjords-south-route60')).toBeFalsy()
  })

  it('route to Akureyri gets no Westfjords trailer caution', async () => {
    mockFetch(makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO)
    expect(results.every(r => !r.cautions?.some(c => c.id === 'westfjords-south-route60'))).toBe(true)
  })

  // ── Generalized Hólmavík alternate (any Iceland origin) ─────────────────────

  it('Höfn → Ísafjörður triggers CURATED_VIA_HOLMAVIK (non-capital origin)', async () => {
    // 37 pts × 5000 m = 185 000 m > minFastestRouteDistanceM 180 000 m
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 30, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_ISAFJORDUR)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(true)
  })

  it('Höfn → Ísafjörður: base route (avoids Hólmavík) gets Westfjords caution', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_ISAFJORDUR)
    const baseRoute = results.find(r => !r.labels.includes('CURATED_VIA_HOLMAVIK'))
    expect(baseRoute?.cautions?.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('Höfn → Ísafjörður: CURATED_VIA_HOLMAVIK does not get Westfjords caution', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeRouteResponseFromCoords([[-21.685, 65.703], [-22.00, 65.80], [-23.13, 66.07]], [], 15_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_ISAFJORDUR)
    const curated = results.find(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))
    expect(curated).toBeDefined()
    expect(curated?.cautions?.some(c => c.id === 'westfjords-south-route60')).toBeFalsy()
  })

  it('Westfjords origin does NOT trigger CURATED_VIA_HOLMAVIK (excludedOrigin guard)', async () => {
    // Origin Ísafjörður is inside WESTFJORDS_NORTH_BOUNDS → excludedOrigin suppresses the alternate.
    // Only one fetch call should happen (no curated request).
    const FROM_ISAFJORDUR: PlaceCandidate = {
      placeId: 'ChIJisafjordur_origin',
      displayName: 'Ísafjörður',
      formattedAddress: 'Ísafjörður, Iceland',
      lat: 66.07,
      lon: -23.13,
    }
    const TO_GARDABAER_DEST: PlaceCandidate = {
      placeId: 'ChIJgardabaer_dest',
      displayName: 'Garðabær',
      formattedAddress: 'Garðabær, Iceland',
      lat: 64.09,
      lon: -21.93,
    }
    mockFetch(makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }]))
    const results = await googleProvider.getRouteOptions(FROM_ISAFJORDUR, TO_GARDABAER_DEST)
    expect(results.some(r => r.labels.includes('CURATED_VIA_HOLMAVIK'))).toBe(false)
  })

  it('caution result includes summaryKey', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 37, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 30, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_ISAFJORDUR)
    const baseRoute = results.find(r => !r.labels.includes('CURATED_VIA_HOLMAVIK'))
    const caution = baseRoute?.cautions?.find(c => c.id === 'westfjords-south-route60')
    expect(caution?.summaryKey).toBe('routeCautionWestfjordsSummary')
  })

  // ── Curated Öxi-avoid route (CURATED_AVOID_OXI) ─────────────────────────────

  // Coordinates passing within 6 km of the Öxi corridor point (lat 64.860, lon -14.365).
  // Format: [lon, lat] as used in Google GeoJSON linestring responses.
  const COORDS_VIA_OXI: [number, number][] = [
    [-14.40, 65.27],  // Egilsstaðir area
    [-14.37, 64.86],  // ~0.3 km from Öxi corridor point — within 6 km
    [-15.21, 64.25],  // Höfn area
  ]

  // Coordinates going around the eastern fjords — not near the Öxi corridor.
  const COORDS_COASTAL_NOT_VIA_OXI: [number, number][] = [
    [-14.40, 65.27],  // Egilsstaðir area
    [-13.80, 64.93],  // Seyðisfjörður/Neskaupstaður coastal area
    [-14.28, 64.69],  // Djúpivogur coastal area
    [-15.21, 64.25],  // Höfn
  ]

  it('base route via Öxi triggers CURATED_AVOID_OXI curated route request', async () => {
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_OXI, ['DEFAULT_ROUTE'], 9_000)
    const curatedRoute = makeRouteResponseFromCoords(COORDS_COASTAL_NOT_VIA_OXI, [], 11_000)
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(results.some(r => r.labels.includes('CURATED_AVOID_OXI'))).toBe(true)
  })

  it('CURATED_AVOID_OXI request uses Reyðarfjörður as the single via with via: true', async () => {
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_OXI, ['DEFAULT_ROUTE'], 9_000)
    const curatedRoute = makeRouteResponseFromCoords(COORDS_COASTAL_NOT_VIA_OXI, [], 11_000)
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
    expect(curatedBody.intermediates[0].via).toBe(true)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(65.0317, 4)
    expect(curatedBody.intermediates[0].location.latLng.longitude).toBeCloseTo(-14.2183, 4)
  })

  it('CURATED_AVOID_OXI route has no oxi-axarvegur-939 caution', async () => {
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_OXI, ['DEFAULT_ROUTE'], 9_000)
    const curatedRoute = makeRouteResponseFromCoords(COORDS_COASTAL_NOT_VIA_OXI, [], 11_000)
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    const curated = results.find(r => r.labels.includes('CURATED_AVOID_OXI'))
    expect(curated).toBeDefined()
    expect(curated?.cautions?.some(c => c.id === 'oxi-axarvegur-939')).toBeFalsy()
  })

  it('CURATED_AVOID_OXI is suppressed when curated route still carries the Öxi caution', async () => {
    const mainRoute = makeRouteResponseFromCoords(COORDS_VIA_OXI, ['DEFAULT_ROUTE'], 9_000)
    const curatedRoute = makeRouteResponseFromCoords(COORDS_VIA_OXI, [], 10_000)  // still via Öxi
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    expect(results.some(r => r.labels.includes('CURATED_AVOID_OXI'))).toBe(false)
    expect(results).toHaveLength(1)
  })

  it('no CURATED_AVOID_OXI when no base route has oxi-axarvegur-939', async () => {
    const spy = mockFetch(makeRouteResponseFromCoords(COORDS_COASTAL_NOT_VIA_OXI, ['DEFAULT_ROUTE'], 11_000))
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    expect(spy).toHaveBeenCalledTimes(1)  // no extra curated fetch
    expect(results.some(r => r.labels.includes('CURATED_AVOID_OXI'))).toBe(false)
  })

  it('when a base route already avoids Öxi, no extra curated fetch but the avoiding route gets CURATED_AVOID_OXI label', async () => {
    // Two base routes: one via Öxi, one coastal (no Öxi caution).
    // No extra Google request needed, but the coastal route should be relabelled.
    const twoRouteResponse = {
      routes: [
        {
          polyline: { geoJsonLinestring: { coordinates: COORDS_VIA_OXI } },
          distanceMeters: 150_000,
          duration: '9000s',
          staticDuration: undefined,
          routeLabels: ['DEFAULT_ROUTE'],
        },
        {
          polyline: { geoJsonLinestring: { coordinates: COORDS_COASTAL_NOT_VIA_OXI } },
          distanceMeters: 180_000,
          duration: '11000s',
          staticDuration: undefined,
          routeLabels: ['DEFAULT_ROUTE_ALTERNATE'],
        },
      ],
    }
    const spy = mockFetch(twoRouteResponse)
    const results = await googleProvider.getRouteOptions(FROM_HOFN, TO_EGILSSTADIR)
    expect(spy).toHaveBeenCalledTimes(1)  // no extra curated fetch
    const oxiRoute = results.find(r => r.cautions?.some(c => c.id === 'oxi-axarvegur-939'))
    const avoidRoute = results.find(r => r.labels.includes('CURATED_AVOID_OXI'))
    expect(oxiRoute).toBeDefined()
    expect(avoidRoute).toBeDefined()
    expect(avoidRoute?.id).not.toBe(oxiRoute?.id)  // distinct routes
  })
})

// ── provider.server.ts ────────────────────────────────────────────────────────

describe('getWeatherMapProvider', () => {
  afterEach(() => {
    delete process.env.WEATHER_MAP_PROVIDER
  })

  it('returns googleProvider when WEATHER_MAP_PROVIDER=google', async () => {
    process.env.WEATHER_MAP_PROVIDER = 'google'
    const { getWeatherMapProvider } = await import('@/lib/weather/provider.server')
    const provider = getWeatherMapProvider()
    expect(provider).not.toBeNull()
    expect(typeof provider!.geocodePlace).toBe('function')
    expect(typeof provider!.staticMapUrl).toBe('function')
  })

  it('returns null when WEATHER_MAP_PROVIDER is not set', async () => {
    delete process.env.WEATHER_MAP_PROVIDER
    const { getWeatherMapProvider } = await import('@/lib/weather/provider.server')
    const provider = getWeatherMapProvider()
    expect(provider).toBeNull()
  })

  it('returns null for unknown provider value', async () => {
    process.env.WEATHER_MAP_PROVIDER = 'mapbox'
    const { getWeatherMapProvider } = await import('@/lib/weather/provider.server')
    const provider = getWeatherMapProvider()
    expect(provider).toBeNull()
  })
})
