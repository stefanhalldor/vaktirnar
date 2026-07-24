import { describe, expect, it } from 'vitest'
import {
  buildDriveStationAssessment,
  projectDriveMiniMapPoints,
  vedurstofanRowsToComparisonRows,
} from '@/components/weather/DriveJourneyPanel'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
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

  it('converts Veðurstofan rows for the canonical comparison table without met.no links', () => {
    const rows = vedurstofanRowsToComparisonRows(station().forecastRows)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      timeIso: '2026-07-24T18:00:00.000Z',
      temperature: { value: 12 },
      wind: { value: 8 },
      precipitation: { value: 0 },
      windDirectionText: 'N',
    })
    expect(rows[0]).not.toHaveProperty('yrnoUrl')
    expect(rows[0]).not.toHaveProperty('metnoUrl')
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
