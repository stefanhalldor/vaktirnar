import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { refreshRoadGraphSnapshot } from '@/lib/iceland-routes/roadGraphRefresh.server'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Manual bootstrap/refresh for an authenticated Teskeið admin. */
export async function POST() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const result = await refreshRoadGraphSnapshot('admin')
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
