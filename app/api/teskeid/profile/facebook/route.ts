import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export async function POST() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await checkFeatureAccess('', user.email, 'facebook-oauth')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const facebookIdentity = user.identities?.find((i) => i.provider === 'facebook')
  if (!facebookIdentity) {
    return NextResponse.json({ error: 'Not connected' }, { status: 404 })
  }

  const { error } = await supabase.auth.unlinkIdentity(facebookIdentity)
  if (error) {
    return NextResponse.json({ error: 'Unlink failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
