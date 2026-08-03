import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAccess: vi.fn(),
  weatherMode: vi.fn(),
  searchHmsPlaces: vi.fn(),
  searchOfficialToponyms: vi.fn(),
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
}))

vi.mock('@/lib/places/toponymDirectory.server', () => ({
  searchOfficialToponyms: mocks.searchOfficialToponyms,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: mocks.getWeatherMapProvider,
}))

import { POST } from '@/app/api/place/search/route'

let requestSequence = 0

function searchRequest(query: string): NextRequest {
  requestSequence += 1
  return new NextRequest('http://localhost/api/place/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${requestSequence}`,
    },
    body: JSON.stringify({ query }),
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
  mocks.getWeatherMapProvider.mockReturnValue(null)
})

describe('place-search settlement intent with the real merge layer', () => {
  it('ranks the canonical Akureyri settlement above weaker HMS matches', async () => {
    mocks.searchHmsPlaces.mockResolvedValue([
      {
        id: 'hms:weaker-akureyri-match',
        source: 'hms',
        sourceId: 'weaker-akureyri-match',
        name: 'Akureyri',
        formattedAddress: '801 Selfoss, dreifbýli · Sveitarfélagið Árborg',
        placeType: 'address',
        postalCode: '801',
        postalLocality: 'Selfoss, dreifbýli',
        lat: 63.93,
        lon: -20.99,
      },
    ])

    const response = await POST(searchRequest('Akureyri'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({
      source: 'official',
      name: 'Akureyri',
      formattedAddress: '600 Akureyri',
      postalCode: '600',
      postalLocality: 'Akureyri',
      placeType: 'settlement',
    })
  })

  it.each([
    ['Reykjavík', 'Reykjavík'],
    ['Egilsstaðir', 'Egilsstaðir'],
    ['Hella', 'Hella'],
  ])('keeps exact settlement-name intent first for %s', async (query, name) => {
    const response = await POST(searchRequest(query))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({
      source: 'official',
      name,
      placeType: 'settlement',
    })
  })

  it('keeps an exact HMS address above a settlement prefix for address intent', async () => {
    mocks.searchHmsPlaces.mockResolvedValue([
      {
        id: 'hms:hella-8',
        source: 'hms',
        sourceId: 'hella-8',
        name: 'Hella 8',
        formattedAddress: 'Hella 8, 850 Hella',
        placeType: 'address',
        postalCode: '850',
        postalLocality: 'Hella',
        lat: 63.835,
        lon: -20.397,
      },
    ])

    const response = await POST(searchRequest('Hella 8'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({
      source: 'hms',
      name: 'Hella 8',
      placeType: 'address',
    })
  })
})
