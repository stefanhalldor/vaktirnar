'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  deleteRelationshipLabelV2,
  saveRelationshipLabelV2,
  setRelationshipLabelAssignmentV2,
} from '@/lib/relationships/actions-v2'
import type { RelationshipCustomLabel } from '@/lib/relationships/types'

function requestId() {
  return crypto.randomUUID()
}

export function RelationshipLabelsForm({
  relationshipId,
  labels,
  assignedLabelIds,
  available,
}: {
  relationshipId: string
  labels: RelationshipCustomLabel[]
  assignedLabelIds: string[]
  available: boolean
}) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function createLabel(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const created = await saveRelationshipLabelV2({ name: trimmed, request_id: requestId() })
      if (!created.ok) { setError(t('errors.updateFailed')); return }
      const assigned = await setRelationshipLabelAssignmentV2({
        relationship_id: relationshipId,
        label_id: created.data.labelId,
        assigned: true,
        request_id: requestId(),
      })
      if (!assigned.ok) { setError(t('errors.updateFailed')); return }
      setName('')
      router.refresh()
    })
  }

  function toggle(labelId: string, assigned: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setRelationshipLabelAssignmentV2({
        relationship_id: relationshipId,
        label_id: labelId,
        assigned: !assigned,
        request_id: requestId(),
      })
      if (!result.ok) setError(t('errors.updateFailed'))
      else router.refresh()
    })
  }

  function remove(label: RelationshipCustomLabel) {
    if (!window.confirm(t('deleteLabelConfirm', { name: label.name }))) return
    startTransition(async () => {
      const result = await deleteRelationshipLabelV2({
        label_id: label.id,
        expected_version: label.version,
        request_id: requestId(),
      })
      if (!result.ok) setError(t('errors.updateFailed'))
      else router.refresh()
    })
  }

  function rename(label: RelationshipCustomLabel) {
    const trimmed = editingName.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await saveRelationshipLabelV2({
        label_id: label.id,
        expected_version: label.version,
        name: trimmed,
        request_id: requestId(),
      })
      if (!result.ok) { setError(t('errors.updateFailed')); return }
      setEditingId(null)
      setEditingName('')
      router.refresh()
    })
  }

  if (!available) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('labelsNeedMigration')}</p>

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{t('myLabels')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('privateLabelsHint')}</p>
      </div>
      {labels.length > 0 ? <div className="space-y-2">{labels.map((label) => {
        const assigned = assignedLabelIds.includes(label.id)
        return <div key={label.id} className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border py-2">
          {editingId === label.id ? <>
          <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={60} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base" aria-label={t('renameLabel')} />
          <button type="button" disabled={isPending || !editingName.trim()} onClick={() => rename(label)} className="min-h-10 rounded-xl bg-primary px-3 text-xs text-primary-foreground">{t('saveLabelName')}</button>
          </> : <>
          <button type="button" disabled={isPending} onClick={() => toggle(label.id, assigned)} aria-pressed={assigned} className={`min-h-10 flex-1 rounded-full border px-3 text-left text-sm ${assigned ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
            {label.name}
          </button>
          <button type="button" disabled={isPending} onClick={() => { setEditingId(label.id); setEditingName(label.name) }} className="min-h-10 rounded-xl px-3 text-xs text-primary">{t('renameLabel')}</button>
          <button type="button" disabled={isPending} onClick={() => remove(label)} className="min-h-10 rounded-xl px-3 text-xs text-destructive">
            {t('deleteLabel')}
          </button>
          </>}
        </div>
      })}</div> : <p className="text-sm text-muted-foreground">{t('noLabels')}</p>}
      <form onSubmit={createLabel} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('newLabelName')}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base" placeholder={t('newLabelName')} />
        </label>
        <button type="submit" disabled={isPending || !name.trim()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{t('addLabel')}</button>
      </form>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
