'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type {
  HouseholdChoreHistoryItem,
  HouseholdChoreHistoryPage,
} from '@/lib/household-chores/contracts'
import { formatDateTime } from '@/lib/date-format'
import { householdChoreAssignmentPath } from '@/lib/household-chores/paths'

function HistoryActor({ event }: { event: HouseholdChoreHistoryItem }) {
  const t = useTranslations('teskeid.householdChores')
  if (event.actorKind === 'system') return <>{t('history.recordedBySystem')}</>
  if (event.actorKind === 'former_member') return <>{t('history.recordedByFormerMember')}</>
  const actor = event.actorLabel ?? t('common.formerMember')
  if ((event.eventType === 'completed' || event.eventType === 'recompleted')
    && event.actorKind === 'participant') {
    return <>{t('history.completedBy', { name: actor })}</>
  }
  return <>{t('history.recordedBy', { name: actor })}</>
}

function HistoryPoints({ event }: { event: HouseholdChoreHistoryItem }) {
  const t = useTranslations('teskeid.householdChores')
  if (event.pointsDelta !== null && event.pointsDelta > 0) {
    return <>{t('history.pointsAdded', { count: event.pointsDelta })}</>
  }
  if (event.pointsDelta !== null && event.pointsDelta < 0) {
    return <>{t('history.pointsRemoved', { count: Math.abs(event.pointsDelta) })}</>
  }
  if (event.eventType === 'cancelled') return <>{t('history.noPoints')}</>
  return <>{t('history.pointsOnCompletion', { count: event.snapshotPoints })}</>
}

export function ChoreHistoryList({
  circleId,
  page,
  nextHref,
  linkAssignments = true,
}: {
  circleId: string
  page: HouseholdChoreHistoryPage
  nextHref: string | null
  linkAssignments?: boolean
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()

  if (page.items.length === 0) {
    return (
      <p className="border-y border-border py-5 text-sm text-muted-foreground">
        {t('history.empty')}
      </p>
    )
  }

  return (
    <div>
      <div className="divide-y divide-border border-y border-border">
        {page.items.map((event) => {
          const participant = event.participantIdentityMarker === 'former_member'
            ? t('common.formerMember')
            : event.participantLabel ?? t('common.formerMember')
          const row = (
            <article className="space-y-1 py-3">
              <p className="break-words text-sm font-semibold">{event.title}</p>
              <p className="break-words text-sm">{t(`history.event.${event.eventType}`)}</p>
              <p className="break-words text-xs leading-5 text-muted-foreground">
                {participant}
                {' · '}
                {formatDateTime(event.occurredAt, locale)}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                <HistoryPoints event={event} />
                {' · '}
                {t(`history.origin.${event.assignmentOrigin}`)}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                <HistoryActor event={event} />
              </p>
              {event.completionSequence !== null ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t('history.completionNumber', { count: event.completionSequence })}
                </p>
              ) : null}
              {event.eventType === 'completion_reversed' ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(event.reopenOutcome === 'open' ? 'history.reopened' : 'history.notReopened')}
                </p>
              ) : null}
            </article>
          )
          return linkAssignments ? (
            <Link
              key={event.eventId}
              href={householdChoreAssignmentPath(circleId, event.assignmentId)}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {row}
            </Link>
          ) : (
            <div key={event.eventId}>{row}</div>
          )
        })}
      </div>
      {page.hasMore && nextHref ? (
        <Link
          href={nextHref}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('history.older')}
        </Link>
      ) : null}
    </div>
  )
}
