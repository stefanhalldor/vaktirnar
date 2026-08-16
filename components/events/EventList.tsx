'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarPlus, ChevronRight, Mail } from 'lucide-react'
import type {
  EventDashboardView,
  EventPendingInvitationSummary,
  EventViewerSummary,
} from '@/lib/events/contracts'
import {
  eventDetailPath,
  eventGuestAttendanceInvitationPath,
} from '@/lib/events/contracts'
import { formatDateTime } from '@/lib/date-format'

function EventSummaryLink({
  event,
  createdLabel,
  participantLabel,
}: {
  event: EventViewerSummary
  createdLabel: string
  participantLabel: string
}) {
  return (
    <Link
      href={eventDetailPath(event.id)}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{event.name}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {participantLabel}
        </span>
        <span className="block text-xs leading-5 text-muted-foreground">{createdLabel}</span>
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
  inviterLabel: string | null
  guestLabel: string
}) {
  return (
    <Link
      href={eventGuestAttendanceInvitationPath(invitation.invitationId)}
      aria-label={openLabel}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Mail aria-hidden size={18} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{invitation.name}</span>
        <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">
          {guestLabel}
        </span>
        <span className="block break-words text-xs leading-5 text-muted-foreground">
          {inviterLabel}
        </span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
    </Link>
  )
}

export function EventList({ dashboard }: { dashboard: EventDashboardView }) {
  const t = useTranslations('teskeid.events')
  const locale = useLocale()

  return (
    <div className="space-y-8">
      <Link
        href="/auth-mvp/vidburdir/nyr"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CalendarPlus aria-hidden size={18} />
        {t('list.create')}
      </Link>

      <section aria-labelledby="owned-events-heading">
        <h2 id="owned-events-heading" className="mb-2 text-sm font-semibold">
          {t('attendance.ownedHeading')}
        </h2>
        {dashboard.owned.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('attendance.ownedEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {dashboard.owned.map((event) => (
              <EventSummaryLink
                key={event.id}
                event={event}
                participantLabel={t('list.participantCount', { count: event.guestCount })}
                createdLabel={t('list.createdAt', { date: formatDateTime(event.createdAt, locale) })}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="pending-events-heading">
        <h2 id="pending-events-heading" className="mb-2 text-sm font-semibold">
          {t('attendance.pendingHeading')}
        </h2>
        {dashboard.pending.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('attendance.pendingEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {dashboard.pending.map((invitation) => (
              <PendingInvitationLink
                key={invitation.invitationId}
                invitation={invitation}
                openLabel={t('attendance.openInvitation', { name: invitation.name })}
                inviterLabel={t('attendance.invitedBy', {
                  name: invitation.inviterDisplayName ?? t('invitation.unknownInviter'),
                })}
                guestLabel={invitation.guestDisplayName ?? t('attendance.genericGuest')}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="attending-events-heading">
        <h2 id="attending-events-heading" className="mb-2 text-sm font-semibold">
          {t('attendance.acceptedHeading')}
        </h2>
        {dashboard.attending.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('attendance.acceptedEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {dashboard.attending.map((event) => (
              <EventSummaryLink
                key={event.id}
                event={event}
                participantLabel={t('list.participantCount', { count: event.guestCount })}
                createdLabel={t('list.createdAt', { date: formatDateTime(event.createdAt, locale) })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
