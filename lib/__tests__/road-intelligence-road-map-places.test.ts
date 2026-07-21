import { describe, expect, it } from 'vitest'
import {
  ROAD_MAP_PLACES,
  findRoadMapPlaceSuggestions,
  mergePlaceSuggestions,
} from '@/lib/road-intelligence/roadMapPlaces'

describe('roadMapPlaces', () => {
  it('finds core places with accent-insensitive queries', () => {
    expect(findRoadMapPlaceSuggestions('reykjavik')[0]?.name).toBe('Reykjavík')
    expect(findRoadMapPlaceSuggestions('Egilsstadir')[0]?.name).toBe('Egilsstaðir')
  })

  it('keeps Borgarnes available as a first-class route endpoint', () => {
    const borgarnes = findRoadMapPlaceSuggestions('Borgarnes')[0]

    expect(borgarnes).toMatchObject({
      name: 'Borgarnes',
      formattedAddress: 'Borgarnes, Ísland',
    })
    expect(Number.isFinite(borgarnes?.lat)).toBe(true)
    expect(Number.isFinite(borgarnes?.lon)).toBe(true)
  })

  it('merges fetched provider results with local fallbacks without duplicates', () => {
    const localReykjavik = findRoadMapPlaceSuggestions('Reykjavík')[0]
    const merged = mergePlaceSuggestions(
      [
        {
          name: 'Reykjavík',
          formattedAddress: 'Reykjavíkurborg, Ísland',
          lat: 64.1467,
          lon: -21.9426,
          placeId: 'provider-reykjavik',
        },
      ],
      [localReykjavik],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.placeId).toBe('provider-reykjavik')
  })

  it('keeps all curated places inside the Iceland coordinate envelope', () => {
    for (const place of ROAD_MAP_PLACES) {
      expect(place.lat).toBeGreaterThanOrEqual(63)
      expect(place.lat).toBeLessThanOrEqual(67)
      expect(place.lon).toBeGreaterThanOrEqual(-25)
      expect(place.lon).toBeLessThanOrEqual(-13)
    }
  })
})
