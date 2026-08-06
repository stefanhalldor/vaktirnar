'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  archiveRelationshipCircle,
  leaveRelationshipCircle,
  removeRelationshipCircleMember,
  transferRelationshipCircleOwnership,
} from '@/lib/relationships/actions-v2'
import type { RelationshipCircleDetail } from '@/lib/relationships/types'

export function RelationshipCircleLifecycleActions({ circle }: { circle: RelationshipCircleDetail }) {
  const t = useTranslations('teskeid.stillingar.tengsl')
  const router = useRouter()
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const otherMembers = circle.members.filter((member) => !member.isSelf && member.role === 'member')

  function run(action: () => Promise<{ ok: boolean }>, leavePage = false) {
    setError(false)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) { setError(true); return }
      if (leavePage) router.push('/stillingar/tengsl/hringir')
      else router.refresh()
    })
  }

  return <section className="space-y-3 border-t border-border pt-5">
    {circle.canManage ? <>
      {otherMembers.map((member) => <div key={member.id} className="flex min-h-11 items-center justify-between gap-3"><span className="min-w-0 text-sm">{member.displayName}</span><button type="button" disabled={isPending} className="min-h-10 rounded-xl border border-border px-3 text-xs" onClick={() => { if (window.confirm(t('removeCircleMemberConfirm', { name: member.displayName }))) run(() => removeRelationshipCircleMember({ circle_id: circle.id, member_id: member.id, request_id: crypto.randomUUID() })) }}>{t('removeCircleMember')}</button></div>)}
      {otherMembers.length > 0 ? <label className="block"><span className="mb-1 block text-sm font-medium">{t('transferOwnership')}</span><select disabled={isPending} defaultValue="" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base" onChange={(event) => { const memberId = event.target.value; if (memberId && window.confirm(t('transferOwnershipConfirm'))) run(() => transferRelationshipCircleOwnership({ circle_id: circle.id, member_id: memberId, expected_version: circle.version, request_id: crypto.randomUUID() })) }}><option value="">{t('chooseNewOwner')}</option>{otherMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label> : null}
      <button type="button" disabled={isPending} className="min-h-11 w-full rounded-xl border border-destructive px-3 text-sm text-destructive" onClick={() => { if (window.confirm(t('archiveCircleConfirm'))) run(() => archiveRelationshipCircle({ circle_id: circle.id, expected_version: circle.version, request_id: crypto.randomUUID() }), true) }}>{t('archiveCircle')}</button>
    </> : <button type="button" disabled={isPending} className="min-h-11 w-full rounded-xl border border-destructive px-3 text-sm text-destructive" onClick={() => { if (window.confirm(t('leaveCircleConfirm'))) run(() => leaveRelationshipCircle({ circle_id: circle.id, request_id: crypto.randomUUID() }), true) }}>{t('leaveCircle')}</button>}
    {error ? <p role="alert" className="text-sm text-destructive">{t('errors.updateFailed')}</p> : null}
  </section>
}
