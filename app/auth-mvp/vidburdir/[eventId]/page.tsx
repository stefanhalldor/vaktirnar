import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { getExpenseGroupView } from '@/lib/expenses/repository.server'
import { guardEventAccess } from '@/lib/events/guard'
import { getEventContext } from '@/lib/events/repository.server'
import { EventShell } from '../EventShell'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const [{ eventId }, { user }, t] = await Promise.all([
    params,
    guardEventAccess(),
    getTranslations('teskeid.events'),
  ])
  const event = await getEventContext(user.id, eventId)
  if (!event) notFound()

  // Event ownership alone never authorizes financial reads. Resolve the
  // canonical expense view independently before handing amounts to the UI.
  const group = await getExpenseGroupView(user.id, eventId, {
    includeCurrentPaymentInstructions: true,
  })
  if (!group) notFound()

  return (
    <EventShell
      title={event.name}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/vidburdir"
      backLabel={t('backToList')}
    >
      <EventDetail event={event} group={group} />
    </EventShell>
  )
}
