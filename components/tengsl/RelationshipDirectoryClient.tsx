'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { RelationshipListItem } from '@/lib/relationships/actions'
import { setRelationshipLabelAssignmentV2 } from '@/lib/relationships/actions-v2'
import type { RelationshipCircleSummary, RelationshipCustomLabel } from '@/lib/relationships/types'
import { getRelationshipDisplayName } from '@/lib/relationships/display-and-sort'

function requestId() {
  return crypto.randomUUID()
}

export function RelationshipDirectoryClient({
  items,
  labels,
  relationshipLabelIds,
  circles,
}: {
  items: RelationshipListItem[]
  labels: RelationshipCustomLabel[]
  relationshipLabelIds: Record<string, string[]>
  circles: RelationshipCircleSummary[]
}) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState(relationshipLabelIds)
  const [selectedRelationshipIds, setSelectedRelationshipIds] = useState<string[]>([])
  const [bulkLabelId, setBulkLabelId] = useState(labels[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const filtered = selectedLabelId
    ? items.filter((item) => assignments[item.id]?.includes(selectedLabelId))
    : items

  function updateLocal(relationshipIds: string[], labelId: string, assigned: boolean) {
    setAssignments((current) => {
      const next = { ...current }
      for (const relationshipId of relationshipIds) {
        const existing = next[relationshipId] ?? []
        next[relationshipId] = assigned
          ? [...new Set([...existing, labelId])]
          : existing.filter((candidate) => candidate !== labelId)
      }
      return next
    })
  }

  function setLabels(relationshipIds: string[], labelId: string, assigned: boolean) {
    if (relationshipIds.length === 0 || !labelId) return
    setError(null)
    startTransition(async () => {
      const results = await Promise.all(relationshipIds.map((relationshipId) => (
        setRelationshipLabelAssignmentV2({
          relationship_id: relationshipId,
          label_id: labelId,
          assigned,
          request_id: requestId(),
        })
      )))
      if (results.some((result) => !result.ok)) {
        setError(t('errors.updateFailed'))
        return
      }
      updateLocal(relationshipIds, labelId, assigned)
      setSelectedRelationshipIds([])
      router.refresh()
    })
  }

  function toggleSelected(relationshipId: string) {
    setSelectedRelationshipIds((current) => current.includes(relationshipId)
      ? current.filter((candidate) => candidate !== relationshipId)
      : [...current, relationshipId])
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Link href="/stillingar/tengsl/hringir" className="flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-sm font-medium">
          {t('circles')} <span className="ml-1 text-muted-foreground">{circles.length}</span>
        </Link>
        <Link href="/stillingar/tengsl/hringir/nyr" className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground">
          {t('newCircle')}
        </Link>
      </div>

      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t('filterByLabel')}>
          <button type="button" onClick={() => setSelectedLabelId(null)} className={`min-h-10 rounded-full border px-3 text-sm ${selectedLabelId === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
            {t('all')} <span className="ml-1 opacity-75">{items.length}</span>
          </button>
          {labels.map((label) => (
            <button key={label.id} type="button" onClick={() => setSelectedLabelId(label.id)} className={`min-h-10 rounded-full border px-3 text-sm ${selectedLabelId === label.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
              {label.name} <span className="ml-1 opacity-75">{label.relationshipCount}</span>
            </button>
          ))}
        </div>
      ) : null}

      {labels.length > 0 && selectedRelationshipIds.length > 0 ? (
        <div className="sticky top-2 z-10 space-y-2 rounded-xl border border-border bg-background p-3 shadow-sm">
          <p className="text-sm font-medium">{t('bulkSelected', { count: selectedRelationshipIds.length })}</p>
          <div className="flex flex-wrap gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('bulkLabel')}</span>
              <select value={bulkLabelId} onChange={(event) => setBulkLabelId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base">
                {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={isPending || !bulkLabelId} onClick={() => setLabels(selectedRelationshipIds, bulkLabelId, true)} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t('bulkAdd')}</button>
            <button type="button" disabled={isPending || !bulkLabelId} onClick={() => setLabels(selectedRelationshipIds, bulkLabelId, false)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50">{t('bulkRemove')}</button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{selectedLabelId ? t('emptyFilter') : t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((item) => {
            const itemLabels = labels.filter((label) => assignments[item.id]?.includes(label.id))
            const selected = selectedRelationshipIds.includes(item.id)
            const displayName = getRelationshipDisplayName({
              privateDisplayName: item.private_display_name,
              counterpartDisplayName: item.counterpart_display_name,
              email: item.email_canonical,
              fallback: t('unknownContact'),
            })
            return (
              <li key={item.id} className="flex min-h-14 items-start gap-2 py-2">
                {labels.length > 0 ? <label className="flex min-h-11 shrink-0 items-center">
                  <span className="sr-only">{t('selectRelationship', { name: displayName })}</span>
                  <input type="checkbox" checked={selected} onChange={() => toggleSelected(item.id)} className="size-5 accent-primary" />
                </label> : null}
                <Link href={`/stillingar/tengsl/${item.id}`} className="min-w-0 flex-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  {itemLabels.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {itemLabels.map((label) => <span key={label.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label.name}</span>)}
                    </div>
                  ) : null}
                </Link>
                {labels.length > 0 ? <details className="relative shrink-0">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-border px-3 text-sm font-medium">{t('quickLabels')}</summary>
                  <div className="absolute right-0 z-20 mt-1 min-w-48 rounded-xl border border-border bg-background p-2 shadow-lg">
                    {labels.map((label) => {
                      const assigned = assignments[item.id]?.includes(label.id) ?? false
                      return <button key={label.id} type="button" disabled={isPending} aria-pressed={assigned} onClick={() => setLabels([item.id], label.id, !assigned)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-muted disabled:opacity-50"><span>{label.name}</span><span aria-hidden>{assigned ? '✓' : ''}</span></button>
                    })}
                  </div>
                </details> : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
