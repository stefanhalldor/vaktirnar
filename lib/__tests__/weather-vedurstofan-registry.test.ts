/**
 * Static tests for the auto-generated Veðurstofan station registry.
 *
 * These tests verify that the generated registry file is structurally correct
 * and that key known stations parse as expected. They do NOT make network
 * requests. Re-run scripts/generate-vedurstofan-registry.mjs to update the
 * registry and then re-run these tests.
 */
import { describe, it, expect } from 'vitest'
import {
  VEDURSTOFAN_STATIONS_REGISTRY,
  VEDURSTOFAN_STATION_REGISTRY_COUNT,
} from '@/lib/weather/providers/vedurstofanStationsRegistry'

describe('vedurstofanStationsRegistry — total count', () => {
  it('exports exactly 280 stations', () => {
    expect(VEDURSTOFAN_STATIONS_REGISTRY.length).toBe(280)
  })

  it('VEDURSTOFAN_STATION_REGISTRY_COUNT matches array length', () => {
    expect(VEDURSTOFAN_STATION_REGISTRY_COUNT).toBe(VEDURSTOFAN_STATIONS_REGISTRY.length)
  })
})

describe('vedurstofanStationsRegistry — Hellisheiði (known station)', () => {
  const hellh = VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.slug === 'hellh')

  it('exists in registry', () => {
    expect(hellh).toBeDefined()
  })

  it('has correct station ID 31392', () => {
    expect(hellh?.stationId).toBe('31392')
  })

  it('has correct WMO number 4836', () => {
    expect(hellh?.wmoNumber).toBe('4836')
  })

  it('has owner Vegagerðin', () => {
    expect(hellh?.owner).toBe('Vegagerðin')
  })

  it('has correct latitude ~64.0188', () => {
    expect(hellh?.lat).toBeCloseTo(64.0188, 2)
  })

  it('has negative longitude (WGS84, Iceland west of Greenwich)', () => {
    expect(hellh?.lon).toBeDefined()
    expect(hellh!.lon!).toBeLessThan(0)
    expect(hellh?.lon).toBeCloseTo(-21.3424, 2)
  })

  it('has elevation 360', () => {
    expect(hellh?.elevationM).toBe(360)
  })

  it('has forecastAreaName Suðurland', () => {
    expect(hellh?.forecastAreaName).toBe('Suðurland')
  })

  it('has sourceUrl pointing to official station page', () => {
    expect(hellh?.sourceUrl).toBe('https://www.vedur.is/vedur/stodvar/?s=hellh')
  })

  it('has mappingStatus source-provided', () => {
    expect(hellh?.mappingStatus).toBe('source-provided')
  })
})

describe('vedurstofanStationsRegistry — longitude convention', () => {
  it('all stations with coordinates have negative longitude', () => {
    const withCoords = VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.lon !== null)
    const allNegative = withCoords.every(s => s.lon! < 0)
    expect(allNegative).toBe(true)
  })

  it('all stations with coordinates have latitude between 63 and 67', () => {
    const withCoords = VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.lat !== null)
    const allInRange = withCoords.every(s => s.lat! >= 63 && s.lat! <= 67.5)
    expect(allInRange).toBe(true)
  })
})

describe('vedurstofanStationsRegistry — data completeness', () => {
  it('every station has a slug', () => {
    expect(VEDURSTOFAN_STATIONS_REGISTRY.every(s => s.slug.length > 0)).toBe(true)
  })

  it('every station has a sourceUrl', () => {
    const allHaveUrl = VEDURSTOFAN_STATIONS_REGISTRY.every(
      s => s.sourceUrl.startsWith('https://www.vedur.is/vedur/stodvar/?s='),
    )
    expect(allHaveUrl).toBe(true)
  })

  it('every station has a mappingStatus', () => {
    const valid = ['source-provided', 'missing-coordinates', 'verified', 'needs-verification', 'ambiguous']
    const allValid = VEDURSTOFAN_STATIONS_REGISTRY.every(s => valid.includes(s.mappingStatus))
    expect(allValid).toBe(true)
  })

  it('all 280 stations have coordinates (source-provided from official pages)', () => {
    const withCoords = VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.lat !== null && s.lon !== null)
    expect(withCoords.length).toBe(280)
  })

  it('all 280 stations have a stationId', () => {
    const withId = VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.stationId !== null)
    expect(withId.length).toBe(280)
  })

  it('station IDs are unique', () => {
    const ids = VEDURSTOFAN_STATIONS_REGISTRY.map(s => s.stationId).filter(Boolean)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})

describe('vedurstofanStationsRegistry — known curated stations present', () => {
  // These 5 stations were in the previous 29-station curated seed.
  // Verifies the registry is a superset of the old curated list.
  const knownIds = ['31392', '990', '6300', '5544', '4323']

  it.each(knownIds)('stationId %s is present', (id) => {
    const found = VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === id)
    expect(found).toBeDefined()
  })
})
