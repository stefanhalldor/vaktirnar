import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAccess: vi.fn(),
  weatherMode: vi.fn(),
  searchHmsPlaces: vi.fn(),
  reverseHmsPlace: vi.fn(),
  findSuggestions: vi.fn(),
  mergeSuggestions: vi.fn(),
  findNearest: vi.fn(),
  geocodePlace: vi.fn(),
  getWeatherMapProvider: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  resolveWeatherBaseAccess: mocks.resolveAccess,
  getWeatherEnabledMode: mocks.weatherMode,
}))

vi.mock('@/lib/places/hmsDirectory.server', () => ({
  searchHmsPlaces: mocks.searchHmsPlaces,
  reverseHmsPlace: mocks.reverseHmsPlace,
}))

vi.mock('@/lib/road-intelligence/roadMapPlaces', () => ({
  findRoadMapPlaceSuggestions: mocks.findSuggestions,
  mergePlaceSuggestions: mocks.mergeSuggestions,
  findNearestKnownRoadMapPlace: mocks.findNearest,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: mocks.getWeatherMapProvider,
}))

import {
  GET as GET_SEARCH,
  POST as POST_SEARCH,
} from '@/app/api/place/search/route'
import {
  GET as GET_REVERSE,
  POST as POST_REVERSE,
} from '@/app/api/place/reverse-geocode/route'

const HMS_LOCATION = {
  id: 'hms:0002001',
  source: 'hms' as const,
  sourceId: '0002001',
  name: 'Laugavegur 10B',
  formattedAddress: 'Laugavegur 10B, 101 Reykjavík',
  postalCode: '101',
  municipality: 'Reykjavík',
  lat: 64.145,
  lon: -21.93,
}

let requestSequence = 0
let warnSpy: ReturnType<typeof vi.spyOn>

function searchRequest(
  query: unknown,
  options: { ip?: string; malformedJson?: boolean } = {},
): NextRequest {
  requestSequence += 1
  return new NextRequest('http://localhost/api/place/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': options.ip ?? `198.51.100.${requestSequence}`,
    },
    body: options.malformedJson ? '{' : JSON.stringify({ query }),
  })
}

function reverseRequest(
  body: unknown,
  options: { ip?: string; malformedJson?: boolean } = {},
): NextRequest {
  requestSequence += 1
  return new NextRequest('http://localhost/api/place/reverse-geocode', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': options.ip ?? `203.0.113.${requestSequence}`,
    },
    body: options.malformedJson ? '{' : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.HMS_PLACE_SEARCH_ENABLED = 'true'
  delete process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED
  mocks.weatherMode.mockReturnValue('all')
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.resolveAccess.mockResolvedValue({ mode: 'public', userId: null, actor: 'public' })
  mocks.searchHmsPlaces.mockResolvedValue([])
  mocks.reverseHmsPlace.mockResolvedValue(null)
  mocks.findSuggestions.mockReturnValue([])
  mocks.findNearest.mockReturnValue(null)
  mocks.geocodePlace.mockResolvedValue([])
  mocks.getWeatherMapProvider.mockReturnValue({ geocodePlace: mocks.geocodePlace })
  mocks.mergeSuggestions.mockImplementation((primary, secondary, limit) => (
    [...primary, ...secondary].slice(0, limit)
  ))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/place/search — HMS-first privacy contract', () => {
  it('keeps GET disabled so addresses cannot enter URL logs or browser history', async () => {
    const response = await GET_SEARCH()

    expect(response.status).toBe(405)
    expect(await response.json()).toMatchObject({
      results: [],
      error: 'method_not_allowed',
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('preserves the AUTH and weather kill switches before directory work', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    expect((await POST_SEARCH(searchRequest('Reykjavík'))).status).toBe(404)
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()

    process.env.AUTH_MVP_ENABLED = 'true'
    mocks.weatherMode.mockReturnValue('off')
    expect((await POST_SEARCH(searchRequest('Reykjavík'))).status).toBe(404)
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()
  })

  it('blocks callers rejected by base weather access', async () => {
    mocks.resolveAccess.mockResolvedValue({ mode: 'blocked' })

    const response = await POST_SEARCH(searchRequest('Reykjavík'))

    expect(response.status).toBe(401)
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()
  })

  it.each([
    ['one-character query', 'x'],
    ['overlong query', 'x'.repeat(101)],
    ['non-string query', 123],
  ])('rejects %s before querying HMS', async (_label, query) => {
    const response = await POST_SEARCH(searchRequest(query))

    expect(response.status).toBe(400)
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with a private no-store response', async () => {
    const response = await POST_SEARCH(searchRequest(null, { malformedJson: true }))

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns HMS results without calling or exposing Google Places identity', async () => {
    mocks.searchHmsPlaces.mockResolvedValue([HMS_LOCATION])

    const response = await POST_SEARCH(searchRequest('  Laugavegur 10  '))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.searchHmsPlaces).toHaveBeenCalledWith('Laugavegur 10', 8)
    expect(mocks.geocodePlace).not.toHaveBeenCalled()
    expect(body.results).toEqual([HMS_LOCATION])
    expect(body.results[0]).not.toHaveProperty('placeId')
    expect(body.results[0]).not.toHaveProperty('googlePlaceId')
  })

  it('keeps HMS reads off behind the independent shadow-rollout flag', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    mocks.searchHmsPlaces.mockResolvedValue([HMS_LOCATION])

    const response = await POST_SEARCH(searchRequest('Laugavegur 10'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()
  })

  it('keeps Google disabled by default when local sources return no match', async () => {
    const response = await POST_SEARCH(searchRequest('Óþekktur staður'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
    expect(mocks.geocodePlace).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[place-search] Google fallback unavailable (category=fallback_disabled)',
    )
  })

  it('reports a missing Google provider without logging the query', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED = 'true'
    mocks.getWeatherMapProvider.mockReturnValue(null)

    const response = await POST_SEARCH(searchRequest('Private Laugavegur 10'))

    expect(response.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(
      '[place-search] Google fallback unavailable (category=provider_unavailable)',
    )
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Private Laugavegur 10')
  })

  it('reports an upstream Google error without exposing error or query details', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED = 'true'
    mocks.geocodePlace.mockRejectedValue(new Error('secret upstream detail'))

    const response = await POST_SEARCH(searchRequest('Private Melás 8'))

    expect(response.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(
      '[place-search] Google fallback unavailable (category=upstream_error)',
    )
    const serializedLogs = JSON.stringify(warnSpy.mock.calls)
    expect(serializedLogs).not.toContain('Private Melás 8')
    expect(serializedLogs).not.toContain('secret upstream detail')
  })

  it('distinguishes zero Google candidates from candidates outside Iceland', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED = 'true'

    await POST_SEARCH(searchRequest('No provider match'))
    expect(warnSpy).toHaveBeenLastCalledWith(
      '[place-search] Google fallback unavailable (category=zero_candidates)',
    )

    mocks.geocodePlace.mockResolvedValue([{
      placeId: 'outside-iceland',
      displayName: 'Outside',
      formattedAddress: 'Outside',
      lat: 51.5072,
      lon: -0.1276,
    }])
    await POST_SEARCH(searchRequest('Outside Iceland'))
    expect(warnSpy).toHaveBeenLastCalledWith(
      '[place-search] Google fallback unavailable (category=all_candidates_outside_iceland)',
    )
  })

  it('uses Google only as an explicit transitional fallback after local misses', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED = 'true'
    mocks.geocodePlace.mockResolvedValue([{
      placeId: 'ChIJgoogle',
      displayName: 'Google result',
      formattedAddress: 'Google result, Ísland',
      lat: 64.1,
      lon: -21.9,
    }])

    const response = await POST_SEARCH(searchRequest('Google result'))
    const body = await response.json()

    expect(mocks.geocodePlace).toHaveBeenCalledWith('Google result Ísland')
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalled()
    expect(body.results[0]).toMatchObject({
      source: 'google',
      googlePlaceId: 'ChIJgoogle',
    })
  })

  it('hard-caps the response even if a repository returns too many rows', async () => {
    mocks.searchHmsPlaces.mockResolvedValue(Array.from({ length: 15 }, (_, index) => ({
      ...HMS_LOCATION,
      id: `hms:${index}`,
      sourceId: String(index),
      name: `Laugavegur ${index}`,
    })))

    const response = await POST_SEARCH(searchRequest('Laugavegur'))

    expect((await response.json()).results).toHaveLength(8)
  })

  it('rate-limits repeated requests before another directory read', async () => {
    const ip = '192.0.2.90'
    for (let index = 0; index < 30; index += 1) {
      expect((await POST_SEARCH(searchRequest('Reykjavík', { ip }))).status).toBe(200)
    }
    const callsBeforeBlockedRequest = mocks.searchHmsPlaces.mock.calls.length

    const response = await POST_SEARCH(searchRequest('Reykjavík', { ip }))

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: 'rate_limited' })
    expect(mocks.searchHmsPlaces).toHaveBeenCalledTimes(callsBeforeBlockedRequest)
  })
})

describe('POST /api/place/reverse-geocode — local-only GPS label contract', () => {
  it('keeps GET disabled so exact GPS coordinates cannot enter a URL', async () => {
    const response = await GET_REVERSE()

    expect(response.status).toBe(405)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('rejects malformed and outside-Iceland coordinates before HMS work', async () => {
    for (const body of [
      { lat: '64', lon: -21.9 },
      { lat: Number.NaN, lon: -21.9 },
      { lat: 51.5, lon: -0.12 },
    ]) {
      expect((await POST_REVERSE(reverseRequest(body))).status).toBe(400)
    }
    expect(mocks.reverseHmsPlace).not.toHaveBeenCalled()
  })

  it('uses the local HMS directory and returns no-store output', async () => {
    mocks.reverseHmsPlace.mockResolvedValue({
      location: HMS_LOCATION,
      distanceM: 42,
    })

    const response = await POST_REVERSE(reverseRequest({ lat: 64.146, lon: -21.94 }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.reverseHmsPlace).toHaveBeenCalledWith(64.146, -21.94, 25_000)
    expect(mocks.findNearest).not.toHaveBeenCalled()
    expect(body).toEqual({ location: HMS_LOCATION, distanceM: 42 })
  })

  it('keeps reverse HMS reads off behind the shadow-rollout flag', async () => {
    process.env.HMS_PLACE_SEARCH_ENABLED = 'false'
    mocks.reverseHmsPlace.mockResolvedValue({ location: HMS_LOCATION, distanceM: 42 })

    const response = await POST_REVERSE(reverseRequest({ lat: 64.146, lon: -21.94 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ location: null })
    expect(mocks.reverseHmsPlace).not.toHaveBeenCalled()
  })

  it('uses a curated local fallback when HMS is unavailable', async () => {
    mocks.reverseHmsPlace.mockRejectedValue(new Error('database unavailable'))
    mocks.findNearest.mockReturnValue({
      place: {
        id: 'reykjavik',
        name: 'Reykjavík',
        formattedAddress: 'Reykjavík, Ísland',
        lat: 64.1466,
        lon: -21.9426,
      },
      distanceM: 100,
    })

    const response = await POST_REVERSE(reverseRequest({ lat: 64.146, lon: -21.94 }))
    const body = await response.json()

    expect(body).toMatchObject({
      location: { source: 'static', name: 'Reykjavík' },
      distanceM: 100,
    })
  })

  it('returns null rather than inventing a distant address', async () => {
    const response = await POST_REVERSE(reverseRequest({ lat: 63.2, lon: -24.5 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ location: null })
  })

  it('rate-limits repeated reverse lookups before another directory read', async () => {
    const ip = '192.0.2.91'
    for (let index = 0; index < 20; index += 1) {
      expect((await POST_REVERSE(reverseRequest({ lat: 64.1, lon: -21.9 }, { ip }))).status).toBe(200)
    }
    const callsBeforeBlockedRequest = mocks.reverseHmsPlace.mock.calls.length

    const response = await POST_REVERSE(reverseRequest({ lat: 64.1, lon: -21.9 }, { ip }))

    expect(response.status).toBe(429)
    expect(mocks.reverseHmsPlace).toHaveBeenCalledTimes(callsBeforeBlockedRequest)
  })
})
