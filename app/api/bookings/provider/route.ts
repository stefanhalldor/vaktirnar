import { NextRequest, NextResponse } from 'next/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { requireBookingProviderApi } from '@/lib/bookings/access.server'
import { bookingActionErrorStatus } from '@/lib/bookings/api.server'
import type { BookingActionError, BookingActionResult } from '@/lib/bookings/contracts'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import {
  loadProviderBookingWorkspace,
  saveBookingServiceSettings,
  transitionBookingService,
} from '@/lib/bookings/repository.server'
import {
  bookingProviderListQuerySchema,
  bookingProviderMutationSchema,
} from '@/lib/bookings/validation'

function errorResponse(error: BookingActionError, status = bookingActionErrorStatus(error)) {
  const result: BookingActionResult<never> = { ok: false, error }
  return NextResponse.json(result, { status, headers: BOOKING_PRIVATE_HEADERS })
}

export async function GET(request: NextRequest) {
  const access = await requireBookingProviderApi()
  if (!access.ok) return errorResponse('not_found', access.status)
  const searchParams = request.nextUrl.searchParams
  const allowedKeys = new Set(['workflowId', 'stateLogicalKey', 'attentionSide'])
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key) || searchParams.getAll(key).length !== 1) {
      return errorResponse('invalid_input')
    }
  }
  const parsedQuery = bookingProviderListQuerySchema.safeParse({
    ...(searchParams.has('workflowId') ? { workflowId: searchParams.get('workflowId') } : {}),
    ...(searchParams.has('stateLogicalKey')
      ? { stateLogicalKey: searchParams.get('stateLogicalKey') }
      : {}),
    ...(searchParams.has('attentionSide')
      ? { attentionSide: searchParams.get('attentionSide') }
      : {}),
  })
  if (!parsedQuery.success) return errorResponse('invalid_input')
  try {
    return NextResponse.json(
      await loadProviderBookingWorkspace(access.user.id, access.spaceId, parsedQuery.data),
      { headers: BOOKING_PRIVATE_HEADERS },
    )
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}

export async function POST(request: NextRequest) {
  const access = await requireBookingProviderApi()
  if (!access.ok) return errorResponse('not_found', access.status)
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const body = await readBoundedBookingJson(request, 8_192)
  if (!body.ok) return errorResponse('invalid_input', body.status)
  const parsed = bookingProviderMutationSchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')
  try {
    const data = parsed.data.action === 'upsertService'
      ? await saveBookingServiceSettings(access.user.id, access.spaceId, parsed.data)
      : await transitionBookingService(access.user.id, access.spaceId, parsed.data)
    const result: BookingActionResult<typeof data> = { ok: true, data }
    return NextResponse.json(result, { headers: BOOKING_PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}
