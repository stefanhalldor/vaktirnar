'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LoanDateField } from './LoanDateField'
import type { ActionResult } from '@/lib/loans/actions'
import type { LoanItem } from '@/lib/loans/types'

interface Props {
  action: (input: unknown) => Promise<ActionResult>
  initial: LoanItem
}

export function LoanItemDetailsForm({ action, initial }: Props) {
  const t = useTranslations('teskeid.loans')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [itemName, setItemName] = useState(initial.item_name)
  const [note, setNote] = useState(initial.note ?? '')
  const [loanedAt, setLoanedAt] = useState(initial.loaned_at)
  const [dueAt, setDueAt] = useState(initial.due_at ?? '')
  const [error, setError] = useState('')

  const inputClass =
    'h-10 w-full rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await action({
        item_name: itemName,
        note: note || null,
        loaned_at: loanedAt,
        due_at: dueAt || null,
      })
      if (result.ok) {
        router.push('/auth-mvp/lanad-og-skilad')
        router.refresh()
      } else {
        setError(t('errors.saveFailed'))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[#42493e]">{t('itemName')}</span>
        <input
          type="text"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          required
          maxLength={200}
          className={inputClass}
        />
      </label>

      {/* Loaned at */}
      <LoanDateField
        label={t('loanedAt')}
        value={loanedAt}
        onChange={setLoanedAt}
        required
      />

      {/* Due date (optional) */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <LoanDateField
            label={t('dueDateOptional')}
            value={dueAt}
            onChange={setDueAt}
            min={loanedAt}
          />
        </div>
        {dueAt && (
          <button
            type="button"
            onClick={() => setDueAt('')}
            aria-label={t('clearDueDate')}
            className="h-10 w-10 rounded-xl border border-gray-200 text-[#72796e] hover:bg-gray-50 transition-colors shrink-0 flex items-center justify-center text-base"
          >
            ×
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[#42493e]">{t('noteOptional')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 resize-none"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-[#42493e] hover:bg-gray-50 transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}
