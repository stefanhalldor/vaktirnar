import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getWeatherEnabledMode,
  resolveWeatherBaseAccess,
} from '@/lib/weather/weatherBaseAccess.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'
import { buildIcelandRoadGraphRouteFromEdges } from '@/lib/iceland-routes/roadGraph'
import { isTeskeidRouteCandidateEnabled } from '@/lib/iceland-routes/roadGraphCandidate.server'
import { getIcelandRoadGraph } from '@/lib/iceland-routes/roadGraphRuntime.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  teskeidAssessmentEvidenceMatchesSignedRoute,
} from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import {
  parseTeskeidAssessmentAlternativeRouteId,
  TESKEID_ROUTE_CANDIDATE_ID,
} from '@/lib/iceland-routes/routeAssessmentCandidateIdentity.server'
import {
  verifyRouteOptionEnvelope,
  type RouteEnvelopeEndpoint,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { restoreRouteOptionEvidence } from '@/lib/iceland-routes/routeOptionEvidence.server'
import {
  buildRouteSectionsData,
  routeSectionsPresentationHashPayload,
  ROUTE_SECTIONS_SCHEMA_VERSION,
  type RouteSectionsReadyResponseV1,
} from '@/lib/iceland-routes/routeSections'

const MAX_REQUEST_BYTES = 4_718_592
const MAX_RESPONSE_BYTES = 2_097_152
const EVIDENCE_BUDGET_MS = 5_000
const DEADLINE_EXCEEDED = Symbol('route-sections-deadline-exceeded')
const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; tooLarge: boolean }

function jsonResponse(body: unknown, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function pendingResponse(routeIdentity: string): NextResponse {
  return jsonResponse({ status: 'pending', routeIdentity }, 202)
}

async function settleBeforeDeadline<T>(
  promise: Promise<T>,
  deadlineAtMs: number,
): Promise<T | typeof DEADLINE_EXCEEDED> {
  const remainingMs = Math.max(0, deadlineAtMs - Date.now())
  if (remainingMs === 0) return DEADLINE_EXCEEDED

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<typeof DEADLINE_EXCEEDED>(resolve => {
        timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), remainingMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function endpoint(value: unknown): RouteEnvelopeEndpoint | null {
  if (!isPlainRecord(value)) return null
  return typeof value.lat === 'number' && typeof value.lon === 'number'
    ? { lat: value.lat, lon: value.lon }
    : null
}

function envelopeExpectations(value: unknown): {
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
  assessmentScopeId: string
} | null {
  if (!isPlainRecord(value) || typeof value.assessmentScopeId !== 'string') return null
  const origin = endpoint(value.origin)
  const destination = endpoint(value.destination)
  if (!origin || !destination) return null
  return { origin, destination, assessmentScopeId: value.assessmentScopeId }
}

async function readBoundedJson(request: Request): Promise<BoundedJsonResult> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (!Number.isInteger(parsedLength) || parsedLength < 0) return { ok: false, tooLarge: false }
    if (parsedLength > MAX_REQUEST_BYTES) return { ok: false, tooLarge: true }
  }
  if (!request.body) return { ok: false, tooLarge: false }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel()
        return { ok: false, tooLarge: true }
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, tooLarge: false }
  } finally {
    reader.releaseLock()
  }
}

function exactSurfaceMatch(
  signed: { pavedM: number; gravelM: number; mixedM: number; unknownM: number },
  regenerated: { pavedM: number; gravelM: number; mixedM: number; unknownM: number },
): boolean {
  return signed.pavedM === regenerated.pavedM
    && signed.gravelM === regenerated.gravelM
    && signed.mixedM === regenerated.mixedM
    && signed.unknownM === regenerated.unknownM
}

function presentationHash(
  routeIdentity: string,
  data: RouteSectionsReadyResponseV1['data'],
): string {
  return createHash('sha256')
    .update(routeSectionsPresentationHashPayload(routeIdentity, data), 'utf8')
    .digest('base64url')
}

export async function POST(request: Request) {
  if (
    process.env.AUTH_MVP_ENABLED !== 'true'
    || getWeatherEnabledMode() === 'off'
    || !isTeskeidRouteCandidateEnabled()
  ) {
    return jsonResponse({ status: 'unavailable' }, 404)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') return jsonResponse({ status: 'unavailable' }, 401)

  const hasAuthenticatedIdentity = Boolean(user?.id && user.email)
  if (access.mode === 'public' && !hasAuthenticatedIdentity) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')?.trim()
      ?? ''
    // Charge the anonymous budget before body buffering and HMAC work. Invalid
    // envelopes must not provide an unmetered CPU/memory path.
    const withinLimit = await checkWeatherGuestRateLimit(ip, 'teskeid-candidate')
    if (!withinLimit) return jsonResponse({ status: 'unavailable' }, 429)
  }

  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase() ?? ''
  if (contentType !== 'application/json') {
    return jsonResponse({ status: 'invalid_request' }, 400)
  }
  const parsedBody = await readBoundedJson(request)
  if (!parsedBody.ok) {
    return jsonResponse(
      { status: 'invalid_request' },
      parsedBody.tooLarge ? 413 : 400,
    )
  }
  if (
    !isPlainRecord(parsedBody.value)
    || Object.keys(parsedBody.value).length !== 1
    || !Object.prototype.hasOwnProperty.call(parsedBody.value, 'routeEnvelope')
  ) {
    return jsonResponse({ status: 'invalid_request' }, 400)
  }

  const rawEnvelope = parsedBody.value.routeEnvelope
  const expectations = envelopeExpectations(rawEnvelope)
  if (!expectations) return jsonResponse({ status: 'invalid_route' }, 422)
  const verifiedEnvelope = verifyRouteOptionEnvelope(rawEnvelope, expectations)
  if (
    !verifiedEnvelope
    || verifiedEnvelope.route.provider !== 'teskeid'
    || !verifiedEnvelope.route.experimental
  ) {
    return jsonResponse({ status: 'invalid_route' }, 422)
  }

  const isPrimary = verifiedEnvelope.route.id === TESKEID_ROUTE_CANDIDATE_ID
  const alternativeIdentity = isPrimary
    ? null
    : parseTeskeidAssessmentAlternativeRouteId(verifiedEnvelope.route.id)
  if (!isPrimary && !alternativeIdentity) {
    return jsonResponse({ status: 'invalid_route' }, 422)
  }
  if (
    verifiedEnvelope.routeEvidence
    && alternativeIdentity
    && verifiedEnvelope.routeEvidence.routeProvenanceFingerprint
      !== alternativeIdentity.routeProvenanceFingerprint
  ) {
    return jsonResponse({ status: 'invalid_route' }, 422)
  }

  try {
    const evidenceDeadlineAtMs = Date.now() + EVIDENCE_BUDGET_MS
    const graph = await settleBeforeDeadline(
      getIcelandRoadGraph(),
      evidenceDeadlineAtMs,
    )
    if (graph === DEADLINE_EXCEEDED) {
      return pendingResponse(verifiedEnvelope.signature)
    }
    let regeneratedRoute: ReturnType<typeof buildIcelandRoadGraphRouteFromEdges>
    if (verifiedEnvelope.routeEvidence) {
      const restored = restoreRouteOptionEvidence({
        graph,
        claim: verifiedEnvelope.routeEvidence,
        origin: verifiedEnvelope.origin,
        destination: verifiedEnvelope.destination,
      })
      if (!restored) return jsonResponse({ status: 'unavailable' }, 409)
      regeneratedRoute = restored.route
    } else {
      // Backward-compatible path for already-issued v1 envelopes. Newly
      // signed scoped Teskeið envelopes carry bounded evidence and avoid this
      // full primary/alternative search.
      const evidence = resolveTeskeidAssessmentRouteEvidence({
        graph,
        origin: verifiedEnvelope.origin,
        destination: verifiedEnvelope.destination,
        assessmentScopeId: verifiedEnvelope.assessmentScopeId!,
        includeAlternatives: Boolean(alternativeIdentity),
        deadlineAtMs: evidenceDeadlineAtMs,
        ...(alternativeIdentity
          ? { alternativeDeadlineAtMs: evidenceDeadlineAtMs }
          : {}),
      })
      if (evidence.status === 'incomplete') {
        return pendingResponse(verifiedEnvelope.signature)
      }
      if (evidence.status !== 'ready') {
        return jsonResponse({ status: 'unavailable' }, 409)
      }

      const selectedEvidence = evidence.evidence.find(candidate => (
        teskeidAssessmentEvidenceMatchesSignedRoute(candidate, verifiedEnvelope.route)
      ))
      if (!selectedEvidence) return jsonResponse({ status: 'unavailable' }, 409)
      regeneratedRoute = buildIcelandRoadGraphRouteFromEdges(
        selectedEvidence.connectedRoadEdges,
      )
    }
    if (
      regeneratedRoute.distanceM !== verifiedEnvelope.route.distanceM
      || regeneratedRoute.durationS !== verifiedEnvelope.route.durationS
    ) {
      return jsonResponse({ status: 'unavailable' }, 409)
    }
    if (!exactSurfaceMatch(
      verifiedEnvelope.route.experimental.surface,
      regeneratedRoute.surface,
    )) {
      return jsonResponse({ status: 'unavailable' }, 409)
    }

    const data = buildRouteSectionsData({
      routeDistanceM: regeneratedRoute.distanceM,
      assessedDistanceM: regeneratedRoute.assessedDistanceM,
      unassessedDistanceM: regeneratedRoute.unassessedConnectorDistanceM,
      surface: regeneratedRoute.surface,
      direction: {
        authoritativeM: regeneratedRoute.authoritativeDirectionDistanceM,
        inferredM: regeneratedRoute.inferredDirectionDistanceM,
        legacyM: regeneratedRoute.legacyDirectionDistanceM,
      },
      gravelPortions: regeneratedRoute.gravelPortions.map(portion => ({
        startDistanceM: portion.startDistanceM,
        endDistanceM: portion.endDistanceM,
        distanceM: portion.distanceM,
        geometry: portion.geometry,
        ...(portion.roadNumber ? { roadNumber: portion.roadNumber } : {}),
        ...(portion.roadName ? { roadName: portion.roadName } : {}),
      })),
      inferredDirectionPortions: regeneratedRoute.inferredDirectionPortions.map(portion => ({
        startDistanceM: portion.startDistanceM,
        endDistanceM: portion.endDistanceM,
        distanceM: portion.distanceM,
        geometry: portion.geometry,
        ...(portion.roadNumber ? { roadNumber: portion.roadNumber } : {}),
        ...(portion.roadName ? { roadName: portion.roadName } : {}),
      })),
    })
    if (!data) return jsonResponse({ status: 'unavailable' }, 503)

    const response: RouteSectionsReadyResponseV1 = {
      status: 'ready',
      schemaVersion: ROUTE_SECTIONS_SCHEMA_VERSION,
      routeIdentity: verifiedEnvelope.signature,
      presentationHash: presentationHash(verifiedEnvelope.signature, data),
      data,
    }
    if (new TextEncoder().encode(JSON.stringify(response)).byteLength > MAX_RESPONSE_BYTES) {
      return jsonResponse({ status: 'unavailable' }, 503)
    }
    return jsonResponse(response)
  } catch {
    return jsonResponse({ status: 'unavailable' }, 503)
  }
}
