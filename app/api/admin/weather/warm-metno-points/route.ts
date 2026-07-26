import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { warmAllRoadMapPlaceMetnoHistory } from '@/lib/weather/weatherChaseHistory.server'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error
  try {
    const result = await warmAllRoadMapPlaceMetnoHistory()
    const complete = result.succeeded === result.total && result.failed === 0
    return NextResponse.json({ status: complete ? 'ok' : 'error', ...result }, {
      status: complete ? 200 : 503,
    })
  } catch {
    console.error('[admin/weather/warm-metno-points] unexpected error')
    return NextResponse.json({ status: 'error', total: 0, succeeded: 0, failed: 0 }, { status: 500 })
  }
}
