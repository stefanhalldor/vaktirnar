import { describe, expect, it } from 'vitest'

import generatedDirectory from '@/lib/places/officialPlaceDirectory.generated.json'
import { OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE } from '@/lib/places/officialPlaceAttribution.generated'
import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalLocality,
  officialSettlementGeometryContains,
  officialPlaceHasAlias,
  officialPlaceSearchScore,
  searchOfficialPlaces,
  type OfficialSettlementGeometry,
} from '@/lib/places/officialPlaceDirectory.server'

describe('official place directory runtime', () => {
  it('ships a validated last-known-good snapshot without unverified population claims', () => {
    const sourceIds = generatedDirectory.settlements.flatMap(place => place.is50vIds)

    expect(generatedDirectory.schemaVersion).toBe(2)
    expect(generatedDirectory.settlements.length).toBeGreaterThanOrEqual(100)
    expect(Object.keys(generatedDirectory.postalLocalities).length).toBeGreaterThanOrEqual(170)
    expect(new Set(sourceIds).size).toBe(sourceIds.length)
    expect(generatedDirectory.settlements.every(place => place.population2024 === null)).toBe(true)
    expect(generatedDirectory.settlements.every(place => (
      place.geometry.type === 'MultiPolygon'
      && place.geometry.coordinates.length > 0
      && place.geometry.coordinates.every(polygon => (
        polygon.length > 0
        && polygon.every(ring => (
          ring.length >= 4
          && ring[0][0] === ring[ring.length - 1][0]
          && ring[0][1] === ring[ring.length - 1][1]
        ))
      ))
    ))).toBe(true)
    expect(generatedDirectory.settlements.every(place => (
      place.postalCodes.every(code => /^\d{3}$/.test(code)) &&
      new Set(place.postalCodes).size === place.postalCodes.length &&
      (place.postalCode === null || (
        place.postalCodes.length === 1 && place.postalCodes[0] === place.postalCode
      ))
    ))).toBe(true)
    expect(OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE).toBe(
      generatedDirectory.generatedAt.slice(0, 10),
    )
    expect(generatedDirectory.postalLocalities['310']).toMatchObject({
      name: 'Borgarnes',
      correctedAt: '2025-01-17Z',
    })
  })

  it.each(['Hella', 'Hella 850', '850 Hella'])(
    'returns the official Hella settlement first for %s',
    query => {
      const [place] = searchOfficialPlaces(query)

      expect(place).toMatchObject({
        id: 'official:hagstofa:1120',
        source: 'official',
        sourceId: 'hagstofa:1120',
        name: 'Hella',
        formattedAddress: '850 Hella',
        placeType: 'settlement',
        postalCode: '850',
        postalLocality: 'Hella',
        lat: 63.836027,
        lon: -20.394082,
      })
      expect(place).not.toHaveProperty('placeId')
      expect(place).not.toHaveProperty('googlePlaceId')
      expect(place).not.toHaveProperty('routingRef')
    },
  )

  it('keeps an address-like prefix below an exact official locality score', () => {
    const [hella] = searchOfficialPlaces('Hella 8')

    expect(hella?.sourceId).toBe('hagstofa:1120')
    expect(officialPlaceSearchScore('Hella 8', hella?.sourceId)).toBe(115)
    expect(officialPlaceSearchScore('Hella', hella?.sourceId)).toBe(180)
  })

  it('normalizes Icelandic place spelling and recognizes official aliases', () => {
    const [akureyri] = searchOfficialPlaces('akureyri')

    expect(akureyri).toMatchObject({
      source: 'official',
      name: 'Akureyri',
    })
    expect(officialPlaceHasAlias(akureyri.sourceId, 'Akureyri')).toBe(true)
    expect(officialPlaceHasAlias(akureyri.sourceId, 'Hella')).toBe(false)
  })

  it('resolves the exact representative point to its unique official settlement boundary', () => {
    const hella = generatedDirectory.settlements.find(place => place.name === 'Hella')

    expect(hella).toBeDefined()
    const boundary = findOfficialSettlementContainingPoint(hella!.lat, hella!.lon)
    expect(boundary).toMatchObject({ id: hella!.id, name: 'Hella' })
    expect(officialSettlementGeometryContains(boundary!.geometry, hella!.lat, hella!.lon)).toBe(true)
    expect(findOfficialSettlementContainingPoint(Number.NaN, hella!.lon)).toBeNull()
  })

  it('honours polygon holes and includes a point exactly on the outer boundary', () => {
    const geometry: OfficialSettlementGeometry = {
      type: 'MultiPolygon',
      coordinates: [[
        [
          [-20.1, 63.9],
          [-19.9, 63.9],
          [-19.9, 64.1],
          [-20.1, 64.1],
          [-20.1, 63.9],
        ],
        [
          [-20.02, 63.98],
          [-19.98, 63.98],
          [-19.98, 64.02],
          [-20.02, 64.02],
          [-20.02, 63.98],
        ],
      ]],
    }

    expect(officialSettlementGeometryContains(geometry, 63.95, -20)).toBe(true)
    expect(officialSettlementGeometryContains(geometry, 64, -20)).toBe(false)
    expect(officialSettlementGeometryContains(geometry, 63.9, -20)).toBe(true)
    expect(officialSettlementGeometryContains(geometry, 64.2, -20)).toBe(false)
  })

  it('keeps postal localities as context instead of false settlement aliases', () => {
    const egilsstadir = searchOfficialPlaces('Egilsstaðir')
    const fellabaer = searchOfficialPlaces('Fellabær')[0]

    expect(egilsstadir[0]).toMatchObject({ name: 'Egilsstaðir', placeType: 'settlement' })
    expect(egilsstadir.some(place => place.name === 'Fellabær')).toBe(false)
    expect(officialPlaceHasAlias(fellabaer?.sourceId, 'Egilsstaðir')).toBe(false)
    expect(searchOfficialPlaces('Reykjavík')[0]).toMatchObject({ name: 'Reykjavík' })
    expect(searchOfficialPlaces('Hellissandur')[0]).toMatchObject({ name: 'Hellissandur' })
    expect(searchOfficialPlaces('Hellissandur').some(place => place.name === 'Rif')).toBe(false)
  })

  it('searches legitimate town postcodes without claiming one arbitrary display postcode', () => {
    const reykjavik = generatedDirectory.settlements.find(place => place.name === 'Reykjavík')
    const kopavogur = generatedDirectory.settlements.find(place => place.name === 'Kópavogur')

    expect(reykjavik).toMatchObject({ postalCode: null, postalLocality: null })
    expect(reykjavik?.postalCodes).toEqual(expect.arrayContaining(['101', '105', '161']))
    expect(reykjavik?.postalCodes).not.toEqual(expect.arrayContaining(['170', '200', '201']))
    expect(searchOfficialPlaces('101 Reykjavík')[0]).toMatchObject({
      name: 'Reykjavík',
      formattedAddress: 'Reykjavík',
    })

    expect(kopavogur).toMatchObject({ postalCode: null, postalLocality: null })
    expect(kopavogur?.postalCodes).toEqual(expect.arrayContaining(['200', '201', '203']))
    expect(kopavogur?.postalCodes).not.toEqual(expect.arrayContaining(['108', '210']))
    expect(searchOfficialPlaces('200 Kópavogur')[0]).toMatchObject({ name: 'Kópavogur' })
  })

  it('does not turn neighbouring postcode boundary overlaps into exact locality aliases', () => {
    expect(searchOfficialPlaces('Reykjavík 200').some(place => place.name === 'Reykjavík')).toBe(false)
    expect(searchOfficialPlaces('Reykjavík 170').some(place => place.name === 'Reykjavík')).toBe(false)
    expect(searchOfficialPlaces('Kópavogur 108').some(place => place.name === 'Kópavogur')).toBe(false)
    expect(searchOfficialPlaces('Kópavogur 210').some(place => place.name === 'Kópavogur')).toBe(false)
  })

  it('keeps legitimately identical place names as separate stable results', () => {
    const reykholt = searchOfficialPlaces('Reykholt')
    const exactReykholt = reykholt.filter(place => place.name === 'Reykholt')

    expect(exactReykholt).toHaveLength(2)
    expect(new Set(exactReykholt.map(place => place.sourceId)).size).toBe(2)
    expect(new Set(exactReykholt.map(place => place.postalCode))).toEqual(new Set(['320', '806']))
  })

  it('provides the official postcode locality independently of municipality', () => {
    expect(getOfficialPostalLocality('611')).toEqual({
      name: 'Grímsey',
      classification: 'Þéttbýli',
    })
    expect(getOfficialPostalLocality('850')?.name).toBe('Hella')
    expect(getOfficialPostalLocality('999')).toBeNull()
    expect(getOfficialPostalLocality('61')).toBeNull()
  })
})
