'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { addExpenseGroupMember, removeExpenseGroupMember } from '@/lib/expenses/actions'
import type { ExpenseMemberView, ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expenseInputClass,
  expenseSecondaryButtonClass,
} from './ui'

export function ExpenseMemberManager({
  groupId,
  members,
  options,
  optionsError,
  canManage,
}: {
  groupId: string
  members: ExpenseMemberView[]
  options: ExpenseParticipantOption[]
  optionsError: boolean
  canManage: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [relationshipId, setRelationshipId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function showError(code: string) {
    setError(t(`errors.${code}`))
    queueMicrotask(() => alertRef.current?.focus())
  }

  function add(kind: 'relationship' | 'guest') {
    const member = kind === 'relationship'
      ? { type: 'relationship' as const, relationship_id: relationshipId }
      : { type: 'guest' as const, display_name: guestName.trim() }
    const payload = { group_id: groupId, member }
    setError(null)
    setPendingKey(`add:${kind}`)
    startTransition(async () => {
      const result = await addExpenseGroupMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      setRelationshipId('')
      setGuestName('')
      router.refresh()
    })
  }

  function remove(member: ExpenseMemberView) {
    if (!window.confirm(t('group.removeMemberConfirm', { name: member.displayName }))) return
    setError(null)
    setPendingKey(`remove:${member.id}`)
    const payload = { group_id: groupId, member_id: member.id }
    startTransition(async () => {
      const result = await removeExpenseGroupMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      router.refresh()
    })
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{t('group.members')}</h2>
      <div className="divide-y divide-border border-y border-border">
        {members.map((member) => {
          const statusKey = `group.member${member.status[0]!.toUpperCase()}${member.status.slice(1)}`
          const canRemove = canManage && !member.isSelf && ['active', 'invited'].includes(member.status)
          return (
            <div key={member.id} className="flex min-h-12 items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{member.displayName}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(statusKey)} · {t(member.isRegistered ? 'group.registered' : 'group.guest')}
                </span>
              </span>
              {canRemove ? (
                <button
                  type="button"
                  aria-label={t('group.removeMember', { name: member.displayName })}
                  className={`${expenseDangerButtonClass} size-11 shrink-0 px-0`}
                  disabled={isPending}
                  onClick={() => remove(member)}
                >
                  <X aria-hidden size={17} />
                  <span className="sr-only">
                    {pendingKey === `remove:${member.id}` ? t('group.removingMember') : t('group.removeMember', { name: member.displayName })}
                  </span>
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {canManage ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">{t('group.addMemberHint')}</p>
          {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
          {optionsError ? <p role="status" className="text-sm text-amber-800">{t('group.memberOptionsError')}</p> : null}
          {options.length > 0 ? (
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('group.addKnownMember')}</span>
                <select className={expenseInputClass} value={relationshipId} onChange={(event) => setRelationshipId(event.target.value)}>
                  <option value="">{t('group.addKnownMember')}</option>
                  {options.map((option) => <option key={option.relationshipId} value={option.relationshipId}>{option.pickerLabel}</option>)}
                </select>
              </label>
              <button type="button" className={`${expenseSecondaryButtonClass} size-11 px-0`} disabled={isPending || !relationshipId} onClick={() => add('relationship')}>
                <Plus aria-hidden size={18} />
                <span className="sr-only">{pendingKey === 'add:relationship' ? t('group.addingMember') : t('group.addKnownMember')}</span>
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('group.guestName')}</span>
              <input className={expenseInputClass} value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={120} placeholder={t('group.guestName')} />
            </label>
            <button type="button" className={`${expenseSecondaryButtonClass} size-11 px-0`} disabled={isPending || !guestName.trim()} onClick={() => add('guest')}>
              <Plus aria-hidden size={18} />
              <span className="sr-only">{pendingKey === 'add:guest' ? t('group.addingMember') : t('group.addGuest')}</span>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
