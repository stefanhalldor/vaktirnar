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
  const [isNamePending, startNameTransition] = useTransition()
  const [isNotePending, startNoteTransition] = useTransition()
  const [note, setNote] = useState(initialNote ?? '')
  const [privateDisplayName, setPrivateDisplayName] = useState(initialPrivateDisplayName ?? '')
  const [savedNote, setSavedNote] = useState(initialNote ?? '')
  const [savedPrivateDisplayName, setSavedPrivateDisplayName] = useState(initialPrivateDisplayName ?? '')
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  function savePrivateDisplayName(event: React.FormEvent) {
    event.preventDefault()
    setNameStatus('idle')
    startNameTransition(async () => {
      const result = await updateRelationshipDetails(relationshipId, {
        field: 'privateDisplayName',
        value: privateDisplayName,
      })
      if (result.ok) {
        const normalized = privateDisplayName.trim()
        setPrivateDisplayName(normalized)
        setSavedPrivateDisplayName(normalized)
        setNameStatus('saved')
        router.refresh()
      } else {
        setNameStatus('error')
      }
    })
  }

  function saveNote(event: React.FormEvent) {
    event.preventDefault()
    setNoteStatus('idle')
    startNoteTransition(async () => {
      const result = await updateRelationshipDetails(relationshipId, {
        field: 'note',
        value: note,
      })
      if (result.ok) {
        const normalized = note.trim()
        setNote(normalized)
        setSavedNote(normalized)
        setNoteStatus('saved')
        router.refresh()
      } else {
        setNoteStatus('error')
      }
    })
  }

  const inputClass =
    'h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/10'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm leading-6 text-muted-foreground">{t('privateDetailsHint')}</p>

      <form onSubmit={savePrivateDisplayName} className="mt-4 space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="relationship-private-display-name" className="text-sm font-medium text-foreground">
            {t('privateDisplayName')}
          </label>
          <button
            type="submit"
            disabled={isNamePending || privateDisplayName === savedPrivateDisplayName}
            className="min-h-10 min-w-16 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isNamePending ? t('savingDetails') : t('vistaDetails')}
          </button>
        </div>
        <input
          id="relationship-private-display-name"
          type="text"
          value={privateDisplayName}
          onChange={(e) => { setPrivateDisplayName(e.target.value); setNameStatus('idle') }}
          maxLength={120}
          className={inputClass}
        />
        <div aria-live="polite">
          {nameStatus === 'saved' ? <p className="text-xs text-primary">{t('detailsVistadur')}</p> : null}
          {nameStatus === 'error' ? <p className="text-xs text-destructive">{t('errors.updateFailed')}</p> : null}
        </div>
      </form>

      <form onSubmit={saveNote} className="mt-4 space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="relationship-private-note" className="text-sm font-medium text-foreground">
            {t('note')}
          </label>
          <button
            type="submit"
            disabled={isNotePending || note === savedNote}
            className="min-h-10 min-w-16 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isNotePending ? t('savingDetails') : t('vistaDetails')}
          </button>
        </div>
        <textarea
          id="relationship-private-note"
          value={note}
          onChange={(e) => { setNote(e.target.value); setNoteStatus('idle') }}
          maxLength={1000}
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <div aria-live="polite">
          {noteStatus === 'saved' ? <p className="text-xs text-primary">{t('detailsVistadur')}</p> : null}
          {noteStatus === 'error' ? <p className="text-xs text-destructive">{t('errors.updateFailed')}</p> : null}
        </div>
      </form>
    </div>
  )
}
