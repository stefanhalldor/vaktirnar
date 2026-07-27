import { describe, expect, it } from 'vitest'
import {
  buildRouteWindArrowField,
  normalizeBearingDeg,
  resolveWindTowardBearingDeg,
  windDirectionTextToFromBearingDeg,
  windTowardBearingDeg,
  type RouteWindArrowStation,
} from '@/lib/road-intelligence/routeWindArrowField'

const NOW_MS = Date.parse('2026-07-27T20:00:00Z')

function station(overrides: Partial<RouteWindArrowStation> = {}): RouteWindArrowStation {
  return {
    stationId: 'station-1',
    distanceFromOriginM: null,
    routeFraction: 0.5,
    measuredAtIso: '2026-07-27T19:55:00Z',
    statusWindMs: 8,
    windDirectionDeg: 0,
    windDirectionText: 'N',
    windDisplayStatus: 'innan-marka',
    ...overrides,
  }
}

describe('route wind-arrow field', () => {
  it('converts meteorological FROM bearings to clockwise TOWARD bearings', () => {
    expect(windTowardBearingDeg(0)).toBe(180)
    expect(windTowardBearingDeg(90)).toBe(270)
    expect(windTowardBearingDeg(180)).toBe(0)
    expect(windTowardBearingDeg(270)).toBe(90)
    expect(windTowardBearingDeg(450)).toBe(270)
    expect(windTowardBearingDeg(Number.NaN)).toBeNull()
    expect(normalizeBearingDeg(-90)).toBe(270)
  })

  it('prefers numeric degrees and falls back to Icelandic compass text', () => {
    expect(resolveWindTowardBearingDeg(45, 'S')).toBe(225)
    expect(resolveWindTowardBearingDeg(null, 'NNA')).toBe(202.5)
    expect(resolveWindTowardBearingDeg(null, 'V')).toBe(90)
    expect(windDirectionTextToFromBearingDeg(' 361 ')).toBe(1)
    expect(resolveWindTowardBearingDeg(null, 'unknown')).toBeNull()
  })

  it('places deterministic arrows on both sides of the road with collision-safe visual offsets', () => {
    const result = buildRouteWindArrowField({
      routePoints: [
        { lat: 64, lon: -20 },
        { lat: 65, lon: -20 },
      ],
      stations: [station()],
      nowMs: NOW_MS,
      baseSpacingM: 200_000,
      sideOffsetAtIconSizeOne: 24,
      maxStationInfluenceM: 100_000,
    })

    expect(result.features).toHaveLength(2)
    expect(result.features.map(feature => feature.properties.lane).sort()).toEqual(['left', 'right'])
    expect(result.features.every(feature => feature.properties.windTowardDeg === 180)).toBe(true)
    const left = result.features.find(feature => feature.properties.lane === 'left')
    const right = result.features.find(feature => feature.properties.lane === 'right')
    expect(left?.geometry.coordinates).toEqual(right?.geometry.coordinates)
    expect(left?.properties.iconOffset[0]).toBeCloseTo(24)
    expect(right?.properties.iconOffset[0]).toBeCloseTo(-24)
    expect(left?.properties.iconOffset[1]).toBeCloseTo(0)
    expect(right?.properties.iconOffset[1]).toBeCloseTo(0)
    expect(left?.properties.roadBearingDeg).toBeCloseTo(0)
    expect(new Set(result.features.map(feature => feature.id)).size).toBe(2)
  })

  it('keeps the rendered side offsets road-normal after MapLibre applies wind rotation', () => {
    const result = buildRouteWindArrowField({
      routePoints: [
        { lat: 64, lon: -20 },
        { lat: 65, lon: -20 },
      ],
      stations: [station({ windDirectionDeg: 45, windDirectionText: 'NA' })],
      nowMs: NOW_MS,
      baseSpacingM: 200_000,
      sideOffsetAtIconSizeOne: 24,
      maxStationInfluenceM: 100_000,
    })

    const renderedOffsetBearing = (feature: (typeof result.features)[number]) => {
      const radians = feature.properties.windTowardDeg * Math.PI / 180
      const [x, y] = feature.properties.iconOffset
      const renderedX = Math.cos(radians) * x - Math.sin(radians) * y
      const renderedY = Math.sin(radians) * x + Math.cos(radians) * y
      return normalizeBearingDeg(Math.atan2(renderedX, -renderedY) * 180 / Math.PI)
    }

    const left = result.features.find(feature => feature.properties.lane === 'left')
    const right = result.features.find(feature => feature.properties.lane === 'right')
    expect(left && renderedOffsetBearing(left)).toBeCloseTo(270)
    expect(right && renderedOffsetBearing(right)).toBeCloseTo(90)
    expect(Math.hypot(...(left?.properties.iconOffset ?? [0, 0]))).toBeCloseTo(24)
    expect(Math.hypot(...(right?.properties.iconOffset ?? [0, 0]))).toBeCloseTo(24)
  })

  it('leaves route gaps blank outside the nearest measurement influence', () => {
    const result = buildRouteWindArrowField({
      routePoints: [
        { lat: 64, lon: -20 },
        { lat: 65, lon: -20 },
      ],
      stations: [station({ distanceFromOriginM: 55_500, routeFraction: null })],
      nowMs: NOW_MS,
      baseSpacingM: 5_000,
      maxStationInfluenceM: 10_000,
    })

    expect(result.features.length).toBeGreaterThan(0)
    expect(result.features.every(feature =>
      Math.abs(feature.properties.distanceFromOriginM - 55_500) <= 10_000,
    )).toBe(true)
    expect(result.features.some(feature => feature.properties.distanceFromOriginM < 30_000)).toBe(false)
    expect(result.features.some(feature => feature.properties.distanceFromOriginM > 80_000)).toBe(false)
  })

  it('suppresses missing, calm, stale and history-fallback measurements', () => {
    const routePoints = [
      { lat: 64, lon: -20 },
      { lat: 64.5, lon: -20 },
    ]
    const base = { routePoints, nowMs: NOW_MS, maxStationInfluenceM: 100_000 }

    expect(buildRouteWindArrowField({
      ...base,
      stations: [station({ windDirectionDeg: null, windDirectionText: null })],
    }).features).toHaveLength(0)
    expect(buildRouteWindArrowField({
      ...base,
      stations: [station({ statusWindMs: 0 })],
    }).features).toHaveLength(0)
    expect(buildRouteWindArrowField({
      ...base,
      stations: [station({ measuredAtIso: '2026-07-27T19:29:59Z' })],
    }).features).toHaveLength(0)
    expect(buildRouteWindArrowField({
      ...base,
      stations: [station({ measuredAtIso: '2026-07-27T20:05:01Z' })],
    }).features).toHaveLength(0)
    expect(buildRouteWindArrowField({
      ...base,
      stations: [station()],
      cacheStatus: 'history_fallback',
    }).features).toHaveLength(0)
  })

  it('dims aging measurements before removing them at 30 minutes', () => {
    const result = buildRouteWindArrowField({
      routePoints: [
        { lat: 64, lon: -20 },
        { lat: 64.5, lon: -20 },
      ],
      stations: [station({ measuredAtIso: '2026-07-27T19:40:00Z' })],
      nowMs: NOW_MS,
      maxStationInfluenceM: 100_000,
    })

    expect(result.features.length).toBeGreaterThan(0)
    expect(result.features.every(feature => feature.properties.freshness === 'aging')).toBe(true)
    expect(result.features.every(feature => feature.properties.opacity === 0.46)).toBe(true)
  })

  it('caps long-route output and keeps IDs stable across rebuilds', () => {
    const input = {
      routePoints: [
        { lat: 60, lon: -20 },
        { lat: 67, lon: -20 },
      ],
      stations: [station()],
      nowMs: NOW_MS,
      baseSpacingM: 1_000,
      maxStationInfluenceM: 1_000_000,
      maxFeatures: 120,
    }
    const first = buildRouteWindArrowField(input)
    const second = buildRouteWindArrowField(input)

    expect(first.features).toHaveLength(120)
    expect(first.features.map(feature => feature.id)).toEqual(second.features.map(feature => feature.id))
    expect(new Set(first.features.map(feature => feature.id)).size).toBe(120)
  })

  it('keeps true wind direction independent of changing road tangent', () => {
    const result = buildRouteWindArrowField({
      routePoints: [
        { lat: 64, lon: -21 },
        { lat: 64.5, lon: -21 },
        { lat: 64.5, lon: -20 },
      ],
      stations: [station()],
      nowMs: NOW_MS,
      baseSpacingM: 10_000,
      maxStationInfluenceM: 100_000,
    })

    expect(result.features.length).toBeGreaterThan(2)
    expect(new Set(result.features.map(feature => feature.properties.windTowardDeg))).toEqual(new Set([180]))
    expect(new Set(result.features.map(feature => Math.round(feature.properties.roadBearingDeg))).size).toBeGreaterThan(1)
    expect(new Set(result.features.map(feature =>
      feature.properties.iconOffset.map(value => Math.round(value)).join(','),
    )).size).toBeGreaterThan(2)
  })
})
