import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { EventAttendeeDetail } from '@/components/events/EventAttendeeDetail'
import { EventExpenseActivityV3 } from '@/components/expenses/EventExpenseActivityV3'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { canUseExpenseDestination } from '@/lib/expenses/guard'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import {
  canUseEventExpenses,
  guardEventSession,
  isEventExpenseReadEnabled,
} from '@/lib/events/guard'
import {
  getEventAttendeeContext,
  getEventContext,
  getEventExpenseActivityV3,
} from '@/lib/events/repository.server'
import type { EventExpenseActivityV3View } from '@/lib/events/contracts'
import { getEventRosterManagementV2 } from '@/lib/events/participant-identity-v2.repository.server'
import { getEventActorViewV3 } from '@/lib/events/participant-identity-v3.repository.server'
import { EventShell } from '../EventShell'

export const maxDuration = 60

const unavailableExpenseActivityV3 = (): EventExpenseActivityV3View => ({
  contractVersion: 3,
  status: 'unavailable',
  expenses: [],
  positions: [],
})

async function loadExpenseActivityV3(
  actorUserId: string,
  eventId: string,
): Promise<EventExpenseActivityV3View> {
  try {
    return await getEventExpenseActivityV3(actorUserId, eventId)
      ?? unavailableExpenseActivityV3()
  } catch {
    return unavailableExpenseActivityV3()
  }
}

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
  const expenseReadEnabled = isEventExpenseReadEnabled()
  if (actorView.viewerRole === 'attendee') {
    const [legacyAcceptedContext, expenseActivity] = await Promise.all([
      getEventAttendeeContext(user.id, eventId).catch(() => null),
      expenseReadEnabled
        ? loadExpenseActivityV3(user.id, actorView.eventId)
        : Promise.resolve(null),
    ])
    const canCreateExpense = Boolean(legacyAcceptedContext) && await canUseEventExpenses(user)
    const canSettle = Boolean(expenseActivity && expenseActivity.positions.length > 0)
      && await canUseExpenseDestination(user)
    return (
      <EventShell
        title={actorView.name}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/vidburdir"
        backLabel={t('backToList')}
      >
        <EventAttendeeDetail
          event={actorView}
          canCreateExpense={canCreateExpense}
          financialPanel={expenseActivity ? (
            <EventExpenseActivityV3
              key="event-expense-activity-v3"
              view={expenseActivity}
              canSettle={canSettle}
            />
          ) : null}
        />
      </EventShell>
    )
  }

  const event = await getEventContext(user.id, eventId)
  const rosterManagement = await getEventRosterManagementV2(user.id, eventId)
  if (!event || !rosterManagement) notFound()

  const [canCreateExpense, expenseActivity] = await Promise.all([
    canUseEventExpenses(user),
    expenseReadEnabled
      ? loadExpenseActivityV3(user.id, event.id)
      : Promise.resolve(null),
  ])
  const canSettle = Boolean(expenseActivity && expenseActivity.positions.length > 0)
    && await canUseExpenseDestination(user)
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
        canCreateExpense={canCreateExpense}
        financialPanel={expenseActivity ? (
          <EventExpenseActivityV3
            key="event-expense-activity-v3"
            view={expenseActivity}
            canSettle={canSettle}
          />
        ) : null}
      />
    </EventShell>
  )
}
