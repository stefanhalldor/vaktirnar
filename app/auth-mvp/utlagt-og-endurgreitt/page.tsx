import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseDashboard, getExpensePaymentProfileV2 } from '@/lib/expenses/repository.server'

export default async function ExpensesPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  const [dashboard, paymentProfile] = await Promise.all([
    getExpenseDashboard(user.id),
    getExpensePaymentProfileV2(user.id),
  ])
  return (
    <ExpenseShell title={t('title')} homeLabel={t('homeLabel')}>
      <ExpenseDashboard dashboard={dashboard} paymentProfile={paymentProfile} />
    </ExpenseShell>
  )
}
