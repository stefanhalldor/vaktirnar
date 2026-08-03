import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchOfficialToponyms } from '@/lib/places/toponymDirectory.server'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('official toponym directory', () => {
  it('maps bounded IS 50V polygon results to provider-neutral route points', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        bbox: [-20.84, 64.89, -20.79, 64.92],
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[-20.84, 64.89], [-20.79, 64.92], [-20.84, 64.89]]]],
        },
        properties: {
          uuid: 'lake-1',
          ornefni: 'Langavatn',
          nafnberi: 'stöðuvatn',
          ornefnaflokkur: 'Vatnaörnefni Mið',
        },
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchOfficialToponyms('Langavatn', 8)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: 'official:toponym:lake-1',
      source: 'official',
      sourceId: 'toponym:lake-1',
      name: 'Langavatn',
      formattedAddress: 'Stöðuvatn · 64.905, -20.815',
      placeType: 'point',
    })
    expect(results[0].lat).toBeCloseTo(64.905, 6)
    expect(results[0].lon).toBeCloseTo(-20.815, 6)
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestedUrl.hostname).toBe('gis.lmi.is')
    expect(requestedUrl.searchParams.get('CQL_FILTER')).toBe("ornefni ILIKE '%Langavatn%'")
    expect(requestedUrl.searchParams.get('count')).toBe('16')
  })

  it('fails softly for upstream errors, invalid geometry and wildcard-only input', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchOfficialToponyms('Langavatn')).resolves.toEqual([])
    await expect(searchOfficialToponyms('%%')).resolves.toEqual([])
  })
})
