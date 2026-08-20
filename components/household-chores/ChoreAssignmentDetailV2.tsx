'use client'

import { useLocale, useTranslations } from 'next-intl'
import type {
  HouseholdChoreV2AssignmentDetail,
  HouseholdChoreV2HistoryPage,
} from '@/lib/household-chores/contracts-v2'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import { ChoreAssignmentActions, type ChoreAssignmentActionState } from './ChoreAssignmentActions'
import { ChoreAssignmentDateActions, type ChoreAssignmentDateActionState } from './ChoreAssignmentDateActions'
import { ChoreHistoryListV2 } from './ChoreHistoryListV2'

export function ChoreAssignmentDetailV2({
  circleId,
  detail,
  timeline,
  nextTimelineHref,
  dateActionState,
  legacyActionState,
}: {
  circleId: string
  detail: HouseholdChoreV2AssignmentDetail
  timeline: HouseholdChoreV2HistoryPage
  nextTimelineHref: string | null
  dateActionState: ChoreAssignmentDateActionState | null
  legacyActionState: ChoreAssignmentActionState | null
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  const assignment = detail.assignment
  const participant = assignment.participantIdentityMarker === 'former_member'
    ? t('common.formerMember')
    : assignment.participantLabel ?? t('common.formerMember')
  const recorder = detail.viewerType === 'member' ? detail.assignment.recorderLabel : null

  return (
    <div className="space-y-8">
      <section className="space-y-4 border-y border-border py-5">
        <div>
          <p className="text-sm text-muted-foreground">{t('assignment.assignedTo', { name: participant })}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{t('dashboard.points', { count: assignment.points })}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">{t('assignment.statusLabel')}</dt>
            <dd className="mt-1 text-muted-foreground">{t(`assignment.status.${assignment.status}`)}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('assignment.createdLabel')}</dt>
            <dd className="mt-1 text-muted-foreground">{formatDateTime(assignment.createdAt, locale)}</dd>
          </div>
          {assignment.performedOn ? (
            <div>
              <dt className="font-medium">{t('assignment.workedLabel')}</dt>
              <dd className="mt-1 text-muted-foreground">{formatDateOnly(assignment.performedOn, locale)}</dd>
            </div>
          ) : null}
          {assignment.recordedAt ? (
            <div>
              <dt className="font-medium">{t('assignment.recordedLabel')}</dt>
              <dd className="mt-1 text-muted-foreground">{formatDateTime(assignment.recordedAt, locale)}</dd>
            </div>
          ) : null}
          {recorder ? (
            <div>
              <dt className="font-medium">{t('assignment.recorderLabel')}</dt>
              <dd className="mt-1 text-muted-foreground">{recorder}</dd>
            </div>
          ) : null}
        </dl>
        {assignment.description ? (
          <div>
            <h2 className="text-sm font-semibold">{t('definition.description')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{assignment.description}</p>
          </div>
        ) : null}
        {assignment.materials ? (
          <div>
            <h2 className="text-sm font-semibold">{t('definition.materials')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{assignment.materials}</p>
          </div>
        ) : null}
      </section>

      {dateActionState ? <ChoreAssignmentDateActions state={dateActionState} /> : null}
      {legacyActionState ? <ChoreAssignmentActions state={legacyActionState} /> : null}

      <section aria-labelledby="assignment-history-heading">
        <h2 id="assignment-history-heading" className="mb-2 text-sm font-semibold">{t('history.assignmentHeading')}</h2>
        <ChoreHistoryListV2
          circleId={circleId}
          page={timeline}
          nextHref={nextTimelineHref}
          linkAssignments={false}
        />
      </section>
    </div>
  )
}
