import { NextResponse } from 'next/server'
import { refreshHmsPlaceDirectory } from '@/lib/places/hmsImport.server'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Weekly refresh of the public HMS address directory; fail-closed by default. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (process.env.HMS_PLACE_DIRECTORY_REFRESH_ENABLED !== 'true') {
    return NextResponse.json({ status: 'skipped', reason: 'refresh_disabled' })
  }

  const result = await refreshHmsPlaceDirectory('cron')
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
