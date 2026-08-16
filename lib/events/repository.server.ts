import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  EventDetailView,
  EventExpensePreviewCurrencyView,
  EventExpensePreviewView,
  EventExpenseSourceView,
  EventGuestSourceKind,
  EventSummary,
} from './contracts'
import type { CreateEventInput, ReplaceEventRosterInput } from './validation'

type JsonRecord = Record<string, unknown>

const eventId = z.string().uuid()
const safeName = z.string().trim().min(1).max(160)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))
const safeGuestName = z.string().trim().min(1).max(120)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))
const safeEmail = z.string().trim().email().max(320)
const createdAt = z.string().datetime({ offset: true })
const guestSourceKind = z.enum(['relationship', 'manual_name', 'manual_email'])
const currencyCode = z.string().regex(/^[A-Z]{3}$/)
const previewStatus = z.enum(['none_tagged', 'ready', 'unavailable'])
const previewCurrencyState = z.enum([
  'settled',
  'open',
  'pending',
  'review_required',
  'blocked_manual',
])

const FORBIDDEN_PROJECTION_KEYS = new Set([
  'emailcanonical',
  'authuserid',
  'linkeduserid',
  'ownerid',
  'owneruserid',
  'participantuserid',
  'pickerlabel',
  'privatedisplayname',
  'recipientemail',
  'relationshipid',
  'userid',
])

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function rows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const row = record(candidate)
    return row ? [row] : []
  })
}

function resultRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return record(value[0])
  return record(value)
}

function assertOwnerSafeProjection(value: unknown, forbidEmail = false): void {
  if (Array.isArray(value)) {
    value.forEach((nested) => assertOwnerSafeProjection(nested, forbidEmail))
    return
  }
  const row = record(value)
  if (!row) return
  for (const [key, nested] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '')
    if (FORBIDDEN_PROJECTION_KEYS.has(normalizedKey) || forbidEmail && normalizedKey === 'email') {
      throw new Error('event_load_failed')
    }
    assertOwnerSafeProjection(nested, forbidEmail)
  }
}

function requiredString(row: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof row[key] === 'string') return row[key]
  }
  throw new Error('event_load_failed')
}

function nullableString(row: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (value === null) return null
    if (typeof value === 'string') return value
  }
  throw new Error('event_load_failed')
}

function requiredInteger(row: JsonRecord, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key]
    const value = typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (Number.isSafeInteger(value)) return value
  }
  throw new Error('event_load_failed')
}

function requiredBoolean(row: JsonRecord, ...keys: string[]): boolean {
  for (const key of keys) {
    if (typeof row[key] === 'boolean') return row[key]
  }
  throw new Error('event_load_failed')
}

function parseEventId(value: string): string {
  const parsed = eventId.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseName(value: string): string {
  const parsed = safeName.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseGuestName(value: string): string {
  const parsed = safeGuestName.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseCreatedAt(value: string): string {
  const parsed = createdAt.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseSourceKind(value: string): EventGuestSourceKind {
  const parsed = guestSourceKind.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseRosterRevision(row: JsonRecord): number {
  const revision = requiredInteger(row, 'roster_revision', 'rosterRevision')
  if (revision < 1) throw new Error('event_load_failed')
  return revision
}

function mapSummary(row: JsonRecord): EventSummary {
  const guestCount = requiredInteger(row, 'active_guest_count', 'activeGuestCount')
  if (guestCount < 0 || guestCount > 49) throw new Error('event_load_failed')
  return {
    id: parseEventId(requiredString(row, 'event_id', 'eventId')),
    name: parseName(requiredString(row, 'name')),
    guestCount,
    rosterRevision: parseRosterRevision(row),
    createdAt: parseCreatedAt(requiredString(row, 'created_at', 'createdAt')),
    updatedAt: parseCreatedAt(requiredString(row, 'updated_at', 'updatedAt')),
  }
}

function mapGuest(candidate: unknown) {
  const guest = record(candidate)
  if (!guest) throw new Error('event_load_failed')
  const sourceKind = parseSourceKind(requiredString(guest, 'source_kind', 'sourceKind'))
  const rawEmail = nullableString(guest, 'email')
  const parsedEmail = rawEmail === null ? null : safeEmail.safeParse(rawEmail)
  if (parsedEmail !== null && !parsedEmail.success) throw new Error('event_load_failed')
  const email = parsedEmail === null ? null : parsedEmail.data.toLocaleLowerCase('en-US')
  const isTeskeidUser = requiredBoolean(guest, 'is_teskeid_user', 'isTeskeidUser')
  if (
    (sourceKind !== 'relationship' && isTeskeidUser)
    || (sourceKind === 'manual_email') !== (email !== null)
  ) {
    throw new Error('event_load_failed')
  }
  return {
    id: parseEventId(requiredString(guest, 'event_guest_id', 'eventGuestId')),
    displayName: parseGuestName(requiredString(guest, 'display_name', 'displayName')),
    sourceKind,
    email,
    isTeskeidUser,
    position: requiredInteger(guest, 'position'),
  }
}

function mapDetail(row: JsonRecord): EventDetailView {
  const rawGuests = row.guests
  if (!Array.isArray(rawGuests) || rawGuests.length > 49) throw new Error('event_load_failed')
  const guests = rawGuests.map(mapGuest).sort((left, right) => left.position - right.position)
  if (guests.some((guest, index) => guest.position !== index)) throw new Error('event_load_failed')
  return {
    id: parseEventId(requiredString(row, 'event_id', 'eventId')),
    name: parseName(requiredString(row, 'name')),
    rosterRevision: parseRosterRevision(row),
    createdAt: parseCreatedAt(requiredString(row, 'created_at', 'createdAt')),
    updatedAt: parseCreatedAt(requiredString(row, 'updated_at', 'updatedAt')),
    guests,
  }
}

function mapMutationResult(value: unknown, fallback: string): { eventId: string; rosterRevision: number } {
  const result = resultRecord(value)
  if (!result) throw new Error(fallback)
  return {
    eventId: parseEventId(requiredString(result, 'event_id', 'eventId')),
    rosterRevision: parseRosterRevision(result),
  }
}

function rpcFailure(error: { message?: string; code?: string } | null, fallback: string): never {
  const message = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase()
  if (message.includes('guest_conflict')) throw new Error('event_invalid_input')
  if (message.includes('conflict') || message.includes('stale')) throw new Error('event_conflict')
  if (message.includes('invalid_input') || message.includes('guest_invalid')) {
    throw new Error('event_invalid_input')
  }
  if (message.includes('not_allowed')) throw new Error('event_not_allowed')
  if (message.includes('not_found')) throw new Error('event_not_found')
  if (message.includes('unavailable')) throw new Error('event_unavailable')
  throw new Error(fallback)
}

export async function createEventContext(
  actorUserId: string,
  input: CreateEventInput,
): Promise<{ eventId: string; rosterRevision: number }> {
  const { data, error } = await getAdmin().rpc('teskeid_event_create', {
    p_actor_id: actorUserId,
    p_request_id: input.request_id,
    p_name: input.name,
    p_guests: input.guests,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  return mapMutationResult(data, 'event_save_failed')
}

export async function replaceEventRoster(
  actorUserId: string,
  input: ReplaceEventRosterInput,
): Promise<{ eventId: string; rosterRevision: number }> {
  const { data, error } = await getAdmin().rpc('teskeid_event_replace_roster', {
    p_actor_id: actorUserId,
    p_event_id: input.event_id,
    p_request_id: input.request_id,
    p_expected_roster_revision: input.expected_roster_revision,
    p_guests: input.guests,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = mapMutationResult(data, 'event_save_failed')
  if (result.eventId !== input.event_id) throw new Error('event_save_failed')
  return result
}

export async function listEventContexts(actorUserId: string): Promise<EventSummary[]> {
  const { data, error } = await getAdmin().rpc('teskeid_event_list', {
    p_actor_id: actorUserId,
  })
  if (error) rpcFailure(error, 'event_load_failed')
  assertOwnerSafeProjection(data, true)
  if (data !== null && data !== undefined && !Array.isArray(data)) throw new Error('event_load_failed')
  const eventRows = rows(data)
  if (eventRows.length > 100) throw new Error('event_load_failed')
  const events = eventRows.map(mapSummary)
  if (new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error('event_load_failed')
  }
  return events
}

export async function listEvents(actorUserId: string): Promise<EventSummary[]> {
  return listEventContexts(actorUserId)
}

export async function getEventContext(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventDetailView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  if (data === null || data === undefined || Array.isArray(data) && data.length === 0) return null
  assertOwnerSafeProjection(data)
  const result = resultRecord(data)
  if (!result) return null
  const detail = mapDetail(result)
  if (detail.id !== parsedEventId.data) throw new Error('event_load_failed')
  return detail
}

function mapExpenseSourceGuest(candidate: unknown) {
  const guest = record(candidate)
  if (!guest) throw new Error('event_load_failed')
  const position = requiredInteger(guest, 'position')
  if (position < 0 || position > 48) throw new Error('event_load_failed')
  return {
    id: parseEventId(requiredString(guest, 'event_guest_id', 'eventGuestId')),
    displayName: parseGuestName(requiredString(guest, 'display_name', 'displayName')),
    sourceKind: parseSourceKind(requiredString(guest, 'source_kind', 'sourceKind')),
    position,
  }
}

function mapExpenseSource(candidate: unknown): EventExpenseSourceView {
  const source = record(candidate)
  if (!source || !Array.isArray(source.guests) || source.guests.length > 49) {
    throw new Error('event_load_failed')
  }
  const guestsWithPosition = source.guests
    .map(mapExpenseSourceGuest)
    .sort((left, right) => left.position - right.position)
  if (guestsWithPosition.some((guest, index) => guest.position !== index)) {
    throw new Error('event_load_failed')
  }
  return {
    id: parseEventId(requiredString(source, 'event_id', 'eventId')),
    name: parseName(requiredString(source, 'name')),
    rosterRevision: parseRosterRevision(source),
    guests: guestsWithPosition.map((guest) => ({
      id: guest.id,
      displayName: guest.displayName,
      sourceKind: guest.sourceKind,
    })),
  }
}

export async function listEventExpenseSources(actorUserId: string): Promise<EventExpenseSourceView[]> {
  const { data, error } = await getAdmin().rpc('teskeid_event_list_expense_sources', {
    p_actor_id: actorUserId,
  })
  if (error) rpcFailure(error, 'event_load_failed')
  assertOwnerSafeProjection(data, true)
  const result = resultRecord(data)
  if (!result || !Array.isArray(result.events) || result.events.length > 100) {
    throw new Error('event_load_failed')
  }
  return result.events.map(mapExpenseSource)
}

export async function getOwnedEventExpenseSource(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventExpenseSourceView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_source', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found')) return null
    rpcFailure(error, 'event_load_failed')
  }
  if (data === null || data === undefined || Array.isArray(data) && data.length === 0) return null
  assertOwnerSafeProjection(data, true)
  const result = resultRecord(data)
  if (!result) return null
  const source = mapExpenseSource(result)
  if (source.id !== parsedEventId.data) throw new Error('event_load_failed')
  return source
}

function mapPreviewTransfer(candidate: unknown) {
  const transfer = record(candidate)
  if (!transfer) throw new Error('event_preview_failed')
  const amountMinor = requiredInteger(transfer, 'amount_minor', 'amountMinor')
  if (amountMinor < 1) throw new Error('event_preview_failed')
  return {
    fromPartyId: parseEventId(requiredString(transfer, 'from_party_id', 'fromPartyId')),
    toPartyId: parseEventId(requiredString(transfer, 'to_party_id', 'toPartyId')),
    fromDisplayName: parseGuestName(requiredString(transfer, 'from_display_name', 'fromDisplayName')),
    toDisplayName: parseGuestName(requiredString(transfer, 'to_display_name', 'toDisplayName')),
    amountMinor,
  }
}

function mapPreviewBlockedParty(candidate: unknown) {
  const party = record(candidate)
  if (!party || requiredString(party, 'reason') !== 'unresolved_identity') {
    throw new Error('event_preview_failed')
  }
  return {
    partyId: parseEventId(requiredString(party, 'party_id', 'partyId')),
    displayName: parseGuestName(requiredString(party, 'display_name', 'displayName')),
    reason: 'unresolved_identity' as const,
  }
}

function mapPreviewCurrency(candidate: unknown): EventExpensePreviewCurrencyView {
  const currency = record(candidate)
  if (!currency || !Array.isArray(currency.transfers) || !Array.isArray(currency.blocked_parties)) {
    throw new Error('event_preview_failed')
  }
  const parsedCurrency = currencyCode.safeParse(requiredString(currency, 'currency'))
  const parsedState = previewCurrencyState.safeParse(requiredString(currency, 'state'))
  const pendingRepaymentCount = requiredInteger(
    currency,
    'pending_repayment_count',
    'pendingRepaymentCount',
  )
  if (!parsedCurrency.success || !parsedState.success || pendingRepaymentCount < 0) {
    throw new Error('event_preview_failed')
  }
  const transfers = currency.transfers.map(mapPreviewTransfer)
  const blocked = currency.blocked_parties.map(mapPreviewBlockedParty)
  const transferPairs = new Set<string>()
  const senders = new Set<string>()
  const recipients = new Set<string>()
  const partyLabels = new Map<string, string>()
  for (const transfer of transfers) {
    if (transfer.fromPartyId === transfer.toPartyId) throw new Error('event_preview_failed')
    const pairKey = [transfer.fromPartyId, transfer.toPartyId].sort().join(':')
    if (transferPairs.has(pairKey)) throw new Error('event_preview_failed')
    transferPairs.add(pairKey)
    senders.add(transfer.fromPartyId)
    recipients.add(transfer.toPartyId)
    for (const [partyId, displayName] of [
      [transfer.fromPartyId, transfer.fromDisplayName],
      [transfer.toPartyId, transfer.toDisplayName],
    ] as const) {
      const existingLabel = partyLabels.get(partyId)
      if (existingLabel !== undefined && existingLabel !== displayName) {
        throw new Error('event_preview_failed')
      }
      partyLabels.set(partyId, displayName)
    }
  }
  if ([...senders].some((partyId) => recipients.has(partyId))) {
    throw new Error('event_preview_failed')
  }

  const blockedPartyIds = new Set<string>()
  for (const party of blocked) {
    if (blockedPartyIds.has(party.partyId) || partyLabels.has(party.partyId)) {
      throw new Error('event_preview_failed')
    }
    blockedPartyIds.add(party.partyId)
  }

  const hasTransfers = transfers.length > 0
  const hasPending = pendingRepaymentCount > 0
  const hasBlocked = blocked.length > 0
  const stateIsConsistent = parsedState.data === 'open'
    ? hasTransfers && !hasPending && !hasBlocked
    : parsedState.data === 'settled'
      ? !hasTransfers && !hasPending && !hasBlocked
      : parsedState.data === 'blocked_manual'
        ? !hasTransfers && !hasPending && hasBlocked
        : parsedState.data === 'pending' || parsedState.data === 'review_required'
          ? !hasTransfers && hasPending
          : false
  if (!stateIsConsistent) throw new Error('event_preview_failed')

  return {
    currency: parsedCurrency.data,
    state: parsedState.data,
    transfers,
    pendingRepaymentCount,
    blocked,
  }
}

function mapExpensePreview(value: unknown): EventExpensePreviewView {
  assertOwnerSafeProjection(value, true)
  const preview = resultRecord(value)
  if (!preview || !Array.isArray(preview.currencies)) throw new Error('event_preview_failed')
  const parsedStatus = previewStatus.safeParse(requiredString(preview, 'status'))
  const taggedExpenseCount = requiredInteger(
    preview,
    'tagged_expense_count',
    'taggedExpenseCount',
  )
  if (!parsedStatus.success || taggedExpenseCount < 0) throw new Error('event_preview_failed')
  const currencies = preview.currencies.map(mapPreviewCurrency)
  if (
    new Set(currencies.map((currency) => currency.currency)).size !== currencies.length
    || parsedStatus.data === 'none_tagged' && (taggedExpenseCount !== 0 || currencies.length !== 0)
    || parsedStatus.data === 'unavailable' && currencies.length !== 0
    || parsedStatus.data === 'ready' && (taggedExpenseCount === 0 || currencies.length === 0)
  ) {
    throw new Error('event_preview_failed')
  }
  return {
    eventId: parseEventId(requiredString(preview, 'event_id', 'eventId')),
    status: parsedStatus.data,
    taggedExpenseCount,
    currencies,
  }
}

export async function getEventExpensePreview(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventExpensePreviewView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_preview', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    if (message.includes('unavailable')) {
      return {
        eventId: parsedEventId.data,
        status: 'unavailable',
        taggedExpenseCount: 0,
        currencies: [],
      }
    }
    throw new Error('event_preview_failed')
  }
  const preview = mapExpensePreview(data)
  if (preview.eventId !== parsedEventId.data) throw new Error('event_preview_failed')
  return preview
}

/**
 * Expense-authorized legacy classification only. SQL131 deliberately returns
 * no event metadata. Keep this export until every legacy expense-group route
 * has moved to the independent event/tag contract.
 */
export async function isExpenseEventContext(
  actorUserId: string,
  groupId: string,
): Promise<boolean> {
  const parsedGroupId = eventId.safeParse(groupId)
  if (!parsedGroupId.success) return false
  const { data, error } = await getAdmin().rpc('expense_is_event_context', {
    p_actor_id: actorUserId,
    p_group_id: parsedGroupId.data,
  })
  if (error || typeof data !== 'boolean') throw new Error('event_classification_failed')
  return data
}
