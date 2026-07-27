import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { refreshHmsPlaceDirectory } from '@/lib/places/hmsImport.server'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Manual bootstrap/refresh after the HMS migration and reuse review are complete. */
export async function POST() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error
  if (process.env.HMS_PLACE_DIRECTORY_REFRESH_ENABLED !== 'true') {
    return NextResponse.json({ status: 'skipped', reason: 'refresh_disabled' })
  }

  const result = await refreshHmsPlaceDirectory('admin')
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
