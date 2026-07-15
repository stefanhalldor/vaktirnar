/**
 * Pure weather trip assessment composer.
 *
 * Assesses all driving legs of a WeatherTrip by calling assessRouteLeg()
 * for each leg, then aggregates the results into a single trip-level status.
 *
 * ## Architecture contract
 *
 * This composer depends on:
 * - lib/weather/assessment.ts  (assessRouteLeg — shared domain seam)
 * - lib/weather/trip.ts        (WeatherTrip model)
 *
 * It must remain pure — no Google Routes calls, no Met.no calls, no SQL,
 * no Supabase, no React, no env vars, no UI text.
 *
 * Callers are responsible for fetching route/forecast data and building
 * RouteLegInput objects before calling assessWeatherTrip().
 *
 * ## Validation
 *
 * Malformed trip structures (unknown stops, missing leg inputs, etc.) do not
 * silently become 'graent'. They contribute 'gult' to the aggregate status
 * and surface as WeatherTripValidationIssue entries.
 */

import type { WeatherStatus } from './types'
import { assessRouteLeg, type RouteLegInput, type RouteLegAssessment } from './assessment'
import type { WeatherTrip } from './trip'

// ── Input ──────────────────────────────────────────────────────────────────

/** Pairs a TripLeg ID with its already-prepared route/forecast assessment input. */
export type TripLegAssessmentInput = {
  legId: string
  assessmentInput: RouteLegInput
}

// ── Validation ─────────────────────────────────────────────────────────────

export type WeatherTripValidationIssue =
  /** Trip has no stops. */
  | 'no_stops'
  /** Trip has no legs. */
  | 'no_legs'
  /** A leg's fromStopId does not match any stop in the trip. */
  | 'unknown_from_stop'
  /** A leg's toStopId does not match any stop in the trip. */
  | 'unknown_to_stop'
  /** Consecutive legs are not chained (leg[i].toStopId !== leg[i+1].fromStopId). */
  | 'non_adjacent_leg'
  /** mode='single_drive' but the trip has more than one leg. */
  | 'single_drive_requires_one_leg'
  /** No TripLegAssessmentInput was provided for one or more legs. */
  | 'missing_leg_assessment_input'

// ── Output ─────────────────────────────────────────────────────────────────

export type WeatherTripAssessment = {
  /** Worst status across all legs. Fails closed (gult) on validation issues. */
  status: WeatherStatus
  /** One entry per assessed leg, in trip leg order. Missing-input legs are omitted. */
  legAssessments: Array<{
    legId: string
    assessment: RouteLegAssessment
  }>
  /** ID of the leg with the worst status. Undefined if no legs were assessed. */
  worstLegId?: string
  /** Structural issues found in the trip. Undefined when the trip is valid. */
  validationIssues?: WeatherTripValidationIssue[]
}

// ── Internal helpers ───────────────────────────────────────────────────────

function worstStatus(statuses: WeatherStatus[]): WeatherStatus {
  if (statuses.includes('rautt')) return 'rautt'
  if (statuses.includes('gult')) return 'gult'
  return 'graent'
}

const STATUS_ORDER: Record<WeatherStatus, number> = { rautt: 2, gult: 1, graent: 0 }

// ── Composer ───────────────────────────────────────────────────────────────

/**
 * Assesses all driving legs of a WeatherTrip and returns an aggregated result.
 *
 * For each leg in trip.legs, the corresponding TripLegAssessmentInput must be
 * supplied in legInputs. The assessment calls assessRouteLeg() for each valid
 * leg and aggregates status across all legs.
 *
 * Validation issues are collected rather than thrown. Missing or invalid leg
 * inputs contribute 'gult' to the aggregate (fail-closed, not silently green).
 */
export function assessWeatherTrip(input: {
  trip: WeatherTrip
  legInputs: TripLegAssessmentInput[]
}): WeatherTripAssessment {
  const { trip, legInputs } = input
  const validationIssues: WeatherTripValidationIssue[] = []

  // ── Structural validation ────────────────────────────────────────────────

  if (trip.stops.length === 0) validationIssues.push('no_stops')
  if (trip.legs.length === 0) validationIssues.push('no_legs')
  if (trip.mode === 'single_drive' && trip.legs.length > 1) {
    validationIssues.push('single_drive_requires_one_leg')
  }

  // Validate leg linkage against the stop set
  const stopIds = new Set(trip.stops.map(s => s.id))
  let hasUnknownFrom = false
  let hasUnknownTo = false

  for (const leg of trip.legs) {
    if (!stopIds.has(leg.fromStopId) && !hasUnknownFrom) {
      validationIssues.push('unknown_from_stop')
      hasUnknownFrom = true
    }
    if (!stopIds.has(leg.toStopId) && !hasUnknownTo) {
      validationIssues.push('unknown_to_stop')
      hasUnknownTo = true
    }
  }

  // Validate consecutive leg chaining
  let hasNonAdjacent = false
  for (let i = 0; i < trip.legs.length - 1; i++) {
    if (trip.legs[i].toStopId !== trip.legs[i + 1].fromStopId && !hasNonAdjacent) {
      validationIssues.push('non_adjacent_leg')
      hasNonAdjacent = true
    }
  }

  // ── Per-leg assessment ───────────────────────────────────────────────────

  const legAssessments: WeatherTripAssessment['legAssessments'] = []
  const allStatuses: WeatherStatus[] = []
  let hasMissingInput = false

  for (const leg of trip.legs) {
    const legInput = legInputs.find(li => li.legId === leg.id)
    if (!legInput) {
      if (!hasMissingInput) {
        validationIssues.push('missing_leg_assessment_input')
        hasMissingInput = true
      }
      // Fail closed: missing input contributes gult, not graent
      allStatuses.push('gult')
      continue
    }

    const assessment = assessRouteLeg(legInput.assessmentInput)
    legAssessments.push({ legId: leg.id, assessment })
    allStatuses.push(assessment.status)
  }

  // ── Status aggregation ───────────────────────────────────────────────────

  // If there are validation issues, inject a 'gult' floor so malformed trips
  // never silently aggregate to 'graent'. Red legs still win over this floor.
  const aggregateStatuses = validationIssues.length > 0
    ? [...allStatuses, 'gult' as WeatherStatus]
    : allStatuses

  // If there are no statuses to aggregate (e.g. no legs), fail closed to gult.
  const status = worstStatus(aggregateStatuses.length > 0 ? aggregateStatuses : ['gult'])

  // ── Worst leg ────────────────────────────────────────────────────────────

  const worstEntry = legAssessments.length > 0
    ? legAssessments.reduce((a, b) =>
        STATUS_ORDER[b.assessment.status] > STATUS_ORDER[a.assessment.status] ? b : a
      )
    : undefined

  return {
    status,
    legAssessments,
    worstLegId: worstEntry?.legId,
    validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
  }
}
