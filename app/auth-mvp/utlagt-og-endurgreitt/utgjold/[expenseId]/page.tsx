import { notFound } from 'next/navigation'
import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseSession } from '@/lib/expenses/guard'
import { parseExpenseSavedView } from '@/lib/expenses/flow'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import {
  getExpenseEventIdentityCandidates,
  getExpenseRelationshipIdentityManagement,
  getExpenseItemLookup,
} from '@/lib/expenses/repository.server'
import type {
  ExpenseParticipantOption,
  ExpenseRelationshipIdentityManagementState,
} from '@/lib/expenses/contracts'
import {
  getExpenseEventLinkManagementV2,
  getExpenseLinkedEventId,
  isExpenseEventContext,
} from '@/lib/events/repository.server'
import { eventDetailPath } from '@/lib/events/contracts'
import { canUseEventExpenses } from '@/lib/events/guard'
import { canEditExpense } from '@/lib/expenses/policy'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EXPENSE_FEATURE_KEY } from '@/lib/expenses/contracts'

export default async function ExpenseItemPage({ params, searchParams }: { params: Promise<{ expenseId: string }>; searchParams: Promise<{ view?: string | string[] }> }) {
  const [{ expenseId }, { user }, t, query] = await Promise.all([
    params,
    guardExpenseSession(),
    getExpenseTranslations(),
    searchParams,
  ])
  const result = await getExpenseItemLookup(user.id, expenseId, {
    includeCurrentPaymentInstructions: true,
  })
  if (result.status === 'not_found') notFound()
  if (result.status === 'forbidden') {
    return (
      <ExpenseShell
        title={t('noAccess.title')}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/utlagt-og-endurgreitt"
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <div role="alert" className="space-y-3 border-y border-border py-6">
          <p className="font-semibold">{t('noAccess.heading')}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t('noAccess.body')}</p>
        </div>
      </ExpenseShell>
    )
  }
  const canEdit = canEditExpense({
    expenseStatus: result.expense.status,
    groupStatus: result.group.status,
    createdBySelf: result.expense.createdBySelf,
    canManage: result.group.canManage,
  })
  const [canUseEvents, canUseExpenses] = await Promise.all([
    canUseEventExpenses(user),
    checkFeatureAccess(user.id, user.email!, EXPENSE_FEATURE_KEY),
  ])
  let eventLinkManagement = null
  let eventLinkManagementUnavailable = false
  if (canEdit && result.group.kind === 'one_off' && canUseEvents) {
    try {
      eventLinkManagement = await getExpenseEventLinkManagementV2(user.id, result.expense.id)
    } catch {
      eventLinkManagementUnavailable = true
    }
  }
  const managedEvent = eventLinkManagement?.currentEvent ?? null
  const fallbackLinkedEventId = eventLinkManagement === null
    ? await getExpenseLinkedEventId(user.id, result.expense.id).catch(() => null)
    : null
  const linkedEventId = managedEvent?.id ?? fallbackLinkedEventId
  const canOpenLinkedEvent = managedEvent?.canOpen ?? Boolean(fallbackLinkedEventId)
  const eventClassification = !linkedEventId && result.group.kind === 'group'
    ? await isExpenseEventContext(user.id, result.group.id)
      .then((value) => ({ value, reliable: true }))
      .catch(() => ({ value: true, reliable: false }))
    : { value: false, reliable: true }
  const isEventContext = Boolean(linkedEventId) || eventClassification.value
  const canUseEventUi = canUseEvents && (
    linkedEventId
      ? canOpenLinkedEvent
      : eventClassification.value && eventClassification.reliable
  )
  let participantOptions: ExpenseParticipantOption[] = []
  let participantOptionsError = false
  if (result.group.kind === 'one_off' && result.group.canManage) {
    try {
      participantOptions = await getExpenseParticipantOptions(user.id)
    } catch {
      participantOptionsError = true
    }
  }
  const eventIdentityCandidates = result.group.canManage && linkedEventId
    ? await getExpenseEventIdentityCandidates(user.id, result.expense.id)
      .catch(() => null)
    : null
  let relationshipIdentityManagementState: ExpenseRelationshipIdentityManagementState = { status: 'absent' }
  if (result.group.canManage && result.group.kind === 'one_off') {
    try {
      relationshipIdentityManagementState = await getExpenseRelationshipIdentityManagement(
        user.id,
        result.expense.id,
      )
    } catch {
      relationshipIdentityManagementState = { status: 'unavailable' }
    }
  }

  return (
    <ExpenseShell
      title={result.expense.title}
      homeLabel={t('homeLabel')}
      backHref={!canUseExpenses
        ? '/auth-mvp/heim'
        : canUseEventUi
        ? eventDetailPath(linkedEventId ?? result.group.id)
        : result.group.kind === 'one_off'
        ? '/auth-mvp/utlagt-og-endurgreitt'
        : `/auth-mvp/utlagt-og-endurgreitt/hopar/${result.group.id}`}
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <ExpenseItemDetail
        group={result.group}
        expense={result.expense}
        view={parseExpenseSavedView(query.view)}
        initialDate={new Date().toISOString().slice(0, 10)}
        participantOptions={participantOptions}
        participantOptionsError={participantOptionsError}
        isEventContext={isEventContext}
        eventHref={canUseEventUi && linkedEventId ? eventDetailPath(linkedEventId) : null}
        eventLinkManagement={eventLinkManagement}
        eventLinkManagementUnavailable={eventLinkManagementUnavailable}
        eventIdentityCandidates={eventIdentityCandidates}
        relationshipIdentityManagementState={relationshipIdentityManagementState}
      />
    </ExpenseShell>
  )
}
