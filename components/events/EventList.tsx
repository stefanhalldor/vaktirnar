'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarPlus, ChevronRight, Mail } from 'lucide-react'
import type {
  EventDashboardView,
  EventPendingInvitationSummary,
} from '@/lib/events/contracts'
import {
  eventDetailPath,
} from '@/lib/events/contracts'
import { loadEventDirectoryPageV3Action } from '@/lib/events/participant-identity-v3.actions'
import type {
  EventListForActorV3,
  EventPersonSourceV3Page,
  EventV3RsvpState,
} from '@/lib/events/participant-identity-v3.contracts'

type DisplayEventSummary = {
  id: string
  name: string
  guestCount: number
  viewerRole: 'owner' | 'attendee'
  rsvpState?: EventV3RsvpState
}

function EventSummaryLink({
  event,
  participantLabel,
}: {
  event: DisplayEventSummary
  participantLabel: string
}) {
  return (
    <Link
      href={eventDetailPath(event.id)}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{event.name}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{participantLabel}</span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
    </Link>
  )
}

function PendingInvitationLink({
  invitation,
  openLabel,
  inviterLabel,
  guestLabel,
}: {
  invitation: EventPendingInvitationSummary
  openLabel: string
  inviterLabel: string
  guestLabel: string
}) {
  return (
    <Link
      href={eventDetailPath(invitation.eventId)}
      aria-label={openLabel}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Mail aria-hidden size={18} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{invitation.name}</span>
        <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">{guestLabel}</span>
        <span className="block break-words text-xs leading-5 text-muted-foreground">{inviterLabel}</span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
    </Link>
  )
}

function mapPage(page: EventPersonSourceV3Page): DisplayEventSummary[] {
  return page.events.map((event) => ({
    id: event.id,
    name: event.name,
    guestCount: Math.max(0, event.activePersonCount - 1),
    viewerRole: event.viewerRole,
    ...(event.viewerRole === 'attendee' && event.rsvpState
      ? { rsvpState: event.rsvpState }
      : {}),
  }))
}

export function EventList({
  dashboard,
  directory,
  initialPage,
  canManageEvents,
}: {
  dashboard: EventDashboardView | null
  directory: EventListForActorV3
  initialPage: EventPersonSourceV3Page
  canManageEvents: boolean
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const [isRefreshingClaims, startClaimRefresh] = useTransition()
  const [events, setEvents] = useState(() => mapPage(initialPage))
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setEvents(mapPage(initialPage))
    setNextCursor(initialPage.nextCursor)
    setLoadError(false)
  }, [initialPage])

  const owned = events.filter((event) => event.viewerRole === 'owner')
  const participating = events.filter((event) => event.viewerRole === 'attendee')
  const rsvpLabel = (state: EventV3RsvpState) => t(`rsvp.${
    state === 'no_response' ? 'noResponse'
      : state === 'not_attending' ? 'notAttending'
        : state
  }`)

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setLoadError(false)
    try {
      const result = await loadEventDirectoryPageV3Action({ cursor: nextCursor })
      if (!result.ok) {
        setLoadError(true)
        return
      }
      const known = new Set(events.map((event) => event.id))
      const additional = mapPage(result.data).filter((event) => !known.has(event.id))
      setEvents((current) => [...current, ...additional])
      setNextCursor(result.data.nextCursor)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-8">
      {canManageEvents ? (
        <Link
          href="/auth-mvp/vidburdir/nyr"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CalendarPlus aria-hidden size={18} />
          {t('list.create')}
        </Link>
      ) : null}

      {canManageEvents ? (
        <section aria-labelledby="owned-events-heading">
          <h2 id="owned-events-heading" className="mb-2 text-sm font-semibold">{t('attendance.ownedHeading')}</h2>
          {owned.length === 0 ? (
            <p className="border-y border-border py-5 text-sm text-muted-foreground">{t('attendance.ownedEmpty')}</p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {owned.map((event) => (
                <EventSummaryLink
                  key={event.id}
                  event={event}
                  participantLabel={t('list.participantCount', { count: event.guestCount })}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {canManageEvents && dashboard ? (
        <section aria-labelledby="pending-events-heading">
          <h2 id="pending-events-heading" className="mb-2 text-sm font-semibold">{t('attendance.pendingHeading')}</h2>
          {dashboard.pending.length === 0 ? (
            <p className="border-y border-border py-5 text-sm text-muted-foreground">{t('attendance.pendingEmpty')}</p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {dashboard.pending.map((invitation) => (
                <PendingInvitationLink
                  key={invitation.invitationId}
                  invitation={invitation}
                  openLabel={t('attendance.openInvitation', { name: invitation.name })}
                  inviterLabel={t('attendance.invitedBy', { name: invitation.inviterDisplayName ?? t('invitation.unknownInviter') })}
                  guestLabel={invitation.guestDisplayName ?? t('personPicker.nameMissing')}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="participating-events-heading">
        <h2 id="participating-events-heading" className="mb-2 text-sm font-semibold">{t('attendance.acceptedHeading')}</h2>
        {participating.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">{t('attendance.acceptedEmpty')}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {participating.map((event) => (
              <EventSummaryLink
                key={event.id}
                event={event}
                participantLabel={`${t('list.participantCount', { count: event.guestCount })} · ${event.rsvpState ? rsvpLabel(event.rsvpState) : ''}`}
              />
            ))}
          </div>
        )}
      </section>

      {directory.claimHasMore ? (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">{t('list.moreInvitationsHint')}</p>
          <button
            type="button"
            disabled={isRefreshingClaims}
            onClick={() => startClaimRefresh(() => router.refresh())}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
          >
            {isRefreshingClaims ? t('list.loadingMore') : t('list.loadMoreInvitations')}
          </button>
        </div>
      ) : nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
        >
          {loadingMore ? t('list.loadingMore') : t('list.loadMore')}
        </button>
      ) : null}
      {loadError ? <p role="alert" className="text-sm text-destructive">{t('list.loadError')}</p> : null}
      {(directory.ownedHasMore || directory.participatingHasMore)
        && !directory.claimHasMore && !nextCursor ? (
        <p className="text-sm text-muted-foreground">{t('list.moreAvailableHint')}</p>
      ) : null}
    </div>
  )
}
