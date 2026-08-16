import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { getLocale } from 'next-intl/server'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import type { ExpenseGroupView, ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { canLinkExpenseGuest } from '@/lib/expenses/policy'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseRepaymentDialog } from './ExpenseRepaymentDialog'
import { ExpenseGroupActions } from './ExpenseGroupActions'
import { ExpenseMemberManager } from './ExpenseMemberManager'
import { expensePrimaryButtonClass } from './ui'

export async function ExpenseGroupDetail({ group, initialDate, participantOptions, participantOptionsError, isEventContext = false }: {
  group: ExpenseGroupView
  initialDate: string
  participantOptions: ExpenseParticipantOption[]
  participantOptionsError: boolean
  isEventContext?: boolean
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const statusKey = group.status === 'active' ? 'statusActive' : group.status === 'settling' ? 'statusSettling' : group.status === 'settled' ? 'statusSettled' : 'statusClosed'
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t(`group.${statusKey}`)}</p>{group.canCreateExpense ? <Link href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}/nytt-utgjald`} className={expensePrimaryButtonClass}><Plus aria-hidden size={17} className="mr-1.5" />{t('group.newExpense')}</Link> : null}</div>

      {group.settlementRequiresReview ? <div role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-950"><p className="font-semibold">{t('repayment.reviewRequiredTitle')}</p><p className="mt-1 leading-6">{t('repayment.reviewRequiredBody')}</p></div> : null}

      <section><h2 className="mb-2 text-sm font-semibold">{t('group.balances')}</h2><div className="divide-y divide-border border-y border-border">{group.balances.map((balance) => <div key={`${balance.memberId}:${balance.currency}`} className="flex justify-between gap-4 py-2.5 text-sm"><span className="truncate">{balance.displayName}</span><strong className={balance.amountMinor < 0 ? 'text-destructive' : 'text-primary'}>{formatExpenseMinor(balance.amountMinor, balance.currency)}</strong></div>)}</div></section>

      <section><h2 className="mb-2 text-sm font-semibold">{t('group.settlement')}</h2>{group.settlementTransfers.length === 0 ? <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('group.settlementEmpty')}</p> : <div className="divide-y divide-border border-y border-border">{group.settlementTransfers.map((transfer) => <div key={`${transfer.fromMemberId}:${transfer.toMemberId}:${transfer.currency}`} className="py-3"><div className="flex min-h-11 items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{t('group.owes', { from: transfer.fromDisplayName, to: transfer.toDisplayName })}</span><strong className="shrink-0">{formatExpenseMinor(transfer.amountMinor, transfer.currency)}</strong></div>{transfer.canReport || transfer.canRecordReceived ? <ExpenseRepaymentDialog groupId={group.id} transfer={transfer} initialDate={initialDate} /> : null}</div>)}</div>}</section>

      <section><h2 className="mb-2 text-sm font-semibold">{t('group.expenses')}</h2>{group.expenses.length === 0 ? <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('dashboard.empty')}</p> : <div className="divide-y divide-border border-y border-border">{group.expenses.map((expense) => <Link key={expense.id} href={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`} className="flex min-h-14 items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{expense.title}</span><span className="text-xs text-muted-foreground">{formatDateOnly(expense.incurredOn, locale)}</span></span><strong className="text-sm">{formatExpenseMinor(expense.totalMinor, expense.currency)}</strong><ChevronRight aria-hidden size={17} className="text-muted-foreground" /></Link>)}</div>}</section>

      {group.repayments.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('group.repayments')}</h2>
          <div className="divide-y divide-border border-y border-border">
            {group.repayments.map((repayment) => {
              const isDebtOffset = repayment.settlementMethod === 'debt_offset'
              const methodKey = isDebtOffset
                ? 'repayment.methodDebtOffset'
                : repayment.settlementMethod === 'external_payment'
                  ? 'repayment.methodExternalPayment'
                  : null
              return (
                <Link
                  key={repayment.id}
                  href={`/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/${repayment.id}`}
                  className="flex min-h-14 items-center gap-3 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm">
                      {t(isDebtOffset ? 'repayment.offsetFromTo' : 'repayment.fromTo', {
                        from: repayment.fromDisplayName,
                        to: repayment.toDisplayName,
                      })}
                    </span>
                    {methodKey ? (
                      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                        {t(methodKey)}
                      </span>
                    ) : null}
                    {repayment.requiresReview ? (
                      <span className="mt-0.5 block text-xs text-amber-800">
                        {t('repayment.statusNeedsReview')}
                      </span>
                    ) : null}
                  </span>
                  <strong className="shrink-0 text-sm">
                    {formatExpenseMinor(repayment.amountMinor, repayment.currency)}
                  </strong>
                  <ChevronRight aria-hidden size={17} className="shrink-0 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {!isEventContext ? (
        <ExpenseMemberManager
          groupId={group.id}
          members={group.members}
          options={participantOptions}
          optionsError={participantOptionsError}
          canManage={group.kind === 'group' && group.status === 'active' && group.canManage}
          canLinkGuests={canLinkExpenseGuest({ groupStatus: group.status, canManage: group.canManage })}
        />
      ) : null}

      {group.activity.length > 0 ? <section><h2 className="mb-2 text-sm font-semibold">{t('group.activity')}</h2><ol className="divide-y divide-border border-y border-border">{group.activity.map((activity) => <li key={activity.id} className="py-3 text-sm"><p>{activity.summaryCode === 'expense_group_reopened_after_expense_edit' ? t('activitySummary.expense_group_reopened_after_expense_edit') : t(`activity.${activity.eventType}`)}</p><p className="mt-0.5 text-xs text-muted-foreground">{activity.actorDisplayName} · {formatDateTime(activity.createdAt, locale)}</p></li>)}</ol></section> : null}

      <ExpenseGroupActions group={group} />
    </div>
  )
}
