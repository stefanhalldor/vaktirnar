import { NextRequest, NextResponse } from 'next/server'
import { joinCodeSchema } from '@/lib/kviss/validation'
import { lookupKviss } from '@/lib/kviss/repository.server'

export async function GET(request: NextRequest) {
  if (process.env.KVISS_ENABLED !== 'true') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const parsed = joinCodeSchema.safeParse(request.nextUrl.searchParams.get('code'))
  if (!parsed.success) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const preview = await lookupKviss(parsed.data)
  if (!preview) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } })
}
