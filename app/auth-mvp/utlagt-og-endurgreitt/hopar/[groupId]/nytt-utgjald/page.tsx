import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import {
  getExpenseDraftPublicationLifecycle,
  getExpenseGroupView,
  getExpensePrivateDraft,
} from '@/lib/expenses/repository.server'
import { parseExpenseDraftId } from '@/lib/expenses/flow'
import { isExpenseEventContext } from '@/lib/events/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export default async function NewGroupExpensePage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ draft?: string | string[] }> }) {
  const [{ groupId }, { user }, t, query] = await Promise.all([params, guardExpenseAccess(), getExpenseTranslations(), searchParams])
  const group = await getExpenseGroupView(user.id, groupId)
  if (!group || !group.canCreateExpense) notFound()
  const eventClassification = await isExpenseEventContext(user.id, group.id)
    .then((value) => ({ value, reliable: true }))
    .catch(() => ({ value: true, reliable: false }))
  const isEventContext = eventClassification.value
  const canUseEventUi = eventClassification.reliable && isEventContext && await checkFeatureAccess(
    user.id,
    user.email ?? '',
    'afmaeli-og-vidburdir',
  )
  const draftId = parseExpenseDraftId(query.draft)
  const draft = draftId ? await getExpensePrivateDraft(user.id, draftId) : null
  const safeDraft = draft?.contextType === 'group' && draft.groupId === group.id ? draft : null
  const publicationLifecycle = safeDraft
    ? await getExpenseDraftPublicationLifecycle(user.id, safeDraft.id)
    : null
  return (
    <ExpenseShell
      title={t('expenseForm.groupTitle')}
      homeLabel={t('homeLabel')}
      backHref={canUseEventUi ? `/auth-mvp/vidburdir/${group.id}` : `/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
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
        draftBaseHref={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}/nytt-utgjald`}
      />
    </ExpenseShell>
  )
}
