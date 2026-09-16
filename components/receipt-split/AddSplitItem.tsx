'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { parseSplitDecimal, type SplitResult } from '@/lib/receipt-split/contracts'
import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { createRequestId, expenseInputClass as input, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'

export type AddedSplitItem = { description: string; quantity: number; amount: number }
export function AddSplitItem({ currency, disabled, sharing = false, onAdd }: {
  currency: string; disabled: boolean; sharing?: boolean
  onAdd: (item: AddedSplitItem, requestId: string) => Promise<SplitResult<unknown>>
}) {
  const t = useTranslations('teskeid.receiptSplit')
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<{ key: string; id: string } | null>(null)
  async function add() {
    const parsedQuantity = parseSplitDecimal(quantity, 3)
    const parsedAmount = parseSplitDecimal(amount, expenseCurrencyMinorDigits(currency))
    if (!description.trim() || description.trim().length > 200 || parsedQuantity === null
      || parsedQuantity <= 0 || parsedQuantity > 1000000 || parsedAmount === null || parsedAmount <= 0) {
      setError(t('invalid')); return
    }
    const item = { description: description.trim(), quantity: parsedQuantity, amount: parsedAmount }
    const key = JSON.stringify(item)
    if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    setPending(true); setError(null)
    try {
      const result = await onAdd(item, request.current.id)
      if (!result.ok) { setError(t(result.error)); return }
      request.current = null
      setDescription(''); setQuantity('1'); setAmount(''); setOpen(false)
    } catch { setError(t('failed')) }
    finally { setPending(false) }
  }
  return <section className="space-y-3">
    <button type="button" className={secondary + ' w-full'} disabled={disabled || pending}
      aria-expanded={open} onClick={() => setOpen(!open)}>{t('addItem')}</button>
    {open && <fieldset className="space-y-3 rounded-xl border border-border p-4" disabled={disabled || pending}>
      <legend className="px-2">{t('newItem')}</legend>
      <p className="text-sm leading-6 text-muted-foreground">{t(sharing ? 'addSharingHelp' : 'addReviewHelp')}</p>
      <label className="block text-sm">{t('description')}<input className={input} value={description} maxLength={200} onChange={e => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="min-w-0 text-sm">{t('quantity')}<input className={input} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <label className="min-w-0 text-sm">{t('amount')}<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" className={secondary + ' w-full'} onClick={add}>{pending ? t('pending') : t('addItem')}</button>
    </fieldset>}
  </section>
}
