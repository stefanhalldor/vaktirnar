/**
 * Tests for lib/weather/trip.ts
 *
 * Verifies that the WeatherTrip model can correctly represent:
 * - current single-drive (Einn akstur) as a one-leg trip
 * - multi-stop trip with multiple legs
 * - campsite stop with stay window
 *
 * These are structural tests — they verify the model compiles, has the right
 * shape, and can represent the intended scenarios without behavior regressions.
 */

import { describe, it, expect } from 'vitest'
import type {
  WeatherTrip, TripStop, TripLeg, TripPlace, TripStayWindow,
  WeatherTripMode, TripStopKind,
} from '../weather/trip'

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlace(name: string, lat?: number, lon?: number): TripPlace {
  return { name, lat, lon }
}

function makeStop(id: string, kind: TripStopKind, place: TripPlace, stayWindow?: TripStayWindow): TripStop {
  return { id, kind, place, stayWindow }
}

function makeLeg(id: string, fromStopId: string, toStopId: string, departureIso?: string, arrivalIso?: string): TripLeg {
  return { id, fromStopId, toStopId, departureIso, arrivalIso }
}

// ── Single-drive mapping ───────────────────────────────────────────────────

describe('WeatherTrip — single drive (Einn akstur)', () => {
  it('can represent a single A→B drive as a one-leg WeatherTrip', () => {
    const origin = makeStop('s0', 'origin', makePlace('Reykjavík', 64.135, -21.895))
    const destination = makeStop('s1', 'destination', makePlace('Akureyri', 65.683, -18.085))
    const leg = makeLeg('l0', 's0', 's1', '2026-07-12T08:00:00.000Z', '2026-07-12T13:00:00.000Z')

    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [origin, destination],
      legs: [leg],
    }

    expect(trip.mode).toBe('single_drive')
    expect(trip.stops).toHaveLength(2)
    expect(trip.legs).toHaveLength(1)
    expect(trip.legs[0].fromStopId).toBe('s0')
    expect(trip.legs[0].toStopId).toBe('s1')
    expect(trip.stops[0].kind).toBe('origin')
    expect(trip.stops[1].kind).toBe('destination')
  })

  it('leg carries departure and arrival ISO from the single-drive result', () => {
    const leg = makeLeg('l0', 's0', 's1', '2026-07-12T08:00:00.000Z', '2026-07-12T13:00:00.000Z')
    expect(leg.departureIso).toBe('2026-07-12T08:00:00.000Z')
    expect(leg.arrivalIso).toBe('2026-07-12T13:00:00.000Z')
  })

  it('single-drive trip has one leg, matching N-1 legs for 2 stops', () => {
    const stops = [
      makeStop('s0', 'origin', makePlace('A')),
      makeStop('s1', 'destination', makePlace('B')),
    ]
    const legs = [makeLeg('l0', stops[0].id, stops[1].id)]
    const trip: WeatherTrip = { mode: 'single_drive', stops, legs }
    expect(trip.legs).toHaveLength(trip.stops.length - 1)
  })

  it('optional fields (id, routeOptionId, thresholdOverrides) can be absent', () => {
    const trip: WeatherTrip = {
      mode: 'single_drive',
      stops: [makeStop('s0', 'origin', makePlace('A')), makeStop('s1', 'destination', makePlace('B'))],
      legs: [makeLeg('l0', 's0', 's1')],
    }
    expect(trip.id).toBeUndefined()
    expect(trip.legs[0].routeOptionId).toBeUndefined()
    expect(trip.thresholdOverrides).toBeUndefined()
  })
})

// ── Multi-stop trip ────────────────────────────────────────────────────────

describe('WeatherTrip — multi-stop trip (Ferðalag)', () => {
  it('can represent a three-stop trip with two legs', () => {
    const stops = [
      makeStop('s0', 'origin', makePlace('Reykjavík')),
      makeStop('s1', 'destination', makePlace('Vík')),
      makeStop('s2', 'home', makePlace('Reykjavík')),
    ]
    const legs = [
      makeLeg('l0', 's0', 's1'),
      makeLeg('l1', 's1', 's2'),
    ]
    const trip: WeatherTrip = { mode: 'multi_stop_trip', stops, legs }

    expect(trip.mode).toBe('multi_stop_trip')
    expect(trip.stops).toHaveLength(3)
    expect(trip.legs).toHaveLength(2)
    expect(trip.legs[0].fromStopId).toBe('s0')
    expect(trip.legs[0].toStopId).toBe('s1')
    expect(trip.legs[1].fromStopId).toBe('s1')
    expect(trip.legs[1].toStopId).toBe('s2')
  })

  it('legs link to adjacent stops via fromStopId/toStopId', () => {
    const stops = [
      makeStop('origin', 'origin', makePlace('A')),
      makeStop('mid', 'waypoint', makePlace('B')),
      makeStop('dest', 'destination', makePlace('C')),
    ]
    const legs = [
      makeLeg('l0', 'origin', 'mid'),
      makeLeg('l1', 'mid', 'dest'),
    ]
    const trip: WeatherTrip = { mode: 'multi_stop_trip', stops, legs }

    // Every leg's fromStopId/toStopId resolves to a known stop
    const stopIds = new Set(trip.stops.map(s => s.id))
    for (const leg of trip.legs) {
      expect(stopIds.has(leg.fromStopId)).toBe(true)
      expect(stopIds.has(leg.toStopId)).toBe(true)
    }
  })
})

// ── Campsite stop with stay window ─────────────────────────────────────────

describe('WeatherTrip — campsite stop', () => {
  it('campsite stop has kind=campsite and a stayWindow', () => {
    const campsite = makeStop('c0', 'campsite', makePlace('Þórsmörk', 63.68, -19.52), {
      arriveAfterIso: '2026-07-13T18:00:00.000Z',
      departBeforeIso: '2026-07-14T10:00:00.000Z',
    })

    expect(campsite.kind).toBe('campsite')
    expect(campsite.stayWindow).toBeDefined()
    expect(campsite.stayWindow!.arriveAfterIso).toBe('2026-07-13T18:00:00.000Z')
    expect(campsite.stayWindow!.departBeforeIso).toBe('2026-07-14T10:00:00.000Z')
  })

  it('campsite trip: origin→campsite→home with two legs', () => {
    const stops = [
      makeStop('s0', 'origin', makePlace('Reykjavík')),
      makeStop('s1', 'campsite', makePlace('Þórsmörk'), {
        arriveAfterIso: '2026-07-13T18:00:00.000Z',
        departBeforeIso: '2026-07-14T10:00:00.000Z',
      }),
      makeStop('s2', 'home', makePlace('Reykjavík')),
    ]
    const legs = [makeLeg('l0', 's0', 's1'), makeLeg('l1', 's1', 's2')]
    const trip: WeatherTrip = { mode: 'multi_stop_trip', stops, legs }

    const campStop = trip.stops.find(s => s.kind === 'campsite')
    expect(campStop).toBeDefined()
    expect(campStop!.stayWindow).toBeDefined()
    // Driving legs use shared assessRouteLeg — no weather logic duplicated here
    expect(trip.legs).toHaveLength(2)
  })

  it('destination stop does not require a stayWindow', () => {
    const stop = makeStop('s0', 'destination', makePlace('Akureyri'))
    expect(stop.stayWindow).toBeUndefined()
  })
})

// ── Mode enumeration ───────────────────────────────────────────────────────

describe('WeatherTripMode', () => {
  it('single_drive and multi_stop_trip are the two modes', () => {
    const modes: WeatherTripMode[] = ['single_drive', 'multi_stop_trip']
    expect(modes).toHaveLength(2)
  })
})

// ── TripPlace ──────────────────────────────────────────────────────────────

describe('TripPlace', () => {
  it('can be constructed with name only (unresolved)', () => {
    const place: TripPlace = { name: 'Ísafjörður' }
    expect(place.lat).toBeUndefined()
    expect(place.lon).toBeUndefined()
    expect(place.placeId).toBeUndefined()
  })

  it('can carry resolved coordinates and placeId', () => {
    const place: TripPlace = {
      name: 'Ísafjörður',
      lat: 66.075,
      lon: -23.125,
      placeId: 'ChIJisafj0rd123',
    }
    expect(place.lat).toBe(66.075)
    expect(place.placeId).toBe('ChIJisafj0rd123')
  })
})
