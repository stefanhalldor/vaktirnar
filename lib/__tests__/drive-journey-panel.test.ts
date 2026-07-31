import { describe, expect, it } from 'vitest'
import {
  buildDriveStationAssessment,
  projectDriveMiniMapPoints,
  selectAssessmentEndpointForecastRows,
} from '@/components/weather/DriveJourneyPanel'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type { ForecastDrawerRow, RouteWeatherPoint } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'

type Station = VedurstofanTravelLayer['points'][number]

function station(overrides: Partial<Station> = {}): Station {
  return {
    routePointId: 'vedurstofan_1',
    stationId: '1',
    stationName: 'Kjalarnes',
    distanceM: 100,
    distanceFromOriginM: 50_000,
    routeFraction: 0.5,
    status: 'ok',
    atimeIso: '2026-07-24T12:00:00.000Z',
    fetchedAtIso: '2026-07-24T12:05:00.000Z',
    expiresAtIso: '2026-07-24T13:05:00.000Z',
    lat: 64.2,
    lon: -21.7,
    sourceUrl: null,
    forecastRows: [
      {
        ftimeIso: '2026-07-24T18:00:00.000Z',
        windSpeedMs: 8,
        precipitationMmPerHour: 0,
        temperatureC: 12,
        windDirectionText: 'N',
        weatherText: null,
      },
      {
        ftimeIso: '2026-07-24T21:00:00.000Z',
        windSpeedMs: 14,
        precipitationMmPerHour: 1,
        temperatureC: 10,
        windDirectionText: 'NA',
        weatherText: null,
      },
    ],
    ...overrides,
  }
}

function endpointForecastRow(windMs: number): ForecastDrawerRow {
  return {
    timeIso: '2026-07-24T18:00:00.000Z',
    status: 'graent',
    temperature: { value: 12, direction: 'none', tone: 'neutral' },
    wind: { value: windMs, direction: 'none', tone: 'neutral' },
    gust: { value: windMs, direction: 'none', tone: 'neutral', severity: 'none' },
    precipitation: { value: 0, direction: 'none', tone: 'neutral' },
    windDirectionText: 'N',
    weatherEmoji: null,
  }
}

function routeWeatherPoint(id: string, routeFraction: number, windMs: number): RouteWeatherPoint {
  return {
    id,
    routeIndex: Math.round(routeFraction * 100),
    totalRouteWeatherPoints: 3,
    lat: 64 + routeFraction,
    lon: -22 + routeFraction,
    forecastLat: 64 + routeFraction,
    forecastLon: -22 + routeFraction,
    distanceFromOriginM: Math.round(routeFraction * 100_000),
    routeFraction,
    googleMapsUrl: 'https://maps.example.test',
    metnoUrl: 'https://met.example.test',
    yrnoUrl: 'https://yr.example.test',
    forecastRows: [endpointForecastRow(windMs)],
  }
}

const PARTIAL_COVERAGE: RouteWeatherCoverage = {
  status: 'partial',
  start: {
    kind: 'official_road_anchor',
    label: 'Staðfestur vegpunktur',
    point: { lat: 64.1, lon: -21.9 },
    routeFraction: 0.1,
    distanceFromTripOriginM: 10_000,
    elapsedFromTripOriginS: 600,
  },
  end: {
    kind: 'official_road_anchor',
    label: 'Staðfestur vegpunktur',
    point: { lat: 64.9, lon: -21.1 },
    routeFraction: 0.9,
    distanceFromTripOriginM: 90_000,
    elapsedFromTripOriginS: 5_400,
  },
  coverageDistanceM: 80_000,
  coverageDurationS: 4_800,
  distanceConfidence: 'reference_route',
}

describe('DriveJourneyPanel Veðurstofan view model', () => {
  it('matches a station forecast to ETA along the route', () => {
    const assessment = buildDriveStationAssessment(
      station(),
      {
        departureIso: '2026-07-24T15:00:00.000Z',
        arrivalIso: '2026-07-24T23:00:00.000Z',
        status: 'graent',
      },
      480,
      resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 }),
    )

    expect(assessment.etaIso).toBe('2026-07-24T19:00:00.000Z')
    expect(assessment.row?.ftimeIso).toBe('2026-07-24T18:00:00.000Z')
    expect(assessment.row?.windSpeedMs).toBe(8)
    expect(assessment.status).toBe('innan-marka')
  })

  it('uses inclusive 10/15 m/s route marker thresholds', () => {
    const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })
    const candidate = {
      departureIso: '2026-07-24T18:00:00.000Z',
      arrivalIso: '2026-07-24T19:00:00.000Z',
      status: 'graent' as const,
    }
    const atThreshold = (windSpeedMs: number) => station({
      routeFraction: 0,
      forecastRows: [{
        ftimeIso: '2026-07-24T18:00:00.000Z',
        windSpeedMs,
        precipitationMmPerHour: 0,
        temperatureC: 12,
        windDirectionText: 'N',
        weatherText: null,
      }],
    })

    expect(buildDriveStationAssessment(atThreshold(10), candidate, 60, thresholds).status)
      .toBe('othaegilegt')
    expect(buildDriveStationAssessment(atThreshold(15), candidate, 60, thresholds).status)
      .toBe('haettulegt')
  })

  it('fails closed when a station has no route fraction', () => {
    const candidate = {
      departureIso: '2026-07-24T18:00:00.000Z',
      arrivalIso: '2026-07-24T19:00:00.000Z',
      status: 'graent' as const,
    }
    const assessment = buildDriveStationAssessment(
      station({
        routeFraction: null,
        forecastRows: [{
          ftimeIso: candidate.departureIso,
          windSpeedMs: 2,
          precipitationMmPerHour: 0,
          temperatureC: 12,
          windDirectionText: 'N',
          weatherText: null,
        }],
      }),
      candidate,
      60,
      resolveThresholds('none'),
    )

    expect(assessment.etaIso).toBeNull()
    expect(assessment.row).toBeNull()
    expect(assessment.status).toBe('no_data')
  })

  it('fails closed when the nearest forecast is outside the ETA horizon', () => {
    const candidate = {
      departureIso: '2026-07-24T15:00:00.000Z',
      arrivalIso: '2026-07-24T23:00:00.000Z',
      status: 'graent' as const,
    }
    const assessment = buildDriveStationAssessment(
      station({
        routeFraction: 0.5,
        forecastRows: [{
          ftimeIso: '2026-07-24T20:30:00.001Z',
          windSpeedMs: 2,
          precipitationMmPerHour: 0,
          temperatureC: 12,
          windDirectionText: 'N',
          weatherText: null,
        }],
      }),
      candidate,
      480,
      resolveThresholds('none'),
    )

    expect(assessment.etaIso).toBe('2026-07-24T19:00:00.000Z')
    expect(assessment.row).toBeNull()
    expect(assessment.status).toBe('no_data')
  })

  it('selects only deterministic forecasts at the attested assessment boundaries', () => {
    const rows = selectAssessmentEndpointForecastRows([
      routeWeatherPoint('interior-station', 0.5, 20),
      routeWeatherPoint('assessment-destination', 0.9, 8),
      routeWeatherPoint('assessment-origin', 0.1, 3),
    ], PARTIAL_COVERAGE)

    expect(rows?.originRows[0]?.wind.value).toBe(3)
    expect(rows?.destinationRows[0]?.wind.value).toBe(8)
  })

  it('fails closed instead of relabelling interior forecasts as route endpoints', () => {
    const rows = selectAssessmentEndpointForecastRows([
      routeWeatherPoint('near-origin', 0.11, 3),
      routeWeatherPoint('interior-station', 0.5, 20),
      routeWeatherPoint('assessment-destination', 0.9, 8),
    ], PARTIAL_COVERAGE)

    expect(rows).toBeNull()
  })

  it('fails closed when a boundary identity is duplicated', () => {
    const rows = selectAssessmentEndpointForecastRows([
      routeWeatherPoint('assessment-origin-a', 0.1, 3),
      routeWeatherPoint('assessment-origin-b', 0.1, 4),
      routeWeatherPoint('assessment-destination', 0.9, 8),
    ], PARTIAL_COVERAGE)

    expect(rows).toBeNull()
  })

  it('projects route coordinates into the mini-map bounds', () => {
    const points = projectDriveMiniMapPoints([
      { lat: 64, lon: -22 },
      { lat: 65, lon: -20 },
    ], 320, 150, 14)

    expect(points).toEqual([
      { x: 14, y: 136 },
      { x: 306, y: 14 },
    ])
  })
})
