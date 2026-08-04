'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reportExpenseRepayment } from '@/lib/expenses/actions'
import type { ExpenseSettlementTransferView } from '@/lib/expenses/contracts'
import { formatExpenseMinor, formatExpenseMinorForCopy } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseInputClass, expenseLabelClass, expensePrimaryButtonClass, expenseTextareaClass } from './ui'

export function ExpenseRepaymentReportForm({ groupId, transfer, initialDate }: {
  groupId: string
  transfer: ExpenseSettlementTransferView
  initialDate: string
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
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
      const result = await reportExpenseRepayment({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      router.push(`/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/${result.data.repaymentId}`)
      router.refresh()
    })
  }

  return (
    <form className="mt-3 space-y-3 border-t border-border pt-3" onSubmit={submit}>
      <p className="text-xs leading-5 text-muted-foreground">{t('repayment.outsidePayment')}</p>
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
      <label><span className={expenseLabelClass}>{t('common.amount')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /><span className="mt-1 block text-xs text-muted-foreground">{t('repayment.maximum', { amount: formatExpenseMinor(transfer.amountMinor, transfer.currency) })}</span></label>
      <label><span className={expenseLabelClass}>{t('common.date')}</span><input className={expenseInputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label><span className={expenseLabelClass}>{t('common.note')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><textarea className={expenseTextareaClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
      <button className={`${expensePrimaryButtonClass} w-full`} type="submit" disabled={isPending}>{isPending ? t('repayment.reporting') : t('repayment.report')}</button>
    </form>
  )
}
