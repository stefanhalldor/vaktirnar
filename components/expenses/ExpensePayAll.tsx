'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { transitionExpenseSettlementBatch } from '@/lib/expenses/actions'
import type {
  ExpensePayAllCounterpartyView,
  ExpensePayAllContextView,
  ExpensePayAllPaymentView,
  ExpensePayAllView,
  ExpensePendingSettlementBatchView,
} from '@/lib/expenses/contracts'
import { formatDateOnly } from '@/lib/date-format'
import { formatExpenseMinor, formatExpenseMinorForCopy } from '@/lib/expenses/input-money'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'
import { ExpenseRepaymentDialog } from './ExpenseRepaymentDialog'
import { ExpenseSettlementBatchDialog } from './ExpenseSettlementBatchDialog'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
  expenseSectionClass,
} from './ui'

function ContextRows({ contexts, locale, initialDate, showRepaymentAction = true }: {
  contexts: ExpensePayAllContextView[]
  locale: string
  initialDate: string
  showRepaymentAction?: boolean
}) {
  const t = useExpenseTranslations()

  return (
    <div className="divide-y divide-border border-y border-border">
      {contexts.map((context) => (
        <section key={`${context.groupId}:${context.currency}`} className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">
                {context.emoji ? `${context.emoji} ` : ''}{context.groupName}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(context.groupKind === 'one_off' ? 'payAll.oneOffContext' : 'payAll.groupContext')}
              </p>
            </div>
            <strong className="shrink-0 text-sm">
              {formatExpenseMinor(context.amountMinor, context.currency, locale)}
            </strong>
          </div>

          {showRepaymentAction ? (
            <ExpenseRepaymentDialog
              groupId={context.groupId}
              transfer={context.transfer}
              initialDate={initialDate}
              actionSheetTrigger
              triggerLabel={t('payAll.markPaid')}
            />
          ) : null}

          <Link
            href={context.expenses.length === 1
              ? `/auth-mvp/utlagt-og-endurgreitt/utgjold/${context.expenses[0].id}`
              : `/auth-mvp/utlagt-og-endurgreitt/hopar/${context.groupId}`}
            className={`${expenseSecondaryButtonClass} w-full`}
          >
            {t(context.expenses.length === 1 ? 'payAll.openEntry' : 'payAll.openSettlement')}
          </Link>

          {context.expenses.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('payAll.relatedEntries')}</p>
              <div className="divide-y divide-border">
                {context.expenses.map((expense) => (
                  <Link
                    key={expense.id}
                    href={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`}
                    className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{expense.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatDateOnly(expense.incurredOn, locale)}
                      </span>
                    </span>
                    <strong className="shrink-0 text-right text-sm">
                      {formatExpenseMinor(expense.amountMinor, context.currency, locale)}
                    </strong>
                    <ChevronRight aria-hidden size={17} className="shrink-0 text-muted-foreground" />
                  </Link>
                ))}
                {context.nettingAdjustmentMinor !== 0 ? (
                  <div className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 break-words text-muted-foreground">
                      {t('payAll.nettingAdjustment')}
                    </span>
                    <strong className="shrink-0 text-right">
                      {formatExpenseMinor(context.nettingAdjustmentMinor, context.currency, locale)}
                    </strong>
                  </div>
                ) : null}
                <div className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold">{t('payAll.contextTotal')}</span>
                  <strong className="shrink-0 text-right">
                    {formatExpenseMinor(context.amountMinor, context.currency, locale)}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {context.nettingAdjustmentMinor !== 0 ? (
                <div className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 break-words text-muted-foreground">
                    {t('payAll.nettingAdjustment')}
                  </span>
                  <strong className="shrink-0 text-right">
                    {formatExpenseMinor(context.nettingAdjustmentMinor, context.currency, locale)}
                  </strong>
                </div>
              ) : null}
              <div className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold">{t('payAll.contextTotal')}</span>
                <strong className="shrink-0 text-right">
                  {formatExpenseMinor(context.amountMinor, context.currency, locale)}
                </strong>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function PairContextDrawer({ pair, locale, initialDate }: {
  pair: ExpensePayAllCounterpartyView
  locale: string
  initialDate: string
}) {
  const t = useExpenseTranslations()

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={`${expenseSecondaryButtonClass} w-full`}>
          {t('payAll.details')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {t('payAll.pairDetailsTitle', { name: pair.counterpartyDisplayName })}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('payAll.pairDetailsDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('payAll.closeDetails')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-6">
            {pair.outgoingContexts.length > 0 ? (
              <section aria-labelledby={`pair-outgoing-${pair.counterpartyUserId}-${pair.currency}`}>
                <h3
                  id={`pair-outgoing-${pair.counterpartyUserId}-${pair.currency}`}
                  className="mb-2 text-sm font-semibold"
                >
                  {t('payAll.outgoingContexts')}
                </h3>
                <ContextRows
                  contexts={pair.outgoingContexts.map((context) => context.context)}
                  locale={locale}
                  initialDate={initialDate}
                  showRepaymentAction={false}
                />
              </section>
            ) : null}
            {pair.incomingContexts.length > 0 ? (
              <section aria-labelledby={`pair-incoming-${pair.counterpartyUserId}-${pair.currency}`}>
                <h3
                  id={`pair-incoming-${pair.counterpartyUserId}-${pair.currency}`}
                  className="mb-2 text-sm font-semibold"
                >
                  {t('payAll.incomingContexts')}
                </h3>
                <ContextRows
                  contexts={pair.incomingContexts.map((context) => context.context)}
                  locale={locale}
                  initialDate={initialDate}
                  showRepaymentAction={false}
                />
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function countPairEntries(contexts: ExpensePayAllCounterpartyView['outgoingContexts']): number {
  return contexts.reduce(
    (total, context) => total + Math.max(1, context.context.expenses.length),
    0,
  )
}

function PairSummaryRow({ label, amount, count, currency, locale, strong = false }: {
  label: string
  amount: number
  count?: number
  currency: string
  locale: string
  strong?: boolean
}) {
  const t = useExpenseTranslations()

  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <dt className={`min-w-0 break-words ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
        <span className="block">{label}</span>
        {count !== undefined ? (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {t('payAll.counterpartyContextCount', { count })}
          </span>
        ) : null}
      </dt>
      <dd className="shrink-0 text-right font-semibold">
        {formatExpenseMinor(amount, currency, locale)}
      </dd>
    </div>
  )
}

function CounterpartyCard({ pair, locale, initialDate, settlementBatchReady }: {
  pair: ExpensePayAllCounterpartyView
  locale: string
  initialDate: string
  settlementBatchReady: boolean
}) {
  const t = useExpenseTranslations()
  const hasBlockedContexts = pair.blockedContexts.length > 0
  const canPropose = settlementBatchReady && !hasBlockedContexts && pair.counterpartyCanSettle
  const outgoingCount = countPairEntries(pair.outgoingContexts)
  const incomingCount = countPairEntries(pair.incomingContexts)
  const netLabel = pair.netPayableMinor > 0
    ? t('payAll.counterpartyNetPayable')
    : pair.netReceivableMinor > 0
      ? t('payAll.counterpartyNetReceivable')
      : t('payAll.counterpartyNetAfterOffset')
  const netAmount = pair.netPayableMinor > 0
    ? pair.netPayableMinor
    : pair.netReceivableMinor

  return (
    <section className={`${expenseSectionClass} min-w-0 space-y-4`}>
      <h2 className="break-words text-base font-semibold">{pair.counterpartyDisplayName}</h2>

      <dl className="divide-y divide-border border-y border-border text-sm">
        {pair.grossPayableMinor > 0 ? (
          <PairSummaryRow
            label={t('payAll.counterpartyPayerAmount')}
            amount={pair.grossPayableMinor}
            count={outgoingCount}
            currency={pair.currency}
            locale={locale}
          />
        ) : null}
        {pair.grossReceivableMinor > 0 ? (
          <PairSummaryRow
            label={t('payAll.counterpartyReceiverAmount')}
            amount={pair.grossReceivableMinor}
            count={incomingCount}
            currency={pair.currency}
            locale={locale}
          />
        ) : null}
        <PairSummaryRow
          label={netLabel}
          amount={netAmount}
          currency={pair.currency}
          locale={locale}
          strong
        />
      </dl>

      {!settlementBatchReady ? (
        <p role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
          {t('payAll.batchUnavailable')}
        </p>
      ) : hasBlockedContexts ? (
        <p role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
          {t('payAll.pairNeedsReview')}
        </p>
      ) : !pair.counterpartyCanSettle ? (
        <p role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
          {t('payAll.counterpartyUnavailable')}
        </p>
      ) : null}

      {canPropose && pair.grossPayableMinor > 0 ? (
        <div className="space-y-2">
          {pair.netPayableMinor > 0 ? (
            <ExpenseSettlementBatchDialog
              pair={pair}
              locale={locale}
              initialDate={initialDate}
              mode={pair.offsetMinor > 0 ? 'combined' : 'cash_only'}
              triggerLabel={t('payAll.payActionAmount', {
                amount: formatExpenseMinor(pair.netPayableMinor, pair.currency, locale),
              })}
              primary
            />
          ) : pair.offsetMinor > 0 ? (
            <ExpenseSettlementBatchDialog
              pair={pair}
              locale={locale}
              initialDate={initialDate}
              mode="offset_only"
              triggerLabel={t('payAll.offsetAction', {
                amount: formatExpenseMinor(pair.offsetMinor, pair.currency, locale),
              })}
              primary
            />
          ) : null}

          {pair.netReceivableMinor > 0 && pair.offsetMinor > 0 ? (
            <ExpenseSettlementBatchDialog
              pair={pair}
              locale={locale}
              initialDate={initialDate}
              mode="cash_only"
              triggerLabel={t('payAll.payActionAmount', {
                amount: formatExpenseMinor(pair.grossPayableMinor, pair.currency, locale),
              })}
              primary={false}
            />
          ) : null}
        </div>
      ) : null}

      <PairContextDrawer pair={pair} locale={locale} initialDate={initialDate} />
    </section>
  )
}

function PendingBatchCard({ batch, locale }: {
  batch: ExpensePendingSettlementBatchView
  locale: string
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  async function submit(action: 'confirm' | 'reject' | 'cancel') {
    if (isPending || completed) return
    setError(null)
    const payload = { batch_id: batch.id, action }
    setIsPending(true)
    try {
      const result = await transitionExpenseSettlementBatch({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setIsPending(false)
        return
      }
      requestIds.succeeded(payload)
      setCompleted(true)
      setIsPending(false)
      router.refresh()
    } catch {
      setError(t('errors.save_failed'))
      setIsPending(false)
    }
  }

  return (
    <article className={`${expenseSectionClass} min-w-0 space-y-4`}>
      <div>
        <h3 className="break-words text-base font-semibold">{batch.counterpartyDisplayName}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t(batch.proposedBySelf ? 'payAll.pendingBySelf' : 'payAll.pendingFromOther', {
            name: batch.counterpartyDisplayName,
          })}
        </p>
      </div>

      <dl className="divide-y divide-border border-y border-border text-sm">
        {batch.cashMinor > 0 ? (
          <PairSummaryRow
            label={t(
              batch.proposedBySelf ? 'payAll.pendingCashBySelf' : 'payAll.pendingCashFromOther',
              { name: batch.counterpartyDisplayName },
            )}
            amount={batch.cashMinor}
            currency={batch.currency}
            locale={locale}
          />
        ) : null}
        <PairSummaryRow
          label={t('payAll.offsetLabel')}
          amount={batch.offsetMinor}
          currency={batch.currency}
          locale={locale}
        />
        <PairSummaryRow
          label={t('payAll.totalSettled')}
          amount={batch.cashMinor + batch.offsetMinor}
          currency={batch.currency}
          locale={locale}
          strong
        />
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-3 py-2.5">
          <dt className="text-muted-foreground">{t('payAll.pendingOccurredOn')}</dt>
          <dd className="min-w-0 break-words text-right font-medium">
            {formatDateOnly(batch.occurredOn, locale)}
          </dd>
        </div>
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-3 py-2.5">
          <dt className="text-muted-foreground">{t('payAll.pendingNote')}</dt>
          <dd className="min-w-0 break-words text-right font-medium">
            {batch.note || t('payAll.pendingNoNote')}
          </dd>
        </div>
      </dl>

      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {completed ? (
        <p role="status" className="text-sm text-muted-foreground">{t('payAll.pendingUpdated')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {batch.canConfirm ? (
            <button
              type="button"
              disabled={isPending}
              className={`${expensePrimaryButtonClass} w-full`}
              onClick={() => void submit('confirm')}
            >
              {isPending ? t('payAll.pendingWorking') : t('payAll.confirmProposal')}
            </button>
          ) : null}
          {batch.canReject ? (
            <button
              type="button"
              disabled={isPending}
              className={`${expenseSecondaryButtonClass} w-full`}
              onClick={() => void submit('reject')}
            >
              {isPending ? t('payAll.pendingWorking') : t('payAll.rejectProposal')}
            </button>
          ) : null}
          {batch.canCancel ? (
            <button
              type="button"
              disabled={isPending}
              className={`${expenseSecondaryButtonClass} w-full sm:col-span-2`}
              onClick={() => void submit('cancel')}
            >
              {isPending ? t('payAll.pendingWorking') : t('payAll.cancelProposal')}
            </button>
          ) : null}
        </div>
      )}
    </article>
  )
}

function PaymentContextDrawer({ payment, locale, initialDate, triggerLabel }: {
  payment: ExpensePayAllPaymentView
  locale: string
  initialDate: string
  triggerLabel?: string
}) {
  const t = useExpenseTranslations()

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={`${expenseSecondaryButtonClass} w-full`}>
          {triggerLabel ?? t('payAll.details')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {t('payAll.detailsTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('payAll.detailsDescription', { name: payment.recipientDisplayName })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('payAll.closeDetails')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-5">
            <ContextRows contexts={payment.contexts} locale={locale} initialDate={initialDate} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ExpensePayAll({ view, locale, initialDate }: { view: ExpensePayAllView; locale: string; initialDate: string }) {
  const t = useExpenseTranslations()

  if (
    view.payments.length === 0
    && view.counterpartyViews.length === 0
    && view.pendingBatches.length === 0
    && view.blockedContexts.length === 0
  ) {
    return (
      <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
        {t('payAll.empty')}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm leading-6 text-muted-foreground">{t('payAll.intro')}</p>
        <p className="text-xs leading-5 text-muted-foreground">{t('payAll.outsidePayment')}</p>
      </div>

      {view.pendingBatches.length > 0 ? (
        <section aria-labelledby="expense-pay-all-pending-title" className="space-y-3">
          <h2 id="expense-pay-all-pending-title" className="text-base font-semibold">
            {t('payAll.pendingTitle')}
          </h2>
          <div className="space-y-3">
            {view.pendingBatches.map((batch) => (
              <PendingBatchCard key={batch.id} batch={batch} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      {view.counterpartyViews.map((pair) => (
        <CounterpartyCard
          key={`${pair.counterpartyUserId}:${pair.currency}`}
          pair={pair}
          locale={locale}
          initialDate={initialDate}
          settlementBatchReady={view.settlementBatchReady}
        />
      ))}

      {view.payments.map((payment) => (
        <section key={payment.id} className={`${expenseSectionClass} min-w-0 space-y-4`}>
          <h2 className="break-words text-base font-semibold">
            {t('payAll.payRecipient', { name: payment.recipientDisplayName })}
          </h2>
          {payment.contexts.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              {t('payAll.combinedPaymentCount', { count: payment.contexts.length })}
            </p>
          ) : null}
          {payment.paymentDetailsState === 'not_configured' ? (
            <p className="text-sm text-muted-foreground">{t('payAll.paymentMissingGeneric')}</p>
          ) : payment.paymentDetailsState === 'unavailable' ? (
            <p className="text-sm text-muted-foreground">{t('payAll.paymentUnavailable')}</p>
          ) : (
            <ExpensePaymentDetails
              snapshot={payment.paymentInstruction}
              mode="current"
              amount={{
                display: formatExpenseMinor(payment.amountMinor, payment.currency, locale),
                copy: formatExpenseMinorForCopy(payment.amountMinor, payment.currency),
              }}
            />
          )}
          {payment.contexts.length === 1 ? (
            <ExpenseRepaymentDialog
              groupId={payment.contexts[0].groupId}
              transfer={payment.contexts[0].transfer}
              initialDate={initialDate}
              actionSheetTrigger
              triggerLabel={t('payAll.markPaid')}
            />
          ) : (
            <PaymentContextDrawer
              payment={payment}
              locale={locale}
              initialDate={initialDate}
              triggerLabel={t('payAll.markPaid')}
            />
          )}
          <PaymentContextDrawer payment={payment} locale={locale} initialDate={initialDate} />
        </section>
      ))}

      {view.payments.length > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">{t('payAll.reportHint')}</p>
      ) : null}

      {view.blockedContexts.length > 0 ? (
        <section aria-labelledby="expense-pay-all-review-title" className="space-y-3 border-y border-amber-300 bg-amber-50 px-3 py-4 text-amber-950">
          <div>
            <h2 id="expense-pay-all-review-title" className="text-sm font-semibold">{t('payAll.reviewTitle')}</h2>
            <p className="mt-1 text-sm leading-6">{t('payAll.reviewBody')}</p>
          </div>
          <div className="divide-y divide-amber-200">
            {view.blockedContexts.map((context) => (
              <Link
                key={`${context.groupId}:${context.currency}:${context.recipientDisplayName}`}
                href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${context.groupId}`}
                className="flex min-h-12 items-center gap-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="min-w-0 flex-1 break-words">
                  {t('payAll.reviewContext', { group: context.groupName, name: context.recipientDisplayName })}
                </span>
                <strong className="shrink-0">{formatExpenseMinor(context.amountMinor, context.currency, locale)}</strong>
                <ChevronRight aria-hidden size={17} className="shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
