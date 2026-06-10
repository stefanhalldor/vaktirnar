'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LoanDateField } from './LoanDateField'
import type { ActionResult } from '@/lib/loans/actions'
import type { LoanItem } from '@/lib/loans/types'

interface Props {
  action: (input: unknown) => Promise<ActionResult>
  initial?: LoanItem
}

export function LoanForm({ action, initial }: Props) {
  const t = useTranslations('teskeid.loans')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const saving = isSubmitting || isPending

  const isCreate = !initial
  const today = new Date().toISOString().slice(0, 10)

  // Stable request ID per form mount — never changes on re-render
  const [requestId] = useState(() => crypto.randomUUID())

  const [creatorRole, setCreatorRole] = useState<'lender' | 'borrower'>('lender')
  const [itemName, setItemName] = useState(initial?.item_name ?? '')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [loanedAt, setLoanedAt] = useState(initial?.loaned_at ?? today)
  const [dueAt, setDueAt] = useState(initial?.due_at ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setIsSubmitting(true)
    setError('')

    const input = isCreate
      ? {
          item_name: itemName,
          creator_role: creatorRole,
          recipient_email: recipientEmail || undefined,
          loaned_at: loanedAt,
          due_at: dueAt || null,
          note: note || null,
          request_id: requestId,
        }
      : {
          item_name: itemName,
          loaned_at: loanedAt,
          due_at: dueAt || null,
          note: note || null,
        }

    startTransition(async () => {
      try {
        const result = await action(input)
        if (result.ok) {
          router.push('/auth-mvp/lanad-og-skilad')
          router.refresh()
        } else {
          setIsSubmitting(false)
          if (result.error === 'recipient_unavailable') {
            setError(t('errors.recipientUnavailable'))
          } else if (result.error === 'rate_limited') {
            setError(t('errors.rateLimited'))
          } else {
            setError(t('errors.saveFailed'))
          }
        }
      } catch {
        setIsSubmitting(false)
        setError(t('errors.saveFailed'))
      }
    })
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Creator role toggle — create mode only */}
      {isCreate && (
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {(['lender', 'borrower'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setCreatorRole(role)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                creatorRole === role
                  ? 'bg-[#154212] text-white'
                  : 'bg-white text-[#42493e] hover:bg-gray-50'
              }`}
            >
              {role === 'lender' ? t('creatorRoleLender') : t('creatorRoleBorrowed')}
            </button>
          ))}
        </div>
      )}

      {/* Item name */}
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

      {/* Recipient email — optional, create mode only */}
      {isCreate && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[#42493e]">{t('recipientEmailOptional')}</span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            maxLength={320}
            className={inputClass}
          />
        </label>
      )}

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

      {/* Note (optional) */}
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
          disabled={saving}
          className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}
