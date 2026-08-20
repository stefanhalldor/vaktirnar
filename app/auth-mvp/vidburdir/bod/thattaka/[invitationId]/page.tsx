import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventAttendanceInvitationActions } from '@/components/events/EventAttendanceInvitationActions'
import { ClosedTestingAccessRequest } from '@/components/teskeid/ClosedTestingAccessRequest'
import { EVENT_FEATURE_KEY } from '@/lib/events/contracts'
import { guardEventSession } from '@/lib/events/guard'
import { getEventGuestAttendancePreview } from '@/lib/events/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EventShell } from '../../../EventShell'

async function hasEventsAccess(userId: string, email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  try {
    return await checkFeatureAccess(userId, email, EVENT_FEATURE_KEY)
  } catch {
    return false
  }
}

export default async function EventAttendanceInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  noStore()
  const [{ invitationId }, { user }, t] = await Promise.all([
    params,
    guardEventSession(),
    getTranslations('teskeid.events'),
  ])
  const [invitation, hasEventAccess] = await Promise.all([
    getEventGuestAttendancePreview(user.id, invitationId),
    hasEventsAccess(user.id, user.email),
  ])
  if (!invitation) notFound()

  return (
    <EventShell
      title={t('invitation.title')}
      homeLabel={t('homeLabel')}
      backHref={hasEventAccess ? '/auth-mvp/vidburdir' : '/auth-mvp/heim'}
      backLabel={t('back')}
    >
      <div className="space-y-6">
        <section className="space-y-4 border-y border-border py-5">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t('invitation.eventLabel')}</dt>
              <dd className="mt-1 break-words font-semibold">{invitation.eventName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('invitation.fromLabel')}</dt>
              <dd className="mt-1 break-words font-medium">
                {invitation.inviterDisplayName ?? t('invitation.unknownInviter')}
              </dd>
            </div>
          </dl>

        </section>

        {invitation.status === 'accepted' ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {t('invitation.acceptedManagementHint')}
          </p>
        ) : null}

        {!hasEventAccess ? (
          <ClosedTestingAccessRequest featureId={EVENT_FEATURE_KEY} reason="participant" />
        ) : null}

        <EventAttendanceInvitationActions
          invitationId={invitation.invitationId}
          eventId={invitation.eventId}
          hasEventAccess={hasEventAccess}
          status={invitation.status}
        />
      </div>
    </EventShell>
  )
}
