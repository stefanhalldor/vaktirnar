import { NextResponse } from 'next/server'
import { readPublicMenu } from '@/lib/restaurants/server'

export async function GET(_request: Request, { params }: { params: Promise<{ venueSlug: string }> }) {
  const menu = await readPublicMenu((await params).venueSlug)
  return menu ? NextResponse.json(menu, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } })
    : NextResponse.json({ error: 'not_found' }, { status: 404 })
}
