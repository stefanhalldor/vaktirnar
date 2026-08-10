import { NextRequest, NextResponse } from 'next/server'
import { advertiserReviewSchema } from '@/lib/advertiser/validation'
import { readBoundedAdvertiserJson } from '@/lib/advertiser/http.server'
import { loadPendingAdvertiserReviews, reviewAdvertiserCreative } from '@/lib/advertiser/repository.server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function GET() {
  if (process.env.ADVERTISER_ENABLED !== 'true') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: HEADERS })
  const auth = await requireAdmin(await createClient())
  if (!auth.user) return auth.error
  try {
    return NextResponse.json({ creatives: await loadPendingAdvertiserReviews() }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  if (process.env.ADVERTISER_ENABLED !== 'true') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: HEADERS })
  const auth = await requireAdmin(await createClient())
  if (!auth.user) return auth.error
  const body = await readBoundedAdvertiserJson(request, 4_096)
  if (!body.ok) return NextResponse.json({ error: 'invalid_request' }, { status: body.status, headers: HEADERS })
  const parsed = advertiserReviewSchema.safeParse(body.value)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: HEADERS })
  try {
    await reviewAdvertiserCreative(auth.user.id, parsed.data)
    return NextResponse.json({ ok: true }, { headers: HEADERS })
  } catch (error) {
    const conflict = error instanceof Error
      && (error.message.includes('revision_conflict') || error.message.includes('idempotency_conflict'))
    return NextResponse.json({ error: conflict ? 'conflict' : 'invalid_request' }, { status: conflict ? 409 : 400, headers: HEADERS })
  }
}
