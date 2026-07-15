import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

const ALLOWED_FEATURES = ['umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid', 'weather-provider-vedurstofan'] as const
type FeatureKey = (typeof ALLOWED_FEATURES)[number]

function resolveFeatureKey(request: NextRequest): FeatureKey | null {
  const feature = request.nextUrl.searchParams.get('feature') ?? 'umonnun'
  if (!(ALLOWED_FEATURES as readonly string[]).includes(feature)) return null
  return feature as FeatureKey
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const featureKey = resolveFeatureKey(request)
  if (!featureKey) return NextResponse.json({ error: 'invalid feature' }, { status: 400 })

  const { data, error } = await getAdmin()
    .from('feature_access')
    .select('email, granted_at')
    .eq('feature_key', featureKey)
    .order('granted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const featureKey = resolveFeatureKey(request)
  if (!featureKey) return NextResponse.json({ error: 'invalid feature' }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const canonical = normalizeEmailForAccess(body.email)
  if (!canonical) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const { error } = await getAdmin()
    .from('feature_access')
    .insert({ feature_key: featureKey, email: canonical })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, note: 'already_granted' })
    }
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: canonical }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const featureKey = resolveFeatureKey(request)
  if (!featureKey) return NextResponse.json({ error: 'invalid feature' }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const canonical = normalizeEmailForAccess(body.email)
  if (!canonical) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const { error } = await getAdmin()
    .from('feature_access')
    .delete()
    .eq('feature_key', featureKey)
    .eq('email', canonical)

  if (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
