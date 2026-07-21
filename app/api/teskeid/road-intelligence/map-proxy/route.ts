import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import {
  buildVegagerdinMapExportUrl,
  isAllowedVegagerdinMapContentType,
  parseRoadIntelligenceMapProxyRequest,
} from '@/lib/road-intelligence/vegagerdinMapProxy'

const ERROR_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const TILE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
  'Content-Type': 'image/png',
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

  const parsed = parseRoadIntelligenceMapProxyRequest(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: ERROR_HEADERS })
  }

  const upstreamUrl = buildVegagerdinMapExportUrl(parsed.sourceId, parsed.bbox)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      cache: 'no-store',
      headers: { Accept: 'image/png,image/*;q=0.9,*/*;q=0.1' },
    })
  } catch {
    return NextResponse.json(
      { error: 'upstream_unreachable' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  const contentType = upstreamResponse.headers.get('Content-Type')
  if (!upstreamResponse.ok || !isAllowedVegagerdinMapContentType(contentType)) {
    return NextResponse.json(
      { error: 'upstream_unavailable' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }

  const tile = await upstreamResponse.arrayBuffer()
  return new NextResponse(tile, { status: 200, headers: TILE_HEADERS })
}
