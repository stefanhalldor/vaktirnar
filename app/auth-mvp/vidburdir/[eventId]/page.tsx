import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { EventAttendeeDetail } from '@/components/events/EventAttendeeDetail'
import { EventExpensePreview } from '@/components/expenses/EventExpensePreview'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { canUseEventExpenses, guardEventAccess } from '@/lib/events/guard'
import {
  getEventAttendeeContext,
  getEventContext,
  getEventExpensePreview,
} from '@/lib/events/repository.server'
import type { EventExpensePreviewView } from '@/lib/events/contracts'
import { EventShell } from '../EventShell'

export const maxDuration = 60

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
  if (!event) {
    const attendeeEvent = await getEventAttendeeContext(user.id, eventId)
    if (!attendeeEvent) notFound()
    return (
      <EventShell
        title={attendeeEvent.name}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/vidburdir"
        backLabel={t('backToList')}
      >
        <EventAttendeeDetail event={attendeeEvent} />
      </EventShell>
    )
  }

  // Owner-only branch. Participant reads never load relationship options,
  // expense capability or financial previews.
  const canUseExpenses = await canUseEventExpenses(user)
  let expensePreview: EventExpensePreviewView | null = null
  if (canUseExpenses) {
    try {
      expensePreview = await getEventExpensePreview(user.id, event.id) ?? {
        eventId: event.id,
        status: 'unavailable',
        taggedExpenseCount: 0,
        currencies: [],
      }
    } catch {
      expensePreview = {
        eventId: event.id,
        status: 'unavailable',
        taggedExpenseCount: 0,
        currencies: [],
      }
    }
  }
  let options: ExpenseParticipantOption[] = []
  let optionsError = false
  try {
    options = await getExpenseParticipantOptions(user.id)
  } catch {
    optionsError = true
  }

  return (
    <EventShell
      title={event.name}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/vidburdir"
      backLabel={t('backToList')}
    >
      <EventDetail
        event={event}
        options={options}
        optionsError={optionsError}
        canUseExpenses={canUseExpenses}
        financialPanel={expensePreview ? (
          <EventExpensePreview
            eventName={event.name}
            preview={expensePreview}
            showSettlementLink
          />
        ) : null}
      />
    </EventShell>
  )
}
