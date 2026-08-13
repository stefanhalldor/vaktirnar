import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const [kviss, advertiser, bookings] = await Promise.all([
    checkFeatureAccess(user.id, user.email, 'kviss'),
    checkFeatureAccess(user.id, user.email, 'auglysandi'),
    checkFeatureAccess(user.id, user.email, 'bokanir'),
  ])
  return NextResponse.json({ kviss, advertiser, bookings }, { headers })
}
