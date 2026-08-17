import { getTranslations } from 'next-intl/server'
import { EventList } from '@/components/events/EventList'
import { guardEventAccess } from '@/lib/events/guard'
import { listEventDashboard } from '@/lib/events/repository.server'
import { EventShell } from './EventShell'
import { TeskeidUnreadSection } from '@/components/teskeid/TeskeidUnreadSection.server'

export default async function EventsPage() {
  const [{ user }, t] = await Promise.all([
    guardEventAccess(),
    getTranslations('teskeid.events'),
  ])
  const dashboard = await listEventDashboard(user.id)
  return (
    <EventShell title={t('title')} homeLabel={t('homeLabel')}>
      <TeskeidUnreadSection user={user} source="events" />
      <EventList dashboard={dashboard} />
    </EventShell>
  )
}
