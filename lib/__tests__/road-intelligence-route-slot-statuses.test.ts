import { describe, it, expect } from 'vitest'
import {
  worstWindDisplayStatusFromCounts,
  countVedurstofanForecastStatusesAt,
  buildProviderSlotStatusOverrides,
  windDisplayStatusToTravelStatus,
  buildProviderSlotWindows,
  buildProviderBestWindow,
  DEFAULT_SLOT_THRESHOLDS,
} from '@/lib/road-intelligence/routeSlotStatuses'
import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type { TravelCandidate } from '@/lib/weather/types'

// ─── worstWindDisplayStatusFromCounts ───────────────────────────────────────

describe('worstWindDisplayStatusFromCounts', () => {
  it('returns null for empty counts', () => {
    expect(worstWindDisplayStatusFromCounts({})).toBeNull()
  })

  it('returns null when all counts are zero', () => {
    expect(worstWindDisplayStatusFromCounts({ 'innan-marka': 0, haettulegt: 0 })).toBeNull()
  })

  it('returns the only present status', () => {
    expect(worstWindDisplayStatusFromCounts({ 'innan-marka': 5 })).toBe('innan-marka')
  })

  it('haettulegt beats othaegilegt', () => {
    expect(worstWindDisplayStatusFromCounts({ haettulegt: 1, othaegilegt: 3 })).toBe('haettulegt')
  })

  it('othaegilegt beats nalgast-othaegindi', () => {
    expect(worstWindDisplayStatusFromCounts({ othaegilegt: 1, 'nalgast-othaegindi': 4 })).toBe('othaegilegt')
  })

  it('nalgast-haettumork beats othaegilegt', () => {
    expect(worstWindDisplayStatusFromCounts({ 'nalgast-haettumork': 1, othaegilegt: 2 })).toBe('nalgast-haettumork')
  })

  it('haettulegt beats everything when present', () => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {
      'innan-marka': 10,
      'nalgast-othaegindi': 3,
      othaegilegt: 2,
      'nalgast-haettumork': 1,
      haettulegt: 1,
    }
    expect(worstWindDisplayStatusFromCounts(counts)).toBe('haettulegt')
  })
})

// ─── countVedurstofanForecastStatusesAt ─────────────────────────────────────

describe('countVedurstofanForecastStatusesAt', () => {
  it('returns empty counts for undefined layer', () => {
    const result = countVedurstofanForecastStatusesAt(
      undefined,
      60,
      DEFAULT_SLOT_THRESHOLDS,
      Date.now(),
    )
    expect(result).toEqual({})
  })

  it('returns empty counts for layer with no points', () => {
    const layer: VedurstofanTravelLayer = {
      experimental: true,
      status: 'unavailable',
      mappedPointCount: 0,
      availablePointCount: 0,
      stalePointCount: 0,
      unavailablePointCount: 0,
      layerAtimeIso: null,
      lastWarmAttemptIso: null,
      points: [],
    }
    const result = countVedurstofanForecastStatusesAt(layer, 60, DEFAULT_SLOT_THRESHOLDS, Date.now())
    expect(result).toEqual({})
  })

  it('ignores points with missing lat/lon', () => {
    const layer: VedurstofanTravelLayer = {
      experimental: true,
      status: 'available',
      mappedPointCount: 1,
      availablePointCount: 1,
      stalePointCount: 0,
      unavailablePointCount: 0,
      layerAtimeIso: null,
      lastWarmAttemptIso: null,
      points: [
        {
          routePointId: 'v_x',
          stationId: 'x',
          stationName: 'X',
          distanceM: 0,
          distanceFromOriginM: null,
          routeFraction: 0.5,
          status: 'ok',
          atimeIso: null,
          fetchedAtIso: new Date().toISOString(),
          expiresAtIso: new Date().toISOString(),
          lat: null,
          lon: null,
          sourceUrl: null,
          forecastRows: [],
        },
      ],
    }
    const result = countVedurstofanForecastStatusesAt(layer, 60, DEFAULT_SLOT_THRESHOLDS, Date.now())
    expect(result).toEqual({})
  })

  it('classifies a calm station as innan-marka', () => {
    const nowIso = new Date().toISOString()
    const layer: VedurstofanTravelLayer = {
      experimental: true,
      status: 'available',
      mappedPointCount: 1,
      availablePointCount: 1,
      stalePointCount: 0,
      unavailablePointCount: 0,
      layerAtimeIso: nowIso,
      lastWarmAttemptIso: nowIso,
      points: [
        {
          routePointId: 'v_calm',
          stationId: 'calm',
          stationName: 'Calm',
          distanceM: 100,
          distanceFromOriginM: 5000,
          routeFraction: 0.5,
          status: 'ok',
          atimeIso: nowIso,
          fetchedAtIso: nowIso,
          expiresAtIso: nowIso,
          lat: 64.9,
          lon: -18.9,
          sourceUrl: null,
          forecastRows: [
            { ftimeIso: nowIso, windSpeedMs: 3, precipitationMmPerHour: 0, temperatureC: 10, windDirectionText: null, weatherText: null },
          ],
        },
      ],
    }
    const result = countVedurstofanForecastStatusesAt(layer, 60, DEFAULT_SLOT_THRESHOLDS, Date.now())
    expect(result['innan-marka']).toBeGreaterThanOrEqual(1)
  })

  it('uses the forecast row nearest to route ETA instead of the previous forecast row', () => {
    const layer = makeVedurstofanLayer([
      {
        ftimeIso: '2026-07-22T18:00:00.000Z',
        windSpeedMs: 20,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      },
      {
        ftimeIso: '2026-07-22T21:00:00.000Z',
        windSpeedMs: 5,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      },
    ], 0.5)

    // Departure 19:00, 3h route, station at 50% => ETA 20:30.
    // Old /ferdalagid chooses the nearest forecast row, so 21:00 wins over 18:00.
    const result = countVedurstofanForecastStatusesAt(
      layer,
      180,
      DEFAULT_SLOT_THRESHOLDS,
      Date.parse('2026-07-22T19:00:00.000Z'),
    )
    expect(result['innan-marka']).toBe(1)
    expect(result.othaegilegt ?? 0).toBe(0)
    expect(result.haettulegt ?? 0).toBe(0)
  })
})

// ─── buildProviderSlotStatusOverrides ───────────────────────────────────────

function makeCandidates(count: number, baseIso = '2026-07-21T12:00:00Z'): TravelCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    departureIso: new Date(Date.parse(baseIso) + i * 3600_000).toISOString(),
    arrivalIso: new Date(Date.parse(baseIso) + i * 3600_000 + 60 * 60_000).toISOString(),
    status: 'graent' as const,
    windMs: 3,
    precipitationMmPerHour: 0,
    points: [],
  }))
}

function makeVedurstofanLayer(
  forecastRows: VedurstofanTravelLayer['points'][number]['forecastRows'],
  routeFraction = 0,
): VedurstofanTravelLayer {
  return {
    experimental: true,
    status: 'available',
    mappedPointCount: 1,
    availablePointCount: 1,
    stalePointCount: 0,
    unavailablePointCount: 0,
    layerAtimeIso: null,
    lastWarmAttemptIso: null,
    points: [
      {
        routePointId: 'v_test',
        stationId: 'test',
        stationName: 'Test',
        distanceM: 100,
        distanceFromOriginM: 5000,
        routeFraction,
        status: 'ok',
        atimeIso: null,
        fetchedAtIso: '2026-07-21T12:00:00Z',
        expiresAtIso: '2026-07-21T18:00:00Z',
        lat: 64.9,
        lon: -18.9,
        sourceUrl: null,
        forecastRows,
      },
    ],
  }
}

describe('buildProviderSlotStatusOverrides', () => {
  it('returns null when no provider data', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: makeCandidates(3),
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })
    expect(result).toBeNull()
  })

  it('returns null when vegagerdin count is 0 and no vedurstofan', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: makeCandidates(2),
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { haettulegt: 1 }, // counts present but stationCount = 0
      vegagerdinStationCount: 0,
    })
    expect(result).toBeNull()
  })

  it('uses Vegagerðin worst only for the Now slot when no Veðurstofan forecast exists', () => {
    const candidates = makeCandidates(4)
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { othaegilegt: 1, 'innan-marka': 2 },
      vegagerdinStationCount: 3,
    })
    expect(result).not.toBeNull()
    expect(result).toEqual(['othaegilegt', 'innan-marka', 'innan-marka', 'innan-marka'])
  })

  it('returns array with same length as candidates', () => {
    const candidates = makeCandidates(10)
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 90,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { 'innan-marka': 1 },
      vegagerdinStationCount: 1,
    })
    expect(result).toHaveLength(10)
  })

  it('accepts empty candidate list', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: [],
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { haettulegt: 1 },
      vegagerdinStationCount: 1,
    })
    expect(result).toEqual([])
  })

  it('does not let dangerous Vegagerðin current values color future calm Veðurstofan slots', () => {
    const nowIso = new Date().toISOString()
    const layer: VedurstofanTravelLayer = {
      experimental: true,
      status: 'available',
      mappedPointCount: 1,
      availablePointCount: 1,
      stalePointCount: 0,
      unavailablePointCount: 0,
      layerAtimeIso: nowIso,
      lastWarmAttemptIso: nowIso,
      points: [
        {
          routePointId: 'v_calm',
          stationId: 'calm',
          stationName: 'Calm',
          distanceM: 100,
          distanceFromOriginM: 5000,
          routeFraction: 0.5,
          status: 'ok',
          atimeIso: nowIso,
          fetchedAtIso: nowIso,
          expiresAtIso: nowIso,
          lat: 64.9,
          lon: -18.9,
          sourceUrl: null,
          forecastRows: [
            { ftimeIso: nowIso, windSpeedMs: 2, precipitationMmPerHour: 0, temperatureC: 10, windDirectionText: null, weatherText: null },
          ],
        },
      ],
    }
    const candidates = makeCandidates(3)
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: { haettulegt: 1 },
      vegagerdinStationCount: 1,
    })
    expect(result).not.toBeNull()
    expect(result).toEqual(['haettulegt', 'innan-marka', 'innan-marka'])
  })

  it('lets Veðurstofan forecasts change status by departure slot', () => {
    const candidates = makeCandidates(2)
    const layer = makeVedurstofanLayer([
      {
        ftimeIso: candidates[0].departureIso,
        windSpeedMs: 3,
        precipitationMmPerHour: 0,
        temperatureC: 10,
        windDirectionText: null,
        weatherText: null,
      },
      {
        ftimeIso: candidates[1].departureIso,
        windSpeedMs: 20,
        precipitationMmPerHour: 0,
        temperatureC: 10,
        windDirectionText: null,
        weatherText: null,
      },
    ])

    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })

    expect(result).toEqual(['innan-marka', 'haettulegt'])
  })
})

describe('windDisplayStatusToTravelStatus', () => {
  it('maps display statuses to coarse travel statuses', () => {
    expect(windDisplayStatusToTravelStatus('innan-marka')).toBe('graent')
    expect(windDisplayStatusToTravelStatus('nalgast-othaegindi')).toBe('graent')
    expect(windDisplayStatusToTravelStatus('othaegilegt')).toBe('gult')
    expect(windDisplayStatusToTravelStatus('nalgast-haettumork')).toBe('gult')
    expect(windDisplayStatusToTravelStatus('haettulegt')).toBe('rautt')
    expect(windDisplayStatusToTravelStatus('no_data')).toBe('gult')
    expect(windDisplayStatusToTravelStatus('no_wind_data')).toBe('gult')
  })
})

describe('buildProviderSlotWindows', () => {
  it('groups adjacent provider slots by coarse travel status', () => {
    const candidates = makeCandidates(5)
    const windows = buildProviderSlotWindows(candidates, [
      'innan-marka',
      'nalgast-othaegindi',
      'othaegilegt',
      'nalgast-haettumork',
      'haettulegt',
    ])

    expect(windows).toEqual([
      {
        fromIso: candidates[0].departureIso,
        toIso: candidates[1].departureIso,
        status: 'graent',
        reasonCode: undefined,
      },
      {
        fromIso: candidates[2].departureIso,
        toIso: candidates[3].departureIso,
        status: 'gult',
        reasonCode: undefined,
      },
      {
        fromIso: candidates[4].departureIso,
        toIso: candidates[4].departureIso,
        status: 'rautt',
        reasonCode: undefined,
      },
    ])
  })

  it('uses only the shared candidate/override prefix', () => {
    const candidates = makeCandidates(3)
    const windows = buildProviderSlotWindows(candidates, ['othaegilegt', 'haettulegt'])

    expect(windows).toHaveLength(2)
    expect(windows[0].fromIso).toBe(candidates[0].departureIso)
    expect(windows[1].fromIso).toBe(candidates[1].departureIso)
  })

  it('returns empty windows when candidates or overrides are empty', () => {
    expect(buildProviderSlotWindows([], ['innan-marka'])).toEqual([])
    expect(buildProviderSlotWindows(makeCandidates(2), [])).toEqual([])
  })
})

describe('buildProviderBestWindow', () => {
  it('prefers the first green provider window', () => {
    const candidates = makeCandidates(4)
    const best = buildProviderBestWindow(candidates, [
      'othaegilegt',
      'innan-marka',
      'innan-marka',
      'haettulegt',
    ])

    expect(best).toEqual({
      fromIso: candidates[1].departureIso,
      toIso: candidates[2].departureIso,
      status: 'graent',
      reasonCode: undefined,
    })
  })

  it('falls back to the first yellow provider window when no green exists', () => {
    const candidates = makeCandidates(3)
    const best = buildProviderBestWindow(candidates, [
      'haettulegt',
      'nalgast-haettumork',
      'othaegilegt',
    ])

    expect(best).toEqual({
      fromIso: candidates[1].departureIso,
      toIso: candidates[2].departureIso,
      status: 'gult',
      reasonCode: undefined,
    })
  })

  it('returns undefined when all provider slots are red', () => {
    expect(buildProviderBestWindow(makeCandidates(2), ['haettulegt', 'haettulegt'])).toBeUndefined()
  })
})
