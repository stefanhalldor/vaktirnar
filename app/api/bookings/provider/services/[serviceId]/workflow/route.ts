import { NextRequest, NextResponse } from 'next/server'
import {
  requireBookingProviderApi,
  requireBookingWorkflowMutationActorApi,
} from '@/lib/bookings/access.server'
import { bookingActionErrorStatus } from '@/lib/bookings/api.server'
import type { BookingActionError, BookingActionResult } from '@/lib/bookings/contracts'
import { mapBookingError } from '@/lib/bookings/domain-error'
import { BOOKING_PRIVATE_HEADERS, readBoundedBookingJson } from '@/lib/bookings/http.server'
import {
  ensureProviderBookingWorkflowDraft,
  loadProviderBookingWorkflow,
  publishProviderBookingWorkflowDraft,
  saveProviderBookingWorkflowDraft,
} from '@/lib/bookings/repository.server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import {
  bookingPublicIdSchema,
  bookingWorkflowMutationSchema,
} from '@/lib/bookings/validation'

function errorResponse(error: BookingActionError, status = bookingActionErrorStatus(error)) {
  const result: BookingActionResult<never> = { ok: false, error }
  return NextResponse.json(result, { status, headers: BOOKING_PRIVATE_HEADERS })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const serviceId = bookingPublicIdSchema.safeParse((await params).serviceId)
  if (!serviceId.success) return errorResponse('not_found')
  const access = await requireBookingProviderApi()
  if (!access.ok) return errorResponse('not_found', access.status)
  try {
    const workflow = await loadProviderBookingWorkflow(
      access.user.id,
      access.spaceId,
      serviceId.data,
    )
    if (!workflow) return errorResponse('not_found')
    return NextResponse.json(workflow, { headers: BOOKING_PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const serviceId = bookingPublicIdSchema.safeParse((await params).serviceId)
  if (!serviceId.success) return errorResponse('not_found')
  if (!assertSameOriginJsonMutation(request)) return errorResponse('invalid_input')
  const body = await readBoundedBookingJson(request, 65_536)
  if (!body.ok) return errorResponse('invalid_input', body.status)
  const parsed = bookingWorkflowMutationSchema.safeParse(body.value)
  if (!parsed.success) return errorResponse('invalid_input')

  // Fresh mutations are authorized again inside SQL. This HTTP boundary only
  // requires a confirmed canonical actor so an exact, bounded lost-response
  // receipt remains replayable after provider entitlement changes.
  const access = await requireBookingWorkflowMutationActorApi()
  if (!access.ok) return errorResponse('not_found', access.status)
  try {
    const input = parsed.data
    const data = input.action === 'ensureDraft'
      ? await ensureProviderBookingWorkflowDraft(
        access.user.id,
        access.spaceId,
        serviceId.data,
        input,
      )
      : input.action === 'saveDraft'
        ? await saveProviderBookingWorkflowDraft(
          access.user.id,
          access.spaceId,
          serviceId.data,
          input,
        )
        : await publishProviderBookingWorkflowDraft(
          access.user.id,
          access.spaceId,
          serviceId.data,
          input,
        )
    const result: BookingActionResult<typeof data> = { ok: true, data }
    return NextResponse.json(result, { headers: BOOKING_PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(mapBookingError(error))
  }
}
