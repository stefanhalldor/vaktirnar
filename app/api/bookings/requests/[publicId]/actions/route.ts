import { NextRequest, NextResponse } from 'next/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import {
  authorizeBookingRequest,
  bookingActionErrorStatus,
  currentBookingUser,
} from '@/lib/bookings/api.server'
import type { BookingActionError, BookingActionResult } from '@/lib/bookings/contracts'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import {
  cancelBookingRequest,
  claimBookingRequest,
  manageBookingMember,
} from '@/lib/bookings/repository.server'
import { clearBookingSessionCookie, verifiedCanonicalEmail } from '@/lib/bookings/security.server'
import { bookingActionSchema, bookingPublicIdSchema } from '@/lib/bookings/validation'

function errorResponse(error: BookingActionError) {
  const result: BookingActionResult<never> = { ok: false, error }
  return NextResponse.json(result, {
    status: bookingActionErrorStatus(error),
    headers: BOOKING_PRIVATE_HEADERS,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  if (process.env.BOOKINGS_ENABLED !== 'true') return errorResponse('not_found')
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const publicId = bookingPublicIdSchema.safeParse((await params).publicId)
  if (!publicId.success) return errorResponse('not_found')
  const body = await readBoundedBookingJson(request, 8_192)
  if (!body.ok) return errorResponse('invalid_input')
  const parsed = bookingActionSchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')

  // Read access proves the exact link/member/provider boundary. The RPC owns
  // action authorization and checks idempotent replay before current state so
  // a response-lost retry remains possible after the first mutation.
  const authorization = await authorizeBookingRequest(request, publicId.data, 'read')
  let replayActorUserId: string | null = null
  if (!authorization) {
    // A committed cancel/member mutation can remove or reclassify the actor's
    // current read authority before an HTTP retry arrives. Only a verified
    // signed-in identity may reach the SQL-owned replay check without read
    // access; fresh unauthorized mutations still fail generically in SQL.
    if (parsed.data.action === 'claim') return errorResponse('not_found')
    const user = await currentBookingUser()
    if (!verifiedCanonicalEmail(user)) return errorResponse('not_found')
    replayActorUserId = user!.id
  }

  try {
    if (parsed.data.action === 'cancel') {
      await cancelBookingRequest(
        authorization ?? { actorUserId: replayActorUserId, sessionHash: null },
        publicId.data,
        parsed.data,
      )
    } else if (parsed.data.action === 'claim') {
      if (!authorization) return errorResponse('not_found')
      await claimBookingRequest(authorization, publicId.data, parsed.data)
    } else if (parsed.data.action === 'addMember') {
      const actorUserId = authorization?.actorUserId ?? replayActorUserId
      if (!actorUserId) return errorResponse('not_found')
      await manageBookingMember(actorUserId, publicId.data, {
        expectedAccessVersion: parsed.data.expectedAccessVersion,
        targetEmail: parsed.data.email,
        action: parsed.data.role === 'owner' ? 'add_owner' : 'add_member',
        idempotencyKey: parsed.data.idempotencyKey,
      })
    } else {
      const actorUserId = authorization?.actorUserId ?? replayActorUserId
      if (!actorUserId) return errorResponse('not_found')
      await manageBookingMember(actorUserId, publicId.data, {
        expectedAccessVersion: parsed.data.expectedAccessVersion,
        targetMemberId: parsed.data.memberId,
        action: 'revoke',
        idempotencyKey: parsed.data.idempotencyKey,
      })
    }
    const result: BookingActionResult<{ publicId: string }> = {
      ok: true,
      data: { publicId: publicId.data },
    }
    const response = NextResponse.json(result, { headers: BOOKING_PRIVATE_HEADERS })
    if (parsed.data.action === 'claim') clearBookingSessionCookie(response, publicId.data)
    return response
  } catch (error) {
    // The verified-user fallback exists only for an exact lost-response
    // replay. Normalize every failed fallback so random booking/member UUIDs
    // cannot become a status-code existence oracle.
    if (!authorization && replayActorUserId) return errorResponse('not_found')
    return errorResponse(mapBookingError(error))
  }
}
