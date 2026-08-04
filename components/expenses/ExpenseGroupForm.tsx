'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createExpenseGroup } from '@/lib/expenses/actions'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { EXPENSE_CURRENCIES } from '@/lib/expenses/input-money'
import type { ExpenseNewMemberInput } from '@/lib/expenses/validation'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { createRequestId, expenseInputClass, expenseLabelClass, expensePrimaryButtonClass, expenseSecondaryButtonClass, expenseTextareaClass } from './ui'

interface SelectedMember {
  key: string
  label: string
  input: ExpenseNewMemberInput
}

export function ExpenseGroupForm({ options, optionsError }: {
  options: ExpenseParticipantOption[]
  optionsError: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('')
  const [currency, setCurrency] = useState('ISK')
  const [includeCreator, setIncludeCreator] = useState(true)
  const [selected, setSelected] = useState<SelectedMember[]>([])
  const [relationshipId, setRelationshipId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function addRelationship() {
    const option = options.find((candidate) => candidate.relationshipId === relationshipId)
    if (!option || selected.some((item) => item.key === `relationship:${option.relationshipId}`)) return
    const key = `relationship:${option.relationshipId}`
    setSelected((current) => [...current, {
      key,
      label: option.pickerLabel,
      input: { type: 'relationship', key, relationship_id: option.relationshipId },
    }])
    setRelationshipId('')
  }

  function addGuest() {
    const label = guestName.trim()
    if (!label) return
    const key = `guest:${createRequestId()}`
    setSelected((current) => [...current, { key, label, input: { type: 'guest', key, display_name: label } }])
    setGuestName('')
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const payload = {
      name,
      description: description || null,
      emoji: emoji || null,
      default_currency: currency,
      default_include_creator: includeCreator,
      members: [
        { type: 'self' as const, key: 'self' },
        ...selected.map((member) => member.input),
      ],
    }
    startTransition(async () => {
      const result = await createExpenseGroup({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      router.push(`/auth-mvp/utlagt-og-endurgreitt/hopar/${result.data.groupId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <section className="space-y-4 border-y border-border py-5">
        <label><span className={expenseLabelClass}>{t('groupForm.name')}</span><input className={expenseInputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required placeholder={t('groupForm.namePlaceholder')} /></label>
        <label><span className={expenseLabelClass}>{t('groupForm.description')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><textarea className={expenseTextareaClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></label>
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3"><label><span className={expenseLabelClass}>{t('groupForm.emoji')}</span><input className={expenseInputClass} value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} /></label><label><span className={expenseLabelClass}>{t('groupForm.defaultCurrency')}</span><select className={expenseInputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>{EXPENSE_CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={includeCreator} onChange={(e) => setIncludeCreator(e.target.checked)} />{t('groupForm.includeCreator')}</label>
      </section>

      <section className="space-y-4 border-y border-border py-5" aria-labelledby="group-members-heading">
        <div><h2 id="group-members-heading" className="text-sm font-semibold">{t('groupForm.members')}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('groupForm.consentHint')}</p></div>
        {optionsError ? <p role="status" className="text-sm text-amber-800">{t('expenseForm.participantLoadError')}</p> : null}
        {selected.length > 0 ? <div className="divide-y divide-border">{selected.map((member) => <div key={member.key} className="flex min-h-12 items-center gap-2 py-2"><span className="min-w-0 flex-1 truncate text-sm">{member.label}</span><button type="button" aria-label={t('expenseForm.removeParticipant', { name: member.label })} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted" onClick={() => setSelected((current) => current.filter((item) => item.key !== member.key))}><X aria-hidden size={18} /></button></div>)}</div> : null}
        {options.length > 0 ? <div className="flex gap-2"><select aria-label={t('expenseForm.knownPeople')} className={expenseInputClass} value={relationshipId} onChange={(e) => setRelationshipId(e.target.value)}><option value="">{t('expenseForm.knownPeople')}</option>{options.filter((option) => !selected.some((item) => item.key === `relationship:${option.relationshipId}`)).map((option) => <option key={option.relationshipId} value={option.relationshipId}>{option.pickerLabel}</option>)}</select><button type="button" className={expenseSecondaryButtonClass} disabled={!relationshipId} onClick={addRelationship}><Plus aria-hidden size={18} /></button></div> : null}
        <div className="flex gap-2"><input aria-label={t('expenseForm.guestName')} className={expenseInputClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} placeholder={t('expenseForm.guestName')} /><button type="button" className={expenseSecondaryButtonClass} disabled={!guestName.trim()} onClick={addGuest}><Plus aria-hidden size={18} /><span className="sr-only">{t('expenseForm.addGuest')}</span></button></div>
      </section>

      <button className={`${expensePrimaryButtonClass} w-full`} type="submit" disabled={isPending || !name.trim()}>{isPending ? t('groupForm.creating') : t('groupForm.create')}</button>
    </form>
  )
}
