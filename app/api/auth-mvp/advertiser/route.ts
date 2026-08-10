import { NextRequest, NextResponse } from 'next/server'
import { requireAdvertiserOwnerApi } from '@/lib/advertiser/access.server'
import { advertiserMutationSchema } from '@/lib/advertiser/validation'
import { readBoundedAdvertiserJson } from '@/lib/advertiser/http.server'
import {
  loadAdvertiserWorkspace,
  transitionAdvertiserCreative,
  upsertAdvertiserCreative,
  upsertBusinessProfile,
} from '@/lib/advertiser/repository.server'

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function GET() {
  const access = await requireAdvertiserOwnerApi()
  if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: access.status, headers: HEADERS })
  try {
    return NextResponse.json(await loadAdvertiserWorkspace(access.spaceId), { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdvertiserOwnerApi()
  if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: access.status, headers: HEADERS })
  const body = await readBoundedAdvertiserJson(request, 16_384)
  if (!body.ok) return NextResponse.json({ error: 'invalid_request' }, { status: body.status, headers: HEADERS })
  const parsed = advertiserMutationSchema.safeParse(body.value)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: HEADERS })
  try {
    if (parsed.data.action === 'upsertProfile') {
      await upsertBusinessProfile(access.user.id, access.spaceId, parsed.data)
    } else if (parsed.data.action === 'upsertCreative') {
      await upsertAdvertiserCreative(access.user.id, access.spaceId, parsed.data)
    } else {
      await transitionAdvertiserCreative(access.user.id, access.spaceId, parsed.data)
    }
    return NextResponse.json({ ok: true }, { headers: HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message.includes('revision_conflict') || message.includes('idempotency_conflict')
      ? 409
      : message.includes('not_found')
        ? 404
        : 400
    return NextResponse.json({ error: status === 409 ? 'conflict' : 'invalid_request' }, { status, headers: HEADERS })
  }
}
