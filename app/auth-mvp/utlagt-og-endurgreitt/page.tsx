import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseDashboard, getExpensePaymentProfileV2 } from '@/lib/expenses/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export default async function ExpensesPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  const [dashboard, paymentProfile, canUseCircles] = await Promise.all([
    getExpenseDashboard(user.id),
    getExpensePaymentProfileV2(user.id),
    checkFeatureAccess(user.id, user.email!, 'tengsl'),
  ])
  return (
    <ExpenseShell title={t('title')} homeLabel={t('homeLabel')}>
      <ExpenseDashboard dashboard={dashboard} paymentProfile={paymentProfile} canUseCircles={canUseCircles} />
    </ExpenseShell>
  )
}
