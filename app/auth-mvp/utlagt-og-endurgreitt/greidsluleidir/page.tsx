import { ExpensePaymentPreferences } from '@/components/expenses/ExpensePaymentPreferences'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseDashboard, getExpensePaymentPreferences } from '@/lib/expenses/repository.server'

export default async function ExpensePaymentPreferencesPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  const [preferences, dashboard] = await Promise.all([
    getExpensePaymentPreferences(user.id),
    getExpenseDashboard(user.id),
  ])
  const groups = [...dashboard.groups, ...dashboard.oneOffs].map((group) => ({ id: group.id, name: group.name }))

  return (
    <ExpenseShell title={t('preferences.title')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')}>
      <ExpensePaymentPreferences preferences={preferences} groups={groups} />
    </ExpenseShell>
  )
}
