'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateRelationshipTag } from '@/lib/relationships/tag-action'
import { ALLOWED_TAGS, type RelationshipTag } from '@/lib/relationships/types'

interface Props {
  relationshipId: string
  currentTag: RelationshipTag | null
}

export function TagSelectForm({ relationshipId, currentTag }: Props) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>(currentTag ?? 'unclassified')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function tagLabel(tag: RelationshipTag): string {
    const key = `tag${tag.charAt(0).toUpperCase()}${tag.slice(1)}` as Parameters<typeof t>[0]
    return t(key)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const result = await updateRelationshipTag(relationshipId, selected)
      if (result.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(t('errors.updateFailed'))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t('flokkur')}</span>
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setSaved(false) }}
          disabled={isPending}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {ALLOWED_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tagLabel(tag)}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && (
        <p className="text-sm text-green-700">{t('flokkVistadur')}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isPending ? '...' : t('vistaFlokk')}
      </button>
    </form>
  )
}
