import { notFound, redirect } from 'next/navigation'
import { ExpenseGroupDetail } from '@/components/expenses/ExpenseGroupDetail'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { getExpenseGroupView } from '@/lib/expenses/repository.server'
import { canonicalOneOffExpenseHref } from '@/lib/expenses/flow'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { isExpenseEventContext } from '@/lib/events/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'

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

  // Classification is expense-authorized and intentionally independent from
  // Events entitlement so revoking the Events beta never re-enables roster,
  // invitation or account-linking controls on its financial fallback.
  const eventClassification = await isExpenseEventContext(user.id, group.id)
    .then((value) => ({ value, reliable: true }))
    .catch(() => ({ value: true, reliable: false }))
  const isEventContext = eventClassification.value
  const canUseEventUi = eventClassification.reliable && isEventContext && await checkFeatureAccess(
    user.id,
    user.email ?? '',
    'afmaeli-og-vidburdir',
  )

  let participantOptions: ExpenseParticipantOption[] = []
  let participantOptionsError = false
  if (!isEventContext && group.kind === 'group' && group.status === 'active' && group.canManage) {
    try { participantOptions = await getExpenseParticipantOptions(user.id) } catch { participantOptionsError = true }
  }
  return <ExpenseShell title={`${group.emoji ?? ''} ${group.name}`.trim()} homeLabel={t('homeLabel')} backHref={canUseEventUi ? `/auth-mvp/vidburdir/${group.id}` : '/auth-mvp/utlagt-og-endurgreitt'} backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt"><ExpenseGroupDetail group={group} initialDate={new Date().toISOString().slice(0, 10)} participantOptions={participantOptions} participantOptionsError={participantOptionsError} isEventContext={isEventContext} /></ExpenseShell>
}
