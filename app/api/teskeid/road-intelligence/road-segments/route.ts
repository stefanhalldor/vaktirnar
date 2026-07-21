import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import {
  buildVegagerdinSegmentsQueryUrl,
  isAllowedSegmentsContentType,
  normalizeVegagerdinRoadSegmentGeoJson,
  parseSegmentsBboxRequest,
} from '@/lib/road-intelligence/vegagerdinSegments'

const ERROR_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const GEOJSON_HEADERS = {
  // Road segment data changes slowly; 5-minute cache with 30-minute stale is appropriate.
  'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800',
  'Content-Type': 'application/geo+json',
  'X-Content-Type-Options': 'nosniff',
}

export async function GET(request: NextRequest) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: ERROR_HEADERS })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: ERROR_HEADERS })
  }

  const hasRoadIntelligence = await checkFeatureAccess(
    user.id,
    user.email,
    'road-intelligence-v1',
  ).catch(() => false)

  if (!hasRoadIntelligence) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: ERROR_HEADERS })
  }

  const parsed = parseSegmentsBboxRequest(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: ERROR_HEADERS })
  }

  const upstreamUrl = buildVegagerdinSegmentsQueryUrl(parsed.bbox)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/geo+json,application/json;q=0.9' },
    })
  } catch {
    return NextResponse.json(
      { error: 'upstream_unreachable' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  const contentType = upstreamResponse.headers.get('Content-Type')
  if (!upstreamResponse.ok || !isAllowedSegmentsContentType(contentType)) {
    return NextResponse.json(
      { error: 'upstream_unavailable' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  let geojson: unknown
  try {
    geojson = await upstreamResponse.json()
  } catch {
    return NextResponse.json(
      { error: 'upstream_invalid_response' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  // Validate minimal GeoJSON shape, enforce feature cap, and attach Teskeið-owned
  // road-condition properties used by the prototype line styling.
  const normalized = normalizeVegagerdinRoadSegmentGeoJson(geojson)
  if (!normalized.ok) {
    return NextResponse.json(
      { error: 'upstream_invalid_response' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  return NextResponse.json(normalized.geojson, { status: 200, headers: GEOJSON_HEADERS })
}
