import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { EventList } from '@/components/events/EventList'
import { guardEventSession, hasEventFeatureAccess } from '@/lib/events/guard'
import { listEventDashboard } from '@/lib/events/repository.server'
import {
  listEventPersonSourceEventsV3,
  listEventsForActorV3,
} from '@/lib/events/participant-identity-v3.repository.server'
import { EventShell } from './EventShell'
import { TeskeidUnreadSection } from '@/components/teskeid/TeskeidUnreadSection.server'

export default async function EventsPage() {
  const [{ user }, t] = await Promise.all([
    guardEventSession(),
    getTranslations('teskeid.events'),
  ])
  const canManageEvents = await hasEventFeatureAccess(user)
  // The bounded v3 directory read claims at most one batch. The cursor read then
  // projects the durable, object-scoped list without widening Events entitlement.
  const directory = await listEventsForActorV3(user.id)
  const initialPage = await listEventPersonSourceEventsV3(user.id, null, 20)
  if (!canManageEvents && initialPage.events.length === 0 && !directory.claimHasMore) {
    redirect('/auth-mvp/heim')
  }
  const dashboard = canManageEvents ? await listEventDashboard(user.id) : null
  return (
    <EventShell title={t('title')} homeLabel={t('homeLabel')}>
      {canManageEvents ? <TeskeidUnreadSection user={user} source="events" /> : null}
      <EventList
        dashboard={dashboard}
        directory={directory}
        initialPage={initialPage}
        canManageEvents={canManageEvents}
      />
    </EventShell>
  )
}
