import { roundCoord } from './places'
import type { RouteWeatherSamplingDiagnostics } from './types'

export const MAX_EXHAUSTIVE_FORECAST_POINTS = 120
const TARGET_WEATHER_POINT_SPACING_M = 10_000

/** Round to 2 decimal places (~1km grid at Icelandic latitudes). Used for deduplication only. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type SampledWeatherPoint = {
  lat: number
  lon: number
  forecastLat: number
  forecastLon: number
  routeIndex: number
  distanceFromOriginM: number
}

/**
 * Selects weather evaluation points from a route geometry.
 *
 * Strategy ("exhaustive when cheap"):
 * 1. Deduplicate route points by ~1km grid (0.01°) to count unique forecast cells.
 * 2. If unique count ≤ MAX_EXHAUSTIVE_FORECAST_POINTS → use all unique cells.
 * 3. Otherwise → distance-based sampling every TARGET_WEATHER_POINT_SPACING_M.
 * 4. The last route point (nearest to destination) is always included.
 *
 * `forecastLat`/`forecastLon` are rounded to 3dp (roundCoord) for met.no cache key consistency.
 */
export function sampleRouteWeatherPoints(
  allPts: Array<{ lat: number; lon: number }>,
  cumDist: number[],
): { weatherPoints: SampledWeatherPoint[]; diagnostics: RouteWeatherSamplingDiagnostics } {
  if (allPts.length === 0) {
    return {
      weatherPoints: [],
      diagnostics: { mode: 'all_unique_forecast_points', rawRoutePointCount: 0, uniqueForecastPointCount: 0, selectedWeatherPointCount: 0 },
    }
  }

  // Step 1: Deduplicate by 2dp (~1km) grid
  const seenCells = new Set<string>()
  const uniquePoints: Array<{ lat: number; lon: number; distanceFromOriginM: number }> = []
  for (let i = 0; i < allPts.length; i++) {
    const cellKey = `${round2(allPts[i].lat)},${round2(allPts[i].lon)}`
    if (!seenCells.has(cellKey)) {
      seenCells.add(cellKey)
      uniquePoints.push({ lat: allPts[i].lat, lon: allPts[i].lon, distanceFromOriginM: cumDist[i] })
    }
  }

  const uniqueCount = uniquePoints.length
  let selectedPoints: Array<{ lat: number; lon: number; distanceFromOriginM: number }>
  let mode: 'all_unique_forecast_points' | 'distance_capped'

  if (uniqueCount <= MAX_EXHAUSTIVE_FORECAST_POINTS) {
    selectedPoints = uniquePoints
    mode = 'all_unique_forecast_points'
  } else {
    // Distance-based: one representative point per TARGET_WEATHER_POINT_SPACING_M
    const cappedPoints: typeof uniquePoints = []
    let lastDist = -Infinity
    for (const pt of uniquePoints) {
      if (cappedPoints.length === 0 || pt.distanceFromOriginM - lastDist >= TARGET_WEATHER_POINT_SPACING_M) {
        cappedPoints.push(pt)
        lastDist = pt.distanceFromOriginM
        if (cappedPoints.length >= MAX_EXHAUSTIVE_FORECAST_POINTS) break
      }
    }
    selectedPoints = cappedPoints
    mode = 'distance_capped'
  }

  // Ensure last route point is always included (destination proximity)
  const lastAllPt = allPts[allPts.length - 1]
  const lastDist = cumDist[cumDist.length - 1]
  const lastCell = `${round2(lastAllPt.lat)},${round2(lastAllPt.lon)}`
  const lastAlreadyIncluded = selectedPoints.some(p => `${round2(p.lat)},${round2(p.lon)}` === lastCell)
  if (!lastAlreadyIncluded) {
    const lastEntry = { lat: lastAllPt.lat, lon: lastAllPt.lon, distanceFromOriginM: lastDist }
    if (selectedPoints.length < MAX_EXHAUSTIVE_FORECAST_POINTS) {
      selectedPoints = [...selectedPoints, lastEntry]
    } else {
      selectedPoints = [...selectedPoints.slice(0, -1), lastEntry]
    }
  }

  const weatherPoints: SampledWeatherPoint[] = selectedPoints.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    forecastLat: roundCoord(p.lat),
    forecastLon: roundCoord(p.lon),
    routeIndex: i,
    distanceFromOriginM: p.distanceFromOriginM,
  }))

  return {
    weatherPoints,
    diagnostics: {
      mode,
      rawRoutePointCount: allPts.length,
      uniqueForecastPointCount: uniqueCount,
      selectedWeatherPointCount: weatherPoints.length,
      targetSpacingM: mode === 'distance_capped' ? TARGET_WEATHER_POINT_SPACING_M : undefined,
      cap: mode === 'distance_capped' ? MAX_EXHAUSTIVE_FORECAST_POINTS : undefined,
    },
  }
}
