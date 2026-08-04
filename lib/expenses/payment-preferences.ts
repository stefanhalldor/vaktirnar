import { failExpenseDomain } from './domain-error'
import { assertPartyId, compareStableIds, normalizeCurrency } from './money'
import type {
  PaymentPreference,
  PaymentPreferenceAssignment,
  PaymentPreferenceAssignmentScope,
  PaymentPreferenceDetails,
  PaymentPreferenceResolutionSource,
  PaymentPreferenceSnapshot,
  ResolvedPaymentPreference,
} from './types'

function normalizeSupportedCurrencies(currencies: readonly string[] | null): string[] | null {
  if (currencies === null) return null
  if (!Array.isArray(currencies)) failExpenseDomain('payment_preference_invalid')
  const normalized = currencies.map(normalizeCurrency).sort(compareStableIds)
  if (new Set(normalized).size !== normalized.length) {
    failExpenseDomain('payment_preference_invalid')
  }
  return normalized
}

function validateDetails(preference: PaymentPreference): void {
  const details = preference.details
  if (preference.kind === 'bank_account' && !details.accountNumber?.trim()) {
    failExpenseDomain('payment_preference_invalid')
  }
  if (preference.kind === 'payment_app_phone' && !details.phoneNumber?.trim()) {
    failExpenseDomain('payment_preference_invalid')
  }
  if (preference.kind === 'payment_link') {
    try {
      const url = new URL(details.paymentLink ?? '')
      if (url.protocol !== 'https:') failExpenseDomain('payment_preference_invalid')
    } catch {
      failExpenseDomain('payment_preference_invalid')
    }
  }
  if (preference.kind === 'other' && !details.instructions?.trim()) {
    failExpenseDomain('payment_preference_invalid')
  }
}

export function validatePaymentPreference(preference: PaymentPreference): PaymentPreference {
  if (
    typeof preference.preferenceId !== 'string' ||
    !preference.preferenceId.trim() ||
    typeof preference.title !== 'string' ||
    !preference.title.trim()
  ) {
    failExpenseDomain('payment_preference_invalid')
  }
  assertPartyId(preference.ownerId)
  if (!Number.isSafeInteger(preference.version) || preference.version <= 0) {
    failExpenseDomain('payment_preference_invalid')
  }
  if (!['bank_account', 'payment_app_phone', 'payment_link', 'cash', 'other'].includes(preference.kind)) {
    failExpenseDomain('payment_preference_invalid')
  }
  if (!['private', 'debt_context', 'explicit_share'].includes(preference.visibility)) {
    failExpenseDomain('payment_preference_invalid')
  }
  if (typeof preference.active !== 'boolean' || !preference.details || typeof preference.details !== 'object') {
    failExpenseDomain('payment_preference_invalid')
  }
  validateDetails(preference)
  return {
    ...preference,
    supportedCurrencies: normalizeSupportedCurrencies(preference.supportedCurrencies),
    details: { ...preference.details },
  }
}

function scopeKey(scope: PaymentPreferenceAssignmentScope): string {
  if (!scope || typeof scope !== 'object') failExpenseDomain('payment_preference_invalid')
  if (scope.type === 'general') return 'general'
  if (scope.type === 'currency') return `currency:${normalizeCurrency(scope.currency)}`
  if (scope.type === 'group_currency') {
    if (!scope.groupId?.trim()) failExpenseDomain('payment_preference_invalid')
    return `group_currency:${scope.groupId}:${normalizeCurrency(scope.currency)}`
  }
  failExpenseDomain('payment_preference_invalid')
}

function isPreferenceUsable(preference: PaymentPreference, currency: string): boolean {
  return (
    preference.active &&
    (preference.supportedCurrencies === null || preference.supportedCurrencies.includes(currency))
  )
}

export function resolvePaymentPreference(input: {
  ownerId: string
  currency: string
  groupId?: string | null
  preferences: readonly PaymentPreference[]
  assignments: readonly PaymentPreferenceAssignment[]
}): ResolvedPaymentPreference | null {
  const ownerId = assertPartyId(input.ownerId)
  const currency = normalizeCurrency(input.currency)
  if (input.groupId !== undefined && input.groupId !== null && !input.groupId.trim()) {
    failExpenseDomain('payment_preference_invalid')
  }

  const preferences = new Map<string, PaymentPreference>()
  for (const rawPreference of input.preferences) {
    const preference = validatePaymentPreference(rawPreference)
    if (preference.ownerId !== ownerId) {
      failExpenseDomain('payment_preference_owner_mismatch')
    }
    if (preferences.has(preference.preferenceId)) {
      failExpenseDomain('payment_preference_invalid')
    }
    preferences.set(preference.preferenceId, preference)
  }

  const assignments = new Map<string, PaymentPreferenceAssignment>()
  for (const assignment of input.assignments) {
    if (assignment.ownerId !== ownerId) {
      failExpenseDomain('payment_preference_owner_mismatch')
    }
    const key = scopeKey(assignment.scope)
    if (assignments.has(key)) {
      failExpenseDomain('payment_preference_assignment_duplicate', { scope: key })
    }
    if (assignment.preferenceId !== null && !preferences.has(assignment.preferenceId)) {
      failExpenseDomain('payment_preference_invalid')
    }
    assignments.set(key, assignment)
  }

  const candidates: Array<{ key: string; source: PaymentPreferenceResolutionSource }> = []
  if (input.groupId) {
    candidates.push({
      key: `group_currency:${input.groupId}:${currency}`,
      source: 'group_currency',
    })
  }
  candidates.push({ key: `currency:${currency}`, source: 'currency' })
  candidates.push({ key: 'general', source: 'general' })

  for (const candidate of candidates) {
    const assignment = assignments.get(candidate.key)
    if (!assignment) continue
    if (assignment.preferenceId === null) return null
    const preference = preferences.get(assignment.preferenceId)!
    if (isPreferenceUsable(preference, currency)) {
      return { preference, source: candidate.source }
    }
  }
  return null
}

function cloneAndFreezeDetails(details: Readonly<PaymentPreferenceDetails>): Readonly<PaymentPreferenceDetails> {
  return Object.freeze({ ...details })
}

export function createPaymentPreferenceSnapshot(input: {
  resolved: ResolvedPaymentPreference
  currency: string
  capturedAt: string
}): PaymentPreferenceSnapshot {
  const preference = validatePaymentPreference(input.resolved.preference)
  const currency = normalizeCurrency(input.currency)
  const capturedTime = Date.parse(input.capturedAt)
  if (!isPreferenceUsable(preference, currency) || !Number.isFinite(capturedTime)) {
    failExpenseDomain('payment_preference_invalid')
  }
  return Object.freeze({
    sourcePreferenceId: preference.preferenceId,
    sourcePreferenceVersion: preference.version,
    ownerId: preference.ownerId,
    title: preference.title,
    kind: preference.kind,
    currency,
    details: cloneAndFreezeDetails(preference.details),
    visibility: preference.visibility,
    capturedAt: new Date(capturedTime).toISOString(),
  })
}

export function canViewPaymentPreference(input: {
  viewerId: string
  ownerId: string
  visibility: PaymentPreference['visibility']
  viewerOwesOwner: boolean
  sharesSettlementWithOwner: boolean
  explicitlySharedWithViewer: boolean
}): boolean {
  if (!['private', 'debt_context', 'explicit_share'].includes(input.visibility)) return false
  if (input.viewerId === input.ownerId) return true
  if (input.visibility === 'private') return false
  if (input.visibility === 'explicit_share') return input.explicitlySharedWithViewer
  if (input.visibility === 'debt_context') {
    return input.viewerOwesOwner || input.sharesSettlementWithOwner
  }
  return false
}
