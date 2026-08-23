'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { EventActorViewV3, EventV3GuestPerson } from '@/lib/events/participant-identity-v3.contracts'
import { eventExpensePath } from '@/lib/events/contracts'
import { EventDetailsSummary } from './EventDetailsSummary'
import { EventPersonIdentity } from './EventPersonIdentity'
import { EventParticipationLeaveControl } from './EventParticipationLeaveControl'
import { EventRsvpControl } from './EventRsvpControl'

export function EventAttendeeDetail({
  event,
  canUseExpenses,
  financialPanel,
}: {
  event: Extract<EventActorViewV3, { viewerRole: 'attendee' }>
  canUseExpenses: boolean
  financialPanel?: ReactNode
}) {
  const t = useTranslations('teskeid.events')
  const organizer = event.people[0]
  const self = event.people.find((person): person is EventV3GuestPerson => (
    person.participantKind === 'guest' && person.isSelf
  ))
  const rsvpLabels = {
    no_response: t('rsvp.noResponse'),
    considering: t('rsvp.considering'),
    attending: t('rsvp.attending'),
    not_attending: t('rsvp.notAttending'),
  }

  return (
    <div className="space-y-7">
      <section className="border-y border-border py-5">
        <p className="break-words text-sm font-medium text-foreground">
          {t('attendance.invitedBy', {
            name: organizer?.shared.displayName ?? t('invitation.unknownInviter'),
          })}
        </p>
      </section>

      <EventDetailsSummary details={{
        eventId: event.eventId,
        eventDate: event.eventDate,
        eventTime: event.eventTime?.slice(0, 5) ?? null,
        description: event.description,
        agenda: event.agenda,
      }} />

      {self ? (
        <EventRsvpControl
          eventId={event.eventId}
          eventGuestId={self.personRef}
          identityGeneration={self.identityGeneration}
          rsvpState={event.selfRsvp.state}
          decisionVersion={event.selfRsvp.decisionVersion}
          privateNote={event.selfRsvp.privateNote}
        />
      ) : null}

      {self ? (
        <EventParticipationLeaveControl
          eventId={event.eventId}
          eventGuestId={self.personRef}
          identityGeneration={self.identityGeneration}
          identityVersion={self.identityVersion}
          accessVersion={self.accessVersion}
        />
      ) : null}

      {canUseExpenses ? (
        <Link
          href={eventExpensePath(event.eventId)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus aria-hidden size={18} />
          {t('detail.addExpense')}
        </Link>
      ) : null}

      {canUseExpenses ? financialPanel : null}

      <section className="space-y-3" aria-labelledby="event-attendee-roster-heading">
        <h2 id="event-attendee-roster-heading" className="text-sm font-semibold">
          {t('attendance.participants')}
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {event.people.map((person) => (
            <div key={person.personRef} className="flex min-h-14 items-start gap-3 py-3">
              <EventPersonIdentity
                person={person}
                fallbackLabel={t('personPicker.nameMissing')}
                rsvpLabels={rsvpLabels}
                privateNoteLabel={t('personPicker.privateNoteLabel')}
                rsvpPrivateNoteLabel={t('rsvp.privateNoteLabel')}
                hiddenLabels={(count) => t('personPicker.hiddenLabels', { count })}
                builtInTagLabel={(tag) => t(`personPicker.tags.${tag}`)}
              />
              {person.isSelf ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {t('attendance.you')}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
