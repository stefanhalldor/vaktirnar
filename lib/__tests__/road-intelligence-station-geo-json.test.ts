import { describe, expect, it } from 'vitest'
import { stationsToGeoJson } from '@/lib/road-intelligence/stationGeoJson'
import type { VegagerdinCurrentMeasurement } from '@/lib/weather/providers/vegagerdinCurrentTypes'

function makeStation(
  overrides: Partial<VegagerdinCurrentMeasurement> = {},
): VegagerdinCurrentMeasurement {
  return {
    source: 'vegagerdin',
    stationId: 'TEST01',
    stationName: 'Teststaður',
    lat: 64.0,
    lon: -22.0,
    measuredAtIso: '2026-07-20T20:00:00Z',
    fetchedAtIso: '2026-07-20T20:01:00Z',
    meanWindMs: 5,
    gustLast10MinMs: 8,
    windDirectionDeg: 180,
    windDirectionText: 'S',
    airTemperatureC: 10,
    roadTemperatureC: 8,
    dataQuality: 'complete',
    ...overrides,
  }
}

describe('stationsToGeoJson', () => {
  it('converts stations to GeoJSON FeatureCollection', () => {
    const result = stationsToGeoJson([makeStation()])
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)
    expect(result.features[0].type).toBe('Feature')
    expect(result.features[0].geometry.type).toBe('Point')
  })

  it('places [lon, lat] in coordinates', () => {
    const result = stationsToGeoJson([makeStation({ lat: 64.5, lon: -21.9 })])
    expect(result.features[0].geometry.coordinates).toEqual([-21.9, 64.5])
  })

  it('maps gustLast10MinMs to gustMs property', () => {
    const result = stationsToGeoJson([makeStation({ gustLast10MinMs: 18 })])
    expect(result.features[0].properties.gustMs).toBe(18)
  })

  it('excludes stations with non-finite lat or lon', () => {
    const result = stationsToGeoJson([
      makeStation({ lat: NaN }),
      makeStation({ lon: Infinity }),
      makeStation({ lat: 65.0, lon: -19.0 }),
    ])
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.stationId).toBe('TEST01')
  })

  it('preserves null wind values', () => {
    const result = stationsToGeoJson([makeStation({ meanWindMs: null, gustLast10MinMs: null })])
    expect(result.features[0].properties.meanWindMs).toBeNull()
    expect(result.features[0].properties.gustMs).toBeNull()
  })

  it('returns empty FeatureCollection for empty input', () => {
    const result = stationsToGeoJson([])
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(0)
  })
})
