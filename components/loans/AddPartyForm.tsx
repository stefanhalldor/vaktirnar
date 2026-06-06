'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addLoanInvitation } from '@/lib/loans/actions'

interface Props {
  loanId: string
}

export function AddPartyForm({ loanId }: Props) {
  const t = useTranslations('teskeid.loans')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [recipientEmail, setRecipientEmail] = useState('')
  const [error, setError] = useState('')
  const [saveEmailStatus, setSaveEmailStatus] = useState<'sent' | 'failed' | 'uncertain' | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      const result = await addLoanInvitation(loanId, { recipient_email: recipientEmail })
      if (result.ok) {
        setSaveEmailStatus(result.emailStatus ?? 'sent')
        setTimeout(() => {
          router.push('/auth-mvp/lanad-og-skilad')
          router.refresh()
        }, 2500)
      } else {
        if (result.error === 'recipient_unavailable') {
          setError(t('errors.recipientUnavailable'))
        } else if (result.error === 'rate_limited') {
          setError(t('errors.rateLimited'))
        } else if (result.error === 'already_has_invitation') {
          setError(t('errors.alreadyHasInvitation'))
        } else if (result.error === 'already_has_party') {
          setError(t('errors.alreadyHasParty'))
        } else {
          setError(t('errors.saveFailed'))
        }
      }
    })
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[#42493e]">{t('addPartyEmail')}</span>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          required
          maxLength={320}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saveEmailStatus !== null && (
        <p className={`text-sm ${saveEmailStatus === 'sent' ? 'text-[#154212]' : 'text-amber-600'}`}>
          {saveEmailStatus === 'sent'
            ? t('addPartySaved')
            : saveEmailStatus === 'failed'
              ? t('addPartySavedEmailFailed')
              : t('addPartySavedEmailUncertain')}
        </p>
      )}

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
          {isPending ? '...' : t('save')}
        </button>
      </div>
    </form>
  )
}
