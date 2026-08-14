import { ExpenseGroupForm } from '@/components/expenses/ExpenseGroupForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'

export default async function NewExpenseGroupPage() {
  const [{ user }, t] = await Promise.all([guardExpenseAccess(), getExpenseTranslations()])
  let options: ExpenseParticipantOption[] = []
  let optionsError = false
  try { options = await getExpenseParticipantOptions(user.id) } catch { optionsError = true }
  return (
    <ExpenseShell title={t('groupForm.title')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt">
      <ExpenseGroupForm options={options} optionsError={optionsError} />
    </ExpenseShell>
  )
}
