import { NextRequest, NextResponse } from 'next/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { bookingActionErrorStatus } from '@/lib/bookings/api.server'
import { establishBookingCapabilitySession } from '@/lib/bookings/capability-session.server'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import {
  digestBookingToken,
  setBookingSessionCookie,
} from '@/lib/bookings/security.server'
import {
  bookingPublicIdSchema,
  exchangeBookingCapabilitySchema,
} from '@/lib/bookings/validation'

function errorResponse(error: ReturnType<typeof mapBookingError>) {
  return NextResponse.json(
    { error },
    { status: bookingActionErrorStatus(error), headers: BOOKING_PRIVATE_HEADERS },
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (process.env.BOOKINGS_ENABLED !== 'true') return errorResponse('not_found')
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) return errorResponse('not_found')
  const body = await readBoundedBookingJson(request, 2_048)
  if (!body.ok) {
    return NextResponse.json(
      { error: 'invalid_input' },
      { status: body.status, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  const parsed = exchangeBookingCapabilitySchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')
  try {
    const session = await establishBookingCapabilitySession({
      request,
      publicId: publicId.data,
      capabilityDigest: digestBookingToken(parsed.data.capability),
    })
    const response = NextResponse.json(
      { ok: true, publicId: publicId.data, accessVersion: session.accessVersion },
      { headers: BOOKING_PRIVATE_HEADERS },
    )
    setBookingSessionCookie(response, publicId.data, session.token)
    return response
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}
