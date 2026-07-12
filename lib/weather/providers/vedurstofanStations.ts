/**
 * Veðurstofan Íslands station list and route-point mapping.
 *
 * This module maps route points (lat/lon) to the nearest curated
 * Veðurstofan station. It does NOT make network requests.
 *
 * Station IDs are confirmed from Veðurstofan station pages or live probe.
 * Coordinates use WGS84 with NEGATIVE longitudes for Iceland (west of Greenwich).
 * Station pages may display longitudes as positive — convert before adding here.
 *
 * Coverage status: verified curated road-route seed. Covers routes 1, 41, 48,
 * 51 and common ring-road sections. All default-list coordinates are verified
 * from official station pages.
 */

export type VedurstofanStation = {
  stationId: string
  stationName: string
  lat: number
  /** NEGATIVE for Icelandic stations. Iceland is west of Greenwich (0°). */
  lon: number
  owner: string
  /**
   * True if both station ID and coordinates have been verified against
   * the official Veðurstofan station page or live probe data.
   * False means the station ID is confirmed but coordinates are approximate.
   */
  coordinatesVerified: boolean
}

export type StationMappingConfidence = 'good' | 'ok' | 'weak' | 'unavailable'

export type StationMapping = {
  station: VedurstofanStation
  /** Haversine distance in metres from route point to station */
  distanceFromRoutePointM: number
  confidence: StationMappingConfidence
}

// ── Confidence thresholds ─────────────────────────────────────────────────────

const GOOD_MAX_M = 5_000   // <= 5 km: station is close enough to treat as representative
const OK_MAX_M = 15_000    // 5–15 km: usable but note the distance
const WEAK_MAX_M = 50_000  // 15–50 km: different microclimate likely; use with caution
// > 50 km: 'unavailable' — too far to be meaningful for route point

// ── Curated station list ──────────────────────────────────────────────────────
//
// Adding a new station: read coordinates from the official station page at
// https://www.vedur.is/vedur/stodvar/?s={slug} and NEGATE the longitude.
// Example: station page shows (64,0188, 21,3424) → lat=64.0188, lon=-21.3424.
// Set coordinatesVerified: true only when both ID and coordinates are confirmed.

export const VEDURSTOFAN_STATIONS: readonly VedurstofanStation[] = [
  // Capital area / Reykjanes / Routes 41, 48 and 51
  {
    stationId: '31475',
    stationName: 'Garðabær - Kauptún',
    lat: 64.0797,
    lon: -21.9029,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '990',
    stationName: 'Keflavíkurflugvöllur',
    lat: 63.9802,
    lon: -22.5953,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '31363',
    stationName: 'Reykjanesbraut',
    lat: 64.0027,
    lon: -22.2296,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31579',
    stationName: 'Kjalarnes',
    lat: 64.2106,
    lon: -21.7667,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31572',
    stationName: 'Akrafjall',
    lat: 64.3105,
    lon: -21.9660,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31674',
    stationName: 'Hafnarfjall',
    lat: 64.4755,
    lon: -21.9603,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },

  // Southwest / South coast Route 1
  {
    stationId: '31488',
    stationName: 'Sandskeið',
    lat: 64.0624,
    lon: -21.5577,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31387',
    stationName: 'Þrengsli',
    lat: 63.9876,
    lon: -21.4633,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31392',
    stationName: 'Hellisheiði',
    lat: 64.0188,
    lon: -21.3424,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '31399',
    stationName: 'Ingólfsfjall',
    lat: 63.9574,
    lon: -21.0633,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '6300',
    stationName: 'Selfoss',
    lat: 63.9355,
    lon: -20.9707,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '36308',
    stationName: 'Þjórsárbrú',
    lat: 63.9306,
    lon: -20.6653,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '6315',
    stationName: 'Hella',
    lat: 63.8257,
    lon: -20.3654,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '36049',
    stationName: 'Reynisfjall',
    lat: 63.4521,
    lon: -19.0378,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '6272',
    stationName: 'Kirkjubæjarklaustur Stjórnarsandur',
    lat: 63.7930,
    lon: -18.0119,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '6499',
    stationName: 'Skaftafell',
    lat: 64.0144,
    lon: -16.9721,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '5309',
    stationName: 'Fagurhólsmýri',
    lat: 63.8743,
    lon: -16.6364,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '5544',
    stationName: 'Höfn í Hornafirði',
    lat: 64.2691,
    lon: -15.2135,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '35666',
    stationName: 'Hvalnes',
    lat: 64.4074,
    lon: -14.5393,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '5872',
    stationName: 'Teigarhorn',
    lat: 64.6757,
    lon: -14.3444,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },

  // East / Northeast / North Route 1
  {
    stationId: '571',
    stationName: 'Egilsstaðaflugvöllur',
    lat: 65.2830,
    lon: -14.4025,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '4830',
    stationName: 'Möðrudalur',
    lat: 65.3754,
    lon: -15.8833,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '4323',
    stationName: 'Grímsstaðir á Fjöllum',
    lat: 65.6422,
    lon: -16.1284,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '4300',
    stationName: 'Mývatn',
    lat: 65.6193,
    lon: -16.9768,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '3471',
    stationName: 'Akureyri - Krossanesbraut',
    lat: 65.6961,
    lon: -18.1113,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '3317',
    stationName: 'Blönduós',
    lat: 65.6580,
    lon: -20.2925,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '2197',
    stationName: 'Reykir í Hrútafirði',
    lat: 65.2543,
    lon: -21.0978,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
  {
    stationId: '32097',
    stationName: 'Holtavörðuheiði',
    lat: 64.9899,
    lon: -21.0576,
    owner: 'Vegagerðin',
    coordinatesVerified: true,
  },
  {
    stationId: '1781',
    stationName: 'Stafholtsey',
    lat: 64.6430,
    lon: -21.5893,
    owner: 'Veðurstofa Íslands',
    coordinatesVerified: true,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceToConfidence(distanceM: number): StationMappingConfidence {
  if (distanceM <= GOOD_MAX_M) return 'good'
  if (distanceM <= OK_MAX_M) return 'ok'
  if (distanceM <= WEAK_MAX_M) return 'weak'
  return 'unavailable'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Maps a route point (lat/lon) to the nearest station in the curated list.
 *
 * Returns null only when the station list is empty.
 * Returns 'unavailable' confidence when all stations are > 50 km away.
 *
 * @param stations - Override the default list (useful in tests).
 */
export function mapRoutePointToVedurstofanStation(
  routePoint: { lat: number; lon: number },
  stations: readonly VedurstofanStation[] = VEDURSTOFAN_STATIONS,
): StationMapping | null {
  if (stations.length === 0) return null

  let best = stations[0]
  let bestDistanceM = haversineM(routePoint.lat, routePoint.lon, stations[0].lat, stations[0].lon)

  for (let i = 1; i < stations.length; i++) {
    const d = haversineM(routePoint.lat, routePoint.lon, stations[i].lat, stations[i].lon)
    if (d < bestDistanceM) {
      bestDistanceM = d
      best = stations[i]
    }
  }

  return {
    station: best,
    distanceFromRoutePointM: Math.round(bestDistanceM),
    confidence: distanceToConfidence(bestDistanceM),
  }
}

/**
 * Returns the unique station IDs needed for a set of route points,
 * deduplicated and filtered to stations with at least 'weak' confidence.
 *
 * Use this to determine which station IDs to batch-fetch before a route
 * forecast call. Points with 'unavailable' confidence are omitted.
 */
export function getUniqueStationIdsForRoute(
  routePoints: ReadonlyArray<{ lat: number; lon: number }>,
  stations: readonly VedurstofanStation[] = VEDURSTOFAN_STATIONS,
): string[] {
  const seen = new Set<string>()
  for (const pt of routePoints) {
    const mapping = mapRoutePointToVedurstofanStation(pt, stations)
    if (mapping && mapping.confidence !== 'unavailable') {
      seen.add(mapping.station.stationId)
    }
  }
  return [...seen]
}
