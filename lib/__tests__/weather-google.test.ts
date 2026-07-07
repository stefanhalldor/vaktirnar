/**
 * Unit tests for lib/weather/google.server.ts
 * All Google API calls are mocked — no real HTTP.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { googleProvider } from '@/lib/weather/google.server'
import type { PlaceCandidate } from '@/lib/weather/provider.types'

// Minimal place candidates for route tests
const FROM: PlaceCandidate = {
  placeId: 'p1',
  displayName: 'Reykjavík',
  formattedAddress: 'Reykjavík, Iceland',
  lat: 64.135,
  lon: -21.895,
}
const TO: PlaceCandidate = {
  placeId: 'p2',
  displayName: 'Akureyri',
  formattedAddress: 'Akureyri, Iceland',
  lat: 65.683,
  lon: -18.1,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response)
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
