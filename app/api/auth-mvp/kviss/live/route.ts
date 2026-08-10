import { NextRequest, NextResponse } from 'next/server'
import { requireKvissCreatorApi } from '@/lib/kviss/access.server'
import { loadKvissHostProjection } from '@/lib/kviss/repository.server'
import { hostLiveQuerySchema } from '@/lib/kviss/validation'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  const access = await requireKvissCreatorApi()
  if (!access.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: access.status, headers: NO_STORE })
  }

  const searchParams = request.nextUrl.searchParams
  const hasExactParameterSet = searchParams.getAll('sessionId').length === 1
    && [...searchParams.keys()].every(key => key === 'sessionId')
  const parsed = hasExactParameterSet
    ? hostLiveQuerySchema.safeParse({ sessionId: searchParams.get('sessionId') })
    : null
  if (!parsed?.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  try {
    const projection = await loadKvissHostProjection(
      access.user.id,
      access.spaceId,
      parsed.data.sessionId,
    )
    if (!projection) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    }
    return NextResponse.json(projection, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
