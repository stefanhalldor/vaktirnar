import type { LatLon } from './types'

export const ROUTE_SECTIONS_SCHEMA_VERSION = 1 as const
export const ROUTE_SECTIONS_PRESENTATION_HASH_DOMAIN = 'teskeid:route-sections:presentation:v1\n'
export const ROUTE_SECTIONS_MAX_ROUTE_DISTANCE_M = 5_000_000
export const ROUTE_SECTIONS_MAX_SECTION_COUNT = 2_048
export const ROUTE_SECTIONS_MAX_GEOMETRY_POINT_COUNT = 25_000

const ROUTE_SECTIONS_MAX_ROAD_LABEL_LENGTH = 256
const INTEGER_METRIC_TOLERANCE_M = 4
const PORTION_METRIC_TOLERANCE_M = 0.01

export type RouteSectionsEvidencePortionInput = Readonly<{
  startDistanceM: number
  endDistanceM: number
  distanceM: number
  geometry: readonly LatLon[]
  roadNumber?: string
  roadName?: string
}>

export type RouteSectionsEvidenceInput = Readonly<{
  routeDistanceM: number
  assessedDistanceM: number
  unassessedDistanceM: number
  surface: Readonly<{
    pavedM: number
    gravelM: number
    mixedM: number
    unknownM: number
  }>
  direction: Readonly<{
    authoritativeM: number
    inferredM: number
    legacyM: number
  }>
  gravelPortions: readonly RouteSectionsEvidencePortionInput[]
  inferredDirectionPortions: readonly RouteSectionsEvidencePortionInput[]
}>

/**
 * Public geometry is copied only from server-recomputed official-road evidence.
 * It never represents a browser GPS fix or an exact navigation endpoint.
 */
export type RouteSectionsOfficialRoadPortionV1 = Readonly<{
  startDistanceM: number
  endDistanceM: number
  distanceM: number
  geometry: readonly Readonly<LatLon>[]
  roadNumber?: string
  roadName?: string
}>

export type RouteSectionsDirectionV1 =
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      status: 'verified'
      authoritativeM: number
      inferredM: number
      inferredSections: readonly RouteSectionsOfficialRoadPortionV1[]
    }>

export type RouteSectionsDataV1 = Readonly<{
  coverage: Readonly<{
    status: 'complete' | 'partial'
    routeDistanceM: number
    assessedDistanceM: number
    unassessedDistanceM: number
  }>
  surface: Readonly<{
    pavedM: number
    gravelM: number
    mixedM: number
    unknownM: number
    gravelSections: readonly RouteSectionsOfficialRoadPortionV1[]
  }>
  direction: RouteSectionsDirectionV1
}>

export type RouteSectionsReadyResponseV1 = Readonly<{
  status: 'ready'
  schemaVersion: typeof ROUTE_SECTIONS_SCHEMA_VERSION
  /** Opaque HMAC identity already present on the verified route envelope. */
  routeIdentity: string
  /** Deterministic SHA-256 of the sanitized presentation and route identity. */
  presentationHash: string
  data: RouteSectionsDataV1
}>

export function routeSectionsPresentationHashPayload(
  routeIdentity: string,
  data: RouteSectionsDataV1,
): string {
  return `${ROUTE_SECTIONS_PRESENTATION_HASH_DOMAIN}${routeIdentity}\n${JSON.stringify(data)}`
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]
    const b = bytes[index + 1]
    const c = bytes[index + 2]
    result += alphabet[a >> 2]
    result += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (index + 1 < bytes.length) {
      result += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]
    }
    if (index + 2 < bytes.length) result += alphabet[c & 63]
  }
  return result
}

/**
 * Detects transport/state corruption before presentation. This is an
 * integrity fingerprint bound to the signed route identity, not a second
 * client-verifiable authorization signature; envelope HMAC verification and
 * server evidence regeneration remain the authority boundary.
 */
export async function routeSectionsPresentationHashMatches(
  response: RouteSectionsReadyResponseV1,
): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return false
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(routeSectionsPresentationHashPayload(
      response.routeIdentity,
      response.data,
    )),
  )
  return base64Url(new Uint8Array(digest)) === response.presentationHash
}

function finiteNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value)
    && value >= 0
    && value <= ROUTE_SECTIONS_MAX_ROUTE_DISTANCE_M
}

function finiteDistance(value: number): boolean {
  return Number.isFinite(value)
    && value >= 0
    && value <= ROUTE_SECTIONS_MAX_ROUTE_DISTANCE_M
}

function metricMatches(left: number, right: number, toleranceM: number): boolean {
  return Math.abs(left - right) <= toleranceM
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function validPoint(value: unknown, strictKeys: boolean): value is LatLon {
  return isPlainRecord(value)
    && (!strictKeys || hasOnlyKeys(value, ['lat', 'lon']))
    && typeof value.lat === 'number'
    && Number.isFinite(value.lat)
    && value.lat >= -90
    && value.lat <= 90
    && typeof value.lon === 'number'
    && Number.isFinite(value.lon)
    && value.lon >= -180
    && value.lon <= 180
}

function copyRoadLabel(value: string | undefined): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > ROUTE_SECTIONS_MAX_ROAD_LABEL_LENGTH) return null
  return trimmed
}

function samePoint(left: Readonly<LatLon>, right: Readonly<LatLon>): boolean {
  return left.lat === right.lat && left.lon === right.lon
}

function canCoalescePortions(
  previous: RouteSectionsOfficialRoadPortionV1,
  current: RouteSectionsOfficialRoadPortionV1,
): boolean {
  const previousEndPoint = previous.geometry[previous.geometry.length - 1]
  const currentStartPoint = current.geometry[0]
  const combinedDistanceM = previous.distanceM + current.distanceM

  return previous.roadNumber === current.roadNumber
    && previous.roadName === current.roadName
    // Exact route offsets and exact official-road geometry endpoints are both
    // required. A tolerance here could join nearby but distinct traversals.
    && previous.endDistanceM === current.startDistanceM
    && samePoint(previousEndPoint, currentStartPoint)
    && metricMatches(
      current.endDistanceM - previous.startDistanceM,
      combinedDistanceM,
      PORTION_METRIC_TOLERANCE_M,
    )
}

function copyPortions(
  portions: unknown,
  routeDistanceM: number,
  bounds: { sectionCount: number; pointCount: number },
  strictKeys = false,
): RouteSectionsOfficialRoadPortionV1[] | null {
  if (!Array.isArray(portions)) return null
  const result: RouteSectionsOfficialRoadPortionV1[] = []
  let previousStartDistanceM = -1

  for (const rawPortion of portions) {
    if (!isPlainRecord(rawPortion) || (strictKeys && !hasOnlyKeys(rawPortion, [
      'startDistanceM',
      'endDistanceM',
      'distanceM',
      'geometry',
      'roadNumber',
      'roadName',
    ]))) return null
    const portion = rawPortion as RouteSectionsEvidencePortionInput
    bounds.sectionCount += 1
    if (bounds.sectionCount > ROUTE_SECTIONS_MAX_SECTION_COUNT) return null
    if (
      !finiteDistance(portion.startDistanceM)
      || !finiteDistance(portion.endDistanceM)
      || !finiteDistance(portion.distanceM)
      || portion.distanceM <= 0
      || portion.endDistanceM <= portion.startDistanceM
      // Graph totals are integer metres while exact portion offsets retain
      // sub-metre source precision. Allow only the established rounding band.
      || portion.endDistanceM > routeDistanceM + INTEGER_METRIC_TOLERANCE_M
      || portion.startDistanceM < previousStartDistanceM
      || !metricMatches(
        portion.endDistanceM - portion.startDistanceM,
        portion.distanceM,
        PORTION_METRIC_TOLERANCE_M,
      )
      || !Array.isArray(portion.geometry)
      || portion.geometry.length < 2
    ) return null

    bounds.pointCount += portion.geometry.length
    if (bounds.pointCount > ROUTE_SECTIONS_MAX_GEOMETRY_POINT_COUNT) return null
    if (!portion.geometry.every(point => validPoint(point, strictKeys))) return null

    const roadNumber = copyRoadLabel(portion.roadNumber)
    const roadName = copyRoadLabel(portion.roadName)
    if (roadNumber === null || roadName === null) return null

    const copiedPortion: RouteSectionsOfficialRoadPortionV1 = {
      startDistanceM: portion.startDistanceM,
      endDistanceM: portion.endDistanceM,
      distanceM: portion.distanceM,
      geometry: portion.geometry.map(point => ({ lat: point.lat, lon: point.lon })),
      ...(roadNumber ? { roadNumber } : {}),
      ...(roadName ? { roadName } : {}),
    }
    const previousPortion = result[result.length - 1]
    if (previousPortion && canCoalescePortions(previousPortion, copiedPortion)) {
      result[result.length - 1] = {
        startDistanceM: previousPortion.startDistanceM,
        endDistanceM: copiedPortion.endDistanceM,
        // Sum the trusted portion metrics instead of recomputing from rounded
        // route offsets so presentation totals remain unchanged.
        distanceM: previousPortion.distanceM + copiedPortion.distanceM,
        geometry: [
          ...previousPortion.geometry,
          ...copiedPortion.geometry.slice(1),
        ],
        ...(roadNumber ? { roadNumber } : {}),
        ...(roadName ? { roadName } : {}),
      }
    } else {
      result.push(copiedPortion)
    }
    previousStartDistanceM = portion.startDistanceM
  }

  return result
}

function portionDistance(portions: readonly RouteSectionsOfficialRoadPortionV1[]): number {
  return portions.reduce((sum, portion) => sum + portion.distanceM, 0)
}

/**
 * Converts trusted route evidence into a strict, bounded presentation payload.
 * The function never truncates: an oversized or internally inconsistent input
 * fails closed so a partial list cannot be mistaken for complete route truth.
 */
export function buildRouteSectionsData(
  input: RouteSectionsEvidenceInput,
): RouteSectionsDataV1 | null {
  const integerMetrics = [
    input.routeDistanceM,
    input.assessedDistanceM,
    input.unassessedDistanceM,
    input.surface.pavedM,
    input.surface.gravelM,
    input.surface.mixedM,
    input.surface.unknownM,
    input.direction.authoritativeM,
    input.direction.inferredM,
    input.direction.legacyM,
  ]
  if (!integerMetrics.every(finiteNonNegativeInteger) || input.routeDistanceM <= 0) return null
  if (input.assessedDistanceM + input.unassessedDistanceM !== input.routeDistanceM) return null

  const surfaceDistanceM = input.surface.pavedM
    + input.surface.gravelM
    + input.surface.mixedM
    + input.surface.unknownM
  if (!metricMatches(surfaceDistanceM, input.assessedDistanceM, INTEGER_METRIC_TOLERANCE_M)) {
    return null
  }

  const bounds = { sectionCount: 0, pointCount: 0 }
  const gravelSections = copyPortions(input.gravelPortions, input.routeDistanceM, bounds)
  if (!gravelSections) return null
  const inferredSections = copyPortions(
    input.inferredDirectionPortions,
    input.routeDistanceM,
    bounds,
  )
  if (!inferredSections) return null

  if (Math.round(portionDistance(gravelSections)) !== input.surface.gravelM) return null

  const directionDistanceM = input.direction.authoritativeM
    + input.direction.inferredM
    + input.direction.legacyM
  const directionMetricsComplete = metricMatches(
    directionDistanceM,
    input.assessedDistanceM,
    INTEGER_METRIC_TOLERANCE_M,
  )
  const inferredPortionsComplete = Math.round(portionDistance(inferredSections))
    === input.direction.inferredM
  const directionEvidenceComplete = input.unassessedDistanceM === 0
    && input.direction.legacyM === 0
    && directionMetricsComplete
    && inferredPortionsComplete

  return {
    coverage: {
      status: input.unassessedDistanceM === 0 ? 'complete' : 'partial',
      routeDistanceM: input.routeDistanceM,
      assessedDistanceM: input.assessedDistanceM,
      unassessedDistanceM: input.unassessedDistanceM,
    },
    surface: {
      pavedM: input.surface.pavedM,
      gravelM: input.surface.gravelM,
      mixedM: input.surface.mixedM,
      unknownM: input.surface.unknownM,
      gravelSections,
    },
    direction: directionEvidenceComplete
      ? {
          status: 'verified',
          authoritativeM: input.direction.authoritativeM,
          inferredM: input.direction.inferredM,
          inferredSections,
        }
      : { status: 'unavailable' },
  }
}

function parseCoverage(value: unknown): RouteSectionsDataV1['coverage'] | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    'status',
    'routeDistanceM',
    'assessedDistanceM',
    'unassessedDistanceM',
  ])) return null
  if (
    !['complete', 'partial'].includes(String(value.status))
    || typeof value.routeDistanceM !== 'number'
    || typeof value.assessedDistanceM !== 'number'
    || typeof value.unassessedDistanceM !== 'number'
    || !finiteNonNegativeInteger(value.routeDistanceM)
    || value.routeDistanceM <= 0
    || !finiteNonNegativeInteger(value.assessedDistanceM)
    || !finiteNonNegativeInteger(value.unassessedDistanceM)
    || value.assessedDistanceM + value.unassessedDistanceM !== value.routeDistanceM
    || (value.status === 'complete') !== (value.unassessedDistanceM === 0)
  ) return null
  return {
    status: value.status as 'complete' | 'partial',
    routeDistanceM: value.routeDistanceM,
    assessedDistanceM: value.assessedDistanceM,
    unassessedDistanceM: value.unassessedDistanceM,
  }
}

/**
 * Strict client boundary for the ready sidecar response. The returned value is
 * a deep sanitized copy; callers never need to cast untrusted JSON.
 */
export function parseRouteSectionsResponse(
  value: unknown,
  expectedRouteIdentity: string,
): RouteSectionsReadyResponseV1 | null {
  if (
    !/^[a-f0-9]{64}$/.test(expectedRouteIdentity)
    || !isPlainRecord(value)
    || !hasOnlyKeys(value, [
      'status',
      'schemaVersion',
      'routeIdentity',
      'presentationHash',
      'data',
    ])
    || value.status !== 'ready'
    || value.schemaVersion !== ROUTE_SECTIONS_SCHEMA_VERSION
    || value.routeIdentity !== expectedRouteIdentity
    || typeof value.routeIdentity !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.routeIdentity)
    || typeof value.presentationHash !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(value.presentationHash)
    || !isPlainRecord(value.data)
    || !hasOnlyKeys(value.data, ['coverage', 'surface', 'direction'])
  ) return null

  const coverage = parseCoverage(value.data.coverage)
  if (!coverage) return null

  const surface = value.data.surface
  if (!isPlainRecord(surface) || !hasOnlyKeys(surface, [
    'pavedM',
    'gravelM',
    'mixedM',
    'unknownM',
    'gravelSections',
  ])) return null
  const { pavedM, gravelM, mixedM, unknownM } = surface
  if (
    typeof pavedM !== 'number'
    || typeof gravelM !== 'number'
    || typeof mixedM !== 'number'
    || typeof unknownM !== 'number'
    || ![pavedM, gravelM, mixedM, unknownM].every(finiteNonNegativeInteger)
  ) {
    return null
  }
  const surfaceDistanceM = pavedM + gravelM + mixedM + unknownM
  if (!metricMatches(surfaceDistanceM, coverage.assessedDistanceM, INTEGER_METRIC_TOLERANCE_M)) {
    return null
  }

  const bounds = { sectionCount: 0, pointCount: 0 }
  const gravelSections = copyPortions(surface.gravelSections, coverage.routeDistanceM, bounds, true)
  if (!gravelSections || Math.round(portionDistance(gravelSections)) !== gravelM) return null

  const rawDirection = value.data.direction
  if (!isPlainRecord(rawDirection) || typeof rawDirection.status !== 'string') return null
  let direction: RouteSectionsDirectionV1
  if (rawDirection.status === 'unavailable') {
    if (!hasOnlyKeys(rawDirection, ['status'])) return null
    direction = { status: 'unavailable' }
  } else if (rawDirection.status === 'verified') {
    if (!hasOnlyKeys(rawDirection, [
      'status',
      'authoritativeM',
      'inferredM',
      'inferredSections',
    ])) return null
    if (
      coverage.status !== 'complete'
      || typeof rawDirection.authoritativeM !== 'number'
      || typeof rawDirection.inferredM !== 'number'
      || !finiteNonNegativeInteger(rawDirection.authoritativeM)
      || !finiteNonNegativeInteger(rawDirection.inferredM)
      || !metricMatches(
        rawDirection.authoritativeM + rawDirection.inferredM,
        coverage.assessedDistanceM,
        INTEGER_METRIC_TOLERANCE_M,
      )
    ) return null
    const inferredSections = copyPortions(
      rawDirection.inferredSections,
      coverage.routeDistanceM,
      bounds,
      true,
    )
    if (
      !inferredSections
      || Math.round(portionDistance(inferredSections)) !== rawDirection.inferredM
    ) return null
    direction = {
      status: 'verified',
      authoritativeM: rawDirection.authoritativeM,
      inferredM: rawDirection.inferredM,
      inferredSections,
    }
  } else {
    return null
  }

  return {
    status: 'ready',
    schemaVersion: ROUTE_SECTIONS_SCHEMA_VERSION,
    routeIdentity: value.routeIdentity,
    presentationHash: value.presentationHash,
    data: {
      coverage,
      surface: {
        pavedM,
        gravelM,
        mixedM,
        unknownM,
        gravelSections,
      },
      direction,
    },
  }
}
