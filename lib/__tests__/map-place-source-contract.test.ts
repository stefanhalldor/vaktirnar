import { describe, expect, it } from 'vitest'
import type { PlaceSource, SelectedLocation } from '@/lib/places/types'
import { parsePlaceSearchResults } from '@/lib/road-intelligence/placeSearchBridge'

describe('map-selected place contracts', () => {
  it('defines map as a provider-neutral place source', () => {
    const source: PlaceSource = 'map'
    const place: SelectedLocation = {
      id: 'map:63.835700:-20.400100',
      source,
      name: 'Valinn staður á korti',
      formattedAddress: 'Nálægt Hella',
      lat: 63.8357004,
      lon: -20.4000996,
    }

    expect(place).toMatchObject({
      source: 'map',
      lat: 63.8357004,
      lon: -20.4000996,
    })
    expect(place).not.toHaveProperty('googlePlaceId')
    expect(place).not.toHaveProperty('placeId')
    expect(place).not.toHaveProperty('routingRef')
  })

  it('preserves exact map coordinates and provenance through the road-intelligence parser', () => {
    const [parsed] = parsePlaceSearchResults({
      results: [{
        name: 'Valinn staður á korti',
        formattedAddress: 'Nálægt Hella',
        lat: 63.8357004,
        lon: -20.4000996,
        source: 'map',
        sourceId: 'map:63.835700:-20.400100',
      }],
    })

    expect(parsed).toEqual({
      name: 'Valinn staður á korti',
      formattedAddress: 'Nálægt Hella',
      lat: 63.8357004,
      lon: -20.4000996,
      source: 'map',
      sourceId: 'map:63.835700:-20.400100',
    })
    expect(parsed.googlePlaceId).toBeUndefined()
    expect(parsed.placeId).toBeUndefined()
  })
})
