import Link from 'next/link'
import { ChevronRight, ListChecks, Settings, UserPlus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  TASKS_PATH,
  type HouseholdChoreCircleView,
  type HouseholdChorePriorityDashboardView,
} from '@/lib/household-chores/contracts'
import {
  householdChoreAssignPath,
  householdChoreAssignmentPath,
  householdChoreDefinitionsPath,
  householdChorePeoplePath,
  householdChoreSelfServicePath,
} from '@/lib/household-chores/paths'
import { PrioritizedTaskList } from './PrioritizedTaskList'

function safeLabel(
  label: string | null,
  marker: 'current' | 'former_member' | undefined,
  formerLabel: string,
) {
  return marker === 'former_member' || label === null ? formerLabel : label
}

export async function CircleDashboard({
  circleId,
  view,
  priorityView,
}: {
  circleId: string
  view: HouseholdChoreCircleView
  priorityView: HouseholdChorePriorityDashboardView
}) {
  const t = await getTranslations('teskeid.householdChores')

  return (
    <div className="space-y-8">
      <section className="border-y border-border py-4">
        <p className="text-xs leading-5 text-muted-foreground">
          {t('common.reference', { reference: view.circle.displayReference })}
        </p>
        <Link
          href={TASKS_PATH}
          className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('dashboard.switchCircle')}
        </Link>
      </section>

      <section aria-labelledby="household-points-heading">
        <h2 id="household-points-heading" className="mb-2 text-sm font-semibold">
          {t('dashboard.pointsHeading')}
        </h2>
        {view.pointTotals.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('dashboard.pointsEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {view.pointTotals.map((total) => (
              <div key={total.participantId} className="flex min-h-12 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 break-words text-sm">
                  {safeLabel(total.label, total.identityMarker, t('common.formerMember'))}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {t('dashboard.points', { count: total.points })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <PrioritizedTaskList
        circleId={circleId}
        view={priorityView}
        initialNow={new Date().toISOString()}
      />

      <section aria-labelledby="household-recent-heading">
        <h2 id="household-recent-heading" className="mb-2 text-sm font-semibold">
          {t('dashboard.recentHeading')}
        </h2>
        {view.recentAssignments.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('dashboard.recentEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {view.recentAssignments.map((event) => (
              <Link
                key={event.eventId}
                href={householdChoreAssignmentPath(circleId, event.assignmentId)}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{event.title}</span>
                  <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">
                    {safeLabel(
                      event.participantLabel,
                      event.participantIdentityMarker,
                      t('common.formerMember'),
                    )}
                    {' · '}
                    {t('dashboard.points', { count: event.snapshotPoints })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-2">
        {view.viewerType === 'member' ? (
          <>
            <details className="rounded-xl border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer items-center justify-center px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t('dashboard.moreActions')}
              </summary>
              <div className="space-y-2 border-t border-border p-3">
                <Link
                  href={householdChoreAssignPath(circleId)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <UserPlus aria-hidden size={18} />
                  {t('dashboard.assignSecondary')}
                </Link>
                <Link
                  href={householdChoreSelfServicePath(circleId)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <UserPlus aria-hidden size={18} />
                  {t('dashboard.selfAssign')}
                </Link>
              </div>
            </details>
            <Link
              href={householdChoreDefinitionsPath(circleId)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ListChecks aria-hidden size={18} />
              {t('dashboard.manageDefinitions')}
            </Link>
            <Link
              href={householdChorePeoplePath(circleId)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Settings aria-hidden size={18} />
              {t('dashboard.manageCircle')}
            </Link>
          </>
        ) : (
          <>
            <Link
              href={householdChoreSelfServicePath(circleId)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <UserPlus aria-hidden size={18} />
              {t('dashboard.selfAssign')}
            </Link>
            <Link
              href={householdChoreDefinitionsPath(circleId)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ListChecks aria-hidden size={18} />
              {t('dashboard.viewDefinitions')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
