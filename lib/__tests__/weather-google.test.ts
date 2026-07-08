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
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    const curated = results.find(r => r.labels.includes('CURATED_VIA_THRENGSLAVEGUR'))
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
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
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

  // ── Curated Þrengslavegur route ───────────────────────────────────────────

  it('uses curated route registry entry for capital-area → Þorlákshöfn (makes extra request)', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    // Curated response: different geometry (different numPoints)
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('curated route has CURATED_VIA_THRENGSLAVEGUR label when geometry differs from main routes', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(results.some(r => r.labels.includes('CURATED_VIA_THRENGSLAVEGUR'))).toBe(true)
  })

  it('curated route uses via: true intermediate waypoint on Þrengslavegur', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 7, labels: [] }])
    const spy = mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    const curatedBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(curatedBody.intermediates).toHaveLength(1)
    expect(curatedBody.intermediates[0].via).toBe(true)
    expect(curatedBody.intermediates[0].location.latLng.latitude).toBeCloseTo(63.955, 2)
  })

  it('curated route is skipped when geometry matches a main route', async () => {
    // Same numPoints = same coordinate fingerprint as main route
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    const curatedRoute = makeMultiRouteResponse([{ numPoints: 10, labels: [] }])
    mockFetchSequence([{ body: mainRoute }, { body: curatedRoute }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(results).toHaveLength(1)
    expect(results.some(r => r.labels.includes('CURATED_VIA_THRENGSLAVEGUR'))).toBe(false)
  })

  it('curated route is silently omitted when Google returns no route', async () => {
    const mainRoute = makeMultiRouteResponse([{ numPoints: 10, labels: ['DEFAULT_ROUTE'] }])
    mockFetchSequence([{ body: mainRoute }, { body: { routes: [] } }])
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(results).toHaveLength(1)
    expect(results[0].labels).toContain('DEFAULT_ROUTE')
  })

  it('does not make a curated request for non-Þorlákshöfn destination', async () => {
    const spy = mockFetch(makeMultiRouteResponse([{ numPoints: 5, labels: ['DEFAULT_ROUTE'] }]))
    await googleProvider.getRouteOptions(FROM, TO)  // FROM → Akureyri
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
    const results = await googleProvider.getRouteOptions(FROM_GARDABAER, TO_THORLAKSHOFN)
    expect(results).toHaveLength(2)
    expect(results[0].durationS).toBeLessThan(results[1].durationS)
    expect(results.some(r => r.labels.includes('CURATED_VIA_THRENGSLAVEGUR'))).toBe(true)
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
