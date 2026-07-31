import { describe, expect, it } from 'vitest'
import { buildVedurstofanPointDisplayModel } from '@/components/weather/VedurstofanPointCard'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'

type Station = VedurstofanTravelLayer['points'][number]

function station(): Station {
  return {
    routePointId: 'vedurstofan_test',
    stationId: 'test',
    stationName: 'Prófunarstöð',
    distanceM: 100,
    distanceFromOriginM: 10_000,
    routeFraction: 0.5,
    status: 'ok',
    atimeIso: '2026-07-31T12:00:00.000Z',
    fetchedAtIso: '2026-07-31T12:05:00.000Z',
    expiresAtIso: '2026-07-31T13:05:00.000Z',
    lat: 64.5,
    lon: -20.5,
    sourceUrl: null,
    forecastRows: [
      {
        ftimeIso: '2026-07-31T15:00:00.000Z',
        windSpeedMs: 4,
        precipitationMmPerHour: 0,
        temperatureC: 10,
        windDirectionText: 'N',
        weatherText: null,
      },
      {
        ftimeIso: '2026-07-31T18:00:00.000Z',
        windSpeedMs: 25,
        precipitationMmPerHour: 0,
        temperatureC: 9,
        windDirectionText: 'N',
        weatherText: null,
      },
      {
        ftimeIso: '2026-07-31T21:00:00.000Z',
        windSpeedMs: 5,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: 'N',
        weatherText: null,
      },
    ],
  }
}

describe('buildVedurstofanPointDisplayModel', () => {
  it('does not fall back to a strong forecast row when ETA is unknown', () => {
    const model = buildVedurstofanPointDisplayModel(station(), null, null)

    expect(model.prev).toBeNull()
    expect(model.used).toBeNull()
    expect(model.next).toBeNull()
  })

  it('does not show forecast rows outside the accepted ETA horizon', () => {
    const model = buildVedurstofanPointDisplayModel(
      station(),
      '2026-07-31T22:30:00.001Z',
      null,
    )

    expect(model.prev).toBeNull()
    expect(model.used).toBeNull()
    expect(model.next).toBeNull()
  })

  it('returns previous, used and next rows for an in-horizon ETA', () => {
    const model = buildVedurstofanPointDisplayModel(
      station(),
      '2026-07-31T18:00:00.000Z',
      null,
    )

    expect(model.prev?.ftimeIso).toBe('2026-07-31T15:00:00.000Z')
    expect(model.used?.ftimeIso).toBe('2026-07-31T18:00:00.000Z')
    expect(model.next?.ftimeIso).toBe('2026-07-31T21:00:00.000Z')
  })
})
