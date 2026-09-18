import { NextResponse } from 'next/server'
import { enableRestaurantCapability, mutateRestaurantOwner } from '@/lib/restaurants/management.server'

export async function POST(request: Request) {
  try { return NextResponse.json(await enableRestaurantCapability(await request.json()), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }) }
}
export async function PATCH(request: Request) {
  try { return NextResponse.json(await mutateRestaurantOwner(await request.json()), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }) }
}
