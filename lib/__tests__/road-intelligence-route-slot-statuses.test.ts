import { describe, it, expect } from 'vitest'
import {
  worstWindDisplayStatusFromCounts,
  countVedurstofanForecastStatusesAt,
  buildProviderSlotAssessments,
  buildProviderSlotStatusOverrides,
  resolveVedurstofanOnlySlotStatus,
  conservativelyCombineWindDisplayStatuses,
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

  it('counts a station with no route fraction as no data', () => {
    const departureMs = Date.parse('2026-07-22T18:00:00.000Z')
    const layer = makeVedurstofanLayer([{
      ftimeIso: new Date(departureMs).toISOString(),
      windSpeedMs: 3,
      precipitationMmPerHour: 0,
      temperatureC: 8,
      windDirectionText: null,
      weatherText: null,
    }], null)

    expect(countVedurstofanForecastStatusesAt(
      layer,
      60,
      DEFAULT_SLOT_THRESHOLDS,
      departureMs,
    )).toEqual({ no_data: 1 })
  })

  it('counts a forecast outside the accepted ETA horizon as no data', () => {
    const departureMs = Date.parse('2026-07-22T18:00:00.000Z')
    const layer = makeVedurstofanLayer([{
      ftimeIso: '2026-07-22T20:30:00.001Z',
      windSpeedMs: 3,
      precipitationMmPerHour: 0,
      temperatureC: 8,
      windDirectionText: null,
      weatherText: null,
    }], 0)

    expect(countVedurstofanForecastStatusesAt(
      layer,
      60,
      DEFAULT_SLOT_THRESHOLDS,
      departureMs,
    )).toEqual({ no_data: 1 })
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
  routeFraction: number | null = 0,
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

function makeVedurstofanPoint(
  stationId: string,
  routeFraction: number | null,
  ftimeIso: string,
  windSpeedMs: number | null,
  overrides: Partial<VedurstofanTravelLayer['points'][number]> = {},
): VedurstofanTravelLayer['points'][number] {
  const base = makeVedurstofanLayer([{
    ftimeIso,
    windSpeedMs,
    precipitationMmPerHour: 0,
    temperatureC: 8,
    windDirectionText: null,
    weatherText: null,
  }], routeFraction).points[0]
  return {
    ...base,
    routePointId: `v_${stationId}`,
    stationId,
    stationName: stationId,
    routeFraction,
    ...overrides,
  }
}

describe('buildProviderSlotStatusOverrides', () => {
  it('returns explicit no-data slots when Veðurstofan data is unavailable', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: makeCandidates(3),
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      routeDistanceKm: 40,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })
    expect(result).toEqual(['no_data', 'no_data', 'no_data'])
  })

  it('does not use current Vegagerðin data as a future forecast', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: makeCandidates(2),
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      routeDistanceKm: 40,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { haettulegt: 1 },
      vegagerdinStationCount: 1,
    })
    expect(result).toEqual(['no_data', 'no_data'])
  })

  it('never turns current Vegagerðin observations into future-slot overrides', () => {
    const candidates = makeCandidates(4)
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      routeDistanceKm: 40,
      vedurstofanLayer: undefined,
      vedurstofanStationCount: 0,
      vegagerdinStatusCounts: { othaegilegt: 1, 'innan-marka': 2 },
      vegagerdinStationCount: 3,
    })
    expect(result).toEqual(['no_data', 'no_data', 'no_data', 'no_data'])
  })

  it('returns array with same length as candidates', () => {
    const candidates = makeCandidates(10)
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 90,
      routeDistanceKm: 40,
      vedurstofanLayer: makeVedurstofanLayer([]),
      vedurstofanStationCount: 1,
    })
    expect(result).toHaveLength(10)
    expect(result).toEqual(Array(10).fill('no_data'))
  })

  it('accepts empty candidate list', () => {
    const result = buildProviderSlotStatusOverrides({
      candidates: [],
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      routeDistanceKm: 40,
      vedurstofanLayer: makeVedurstofanLayer([]),
      vedurstofanStationCount: 1,
    })
    expect(result).toEqual([])
  })

  it('does not let dangerous Vegagerðin current values color future calm Veðurstofan slots', () => {
    const candidates = makeCandidates(3)
    const nowIso = candidates[0].departureIso
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
          forecastRows: candidates.map(candidate => ({
            ftimeIso: new Date(Date.parse(candidate.departureIso) + 30 * 60_000).toISOString(),
            windSpeedMs: 2,
            precipitationMmPerHour: 0,
            temperatureC: 10,
            windDirectionText: null,
            weatherText: null,
          })),
        },
      ],
    }
    const result = buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 60,
      routeDistanceKm: 40,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: { haettulegt: 1 },
      vegagerdinStationCount: 1,
    })
    expect(result).not.toBeNull()
    expect(result).toEqual(['innan-marka', 'innan-marka', 'innan-marka'])
  })

  it('does not mark a long route safe when matched stations leave 50 km coverage gaps', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([{
      ftimeIso: candidates[0].departureIso,
      windSpeedMs: 2,
      precipitationMmPerHour: 0,
      temperatureC: 10,
      windDirectionText: null,
      weatherText: null,
    }], 0.5)

    expect(buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 400,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })).toEqual(['no_data'])
  })

  it('preserves a known warning in the compatibility status while typed coverage stays separate', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([{
      ftimeIso: candidates[0].departureIso,
      windSpeedMs: DEFAULT_SLOT_THRESHOLDS.cautionWindMs,
      precipitationMmPerHour: 0,
      temperatureC: 10,
      windDirectionText: null,
      weatherText: null,
    }], 0.5)

    expect(buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 400,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })).toEqual(['othaegilegt'])
  })

  it('does not let raw partial provider health veto complete calm coverage', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([{
      ftimeIso: candidates[0].departureIso,
      windSpeedMs: 2,
      precipitationMmPerHour: 0,
      temperatureC: 10,
      windDirectionText: null,
      weatherText: null,
    }])
    layer.status = 'partial'
    layer.mappedPointCount = 2
    layer.unavailablePointCount = 1

    expect(buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 40,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })).toEqual(['innan-marka'])
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
      routeDistanceKm: 40,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })

    expect(result).toEqual(['innan-marka', 'haettulegt'])
  })

  it('uses calm Veðurstofan data even when the MET/Yr route candidate is dangerous', () => {
    const candidates = makeCandidates(1)
    candidates[0] = { ...candidates[0], status: 'rautt' }
    const layer = makeVedurstofanLayer([{
      ftimeIso: candidates[0].departureIso,
      windSpeedMs: 2,
      precipitationMmPerHour: 0,
      temperatureC: 10,
      windDirectionText: null,
      weatherText: null,
    }])

    expect(buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 40,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })).toEqual(['innan-marka'])
  })

  it('raises a route slot when a station reaches discomfort', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([{
      ftimeIso: candidates[0].departureIso,
      windSpeedMs: DEFAULT_SLOT_THRESHOLDS.cautionWindMs,
      precipitationMmPerHour: 0,
      temperatureC: 10,
      windDirectionText: null,
      weatherText: null,
    }])

    expect(buildProviderSlotStatusOverrides({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 40,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
      vegagerdinStatusCounts: {},
      vegagerdinStationCount: 0,
    })).toEqual(['othaegilegt'])
  })
})

describe('buildProviderSlotAssessments', () => {
  it('accepts full usable coverage when a redundant matched station is unavailable', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.status = 'partial'
    layer.mappedPointCount = 3
    layer.availablePointCount = 2
    layer.unavailablePointCount = 1
    layer.points = [
      makeVedurstofanPoint('west', 0.25, ftimeIso, 2),
      makeVedurstofanPoint('east', 0.75, ftimeIso, 3),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 200,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 3,
    })

    expect(layer.status).toBe('partial')
    expect(assessment.coverage).toMatchObject({
      status: 'complete',
      reason: null,
      usableStationCount: 2,
      measurementGaps: [],
    })
    expect(assessment.hazardStatus).toBe('innan-marka')
    expect(assessment.displayStatus).toBe('innan-marka')
  })

  it('fails closed when many clustered points leave a real route gap', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [0.1, 0.15, 0.2].map((fraction, index) =>
      makeVedurstofanPoint(`cluster-${index}`, fraction, ftimeIso, 2),
    )

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 400,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 3,
    })

    expect(assessment.coverage.status).toBe('incomplete')
    expect(assessment.coverage.reason).toBe('spatial_gap')
    expect(assessment.coverage.measurementGaps.length).toBeGreaterThan(0)
    expect(assessment.coverage.totalGapKm).toBeGreaterThan(0)
    expect(assessment.hazardStatus).toBe('innan-marka')
    expect(assessment.displayStatus).toBe('no_data')
  })

  it('excludes invalid fractions, unmatched rows, null wind, and non-finite wind', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const outsideToleranceIso = new Date(Date.parse(ftimeIso) + 90 * 60_000 + 1).toISOString()
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [
      makeVedurstofanPoint('usable', 0.5, ftimeIso, 2),
      makeVedurstofanPoint('too-late', 0.5, outsideToleranceIso, 20),
      makeVedurstofanPoint('null-wind', 0.5, ftimeIso, null),
      makeVedurstofanPoint('nan-wind', 0.5, ftimeIso, Number.NaN),
      makeVedurstofanPoint('invalid-fraction', 1.2, ftimeIso, 20),
      makeVedurstofanPoint('negative-fraction', -0.1, ftimeIso, 20),
      makeVedurstofanPoint('null-fraction', null, ftimeIso, 20),
      makeVedurstofanPoint('nan-fraction', Number.NaN, ftimeIso, 20),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 100,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 5,
    })

    expect(assessment.coverage).toMatchObject({
      status: 'complete',
      usableStationCount: 1,
      usableRouteFractions: [0.5],
      invalidRouteFractionCount: 4,
      temporalGapCount: 1,
      missingWindCount: 2,
    })
    expect(assessment.hazardStatus).toBe('innan-marka')
    expect(assessment.displayStatus).toBe('innan-marka')
  })

  it('reports a temporal gap when positioned stations cover the route but ETA rows do not', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const outsideToleranceIso = new Date(Date.parse(ftimeIso) + 90 * 60_000 + 1).toISOString()
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [
      makeVedurstofanPoint('start', 0, ftimeIso, 2),
      makeVedurstofanPoint('middle-missing', 0.5, outsideToleranceIso, 2),
      makeVedurstofanPoint('end', 1, ftimeIso, 2),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 200,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 3,
    })

    expect(assessment.coverage.status).toBe('incomplete')
    expect(assessment.coverage.reason).toBe('temporal_gap')
    expect(assessment.coverage.temporalGapCount).toBe(1)
    expect(assessment.displayStatus).toBe('no_data')
  })

  it('keeps the exact 50 km coverage boundary and fails just beyond it', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [
      makeVedurstofanPoint('start', 0, ftimeIso, 2),
      makeVedurstofanPoint('end', 1, ftimeIso, 2),
    ]
    const params = {
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 2,
    }

    expect(buildProviderSlotAssessments({
      ...params,
      routeDistanceKm: 100,
    })[0].coverage.status).toBe('complete')
    expect(buildProviderSlotAssessments({
      ...params,
      routeDistanceKm: 100.1,
    })[0].coverage.status).toBe('incomplete')

    const widerGap = buildProviderSlotAssessments({
      ...params,
      routeDistanceKm: 120,
    })[0]
    expect(widerGap.coverage.status).toBe('incomplete')
    expect(widerGap.coverage.measurementGaps).toHaveLength(1)
    expect(widerGap.coverage.measurementGaps[0].distanceKm).toBeCloseTo(20)
  })

  it('preserves a known warning separately while incomplete coverage stays fail-closed', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([
      {
        ftimeIso: candidates[0].departureIso,
        windSpeedMs: DEFAULT_SLOT_THRESHOLDS.cautionWindMs,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      },
    ], 0.5)

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 400,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })

    expect(assessment.hazardStatus).toBe('othaegilegt')
    expect(assessment.coverage.status).toBe('incomplete')
    expect(assessment.coverage.reason).toBe('spatial_gap')
    expect(assessment.displayStatus).toBe('othaegilegt')
  })

  it('reports missing wind when positioned coverage fails only because wind is absent', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [
      makeVedurstofanPoint('start', 0, ftimeIso, 2),
      makeVedurstofanPoint('middle-missing-wind', 0.5, ftimeIso, null),
      makeVedurstofanPoint('end', 1, ftimeIso, 2),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 200,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 3,
    })

    expect(assessment.coverage.status).toBe('incomplete')
    expect(assessment.coverage.reason).toBe('missing_wind')
    expect(assessment.coverage.missingWindCount).toBe(1)
    expect(assessment.displayStatus).toBe('no_data')
  })

  it('assesses shorter and longer routes independently from their own distance', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [0, 0.5, 1].map((fraction, index) =>
      makeVedurstofanPoint(`shared-${index}`, fraction, ftimeIso, 2),
    )
    const sharedParams = {
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 3,
    }

    const shortRoute = buildProviderSlotAssessments({
      ...sharedParams,
      routeDistanceKm: 200,
    })[0]
    const longRoute = buildProviderSlotAssessments({
      ...sharedParams,
      routeDistanceKm: 400,
    })[0]

    expect(shortRoute.coverage.status).toBe('complete')
    expect(shortRoute.displayStatus).toBe('innan-marka')
    expect(longRoute.coverage.status).toBe('incomplete')
    expect(longRoute.displayStatus).toBe('no_data')
  })

  it('assesses shared route evidence independently from each route duration and ETA', () => {
    const candidates = makeCandidates(1)
    const departureMs = Date.parse(candidates[0].departureIso)
    const shortEtaIso = new Date(departureMs + 30 * 60_000).toISOString()
    const longEtaIso = new Date(departureMs + 90 * 60_000).toISOString()
    const point = makeVedurstofanPoint('shared-duration', 0.5, shortEtaIso, 2)
    point.forecastRows = [
      {
        ...point.forecastRows[0],
        ftimeIso: shortEtaIso,
        windSpeedMs: 2,
      },
      {
        ...point.forecastRows[0],
        ftimeIso: longEtaIso,
        windSpeedMs: DEFAULT_SLOT_THRESHOLDS.redWindMs,
      },
    ]
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [point]
    const sharedParams = {
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDistanceKm: 100,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    }

    const shortRoute = buildProviderSlotAssessments({
      ...sharedParams,
      routeDurationMinutes: 60,
    })[0]
    const longRoute = buildProviderSlotAssessments({
      ...sharedParams,
      routeDurationMinutes: 180,
    })[0]

    expect(shortRoute.coverage.status).toBe('complete')
    expect(shortRoute.hazardStatus).toBe('innan-marka')
    expect(longRoute.coverage.status).toBe('complete')
    expect(longRoute.hazardStatus).toBe('haettulegt')
  })

  it('treats a stale usable forecast as evidence and ignores a co-located bad duplicate', () => {
    const candidates = makeCandidates(1)
    const ftimeIso = candidates[0].departureIso
    const layer = makeVedurstofanLayer([], 0)
    layer.status = 'partial'
    layer.points = [
      makeVedurstofanPoint('same-station', 0.5, ftimeIso, 2, { status: 'stale' }),
      makeVedurstofanPoint('same-station', 0.5, ftimeIso, null),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 100,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 2,
    })

    expect(assessment.coverage.status).toBe('complete')
    expect(assessment.coverage.usableStationCount).toBe(1)
    expect(assessment.coverage.missingWindCount).toBe(1)
    expect(assessment.displayStatus).toBe('innan-marka')
  })

  it('accepts a forecast row exactly at the existing 90-minute ETA tolerance', () => {
    const candidates = makeCandidates(1)
    const atToleranceIso = new Date(
      Date.parse(candidates[0].departureIso) + 90 * 60_000,
    ).toISOString()
    const layer = makeVedurstofanLayer([], 0)
    layer.points = [
      makeVedurstofanPoint('boundary', 0.5, atToleranceIso, 2),
    ]

    const [assessment] = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 100,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })

    expect(assessment.coverage.status).toBe('complete')
    expect(assessment.coverage.usableStationCount).toBe(1)
    expect(assessment.displayStatus).toBe('innan-marka')
  })

  it('preserves the negative 90-minute ETA boundary and rejects one millisecond beyond it', () => {
    const candidates = makeCandidates(1)
    const departureMs = Date.parse(candidates[0].departureIso)
    const atToleranceIso = new Date(departureMs - 90 * 60_000).toISOString()
    const outsideToleranceIso = new Date(departureMs - 90 * 60_000 - 1).toISOString()
    const sharedParams = {
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 100,
      vedurstofanStationCount: 1,
    }

    const accepted = buildProviderSlotAssessments({
      ...sharedParams,
      vedurstofanLayer: makeVedurstofanLayer([{
        ftimeIso: atToleranceIso,
        windSpeedMs: 2,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      }], 0.5),
    })[0]
    const rejected = buildProviderSlotAssessments({
      ...sharedParams,
      vedurstofanLayer: makeVedurstofanLayer([{
        ftimeIso: outsideToleranceIso,
        windSpeedMs: 2,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      }], 0.5),
    })[0]

    expect(accepted.coverage.status).toBe('complete')
    expect(rejected.coverage).toMatchObject({
      status: 'incomplete',
      reason: 'temporal_gap',
    })
  })

  it('fails closed for invalid route distance and invalid route timing', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([
      {
        ftimeIso: candidates[0].departureIso,
        windSpeedMs: 2,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      },
    ], 0.5)
    const sharedParams = {
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    }

    const invalidRoute = buildProviderSlotAssessments({
      ...sharedParams,
      routeDurationMinutes: 0,
      routeDistanceKm: Number.NaN,
    })[0]
    const invalidTiming = buildProviderSlotAssessments({
      ...sharedParams,
      routeDurationMinutes: Number.NaN,
      routeDistanceKm: 100,
    })[0]

    expect(invalidRoute.coverage).toMatchObject({
      status: 'incomplete',
      reason: 'invalid_route',
    })
    expect(invalidRoute.displayStatus).toBe('no_data')
    expect(invalidTiming.coverage).toMatchObject({
      status: 'incomplete',
      reason: 'invalid_timing',
    })
    expect(invalidTiming.displayStatus).toBe('no_data')
  })
})

describe('resolveVedurstofanOnlySlotStatus', () => {
  it('marks calm partial coverage as no data instead of safe', () => {
    expect(resolveVedurstofanOnlySlotStatus(
      { 'innan-marka': 1 },
      2,
    )).toBe('no_data')
  })

  it('keeps a known warning when another station is missing', () => {
    expect(resolveVedurstofanOnlySlotStatus(
      { othaegilegt: 1, no_data: 1 },
      2,
    )).toBe('othaegilegt')
  })

  it('marks complete calm Veðurstofan coverage as within limits', () => {
    expect(resolveVedurstofanOnlySlotStatus(
      { 'innan-marka': 2 },
      2,
    )).toBe('innan-marka')
  })
})

describe('conservativelyCombineWindDisplayStatuses', () => {
  it('never downgrades known route risk', () => {
    expect(conservativelyCombineWindDisplayStatuses('haettulegt', 'innan-marka'))
      .toBe('haettulegt')
    expect(conservativelyCombineWindDisplayStatuses('othaegilegt', 'nalgast-othaegindi'))
      .toBe('othaegilegt')
  })

  it('does not claim a missing route assessment is safe from one calm station', () => {
    expect(conservativelyCombineWindDisplayStatuses('no_data', 'innan-marka'))
      .toBe('no_data')
  })

  it('surfaces a known station warning on an otherwise unassessed route', () => {
    expect(conservativelyCombineWindDisplayStatuses('no_data', 'nalgast-othaegindi'))
      .toBe('nalgast-othaegindi')
  })
})

describe('windDisplayStatusToTravelStatus', () => {
  it('maps display statuses to coarse travel statuses', () => {
    expect(windDisplayStatusToTravelStatus('innan-marka')).toBe('graent')
    expect(windDisplayStatusToTravelStatus('nalgast-othaegindi')).toBe('gult')
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
        toIso: candidates[0].departureIso,
        status: 'graent',
        reasonCode: undefined,
      },
      {
        fromIso: candidates[1].departureIso,
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

  it('never recommends missing-data windows', () => {
    expect(buildProviderBestWindow(
      makeCandidates(2),
      ['no_data', 'no_wind_data'],
    )).toBeUndefined()
  })

  it('never recommends an incomplete typed slot even when it has a known warning', () => {
    const candidates = makeCandidates(1)
    const layer = makeVedurstofanLayer([
      {
        ftimeIso: candidates[0].departureIso,
        windSpeedMs: DEFAULT_SLOT_THRESHOLDS.cautionWindMs,
        precipitationMmPerHour: 0,
        temperatureC: 8,
        windDirectionText: null,
        weatherText: null,
      },
    ], 0.5)
    const assessments = buildProviderSlotAssessments({
      candidates,
      thresholds: DEFAULT_SLOT_THRESHOLDS,
      routeDurationMinutes: 0,
      routeDistanceKm: 400,
      vedurstofanLayer: layer,
      vedurstofanStationCount: 1,
    })

    expect(assessments[0].hazardStatus).toBe('othaegilegt')
    expect(assessments[0].coverage.status).toBe('incomplete')
    expect(buildProviderBestWindow(candidates, assessments)).toBeUndefined()
  })
})
