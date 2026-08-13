import { NextRequest, NextResponse } from 'next/server'
import { bookingActionErrorStatus } from '@/lib/bookings/api.server'
import { BOOKING_PRIVATE_HEADERS } from '@/lib/bookings/http.server'
import { loadBookingDetail } from '@/lib/bookings/repository.server'
import { bookingSessionDigestFromRequest } from '@/lib/bookings/security.server'
import { bookingPublicIdSchema } from '@/lib/bookings/validation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (process.env.BOOKINGS_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'not_found' },
      { status: bookingActionErrorStatus('not_found'), headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  const detail = await loadBookingDetail({
    publicId: publicId.data,
    sessionHash: bookingSessionDigestFromRequest(request, publicId.data),
  })
  if (!detail) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  return NextResponse.json(detail, { headers: BOOKING_PRIVATE_HEADERS })
}
