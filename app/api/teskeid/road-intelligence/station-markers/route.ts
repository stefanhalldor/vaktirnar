import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { stationsToGeoJson } from '@/lib/road-intelligence/stationGeoJson'

const ERROR_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] }

export async function GET() {
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

  const result = await readVegagerdinCurrentWithHistoryFallback()

  if (result.status === 'unavailable') {
    return NextResponse.json(EMPTY_COLLECTION, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  }

  const geojson = stationsToGeoJson(result.payload.measurements)

  return NextResponse.json(geojson, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
  })
}
