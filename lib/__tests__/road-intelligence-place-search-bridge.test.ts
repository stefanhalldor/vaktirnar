import { describe, expect, it } from 'vitest'
import {
  normalizePlaceSearchText,
  parsePlaceSearchResults,
  selectBestPlaceForQuery,
} from '@/lib/road-intelligence/placeSearchBridge'

describe('placeSearchBridge', () => {
  it('normalizes common Icelandic place spelling differences', () => {
    expect(normalizePlaceSearchText('reykjavik')).toBe(normalizePlaceSearchText('Reykjavík'))
    expect(normalizePlaceSearchText('Egilsstadir')).toBe(normalizePlaceSearchText('Egilsstaðir'))
  })

  it('parses current /api/place/search response shape', () => {
    expect(parsePlaceSearchResults({
      results: [
        {
          name: 'Akureyri',
          formattedAddress: 'Akureyri, Ísland',
          lat: 65.6835,
          lon: -18.0878,
          placeId: 'akureyri-place',
        },
      ],
    })).toEqual([
      {
        name: 'Akureyri',
        formattedAddress: 'Akureyri, Ísland',
        lat: 65.6835,
        lon: -18.0878,
        placeId: 'akureyri-place',
      },
    ])
  })

  it('parses provider-like candidate shapes defensively', () => {
    expect(parsePlaceSearchResults({
      candidates: [
        {
          displayName: 'Reykjavík',
          formattedAddress: 'Reykjavík, Ísland',
          lat: 64.1466,
          lng: -21.9426,
          place_id: 'reykjavik-place',
        },
      ],
    })).toEqual([
      {
        name: 'Reykjavík',
        formattedAddress: 'Reykjavík, Ísland',
        lat: 64.1466,
        lon: -21.9426,
        placeId: 'reykjavik-place',
      },
    ])
  })

  it('selects an accent-insensitive exact match before later candidates', () => {
    const result = selectBestPlaceForQuery('reykjavik', [
      { name: 'Reykjahlíð', formattedAddress: 'Reykjahlíð, Ísland', lat: 65.64, lon: -16.91 },
      { name: 'Reykjavík', formattedAddress: 'Reykjavík, Ísland', lat: 64.1466, lon: -21.9426 },
    ])

    expect(result?.name).toBe('Reykjavík')
  })

  it('can use the first fetched result as a direct-typing fallback', () => {
    const result = selectBestPlaceForQuery('Akur', [
      { name: 'Akureyri', formattedAddress: 'Akureyri, Ísland', lat: 65.6835, lon: -18.0878 },
    ], { allowFirstFallback: true })

    expect(result?.name).toBe('Akureyri')
  })
})
