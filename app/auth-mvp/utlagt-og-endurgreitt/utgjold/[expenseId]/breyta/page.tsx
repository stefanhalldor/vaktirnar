import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { expenseDetailHref, parseExpenseDraftId, parseExpenseFlowStep } from '@/lib/expenses/flow'
import { getExpenseItemView, getExpensePrivateDraft } from '@/lib/expenses/repository.server'

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>
  searchParams: Promise<{ step?: string | string[]; draft?: string | string[] }>
}) {
  const [{ expenseId }, query, { user }, t] = await Promise.all([
    params,
    searchParams,
    guardExpenseAccess(),
    getExpenseTranslations(),
  ])
  const result = await getExpenseItemView(user.id, expenseId)
  if (!result) notFound()

  const { expense, group } = result
  const hasLockedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'reported' || repayment.status === 'confirmed',
  )
  const canEdit = expense.status === 'active'
    && group.status === 'active'
    && !hasLockedRepayment
    && (expense.createdBySelf || group.canManage)
  if (!canEdit) notFound()

  const draftId = parseExpenseDraftId(query.draft)
  const draft = draftId ? await getExpensePrivateDraft(user.id, draftId) : null
  const safeDraft = draft?.contextType === 'edit'
    && draft.groupId === group.id
    && draft.expenseId === expense.id
    ? draft
    : null
  const initialStep = safeDraft?.currentStep ?? parseExpenseFlowStep(query.step)
  const referencedMemberIds = new Set([
    ...expense.payments.map((payment) => payment.memberId),
    ...expense.shares.map((share) => share.memberId),
  ])
  const sharedMemberIds = new Set(expense.shares.map((share) => share.memberId))

  return (
    <ExpenseShell
      title={t('expenseForm.editTitle')}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`}
      backLabel={t('back')}
    >
      <ExpenseForm
        mode={group.kind}
        groupId={group.id}
        defaultCurrency={expense.currency}
        initialDate={expense.incurredOn}
        initialStep={initialStep}
        draft={safeDraft}
        draftBaseHref={`${expenseDetailHref(expense.id)}/breyta`}
        initialMembers={group.members
          .filter((member) => member.status === 'active' || referencedMemberIds.has(member.id))
          .map((member) => ({
            key: member.id,
            label: member.displayName,
            isSelf: member.isSelf,
            included: sharedMemberIds.has(member.id),
          }))}
        edit={{ expense, expectedFinancialVersion: group.financialVersion }}
      />
    </ExpenseShell>
  )
}
