'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createRelationshipCircle } from '@/lib/relationships/actions-v2'

export function RelationshipCircleForm() {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(false)
    startTransition(async () => {
      const result = await createRelationshipCircle({
        name,
        description,
        request_id: crypto.randomUUID(),
      })
      if (!result.ok) { setError(true); return }
      router.push(`/stillingar/tengsl/hringir/${result.data.circleId}`)
    })
  }

  return <form onSubmit={submit} className="space-y-5">
    <label className="block"><span className="mb-1 block text-sm font-medium">{t('circleName')}</span><input className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
    <label className="block"><span className="mb-1 block text-sm font-medium">{t('circleDescription')} <span className="font-normal text-muted-foreground">({t('optional')})</span></span><textarea className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-base" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
    <p className="text-xs leading-5 text-muted-foreground">{t('circleReusableHint')}</p>
    {error ? <p role="alert" className="text-sm text-destructive">{t('errors.updateFailed')}</p> : null}
    <button type="submit" disabled={isPending || !name.trim()} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{isPending ? t('saving') : t('createCircle')}</button>
  </form>
}
