'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addLoanInvitation, setLoanCounterpartyName } from '@/lib/loans/actions'
import type { RelationshipRecipientOption } from '@/lib/relationships/actions'
import { LoanRelationshipPicker, type LoanCounterpartySelection } from './LoanRelationshipPicker'

interface Props {
  loanId: string
  relationshipOptions?: RelationshipRecipientOption[]
  relationshipOptionsError?: boolean
}

export function AddPartyForm({ loanId, relationshipOptions = [], relationshipOptionsError = false }: Props) {
  const t = useTranslations('teskeid.loans')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [counterparty, setCounterparty] = useState<LoanCounterpartySelection | null>(null)
  const [error, setError] = useState('')
  const [saveEmailStatus, setSaveEmailStatus] = useState<'saved' | 'sent' | 'failed' | 'uncertain' | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      if (!counterparty) {
        setError(t('counterpartyRequired'))
        return
      }
      const result = counterparty.kind === 'email'
        ? await addLoanInvitation(loanId, { recipient_email: counterparty.email })
        : await setLoanCounterpartyName(loanId, { counterparty_name: counterparty.name })
      if (result.ok) {
        setSaveEmailStatus(counterparty.kind === 'email' ? (result.emailStatus ?? 'sent') : 'saved')
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <LoanRelationshipPicker
        options={relationshipOptions}
        optionsError={relationshipOptionsError}
        disabled={isPending}
        value={counterparty}
        onChange={setCounterparty}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saveEmailStatus !== null && (
        <p className={`text-sm ${saveEmailStatus === 'sent' || saveEmailStatus === 'saved' ? 'text-[#154212]' : 'text-amber-600'}`}>
          {saveEmailStatus === 'saved'
            ? t('counterpartySaved')
            : saveEmailStatus === 'sent'
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
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}
