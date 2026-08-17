import { getLocale } from 'next-intl/server'
import { ExpensePayAll } from '@/components/expenses/ExpensePayAll'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpensePayAllView } from '@/lib/expenses/repository.server'

export default async function ExpensePayAllPage() {
  const [{ user }, t, locale] = await Promise.all([
    guardExpenseAccess(),
    getExpenseTranslations(),
    getLocale(),
  ])
  const view = await getExpensePayAllView(user.id)

  return (
    <ExpenseShell
      title={t('payAll.title')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      {view ? (
        <ExpensePayAll view={view} locale={locale} initialDate={new Date().toISOString().slice(0, 10)} />
      ) : null}
    </ExpenseShell>
  )
}
