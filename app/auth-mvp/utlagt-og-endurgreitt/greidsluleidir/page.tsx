import { ExpensePaymentPreferences } from '@/components/expenses/ExpensePaymentPreferences'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpensePaymentProfileV2 } from '@/lib/expenses/repository.server'

export default async function ExpensePaymentPreferencesPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  const profile = await getExpensePaymentProfileV2(user.id)

  return (
    <ExpenseShell title={t('preferences.title')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt">
      <ExpensePaymentPreferences profile={profile} />
    </ExpenseShell>
  )
}
