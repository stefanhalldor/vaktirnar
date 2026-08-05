import { notFound } from 'next/navigation'
import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { parseExpenseSavedView } from '@/lib/expenses/flow'
import { getExpenseItemView } from '@/lib/expenses/repository.server'

export default async function ExpenseItemPage({ params, searchParams }: { params: Promise<{ expenseId: string }>; searchParams: Promise<{ view?: string | string[] }> }) {
  const [{ expenseId }, { user }, t, query] = await Promise.all([
    params,
    guardExpenseAccess(),
    getExpenseTranslations(),
    searchParams,
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
      <ExpenseItemDetail group={result.group} expense={result.expense} view={parseExpenseSavedView(query.view)} />
    </ExpenseShell>
  )
}
