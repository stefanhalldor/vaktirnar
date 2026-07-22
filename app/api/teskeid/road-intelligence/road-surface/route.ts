import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import {
  buildVegagerdinRoadSurfaceQueryUrl,
  isAllowedRoadSurfaceContentType,
  normalizeVegagerdinRoadSurfaceGeoJson,
  parseRoadSurfaceBboxRequest,
} from '@/lib/road-intelligence/vegagerdinRoadSurface'

const ERROR_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const GEOJSON_HEADERS = {
  // Road surface changes slowly; keep browser fetches short-lived while avoiding
  // repeated upstream calls during map-route experiments.
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

  const parsed = parseRoadSurfaceBboxRequest(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: ERROR_HEADERS })
  }

  const upstreamUrl = buildVegagerdinRoadSurfaceQueryUrl(parsed.bbox)

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
  if (!upstreamResponse.ok || !isAllowedRoadSurfaceContentType(contentType)) {
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

  const normalized = normalizeVegagerdinRoadSurfaceGeoJson(geojson)
  if (!normalized.ok) {
    return NextResponse.json(
      { error: 'upstream_invalid_response' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  return NextResponse.json(normalized.geojson, { status: 200, headers: GEOJSON_HEADERS })
}
