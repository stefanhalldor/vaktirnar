/**
 * Compatibility smoke tests for the provider-neutral place-search endpoint.
 * The detailed HMS/local/Google matrix lives in hms-place-api.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAccess: vi.fn(),
  weatherMode: vi.fn(),
  searchHmsPlaces: vi.fn(),
  searchOfficialToponyms: vi.fn(),
  findSuggestions: vi.fn(),
  mergeSuggestions: vi.fn(),
  geocodePlace: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  resolveWeatherBaseAccess: mocks.resolveAccess,
  getWeatherEnabledMode: mocks.weatherMode,
}))
vi.mock('@/lib/places/hmsDirectory.server', () => ({
  searchHmsPlaces: mocks.searchHmsPlaces,
}))
vi.mock('@/lib/places/toponymDirectory.server', () => ({
  searchOfficialToponyms: mocks.searchOfficialToponyms,
}))
vi.mock('@/lib/road-intelligence/roadMapPlaces', () => ({
  findRoadMapPlaceSuggestions: mocks.findSuggestions,
  mergePlaceSuggestions: mocks.mergeSuggestions,
}))
vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: vi.fn(() => ({ geocodePlace: mocks.geocodePlace })),
}))

import { GET, POST } from '@/app/api/place/search/route'

function post(body: unknown) {
  return new NextRequest('http://localhost/api/place/search?q=must-not-be-read', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.220',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.HMS_PLACE_SEARCH_ENABLED = 'true'
  delete process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED
  mocks.weatherMode.mockReturnValue('all')
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.resolveAccess.mockResolvedValue({ mode: 'public', userId: null, actor: 'public' })
  mocks.searchHmsPlaces.mockResolvedValue([])
  mocks.searchOfficialToponyms.mockResolvedValue([])
  mocks.findSuggestions.mockReturnValue([])
  mocks.mergeSuggestions.mockImplementation((primary, secondary, limit) => (
    [...primary, ...secondary].slice(0, limit)
  ))
  mocks.geocodePlace.mockResolvedValue([])
})

describe('/api/place/search compatibility contract', () => {
  it('keeps the former GET transport disabled to avoid address leakage in URLs', async () => {
    const response = await GET()

    expect(response.status).toBe(405)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('reads the address from the POST body, not from the URL query string', async () => {
    const response = await POST(post({ query: 'Akureyri' }))

    expect(response.status).toBe(200)
    expect(mocks.searchHmsPlaces).toHaveBeenCalledWith('Akureyri', 8)
    expect(mocks.searchHmsPlaces).not.toHaveBeenCalledWith('must-not-be-read', expect.anything())
  })

  it('preserves public weather access without requiring Google Places', async () => {
    mocks.searchHmsPlaces.mockResolvedValue([{
      id: 'hms:0002001',
      source: 'hms',
      sourceId: '0002001',
      name: 'Laugavegur 10',
      formattedAddress: 'Laugavegur 10, 101 Reykjavík',
      lat: 64.145,
      lon: -21.93,
    }])

    const response = await POST(post({ query: 'Laugavegur 10' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({ source: 'hms', sourceId: '0002001' })
    expect(mocks.geocodePlace).not.toHaveBeenCalled()
  })

  it('fills unresolved names from official toponyms before the Google fallback', async () => {
    mocks.searchOfficialToponyms.mockResolvedValue([{
      id: 'official:toponym:lake-1',
      source: 'official',
      sourceId: 'toponym:lake-1',
      name: 'Langavatn',
      formattedAddress: 'Stöðuvatn · 64.905, -20.817',
      placeType: 'point',
      lat: 64.905,
      lon: -20.817,
    }])

    const response = await POST(post({ query: 'Langavatn' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.searchOfficialToponyms).toHaveBeenCalledWith('Langavatn', 8)
    expect(body.results[0]).toMatchObject({
      source: 'official',
      sourceId: 'toponym:lake-1',
      name: 'Langavatn',
      placeType: 'point',
    })
    expect(mocks.geocodePlace).not.toHaveBeenCalled()
  })

  it('does not call the remote toponym source when a local exact name is available', async () => {
    mocks.searchHmsPlaces.mockResolvedValue([{
      id: 'hms:akureyri',
      source: 'hms',
      sourceId: 'akureyri',
      name: 'Akureyri',
      formattedAddress: '600 Akureyri',
      lat: 65.683,
      lon: -18.11,
    }])

    const response = await POST(post({ query: 'Akureyri' }))

    expect(response.status).toBe(200)
    expect(mocks.searchOfficialToponyms).not.toHaveBeenCalled()
  })
})
