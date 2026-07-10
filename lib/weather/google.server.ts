import 'server-only'
import type { PlaceCandidate, RouteGeometry, RouteOption, StaticMapParams, WeatherMapProvider } from './provider.types'

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

type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number }

type PlaceMatcher = {
  placeIds?: readonly string[]
  bounds?: readonly Bounds[]
}

type CuratedRouteRule = {
  /** Stable identifier used in diagnostics and tests. */
  id: string
  /** Short human-readable name for dev logs. */
  logName: string
  origin: PlaceMatcher
  destination: PlaceMatcher
  /** Via-point on the desired road. Verify visually on localhost before each new rule. */
  via: { lat: number; lon: number }
  labels: readonly string[]
}

// Capital-area bounding box: Reykjavík, Garðabær, Kópavogur, Hafnarfjörður, Seltjarnarnes, Mosfellsbær.
// Intentionally excludes Reykjanes/southwest (Keflavík lon ≈ -22.56, Grindavík ≈ -22.44, Vogar ≈ -22.37).
const CAPITAL_AREA_BOUNDS: Bounds = { minLat: 63.95, maxLat: 64.25, minLon: -22.10, maxLon: -21.40 }

// Tight bounding box around Þorlákshöfn — catches coord-based selections (saved places, geocode fallback).
const THORLAKSHOFN_BOUNDS: Bounds = { minLat: 63.82, maxLat: 63.88, minLon: -21.44, maxLon: -21.30 }

// South/southeast corridor where Hellisheiði (Route 1) is the normal outbound road from Reykjavík.
// minLon: -21.25 keeps Þorlákshöfn (~-21.37) out (handled by Þrengslavegur rule).
// maxLat: 64.15 keeps Þingvellir (~64.25) and Laugarvatn (~64.21) out.
// maxLon: -13.0 covers the full south/east coast including Vík, Höfn, and southeast.
const SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS: Bounds = { minLat: 63.35, maxLat: 64.15, minLon: -21.25, maxLon: -13.0 }

const CURATED_ROUTE_RULES: readonly CuratedRouteRule[] = [
  {
    id: 'capital-area-to-thorlakshofn-via-threngslavegur',
    logName: 'Þrengslavegur',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: {
      placeIds: ['ChIJU1N290hC1kgRypBJRWS0YX4'],  // confirmed from live diagnostics 2026-07-08
      bounds: [THORLAKSHOFN_BOUNDS],
    },
    // Via-point verified on localhost 2026-07-08: curatedAdded=true, description=Þrengslavegur/Leið 39.
    via: { lat: 63.9550, lon: -21.4900 },
    labels: ['CURATED_VIA_THRENGSLAVEGUR'],
  },
  {
    id: 'capital-corridor-to-south-east-via-hellisheidi',
    logName: 'Hellisheiði',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: { bounds: [SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS] },
    // Via-point on Route 1 through Hellisheiði plateau. To be verified on localhost.
    via: { lat: 64.0360, lon: -21.3920 },
    labels: ['CURATED_VIA_HELLISHEIDI'],
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
    intermediates: [{
      via: true,
      location: { latLng: { latitude: rule.via.lat, longitude: rule.via.lon } },
    }],
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

    return {
      id,
      routeIndex: -1,
      provider: 'google',
      labels: [...rule.labels],
      isDefault: false,
      points: samplePoints(coords.map(([lon, lat]) => ({ lat, lon })), MAX_ROUTE_POINTS),
      distanceM: route.distanceMeters,
      durationS: parseGoogleSeconds(route.staticDuration) ?? parseGoogleSeconds(route.duration) ?? 0,
      description: route.description,
    }
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[weather/google] curated ${rule.logName}: request threw, skipping`)
    }
    return null
  }
}

/**
 * Run all matching curated route rules sequentially.
 * Each matching rule makes one extra Google Routes request.
 * existingIds is updated after each successful add to prevent inter-rule geometry duplicates.
 */
async function getCuratedRouteOptions(
  from: PlaceCandidate,
  to: PlaceCandidate,
  key: string,
  existingIds: Set<string>
): Promise<RouteOption[]> {
  const results: RouteOption[] = []
  for (const rule of CURATED_ROUTE_RULES) {
    if (!matchesPlaceMatcher(from, rule.origin) || !matchesPlaceMatcher(to, rule.destination)) continue
    const curated = await fetchCuratedRoute(rule, from, to, key, existingIds)
    if (curated) {
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

  // Run matching curated route rules (one extra Google request per matching rule).
  const existingIds = new Set(routeOptions.map(r => r.id))
  const curatedRoutes = await getCuratedRouteOptions(from, to, key, existingIds)
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
