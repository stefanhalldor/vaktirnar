import Link from 'next/link'
import { ChevronRight, ListChecks, Mail, Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { HouseholdChoreRootView } from '@/lib/household-chores/contracts'
import {
  householdChoreCirclePath,
  householdChoreInvitationPath,
  householdChoreNewCirclePath,
} from '@/lib/household-chores/paths'

export async function CircleList({ view }: { view: HouseholdChoreRootView }) {
  const t = await getTranslations('teskeid.householdChores')

  return (
    <div className="space-y-8">
      <Link
        href={householdChoreNewCirclePath()}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Plus aria-hidden size={18} />
        {t('root.createCircle')}
      </Link>

      {view.pendingInvitations.length > 0 ? (
        <section aria-labelledby="household-pending-heading">
          <h2 id="household-pending-heading" className="mb-2 text-sm font-semibold">
            {t('root.pendingHeading')}
          </h2>
          <div className="divide-y divide-border border-y border-border">
            {view.pendingInvitations.map((invitation) => (
              <Link
                key={invitation.invitationId}
                href={householdChoreInvitationPath(invitation.invitationId)}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Mail aria-hidden size={18} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">
                    {invitation.circleName}
                  </span>
                  <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">
                    {t('root.invitedBy', { name: invitation.inviterLabel })}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {t('common.reference', { reference: invitation.displayReference })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="household-circles-heading">
        <h2 id="household-circles-heading" className="mb-2 text-sm font-semibold">
          {t('root.circlesHeading')}
        </h2>
        {view.circles.length === 0 ? (
          <div className="border-y border-border py-7 text-center">
            <ListChecks aria-hidden size={24} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('root.empty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {view.circles.map((circle) => (
              <Link
                key={circle.circleId}
                href={householdChoreCirclePath(circle.circleId)}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{circle.name}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {t('root.openCount', { count: circle.openAssignmentCount })}
                    {' · '}
                    {t(`membershipType.${circle.viewerType}`)}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {t('common.reference', { reference: circle.displayReference })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
