import { getTranslations } from 'next-intl/server'
import { EventList } from '@/components/events/EventList'
import { guardEventAccess } from '@/lib/events/guard'
import { listEvents } from '@/lib/events/repository.server'
import { EventShell } from './EventShell'

export default async function EventsPage() {
  const [{ user }, t] = await Promise.all([
    guardEventAccess(),
    getTranslations('teskeid.events'),
  ])
  const events = await listEvents(user.id)
  return (
    <EventShell title={t('title')} homeLabel={t('homeLabel')}>
      <EventList events={events} />
    </EventShell>
  )
}
