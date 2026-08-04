import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseDashboard } from '@/lib/expenses/repository.server'

export default async function ExpensesPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  const dashboard = await getExpenseDashboard(user.id)
  return (
    <ExpenseShell title={t('title')} homeLabel={t('homeLabel')}>
      <ExpenseDashboard dashboard={dashboard} />
    </ExpenseShell>
  )
}
