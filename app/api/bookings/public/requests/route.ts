import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { currentBookingUser, bookingActionErrorStatus } from '@/lib/bookings/api.server'
import { establishBookingCapabilitySession } from '@/lib/bookings/capability-session.server'
import type { CreateBookingRequestResult } from '@/lib/bookings/contracts'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import { createBookingRateLimitInput } from '@/lib/bookings/rate-limit.server'
import {
  createBookingRequest,
  createdBookingPath,
  resolveBookingCreateReplay,
  resolvePublicBookingService,
  type CreatedBookingRecord,
} from '@/lib/bookings/repository.server'
import {
  createGuestCapabilityForRequest,
  setBookingSessionCookie,
  verifiedCanonicalEmail,
} from '@/lib/bookings/security.server'
import { createBookingRequestSchema, resolveRequestedStartUtc } from '@/lib/bookings/validation'

function errorResponse(error: ReturnType<typeof mapBookingError>) {
  return NextResponse.json(
    { error },
    { status: bookingActionErrorStatus(error), headers: BOOKING_PRIVATE_HEADERS },
  )
}

async function successResponse(
  request: NextRequest,
  booking: CreatedBookingRecord,
  guestCapability: { token: string; digest: string } | null,
  user: User | null,
  contactEmail: string,
) {
  const expectedMode = guestCapability ? 'link' : 'members'
  if (booking.accessMode !== expectedMode) throw new Error('booking_idempotency_conflict')
  const result: CreateBookingRequestResult = {
    publicId: booking.publicId,
    businessProfileSlug: booking.businessProfileSlug,
    bookingPath: createdBookingPath(booking.businessProfileSlug, booking.publicId),
    accessMode: booking.accessMode,
    status: booking.status,
    appliedDiscountBps: booking.appliedDiscountBps,
    currentActorHasAccess: guestCapability !== null
      || verifiedCanonicalEmail(user) === normalizeEmailForAccess(contactEmail),
    guestCapability: guestCapability?.token ?? null,
  }
  const response = NextResponse.json(result, {
    status: booking.created ? 201 : 200,
    headers: BOOKING_PRIVATE_HEADERS,
  })
  if (guestCapability) {
    const session = await establishBookingCapabilitySession({
      request,
      publicId: booking.publicId,
      capabilityDigest: guestCapability.digest,
    })
    setBookingSessionCookie(response, booking.publicId, session.token)
  }
  return response
}

export async function POST(request: NextRequest) {
  if (process.env.BOOKINGS_ENABLED !== 'true') return errorResponse('not_found')
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const body = await readBoundedBookingJson(request, 16_384)
  if (!body.ok) {
    return NextResponse.json(
      { error: 'invalid_input' },
      { status: body.status, headers: BOOKING_PRIVATE_HEADERS },
    )
  }
  const parsed = createBookingRequestSchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')

  try {
    const user = await currentBookingUser()
    const guestCapability = verifiedCanonicalEmail(user)
      ? null
      : createGuestCapabilityForRequest(parsed.data.businessProfileSlug, parsed.data.requestId)
    const replay = await resolveBookingCreateReplay({
      input: parsed.data,
      user,
      guestCapabilityDigest: guestCapability?.digest ?? null,
    })
    if (replay) {
      return await successResponse(request, replay, guestCapability, user, parsed.data.contactEmail)
    }

    const resolved = await resolvePublicBookingService(parsed.data.businessProfileSlug)
    if (!resolved) return errorResponse('not_found')
    const requestedAtUtc = resolveRequestedStartUtc(
      parsed.data.requestedDate,
      parsed.data.requestedTime,
      resolved.view.service.timezone,
    )
    if (!requestedAtUtc) return errorResponse('invalid_input')
    const rateLimit = createBookingRateLimitInput(request, resolved.serviceId)
    if (!rateLimit) return errorResponse('rate_limited')
    const booking = await createBookingRequest({
      serviceId: resolved.serviceId,
      input: parsed.data,
      requestedAtUtc,
      user,
      guestCapabilityDigest: guestCapability?.digest ?? null,
      rateLimit,
    })
    if (booking.businessProfileSlug !== resolved.businessProfileSlug) {
      throw new Error('booking_save_failed')
    }
    return await successResponse(request, booking, guestCapability, user, parsed.data.contactEmail)
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}
