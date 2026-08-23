import { unstable_noStore as noStore } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { EVENT_HEADING_HASH, eventDetailPath } from '@/lib/events/contracts'
import { guardEventSession } from '@/lib/events/guard'
import { getEventGuestAttendancePreview } from '@/lib/events/repository.server'
import {
  getEventActorViewV3,
  resolveEventInvitationV3,
} from '@/lib/events/participant-identity-v3.repository.server'

export default async function EventAttendanceInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  noStore()
  const [{ invitationId }, { user }] = await Promise.all([
    params,
    guardEventSession(),
  ])
  const resolution = await resolveEventInvitationV3(user.id, invitationId)
  if (resolution) {
    redirect(`${eventDetailPath(resolution.eventId)}${EVENT_HEADING_HASH}`)
  }

  // The legacy pending feed and the unread inbox can surface an exact-current
  // invitation before its v3 generation anchor is usable. Keep the fallback
  // recipient-scoped, then require the canonical v3 attendee projection to
  // claim/authorize the Event before redirecting. Foreign, stale, left,
  // revoked and removed invitations still collapse to the same not-found.
  const preview = await getEventGuestAttendancePreview(user.id, invitationId)
  if (!preview) notFound()
  const actorView = await getEventActorViewV3(user.id, preview.eventId)
  if (!actorView || actorView.viewerRole !== 'attendee') notFound()
  redirect(`${eventDetailPath(actorView.eventId)}${EVENT_HEADING_HASH}`)
}
