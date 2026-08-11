'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { proposeExpenseSettlementBatch } from '@/lib/expenses/actions'
import type { ExpensePayAllCounterpartyView } from '@/lib/expenses/contracts'
import {
  formatExpenseAmountInput,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
  normalizeExpenseAmountInput,
  parseExpenseAmountToMinor,
} from '@/lib/expenses/input-money'
import { planExpensePayAllSettlement } from '@/lib/expenses/pay-all'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseInputClass,
  expenseLabelClass,
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
  expenseTextareaClass,
} from './ui'

type SettlementDialogMode = 'combined' | 'cash_only' | 'offset_only'

export function ExpenseSettlementBatchDialog({
  pair,
  locale,
  initialDate,
  mode,
  triggerLabel,
  primary,
  disabled = false,
}: {
  pair: ExpensePayAllCounterpartyView
  locale: string
  initialDate: string
  mode: SettlementDialogMode
  triggerLabel: string
  primary: boolean
  disabled?: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const initialCashMinor = mode === 'offset_only'
    ? 0
    : mode === 'cash_only'
      ? pair.grossPayableMinor
      : pair.netPayableMinor
  const initialOffset = mode !== 'cash_only' && pair.offsetMinor > 0
  const [open, setOpen] = useState(false)
  const [cashAmount, setCashAmount] = useState(
    formatExpenseMinorForCopy(initialCashMinor, pair.currency),
  )
  const [applyFullOffset, setApplyFullOffset] = useState(initialOffset)
  const [date, setDate] = useState(initialDate)
  const [note, setNote] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const anchorContext = pair.outgoingContexts[0] ?? null

  useEffect(() => {
    if (submitError) alertRef.current?.focus()
  }, [submitError])

  const calculation = useMemo(() => {
    try {
      const cashMinor = mode === 'offset_only'
        ? 0
        : parseExpenseAmountToMinor(cashAmount, pair.currency, { allowZero: true })
      return {
        cashMinor,
        plan: planExpensePayAllSettlement(
          pair.outgoingContexts,
          pair.incomingContexts,
          {
            cashMinor,
            applyFullOffset: mode === 'cash_only' ? false : applyFullOffset,
          },
        ),
      }
    } catch {
      return null
    }
  }, [
    applyFullOffset,
    cashAmount,
    mode,
    pair.currency,
    pair.incomingContexts,
    pair.outgoingContexts,
  ])

  function resetForm() {
    setCashAmount(formatExpenseMinorForCopy(initialCashMinor, pair.currency))
    setApplyFullOffset(initialOffset)
    setDate(initialDate)
    setNote('')
    setSubmitError(null)
    setIsPending(false)
    requestIds.reset()
  }

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return
    if (nextOpen && !open) resetForm()
    setOpen(nextOpen)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isPending) return
    setSubmitError(null)
    if (!calculation?.plan.valid || !anchorContext) {
      setSubmitError(t('payAll.settlementInvalid'))
      return
    }
    if (
      calculation.cashMinor > 0
      && (!pair.paymentDetails || pair.paymentDetails.paymentDetailsState === 'unavailable')
    ) {
      setSubmitError(t('payAll.paymentUnavailable'))
      return
    }
    const expectedPaymentProfile = calculation.cashMinor > 0
      && pair.paymentDetails?.paymentDetailsState === 'available'
      ? pair.paymentDetails.expectedPaymentProfile
      : null
    const payload = {
      anchor: {
        group_id: anchorContext.groupId,
        from_member_id: anchorContext.fromMemberId,
        to_member_id: anchorContext.toMemberId,
      },
      currency: pair.currency,
      expected_contexts: [...pair.outgoingContexts, ...pair.incomingContexts].map(
        (context) => ({
          group_id: context.groupId,
          from_member_id: context.fromMemberId,
          to_member_id: context.toMemberId,
          expected_financial_version: context.expectedFinancialVersion,
          amount_minor: context.amountMinor,
        }),
      ),
      expected_payment_profile: expectedPaymentProfile ? {
        profile_id: expectedPaymentProfile.profileId,
        version: expectedPaymentProfile.version,
        state_token: expectedPaymentProfile.stateToken,
      } : null,
      cash_amount: formatExpenseMinorForCopy(calculation.cashMinor, pair.currency),
      use_offset: calculation.plan.offsetMinor > 0,
      occurred_on: date,
      note: note || null,
    }
    setIsPending(true)
    try {
      const result = await proposeExpenseSettlementBatch({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setSubmitError(t(`errors.${result.error}`))
        setIsPending(false)
        return
      }
      requestIds.succeeded(payload)
      setOpen(false)
      router.refresh()
    } catch {
      setSubmitError(t('errors.save_failed'))
      setIsPending(false)
    }
  }

  const planError = calculation?.plan.valid === false
    ? calculation.plan.error
    : calculation === null
      ? 'invalid_amount'
      : null
  const validPlan = calculation?.plan.valid ? calculation.plan : null
  const showPaymentDetails = Boolean(validPlan && validPlan.cashMinor > 0)
  const cashDetailsUnavailable = Boolean(
    validPlan
    && validPlan.cashMinor > 0
    && (!pair.paymentDetails || pair.paymentDetails.paymentDetailsState === 'unavailable'),
  )
  const submitLabel = mode === 'offset_only'
    ? t('payAll.submitOffset')
    : mode === 'combined'
      ? t('payAll.submitCombined')
      : t('payAll.submitPayment')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`${primary ? expensePrimaryButtonClass : expenseSecondaryButtonClass} w-full`}
        >
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {mode === 'offset_only'
                  ? t('payAll.offsetDialogTitle', { name: pair.counterpartyDisplayName })
                  : t('payAll.paymentDialogTitle', { name: pair.counterpartyDisplayName })}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('payAll.proposalDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isPending}
                aria-label={t('payAll.closeDetails')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
              >
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-5 space-y-4" onSubmit={submit}>
            {submitError ? (
              <p
                ref={alertRef}
                tabIndex={-1}
                role="alert"
                className="text-sm text-destructive"
              >
                {submitError}
              </p>
            ) : null}

            {mode !== 'offset_only' ? (
              <label>
                <span className={expenseLabelClass}>{t('payAll.cashLabel')}</span>
                <input
                  className={expenseInputClass}
                  type="text"
                  inputMode="decimal"
                  disabled={isPending}
                  value={formatExpenseAmountInput(cashAmount, pair.currency, locale)}
                  onChange={(event) => {
                    const next = normalizeExpenseAmountInput(
                      event.target.value,
                      pair.currency,
                      locale,
                    )
                    if (next !== null) setCashAmount(next)
                  }}
                  required
                />
              </label>
            ) : null}

            {mode === 'combined' && pair.offsetMinor > 0 ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  disabled={isPending}
                  checked={applyFullOffset}
                  onChange={(event) => setApplyFullOffset(event.target.checked)}
                  className="size-5 shrink-0 accent-primary"
                />
                <span>
                  {t('payAll.applyOffset', {
                    amount: formatExpenseMinor(pair.offsetMinor, pair.currency, locale),
                  })}
                </span>
              </label>
            ) : null}

            {planError ? (
              <p role="alert" className="text-sm text-destructive">
                {calculation === null
                  ? t('payAll.cashAmountInvalid')
                  : planError === 'cash_exceeds_payable' && calculation.plan.valid === false
                  ? t('payAll.cashExceedsWithOffset', {
                      max: formatExpenseMinor(
                        calculation.plan.maxCashMinor,
                        pair.currency,
                        locale,
                      ),
                      offset: formatExpenseMinor(
                        calculation.plan.appliedOffsetMinor,
                        pair.currency,
                        locale,
                      ),
                    })
                  : t('payAll.settlementAmountRequired')}
              </p>
            ) : null}

            {validPlan ? (
              <dl className="divide-y divide-border border-y border-border text-sm">
                <div className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">{t('payAll.cashLabel')}</dt>
                  <dd className="font-semibold">
                    {formatExpenseMinor(validPlan.cashMinor, pair.currency, locale)}
                  </dd>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">{t('payAll.offsetLabel')}</dt>
                  <dd className="font-semibold">
                    {formatExpenseMinor(validPlan.offsetMinor, pair.currency, locale)}
                  </dd>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <dt className="font-medium">{t('payAll.totalSettled')}</dt>
                  <dd className="font-semibold">
                    {formatExpenseMinor(validPlan.totalSettledMinor, pair.currency, locale)}
                  </dd>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">{t('payAll.remaining')}</dt>
                  <dd className="font-semibold">
                    {formatExpenseMinor(validPlan.remainingPayableMinor, pair.currency, locale)}
                  </dd>
                </div>
              </dl>
            ) : null}

            {showPaymentDetails ? (
              pair.paymentDetails?.paymentDetailsState === 'available' ? (
                <ExpensePaymentDetails
                  snapshot={pair.paymentDetails.paymentInstruction}
                  mode="current"
                  ownerFirstName={pair.counterpartyFirstName}
                  amount={{
                    display: formatExpenseMinor(
                      validPlan?.cashMinor ?? 0,
                      pair.currency,
                      locale,
                    ),
                    copy: formatExpenseMinorForCopy(
                      validPlan?.cashMinor ?? 0,
                      pair.currency,
                    ),
                  }}
                />
              ) : pair.paymentDetails ? (
                <p className="border-y border-border py-4 text-sm text-muted-foreground">
                  {pair.paymentDetails.paymentDetailsState === 'not_configured'
                    ? pair.counterpartyFirstName
                      ? t('payAll.paymentMissing', {
                          firstName: pair.counterpartyFirstName,
                        })
                      : t('payAll.paymentMissingGeneric')
                    : t('payAll.paymentUnavailable')}
                </p>
              ) : (
                <p className="border-y border-border py-4 text-sm text-muted-foreground">
                  {t('payAll.paymentUnavailable')}
                </p>
              )
            ) : null}

            <TeskeidDateField
              label={t('common.date')}
              value={date}
              onChange={setDate}
              placeholder={t('common.datePlaceholder')}
              required
              disabled={isPending}
            />
            <label>
              <span className={expenseLabelClass}>
                {t('common.note')}{' '}
                <span className="font-normal text-muted-foreground">
                  ({t('common.optional')})
                </span>
              </span>
              <textarea
                className={expenseTextareaClass}
                value={note}
                disabled={isPending}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
              />
            </label>

            <button
              className={`${expensePrimaryButtonClass} w-full`}
              type="submit"
              disabled={isPending || !validPlan || !anchorContext || cashDetailsUnavailable}
            >
              {isPending ? t('payAll.submittingProposal') : submitLabel}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
