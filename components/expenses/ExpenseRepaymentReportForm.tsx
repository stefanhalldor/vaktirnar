'use client'

import { useRef, useState, useTransition } from 'react'
import { useLocale } from 'next-intl'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import {
  recordExpenseRepaymentReceived,
  reportExpenseRepayment,
} from '@/lib/expenses/actions'
import type { ExpenseSettlementTransferView } from '@/lib/expenses/contracts'
import {
  formatExpenseAmountInput,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
  normalizeExpenseAmountInput,
} from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseInputClass, expenseLabelClass, expensePrimaryButtonClass, expenseTextareaClass } from './ui'

export type ExpenseRepaymentMutationMode = 'report' | 'recordReceived'

export function ExpenseRepaymentReportForm({ groupId, transfer, initialDate, mode, onSaved }: {
  groupId: string
  transfer: ExpenseSettlementTransferView
  initialDate: string
  mode: ExpenseRepaymentMutationMode
  onSaved: () => void
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [amount, setAmount] = useState(formatExpenseMinorForCopy(
    transfer.amountMinor,
    transfer.currency,
  ))
  const [date, setDate] = useState(initialDate)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const payload = {
      group_id: groupId,
      from_member_id: transfer.fromMemberId,
      to_member_id: transfer.toMemberId,
      expected_financial_version: transfer.expectedFinancialVersion,
      amount,
      currency: transfer.currency,
      occurred_on: date,
      note: note || null,
    }
    startTransition(async () => {
      const action = mode === 'recordReceived'
        ? recordExpenseRepaymentReceived
        : reportExpenseRepayment
      const result = await action({
        ...payload,
        request_id: requestIds.forPayload({ ...payload, mode }),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded({ ...payload, mode })
      onSaved()
    })
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
      <label><span className={expenseLabelClass}>{t('common.amount')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={formatExpenseAmountInput(amount, transfer.currency, locale)} onChange={(event) => { const next = normalizeExpenseAmountInput(event.target.value, transfer.currency, locale); if (next !== null) setAmount(next) }} required /><span className="mt-1 block text-xs text-muted-foreground">{t('repayment.maximum', { amount: formatExpenseMinor(transfer.amountMinor, transfer.currency, locale) })}</span></label>
      <TeskeidDateField label={t('common.date')} value={date} onChange={setDate} placeholder={t('common.datePlaceholder')} required />
      <label><span className={expenseLabelClass}>{t('common.note')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><textarea className={expenseTextareaClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
      <button className={`${expensePrimaryButtonClass} w-full`} type="submit" disabled={isPending}>
        {isPending
          ? t(mode === 'recordReceived' ? 'repayment.recordingReceived' : 'repayment.reporting')
          : t(mode === 'recordReceived' ? 'repayment.recordReceived' : 'repayment.report')}
      </button>
    </form>
  )
}
