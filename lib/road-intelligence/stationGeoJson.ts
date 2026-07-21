import type { VegagerdinCurrentMeasurement } from '@/lib/weather/providers/vegagerdinCurrentTypes'

export type StationGeoJsonProperties = {
  stationId: string
  stationName: string
  meanWindMs: number | null
  gustMs: number | null
  windDirectionDeg: number | null
  airTemperatureC: number | null
  measuredAtIso: string
}

export type StationGeoJsonFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: StationGeoJsonProperties
}

export type StationGeoJsonCollection = {
  type: 'FeatureCollection'
  features: StationGeoJsonFeature[]
}

/**
 * Converts Vegagerðin current measurements to a GeoJSON FeatureCollection.
 * Stations with missing or non-finite lat/lon are excluded.
 * Uses gustLast10MinMs as the primary wind signal (gustMs property),
 * falling back to meanWindMs. Both can be null when the station
 * does not report wind data.
 */
export function stationsToGeoJson(
  measurements: VegagerdinCurrentMeasurement[],
): StationGeoJsonCollection {
  return {
    type: 'FeatureCollection',
    features: measurements
      .filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lon))
      .map(m => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [m.lon, m.lat],
        },
        properties: {
          stationId: m.stationId,
          stationName: m.stationName,
          meanWindMs: m.meanWindMs,
          gustMs: m.gustLast10MinMs,
          windDirectionDeg: m.windDirectionDeg,
          airTemperatureC: m.airTemperatureC,
          measuredAtIso: m.measuredAtIso,
        },
      })),
  }
}
