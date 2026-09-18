import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'
import { restaurantsGloballyEnabled } from '@/lib/restaurants/server'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!restaurantsGloballyEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const token = (await params).token
  if (!/^[0-9a-f]{64}$/i.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data, error } = await getAdmin().rpc('restaurant_resolve_qr_v1', { p_token: token.toLowerCase() })
  return error || !data ? NextResponse.json({ error: 'not_found' }, { status: 404 })
    : NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
