'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { createExpense, updateExpense } from '@/lib/expenses/actions'
import { calculateExpenseBalances, simplifySettlement } from '@/lib/expenses/balances'
import {
  EXPENSE_CURRENCIES,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
  parseExpenseWeight,
} from '@/lib/expenses/input-money'
import {
  splitByFixedAmounts,
  splitByPercentage,
  splitByWeights,
  splitEqual,
  splitMixedEqualRemainder,
  splitMixedPercentageRemainder,
} from '@/lib/expenses/splits'
import type { ExpenseItemView, ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { ExpenseNewMemberInput } from '@/lib/expenses/validation'
import type { ExpenseSplitMethod } from '@/lib/expenses/types'
import { sumMinorAmounts } from '@/lib/expenses/money'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  createRequestId,
  expenseInputClass,
  expenseLabelClass,
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
  expenseTextareaClass,
} from './ui'

interface FormMember {
  key: string
  label: string
  input?: ExpenseNewMemberInput
  newGuest?: { id: string; display_name: string }
  isSelf: boolean
  included?: boolean
}

interface AllocationDraft {
  member_key: string
  amount?: string
  percentage?: string
  weight?: string
  participates_in_remainder?: boolean
}

interface ExpenseFormProps {
  mode: 'one_off' | 'group'
  groupId?: string
  defaultCurrency: string
  initialMembers: FormMember[]
  participantOptions?: ExpenseParticipantOption[]
  participantOptionsError?: boolean
  initialDate: string
  edit?: {
    expense: ExpenseItemView
    expectedFinancialVersion: number
  }
}

const SPLIT_METHODS: ExpenseSplitMethod[] = [
  'equal',
  'percentage',
  'weighted',
  'fixed',
  'mixed_equal_remainder',
  'mixed_percentage_remainder',
]

function equalPercentageValues(keys: string[]): Record<string, string> {
  if (keys.length === 0) return {}
  const total = 10_000
  const base = Math.floor(total / keys.length)
  let remainder = total - base * keys.length
  const result: Record<string, string> = {}
  for (const key of [...keys].sort()) {
    const basisPoints = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
    result[key] = (basisPoints / 100).toFixed(2).replace(/\.00$/, '')
  }
  return result
}

function percentageValuesFromShares(
  shares: ExpenseItemView['shares'],
  totalMinor: number,
): Record<string, string> {
  if (shares.length === 0 || totalMinor <= 0) return {}
  const rows = shares.map((share) => {
    const exactBasisPoints = (share.amountMinor / totalMinor) * 10_000
    return {
      key: share.memberId,
      basisPoints: Math.floor(exactBasisPoints),
      remainder: exactBasisPoints - Math.floor(exactBasisPoints),
    }
  })
  const remaining = 10_000 - rows.reduce((sum, row) => sum + row.basisPoints, 0)
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder === right.remainder) return left.key.localeCompare(right.key)
    return right.remainder - left.remainder
  })
  for (let index = 0; index < remaining; index += 1) {
    ranked[index % ranked.length]!.basisPoints += 1
  }
  return Object.fromEntries(rows.map((row) => [
    row.key,
    (row.basisPoints / 100).toFixed(2).replace(/\.00$/, ''),
  ]))
}

function weightValuesFromShares(shares: ExpenseItemView['shares']): Record<string, string> {
  const largest = Math.max(1, ...shares.map((share) => share.amountMinor))
  const divisor = Math.max(1, Math.ceil(largest / 1_000_000))
  return Object.fromEntries(shares.map((share) => [
    share.memberId,
    String(share.amountMinor === 0 ? 0 : Math.max(1, Math.round(share.amountMinor / divisor))),
  ]))
}

function initialAllocationValues(expense?: ExpenseItemView) {
  const amounts: Record<string, string> = {}
  const percentages = expense
    ? percentageValuesFromShares(expense.shares, expense.totalMinor)
    : {}
  const weights = expense ? weightValuesFromShares(expense.shares) : {}
  const remainderParticipation: Record<string, boolean> = {}
  if (!expense) return { amounts, percentages, weights, remainderParticipation }

  for (const share of expense.shares) {
    amounts[share.memberId] = formatExpenseMinorForCopy(share.amountMinor, expense.currency)
  }

  if (expense.splitMethod === 'mixed_equal_remainder') {
    for (const share of expense.shares) {
      const participates = share.amountMinor > 0
      remainderParticipation[share.memberId] = participates
      amounts[share.memberId] = formatExpenseMinorForCopy(
        participates ? share.amountMinor - 1 : share.amountMinor,
        expense.currency,
      )
    }
  }

  if (expense.splitMethod === 'mixed_percentage_remainder') {
    const remainderMember = [...expense.shares]
      .filter((share) => share.amountMinor > 0)
      .sort((left, right) => left.memberId.localeCompare(right.memberId))[0]
    for (const share of expense.shares) {
      const receivesRemainder = share.memberId === remainderMember?.memberId
      amounts[share.memberId] = formatExpenseMinorForCopy(
        receivesRemainder ? share.amountMinor - 1 : share.amountMinor,
        expense.currency,
      )
      percentages[share.memberId] = receivesRemainder ? '100' : '0'
    }
  }

  return { amounts, percentages, weights, remainderParticipation }
}

export function ExpenseForm({
  mode,
  groupId,
  defaultCurrency,
  initialMembers,
  participantOptions = [],
  participantOptionsError = false,
  initialDate,
  edit,
}: ExpenseFormProps) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [members, setMembers] = useState<FormMember[]>(initialMembers)
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(initialMembers.map((member) => [member.key, member.included !== false])),
  )
  const [title, setTitle] = useState(edit?.expense.title ?? '')
  const [total, setTotal] = useState(
    edit ? formatExpenseMinorForCopy(edit.expense.totalMinor, edit.expense.currency) : '',
  )
  const [currency, setCurrency] = useState(edit?.expense.currency ?? defaultCurrency)
  const [incurredOn, setIncurredOn] = useState(edit?.expense.incurredOn ?? initialDate)
  const [category, setCategory] = useState(edit?.expense.category ?? '')
  const [note, setNote] = useState(edit?.expense.note ?? '')
  const [splitMethod, setSplitMethod] = useState<ExpenseSplitMethod>(edit?.expense.splitMethod ?? 'equal')
  const [payments, setPayments] = useState<Record<string, string>>(
    Object.fromEntries(initialMembers.map((member) => {
      const payment = edit?.expense.payments.find((row) => row.memberId === member.key)
      return [
        member.key,
        payment
          ? formatExpenseMinorForCopy(payment.amountMinor, edit?.expense.currency ?? defaultCurrency)
          : '',
      ]
    })),
  )
  const initialAllocations = initialAllocationValues(edit?.expense)
  const [amounts, setAmounts] = useState<Record<string, string>>(initialAllocations.amounts)
  const [percentages, setPercentages] = useState<Record<string, string>>(initialAllocations.percentages)
  const [weights, setWeights] = useState<Record<string, string>>(initialAllocations.weights)
  const [remainderParticipation, setRemainderParticipation] = useState<Record<string, boolean>>(initialAllocations.remainderParticipation)
  const [preserveShares, setPreserveShares] = useState(Boolean(edit))
  const [relationshipId, setRelationshipId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedKeys = members.filter((member) => included[member.key]).map((member) => member.key)
  const memberName = (key: string) => members.find((member) => member.key === key)?.label ?? key

  function addMember(member: FormMember) {
    if (members.some((candidate) => candidate.key === member.key)) return
    setMembers((current) => [...current, member])
    // During an edit, a newly named guest starts as payment-only. Merely adding
    // a payer must not reconstruct the authoritative persisted shares. The
    // user can explicitly include the guest below, which then unlocks editing
    // the allocation and flips preserveShares off.
    setIncluded((current) => ({ ...current, [member.key]: !edit }))
    setPayments((current) => ({ ...current, [member.key]: '' }))
    setWeights((current) => ({ ...current, [member.key]: '1' }))
    setAmounts((current) => ({ ...current, [member.key]: '0' }))
    setRemainderParticipation((current) => ({ ...current, [member.key]: true }))
    if (!edit && (splitMethod === 'percentage' || splitMethod === 'mixed_percentage_remainder')) {
      setPercentages(equalPercentageValues([...selectedKeys, member.key]))
    }
  }

  function addRelationship() {
    if (edit) return
    const option = participantOptions.find((candidate) => candidate.relationshipId === relationshipId)
    if (!option) return
    addMember({
      key: `relationship:${option.relationshipId}`,
      label: option.pickerLabel,
      input: { type: 'relationship', key: `relationship:${option.relationshipId}`, relationship_id: option.relationshipId },
      isSelf: false,
    })
    setRelationshipId('')
  }

  function addGuest() {
    const label = guestName.trim()
    if (!label) return
    const id = createRequestId()
    const key = edit ? id : `guest:${id}`
    addMember({
      key,
      label,
      input: edit ? undefined : { type: 'guest', key, display_name: label },
      newGuest: edit ? { id, display_name: label } : undefined,
      isSelf: false,
    })
    setGuestName('')
  }

  function removeMember(key: string) {
    const member = members.find((candidate) => candidate.key === key)
    if (!member || member.isSelf || mode === 'group' || (edit && !member.newGuest)) return
    if (edit && included[key] !== false) setPreserveShares(false)
    setMembers((current) => current.filter((candidate) => candidate.key !== key))
  }

  function changeTotal(value: string) {
    const self = members.find((member) => member.isSelf)
    const nonEmptyPayers = Object.values(payments).filter((amount) => amount.trim() !== '')
    setTotal(value)
    if (edit) setPreserveShares(false)
    if (self && nonEmptyPayers.length <= 1 && (!payments[self.key] || payments[self.key] === total)) {
      setPayments((current) => ({ ...current, [self.key]: value }))
    }
  }

  function allocationPayload(): AllocationDraft[] {
    if (selectedKeys.length === 0) throw new Error('participant_required')
    if (splitMethod === 'equal') return selectedKeys.map((member_key) => ({ member_key }))
    if (splitMethod === 'percentage') return selectedKeys.map((member_key) => ({ member_key, percentage: percentages[member_key] ?? '' }))
    if (splitMethod === 'weighted') return selectedKeys.map((member_key) => ({ member_key, weight: weights[member_key] ?? '1' }))
    if (splitMethod === 'fixed') return selectedKeys.map((member_key) => ({ member_key, amount: amounts[member_key] ?? '' }))
    if (splitMethod === 'mixed_equal_remainder') return selectedKeys.map((member_key) => ({
      member_key,
      amount: amounts[member_key] ?? '0',
      participates_in_remainder: remainderParticipation[member_key] !== false,
    }))
    return selectedKeys.map((member_key) => ({
      member_key,
      amount: amounts[member_key] ?? '0',
      percentage: percentages[member_key] ?? '',
    }))
  }

  const preview = (() => {
    try {
      const totalMinor = parseExpenseAmountToMinor(total, currency)
      const payerRows = members.flatMap((member) => {
        const value = payments[member.key]?.trim()
        return value ? [{
          key: member.key,
          payerId: member.key,
          amountMinor: parseExpenseAmountToMinor(value, currency),
          currency,
        }] : []
      })
      const paidMinor = sumMinorAmounts(payerRows.map((row) => row.amountMinor))
      if (paidMinor !== totalMinor) return {
        error: 'payment',
        totalMinor,
        paidMinor,
        payerRows,
        shares: [] as Array<{ participantId: string; amountMinor: number; currency: string }>,
        balances: [],
        settlement: [],
      }

      const allocations = preserveShares ? [] : allocationPayload()
      const shares = preserveShares && edit
        ? edit.expense.shares.map((share) => ({
          participantId: share.memberId,
          amountMinor: share.amountMinor,
          currency: edit.expense.currency,
        }))
        : splitMethod === 'equal'
        ? splitEqual(totalMinor, currency, allocations.map((row) => row.member_key))
        : splitMethod === 'percentage'
          ? splitByPercentage(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, basisPoints: parseExpensePercentageToBasisPoints(row.percentage ?? '') })))
          : splitMethod === 'weighted'
            ? splitByWeights(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, weight: parseExpenseWeight(row.weight ?? '') })))
            : splitMethod === 'fixed'
              ? splitByFixedAmounts(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, amountMinor: parseExpenseAmountToMinor(row.amount ?? '', currency, { allowZero: true }) })))
              : splitMethod === 'mixed_equal_remainder'
                ? splitMixedEqualRemainder(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, fixedMinor: parseExpenseAmountToMinor(row.amount ?? '0', currency, { allowZero: true }), participatesInRemainder: row.participates_in_remainder === true })))
                : splitMixedPercentageRemainder(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, fixedMinor: parseExpenseAmountToMinor(row.amount ?? '0', currency, { allowZero: true }), remainderBasisPoints: parseExpensePercentageToBasisPoints(row.percentage ?? '') })))
      const balances = calculateExpenseBalances({
        expenseId: 'expense-preview',
        totalMinor,
        currency,
        payments: payerRows,
        shares,
      })
      const settlement = simplifySettlement(balances)
      return { error: null, totalMinor, paidMinor, payerRows, shares, balances, settlement }
    } catch {
      return null
    }
  })()

  function chooseSplitMethod(method: ExpenseSplitMethod) {
    setSplitMethod(method)
    if (edit) setPreserveShares(false)
    if ((method === 'percentage' || method === 'mixed_percentage_remainder') && selectedKeys.some((key) => !percentages[key])) {
      setPercentages(equalPercentageValues(selectedKeys))
    }
    if (method === 'weighted') setWeights((current) => Object.fromEntries(selectedKeys.map((key) => [key, current[key] || '1'])))
    if (method === 'mixed_equal_remainder' && method !== splitMethod) {
      setAmounts(Object.fromEntries(selectedKeys.map((key) => [key, '0'])))
      setRemainderParticipation(Object.fromEntries(selectedKeys.map((key) => [key, true])))
    }
    if (method === 'mixed_percentage_remainder' && method !== splitMethod) {
      setAmounts(Object.fromEntries(selectedKeys.map((key) => [key, '0'])))
      setPercentages(equalPercentageValues(selectedKeys))
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (mode === 'one_off' && members.length < 2) {
      setError(t('errors.participant_required'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    if (!preview || preview.error) {
      setError(t(preview?.error === 'payment' ? 'errors.paymentTotal' : 'errors.splitTotal'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    const paymentRows = members.flatMap((member) => {
      const amount = payments[member.key]?.trim()
      return amount ? [{ member_key: member.key, amount }] : []
    })
    const memberInputs = mode === 'one_off'
      ? members.map((member) => member.input).filter((input): input is ExpenseNewMemberInput => Boolean(input))
      : []

    const payload = {
      group_id: groupId ?? null,
      title,
      total,
      currency,
      incurred_on: incurredOn,
      category: category || null,
      note: note || null,
      split_method: splitMethod,
      members: memberInputs,
      payments: paymentRows,
      allocations: edit ? [] : allocationPayload(),
    }
    const editPayload = edit ? {
      expense_id: edit.expense.id,
      expected_financial_version: edit.expectedFinancialVersion,
      title,
      total,
      currency,
      incurred_on: incurredOn,
      category: category || null,
      note: note || null,
      split_method: splitMethod,
      preserve_shares: preserveShares,
      new_members: members.flatMap((member) => (
        member.newGuest
          && (included[member.key] !== false || Boolean(payments[member.key]?.trim()))
          ? [member.newGuest]
          : []
      )),
      payments: paymentRows,
      allocations: preserveShares ? [] : allocationPayload(),
    } : null
    const requestPayload = editPayload ?? payload
    startTransition(async () => {
      const result = edit
        ? await updateExpense({
          ...editPayload!,
          request_id: requestIds.forPayload(requestPayload),
        })
        : await createExpense({
          ...payload,
          request_id: requestIds.forPayload(requestPayload),
        })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(requestPayload)
      router.push(`/auth-mvp/utlagt-og-endurgreitt/utgjold/${result.data.expenseId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate aria-busy={isPending}>
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <section className="space-y-4 border-y border-border py-5" aria-labelledby="expense-details-heading">
        <h2 id="expense-details-heading" className="text-sm font-semibold">{t('expenseForm.details')}</h2>
        <label><span className={expenseLabelClass}>{t('expenseForm.title')}</span><input className={expenseInputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t('expenseForm.titlePlaceholder')} /></label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <label><span className={expenseLabelClass}>{t('common.amount')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={total} onChange={(e) => changeTotal(e.target.value)} required /></label>
          <label><span className={expenseLabelClass}>{t('common.currency')}</span><select className={expenseInputClass} value={currency} onChange={(e) => { setCurrency(e.target.value); if (edit) setPreserveShares(false) }}>{EXPENSE_CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <TeskeidDateField label={t('common.date')} value={incurredOn} onChange={setIncurredOn} placeholder={t('common.datePlaceholder')} required />
        <label><span className={expenseLabelClass}>{t('expenseForm.category')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><select className={expenseInputClass} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">—</option>{['food','accommodation','transport','travel','home','entertainment','gifts','shopping','other'].map((item) => <option key={item} value={item}>{t(`categories.${item}`)}</option>)}</select></label>
        <label><span className={expenseLabelClass}>{t('common.note')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><textarea className={expenseTextareaClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
      </section>

      <fieldset className="space-y-3 border-y border-border py-5">
        <legend className="text-sm font-semibold">{t('expenseForm.participants')}</legend>
        {mode === 'one_off' ? <p className="text-xs leading-5 text-muted-foreground">{t('expenseForm.participantHint')}</p> : null}
        <div className="divide-y divide-border">
          {members.map((member) => (
            <div key={member.key} className="flex min-h-12 items-center gap-3 py-2">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={included[member.key] !== false} onChange={(e) => { setIncluded((current) => ({ ...current, [member.key]: e.target.checked })); if (edit) setPreserveShares(false) }} /><span className="truncate">{member.label}</span></label>
              {!member.isSelf && mode === 'one_off' && (!edit || member.newGuest) ? <button type="button" aria-label={t('expenseForm.removeParticipant', { name: member.label })} className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={() => removeMember(member.key)}><X aria-hidden size={18} /></button> : null}
            </div>
          ))}
        </div>
        {mode === 'one_off' ? (
          <div className="space-y-3 pt-2">
            {participantOptionsError ? <p role="status" className="text-sm text-amber-800">{t('expenseForm.participantLoadError')}</p> : null}
            {!edit && participantOptions.length > 0 ? <div className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">{t('expenseForm.knownPeople')}</span><select className={expenseInputClass} value={relationshipId} onChange={(e) => setRelationshipId(e.target.value)}><option value="">{t('expenseForm.knownPeople')}</option>{participantOptions.filter((option) => !members.some((member) => member.key === `relationship:${option.relationshipId}`)).map((option) => <option key={option.relationshipId} value={option.relationshipId}>{option.pickerLabel}</option>)}</select></label><button type="button" className={expenseSecondaryButtonClass} disabled={!relationshipId} onClick={addRelationship}><Plus aria-hidden size={18} /></button></div> : null}
            <div className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">{t('expenseForm.guestName')}</span><input className={expenseInputClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t('expenseForm.guestName')} maxLength={120} /></label><button type="button" className={expenseSecondaryButtonClass} disabled={!guestName.trim()} onClick={addGuest}><Plus aria-hidden size={18} /><span className="sr-only">{t('expenseForm.addGuest')}</span></button></div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3 border-y border-border py-5">
        <legend className="text-sm font-semibold">{t('expenseForm.paidBy')}</legend>
        <p className="text-xs text-muted-foreground">{t('expenseForm.paidHint')}</p>
        {members.map((member) => <label key={member.key} className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3"><span className="truncate text-sm">{member.label}</span><input aria-label={`${t('common.amount')} ${member.label}`} className={expenseInputClass} type="text" inputMode="decimal" value={payments[member.key] ?? ''} onChange={(e) => setPayments((current) => ({ ...current, [member.key]: e.target.value }))} /></label>)}
      </fieldset>

      <fieldset className="space-y-4 border-y border-border py-5">
        <legend className="text-sm font-semibold">{t('expenseForm.split')}</legend>
        {edit && preserveShares ? (
          <div className="space-y-3">
            <p role="status" className="text-xs leading-5 text-muted-foreground">
              {t('expenseForm.preserveSharesHint')}
            </p>
            <button
              type="button"
              className={expenseSecondaryButtonClass}
              onClick={() => setPreserveShares(false)}
            >
              {t('expenseForm.changeShares')}
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {SPLIT_METHODS.map((method) => <label key={method} className={`flex min-h-11 items-center rounded-xl border px-3 text-sm ${splitMethod === method ? 'border-primary bg-primary/5' : 'border-border'}`}><input type="radio" name="split-method" className="mr-2" checked={splitMethod === method} onChange={() => chooseSplitMethod(method)} /><span>{t(`splitMethods.${method === 'mixed_equal_remainder' ? 'mixedEqual' : method === 'mixed_percentage_remainder' ? 'mixedPercentage' : method}`)}</span></label>)}
        </div>
        {!preserveShares && splitMethod !== 'equal' ? <div className="space-y-3 border-t border-border pt-4">{members.filter((member) => included[member.key]).map((member) => <div key={member.key} className="space-y-2"><p className="text-sm font-medium">{member.label}</p><div className="grid gap-2 sm:grid-cols-2">
          {(splitMethod === 'fixed' || splitMethod.startsWith('mixed_')) ? <label><span className={expenseLabelClass}>{t('splitMethods.fixedLabel')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={amounts[member.key] ?? ''} onChange={(e) => { setAmounts((current) => ({ ...current, [member.key]: e.target.value })); if (edit) setPreserveShares(false) }} /></label> : null}
          {(splitMethod === 'percentage' || splitMethod === 'mixed_percentage_remainder') ? <label><span className={expenseLabelClass}>{t(splitMethod === 'percentage' ? 'splitMethods.percentageLabel' : 'splitMethods.remainderPercentage')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={percentages[member.key] ?? ''} onChange={(e) => { setPercentages((current) => ({ ...current, [member.key]: e.target.value })); if (edit) setPreserveShares(false) }} /></label> : null}
          {splitMethod === 'weighted' ? <label><span className={expenseLabelClass}>{t('splitMethods.weightLabel')}</span><input className={expenseInputClass} type="text" inputMode="numeric" value={weights[member.key] ?? '1'} onChange={(e) => { setWeights((current) => ({ ...current, [member.key]: e.target.value })); if (edit) setPreserveShares(false) }} /></label> : null}
          {splitMethod === 'mixed_equal_remainder' ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={remainderParticipation[member.key] !== false} onChange={(e) => { setRemainderParticipation((current) => ({ ...current, [member.key]: e.target.checked })); if (edit) setPreserveShares(false) }} />{t('splitMethods.inRemainder')}</label> : null}
        </div></div>)}</div> : null}
      </fieldset>

      <section className="space-y-3 border-y border-border py-5" aria-labelledby="expense-preview-heading">
        <h2 id="expense-preview-heading" className="text-sm font-semibold">{t('expenseForm.preview')}</h2>
        <p className="text-xs text-muted-foreground">{t('expenseForm.previewHint')}</p>
        {preview ? <div className="space-y-5 text-sm">
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenseForm.previewPaidBy')}</h3><div className="divide-y divide-border">{preview.payerRows.map((payer) => <div key={payer.key} className="flex justify-between gap-4 py-2"><span className="truncate">{memberName(payer.key)}</span><strong className="shrink-0">{formatExpenseMinor(payer.amountMinor, currency)}</strong></div>)}<div className="flex justify-between gap-4 py-2"><span>{t('expenseForm.totalPaid')}</span><strong>{formatExpenseMinor(preview.paidMinor, currency)}</strong></div></div></div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenseForm.previewShares')}</h3><div className="divide-y divide-border">{preview.shares.map((share) => <div key={share.participantId} className="flex justify-between gap-4 py-2"><span className="truncate">{memberName(share.participantId)}</span><strong className="shrink-0">{formatExpenseMinor(share.amountMinor, currency)}</strong></div>)}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('expenseForm.roundingHint')}</p></div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenseForm.previewNet')}</h3><div className="divide-y divide-border">{preview.balances.map((balance) => <div key={balance.partyId} className="flex justify-between gap-4 py-2"><span className="truncate">{t(balance.amountMinor > 0 ? 'expenseForm.previewIsOwed' : balance.amountMinor < 0 ? 'expenseForm.previewOwesBalance' : 'expenseForm.previewEven', { name: memberName(balance.partyId) })}</span><strong className={balance.amountMinor < 0 ? 'shrink-0 text-destructive' : 'shrink-0 text-primary'}>{formatExpenseMinor(Math.abs(balance.amountMinor), currency)}</strong></div>)}</div></div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('expenseForm.previewSettlement')}</h3>{preview.settlement.length > 0 ? <div className="divide-y divide-border">{preview.settlement.map((transfer) => <div key={`${transfer.fromPartyId}:${transfer.toPartyId}`} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"><span>{t('expenseForm.previewOwes', { from: memberName(transfer.fromPartyId), to: memberName(transfer.toPartyId) })}</span><strong className="shrink-0">{formatExpenseMinor(transfer.amountMinor, currency)}</strong></div>)}</div> : <p className="py-2 text-muted-foreground">{t('expenseForm.previewSettled')}</p>}<p className="mt-1 text-xs leading-5 text-muted-foreground">{t('expenseForm.previewPaymentDetails')}</p></div>
        </div> : <p className="text-sm text-muted-foreground">{t('errors.invalid_input')}</p>}
      </section>

      <button type="submit" className={`${expensePrimaryButtonClass} w-full`} disabled={isPending}>
        {isPending
          ? t(edit ? 'expenseForm.updating' : 'expenseForm.creating')
          : t(edit ? 'expenseForm.update' : 'expenseForm.create')}
      </button>
    </form>
  )
}
