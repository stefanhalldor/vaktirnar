import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTeskeidLauncherVisibility } from '@/lib/teskeid/launcher.server'

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const visible = new Set(await resolveTeskeidLauncherVisibility(user))
  return NextResponse.json({
    kviss: visible.has('kviss'),
    advertiser: visible.has('auglysandi'),
    bookings: visible.has('bokanir'),
  }, { headers })
}
