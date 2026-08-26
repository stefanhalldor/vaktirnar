import { notFound } from 'next/navigation'

import { ExpenseSharedDraftDetail } from '@/components/expenses/ExpenseSharedDraftDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseSession } from '@/lib/expenses/guard'
import { getExpenseSharedDraftDetail } from '@/lib/expenses/repository.server'

export default async function ExpenseSharedDraftPage({
  params,
}: {
  params: Promise<{ publicationId: string }>
}) {
  const [{ publicationId }, { user }, t] = await Promise.all([
    params,
    guardExpenseSession(),
    getExpenseTranslations(),
  ])
  const detail = await getExpenseSharedDraftDetail(user.id, publicationId)
  if (detail.status !== 'ready') notFound()

  return (
    <ExpenseShell
      title={detail.title}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <ExpenseSharedDraftDetail draft={detail} />
    </ExpenseShell>
  )
}
