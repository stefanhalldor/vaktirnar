import { notFound } from 'next/navigation'
import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseItemView } from '@/lib/expenses/repository.server'

export default async function ExpenseItemPage({ params }: { params: Promise<{ expenseId: string }> }) {
  const [{ expenseId }, { user }, t] = await Promise.all([
    params,
    guardExpenseAccess(),
    getExpenseTranslations(),
  ])
  const result = await getExpenseItemView(user.id, expenseId)
  if (!result) notFound()

  return (
    <ExpenseShell
      title={result.expense.title}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/utlagt-og-endurgreitt/hopar/${result.group.id}`}
      backLabel={t('back')}
    >
      <ExpenseItemDetail group={result.group} expense={result.expense} />
    </ExpenseShell>
  )
}
