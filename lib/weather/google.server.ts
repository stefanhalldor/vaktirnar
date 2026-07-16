import 'server-only'
import type { PlaceCandidate, RouteGeometry, RouteOption, StaticMapParams, WeatherMapProvider } from './provider.types'
import { matchRouteCautions } from './routeCautions'
import {
  HOLMAVIK_VIA,
  HOLMAVIK_PROXIMITY_M,
  REYDARFJORDUR_VIA,
} from './routeCautionConstants'
import type { Bounds } from './routeCautionConstants'

// Maximum sampled route points sent to met.no. Keeps API calls bounded.
const MAX_ROUTE_POINTS = 80

// ── Types for Google REST API responses ──────────────────────────────────────

type GeoResult = {
  place_id: string
  formatted_address: string
  address_components: Array<{ long_name: string; short_name: string; types: string[] }>
  geometry: { location: { lat: number; lng: number } }
}

type GeoResponse = {
  status: string
  results: GeoResult[]
}

type RoutesResponse = {
  routes?: Array<{
    polyline: {
      geoJsonLinestring: {
        coordinates: Array<[number, number]>  // [lon, lat]
      }
    }
    distanceMeters: number
    duration: string         // traffic-aware ETA, e.g. "3420s"
    staticDuration?: string  // base travel time without live traffic, e.g. "2700s"
    routeLabels?: string[]   // e.g. ["DEFAULT_ROUTE"] or ["DEFAULT_ROUTE_ALTERNATE"]
    description?: string     // e.g. "via Þrengslavegur/Route 39"
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Downsample a route to at most maxPoints evenly spaced points.
 * Always includes the first and last points.
 */
function samplePoints(
  points: Array<{ lat: number; lon: number }>,
  maxPoints: number
): Array<{ lat: number; lon: number }> {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const sampled: typeof points = []
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i])
  }
  // Always include the last point. If the cap is full, replace the last sampled
  // non-endpoint with the actual last point so the destination is never dropped.
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) {
    if (sampled.length < maxPoints) {
      sampled.push(last)
    } else {
      sampled[sampled.length - 1] = last
    }
  }
  return sampled
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a Google Routes API waypoint for a place candidate.
 * Uses a real Google Place ID when available so the Routes API can snap to the
 * correct road approach (same as Google Maps consumer UI). Falls back to latLng
 * for curated/manual/saved places that have no real Place ID.
 */
function waypointFor(candidate: PlaceCandidate): Record<string, unknown> {
  if (
    candidate.placeId &&
    candidate.placeId !== 'confirmed' &&
    candidate.placeId !== 'curated'
  ) {
    return { placeId: candidate.placeId }
  }
  return { location: { latLng: { latitude: candidate.lat, longitude: candidate.lon } } }
}

/**
 * Parse a Google duration string like "2700s" → 2700.
 * Returns null for missing, empty, or malformed values.
 */
function parseGoogleSeconds(value: string | undefined): number | null {
  if (!value?.endsWith('s')) return null
  const parsed = Number.parseInt(value.slice(0, -1), 10)
  return Number.isFinite(parsed) ? parsed : null
}

// ── Curated route registry ────────────────────────────────────────────────────

type PlaceMatcher = {
  placeIds?: readonly string[]
  bounds?: readonly Bounds[]
}

type CuratedRouteRule = {
  /** Stable identifier used in diagnostics and tests. */
  id: string
  /** Short human-readable name for dev logs. */
  logName: string
  /**
   * If set, this rule is triggered when at least one base route has this caution ID,
   * and no base route already avoids it. Origin/destination matching is skipped.
   * After fetch, the curated route is validated: if it still carries the same caution
   * it is suppressed.
   */
  triggerCautionId?: string
  /** Required when triggerCautionId is not set. */
  origin?: PlaceMatcher
  /** If set, skip this rule when the origin matches (e.g. exclude origins already inside the destination area). */
  excludedOrigin?: PlaceMatcher
  /** Required when triggerCautionId is not set. */
  destination?: PlaceMatcher
  /** One or more via-points on the desired road, in order. Verify visually on localhost before each new rule. */
  vias: readonly { lat: number; lon: number }[]
  labels: readonly string[]
  /** Skip this rule unless the fastest already-fetched route is at least this many metres. */
  minFastestRouteDistanceM?: number
}

// Capital-area bounding box: Reykjavík, Garðabær, Kópavogur, Hafnarfjörður, Seltjarnarnes, Mosfellsbær.
// Intentionally excludes Reykjanes/southwest (Keflavík lon ≈ -22.56, Grindavík ≈ -22.44, Vogar ≈ -22.37).
const CAPITAL_AREA_BOUNDS: Bounds = { minLat: 63.95, maxLat: 64.25, minLon: -22.10, maxLon: -21.40 }

// South/southeast corridor where Hellisheiði (Route 1) is the normal outbound road from Reykjavík.
// minLon: -21.25 keeps Þorlákshöfn (~-21.37) out.
// maxLat: 64.15 keeps Þingvellir (~64.25) and Laugarvatn (~64.21) out.
// maxLon: -13.0 covers the full south/east coast including Vík, Höfn, and southeast.
const SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS: Bounds = { minLat: 63.35, maxLat: 64.15, minLon: -21.25, maxLon: -13.0 }

// East Iceland corridor (Austurland): Egilsstaðir, Seyðisfjörður, Djúpivogur, Neskaupstaður etc.
// minLat: 64.35 keeps south coast out (handled by SOUTH_EAST rule). maxLat: 65.50 keeps Mývatn/Húsavík/Akureyri out.
// minLon: -15.90 is west enough to include Egilsstaðir (-14.40). maxLon: -13.0 covers east fjords.
const EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS: Bounds = { minLat: 64.35, maxLat: 65.50, minLon: -15.90, maxLon: -13.0 }

// North Iceland destinations for Hringurinn Route A (south-east-north).
// Covers Akureyri (65.68), Mývatn (65.60), Húsavík (66.04) and other north/northeast destinations.
// minLat 65.40 keeps Egilsstaðir (65.27) out — ambiguous direction, not covered by Route A or B.
const NORTH_ICELAND_RING_ROAD_BOUNDS: Bounds = { minLat: 65.40, maxLat: 66.7, minLon: -22.0, maxLon: -14.0 }

// Southeast coast destinations for Hringurinn Route B (north-east-south).
// Covers Höfn (64.25/-15.21), Djúpivogur (64.65/-14.28), Breiðdalsvík and east fjords south coast.
// maxLat 65.0 keeps Egilsstaðir (65.27) out. minLon -15.9 keeps destinations west of Höfn out.
const SOUTHEAST_COAST_RING_ROAD_BOUNDS: Bounds = { minLat: 63.5, maxLat: 65.0, minLon: -15.9, maxLon: -13.0 }

// Shared via-point constants. All pending localhost visual verification on Route 1.
const HELLISHEIDI_VIA         = { lat: 64.036, lon: -21.392 } // Route 1 over Hellisheiði — pending verification
const RING_ROAD_SOUTH_VIA     = { lat: 63.415, lon: -18.977 } // Route 1, Mýrdalssandur (east of Vík) — pending verification
const RING_ROAD_EAST_VIA      = { lat: 64.295, lon: -15.148 } // Route 1, between Djúpivogur and Höfn — pending verification
const RING_ROAD_NORTHEAST_VIA = { lat: 65.130, lon: -14.514 } // Route 1, south of Egilsstaðir — pending verification
const RING_ROAD_NORTH_VIA     = { lat: 65.540, lon: -19.520 } // Route 1, Varmahlíð area (north Iceland) — pending verification

// HOLMAVIK_VIA and HOLMAVIK_PROXIMITY_M imported from routeCautionConstants.

const CURATED_ROUTE_RULES: readonly CuratedRouteRule[] = [
  {
    id: 'capital-corridor-to-south-east-via-hellisheidi',
    logName: 'Hellisheiði / Suðurland',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: { bounds: [SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS] },
    vias: [HELLISHEIDI_VIA],
    labels: ['CURATED_VIA_HELLISHEIDI'],
  },
  {
    id: 'capital-corridor-to-east-iceland-via-hellisheidi',
    logName: 'Hellisheiði / Austurland',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: { bounds: [EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS] },
    vias: [HELLISHEIDI_VIA],
    labels: ['CURATED_VIA_HELLISHEIDI', 'CURATED_EAST_ICELAND_VIA_HELLISHEIDI'],
  },
  {
    // Hringurinn Route A: counter-clockwise (south → east → north) for north/northeast destinations.
    // The natural fastest route to Akureyri/Mývatn goes north. This alternate goes the other way.
    // Via-points must be verified on localhost before release — do not ship without visual check.
    id: 'long-trip-ring-road-south-east-north',
    logName: 'Hringurinn / suður-austur-norður',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: { bounds: [NORTH_ICELAND_RING_ROAD_BOUNDS] },
    minFastestRouteDistanceM: 350_000,
    vias: [HELLISHEIDI_VIA, RING_ROAD_SOUTH_VIA, RING_ROAD_EAST_VIA, RING_ROAD_NORTHEAST_VIA],
    labels: ['CURATED_RING_ROAD'],
  },
  {
    // Hringurinn Route B: clockwise (north → east → south) for southeast coast destinations.
    // The natural fastest route to Höfn goes south/east. This alternate goes the other way via north.
    // Via-points must be verified on localhost before release — do not ship without visual check.
    id: 'long-trip-ring-road-north-east-south',
    logName: 'Hringurinn / norður-austur-suður',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: { bounds: [SOUTHEAST_COAST_RING_ROAD_BOUNDS] },
    minFastestRouteDistanceM: 350_000,
    vias: [RING_ROAD_NORTH_VIA, RING_ROAD_NORTHEAST_VIA],
    labels: ['CURATED_RING_ROAD'],
  },
  {
    // Til að sleppa við Öxi: curated route via Reyðarfjörður when Google routes over Öxi / Road 939.
    // Triggered by the 'oxi-axarvegur-939' caution on any base route (not by origin/destination bounds),
    // and only when no base route already avoids Öxi. After fetch, the curated route is validated:
    // if it still carries the Öxi caution it is suppressed and not shown.
    //
    // Reyðarfjörður via-point shapes Google to go around the eastern fjords. Verify on localhost
    // that the returned polyline does not use Road 939 before each release.
    id: 'avoid-oxi-via-reydarfjordur',
    logName: 'Öxi / Reyðarfjörður',
    triggerCautionId: 'oxi-axarvegur-939',
    vias: [REYDARFJORDUR_VIA],
    labels: ['CURATED_AVOID_OXI'],
  },
  {
    // Gegnum Hólmavík: caution-triggered curated route via Hólmavík (Route 61).
    // Fires whenever a base route receives the westfjords-south-route60 caution, meaning the
    // route touches the northern Westfjords (Ísafjörður, Bolungarvík area) and avoids Hólmavík.
    // Works in both directions: Garðabær → Ísafjörður and Ísafjörður → Akureyri both trigger it.
    // After fetch, the curated route is validated: if it still carries westfjords-south-route60
    // (e.g. Google routes it away from Hólmavík despite the via), it is suppressed.
    // The shouldSkipCuratedHolmavik guard additionally suppresses duplicates when a base route
    // already passes through the Hólmavík corridor.
    // The 180 km distance gate prevents short local trips from triggering this rule.
    //
    // Via-point must be verified visually on localhost before each release.
    id: 'safe-westfjords-via-holmavik',
    logName: 'Vestfirðir / Hólmavík',
    triggerCautionId: 'westfjords-south-route60',
    minFastestRouteDistanceM: 180_000,
    vias: [HOLMAVIK_VIA],
    labels: ['CURATED_VIA_HOLMAVIK'],
  },
]

function matchesBounds(c: PlaceCandidate, b: Bounds): boolean {
  return c.lat >= b.minLat && c.lat <= b.maxLat && c.lon >= b.minLon && c.lon <= b.maxLon
}

function matchesPlaceMatcher(c: PlaceCandidate, m: PlaceMatcher): boolean {
  if (m.placeIds?.includes(c.placeId)) return true
  if (m.bounds?.some(b => matchesBounds(c, b))) return true
  return false
}

/**
 * Stable geometry fingerprint — excludes durationS because TRAFFIC_AWARE duration fluctuates
 * between the route-step fetch and the final-submit fetch.
 */
function buildRouteFingerprint(
  distanceMeters: number,
  coords: Array<[number, number]>,
  fallbackIdx: number
): string {
  const first = coords[0]
  const last = coords[coords.length - 1]
  const mid = coords[Math.floor(coords.length / 2)]
  return first && last
    ? `${distanceMeters}-${first[1].toFixed(4)},${first[0].toFixed(4)}-${mid ? `${mid[1].toFixed(4)},${mid[0].toFixed(4)}-` : ''}${last[1].toFixed(4)},${last[0].toFixed(4)}`
    : `${distanceMeters}-${fallbackIdx}`
}

async function fetchCuratedRoute(
  rule: CuratedRouteRule,
  from: PlaceCandidate,
  to: PlaceCandidate,
  key: string,
  existingIds: Set<string>
): Promise<RouteOption | null> {
  const body = {
    origin: waypointFor(from),
    destination: waypointFor(to),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    polylineEncoding: 'GEO_JSON_LINESTRING',
    intermediates: rule.vias.map(v => ({
      via: true,
      location: { latLng: { latitude: v.lat, longitude: v.lon } },
    })),
  }

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.staticDuration,routes.description',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    if (!res.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[weather/google] curated ${rule.logName}: HTTP ${res.status}, skipping`)
      }
      return null
    }

    const data = (await res.json()) as RoutesResponse
    const route = data.routes?.[0]
    if (!route) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[weather/google] curated ${rule.logName}: ZERO_RESULTS or empty, skipping`)
      }
      return null
    }

    const coords = route.polyline.geoJsonLinestring.coordinates
    const id = `google-${buildRouteFingerprint(route.distanceMeters, coords, -1)}`

    if (existingIds.has(id)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[weather/google] curated ${rule.logName}: same geometry as existing route, skipping`)
      }
      return null
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[weather/google] curated ${rule.logName}: distinct route added`, {
        distanceMeters: route.distanceMeters,
        description: route.description,
      })
    }

    const allPoints = coords.map(([lon, lat]) => ({ lat, lon }))
    // Evaluate cautions on full pre-sampling geometry so sparse sampled points
    // do not produce false negatives on shorter caution corridors.
    const cautions = matchRouteCautions(allPoints, from, to)

    return {
      id,
      routeIndex: -1,
      provider: 'google',
      labels: [...rule.labels],
      isDefault: false,
      points: samplePoints(allPoints, MAX_ROUTE_POINTS),
      distanceM: route.distanceMeters,
      durationS: parseGoogleSeconds(route.staticDuration) ?? parseGoogleSeconds(route.duration) ?? 0,
      description: route.description,
      ...(cautions.length > 0 ? { cautions } : {}),
    }
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[weather/google] curated ${rule.logName}: request threw, skipping`)
    }
    return null
  }
}

// ── Hellisheiði duplicate filter ──────────────────────────────────────────────

/**
 * How much faster a curated CURATED_VIA_HELLISHEIDI route must be (in seconds)
 * compared to the fastest base route before we keep it even when the base route
 * already passes through the Hellisheiði corridor.
 */
const HELLISHEIDI_DUPLICATE_TOLERANCE_S = 60
/**
 * Generous proximity threshold for sampled-point detection: how close (in metres)
 * a route point must be to HELLISHEIDI_VIA to count as "passing through Hellisheiði".
 * 5 km is intentionally loose to compensate for sparse sampling.
 */
const HELLISHEIDI_DUPLICATE_PROXIMITY_M = 5_000

/** Haversine distance in metres between two lat/lon points. */
function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const sinHalfDLat = Math.sin(dLat / 2)
  const sinHalfDLon = Math.sin(dLon / 2)
  const a2 =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfDLon * sinHalfDLon
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
}

/** True if any sampled point on the route is within maxDistanceM of the target. */
function routePassesNearPoint(
  route: RouteOption,
  point: { lat: number; lon: number },
  maxDistanceM: number
): boolean {
  return route.points.some(p => haversineM(p, point) <= maxDistanceM)
}

/**
 * Returns true when a CURATED_VIA_HELLISHEIDI route should be suppressed because:
 * 1. The base Google routes already include a route through the Hellisheiði corridor, AND
 * 2. The curated route is not meaningfully faster than the fastest base route.
 *
 * Purpose: avoid showing a slower "Um Hellisheiði" duplicate when Google already
 * returns the same Hellisheiði corridor as the fastest/default option.
 * CURATED_RING_ROAD is intentionally exempt — Hringurinn is allowed to be longer.
 */
function shouldSkipCuratedHellisheidi(
  curated: RouteOption,
  baseRoutes: readonly RouteOption[]
): boolean {
  if (!curated.labels.includes('CURATED_VIA_HELLISHEIDI')) return false

  const fastestBase = baseRoutes[0]
  if (!fastestBase) return false

  const baseAlreadyPassesHellisheidi = baseRoutes.some(route =>
    routePassesNearPoint(route, HELLISHEIDI_VIA, HELLISHEIDI_DUPLICATE_PROXIMITY_M)
  )
  if (!baseAlreadyPassesHellisheidi) return false

  return curated.durationS >= fastestBase.durationS - HELLISHEIDI_DUPLICATE_TOLERANCE_S
}

// ── Hólmavík duplicate filter ─────────────────────────────────────────────────

// HOLMAVIK_PROXIMITY_M imported from routeCautionConstants — kept in sync with caution detection.
const HOLMAVIK_DUPLICATE_TOLERANCE_S = 60

/**
 * Returns true when a CURATED_VIA_HOLMAVIK route should be suppressed because:
 * 1. The base Google routes already include a route through the Hólmavík corridor, AND
 * 2. The curated route is not meaningfully faster than the fastest base route.
 */
function shouldSkipCuratedHolmavik(
  curated: RouteOption,
  baseRoutes: readonly RouteOption[]
): boolean {
  if (!curated.labels.includes('CURATED_VIA_HOLMAVIK')) return false

  const fastestBase = baseRoutes[0]
  if (!fastestBase) return false

  const baseAlreadyPassesHolmavik = baseRoutes.some(route =>
    routePassesNearPoint(route, HOLMAVIK_VIA, HOLMAVIK_PROXIMITY_M)
  )
  if (!baseAlreadyPassesHolmavik) return false

  return curated.durationS >= fastestBase.durationS - HOLMAVIK_DUPLICATE_TOLERANCE_S
}

/**
 * Run all matching curated route rules sequentially.
 * Each matching rule makes one extra Google Routes request.
 * existingIds is updated after each successful add to prevent inter-rule geometry duplicates.
 * fastestDistanceM is the distanceM of the fastest already-fetched route (used for distance gates).
 * baseRoutes are the already-fetched Google routes, used for the Hellisheiði duplicate filter.
 */
async function getCuratedRouteOptions(
  from: PlaceCandidate,
  to: PlaceCandidate,
  key: string,
  existingIds: Set<string>,
  fastestDistanceM: number,
  baseRoutes: readonly RouteOption[]
): Promise<RouteOption[]> {
  const results: RouteOption[] = []
  for (const rule of CURATED_ROUTE_RULES) {
    if (rule.triggerCautionId) {
      // Caution-triggered rule: trigger when at least one base route has the caution.
      const anyBaseHasCaution = baseRoutes.some(r =>
        r.cautions?.some(c => c.id === rule.triggerCautionId)
      )
      if (!anyBaseHasCaution) continue
      // Skip if any base route already avoids the caution — user already has a safe option.
      const anyBaseAvoidsCaution = baseRoutes.some(r =>
        !r.cautions?.some(c => c.id === rule.triggerCautionId)
      )
      if (anyBaseAvoidsCaution) continue
    } else {
      if (!rule.origin || !rule.destination) continue
      if (!matchesPlaceMatcher(from, rule.origin) || !matchesPlaceMatcher(to, rule.destination)) continue
      if (rule.excludedOrigin && matchesPlaceMatcher(from, rule.excludedOrigin)) continue
    }
    if (rule.minFastestRouteDistanceM != null && fastestDistanceM < rule.minFastestRouteDistanceM) continue
    const curated = await fetchCuratedRoute(rule, from, to, key, existingIds)
    if (curated) {
      // For caution-triggered rules: validate the curated route actually avoids the caution.
      if (rule.triggerCautionId && curated.cautions?.some(c => c.id === rule.triggerCautionId)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[weather/google] curated ${rule.logName}: suppressed — still has caution ${rule.triggerCautionId}`)
        }
        continue
      }
      if (shouldSkipCuratedHellisheidi(curated, baseRoutes)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[weather/google] curated ${rule.logName}: skipped — base route already uses Hellisheiði corridor`)
        }
        continue
      }
      if (shouldSkipCuratedHolmavik(curated, baseRoutes)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[weather/google] curated ${rule.logName}: skipped — base route already uses Hólmavík corridor`)
        }
        continue
      }
      results.push(curated)
      existingIds.add(curated.id)
    }
  }
  return results
}

// ── Provider implementation ───────────────────────────────────────────────────

async function geocodePlace(query: string): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&region=is&language=is&key=${key}`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Geocoding API HTTP ${res.status}`)

  const data = (await res.json()) as GeoResponse
  if (data.status !== 'OK') return []

  return data.results.slice(0, 5).map((r) => ({
    placeId: r.place_id,
    displayName: r.address_components[0]?.long_name ?? r.formatted_address,
    formattedAddress: r.formatted_address,
    lat: r.geometry.location.lat,
    lon: r.geometry.location.lng,
  }))
}

async function getRouteGeometry(
  from: PlaceCandidate,
  to: PlaceCandidate
): Promise<RouteGeometry | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const body = {
    origin: waypointFor(from),
    destination: waypointFor(to),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    polylineEncoding: 'GEO_JSON_LINESTRING',
  }

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.description',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) return null

  const data = (await res.json()) as RoutesResponse
  const route = data.routes?.[0]
  if (!route) return null

  const allPoints = route.polyline.geoJsonLinestring.coordinates.map(
    ([lon, lat]) => ({ lat, lon })
  )
  const points = samplePoints(allPoints, MAX_ROUTE_POINTS)

  return {
    points,
    distanceM: route.distanceMeters,
    durationS: parseInt(route.duration.replace('s', ''), 10),
  }
}

async function getRouteOptions(
  from: PlaceCandidate,
  to: PlaceCandidate
): Promise<RouteOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const body = {
    origin: waypointFor(from),
    destination: waypointFor(to),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    polylineEncoding: 'GEO_JSON_LINESTRING',
    computeAlternativeRoutes: true,
  }

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.staticDuration,routes.routeLabels,routes.description',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) return []

  const data = (await res.json()) as RoutesResponse
  if (!data.routes || data.routes.length === 0) return []

  const rawOptions = data.routes.map((route, idx) => {
    const coords = route.polyline.geoJsonLinestring.coordinates
    const allPoints = coords.map(([lon, lat]) => ({ lat, lon }))
    const points = samplePoints(allPoints, MAX_ROUTE_POINTS)
    const labels = route.routeLabels ?? []
    const trafficDurationS = parseGoogleSeconds(route.duration)
    const staticDurationS = parseGoogleSeconds(route.staticDuration)
    const durationS = staticDurationS ?? trafficDurationS ?? 0
    const id = `google-${buildRouteFingerprint(route.distanceMeters, coords, idx)}`

    // Evaluate cautions on full pre-sampling geometry.
    const cautions = matchRouteCautions(allPoints, from, to)

    return {
      id,
      routeIndex: idx,
      provider: 'google' as const,
      labels,
      isDefault: labels.includes('DEFAULT_ROUTE'),
      points,
      distanceM: route.distanceMeters,
      durationS,
      description: route.description,
      ...(cautions.length > 0 ? { cautions } : {}),
    }
  })

  // Deduplicate by geometry fingerprint — keep first occurrence, merge labels.
  const seen = new Map<string, typeof rawOptions[0]>()
  for (const route of rawOptions) {
    const existing = seen.get(route.id)
    if (existing) {
      const merged = [...new Set([...existing.labels, ...route.labels])]
      existing.labels = merged
      existing.isDefault = merged.includes('DEFAULT_ROUTE')
    } else {
      seen.set(route.id, { ...route })
    }
  }

  // Sort by durationS ascending so the fastest route is always first.
  const routeOptions: RouteOption[] = [...seen.values()].sort((a, b) => a.durationS - b.durationS)

  // If some base routes carry oxi-axarvegur-939 and others avoid it, label the
  // avoiding routes as CURATED_AVOID_OXI so the UI can present them clearly
  // without an extra Google request.
  const OXI_CAUTION_ID = 'oxi-axarvegur-939'
  const hasOxiRoutes = routeOptions.some(r => r.cautions?.some(c => c.id === OXI_CAUTION_ID))
  if (hasOxiRoutes) {
    for (const route of routeOptions) {
      if (!route.cautions?.some(c => c.id === OXI_CAUTION_ID) && !route.labels.includes('CURATED_AVOID_OXI')) {
        route.labels = [...route.labels, 'CURATED_AVOID_OXI']
      }
    }
  }

  // Run matching curated route rules (one extra Google request per matching rule).
  const existingIds = new Set(routeOptions.map(r => r.id))
  const fastestDistanceM = routeOptions.length > 0 ? routeOptions[0].distanceM : 0
  const curatedRoutes = await getCuratedRouteOptions(from, to, key, existingIds, fastestDistanceM, routeOptions)
  if (curatedRoutes.length > 0) {
    routeOptions.push(...curatedRoutes)
    routeOptions.sort((a, b) => a.durationS - b.durationS)
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[weather/google] getRouteOptions diagnostics:', JSON.stringify({
      originType: from.placeId && from.placeId !== 'confirmed' && from.placeId !== 'curated' ? 'placeId' : 'latLng',
      destType: to.placeId && to.placeId !== 'confirmed' && to.placeId !== 'curated' ? 'placeId' : 'latLng',
      routeCount: routeOptions.length,
      curatedAdded: curatedRoutes.length > 0,
      curatedRules: curatedRoutes.map(r => r.labels[0]),
      routes: routeOptions.map(r => ({
        distanceMeters: r.distanceM,
        durationS: r.durationS,
        labels: r.labels,
        description: r.description,
        cautions: r.cautions?.map(c => c.id),
      })),
      durationNote: 'durationS uses staticDuration when available, falls back to traffic-aware duration',
    }, null, 2))
  }

  return routeOptions
}

/**
 * Returns a Static Maps URL using the browser-restricted key.
 * Safe to include in API responses — the browser key has HTTP referrer restrictions.
 */
function staticMapUrl(params: StaticMapParams): string {
  const { lat, lon, zoom = 12, width = 600, height = 300 } = params
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY not set')

  const center = `${lat},${lon}`
  const marker = `color:red|label:•|${lat},${lon}`
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${encodeURIComponent(center)}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&markers=${encodeURIComponent(marker)}` +
    `&key=${key}`
  )
}

export const googleProvider: WeatherMapProvider = {
  geocodePlace,
  getRouteGeometry,
  getRouteOptions,
  staticMapUrl,
}
