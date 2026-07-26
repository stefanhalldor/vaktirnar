import { NextResponse } from 'next/server'
import { isTeskeidRouteCandidateEnabled } from '@/lib/iceland-routes/roadGraphCandidate.server'
import { refreshRoadGraphSnapshot } from '@/lib/iceland-routes/roadGraphRefresh.server'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Scheduled official-data refresh. It never handles user route coordinates and
 * returns safe aggregate metadata only. CRON_SECRET is mandatory and fail-closed.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const refreshEnabled = process.env.TESKEID_ROAD_GRAPH_REFRESH_ENABLED === 'true'
    || isTeskeidRouteCandidateEnabled()
  if (!refreshEnabled) {
    return NextResponse.json({ status: 'skipped', reason: 'routing_disabled' })
  }

  const result = await refreshRoadGraphSnapshot('cron')
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
