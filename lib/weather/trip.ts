/**
 * Generic weather trip model.
 *
 * This module defines the shared data model used by both:
 * - Einn akstur (single drive): one origin, one destination, one TripLeg
 * - Ferðalag (multi-stop trip): multiple stops, multiple TripLegs, optional stay windows
 *
 * ## Architecture notes
 *
 * Stops are the itinerary source of truth. Legs are the calculated/selected
 * journeys between adjacent stops.
 *
 * Current Ferðaveðrið maps to:
 *   origin stop + destination stop + one TripLeg between them.
 *
 * Camping/campsite stays are TripStops with kind='campsite' and a stayWindow.
 * They are a use case inside Ferðalag, not a separate route-weather engine.
 *
 * ## What this module does NOT contain
 *
 * - Route/weather assessment logic (see lib/weather/assessment.ts)
 * - API handlers, React components, or Supabase calls
 * - Persistence or saved-trip schema (separate, later phase)
 */

import type { TravelThresholdOverrides } from './types'

// ── Place ─────────────────────────────────────────────────────────────────

/** A named place in an itinerary. Coordinates are optional until resolved. */
export type TripPlace = {
  name: string
  formattedAddress?: string
  lat?: number
  lon?: number
  placeId?: string
}

// ── Trip mode ─────────────────────────────────────────────────────────────

export type WeatherTripMode = 'single_drive' | 'multi_stop_trip'

// ── Stops ─────────────────────────────────────────────────────────────────

export type TripStopKind = 'origin' | 'destination' | 'campsite' | 'home' | 'waypoint'

/**
 * A stay window at a stop (e.g. campsite overnight, multi-night stay).
 * Used by TripStop.stayWindow for camping/lodging stops.
 * Stay-window weather assessment is a Phase 0.6+ concern.
 */
export type TripStayWindow = {
  /** Earliest arrival at this stop (ISO). */
  arriveAfterIso: string
  /** Must depart by this time (ISO). */
  departBeforeIso: string
}

/** A named place in the itinerary, with optional stay window for lodging/camping stops. */
export type TripStop = {
  id: string
  kind: TripStopKind
  place: TripPlace
  /** Present for campsite, home, and multi-night stays. */
  stayWindow?: TripStayWindow
}

// ── Legs ──────────────────────────────────────────────────────────────────

/**
 * A driving segment between two stops in an itinerary.
 * The leg definition records which stops and which route option were chosen.
 * The actual weather assessment is done via assessRouteLeg() in assessment.ts.
 */
export type TripLeg = {
  id: string
  /** ID of the departure TripStop. */
  fromStopId: string
  /** ID of the arrival TripStop. */
  toStopId: string
  /** Selected route option ID from the route provider (e.g. Google Routes). */
  routeOptionId?: string
  /** Planned departure time (ISO). */
  departureIso?: string
  /** Estimated arrival time (ISO), derived from route duration. */
  arrivalIso?: string
}

// ── Trip ──────────────────────────────────────────────────────────────────

/**
 * A weather trip: one or more driving legs between ordered stops.
 *
 * Single drive (Einn akstur):
 *   stops = [origin, destination], legs = [one TripLeg]
 *
 * Multi-stop trip (Ferðalag):
 *   stops = [origin, stop1, stop2, ..., home], legs = [N-1 TripLegs]
 */
export type WeatherTrip = {
  id?: string
  mode: WeatherTripMode
  /** Ordered itinerary stops. First stop is the origin. */
  stops: TripStop[]
  /** Driving legs between adjacent stops. */
  legs: TripLeg[]
  /** Optional per-trip threshold overrides (e.g. custom wind limits). */
  thresholdOverrides?: TravelThresholdOverrides
}
