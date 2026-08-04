import { notFound } from 'next/navigation'
import { ExpenseRepaymentDetail } from '@/components/expenses/ExpenseRepaymentDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseRepaymentView } from '@/lib/expenses/repository.server'

export default async function ExpenseRepaymentPage({ params }: { params: Promise<{ repaymentId: string }> }) {
  const [{ repaymentId }, { user }, t] = await Promise.all([
    params,
    guardExpenseAccess(),
    getExpenseTranslations(),
  ])
  const result = await getExpenseRepaymentView(user.id, repaymentId)
  if (!result) notFound()

  return (
    <ExpenseShell
      title={t('repayment.title')}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/utlagt-og-endurgreitt/hopar/${result.group.id}`}
      backLabel={t('back')}
    >
      <ExpenseRepaymentDetail group={result.group} repayment={result.repayment} />
    </ExpenseShell>
  )
}
