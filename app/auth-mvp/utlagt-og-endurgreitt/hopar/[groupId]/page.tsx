import { notFound, redirect } from 'next/navigation'
import { ExpenseGroupDetail } from '@/components/expenses/ExpenseGroupDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { getExpenseGroupView } from '@/lib/expenses/repository.server'
import { canonicalOneOffExpenseHref } from '@/lib/expenses/flow'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'

export default async function ExpenseGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, { user }, t] = await Promise.all([params, guardExpenseAccess(), getExpenseTranslations()])
  const group = await getExpenseGroupView(user.id, groupId, {
    includeCurrentPaymentInstructions: true,
  })
  if (!group) notFound()
  const canonicalExpenseHref = canonicalOneOffExpenseHref(
    group.kind,
    group.expenses.map((expense) => expense.id),
  )
  if (canonicalExpenseHref) redirect(canonicalExpenseHref)

  let participantOptions: ExpenseParticipantOption[] = []
  let participantOptionsError = false
  if (group.kind === 'group' && group.status === 'active' && group.canManage) {
    try { participantOptions = await getExpenseParticipantOptions(user.id) } catch { participantOptionsError = true }
  }
  return <ExpenseShell title={`${group.emoji ?? ''} ${group.name}`.trim()} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt"><ExpenseGroupDetail group={group} initialDate={new Date().toISOString().slice(0, 10)} participantOptions={participantOptions} participantOptionsError={participantOptionsError} /></ExpenseShell>
}
