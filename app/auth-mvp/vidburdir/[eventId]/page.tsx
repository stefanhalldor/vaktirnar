import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { EventAttendeeDetail } from '@/components/events/EventAttendeeDetail'
import { EventExpenseActivity } from '@/components/expenses/EventExpenseActivity'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { canUseEventExpenses, guardEventSession } from '@/lib/events/guard'
import {
  getEventAttendeeContext,
  getEventContext,
  getEventExpenseActivity,
} from '@/lib/events/repository.server'
import type { EventExpenseActivityView } from '@/lib/events/contracts'
import { getEventRosterManagementV2 } from '@/lib/events/participant-identity-v2.repository.server'
import { getEventActorViewV3 } from '@/lib/events/participant-identity-v3.repository.server'
import { EventShell } from '../EventShell'

export const maxDuration = 60

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const [{ eventId }, { user }, t] = await Promise.all([
    params,
    guardEventSession(),
    getTranslations('teskeid.events'),
  ])
  const actorView = await getEventActorViewV3(user.id, eventId)
  if (!actorView) notFound()
  if (actorView.viewerRole === 'attendee') {
    const legacyAcceptedContext = await getEventAttendeeContext(user.id, eventId).catch(() => null)
    const canUseExpenses = Boolean(legacyAcceptedContext) && await canUseEventExpenses(user)
    let expenseActivity: EventExpenseActivityView | null = null
    if (canUseExpenses) {
      try {
        expenseActivity = await getEventExpenseActivity(user.id, actorView.eventId) ?? {
          status: 'unavailable', expenses: [], positions: [],
        }
      } catch {
        expenseActivity = { status: 'unavailable', expenses: [], positions: [] }
      }
    }
    return (
      <EventShell
        title={actorView.name}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/vidburdir"
        backLabel={t('backToList')}
      >
        <EventAttendeeDetail
          event={actorView}
          canUseExpenses={canUseExpenses}
          financialPanel={expenseActivity ? (
            <EventExpenseActivity key="event-expense-activity" view={expenseActivity} />
          ) : null}
        />
      </EventShell>
    )
  }

  const event = await getEventContext(user.id, eventId)
  const rosterManagement = await getEventRosterManagementV2(user.id, eventId)
  if (!event || !rosterManagement) notFound()

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
        identityView={actorView}
        rosterManagement={rosterManagement}
        options={options}
        optionsError={optionsError}
        canUseExpenses={canUseExpenses}
        financialPanel={expenseActivity ? (
          <EventExpenseActivity key="event-expense-activity" view={expenseActivity} />
        ) : null}
      />
    </EventShell>
  )
}
