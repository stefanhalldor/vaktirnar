import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { projectVedurstofanCacheToProductTables } from '@/lib/weather/providers/vedurstofan.server'

export async function POST() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  try {
    const result = await projectVedurstofanCacheToProductTables()
    return NextResponse.json(result)
  } catch {
    console.error('[admin/weather/project-vedurstofan] unexpected error')
    return NextResponse.json({ error: 'Projection failed' }, { status: 500 })
  }
}
