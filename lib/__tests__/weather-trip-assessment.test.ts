/**
 * Behavioral tests for lib/weather/trip-assessment.ts
 *
 * Verifies that assessWeatherTrip():
 * - aggregates leg statuses correctly (worst wins)
 * - returns worstLegId pointing to the worst leg
 * - preserves leg order and IDs in legAssessments
 * - emits validation issues for malformed trip structures
 * - fails closed (never silently returns graent) for missing/invalid inputs
 * - delegates actual threshold logic to assessRouteLeg(), not reimplementing it
 */

import { describe, it, expect } from 'vitest'
import { assessWeatherTrip, type TripLegAssessmentInput } from '../weather/trip-assessment'
import type { WeatherTrip, TripStop, TripLeg } from '../weather/trip'
import type { RouteLegInput } from '../weather/assessment'
import type { HourPoint, TravelPointForecast, ResolvedTravelThresholds } from '../weather/types'

// ── Fixtures ───────────────────────────────────────────────────────────────

const THRESHOLDS: ResolvedTravelThresholds = {
  cautionWindMs: 15,
  redWindMs: 20,
  redGustMs: 30,
  cautionPrecipMmPerHour: 5,
}

function makeHour(time: string, windMs: number, gustMs: number, precipMm: number): HourPoint {
  return {
    time,
    airTemperatureC: 10,
    windSpeedMs: windMs,
    windGustMs: gustMs,
    windFromDegrees: 180,
    precipitationMmPerHour: precipMm,
    symbolCode: 'clearsky_day',
  }
}

function makeForecastPoint(routeIndex: number, distanceM: number, windMs: number, gustMs: number, precipMm: number): TravelPointForecast {
  const hours = [makeHour('2026-07-12T08:00:00.000Z', windMs, gustMs, precipMm)]
  return { hours, lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0, routeIndex, distanceFromOriginM: distanceM }
}

/** Build a RouteLegInput that assessRouteLeg() will assess as graent */
function makeGreenLegInput(): RouteLegInput {
  return {
    departureIso: '2026-07-12T08:00:00.000Z',
    arrivalIso: '2026-07-12T13:00:00.000Z',
    pointForecasts: [makeForecastPoint(0, 0, 5, 8, 0), makeForecastPoint(1, 100_000, 5, 8, 0)],
    thresholds: THRESHOLDS,
    totalDistanceM: 200_000,
    trailerKind: 'none',
  }
}

/** Build a RouteLegInput that assessRouteLeg() will assess as gult */
function makeYellowLegInput(): RouteLegInput {
  return {
    departureIso: '2026-07-12T08:00:00.000Z',
    arrivalIso: '2026-07-12T13:00:00.000Z',
    // cautionWindMs = 15, so wind=15 triggers gult
    pointForecasts: [makeForecastPoint(0, 0, 15, 20, 0), makeForecastPoint(1, 100_000, 15, 20, 0)],
    thresholds: THRESHOLDS,
    totalDistanceM: 200_000,
    trailerKind: 'none',
  }
}

/** Build a RouteLegInput that assessRouteLeg() will assess as rautt */
function makeRedLegInput(): RouteLegInput {
  return {
    departureIso: '2026-07-12T08:00:00.000Z',
    arrivalIso: '2026-07-12T13:00:00.000Z',
    // redWindMs = 20, so wind=20 triggers rautt
    pointForecasts: [makeForecastPoint(0, 0, 20, 30, 0), makeForecastPoint(1, 100_000, 20, 30, 0)],
    thresholds: THRESHOLDS,
    totalDistanceM: 200_000,
    trailerKind: 'none',
  }
}

function makeStop(id: string): TripStop {
  return { id, kind: 'waypoint', place: { name: id } }
}

function makeLeg(id: string, fromStopId: string, toStopId: string): TripLeg {
  return { id, fromStopId, toStopId }
}

function makeSingleDriveTrip(legId = 'l0'): WeatherTrip {
  return {
    mode: 'single_drive',
    stops: [makeStop('s0'), makeStop('s1')],
    legs: [makeLeg(legId, 's0', 's1')],
  }
}

function makeTripLegInput(legId: string, input: RouteLegInput): TripLegAssessmentInput {
  return { legId, assessmentInput: input }
}

// ── Single-drive status aggregation ───────────────────────────────────────

describe('assessWeatherTrip — single-drive status', () => {
  it('returns graent for a single green leg', () => {
    const result = assessWeatherTrip({
      trip: makeSingleDriveTrip(),
      legInputs: [makeTripLegInput('l0', makeGreenLegInput())],
    })
    expect(result.status).toBe('graent')
    expect(result.validationIssues).toBeUndefined()
  })

  it('returns gult for a single yellow leg', () => {
    const result = assessWeatherTrip({
      trip: makeSingleDriveTrip(),
      legInputs: [makeTripLegInput('l0', makeYellowLegInput())],
    })
    expect(result.status).toBe('gult')
    expect(result.validationIssues).toBeUndefined()
  })

  it('returns rautt for a single red leg', () => {
    const result = assessWeatherTrip({
      trip: makeSingleDriveTrip(),
      legInputs: [makeTripLegInput('l0', makeRedLegInput())],
    })
    expect(result.status).toBe('rautt')
    expect(result.validationIssues).toBeUndefined()
  })
})

// ── Multi-stop status aggregation ─────────────────────────────────────────

describe('assessWeatherTrip — multi-stop status aggregation', () => {
  it('green + yellow legs → gult, worstLegId is the yellow leg', () => {
    const trip: WeatherTrip = {
      mode: 'multi_stop_trip',
      stops: [makeStop('s0'), makeStop('s1'), makeStop('s2')],
      legs: [makeLeg('l0', 's0', 's1'), makeLeg('l1', 's1', 's2')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [
        makeTripLegInput('l0', makeGreenLegInput()),
        makeTripLegInput('l1', makeYellowLegInput()),
      ],
    })
    expect(result.status).toBe('gult')
    expect(result.worstLegId).toBe('l1')
  })

  it('yellow + red legs → rautt, worstLegId is the red leg', () => {
    const trip: WeatherTrip = {
      mode: 'multi_stop_trip',
      stops: [makeStop('s0'), makeStop('s1'), makeStop('s2')],
      legs: [makeLeg('l0', 's0', 's1'), makeLeg('l1', 's1', 's2')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [
        makeTripLegInput('l0', makeYellowLegInput()),
        makeTripLegInput('l1', makeRedLegInput()),
      ],
    })
    expect(result.status).toBe('rautt')
    expect(result.worstLegId).toBe('l1')
  })

  it('preserves leg assessment order and leg IDs', () => {
    const trip: WeatherTrip = {
      mode: 'multi_stop_trip',
      stops: [makeStop('alpha'), makeStop('beta'), makeStop('gamma')],
      legs: [makeLeg('leg-a', 'alpha', 'beta'), makeLeg('leg-b', 'beta', 'gamma')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [
        makeTripLegInput('leg-a', makeGreenLegInput()),
        makeTripLegInput('leg-b', makeYellowLegInput()),
      ],
    })
    expect(result.legAssessments).toHaveLength(2)
    expect(result.legAssessments[0].legId).toBe('leg-a')
    expect(result.legAssessments[1].legId).toBe('leg-b')
    expect(result.legAssessments[0].assessment.status).toBe('graent')
    expect(result.legAssessments[1].assessment.status).toBe('gult')
  })
})

// ── Validation issues ──────────────────────────────────────────────────────

describe('assessWeatherTrip — validation issues', () => {
  it('missing leg input produces missing_leg_assessment_input and non-graent status', () => {
    const result = assessWeatherTrip({
      trip: makeSingleDriveTrip(),
      legInputs: [], // no input for l0
    })
    expect(result.validationIssues).toContain('missing_leg_assessment_input')
    expect(result.status).not.toBe('graent')
  })

  it('leg with unknown fromStopId produces unknown_from_stop and non-green status', () => {
    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [makeStop('s0'), makeStop('s1')],
      legs: [makeLeg('l0', 'MISSING', 's1')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [makeTripLegInput('l0', makeGreenLegInput())],
    })
    expect(result.validationIssues).toContain('unknown_from_stop')
    expect(result.status).toBe('gult')
  })

  it('leg with unknown toStopId produces unknown_to_stop and non-green status', () => {
    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [makeStop('s0'), makeStop('s1')],
      legs: [makeLeg('l0', 's0', 'MISSING')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [makeTripLegInput('l0', makeGreenLegInput())],
    })
    expect(result.validationIssues).toContain('unknown_to_stop')
    expect(result.status).toBe('gult')
  })

  it('single_drive trip with two legs produces single_drive_requires_one_leg and non-green status', () => {
    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [makeStop('s0'), makeStop('s1'), makeStop('s2')],
      legs: [makeLeg('l0', 's0', 's1'), makeLeg('l1', 's1', 's2')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [
        makeTripLegInput('l0', makeGreenLegInput()),
        makeTripLegInput('l1', makeGreenLegInput()),
      ],
    })
    expect(result.validationIssues).toContain('single_drive_requires_one_leg')
    expect(result.status).toBe('gult')
  })

  it('non_adjacent_leg with green legs produces non_adjacent_leg and gult status', () => {
    const trip: WeatherTrip = {
      mode: 'multi_stop_trip',
      stops: [makeStop('s0'), makeStop('s1'), makeStop('s2')],
      // l0 goes s0->s1 but l1 starts at s2 instead of s1 — disconnected
      legs: [makeLeg('l0', 's0', 's1'), makeLeg('l1', 's2', 's2')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [
        makeTripLegInput('l0', makeGreenLegInput()),
        makeTripLegInput('l1', makeGreenLegInput()),
      ],
    })
    expect(result.validationIssues).toContain('non_adjacent_leg')
    expect(result.status).toBe('gult')
  })

  it('structural issue + red leg stays rautt, not downgraded to gult', () => {
    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [makeStop('s0'), makeStop('s1')],
      legs: [makeLeg('l0', 'MISSING', 's1')],
    }
    const result = assessWeatherTrip({
      trip,
      legInputs: [makeTripLegInput('l0', makeRedLegInput())],
    })
    expect(result.validationIssues).toContain('unknown_from_stop')
    expect(result.status).toBe('rautt')
  })
})

// ── Delegation to assessRouteLeg ───────────────────────────────────────────

describe('assessWeatherTrip — delegates to assessRouteLeg', () => {
  it('legAssessments carry assessRouteLeg output shape (status, worstMetric, pointStatuses)', () => {
    const result = assessWeatherTrip({
      trip: makeSingleDriveTrip(),
      legInputs: [makeTripLegInput('l0', makeYellowLegInput())],
    })
    const leg = result.legAssessments[0]
    // assessRouteLeg returns a TravelCandidate (RouteLegAssessment)
    expect(leg.assessment).toHaveProperty('status')
    expect(leg.assessment).toHaveProperty('departureIso')
    expect(leg.assessment).toHaveProperty('arrivalIso')
    // Status must match what assessRouteLeg computes — not reimplemented here
    expect(leg.assessment.status).toBe('gult')
    // worstWind is set when assessRouteLeg finds a caution/red wind metric
    expect(leg.assessment.worstWind).toBeDefined()
  })
})
