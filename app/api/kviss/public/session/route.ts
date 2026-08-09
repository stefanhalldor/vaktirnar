import { NextRequest, NextResponse } from 'next/server'
import { joinCodeSchema } from '@/lib/kviss/validation'
import { loadParticipantProjection } from '@/lib/kviss/repository.server'
import { digestParticipantCapability, readCapabilityCookie } from '@/lib/kviss/security.server'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (process.env.KVISS_ENABLED !== 'true') return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  const code = joinCodeSchema.safeParse(request.nextUrl.searchParams.get('code'))
  if (!code.success) return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  const token = readCapabilityCookie(request, code.data)
  if (!token) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  const projection = await loadParticipantProjection(digestParticipantCapability(token), code.data)
  if (!projection) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  return NextResponse.json(projection, { headers })
}

