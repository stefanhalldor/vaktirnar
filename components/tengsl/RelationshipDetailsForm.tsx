'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { updateRelationshipDetails } from '@/lib/relationships/tag-action'

interface Props {
  relationshipId: string
  initialNote: string | null
  initialPrivateDisplayName: string | null
}

export function RelationshipDetailsForm({ relationshipId, initialNote, initialPrivateDisplayName }: Props) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState(initialNote ?? '')
  const [privateDisplayName, setPrivateDisplayName] = useState(initialPrivateDisplayName ?? '')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    startTransition(async () => {
      const result = await updateRelationshipDetails(relationshipId, { note, privateDisplayName })
      if (result.ok) {
        setStatus('saved')
        router.refresh()
      } else {
        setStatus('error')
      }
    })
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t('privateDisplayName')}</span>
        <input
          type="text"
          value={privateDisplayName}
          onChange={(e) => { setPrivateDisplayName(e.target.value); setStatus('idle') }}
          maxLength={120}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t('note')}</span>
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setStatus('idle') }}
          maxLength={1000}
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 resize-none"
        />
      </label>
      {status === 'saved' && (
        <p className="text-xs text-[#154212]">{t('detailsVistadur')}</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600">{t('errors.updateFailed')}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="h-9 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50 self-start px-4"
      >
        {t('vistaDetails')}
      </button>
    </form>
  )
}
