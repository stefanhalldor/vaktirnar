import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getLocale } from 'next-intl/server'
import { formatDateOnly } from '@/lib/date-format'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'
import { calculateExpenseBalances, simplifySettlement } from '@/lib/expenses/balances'
import { expenseEditStepHref, expenseSavedViewHref, type ExpenseSavedView } from '@/lib/expenses/flow'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { canEditExpense, canLinkExpenseGuest } from '@/lib/expenses/policy'
import { summarizeExpenseRepaymentsByPayer } from '@/lib/expenses/repayment-status'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseItemActions } from './ExpenseItemActions'
import { ExpenseItemHistory } from './ExpenseItemHistory'
import { ExpenseFlowNav } from './ExpenseFlowNav'
import { ExpenseMemberManager } from './ExpenseMemberManager'
import {
  ExpenseSettlementParticipantList,
  type ExpenseSettlementParticipantRow,
} from './ExpenseSettlementParticipantList'

export async function ExpenseItemDetail({
  group,
  expense,
  view = 'review',
  initialDate,
}: {
  group: ExpenseGroupView
  expense: ExpenseItemView
  view?: ExpenseSavedView
  initialDate?: string
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const hasLockedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'reported' || repayment.status === 'confirmed',
  )
  const canEdit = canEditExpense({
    expenseStatus: expense.status,
    groupStatus: group.status,
    createdBySelf: expense.createdBySelf,
    canManage: group.canManage,
  })
  const canCancel = expense.status === 'active'
    && group.status === 'active'
    && !hasLockedRepayment
    && (expense.createdBySelf || group.canManage)
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
    ...group.members.map((member) => [member.id, member.displayName] as const),
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
  const oneOffSettlementTransfers = group.kind === 'one_off'
    ? group.settlementTransfers.filter((transfer) => transfer.currency === expense.currency)
    : []
  const repaymentStatusByMember = summarizeExpenseRepaymentsByPayer(
    group.kind === 'one_off' ? group.repayments : [],
    expense.currency,
  )
  const actionableBalanceByMember = effectiveSettlement.reduce((rows, transfer) => {
    rows.set(
      transfer.fromPartyId,
      (rows.get(transfer.fromPartyId) ?? 0) - transfer.amountMinor,
    )
    rows.set(
      transfer.toPartyId,
      (rows.get(transfer.toPartyId) ?? 0) + transfer.amountMinor,
    )
    return rows
  }, new Map<string, number>())
  const shareByMember = new Map(expense.shares.map((share) => [share.memberId, share] as const))
  const paymentByMember = new Map(expense.payments.map((payment) => [payment.memberId, payment] as const))
  const latestRepaymentByMember = group.repayments.reduce((rows, repayment) => {
    if (repayment.status !== 'reported' && repayment.status !== 'confirmed') return rows
    const current = rows.get(repayment.fromMemberId)
    if (!current || current.createdAt < repayment.createdAt) {
      rows.set(repayment.fromMemberId, repayment)
    }
    return rows
  }, new Map<string, ExpenseGroupView['repayments'][number]>())
  const reportTransferByMember = new Map(oneOffSettlementTransfers
    .filter((transfer) => transfer.canReport)
    .map((transfer) => [transfer.fromMemberId, transfer] as const))
  const settlementParticipantRows: ExpenseSettlementParticipantRow[] = effectiveBalances.map((balance) => {
    const amountMinor = group.kind === 'one_off'
      ? actionableBalanceByMember.get(balance.partyId) ?? 0
      : balance.amountMinor
    const repaymentStatus = repaymentStatusByMember.get(balance.partyId)
    const hasConfirmed = (repaymentStatus?.confirmedAmountMinor ?? 0) > 0
    const category = amountMinor > 0
      ? 'credit' as const
      : amountMinor < 0 || (balance.amountMinor < 0 && !hasConfirmed)
        ? 'outstanding' as const
        : 'completed' as const
    const member = group.members.find((candidate) => candidate.id === balance.partyId)
    return {
      id: balance.partyId,
      name: displayName.get(balance.partyId) ?? balance.partyId,
      isSelf: member?.isSelf ?? false,
      currency: balance.currency,
      shareAmountMinor: shareByMember.get(balance.partyId)?.amountMinor ?? null,
      paymentAmountMinor: paymentByMember.get(balance.partyId)?.amountMinor ?? null,
      category,
      repaymentStatus,
      repaymentId: latestRepaymentByMember.get(balance.partyId)?.id ?? null,
      reportTransfer: reportTransferByMember.get(balance.partyId) ?? null,
    }
  })
  // The headline must reflect the actionable settlement, which already
  // reserves reported repayments. Reading the raw ledger balance here made a
  // reported payer appear as an additional amount still owed to the viewer.
  const selfBalance = selfMember
    ? effectiveSettlement.reduce((amountMinor, transfer) => (
      transfer.toPartyId === selfMember.id
        ? amountMinor + transfer.amountMinor
        : transfer.fromPartyId === selfMember.id
          ? amountMinor - transfer.amountMinor
          : amountMinor
    ), 0)
    : 0
  const initialDebtorIds = new Set(
    balances.filter((balance) => balance.amountMinor < 0).map((balance) => balance.partyId),
  )
  const openDebtors = [...effectiveSettlement.reduce((rows, transfer) => {
    const current = rows.get(transfer.fromPartyId)
    rows.set(transfer.fromPartyId, {
      id: transfer.fromPartyId,
      name: displayName.get(transfer.fromPartyId) ?? transfer.fromPartyId,
      amountMinor: (current?.amountMinor ?? 0) + transfer.amountMinor,
    })
    return rows
  }, new Map<string, { id: string; name: string; amountMinor: number }>()).values()]
  const totalDebtorCount = Math.max(initialDebtorIds.size, openDebtors.length)
  const repaidDebtorCount = Math.max(0, totalDebtorCount - openDebtors.length)

  const history = view === 'review' ? await ExpenseItemHistory({ group, expense }) : null

  return (
    <div className="space-y-8">
      <ExpenseFlowNav context="saved" expenseId={expense.id} currentView={view} />

      {view === 'review' ? (
        <>
          <section aria-labelledby="expense-summary-title" className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {expense.payments.length === 1
                  ? t('expense.summarySinglePayer', { name: expense.payments[0]!.displayName })
                  : t('expense.summaryMultiplePayers', { count: expense.payments.length })}
              </p>
              <h2 id="expense-summary-title" className="mt-1 break-words text-xl font-semibold">{expense.title}</h2>
              <p className="mt-3 break-words text-3xl font-semibold tracking-tight">
                {formatExpenseMinor(expense.totalMinor, expense.currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{formatDateOnly(expense.incurredOn, locale)}</p>
            </div>
            {expense.note ? (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold">{t('expense.summaryDescription')}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{expense.note}</p>
              </div>
            ) : null}
          </section>

          {group.settlementRequiresReview ? (
            <div role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-950">
              <p className="font-semibold">{t('repayment.reviewRequiredTitle')}</p>
              <p className="mt-1 leading-6">{t('repayment.reviewRequiredBody')}</p>
              <Link href={expenseSavedViewHref(expense.id, 'settlement')} className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                {t('repayment.reviewRequiredAction')}
              </Link>
            </div>
          ) : null}

          <div className="divide-y divide-border border-y border-border">
            <Link href={expenseSavedViewHref(expense.id, 'settlement')} className="group flex min-h-20 items-center gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-primary">{t('expense.summaryYourStatus')}</span>
                <span className="mt-1 block text-sm leading-6">
                  {selfBalance > 0
                    ? t('expense.summaryYouAreOwed', { amount: formatExpenseMinor(selfBalance, expense.currency) })
                    : selfBalance < 0
                      ? t('expense.summaryYouOwe', { amount: formatExpenseMinor(Math.abs(selfBalance), expense.currency) })
                      : t('expense.summaryYouAreEven')}
                </span>
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>

            <Link href={expenseSavedViewHref(expense.id, 'settlement')} className="group flex min-h-20 items-center gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t('expense.summaryOpen')}</span>
                {openDebtors.length === 0 ? (
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{t('expense.summarySettled')}</span>
                ) : totalDebtorCount > 2 ? (
                  <span className="mt-1 block text-sm leading-6">
                    {repaidDebtorCount > 0
                      ? t('expense.summaryRepaidProgress', { paid: repaidDebtorCount, total: totalDebtorCount })
                      : t('expense.summaryManyOwe', { count: openDebtors.length })}
                  </span>
                ) : openDebtors.length === 2 && openDebtors[0]!.amountMinor === openDebtors[1]!.amountMinor ? (
                  <span className="mt-1 block text-sm leading-6">{t('expense.summaryTwoOweEach', {
                    first: openDebtors[0]!.name,
                    second: openDebtors[1]!.name,
                    amount: formatExpenseMinor(openDebtors[0]!.amountMinor, expense.currency),
                  })}</span>
                ) : (
                  <span className="mt-1 block space-y-1 text-sm leading-6">
                    {openDebtors.map((debtor) => (
                      <span key={debtor.id} className="block">{t('expense.summaryDebtorOwes', {
                        name: debtor.name,
                        amount: formatExpenseMinor(debtor.amountMinor, expense.currency),
                      })}</span>
                    ))}
                  </span>
                )}
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {canEdit ? (
            <Link href={expenseEditStepHref(expense.id, 'details')} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              {t('expense.editDetails')}
            </Link>
          ) : null}

          {history}
        </>
      ) : null}

      {view === 'settlement' ? (
        <section className="space-y-5">
          <h2 className="text-base font-semibold">{t('expense.savedViews.settlement')}</h2>
          {group.settlementRequiresReview ? (
            <div role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-950">
              <p className="font-semibold">{t('repayment.reviewRequiredTitle')}</p>
              <p className="mt-1 leading-6">{t('repayment.reviewRequiredBody')}</p>
            </div>
          ) : null}
          <h3 className="text-sm font-semibold">{t('expense.settlementParticipants')}</h3>
          <ExpenseSettlementParticipantList
            rows={settlementParticipantRows}
            groupId={group.id}
            initialDate={initialDate ?? expense.incurredOn}
          />
          {group.kind === 'one_off' ? (
            <details className="border-y border-border py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                {t('expense.manageParticipants')}
              </summary>
              <div className="pb-3 pt-2">
                <ExpenseMemberManager
                  groupId={group.id}
                  members={group.members.filter((member) => (
                    expense.payments.some((payment) => payment.memberId === member.id)
                    || expense.shares.some((share) => share.memberId === member.id)
                  ))}
                  options={[]}
                  optionsError={false}
                  canManage={false}
                  canLinkGuests={canLinkExpenseGuest({
                    groupStatus: group.status,
                    canManage: group.canManage,
                  })}
                />
              </div>
            </details>
          ) : null}
          {group.kind === 'group' ? (
            <>
              <p className="text-xs leading-5 text-muted-foreground">{t('expense.groupSettlementHint')}</p>
              <Link href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{t('expense.openGroup')}</Link>
            </>
          ) : null}
        </section>
      ) : null}

      {view === 'review' && (canEdit || canCancel) ? <ExpenseItemActions expenseId={expense.id} canEdit={false} canCancel={canCancel} /> : null}
    </div>
  )
}
