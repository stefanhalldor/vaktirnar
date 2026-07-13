import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { warmVedurstofanForecastCache } from '@/lib/weather/providers/vedurstofan.server'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  try {
    const result = await warmVedurstofanForecastCache()
    return NextResponse.json(result)
  } catch {
    console.error('[admin/weather/warm-vedurstofan] unexpected error')
    return NextResponse.json({ error: 'Warming failed' }, { status: 500 })
  }
}
