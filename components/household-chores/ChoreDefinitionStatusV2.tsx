'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { HouseholdChoreV2DefinitionDetail } from '@/lib/household-chores/contracts-v2'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import { householdChoreAssignmentPath } from '@/lib/household-chores/paths'

export function ChoreDefinitionStatusV2({
  circleId,
  detail,
}: {
  circleId: string
  detail: HouseholdChoreV2DefinitionDetail
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  const states = detail.viewerType === 'member'
    ? detail.definition.participantStates
    : [detail.definition.ownState]
  const hasCadence = detail.definition.cadenceDays !== null
  const globalRemaining = detail.definition.completionScope === 'global'
    && states.some(state => state.isRemaining)

  return (
    <section aria-labelledby="definition-status-heading" className="space-y-3">
      <h2 id="definition-status-heading" className="text-sm font-semibold">{t('definition.statusHeading')}</h2>
      {!hasCadence ? (
        <p className="text-sm text-muted-foreground">{t('dashboard.priority.noCadence')}</p>
      ) : null}
      {hasCadence && detail.definition.completionScope === 'global' ? (
        <div className="flex items-center justify-between gap-3 border-y border-border py-3 text-sm">
          <span className="font-medium">{t('definition.globalStatus')}</span>
          <span className={globalRemaining
            ? 'text-muted-foreground'
            : 'flex items-center gap-1 font-medium text-primary'}>
            {t(globalRemaining ? 'definition.remaining' : 'definition.satisfied')}
            {!globalRemaining ? <Check aria-hidden size={15} /> : null}
          </span>
        </div>
      ) : null}
      {detail.viewerType === 'member'
        && detail.definition.completionScope === 'global'
        && detail.definition.latestPerformer ? (
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{t('definition.latestGlobalHeading')}</p>
            <p className="mt-1 text-muted-foreground">
              {t('definition.latestGlobal', {
                name: detail.definition.latestPerformer.identityMarker === 'former_member'
                  ? t('common.formerMember')
                  : detail.definition.latestPerformer.label ?? t('common.formerMember'),
                worked: formatDateOnly(detail.definition.latestPerformer.performedOn, locale),
                recorded: formatDateTime(detail.definition.latestPerformer.recordedAt, locale),
              })}
            </p>
          </div>
        ) : null}
      <div className="divide-y divide-border border-y border-border">
        {states.map((state) => (
          <div key={state.participantId} className="space-y-2 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold">{state.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.points', { count: state.points })}</p>
              </div>
              <span className={hasCadence
                && detail.definition.completionScope !== 'global'
                && !state.isRemaining
                ? 'flex shrink-0 items-center gap-1 text-xs font-medium text-primary'
                : 'shrink-0 text-xs font-medium text-muted-foreground'}>
                {!hasCadence
                  ? t('dashboard.priority.noCadence')
                  : detail.definition.completionScope === 'global'
                    ? t('definition.eligible')
                    : state.isRemaining
                      ? t('definition.remaining')
                      : t('definition.satisfied')}
                {hasCadence
                  && detail.definition.completionScope !== 'global'
                  && !state.isRemaining
                  ? <Check aria-hidden size={14} />
                  : null}
              </span>
            </div>
            <dl className="grid gap-1 text-xs leading-5 text-muted-foreground">
              {state.dueOn && detail.definition.completionScope === 'per_participant' ? (
                <div className="flex gap-1">
                  <dt>{t('definition.dueLabel')}:</dt>
                  <dd>{formatDateOnly(state.dueOn, locale)}</dd>
                </div>
              ) : null}
              {state.latestPerformedOn ? (
                <div className="flex gap-1">
                  <dt>{t('assignment.workedLabel')}:</dt>
                  <dd>{formatDateOnly(state.latestPerformedOn, locale)}</dd>
                </div>
              ) : null}
              {state.recordedAt ? (
                <div className="flex gap-1">
                  <dt>{t('assignment.recordedLabel')}:</dt>
                  <dd>{formatDateTime(state.recordedAt, locale)}</dd>
                </div>
              ) : null}
            </dl>
            {state.oldestOpenAssignmentId ? (
              <Link
                href={householdChoreAssignmentPath(circleId, state.oldestOpenAssignmentId)}
                className="inline-flex min-h-10 items-center text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('definition.openAssignment')}
              </Link>
            ) : null}
            {state.latestCompletionId ? (
              <Link
                href={householdChoreAssignmentPath(circleId, state.latestCompletionId)}
                className="ml-3 inline-flex min-h-10 items-center text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('definition.viewLatestCompletion')}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
