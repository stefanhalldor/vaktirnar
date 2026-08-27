'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { TeskeidStepNav, type TeskeidStepNavItem } from '@/components/teskeid/TeskeidStepNav'
import {
  finalizeExpenseDraft,
  refreshExpenseDraftPublicationLifecycle,
  saveExpenseDraft,
  shareExpenseDraft,
  unshareExpenseDraft,
  updateExpense,
} from '@/lib/expenses/actions'
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
import type { EventExpenseVisibility, ExpenseNewMemberInput } from '@/lib/expenses/validation'
import type { ExpenseSplitMethod } from '@/lib/expenses/types'
import {
  redactExpenseDraftEventGuestLabels,
  type ExpenseDraftPayload,
  type ExpensePrivateDraftView,
} from '@/lib/expenses/drafts'
import type { RelationshipCircleOption } from '@/lib/relationships/types'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { LegacyExpenseEventSourceV2 } from '@/lib/events/legacy-expense-event-source-v2.contracts'
import type { ExpenseDraftPublicationLifecycleView } from '@/lib/expenses/unconfirmed-publication'
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
  publicationLifecycle?: ExpenseDraftPublicationLifecycleView | null
  draftBaseHref?: string
  /** Present only when both Events and Expenses gates are authorized. */
  eventSources?: EventExpenseSourceView[]
  eventSourcePresentation?: LegacyExpenseEventSourceV2[]
  eventSourcesError?: boolean
  initialEventSource?: EventExpenseSourceView | null
  eventSelectionWarning?: boolean
  /** Event rosters are candidates only; guests start unchecked and shares stay explicit. */
  eventContext?: boolean
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
type ReadyExpenseDraftPublicationLifecycle = Extract<
  ExpenseDraftPublicationLifecycleView,
  { status: 'ready' }
>

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
  publicationLifecycle = null,
  draftBaseHref = '',
  eventSources,
  eventSourcePresentation,
  eventSourcesError = false,
  initialEventSource = null,
  eventSelectionWarning = false,
  eventContext = false,
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
  const [eventId, setEventId] = useState(
    initialDraftPayload ? initialDraftPayload.eventId ?? '' : initialEventSource?.id ?? '',
  )
  const [eventRosterRevision, setEventRosterRevision] = useState<number | null>(
    initialDraftPayload
      ? initialDraftPayload.eventRosterRevision
      : initialEventSource?.rosterRevision ?? null,
  )
  const [linkToEvent, setLinkToEvent] = useState(
    initialDraftPayload
      ? initialDraftPayload.linkToEvent ?? Boolean(initialDraftPayload.eventId)
      : Boolean(initialEventSource),
  )
  const draftMatchesAvailableEvent = Boolean(
    initialDraftPayload?.eventId
    && eventSources?.some((source) => source.id === initialDraftPayload.eventId),
  )
  const [eventVisibility, setEventVisibility] = useState<EventExpenseVisibility>(
    draftMatchesAvailableEvent
      ? initialDraftPayload?.eventVisibility ?? 'participants_only'
      : 'participants_only',
  )
  const [eventWarningDismissed, setEventWarningDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relationNotice, setRelationNotice] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<ExpenseFlowStep>(startingStep)
  const [highestVisitedStep, setHighestVisitedStep] = useState(edit ? EXPENSE_FLOW_STEPS.length - 1 : 0)
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const draftIdRef = useRef(draft?.id ?? createRequestId())
  const draftVersionRef = useRef<number | null>(draft?.version ?? null)
  const draftStepRef = useRef<ExpenseFlowStep | null>(draft?.currentStep ?? null)
  const draftSavingRef = useRef<Promise<boolean> | null>(null)
  const [currentPublicationLifecycle, setCurrentPublicationLifecycle] = useState<ExpenseDraftPublicationLifecycleView | null>(
    publicationLifecycle ?? (draft && !edit ? { status: 'unavailable' } : null),
  )
  const [confirmedAllocationFingerprint, setConfirmedAllocationFingerprint] = useState<string | null>(null)
  const [publicationAction, setPublicationAction] = useState<'share' | 'unshare' | 'finalize' | null>(null)
  const publicationActionRef = useRef<'share' | 'unshare' | 'finalize' | null>(null)
  const [consumedDraftId, setConsumedDraftId] = useState<string | null>(null)
  const consumedDraftIdRef = useRef<string | null>(null)
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
    eventId,
    eventRosterRevision,
    linkToEvent,
    eventVisibility,
  })
  const initialDraftFingerprint = useRef(draftFingerprint)
  const allocationFingerprint = JSON.stringify({
    members: members.map(({ key, input, newGuest, isSelf }) => ({ key, input, newGuest, isSelf })),
    removedMemberIds,
    included,
    total,
    currency,
    splitMethod,
    payments,
    payerKeys,
    amounts,
    percentages,
    weights,
    preserveShares,
  })
  const selectedKeys = members.filter((member) => included[member.key]).map((member) => member.key)
  const selectedEventSource = eventSources?.find((source) => source.id === eventId) ?? null
  const eventSourceUnavailable = (eventSelectionWarning && !eventWarningDismissed)
    || Boolean(eventId && eventSources !== undefined && !selectedEventSource)
  const selectedEventGuestIds = members.flatMap((member) => (
    member.input?.type === 'event_guest' ? [member.input.event_guest_id] : []
  ))
  useEffect(() => {
    focusStepHeading(startingStep)
  }, [startingStep])
  useEffect(() => {
    setConfirmedAllocationFingerprint((current) => (
      current !== null && current !== allocationFingerprint ? null : current
    ))
  }, [allocationFingerprint])

  function draftPayload(): ExpenseDraftPayload {
    return redactExpenseDraftEventGuestLabels({
      circleId: circleId || null,
      eventId: eventId || null,
      eventRosterRevision: eventId ? eventRosterRevision : null,
      linkToEvent: Boolean(eventId && linkToEvent),
      eventVisibility,
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
    })
  }

  async function persistDraft(step: ExpenseFlowStep): Promise<boolean> {
    if (consumedDraftIdRef.current !== null) return false
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
    if (!edit
      && draftVersionRef.current !== null
      && draftStepRef.current === step
      && initialDraftFingerprint.current === draftFingerprint) {
      setDraftStatus('saved')
      return true
    }
    if (draftSavingRef.current) return draftSavingRef.current
    setDraftStatus('saving')
    setRelationNotice(null)
    const savePromise = (async () => {
      try {
        const result = await saveExpenseDraft({
          draft_id: draftIdRef.current,
          expected_version: draftVersionRef.current,
          context_type: edit ? 'edit' : mode,
          group_id: groupId ?? null,
          expense_id: edit?.expense.id ?? null,
          current_step: step,
          payload: draftPayload(),
        })
        if (!result.ok) throw new Error('draft_save_failed')
        draftIdRef.current = result.data.draftId
        draftVersionRef.current = result.data.version
        draftStepRef.current = step
        if (result.data.relationStatus === 'not_bound') {
          setDraftStatus('error')
          setError(t('errors.eventRelationNotBound'))
          queueMicrotask(() => alertRef.current?.focus())
          if (draftBaseHref) {
            const separator = draftBaseHref.includes('?') ? '&' : '?'
            router.replace(`${draftBaseHref}${separator}draft=${result.data.draftId}`)
          }
          return false
        }
        setEventId(result.data.eventId ?? '')
        setEventRosterRevision(result.data.eventRosterRevision)
        setLinkToEvent(result.data.eventId !== null)
        if (result.data.privacyFailClosed) {
          setEventVisibility('participants_only')
          setRelationNotice(t('expenseForm.eventRemovalPrivacyNotice'))
        }
        initialDraftFingerprint.current = draftFingerprint
        setDraftStatus('saved')
        if (draftBaseHref) {
          const separator = draftBaseHref.includes('?') ? '&' : '?'
          router.replace(`${draftBaseHref}${separator}draft=${result.data.draftId}`)
        }
        return true
      } catch {
        setDraftStatus('error')
        setError(t('errors.draftSaveFailed'))
        queueMicrotask(() => alertRef.current?.focus())
        return false
      } finally {
        draftSavingRef.current = null
      }
    })()
    draftSavingRef.current = savePromise
    return savePromise
  }

  function addMember(member: FormMember, includeInCost = !edit) {
    if (members.some((candidate) => candidate.key === member.key)) return
    setMembers((current) => (
      current.some((candidate) => candidate.key === member.key)
        ? current
        : [...current, member]
    ))
    // During an edit, a newly named guest starts as payment-only. Merely adding
    // a payer must not reconstruct the authoritative persisted shares. The
    // user can explicitly include the guest below, which then unlocks editing
    // the allocation and flips preserveShares off.
    setIncluded((current) => ({ ...current, [member.key]: includeInCost }))
    setPayments((current) => ({ ...current, [member.key]: '' }))
    setWeights((current) => ({ ...current, [member.key]: '1' }))
    setAmounts((current) => ({ ...current, [member.key]: '0' }))
    if (!edit && splitMethod === 'percentage' && includeInCost) {
      setPercentages(equalPercentageValues([...selectedKeys, member.key]))
    }
  }

  function addKnownMember(option: ExpenseParticipantOption, includeInCost: boolean): string | null {
    const id = edit ? createRequestId() : `relationship:${option.relationshipId}`
    if (members.some((member) => (
      member.key === `relationship:${option.relationshipId}`
      || member.newGuest?.relationship_id === option.relationshipId
    ))) return null
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
    }, includeInCost)
    return id
  }

  function addKnownParticipant(option: ExpenseParticipantOption): boolean {
    return Boolean(addKnownMember(option, !edit))
  }

  function addManualMember(participant: ManualExpenseParticipant, includeInCost: boolean): string | null {
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
    ))) return null
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
    }, includeInCost)
    return key
  }

  function addManualParticipant(participant: ManualExpenseParticipant): boolean {
    return Boolean(addManualMember(participant, !edit))
  }

  function addKnownPayer(option: ExpenseParticipantOption): boolean {
    const key = addKnownMember(option, false)
    if (!key) return false
    setPayerKeys((current) => [...current, key])
    return true
  }

  function addManualPayer(participant: ManualExpenseParticipant): boolean {
    const key = addManualMember(participant, false)
    if (!key) return false
    setPayerKeys((current) => [...current, key])
    return true
  }

  function selectEventSource(source: EventExpenseSourceView) {
    if (edit || mode !== 'one_off') return { accepted: false }
    if (circleId) {
      return { accepted: false, error: t('expenseForm.eventCircleConflict') }
    }
    if (eventId && eventId !== source.id && selectedEventGuestIds.length > 0) {
      return { accepted: false, error: t('expenseForm.eventIdentityMoveBlocked') }
    }
    if (
      eventId === source.id
      && eventRosterRevision !== null
      && eventRosterRevision !== source.rosterRevision
    ) {
      return { accepted: false, error: t('expenseForm.eventRosterChanged') }
    }
    setEventId(source.id)
    setEventRosterRevision(source.rosterRevision)
    setLinkToEvent(true)
    setEventWarningDismissed(true)
    return { accepted: true, behavior: 'stay-open' as const }
  }

  function addEventMember(
    source: EventExpenseSourceView,
    guest: EventExpenseSourceView['guests'][number],
    includeInCost: boolean,
  ): { key: string | null; error?: string } {
    const selection = selectEventSource(source)
    if (!selection.accepted) return { key: null, error: selection.error }
    if (members.some((member) => (
      member.input?.type === 'event_guest'
      && member.input.event_guest_id === guest.id
    ))) return { key: null, error: t('expenseForm.eventGuestAlreadySelected') }
    const key = `event:${guest.id}`
    addMember({
      key,
      label: guest.displayName,
      input: { type: 'event_guest', key, event_guest_id: guest.id },
      isSelf: false,
    }, includeInCost)
    return { key }
  }

  function addEventParticipant(
    source: EventExpenseSourceView,
    guest: EventExpenseSourceView['guests'][number],
  ) {
    const result = addEventMember(source, guest, true)
    return result.key
      ? { accepted: true, behavior: 'stay-open' as const }
      : { accepted: false, error: result.error }
  }

  function addEventPayer(
    source: EventExpenseSourceView,
    guest: EventExpenseSourceView['guests'][number],
  ) {
    const result = addEventMember(source, guest, false)
    if (!result.key) return { accepted: false, error: result.error }
    setPayerKeys((current) => (
      current.includes(result.key!) ? current : [...current, result.key!]
    ))
    return { accepted: true, behavior: 'stay-open' as const }
  }

  function clearEventSelection() {
    if (selectedEventGuestIds.length > 0) {
      setError(t('expenseForm.eventIdentityRemoveBlocked'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    setEventId('')
    setEventRosterRevision(null)
    setLinkToEvent(false)
    setEventWarningDismissed(true)
  }

  function selectCircle(nextCircleId: string) {
    if (edit || mode !== 'one_off' || eventId) return
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
  // This local fingerprint is only an immediate UI hint and mirrors the safe
  // shared projection: incomplete allocations expose roles, never partial
  // amounts. The refreshed SQL159 lifecycle remains final stale authority.
  const shareableAllocationState = preview
    && !preview.error
    && selectedKeys.length > 0
    && (mode !== 'one_off' || members.length >= 2)
    ? 'balanced_unconfirmed'
    : 'incomplete'
  const shareablePaidMinorByKey = new Map(
    preview?.payerRows.map((row) => [row.key, row.amountMinor] as const) ?? [],
  )
  const shareableShareMinorByKey = new Map(
    preview?.shares.map((row) => [row.participantId, row.amountMinor] as const) ?? [],
  )
  const shareableTotalMinor = (() => {
    try {
      return parseExpenseAmountToMinor(total, currency)
    } catch {
      return null
    }
  })()
  const shareableUiFingerprint = JSON.stringify({
    contextType: mode,
    title: title.trim(),
    totalMinor: shareableTotalMinor,
    currency,
    incurredOn,
    allocationState: shareableAllocationState,
    parties: [...members]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(({ key, input, newGuest, isSelf }) => ({
        key,
        input,
        newGuest,
        isSelf,
        isPayer: payerKeys.includes(key),
        isParticipant: included[key] !== false,
        paidMinor: shareableAllocationState === 'balanced_unconfirmed'
          ? shareablePaidMinorByKey.get(key) ?? 0
          : null,
        shareMinor: shareableAllocationState === 'balanced_unconfirmed'
          ? shareableShareMinorByKey.get(key) ?? 0
          : null,
      })),
    event: eventId && linkToEvent
      ? { eventId, eventVisibility }
      : null,
    eventRosterRevision: eventId ? eventRosterRevision : null,
  })
  const sharedUiFingerprintRef = useRef<string | null>(
    publicationLifecycle?.status === 'ready'
      && publicationLifecycle.sharingState === 'shared'
      && publicationLifecycle.hasUnsharedChanges === false
      ? shareableUiFingerprint
      : null,
  )
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
  const navigationBusy = isPending
    || draftStatus === 'saving'
    || publicationAction !== null
    || consumedDraftId !== null
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

  function showMutationError(messageKey: string) {
    setError(t(messageKey))
    queueMicrotask(() => alertRef.current?.focus())
  }

  function syncPublicationLifecycle(next: ExpenseDraftPublicationLifecycleView) {
    setCurrentPublicationLifecycle(next)
    sharedUiFingerprintRef.current = next.status === 'ready'
      && next.sharingState === 'shared'
      && next.hasUnsharedChanges === false
      ? shareableUiFingerprint
      : null
  }

  async function loadCurrentPublicationLifecycle(): Promise<ReadyExpenseDraftPublicationLifecycle | null> {
    if (currentPublicationLifecycle?.status === 'ready'
      && currentPublicationLifecycle.draftId === draftIdRef.current
      && currentPublicationLifecycle.draftVersion === draftVersionRef.current) {
      return currentPublicationLifecycle
    }
    const next = await refreshExpenseDraftPublicationLifecycle({ draft_id: draftIdRef.current })
    if (next.status !== 'ready'
      || next.draftId !== draftIdRef.current
      || next.draftVersion !== draftVersionRef.current) {
      syncPublicationLifecycle({ status: 'unavailable' })
      showMutationError('errors.draftPublicationUnavailable')
      return null
    }
    syncPublicationLifecycle(next)
    return next
  }

  function runPublicationAction(
    action: 'share' | 'unshare' | 'finalize',
    execute: () => Promise<void>,
  ) {
    if (publicationActionRef.current || consumedDraftIdRef.current !== null) return
    publicationActionRef.current = action
    setPublicationAction(action)
    setError(null)
    startTransition(async () => {
      try {
        await execute()
      } catch {
        showMutationError('errors.save_failed')
      } finally {
        if (consumedDraftIdRef.current === null) {
          publicationActionRef.current = null
          setPublicationAction(null)
        }
      }
    })
  }

  function shareDraft() {
    runPublicationAction('share', async () => {
      if (!await persistDraft(currentStep)) return
      const lifecycle = await loadCurrentPublicationLifecycle()
      if (!lifecycle) return
      const expectedPublicationVersion = lifecycle.sharingState === 'never_shared'
        ? null
        : lifecycle.expectedPublicationVersion
      if (lifecycle.sharingState !== 'never_shared' && expectedPublicationVersion === null) {
        showMutationError('errors.draftPublicationUnavailable')
        return
      }
      const semanticPayload = {
        operation: 'share' as const,
        draft_id: draftIdRef.current,
        expected_draft_version: draftVersionRef.current!,
        expected_publication_version: expectedPublicationVersion,
      }
      const result = await shareExpenseDraft({
        request_id: requestIds.forPayload(semanticPayload),
        draft_id: semanticPayload.draft_id,
        expected_draft_version: semanticPayload.expected_draft_version,
        expected_publication_version: semanticPayload.expected_publication_version,
      })
      if (!result.ok) {
        showMutationError(`errors.${result.error}`)
        return
      }
      requestIds.succeeded(semanticPayload)
      sharedUiFingerprintRef.current = shareableUiFingerprint
      setCurrentPublicationLifecycle({
        status: 'ready',
        draftId: result.data.draftId,
        draftVersion: result.data.draftVersion,
        sharingState: 'shared',
        expectedPublicationVersion: result.data.publicationVersion,
        hasUnsharedChanges: false,
      })
    })
  }

  function unshareDraft() {
    if (!window.confirm(t('expenseForm.unshareDraftConfirmation'))) return
    runPublicationAction('unshare', async () => {
      if (!await persistDraft(currentStep)) return
      const lifecycle = await loadCurrentPublicationLifecycle()
      if (!lifecycle
        || lifecycle.sharingState !== 'shared'
        || lifecycle.expectedPublicationVersion === null) {
        showMutationError('errors.draftPublicationUnavailable')
        return
      }
      const semanticPayload = {
        operation: 'unshare' as const,
        draft_id: draftIdRef.current,
        expected_draft_version: draftVersionRef.current!,
        expected_publication_version: lifecycle.expectedPublicationVersion,
      }
      const result = await unshareExpenseDraft({
        request_id: requestIds.forPayload(semanticPayload),
        draft_id: semanticPayload.draft_id,
        expected_draft_version: semanticPayload.expected_draft_version,
        expected_publication_version: semanticPayload.expected_publication_version,
      })
      if (!result.ok) {
        showMutationError(`errors.${result.error}`)
        return
      }
      requestIds.succeeded(semanticPayload)
      sharedUiFingerprintRef.current = null
      setCurrentPublicationLifecycle({
        status: 'ready',
        draftId: result.data.draftId,
        draftVersion: result.data.draftVersion,
        sharingState: 'withdrawn',
        expectedPublicationVersion: result.data.publicationVersion,
        hasUnsharedChanges: null,
      })
    })
  }

  function finalizeDraft() {
    if (confirmedAllocationFingerprint !== allocationFingerprint || !isStepValid('split')) {
      showMutationError('errors.confirmExpenseAllocation')
      return
    }
    runPublicationAction('finalize', async () => {
      if (!await persistDraft(currentStep)) return
      const lifecycle = await loadCurrentPublicationLifecycle()
      if (!lifecycle) return
      if (lifecycle.sharingState === 'shared'
        && (lifecycle.hasUnsharedChanges !== false
          || sharedUiFingerprintRef.current !== shareableUiFingerprint)) {
        showMutationError('errors.sharedDraftChangesPending')
        return
      }
      const expectedPublicationVersion = lifecycle.sharingState === 'shared'
        ? lifecycle.expectedPublicationVersion
        : null
      if (lifecycle.sharingState === 'shared' && expectedPublicationVersion === null) {
        showMutationError('errors.draftPublicationUnavailable')
        return
      }
      const semanticPayload = {
        operation: 'finalize' as const,
        draft_id: draftIdRef.current,
        expected_draft_version: draftVersionRef.current!,
        expected_publication_version: expectedPublicationVersion,
        split_confirmed: true as const,
      }
      const result = await finalizeExpenseDraft({
        request_id: requestIds.forPayload(semanticPayload),
        draft_id: semanticPayload.draft_id,
        expected_draft_version: semanticPayload.expected_draft_version,
        expected_publication_version: semanticPayload.expected_publication_version,
        split_confirmed: true,
      })
      if (!result.ok) {
        showMutationError(`errors.${result.error}`)
        return
      }
      requestIds.succeeded(semanticPayload)
      consumedDraftIdRef.current = semanticPayload.draft_id
      setConsumedDraftId(semanticPayload.draft_id)
      router.replace(`/auth-mvp/utlagt-og-endurgreitt/utgjold/${result.data.expenseId}`)
    })
  }

  function saveExpenseChanges() {
    if (!edit) return
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
    const editPayload = {
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
    }
    const requestPayload = editPayload
    startTransition(async () => {
      try {
        const result = await updateExpense({
          ...editPayload,
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
      } catch {
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
      }
    })
  }

  async function saveDraftOnly() {
    setError(null)
    if (!await persistDraft(currentStep)) return
    router.push('/auth-mvp/utlagt-og-endurgreitt')
    router.refresh()
  }

  const allocationConfirmed = confirmedAllocationFingerprint === allocationFingerprint
  const publicationReady = currentPublicationLifecycle?.status === 'ready'
    ? currentPublicationLifecycle
    : null
  const publicationIsShared = publicationReady?.sharingState === 'shared'
  const sharedHasUnsharedChanges = publicationIsShared
    && (publicationReady.hasUnsharedChanges !== false
      || sharedUiFingerprintRef.current !== shareableUiFingerprint)
  const publicationUnavailable = currentPublicationLifecycle?.status === 'unavailable'
  const publicationCandidate = isDetailsValid()
    && selectedKeys.length > 0
    && (mode !== 'one_off' || members.length >= 2)
  const canFinalizeDraft = allocationConfirmed
    && isStepValid('split')
    && !publicationUnavailable
    && !sharedHasUnsharedChanges
  const primaryDraftAction: 'save' | 'share' | 'finalize' = sharedHasUnsharedChanges
    ? 'share'
    : canFinalizeDraft
      ? 'finalize'
      : publicationIsShared
        ? 'save'
        : publicationCandidate
          ? 'share'
          : 'save'

  function runPrimaryDraftAction() {
    if (primaryDraftAction === 'finalize') {
      finalizeDraft()
      return
    }
    if (primaryDraftAction === 'share') {
      shareDraft()
      return
    }
    void saveDraftOnly()
  }

  function primaryDraftActionLabel() {
    if (primaryDraftAction === 'finalize') {
      return publicationAction === 'finalize'
        ? t('expenseForm.confirmingExpense')
        : t('expenseForm.confirmExpense')
    }
    if (primaryDraftAction === 'share') {
      if (publicationAction === 'share') return t('expenseForm.sharingDraft')
      return sharedHasUnsharedChanges
        ? t('expenseForm.shareDraftChanges')
        : t('expenseForm.shareDraft')
    }
    return draftStatus === 'saving'
      ? t('expenseForm.draftSaving')
      : t('expenseForm.saveAndClose')
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (currentStepIndex < EXPENSE_FLOW_STEPS.length - 1) {
      void advanceStep()
      return
    }
    if (edit) saveExpenseChanges()
    else runPrimaryDraftAction()
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={navigationBusy}>
      <fieldset disabled={navigationBusy} className="min-w-0 space-y-8 border-0 p-0">
      <TeskeidStepNav
        ariaLabel={t('expenseForm.stepNavAriaLabel')}
        items={stepItems}
        onStepChange={openStep}
      />
      {draftStatus === 'saving' ? (
        <p role="status" className="text-center text-xs text-muted-foreground">
          {t('expenseForm.draftSaving')}
        </p>
      ) : null}
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {relationNotice ? (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-foreground">
          {relationNotice}
        </p>
      ) : null}
      {eventSourceUnavailable ? (
        <div role="status" className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <p>{t('expenseForm.eventSelectionUnavailable')}</p>
          {eventId ? (
            <button
              type="button"
              className={expenseSecondaryButtonClass}
              disabled={navigationBusy}
              onClick={clearEventSelection}
            >
              {t('expenseForm.clearEventSelection')}
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === 'one_off' && !edit && eventId ? (
        <label className="flex min-h-11 items-start gap-3 border-y border-border py-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={linkToEvent}
            disabled={navigationBusy}
            onChange={(event) => {
              setLinkToEvent(event.target.checked)
            }}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('expenseForm.linkToEvent')}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {t('expenseForm.linkToEventHint')}
            </span>
          </span>
        </label>
      ) : null}
      {mode === 'one_off' && !edit && eventId && linkToEvent ? (
        <fieldset className="space-y-3 border-b border-border pb-5">
          <legend className="text-sm font-semibold">{t('eventVisibility.legend')}</legend>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
            <input
              type="radio"
              name="event-expense-visibility"
              value="participants_only"
              checked={eventVisibility === 'participants_only'}
              disabled={navigationBusy}
              onChange={() => setEventVisibility('participants_only')}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t('eventVisibility.participantsOnly')}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {t('eventVisibility.participantsOnlyHint')}
              </span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
            <input
              type="radio"
              name="event-expense-visibility"
              value="all_event"
              checked={eventVisibility === 'all_event'}
              disabled={navigationBusy}
              onChange={() => setEventVisibility('all_event')}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t('eventVisibility.allEvent')}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {t('eventVisibility.allEventHint')}
              </span>
            </span>
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            {t('eventVisibility.helper')}
          </p>
        </fieldset>
      ) : null}
      {mode === 'one_off' && !edit && circleId ? (
        <button
          type="button"
          className={`${expenseSecondaryButtonClass} w-full`}
          disabled={navigationBusy}
          onClick={() => selectCircle('')}
        >
          {t('expenseForm.clearRelationshipCircle')}
        </button>
      ) : null}

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
                    className={`${expenseInputClass} h-11 py-0`}
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
                    className={`${expenseInputClass} h-11 py-0`}
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
        ) : mode === 'one_off' ? (
          <ExpenseParticipantPicker
            options={participantOptions}
            optionsError={participantOptionsError}
            disabled={navigationBusy}
            triggerLabel={t('expenseForm.addPayer')}
            excludedRelationshipIds={members.flatMap((member) => {
              if (member.input?.type === 'relationship') return [member.input.relationship_id]
              return member.newGuest?.relationship_id ? [member.newGuest.relationship_id] : []
            })}
            onAddKnown={addKnownPayer}
            onAddManual={addManualPayer}
            eventSources={!edit ? eventSources : undefined}
            eventSourcePresentation={!edit ? eventSourcePresentation : undefined}
            eventSourcesError={eventSourcesError}
            selectedEventId={eventId || null}
            selectedEventGuestIds={selectedEventGuestIds}
            initialSourceId={eventId ? 'event' : undefined}
            onSelectEvent={selectEventSource}
            onClearEvent={clearEventSelection}
            onAddEventGuest={addEventPayer}
          />
        ) : null}
      </fieldset>

      <fieldset className="space-y-3 border-y border-border py-5">
        <legend id="expense-split-heading" tabIndex={-1} className="text-sm font-semibold">{t('expenseForm.participants')}</legend>
        {mode === 'one_off' ? <p className="text-xs leading-5 text-muted-foreground">{t('expenseForm.participantHint')}</p> : null}
        {eventContext && members.some((member) => !member.isSelf) ? (
          <button
            type="button"
            className={`${expenseSecondaryButtonClass} w-full`}
            disabled={navigationBusy || members.filter((member) => !member.isSelf).every((member) => included[member.key] !== false)}
            onClick={() => setIncluded((current) => ({
              ...current,
              ...Object.fromEntries(members.filter((member) => !member.isSelf).map((member) => [member.key, true])),
            }))}
          >
            {t('expenseForm.selectAllEventGuests')}
          </button>
        ) : null}
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
              circles={!edit && !eventId ? circleOptions : []}
              disabled={isPending}
              excludedRelationshipIds={members.flatMap((member) => {
                if (member.input?.type === 'relationship') return [member.input.relationship_id]
                return member.newGuest?.relationship_id ? [member.newGuest.relationship_id] : []
              })}
              onAddKnown={addKnownParticipant}
              onAddManual={addManualParticipant}
              eventSources={!edit ? eventSources : undefined}
              eventSourcePresentation={!edit ? eventSourcePresentation : undefined}
              eventSourcesError={eventSourcesError}
              selectedEventId={eventId || null}
              selectedEventGuestIds={selectedEventGuestIds}
              initialSourceId={eventId ? 'event' : undefined}
              onSelectEvent={selectEventSource}
              onClearEvent={clearEventSelection}
              onAddEventGuest={addEventParticipant}
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

      {currentStep === 'split' && !edit ? (
        <fieldset className="space-y-3 rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{t('expenseForm.allocationConfirmationLegend')}</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0"
              checked={allocationConfirmed}
              disabled={navigationBusy || !isStepValid('split')}
              onChange={(event) => setConfirmedAllocationFingerprint(
                event.target.checked ? allocationFingerprint : null,
              )}
            />
            <span className="min-w-0">
              <span className="block font-medium">{t('expenseForm.allocationConfirmation')}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {t('expenseForm.allocationConfirmationHint')}
              </span>
            </span>
          </label>
          {sharedHasUnsharedChanges ? (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              <span className="block font-medium">{t('expenseForm.unsharedDraftChanges')}</span>
              <span className="block">{t('expenseForm.unsharedDraftChangesHint')}</span>
            </p>
          ) : publicationIsShared ? (
            <p role="status" className="text-xs leading-5 text-muted-foreground">
              {t('expenseForm.sharedDraftCurrent')}
            </p>
          ) : publicationUnavailable ? (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {t('expenseForm.draftPublicationUnavailable')}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="space-y-3">
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
            edit ? (
              isStepValid(currentStep) ? (
                <button type="submit" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy}>
                  {isPending ? t('expenseForm.updating') : t('expenseForm.update')}
                </button>
              ) : (
                <button type="button" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy || !isDetailsValid()} onClick={() => void saveDraftOnly()}>
                  {draftStatus === 'saving' ? t('expenseForm.draftSaving') : t('expenseForm.saveDraftOnly')}
                </button>
              )
            ) : (
              <button
                type="submit"
                className={`${expensePrimaryButtonClass} w-full`}
                disabled={navigationBusy || (primaryDraftAction === 'save' && !isDetailsValid())}
              >
                {primaryDraftActionLabel()}
              </button>
            )
          ) : !edit && currentStep === 'details' && !isDetailsValid() ? (
            <button
              type="button"
              className={`${expensePrimaryButtonClass} w-full`}
              disabled={navigationBusy}
              onClick={() => void saveDraftOnly()}
            >
              {draftStatus === 'saving' ? t('expenseForm.draftSaving') : t('expenseForm.saveAndClose')}
            </button>
          ) : (
            <button type="button" className={`${expensePrimaryButtonClass} w-full`} disabled={navigationBusy} onClick={() => void advanceStep()}>
              {t(`expenseForm.nextSteps.${EXPENSE_FLOW_STEPS[currentStepIndex + 1]}`)}
            </button>
          )}
        </div>
        {!edit && currentStepIndex === EXPENSE_FLOW_STEPS.length - 1 && primaryDraftAction !== 'save' ? (
          <button
            type="button"
            className={`${expenseSecondaryButtonClass} w-full`}
            disabled={navigationBusy || !isDetailsValid()}
            onClick={() => void saveDraftOnly()}
          >
            {draftStatus === 'saving' ? t('expenseForm.draftSaving') : t('expenseForm.saveAndClose')}
          </button>
        ) : null}
        {!edit && currentStepIndex === EXPENSE_FLOW_STEPS.length - 1 && publicationIsShared ? (
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            disabled={navigationBusy}
            onClick={unshareDraft}
          >
            {publicationAction === 'unshare'
              ? t('expenseForm.unsharingDraft')
              : t('expenseForm.unshareDraft')}
          </button>
        ) : null}
      </div>
      </fieldset>
    </form>
  )
}
