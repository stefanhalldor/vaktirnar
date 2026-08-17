import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { EventAttendeeDetail } from '@/components/events/EventAttendeeDetail'
import { EventExpenseActivity } from '@/components/expenses/EventExpenseActivity'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { canUseEventExpenses, guardEventAccess } from '@/lib/events/guard'
import {
  getEventAttendeeContext,
  getEventContext,
  getEventDetails,
  getEventExpenseActivity,
} from '@/lib/events/repository.server'
import type { EventDetailsView, EventExpenseActivityView } from '@/lib/events/contracts'
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
  const emptyDetails: EventDetailsView = {
    eventId,
    eventDate: null,
    eventTime: null,
    description: null,
    agenda: null,
  }
  const details = await getEventDetails(user.id, eventId).catch(() => null) ?? emptyDetails
  const event = await getEventContext(user.id, eventId)
  if (!event) {
    const attendeeEvent = await getEventAttendeeContext(user.id, eventId)
    if (!attendeeEvent) notFound()
    const canUseExpenses = await canUseEventExpenses(user)
    let expenseActivity: EventExpenseActivityView | null = null
    if (canUseExpenses) {
      try {
        expenseActivity = await getEventExpenseActivity(user.id, attendeeEvent.id) ?? {
          status: 'unavailable', expenses: [], positions: [],
        }
      } catch {
        expenseActivity = { status: 'unavailable', expenses: [], positions: [] }
      }
    }
    return (
      <EventShell
        title={attendeeEvent.name}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/vidburdir"
        backLabel={t('backToList')}
      >
        <EventAttendeeDetail
          event={attendeeEvent}
          details={details}
          canUseExpenses={canUseExpenses}
          financialPanel={expenseActivity ? <EventExpenseActivity view={expenseActivity} /> : null}
        />
      </EventShell>
    )
  }

  const canUseExpenses = await canUseEventExpenses(user)
  let expenseActivity: EventExpenseActivityView | null = null
  if (canUseExpenses) {
    try {
      expenseActivity = await getEventExpenseActivity(user.id, event.id) ?? {
        status: 'unavailable',
        expenses: [],
        positions: [],
      }
    } catch {
      expenseActivity = {
        status: 'unavailable',
        expenses: [],
        positions: [],
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
        details={details}
        options={options}
        optionsError={optionsError}
        canUseExpenses={canUseExpenses}
        financialPanel={expenseActivity ? <EventExpenseActivity view={expenseActivity} /> : null}
      />
    </EventShell>
  )
}
