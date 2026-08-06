'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { TeskeidStepNav, type TeskeidStepNavItem } from '@/components/teskeid/TeskeidStepNav'
import { createExpense, saveExpenseDraft, updateExpense } from '@/lib/expenses/actions'
import { calculateExpenseBalances, simplifySettlement } from '@/lib/expenses/balances'
import {
  EXPENSE_CURRENCIES,
  formatExpenseAmountInput,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
  normalizeExpenseAmountInput,
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
  parseExpenseWeight,
} from '@/lib/expenses/input-money'
import {
  splitByFixedAmounts,
  splitByPercentage,
  splitByWeights,
} from '@/lib/expenses/splits'
import type { ExpenseItemView, ExpenseParticipantOption, ExpenseRepaymentView } from '@/lib/expenses/contracts'
import type { ExpenseNewMemberInput } from '@/lib/expenses/validation'
import type { ExpenseSplitMethod } from '@/lib/expenses/types'
import type { ExpenseDraftPayload, ExpensePrivateDraftView } from '@/lib/expenses/drafts'
import type { RelationshipCircleOption } from '@/lib/relationships/types'
import {
  EXPENSE_FLOW_STEPS,
  type ExpenseFlowStep,
} from '@/lib/expenses/flow'
import { sumMinorAmounts } from '@/lib/expenses/money'
import { summarizeExpenseRepaymentsByPayer } from '@/lib/expenses/repayment-status'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { ExpenseRepaymentStatusLines } from './ExpenseRepaymentStatusLines'
import {
  ExpenseParticipantPicker,
  type ManualExpenseParticipant,
} from './ExpenseParticipantPicker'
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
  newGuest?: {
    id: string
    display_name: string
    recipient_email?: string
    relationship_id?: string
  }
  isSelf: boolean
  included?: boolean
}

interface AllocationDraft {
  member_key: string
  amount?: string
  percentage?: string
  weight?: string
}

interface ExpenseFormProps {
  mode: 'one_off' | 'group'
  groupId?: string
  defaultCurrency: string
  initialMembers: FormMember[]
  participantOptions?: ExpenseParticipantOption[]
  participantOptionsError?: boolean
  circleOptions?: RelationshipCircleOption[]
  initialDate: string
  initialStep?: ExpenseFlowStep
  reviewHref?: string
  draft?: ExpensePrivateDraftView | null
  draftBaseHref?: string
  edit?: {
    expense: ExpenseItemView
    expectedFinancialVersion: number
    groupStatus?: 'active' | 'settling' | 'settled' | 'closed'
    hasReportedRepayment?: boolean
    hasConfirmedRepayment?: boolean
    repayments?: ExpenseRepaymentView[]
  }
}

type ExpenseSplitUiMethod = Extract<ExpenseSplitMethod, 'fixed' | 'percentage' | 'weighted'>

const SPLIT_METHODS: ExpenseSplitUiMethod[] = ['fixed', 'percentage', 'weighted']

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
  const weights = expense
    ? expense.splitMethod === 'equal'
      ? Object.fromEntries(expense.shares.map((share) => [share.memberId, '1']))
      : weightValuesFromShares(expense.shares)
    : {}
  if (!expense) return { amounts, percentages, weights }

  for (const share of expense.shares) {
    amounts[share.memberId] = formatExpenseMinorForCopy(share.amountMinor, expense.currency)
  }

  return { amounts, percentages, weights }
}

function initialSplitMethod(expense?: ExpenseItemView): ExpenseSplitUiMethod {
  if (!expense) return 'weighted'
  if (expense.splitMethod === 'percentage' || expense.splitMethod === 'weighted') {
    return expense.splitMethod
  }
  return expense.splitMethod === 'equal' ? 'weighted' : 'fixed'
}

function initialPayerKeys(
  members: FormMember[],
  expense?: ExpenseItemView,
): string[] {
  const persisted = expense?.payments
    .map((payment) => payment.memberId)
    .filter((memberId, index, all) => (
      all.indexOf(memberId) === index
      && members.some((member) => member.key === memberId)
    )) ?? []
  if (persisted.length > 0) return persisted
  const fallback = members.find((member) => member.isSelf) ?? members[0]
  return fallback ? [fallback.key] : []
}

export function ExpenseForm({
  mode,
  groupId,
  defaultCurrency,
  initialMembers,
  participantOptions = [],
  participantOptionsError = false,
  circleOptions = [],
  initialDate,
  initialStep = 'details',
  draft = null,
  draftBaseHref = '',
  edit,
}: ExpenseFormProps) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const initialDraftPayload = draft?.payload
  const startingMembers = initialDraftPayload?.members ?? initialMembers
  const startingStep = draft?.currentStep ?? initialStep
  const [members, setMembers] = useState<FormMember[]>(startingMembers)
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>(
    initialDraftPayload?.removedMemberIds ?? [],
  )
  const [included, setIncluded] = useState<Record<string, boolean>>(
    initialDraftPayload?.included
      ?? Object.fromEntries(startingMembers.map((member) => [member.key, member.included !== false])),
  )
  const [title, setTitle] = useState(initialDraftPayload?.title ?? edit?.expense.title ?? '')
  const [total, setTotal] = useState(
    initialDraftPayload?.total
      ?? (edit ? formatExpenseMinorForCopy(edit.expense.totalMinor, edit.expense.currency) : ''),
  )
  const [currency, setCurrency] = useState(initialDraftPayload?.currency ?? edit?.expense.currency ?? defaultCurrency)
  const [incurredOn, setIncurredOn] = useState(initialDraftPayload?.incurredOn ?? edit?.expense.incurredOn ?? initialDate)
  const [category, setCategory] = useState(initialDraftPayload?.category ?? edit?.expense.category ?? '')
  const [note, setNote] = useState(initialDraftPayload?.note ?? edit?.expense.note ?? '')
  const [splitMethod, setSplitMethod] = useState<ExpenseSplitUiMethod>(
    initialDraftPayload?.splitMethod ?? initialSplitMethod(edit?.expense),
  )
  const [payments, setPayments] = useState<Record<string, string>>(
    initialDraftPayload?.payments ?? Object.fromEntries(startingMembers.map((member) => {
      const payment = edit?.expense.payments.find((row) => row.memberId === member.key)
      return [
        member.key,
        payment
          ? formatExpenseMinorForCopy(payment.amountMinor, edit?.expense.currency ?? defaultCurrency)
          : '',
      ]
    })),
  )
  const [payerKeys, setPayerKeys] = useState<string[]>(() => (
    initialDraftPayload?.payerKeys ?? initialPayerKeys(startingMembers, edit?.expense)
  ))
  const initialAllocations = initialAllocationValues(edit?.expense)
  const [amounts, setAmounts] = useState<Record<string, string>>(initialDraftPayload?.amounts ?? initialAllocations.amounts)
  const [percentages, setPercentages] = useState<Record<string, string>>(initialDraftPayload?.percentages ?? initialAllocations.percentages)
  const [weights, setWeights] = useState<Record<string, string>>(initialDraftPayload?.weights ?? initialAllocations.weights)
  const [preserveShares, setPreserveShares] = useState(initialDraftPayload?.preserveShares ?? Boolean(edit))
  const [circleId, setCircleId] = useState(initialDraftPayload?.circleId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<ExpenseFlowStep>(startingStep)
  const [highestVisitedStep, setHighestVisitedStep] = useState(edit ? EXPENSE_FLOW_STEPS.length - 1 : 0)
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const draftIdRef = useRef(draft?.id ?? createRequestId())
  const draftVersionRef = useRef<number | null>(draft?.version ?? null)
  const draftSavingRef = useRef(false)
  const [isPending, startTransition] = useTransition()
  const draftFingerprint = JSON.stringify({
    members,
    removedMemberIds,
    included,
    title,
    total,
    currency,
    incurredOn,
    category,
    note,
    splitMethod,
    payments,
    payerKeys,
    amounts,
    percentages,
    weights,
    preserveShares,
    circleId,
  })
  const initialDraftFingerprint = useRef(draftFingerprint)

  const selectedKeys = members.filter((member) => included[member.key]).map((member) => member.key)
  useEffect(() => {
    focusStepHeading(startingStep)
  }, [startingStep])

  function draftPayload(): ExpenseDraftPayload {
    return {
      circleId: circleId || null,
      members: members.map((member) => ({
        key: member.key,
        label: member.label,
        ...(member.input ? { input: member.input } : {}),
        ...(member.newGuest ? { newGuest: member.newGuest } : {}),
        isSelf: member.isSelf,
        ...(member.included === undefined ? {} : { included: member.included }),
      })),
      removedMemberIds,
      included,
      title,
      total,
      currency: currency as ExpenseDraftPayload['currency'],
      incurredOn,
      category,
      note,
      splitMethod,
      payments,
      payerKeys,
      amounts,
      percentages,
      weights,
      preserveShares,
    }
  }

  async function persistDraft(step: ExpenseFlowStep): Promise<boolean> {
    if (edit && (
      edit.groupStatus === 'settling'
      || edit.groupStatus === 'settled'
      || edit.hasReportedRepayment
      || edit.hasConfirmedRepayment
    )) {
      // SQL102 intentionally blocks private edit drafts once settlement starts.
      // SQL103 permits the audited edit itself, so keep step navigation local
      // and let the explicit Save action below persist the real change.
      initialDraftFingerprint.current = draftFingerprint
      setDraftStatus('idle')
      return true
    }
    if (draftSavingRef.current) return false
    draftSavingRef.current = true
    setDraftStatus('saving')
    const result = await saveExpenseDraft({
      draft_id: draftIdRef.current,
      expected_version: draftVersionRef.current,
      context_type: edit ? 'edit' : mode,
      group_id: groupId ?? null,
      expense_id: edit?.expense.id ?? null,
      current_step: step,
      payload: draftPayload(),
    })
    if (!result.ok) {
      draftSavingRef.current = false
      setDraftStatus('error')
      setError(t('errors.draftSaveFailed'))
      queueMicrotask(() => alertRef.current?.focus())
      return false
    }
    draftVersionRef.current = result.data.version
    draftSavingRef.current = false
    initialDraftFingerprint.current = draftFingerprint
    setDraftStatus('saved')
    if (draftBaseHref) {
      const separator = draftBaseHref.includes('?') ? '&' : '?'
      router.replace(`${draftBaseHref}${separator}draft=${draftIdRef.current}`)
    }
    return true
  }

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
    if (!edit && splitMethod === 'percentage') {
      setPercentages(equalPercentageValues([...selectedKeys, member.key]))
    }
  }

  function addKnownParticipant(option: ExpenseParticipantOption): boolean {
    const id = edit ? createRequestId() : `relationship:${option.relationshipId}`
    if (members.some((member) => (
      member.key === `relationship:${option.relationshipId}`
      || member.newGuest?.relationship_id === option.relationshipId
    ))) return false
    addMember({
      key: id,
      label: option.pickerLabel,
      input: edit ? undefined : {
        type: 'relationship',
        key: id,
        relationship_id: option.relationshipId,
      },
      newGuest: edit ? {
        id,
        display_name: option.sharedLabel,
        relationship_id: option.relationshipId,
      } : undefined,
      isSelf: false,
    })
    return true
  }

  function addManualParticipant(participant: ManualExpenseParticipant): boolean {
    const id = createRequestId()
    const key = edit ? id : `guest:${id}`
    const isEmail = participant.kind === 'email'
    const sharedLabel = isEmail
      ? t('expenseForm.invitedParticipant')
      : participant.displayName
    if (isEmail && members.some((member) => (
      member.input?.type === 'email'
        ? member.input.recipient_email === participant.recipientEmail
        : member.newGuest?.recipient_email === participant.recipientEmail
    ))) return false
    addMember({
      key,
      label: isEmail ? participant.recipientEmail : sharedLabel,
      input: edit ? undefined : isEmail
        ? {
          type: 'email',
          key,
          recipient_email: participant.recipientEmail,
          display_name: sharedLabel,
        }
        : { type: 'guest', key, display_name: sharedLabel },
      newGuest: edit ? {
        id,
        display_name: sharedLabel,
        ...(isEmail ? { recipient_email: participant.recipientEmail } : {}),
      } : undefined,
      isSelf: false,
    })
    return true
  }

  function selectCircle(nextCircleId: string) {
    if (edit || mode !== 'one_off') return
    const previousCircleKeys = new Set(members.flatMap((member) => (
      member.input?.type === 'circle_member' ? [member.key] : []
    )))
    const preservedMembers = members.filter((member) => !previousCircleKeys.has(member.key))
    const option = circleOptions.find((circle) => circle.id === nextCircleId)
    const additions: FormMember[] = option?.members.flatMap((member) => member.isSelf ? [] : [{
      key: `circle:${member.circleMemberId}`,
      label: member.displayName,
      input: {
        type: 'circle_member' as const,
        key: `circle:${member.circleMemberId}`,
        circle_id: option.id,
        circle_member_id: member.circleMemberId,
      },
      isSelf: false,
    }]) ?? []
    const nextMembers = [...preservedMembers, ...additions]
    const nextKeys = new Set(nextMembers.map((member) => member.key))
    setCircleId(nextCircleId)
    setMembers(nextMembers)
    setIncluded((current) => Object.fromEntries(nextMembers.map((member) => [member.key, current[member.key] ?? true])))
    setPayments((current) => Object.fromEntries(nextMembers.map((member) => [member.key, current[member.key] ?? ''])))
    setAmounts((current) => Object.fromEntries(nextMembers.map((member) => [member.key, current[member.key] ?? '0'])))
    setWeights((current) => Object.fromEntries(nextMembers.map((member) => [member.key, current[member.key] ?? '1'])))
    setPayerKeys((current) => {
      const kept = current.filter((key) => nextKeys.has(key))
      return kept.length > 0 ? kept : [nextMembers.find((member) => member.isSelf)?.key ?? nextMembers[0]!.key]
    })
    if (splitMethod === 'percentage') {
      setPercentages(equalPercentageValues(nextMembers.map((member) => member.key)))
    }
  }

  function removeMember(key: string) {
    const member = members.find((candidate) => candidate.key === key)
    if (!member || member.isSelf || mode === 'group') return
    const persistedPayment = edit?.expense.payments.find((payment) => payment.memberId === key)
    const hasRepayment = edit?.repayments?.some((repayment) => (
      repayment.fromMemberId === key || repayment.toMemberId === key
    )) ?? false
    if (edit && !member.newGuest && ((persistedPayment?.amountMinor ?? 0) > 0 || hasRepayment)) return
    if (edit && !member.newGuest) {
      if (!window.confirm(t('expenseForm.removeParticipantConfirm', { name: member.label }))) return
      setRemovedMemberIds((current) => current.includes(key) ? current : [...current, key])
      setSplitMethod('fixed')
      setAmounts((current) => ({
        ...current,
        ...Object.fromEntries(edit.expense.shares
          .filter((share) => share.memberId !== key)
          .map((share) => [
            share.memberId,
            formatExpenseMinorForCopy(share.amountMinor, edit.expense.currency),
          ])),
      }))
      setPreserveShares(false)
    }
    if (edit && included[key] !== false) setPreserveShares(false)
    const remainingMembers = members.filter((candidate) => candidate.key !== key)
    const nextPayerKeys = payerKeys.filter((payerKey) => payerKey !== key)
    const fallbackPayer = nextPayerKeys.length === 0
      ? (remainingMembers.find((candidate) => candidate.isSelf) ?? remainingMembers[0])
      : null
    const removedPayment = payments[key] ?? ''
    setMembers(remainingMembers)
    setPayerKeys(fallbackPayer ? [fallbackPayer.key] : nextPayerKeys)
    setPayments((current) => ({
      ...current,
      [key]: '',
      ...(fallbackPayer
        ? { [fallbackPayer.key]: current[fallbackPayer.key]?.trim() ? current[fallbackPayer.key] : removedPayment }
        : {}),
    }))
  }

  function changeTotal(value: string) {
    const solePayerKey = payerKeys.length === 1 ? payerKeys[0] : null
    setTotal(value)
    if (edit) setPreserveShares(false)
    if (solePayerKey && (!payments[solePayerKey] || payments[solePayerKey] === total)) {
      setPayments((current) => ({ ...current, [solePayerKey]: value }))
    }
  }

  function localizedAmount(value: string): string {
    return formatExpenseAmountInput(value, currency, locale)
  }

  function canonicalAmount(value: string): string | null {
    return normalizeExpenseAmountInput(value, currency, locale)
  }

  function changePayer(index: number, nextKey: string) {
    const previousKey = payerKeys[index]
    if (!previousKey || previousKey === nextKey || payerKeys.includes(nextKey)) return
    setPayerKeys((current) => current.map((key, payerIndex) => (
      payerIndex === index ? nextKey : key
    )))
    setPayments((current) => ({
      ...current,
      [previousKey]: '',
      [nextKey]: current[nextKey]?.trim() ? current[nextKey] : (current[previousKey] ?? ''),
    }))
  }

  function addPayer() {
    const nextPayer = members.find((member) => !payerKeys.includes(member.key))
    if (!nextPayer) return
    setPayerKeys((current) => [...current, nextPayer.key])
    setPayments((current) => ({ ...current, [nextPayer.key]: '' }))
  }

  function removePayer(key: string) {
    if (payerKeys.length <= 1) return
    setPayerKeys((current) => current.filter((payerKey) => payerKey !== key))
    setPayments((current) => ({ ...current, [key]: '' }))
  }

  function allocationPayload(): AllocationDraft[] {
    if (selectedKeys.length === 0) throw new Error('participant_required')
    if (splitMethod === 'percentage') return selectedKeys.map((member_key) => ({ member_key, percentage: percentages[member_key] ?? '' }))
    if (splitMethod === 'weighted') return selectedKeys.map((member_key) => ({ member_key, weight: weights[member_key] ?? '1' }))
    return selectedKeys.map((member_key) => ({ member_key, amount: amounts[member_key] ?? '' }))
  }

  const paymentState = (() => {
    try {
      const totalMinor = parseExpenseAmountToMinor(total, currency)
      const payerRows = payerKeys.flatMap((memberKey) => {
        const value = payments[memberKey]?.trim()
        return value ? [{
          key: memberKey,
          payerId: memberKey,
          amountMinor: parseExpenseAmountToMinor(value, currency),
          currency,
        }] : []
      })
      const paidMinor = sumMinorAmounts(payerRows.map((row) => row.amountMinor))
      return { totalMinor, paidMinor, payerRows }
    } catch {
      return null
    }
  })()

  const preview = (() => {
    try {
      if (!paymentState) return null
      const { totalMinor, paidMinor, payerRows } = paymentState
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
        : splitMethod === 'percentage'
          ? splitByPercentage(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, basisPoints: parseExpensePercentageToBasisPoints(row.percentage ?? '') })))
          : splitMethod === 'weighted'
            ? splitByWeights(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, weight: parseExpenseWeight(row.weight ?? '') })))
            : splitByFixedAmounts(totalMinor, currency, allocations.map((row) => ({ participantId: row.member_key, amountMinor: parseExpenseAmountToMinor(row.amount ?? '', currency, { allowZero: true }) })))
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
  const participantShareByMember = new Map(
    (preview?.shares.length
      ? preview.shares
      : edit?.expense.shares.map((share) => ({
        participantId: share.memberId,
        amountMinor: share.amountMinor,
        currency: edit.expense.currency,
      })) ?? [])
      .map((share) => [share.participantId, share] as const),
  )
  const fixedSplitRemainderMinor = (() => {
    if (preserveShares || splitMethod !== 'fixed' || !paymentState) return null
    try {
      const allocatedMinor = sumMinorAmounts(selectedKeys.map((key) => (
        parseExpenseAmountToMinor(amounts[key] ?? '', currency, { allowZero: true })
      )))
      return paymentState.totalMinor - allocatedMinor
    } catch {
      return null
    }
  })()
  const repaymentStatusByMember = summarizeExpenseRepaymentsByPayer(
    edit?.repayments ?? [],
    currency,
  )

  function chooseSplitMethod(method: ExpenseSplitUiMethod) {
    setSplitMethod(method)
    if (edit) setPreserveShares(false)
    if (method === 'percentage' && selectedKeys.some((key) => !percentages[key])) {
      setPercentages(equalPercentageValues(selectedKeys))
    }
    if (method === 'weighted') setWeights((current) => Object.fromEntries(selectedKeys.map((key) => [key, current[key] || '1'])))
  }

  function isDetailsValid() {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) return false
    try {
      parseExpenseAmountToMinor(total, currency)
      return true
    } catch {
      return false
    }
  }

  function isPeopleValid() {
    if (mode === 'one_off' && members.length < 2) return false
    return Boolean(paymentState && paymentState.paidMinor === paymentState.totalMinor)
  }

  function isSplitValid() {
    return Boolean(selectedKeys.length > 0 && preview && !preview.error)
  }

  function isStepValid(step: ExpenseFlowStep) {
    return step === 'details'
      ? isDetailsValid()
      : isPeopleValid() && isSplitValid()
  }

  function validationMessage(step: ExpenseFlowStep) {
    if (step === 'details') return t('errors.detailsRequired')
    if (mode === 'one_off' && members.length < 2) return t('errors.participant_required')
    if (!isPeopleValid()) return t('errors.paymentTotal')
    return t('errors.splitTotal')
  }

  function focusStepHeading(step: ExpenseFlowStep) {
    queueMicrotask(() => document.getElementById(`expense-${step}-heading`)?.focus())
  }

  async function openStep(step: ExpenseFlowStep) {
    const targetIndex = EXPENSE_FLOW_STEPS.indexOf(step)
    if (isPending || draftStatus === 'saving' || targetIndex > highestVisitedStep) return
    setError(null)
    if (!await persistDraft(step)) return
    setCurrentStep(step)
    focusStepHeading(step)
  }

  async function advanceStep() {
    const currentIndex = EXPENSE_FLOW_STEPS.indexOf(currentStep)
    if (!isStepValid(currentStep)) {
      setError(validationMessage(currentStep))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    const nextStep = EXPENSE_FLOW_STEPS[currentIndex + 1]
    if (!nextStep) return
    setError(null)
    if (!await persistDraft(nextStep)) return
    setHighestVisitedStep((current) => Math.max(current, currentIndex + 1))
    setCurrentStep(nextStep)
    focusStepHeading(nextStep)
  }

  function previousStep() {
    const previous = EXPENSE_FLOW_STEPS[EXPENSE_FLOW_STEPS.indexOf(currentStep) - 1]
    if (previous) openStep(previous)
  }

  const currentStepIndex = EXPENSE_FLOW_STEPS.indexOf(currentStep)
  const navigationBusy = isPending || draftStatus === 'saving'
  const stepItems: TeskeidStepNavItem<ExpenseFlowStep>[] = EXPENSE_FLOW_STEPS.map((step, index) => ({
    id: step,
    label: t(`expenseForm.steps.${step}`),
    status: currentStep === step
      ? 'current'
      : navigationBusy || index > highestVisitedStep
        ? 'disabled'
        : !isStepValid(step)
          ? 'attention'
          : index < currentStepIndex
            ? 'complete'
            : 'available',
    statusLabel: currentStep !== step && index <= highestVisitedStep && !isStepValid(step)
      ? t('expenseForm.stepNeedsReview')
      : undefined,
  }))

  function saveExpenseChanges() {
    setError(null)
    const invalidStep = EXPENSE_FLOW_STEPS.find((step) => !isStepValid(step))
    if (invalidStep) {
      setCurrentStep(invalidStep)
      setError(validationMessage(invalidStep))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
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
    const paymentRows = payerKeys.flatMap((memberKey) => {
      const amount = payments[memberKey]?.trim()
      return amount ? [{ member_key: memberKey, amount }] : []
    })
    const memberInputs = mode === 'one_off'
      ? members.map((member) => member.input).filter((input): input is ExpenseNewMemberInput => Boolean(input))
      : []

    const payload = {
      group_id: groupId ?? null,
      circle_id: mode === 'one_off' && !edit ? circleId || null : null,
      title,
      total,
      currency,
      incurred_on: incurredOn,
      category: category || null,
      note: note || null,
      split_method: splitMethod,
      draft_id: draftVersionRef.current ? draftIdRef.current : null,
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
      split_method: preserveShares ? edit.expense.splitMethod : splitMethod,
      draft_id: draftVersionRef.current ? draftIdRef.current : null,
      preserve_shares: preserveShares,
      new_members: members.flatMap((member) => (
        member.newGuest
          && (included[member.key] !== false || Boolean(payments[member.key]?.trim()))
          ? [member.newGuest]
          : []
      )),
      removed_member_ids: removedMemberIds,
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

  async function saveDraftOnly() {
    setError(null)
    if (!await persistDraft(currentStep)) return
    router.push('/auth-mvp/utlagt-og-endurgreitt')
    router.refresh()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (currentStepIndex < EXPENSE_FLOW_STEPS.length - 1) {
      void advanceStep()
      return
    }
    saveExpenseChanges()
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate aria-busy={navigationBusy}>
      <TeskeidStepNav
        ariaLabel={t('expenseForm.stepNavAriaLabel')}
        items={stepItems}
        onStepChange={openStep}
      />
      {draftStatus === 'saving' || draftStatus === 'saved' ? (
        <p role="status" className="text-center text-xs text-muted-foreground">
          {t(draftStatus === 'saving' ? 'expenseForm.draftSaving' : 'expenseForm.draftSaved')}
        </p>
      ) : null}
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {currentStep === 'details' ? (
      <section className="space-y-4 border-y border-border py-5" aria-labelledby="expense-details-heading">
        <h2 tabIndex={-1} id="expense-details-heading" className="text-sm font-semibold">{t('expenseForm.details')}</h2>
        <label><span className={expenseLabelClass}>{t('expenseForm.title')}</span><input className={expenseInputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t('expenseForm.titlePlaceholder')} /></label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <label><span className={expenseLabelClass}>{t('common.amount')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={localizedAmount(total)} onChange={(event) => { const next = canonicalAmount(event.target.value); if (next !== null) changeTotal(next) }} required /></label>
          <label><span className={expenseLabelClass}>{t('common.currency')}</span><select className={expenseInputClass} value={currency} onChange={(e) => { setCurrency(e.target.value); if (edit) setPreserveShares(false) }}>{EXPENSE_CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <TeskeidDateField label={t('common.date')} value={incurredOn} onChange={setIncurredOn} placeholder={t('common.datePlaceholder')} required />
        {/* Category is intentionally hidden in the UI for now. Keep the state
            and payload intact so existing values survive edits and the field
            can be restored without a data migration. */}
        <label><span className={expenseLabelClass}>{t('expenseForm.description')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><textarea className={expenseTextareaClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('expenseForm.descriptionPlaceholder')} /></label>
      </section>
      ) : null}

      {currentStep === 'split' ? <div className="space-y-8">
      <fieldset className="space-y-3 border-y border-border py-5">
        <legend className="text-sm font-semibold">{t(payerKeys.length > 1 ? 'expenseForm.paidByMultiple' : 'expenseForm.paidBy')}</legend>
        <p className="text-xs leading-5 text-muted-foreground">{t('expenseForm.paidHint')}</p>
        <div className="space-y-3">
          {payerKeys.map((memberKey, index) => {
            const member = members.find((candidate) => candidate.key === memberKey)
            if (!member) return null
            const canRemove = payerKeys.length > 1
            return (
              <div
                key={`${memberKey}:${index}`}
                className={`grid items-end gap-2 ${canRemove ? 'grid-cols-[minmax(0,1fr)_minmax(7rem,0.65fr)_2.75rem]' : 'grid-cols-[minmax(0,1fr)_minmax(7rem,0.65fr)]'}`}
              >
                <label className="min-w-0">
                  <span className={expenseLabelClass}>{t('expenseForm.payer', { number: index + 1 })}</span>
                  <select
                    className={expenseInputClass}
                    value={memberKey}
                    onChange={(event) => changePayer(index, event.target.value)}
                  >
                    {members
                      .filter((candidate) => candidate.key === memberKey || !payerKeys.includes(candidate.key))
                      .map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={expenseLabelClass}>{t('common.amount')}</span>
                  <input
                    aria-label={`${t('common.amount')} ${member.label}`}
                    className={expenseInputClass}
                    type="text"
                    inputMode="decimal"
                    value={localizedAmount(payments[memberKey] ?? '')}
                    onChange={(event) => { const next = canonicalAmount(event.target.value); if (next !== null) setPayments((current) => ({ ...current, [memberKey]: next })) }}
                  />
                </label>
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={t('expenseForm.removePayer', { name: member.label })}
                    className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    onClick={() => removePayer(memberKey)}
                  >
                    <X aria-hidden size={18} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        {payerKeys.length < members.length ? (
          <button type="button" className={`${expenseSecondaryButtonClass} w-full`} onClick={addPayer}>
            <Plus aria-hidden size={18} />
            {t('expenseForm.addPayer')}
          </button>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3 border-y border-border py-5">
        <legend id="expense-split-heading" tabIndex={-1} className="text-sm font-semibold">{t('expenseForm.participants')}</legend>
        {mode === 'one_off' ? <p className="text-xs leading-5 text-muted-foreground">{t('expenseForm.participantHint')}</p> : null}
        <div className="divide-y divide-border">
          {members.map((member) => {
            const share = included[member.key] !== false
              ? participantShareByMember.get(member.key)
              : undefined
            const purchasePayment = paymentState?.payerRows.find((payment) => payment.payerId === member.key)
            const repaymentStatus = repaymentStatusByMember.get(member.key)

            return (
              <div key={member.key} className="flex min-h-12 items-start gap-3 py-3">
                <label className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={included[member.key] !== false} onChange={(e) => { setIncluded((current) => ({ ...current, [member.key]: e.target.checked })); if (edit) setPreserveShares(false) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{member.label}{member.isSelf ? ` ${t('expenseForm.youSuffix')}` : ''}</span>
                    {share ? (
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {t('expenseForm.participantShare', {
                          amount: formatExpenseMinor(share.amountMinor, share.currency),
                        })}
                      </span>
                    ) : null}
                    {purchasePayment ? (
                      <span className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
                        <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0" />
                        <span>{t('expenseForm.paidAtPurchase', {
                          amount: formatExpenseMinor(purchasePayment.amountMinor, purchasePayment.currency),
                        })}</span>
                      </span>
                    ) : null}
                    {(repaymentStatus?.reportedAmountMinor ?? 0) > 0
                      || (repaymentStatus?.confirmedAmountMinor ?? 0) > 0 ? (
                        <span className="mt-1 block space-y-1">
                          <ExpenseRepaymentStatusLines status={repaymentStatus} />
                        </span>
                      ) : null}
                  </span>
                </label>
                {!member.isSelf && mode === 'one_off' && (
                  !edit
                  || member.newGuest
                  || (((edit.expense.payments.find((payment) => payment.memberId === member.key)?.amountMinor ?? 0) === 0)
                    && !(edit.repayments?.some((repayment) => repayment.fromMemberId === member.key || repayment.toMemberId === member.key)))
                ) ? <button type="button" aria-label={t('expenseForm.removeParticipant', { name: member.label })} className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={() => removeMember(member.key)}><X aria-hidden size={18} /></button> : null}
              </div>
            )
          })}
        </div>
        {mode === 'one_off' ? (
          <div className="space-y-3 pt-2">
            {participantOptionsError ? <p role="status" className="text-sm text-amber-800">{t('expenseForm.participantLoadError')}</p> : null}
            <ExpenseParticipantPicker
              options={participantOptions}
              optionsError={participantOptionsError}
              circles={!edit ? circleOptions : []}
              disabled={isPending}
              excludedRelationshipIds={members.flatMap((member) => {
                if (member.input?.type === 'relationship') return [member.input.relationship_id]
                return member.newGuest?.relationship_id ? [member.newGuest.relationship_id] : []
              })}
              onAddKnown={addKnownParticipant}
              onAddManual={addManualParticipant}
              onSelectCircle={!edit ? (circle) => {
                selectCircle(circle.id)
                return true
              } : undefined}
            />
          </div>
        ) : null}
      </fieldset>
      </div> : null}

      {currentStep === 'split' ? (
      <fieldset className="space-y-4 border-y border-border py-5">
        <legend className="text-sm font-semibold">{t('expenseForm.split')}</legend>
        {!isStepValid('split') ? (
          <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {fixedSplitRemainderMinor !== null && fixedSplitRemainderMinor !== 0
              ? t(fixedSplitRemainderMinor > 0 ? 'expenseForm.splitRemainder' : 'expenseForm.splitExcess', {
                amount: formatExpenseMinor(Math.abs(fixedSplitRemainderMinor), currency),
              })
              : t('expenseForm.splitNeedsAttention')}
          </p>
        ) : null}
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
        <p className="text-xs leading-5 text-muted-foreground">{t('splitMethods.simpleHint')}</p>
        <div className="grid grid-cols-3 gap-2">
          {SPLIT_METHODS.map((method) => <label key={method} className={`flex min-h-11 items-center justify-center rounded-xl border px-2 text-center text-sm ${splitMethod === method ? 'border-primary bg-primary/5' : 'border-border'}`}><input type="radio" name="split-method" className="sr-only" checked={splitMethod === method} onChange={() => chooseSplitMethod(method)} /><span>{t(`splitMethods.${method}`)}</span></label>)}
        </div>
        {!preserveShares ? <div className="space-y-3 border-t border-border pt-4">
          {splitMethod === 'weighted' ? <div className="flex items-center justify-between gap-3"><p className="text-xs leading-5 text-muted-foreground">{t('splitMethods.weightHint')}</p><button type="button" className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setWeights(Object.fromEntries(selectedKeys.map((key) => [key, '1'])))}>{t('splitMethods.resetEqual')}</button></div> : null}
          {members.filter((member) => included[member.key]).map((member) => <div key={member.key} className="space-y-2"><p className="text-sm font-medium">{member.label}</p><div className="grid gap-2 sm:grid-cols-2">
          {splitMethod === 'fixed' ? <label><span className={expenseLabelClass}>{t('splitMethods.fixedLabel')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={localizedAmount(amounts[member.key] ?? '')} onChange={(event) => { const next = canonicalAmount(event.target.value); if (next !== null) { setAmounts((current) => ({ ...current, [member.key]: next })); if (edit) setPreserveShares(false) } }} /></label> : null}
          {splitMethod === 'percentage' ? <label><span className={expenseLabelClass}>{t('splitMethods.percentageLabel')}</span><input className={expenseInputClass} type="text" inputMode="decimal" value={percentages[member.key] ?? ''} onChange={(e) => { setPercentages((current) => ({ ...current, [member.key]: e.target.value })); if (edit) setPreserveShares(false) }} /></label> : null}
          {splitMethod === 'weighted' ? <label><span className={expenseLabelClass}>{t('splitMethods.weightLabel')}</span><input className={expenseInputClass} type="text" inputMode="numeric" value={weights[member.key] ?? '1'} onChange={(e) => { setWeights((current) => ({ ...current, [member.key]: e.target.value })); if (edit) setPreserveShares(false) }} /></label> : null}
        </div></div>)}</div> : null}
      </fieldset>
      ) : null}

      <div className={`grid gap-3 ${currentStepIndex > 0 || (edit && currentStep === 'details') ? 'grid-cols-2' : ''}`}>
        {currentStepIndex > 0 ? (
          <button type="button" className={`${expenseSecondaryButtonClass} w-full`} disabled={navigationBusy} onClick={previousStep}>
            {t('expenseForm.previousStep')}
          </button>
        ) : null}
        {edit && currentStep === 'details' ? (
          <button type="button" className={`${expenseSecondaryButtonClass} w-full`} disabled={navigationBusy} onClick={saveExpenseChanges}>
            {isPending ? t('expenseForm.updating') : t('expenseForm.saveNow')}
          </button>
        ) : null}
        {currentStepIndex === EXPENSE_FLOW_STEPS.length - 1 ? (
          isStepValid(currentStep) ? (
            <button type="submit" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy}>
              {isPending
                ? t(edit ? 'expenseForm.updating' : 'expenseForm.creating')
                : t(edit ? 'expenseForm.update' : 'expenseForm.create')}
            </button>
          ) : (
            <button type="button" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy || !isDetailsValid()} onClick={() => void saveDraftOnly()}>
              {draftStatus === 'saving' ? t('expenseForm.draftSaving') : t('expenseForm.saveDraftOnly')}
            </button>
          )
        ) : (
          <button type="button" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy} onClick={() => void advanceStep()}>
            {t(`expenseForm.nextSteps.${EXPENSE_FLOW_STEPS[currentStepIndex + 1]}`)}
          </button>
        )}
      </div>
    </form>
  )
}
