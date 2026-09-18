import { NextResponse } from 'next/server'
import { assignRestaurantPreorder, readRestaurantOperations, setRestaurantOrderStatus } from '@/lib/restaurants/management.server'

export async function GET(request: Request) {
  try {
    const venueId = new URL(request.url).searchParams.get('venueId') ?? ''
    return NextResponse.json(await readRestaurantOperations(venueId), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }) }
}
export async function PATCH(request: Request) {
  try { return NextResponse.json(await setRestaurantOrderStatus(await request.json()), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }) }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await assignRestaurantPreorder(await request.json()), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }) }
}
