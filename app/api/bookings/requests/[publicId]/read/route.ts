import { NextRequest, NextResponse } from 'next/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { authorizeBookingRequest, bookingActionErrorStatus } from '@/lib/bookings/api.server'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import { bookingPublicIdSchema, bookingReadSchema } from '@/lib/bookings/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const notFound = () => NextResponse.json(
    { error: 'not_found' },
    { status: bookingActionErrorStatus('not_found'), headers: BOOKING_PRIVATE_HEADERS },
  )
  if (process.env.BOOKINGS_ENABLED !== 'true') return notFound()
  if (!assertSameOriginJsonMutation(request)) {
    return NextResponse.json(
      { error: 'invalid_input' },
      { status: 400, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) return notFound()
  const body = await readBoundedBookingJson(request, 2_048)
  if (!body.ok || !bookingReadSchema.safeParse(body.value).success) {
    return NextResponse.json(
      { error: 'invalid_input' },
      { status: 400, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  if (!await authorizeBookingRequest(request, publicId.data, 'read')) return notFound()
  return new NextResponse(null, { status: 204, headers: BOOKING_PRIVATE_HEADERS })
}
