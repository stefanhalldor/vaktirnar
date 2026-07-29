import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { RouteCautionResult, RouteOption } from '@/lib/weather/provider.types'

const ENVELOPE_VERSION = 1 as const
const DEFAULT_TTL_MS = 15 * 60 * 1_000
const MAX_TTL_MS = DEFAULT_TTL_MS
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000
const SIGNING_KEY_DOMAIN = 'teskeid:route-option-envelope:v1:key'
const SIGNING_PAYLOAD_DOMAIN = 'teskeid:route-option-envelope:v1:payload\n'

const MAX_ROUTE_POINTS = 25_000
const MAX_ROUTE_LABELS = 64
const MAX_ROUTE_CAUTIONS = 64
const MAX_ROUTE_DISTANCE_M = 5_000_000
const MAX_ROUTE_DURATION_S = 7 * 24 * 60 * 60
const MAX_CANONICAL_PAYLOAD_BYTES = 4 * 1024 * 1024
const MAX_ASSESSMENT_SCOPE_ID_LENGTH = 500

export type RouteEnvelopeEndpoint = {
  lat: number
  lon: number
}

export type RouteOptionEnvelopeV1 = {
  version: typeof ENVELOPE_VERSION
  issuedAt: string
  expiresAt: string
  /** Opaque server-issued assessment attestation; never contains navigation coordinates. */
  assessmentScopeId?: string
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
  route: RouteOption
  signature: string
}

type EnvelopePayloadV1 = Omit<RouteOptionEnvelopeV1, 'signature'>

type SignRouteOptionEnvelopeInput = {
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
  route: RouteOption
  assessmentScopeId?: string
}

type ExpectedRouteEnvelopeEndpoints = {
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
  /**
   * String requires an exact scope claim; null requires a legacy/unscoped
   * envelope; undefined keeps compatibility for callers that do not care.
   */
  assessmentScopeId?: string | null
}

type SignRouteOptionEnvelopeOptions = {
  now?: Date
  ttlMs?: number
}

type VerifyRouteOptionEnvelopeOptions = {
  now?: Date
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === 'string'
    && value.length <= maxLength
    && (allowEmpty || value.length > 0)
}

function isAssessmentScopeId(value: unknown): value is string {
  return isBoundedString(value, MAX_ASSESSMENT_SCOPE_ID_LENGTH)
    && value.trim() === value
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
}

function isEndpoint(value: unknown): value is RouteEnvelopeEndpoint {
  return isPlainRecord(value)
    && hasOnlyKeys(value, ['lat', 'lon'])
    && isBoundedNumber(value.lat, -90, 90)
    && isBoundedNumber(value.lon, -180, 180)
}

function isRoutePointArray(value: unknown): value is RouteOption['points'] {
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= MAX_ROUTE_POINTS
    && value.every(isEndpoint)
}

function isRouteCaution(value: unknown): value is RouteCautionResult {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    'id',
    'severity',
    'labelKey',
    'summaryKey',
    'detailKey',
    'appliesTo',
  ])) return false

  if (!isBoundedString(value.id, 256) || !isBoundedString(value.labelKey, 256)) return false
  if (!['info', 'caution', 'warning'].includes(value.severity as string)) return false
  if (value.summaryKey !== undefined && !isBoundedString(value.summaryKey, 256)) return false
  if (value.detailKey !== undefined && !isBoundedString(value.detailKey, 256)) return false
  if (!Array.isArray(value.appliesTo) || value.appliesTo.length > 4) return false
  return value.appliesTo.every(vehicle => ['trailer', 'caravan', 'camper', 'all'].includes(vehicle))
}

function isExperimentalRouteMetadata(value: unknown): value is NonNullable<RouteOption['experimental']> {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ['derivedDuration', 'surface', 'fRoad'])) return false
  if (value.derivedDuration !== true || !isPlainRecord(value.surface)) return false
  const surface = value.surface
  const surfaceKeys = ['pavedM', 'gravelM', 'mixedM', 'unknownM'] as const
  if (!hasOnlyKeys(surface, surfaceKeys)) return false

  if (!surfaceKeys.every(key =>
    isBoundedNumber(surface[key], 0, MAX_ROUTE_DISTANCE_M),
  )) return false
  if (value.fRoad === undefined) return true
  if (!isPlainRecord(value.fRoad) || !hasOnlyKeys(value.fRoad, ['distanceM', 'roadNumbers'])) return false
  if (!isBoundedNumber(value.fRoad.distanceM, 0, MAX_ROUTE_DISTANCE_M)) return false
  return Array.isArray(value.fRoad.roadNumbers)
    && value.fRoad.roadNumbers.length <= 32
    && value.fRoad.roadNumbers.every(roadNumber => isBoundedString(roadNumber, 32))
}

function isRouteOption(value: unknown): value is RouteOption {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    'id',
    'routeIndex',
    'provider',
    'labels',
    'isDefault',
    'description',
    'cautions',
    'experimental',
    'points',
    'providerMatchingPoints',
    'distanceM',
    'durationS',
  ])) return false

  if (!isBoundedString(value.id, 256)) return false
  if (!Number.isInteger(value.routeIndex) || !isBoundedNumber(value.routeIndex, -10_000, 10_000)) return false
  if (!['google', 'mapbox', 'teskeid'].includes(value.provider as string)) return false
  if (typeof value.isDefault !== 'boolean') return false
  if (!Array.isArray(value.labels) || value.labels.length > MAX_ROUTE_LABELS) return false
  if (!value.labels.every(label => isBoundedString(label, 256))) return false
  if (value.description !== undefined && !isBoundedString(value.description, 2_048, true)) return false
  if (!isRoutePointArray(value.points)) return false
  if (value.providerMatchingPoints !== undefined && !isRoutePointArray(value.providerMatchingPoints)) return false
  if (!isBoundedNumber(value.distanceM, 0, MAX_ROUTE_DISTANCE_M)) return false
  if (!isBoundedNumber(value.durationS, 0, MAX_ROUTE_DURATION_S)) return false
  if (value.cautions !== undefined) {
    if (!Array.isArray(value.cautions) || value.cautions.length > MAX_ROUTE_CAUTIONS) return false
    if (!value.cautions.every(isRouteCaution)) return false
  }
  if (value.experimental !== undefined && !isExperimentalRouteMetadata(value.experimental)) return false

  return true
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Envelope contains a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isPlainRecord(value)) {
    const entries = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  throw new Error('Envelope contains a non-JSON value')
}

function getSigningKey(): Buffer {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret) throw new Error('AUTH_CODE_SECRET is not configured')
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_CODE_SECRET must be at least 32 bytes')
  }
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(SIGNING_KEY_DOMAIN, 'utf8')
    .digest()
}

function payloadSignature(payload: EnvelopePayloadV1): string {
  const canonicalPayload = canonicalJson(payload)
  if (Buffer.byteLength(canonicalPayload, 'utf8') > MAX_CANONICAL_PAYLOAD_BYTES) {
    throw new Error('Route option envelope payload is too large')
  }
  return createHmac('sha256', getSigningKey())
    .update(SIGNING_PAYLOAD_DOMAIN, 'utf8')
    .update(canonicalPayload, 'utf8')
    .digest('hex')
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (!isBoundedString(value, 32)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function isEnvelope(value: unknown): value is RouteOptionEnvelopeV1 {
  return isPlainRecord(value)
    && hasOnlyKeys(value, [
      'version',
      'issuedAt',
      'expiresAt',
      'assessmentScopeId',
      'origin',
      'destination',
      'route',
      'signature',
    ])
    && value.version === ENVELOPE_VERSION
    && isCanonicalIsoDate(value.issuedAt)
    && isCanonicalIsoDate(value.expiresAt)
    && (value.assessmentScopeId === undefined || isAssessmentScopeId(value.assessmentScopeId))
    && isEndpoint(value.origin)
    && isEndpoint(value.destination)
    && isRouteOption(value.route)
    && typeof value.signature === 'string'
    && /^[a-f0-9]{64}$/.test(value.signature)
}

function validDate(value: Date | undefined): Date {
  const date = value ?? new Date()
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid envelope time')
  return date
}

function endpointsMatch(actual: RouteEnvelopeEndpoint, expected: RouteEnvelopeEndpoint): boolean {
  return actual.lat === expected.lat && actual.lon === expected.lon
}

export function signRouteOptionEnvelope(
  input: SignRouteOptionEnvelopeInput,
  options: SignRouteOptionEnvelopeOptions = {},
): RouteOptionEnvelopeV1 {
  if (
    !isEndpoint(input.origin)
    || !isEndpoint(input.destination)
    || !isRouteOption(input.route)
    || (input.assessmentScopeId !== undefined && !isAssessmentScopeId(input.assessmentScopeId))
  ) {
    throw new Error('Invalid route option envelope input')
  }

  const now = validDate(options.now)
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new Error('Route option envelope TTL must be between 1 ms and 15 minutes')
  }

  const payload: EnvelopePayloadV1 = {
    version: ENVELOPE_VERSION,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    ...(input.assessmentScopeId ? { assessmentScopeId: input.assessmentScopeId } : {}),
    origin: { lat: input.origin.lat, lon: input.origin.lon },
    destination: { lat: input.destination.lat, lon: input.destination.lon },
    route: input.route,
  }

  return { ...payload, signature: payloadSignature(payload) }
}

export function verifyRouteOptionEnvelope(
  value: unknown,
  expected: ExpectedRouteEnvelopeEndpoints,
  options: VerifyRouteOptionEnvelopeOptions = {},
): RouteOptionEnvelopeV1 | null {
  try {
    if (!isEnvelope(value) || !isEndpoint(expected.origin) || !isEndpoint(expected.destination)) return null
    if (expected.assessmentScopeId === null && value.assessmentScopeId !== undefined) return null
    if (
      typeof expected.assessmentScopeId === 'string'
      && (
        !isAssessmentScopeId(expected.assessmentScopeId)
        || value.assessmentScopeId !== expected.assessmentScopeId
      )
    ) return null
    if (!endpointsMatch(value.origin, expected.origin)) return null
    if (!endpointsMatch(value.destination, expected.destination)) return null

    const nowMs = validDate(options.now).getTime()
    const issuedAtMs = Date.parse(value.issuedAt)
    const expiresAtMs = Date.parse(value.expiresAt)
    if (issuedAtMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) return null
    if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_TTL_MS) return null
    if (expiresAtMs <= nowMs) return null

    const { signature, ...payload } = value
    const expectedSignature = Buffer.from(payloadSignature(payload), 'hex')
    const receivedSignature = Buffer.from(signature, 'hex')
    if (receivedSignature.length !== expectedSignature.length) return null
    if (!timingSafeEqual(receivedSignature, expectedSignature)) return null

    return value
  } catch {
    return null
  }
}
