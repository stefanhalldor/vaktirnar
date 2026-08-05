import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { formatDateOnly } from '@/lib/date-format'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'
import { calculateExpenseBalances, simplifySettlement } from '@/lib/expenses/balances'
import { expenseEditStepHref, expenseSavedViewHref, type ExpenseSavedView } from '@/lib/expenses/flow'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseItemActions } from './ExpenseItemActions'
import { ExpenseFlowNav } from './ExpenseFlowNav'

export async function ExpenseItemDetail({
  group,
  expense,
  view = 'review',
}: {
  group: ExpenseGroupView
  expense: ExpenseItemView
  view?: ExpenseSavedView
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const hasLockedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'reported' || repayment.status === 'confirmed',
  )
  const canEdit = expense.status === 'active'
    && group.status === 'active'
    && !hasLockedRepayment
    && (expense.createdBySelf || group.canManage)
  const canCancel = canEdit
  const balances = calculateExpenseBalances({
    expenseId: expense.id,
    totalMinor: expense.totalMinor,
    currency: expense.currency,
    payments: expense.payments.map((payment) => ({
      payerId: payment.memberId,
      amountMinor: payment.amountMinor,
      currency: expense.currency,
    })),
    shares: expense.shares.map((share) => ({
      participantId: share.memberId,
      amountMinor: share.amountMinor,
      currency: expense.currency,
    })),
  })
  const expenseSettlement = simplifySettlement(balances)
  const displayName = new Map([
    ...expense.payments.map((payment) => [payment.memberId, payment.displayName] as const),
    ...expense.shares.map((share) => [share.memberId, share.displayName] as const),
  ])
  const selfMember = group.members.find((member) => member.isSelf)
  const effectiveBalances = group.kind === 'one_off'
    ? group.balances.filter((balance) => balance.currency === expense.currency)
      .map((balance) => ({ partyId: balance.memberId, amountMinor: balance.amountMinor, currency: balance.currency }))
    : balances
  const effectiveSettlement = group.kind === 'one_off'
    ? group.settlementTransfers.filter((transfer) => transfer.currency === expense.currency)
      .map((transfer) => ({
        fromPartyId: transfer.fromMemberId,
        toPartyId: transfer.toMemberId,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
      }))
    : expenseSettlement
  const selfBalance = effectiveBalances.find((balance) => balance.partyId === selfMember?.id)?.amountMinor ?? 0

  const editHref = view === 'people'
    ? expenseEditStepHref(expense.id, 'people')
    : view === 'split'
      ? expenseEditStepHref(expense.id, 'split')
      : expenseEditStepHref(expense.id, 'details')

  return (
    <div className="space-y-8">
      <ExpenseFlowNav context="saved" expenseId={expense.id} currentView={view} />

      {view === 'review' ? (
        <>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{expense.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatDateOnly(expense.incurredOn, locale)}</p>
              </div>
              <strong className="shrink-0 text-xl">{formatExpenseMinor(expense.totalMinor, expense.currency)}</strong>
            </div>
            <div className="space-y-2 border-t border-border pt-4 text-sm leading-6">
              {expense.payments.map((payment) => (
                <p key={payment.memberId}>{t('expense.summaryPaid', {
                  name: payment.displayName,
                  amount: formatExpenseMinor(payment.amountMinor, expense.currency),
                })}</p>
              ))}
            </div>
          </section>

          <Link href={expenseSavedViewHref(expense.id, 'settlement')} className="block rounded-2xl border border-primary/20 bg-primary/5 p-5 transition-colors hover:bg-primary/10">
            <p className="text-sm font-semibold text-primary">{t('expense.summaryYourStatus')}</p>
            <p className="mt-2 text-base leading-6">
              {selfBalance > 0
                ? t('expense.summaryYouAreOwed', { amount: formatExpenseMinor(selfBalance, expense.currency) })
                : selfBalance < 0
                  ? t('expense.summaryYouOwe', { amount: formatExpenseMinor(Math.abs(selfBalance), expense.currency) })
                  : t('expense.summaryYouAreEven')}
            </p>
          </Link>

          <Link href={expenseSavedViewHref(expense.id, 'settlement')} className="block rounded-2xl border border-border p-5 transition-colors hover:bg-muted/50">
            <p className="text-sm font-semibold">{t('expense.summaryOpen')}</p>
            {effectiveSettlement.length > 0 ? (
              <div className="mt-2 space-y-2 text-sm leading-6">
                {effectiveSettlement.slice(0, 2).map((transfer) => (
                  <p key={`${transfer.fromPartyId}:${transfer.toPartyId}`}>{t('expense.summaryOwes', {
                    from: displayName.get(transfer.fromPartyId) ?? transfer.fromPartyId,
                    to: displayName.get(transfer.toPartyId) ?? transfer.toPartyId,
                    amount: formatExpenseMinor(transfer.amountMinor, transfer.currency),
                  })}</p>
                ))}
                {effectiveSettlement.length > 2 ? <p>{t('expense.summaryMorePayments', { count: effectiveSettlement.length - 2 })}</p> : null}
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">{t('expense.summarySettled')}</p>}
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Link href={expenseSavedViewHref(expense.id, 'people')} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium">{t('expense.savedViews.people')}</Link>
            <Link href={expenseSavedViewHref(expense.id, 'split')} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium">{t('expense.savedViews.split')}</Link>
          </div>
        </>
      ) : null}

      {view === 'people' ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">{t('expense.savedViews.people')}</h2>
          <div className="divide-y divide-border border-y border-border">
            {group.members.filter((member) => (
              expense.payments.some((payment) => payment.memberId === member.id)
              || expense.shares.some((share) => share.memberId === member.id)
            )).map((member) => (
              <div key={member.id} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
                <span className="min-w-0 truncate">{member.displayName}</span>
                <span className="shrink-0 text-muted-foreground">{member.isRegistered
                  ? t(member.status === 'invited' ? 'group.memberInvited' : 'group.registered')
                  : t('group.guest')}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === 'split' ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold">{t('expense.savedViews.split')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`splitMethods.${expense.splitMethod}`)}</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {expense.shares.map((share) => (
              <div key={share.memberId} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
                <span className="min-w-0 truncate">{share.displayName}</span>
                <strong className="shrink-0">{formatExpenseMinor(share.amountMinor, expense.currency)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === 'settlement' ? (
        <section className="space-y-5">
          <h2 className="text-base font-semibold">{t('expense.savedViews.settlement')}</h2>
          <div className="divide-y divide-border border-y border-border">
            {effectiveBalances.map((balance) => (
              <div key={balance.partyId} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
                <span className="min-w-0 truncate">{t(balance.amountMinor > 0
                  ? 'expenseForm.previewIsOwed'
                  : balance.amountMinor < 0
                    ? 'expenseForm.previewOwesBalance'
                    : 'expenseForm.previewEven', { name: displayName.get(balance.partyId) ?? balance.partyId })}</span>
                <strong className={`shrink-0 ${balance.amountMinor < 0 ? 'text-destructive' : 'text-primary'}`}>{formatExpenseMinor(Math.abs(balance.amountMinor), balance.currency)}</strong>
              </div>
            ))}
          </div>
          {group.kind === 'group' ? <p className="text-xs leading-5 text-muted-foreground">{t('expense.groupSettlementHint')}</p> : null}
          <Link href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{t('expense.openGroup')}</Link>
        </section>
      ) : null}

      {canEdit && view !== 'settlement' ? (
        <Link href={editHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-medium">{t('expense.edit')}</Link>
      ) : null}
      {view === 'review' && (canEdit || canCancel) ? <ExpenseItemActions expenseId={expense.id} canEdit={false} canCancel={canCancel} /> : null}
    </div>
  )
}
