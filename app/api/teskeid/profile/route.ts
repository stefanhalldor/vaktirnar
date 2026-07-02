import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { z } from 'zod'

const patchSchema = z.object({
  display_name: z.string().max(200),
})

export async function GET() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const facebookAllowed = await checkFeatureAccess('', user.email, 'facebook-oauth')
  const facebookConnected = facebookAllowed
    ? (user.identities?.some((i) => i.provider === 'facebook') ?? false)
    : false

  return NextResponse.json({
    display_name: profile?.display_name ?? '',
    email: user.email,
    facebook_oauth_allowed: facebookAllowed,
    facebook_connected: facebookConnected,
  })
}

export async function PATCH(request: NextRequest) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, display_name: parsed.data.display_name })
    .select('display_name')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({
    display_name: data.display_name,
    email: user.email,
  })
}
