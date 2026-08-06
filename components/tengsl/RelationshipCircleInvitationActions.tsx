'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { respondRelationshipCircleInvitation } from '@/lib/relationships/actions-v2'

export function RelationshipCircleInvitationActions({ invitationId }: { invitationId: string }) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()
  function respond(action: 'accept' | 'decline') {
    setError(false)
    startTransition(async () => {
      const result = await respondRelationshipCircleInvitation({ invitation_id: invitationId, action, request_id: crypto.randomUUID() })
      if (!result.ok) { setError(true); return }
      router.push(action === 'accept' ? `/stillingar/tengsl/hringir/${result.data.circleId}` : '/stillingar/tengsl/hringir')
    })
  }
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><button type="button" disabled={isPending} onClick={() => respond('decline')} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{t('decline')}</button><button type="button" disabled={isPending} onClick={() => respond('accept')} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground">{isPending ? t('saving') : t('accept')}</button></div>{error ? <p role="alert" className="text-sm text-destructive">{t('errors.updateFailed')}</p> : null}</div>
}
