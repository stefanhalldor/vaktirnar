import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseItemView } from '@/lib/expenses/repository.server'

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>
}) {
  const [{ expenseId }, { user }, t] = await Promise.all([
    params,
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
