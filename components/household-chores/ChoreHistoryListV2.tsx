'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type {
  HouseholdChoreV2HistoryItem,
  HouseholdChoreV2HistoryPage,
} from '@/lib/household-chores/contracts-v2'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import { householdChoreAssignmentPath } from '@/lib/household-chores/paths'

function HistoryActor({ event }: { event: HouseholdChoreV2HistoryItem }) {
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

function HistoryDetails({ event }: { event: HouseholdChoreV2HistoryItem }) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  switch (event.eventType) {
    case 'completed':
    case 'recompleted':
      return (
        <>
          <p>{t('history.workedOn', { date: formatDateOnly(event.performedOn, locale) })}</p>
          <p>{t('history.recordedAt', { date: formatDateTime(event.recordedAt, locale) })}</p>
          <p>{t('history.pointsAdded', { count: event.pointsDelta })}</p>
          <p>{t('history.completionNumber', { count: event.completionSequence })}</p>
        </>
      )
    case 'completion_date_corrected':
      return (
        <>
          <p>{t('history.correctedFromTo', {
            previous: formatDateOnly(event.previousPerformedOn, locale),
            date: formatDateOnly(event.performedOn, locale),
          })}</p>
          <p>{t('history.completionNumber', { count: event.completionSequence })}</p>
          <p>{t('history.noPointChange')}</p>
        </>
      )
    case 'completion_reversed':
      return (
        <>
          <p>{t('history.reversedWorkDate', {
            date: formatDateOnly(event.reversedPerformedOn, locale),
          })}</p>
          <p>{t('history.pointsRemoved', { count: Math.abs(event.pointsDelta) })}</p>
          <p>{t('history.completionNumber', { count: event.completionSequence })}</p>
          <p>{t(event.reopenOutcome === 'open' ? 'history.reopened' : 'history.notReopened')}</p>
        </>
      )
    case 'cancelled':
      return <p>{t('history.noPoints')}</p>
    case 'created':
      return <p>{t('history.pointsOnCompletion', { count: event.snapshotPoints })}</p>
  }
}

export function ChoreHistoryListV2({
  circleId,
  page,
  nextHref,
  linkAssignments = true,
}: {
  circleId: string
  page: HouseholdChoreV2HistoryPage
  nextHref: string | null
  linkAssignments?: boolean
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()

  if (page.items.length === 0) {
    return <p className="border-y border-border py-5 text-sm text-muted-foreground">{t('history.empty')}</p>
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
                {participant} · {formatDateTime(event.occurredAt, locale)}
              </p>
              <div className="space-y-0.5 text-xs leading-5 text-muted-foreground">
                <HistoryDetails event={event} />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t(`history.origin.${event.assignmentOrigin}`)} · <HistoryActor event={event} />
              </p>
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
          ) : <div key={event.eventId}>{row}</div>
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
