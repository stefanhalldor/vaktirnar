'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { inviteRelationshipToCircle } from '@/lib/relationships/actions-v2'

export function RelationshipCircleInviteForm({ circleId, options }: { circleId: string; options: Array<{ relationshipId: string; label: string }> }) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [relationshipId, setRelationshipId] = useState('')
  const [error, setError] = useState(false)
  const [invitationHref, setInvitationHref] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(false)
    startTransition(async () => {
      const result = await inviteRelationshipToCircle({ circle_id: circleId, relationship_id: relationshipId, request_id: crypto.randomUUID() })
      if (!result.ok) { setError(true); return }
      setRelationshipId('')
      setInvitationHref(`/stillingar/tengsl/bod/${result.data.invitationId}`)
      router.refresh()
    })
  }
  return <form onSubmit={submit} className="space-y-3 border-y border-border py-4">
    <label className="block"><span className="mb-1 block text-sm font-medium">{t('invitePerson')}</span><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base" value={relationshipId} onChange={(event) => setRelationshipId(event.target.value)} required><option value="">{t('choosePerson')}</option>{options.map((option) => <option key={option.relationshipId} value={option.relationshipId}>{option.label}</option>)}</select></label>
    <p className="text-xs leading-5 text-muted-foreground">{t('inviteFullRosterDisclosure')}</p>
    {error ? <p role="alert" className="text-sm text-destructive">{t('errors.updateFailed')}</p> : null}
    {invitationHref ? <p role="status" className="rounded-xl bg-muted p-3 text-xs leading-5"><span className="block">{t('circleInviteSaved')}</span><a className="break-all font-medium text-primary underline" href={invitationHref}>{invitationHref}</a></p> : null}
    <button type="submit" disabled={isPending || !relationshipId} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{isPending ? t('saving') : t('sendCircleInvite')}</button>
  </form>
}
