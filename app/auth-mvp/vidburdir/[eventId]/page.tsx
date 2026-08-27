import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { EventDetail } from '@/components/events/EventDetail'
import { EventAttendeeDetail } from '@/components/events/EventAttendeeDetail'
import { EventExpenseActivityV3 } from '@/components/expenses/EventExpenseActivityV3'
import { ExpenseContextDraftList } from '@/components/expenses/ExpenseContextDraftList'
import { EventAttachExistingExpense } from '@/components/expenses/EventAttachExistingExpense'
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
  getEventExpensePreActiveV1,
  listEventAttachableExpensesV1,
} from '@/lib/events/repository.server'
import type { EventExpenseActivityV3View, EventExpensePreActiveV1View } from '@/lib/events/contracts'
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

const unavailableExpensePreActiveV1 = (): EventExpensePreActiveV1View => ({
  contractVersion: 1,
  status: 'unavailable',
  items: [],
})

async function loadExpensePreActiveV1(
  actorUserId: string,
  eventId: string,
): Promise<EventExpensePreActiveV1View> {
  try {
    return await getEventExpensePreActiveV1(actorUserId, eventId)
      ?? unavailableExpensePreActiveV1()
  } catch {
    return unavailableExpensePreActiveV1()
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const [{ eventId }, { user }, t, locale] = await Promise.all([
    params,
    guardEventSession(),
    getTranslations('teskeid.events'),
    getLocale(),
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
    const expenseDrafts = expenseReadEnabled
      ? await loadExpensePreActiveV1(user.id, actorView.eventId)
      : null
    const rosterRevision = Number(actorView.rosterRevision)
    const attachableExpenses = canCreateExpense && Number.isSafeInteger(rosterRevision)
      ? await listEventAttachableExpensesV1(user.id, actorView.eventId, rosterRevision)
      : null
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
          financialPanel={expenseActivity || expenseDrafts || attachableExpenses ? (
            <Fragment key="event-expense-activity-v3">
              {expenseActivity ? (
                <EventExpenseActivityV3 view={expenseActivity} canSettle={canSettle} />
              ) : null}
              {expenseDrafts ? (
                <ExpenseContextDraftList view={expenseDrafts} locale={locale} />
              ) : null}
              {attachableExpenses ? (
                <EventAttachExistingExpense
                  eventId={actorView.eventId}
                  rosterRevision={rosterRevision}
                  directory={attachableExpenses}
                />
              ) : null}
            </Fragment>
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
  const expenseDrafts = expenseReadEnabled
    ? await loadExpensePreActiveV1(user.id, event.id)
    : null
  const attachableExpenses = canCreateExpense
    ? await listEventAttachableExpensesV1(user.id, event.id, event.rosterRevision)
    : null
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
        financialPanel={expenseActivity || expenseDrafts || attachableExpenses ? (
          <Fragment key="event-expense-activity-v3">
            {expenseActivity ? (
              <EventExpenseActivityV3 view={expenseActivity} canSettle={canSettle} />
            ) : null}
            {expenseDrafts ? (
              <ExpenseContextDraftList view={expenseDrafts} locale={locale} />
            ) : null}
            {attachableExpenses ? (
              <EventAttachExistingExpense
                eventId={event.id}
                rosterRevision={event.rosterRevision}
                directory={attachableExpenses}
              />
            ) : null}
          </Fragment>
        ) : null}
      />
    </EventShell>
  )
}
