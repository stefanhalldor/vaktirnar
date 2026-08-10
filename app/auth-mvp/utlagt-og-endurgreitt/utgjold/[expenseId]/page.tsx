import { notFound } from 'next/navigation'
import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { parseExpenseSavedView } from '@/lib/expenses/flow'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { getExpenseItemLookup } from '@/lib/expenses/repository.server'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'

export default async function ExpenseItemPage({ params, searchParams }: { params: Promise<{ expenseId: string }>; searchParams: Promise<{ view?: string | string[] }> }) {
  const [{ expenseId }, { user }, t, query] = await Promise.all([
    params,
    guardExpenseAccess(),
    getExpenseTranslations(),
    searchParams,
  ])
  const result = await getExpenseItemLookup(user.id, expenseId, {
    includeCurrentPaymentInstructions: true,
  })
  if (result.status === 'not_found') notFound()
  if (result.status === 'forbidden') {
    return (
      <ExpenseShell
        title={t('noAccess.title')}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/utlagt-og-endurgreitt"
        backLabel={t('back')}
      >
        <div role="alert" className="space-y-3 border-y border-border py-6">
          <p className="font-semibold">{t('noAccess.heading')}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t('noAccess.body')}</p>
        </div>
      </ExpenseShell>
    )
  }
  let participantOptions: ExpenseParticipantOption[] = []
  let participantOptionsError = false
  if (result.group.kind === 'one_off' && result.group.canManage) {
    try {
      participantOptions = await getExpenseParticipantOptions(user.id)
    } catch {
      participantOptionsError = true
    }
  }

  return (
    <ExpenseShell
      title={result.expense.title}
      homeLabel={t('homeLabel')}
      backHref={result.group.kind === 'one_off'
        ? '/auth-mvp/utlagt-og-endurgreitt'
        : `/auth-mvp/utlagt-og-endurgreitt/hopar/${result.group.id}`}
      backLabel={t('back')}
    >
      <ExpenseItemDetail
        group={result.group}
        expense={result.expense}
        view={parseExpenseSavedView(query.view)}
        initialDate={new Date().toISOString().slice(0, 10)}
        participantOptions={participantOptions}
        participantOptionsError={participantOptionsError}
      />
    </ExpenseShell>
  )
}
