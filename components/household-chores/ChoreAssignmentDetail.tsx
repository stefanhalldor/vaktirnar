'use client'

import { useLocale, useTranslations } from 'next-intl'
import type {
  HouseholdChoreAssignmentStatus,
  HouseholdChoreHistoryPage,
} from '@/lib/household-chores/contracts'
import { formatDateTime } from '@/lib/date-format'
import { ChoreHistoryList } from './ChoreHistoryList'
import { ChoreAssignmentActions, type ChoreAssignmentActionState } from './ChoreAssignmentActions'

export interface ChoreAssignmentDisplay {
  title: string
  description: string | null
  materials: string | null
  participantLabel: string | null
  participantIdentityMarker: 'current' | 'former_member'
  points: number
  status: HouseholdChoreAssignmentStatus
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export function ChoreAssignmentDetail({
  circleId,
  assignment,
  timeline,
  nextTimelineHref,
  actionState,
}: {
  circleId: string
  assignment: ChoreAssignmentDisplay
  timeline: HouseholdChoreHistoryPage
  nextTimelineHref: string | null
  actionState: ChoreAssignmentActionState | null
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  const participant = assignment.participantIdentityMarker === 'former_member'
    ? t('common.formerMember')
    : assignment.participantLabel ?? t('common.formerMember')

  return (
    <div className="space-y-8">
      <section className="space-y-4 border-y border-border py-5">
        <div>
          <p className="text-sm text-muted-foreground">{t('assignment.assignedTo', { name: participant })}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {t('dashboard.points', { count: assignment.points })}
          </p>
        </div>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="font-medium">{t('assignment.statusLabel')}</dt>
            <dd className="mt-1 text-muted-foreground">{t(`assignment.status.${assignment.status}`)}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('assignment.createdLabel')}</dt>
            <dd className="mt-1 text-muted-foreground">{formatDateTime(assignment.createdAt, locale)}</dd>
          </div>
        </dl>
        {assignment.description ? (
          <div>
            <h2 className="text-sm font-semibold">{t('definition.description')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {assignment.description}
            </p>
          </div>
        ) : null}
        {assignment.materials ? (
          <div>
            <h2 className="text-sm font-semibold">{t('definition.materials')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {assignment.materials}
            </p>
          </div>
        ) : null}
      </section>

      {actionState ? <ChoreAssignmentActions state={actionState} /> : null}

      <section aria-labelledby="assignment-history-heading">
        <h2 id="assignment-history-heading" className="mb-2 text-sm font-semibold">
          {t('history.assignmentHeading')}
        </h2>
        <ChoreHistoryList
          circleId={circleId}
          page={timeline}
          nextHref={nextTimelineHref}
          linkAssignments={false}
        />
      </section>
    </div>
  )
}
