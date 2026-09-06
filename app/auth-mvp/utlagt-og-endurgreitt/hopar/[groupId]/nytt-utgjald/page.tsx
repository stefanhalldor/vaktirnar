import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseDraftDeleteOnly } from '@/components/expenses/ExpenseDraftDeleteOnly'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import {
  getExpenseCreationDraftDeleteCapability,
  getExpenseDraftPublicationLifecycle,
  getExpenseGroupView,
  getExpensePrivateDraft,
} from '@/lib/expenses/repository.server'
import { parseExpenseDraftId } from '@/lib/expenses/flow'
import { isExpenseEventContext } from '@/lib/events/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export default async function NewGroupExpensePage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ draft?: string | string[] }> }) {
  const [{ groupId }, { user }, t, query] = await Promise.all([params, guardExpenseAccess(), getExpenseTranslations(), searchParams])
  const draftId = parseExpenseDraftId(query.draft)
  const [group, requestedDeleteCapability] = await Promise.all([
    getExpenseGroupView(user.id, groupId),
    draftId
      ? getExpenseCreationDraftDeleteCapability(user.id, draftId)
      : Promise.resolve(undefined),
  ])
  const hasExactGroupDeleteCapability = requestedDeleteCapability?.status === 'ready'
    && requestedDeleteCapability.contextType === 'group'
    && requestedDeleteCapability.groupId === groupId
  const dashboardHref = '/auth-mvp/utlagt-og-endurgreitt'
  if (!group || !group.canCreateExpense) {
    if (!hasExactGroupDeleteCapability) notFound()
    const readableContextHref = group
      ? `/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`
      : dashboardHref
    return (
      <ExpenseShell
        title={t('deleteControl.deleteOnly.pageTitle')}
        homeLabel={t('homeLabel')}
        backHref={readableContextHref}
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <ExpenseDraftDeleteOnly
          capability={requestedDeleteCapability}
          statusHref={readableContextHref}
          successHref={readableContextHref}
        />
      </ExpenseShell>
    )
  }
  const eventClassification = await isExpenseEventContext(user.id, group.id)
    .then((value) => ({ value, reliable: true }))
    .catch(() => ({ value: true, reliable: false }))
  const isEventContext = eventClassification.value
  const canUseEventUi = eventClassification.reliable && isEventContext && await checkFeatureAccess(
    user.id,
    user.email ?? '',
    'afmaeli-og-vidburdir',
  )
  const draft = draftId
    ? await getExpensePrivateDraft(user.id, draftId).catch((error: unknown) => {
        if (hasExactGroupDeleteCapability) return null
        throw error
      })
    : null
  const safeDraft = draft?.contextType === 'group' && draft.groupId === group.id ? draft : null
  if (!safeDraft && hasExactGroupDeleteCapability) {
    const managementHref = `/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`
    return (
      <ExpenseShell
        title={t('deleteControl.deleteOnly.pageTitle')}
        homeLabel={t('homeLabel')}
        backHref={managementHref}
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <ExpenseDraftDeleteOnly
          capability={requestedDeleteCapability}
          statusHref={managementHref}
          successHref={managementHref}
        />
      </ExpenseShell>
    )
  }
  const publicationLifecycle = safeDraft
    ? await getExpenseDraftPublicationLifecycle(user.id, safeDraft.id)
    : null
  const creationDraftDeleteCapability = safeDraft
    ? requestedDeleteCapability
    : undefined
  const managementHref = canUseEventUi
    ? `/auth-mvp/vidburdir/${group.id}`
    : `/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`
  const readableExpenseGroupHref = `/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`
  return (
    <ExpenseShell
      title={t('expenseForm.groupTitle')}
      homeLabel={t('homeLabel')}
      backHref={managementHref}
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <ExpenseForm
        mode="group"
        groupId={group.id}
        defaultCurrency={group.defaultCurrency}
        initialDate={new Date().toISOString().slice(0, 10)}
        initialMembers={group.members
          .filter((member) => member.status === 'active')
          .map((member) => ({
            key: member.id,
            label: member.displayName,
            isSelf: member.isSelf,
            included: member.isSelf ? group.defaultIncludeCreator : !isEventContext,
          }))}
        eventContext={isEventContext}
        draft={safeDraft}
        publicationLifecycle={publicationLifecycle}
        creationDraftDeleteCapability={creationDraftDeleteCapability}
        deleteStatusHref={readableExpenseGroupHref}
        deleteSuccessHref={readableExpenseGroupHref}
        draftBaseHref={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}/nytt-utgjald`}
      />
    </ExpenseShell>
  )
}
