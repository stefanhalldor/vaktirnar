import { NextRequest, NextResponse } from 'next/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { authorizeBookingRequest, bookingActionErrorStatus } from '@/lib/bookings/api.server'
import type { BookingActionError } from '@/lib/bookings/contracts'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import { listBookingMessages, sendBookingMessage } from '@/lib/bookings/repository.server'
import {
  bookingMessageListQuerySchema,
  bookingMessageSchema,
  bookingPublicIdSchema,
} from '@/lib/bookings/validation'

function errorResponse(error: BookingActionError) {
  return NextResponse.json(
    { error },
    { status: bookingActionErrorStatus(error), headers: BOOKING_PRIVATE_HEADERS },
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (process.env.BOOKINGS_ENABLED !== 'true') return errorResponse('not_found')
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) return errorResponse('not_found')
  const query = bookingMessageListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return errorResponse('invalid_input')
  const authorization = await authorizeBookingRequest(request, publicId.data, 'read')
  if (!authorization) return errorResponse('not_found')
  try {
    const messages = await listBookingMessages(authorization, publicId.data, query.data)
    return NextResponse.json(messages, { headers: BOOKING_PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (process.env.BOOKINGS_ENABLED !== 'true') return errorResponse('not_found')
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) return errorResponse('not_found')
  const body = await readBoundedBookingJson(request, 4_096)
  if (!body.ok) return errorResponse('invalid_input')
  const parsed = bookingMessageSchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')
  // SQL re-authorizes sending and resolves an idempotent replay before current
  // cancellation state; central read access preserves response-lost retries.
  const authorization = await authorizeBookingRequest(request, publicId.data, 'read')
  if (!authorization) return errorResponse('not_found')
  try {
    return NextResponse.json(
      await sendBookingMessage(authorization, publicId.data, parsed.data),
      { status: 201, headers: BOOKING_PRIVATE_HEADERS },
    )
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}
