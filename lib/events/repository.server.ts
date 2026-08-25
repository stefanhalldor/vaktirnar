import 'server-only'

import { z } from 'zod'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { expenseDetailHref } from '@/lib/expenses/flow'
import { EXPENSE_CURRENCIES } from '@/lib/expenses/input-money'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  EventAttendanceInvitationKind,
  EventAttendanceInvitationPreviewView,
  EventAttendeeDetailView,
  EventCommittedAttendanceInvitation,
  EventDashboardView,
  EventDetailView,
  EventDetailsView,
  EventExpenseActivityView,
  EventExpenseActivityV2View,
  EventExpenseActivityV3View,
  ExpenseEventLinkManagementView,
  ExpenseEventLinkManagementV2View,
  EventExpensePreviewCurrencyView,
  EventExpensePreviewView,
  EventExpenseSourceView,
  EventGuestAttendanceView,
  EventGuestSourceKind,
  EventSummary,
} from './contracts'
import type {
  CancelEventGuestAttendanceInvitationInput,
  CreateEventInput,
  InviteEventGuestAttendanceInput,
  LeaveEventAttendanceInput,
  ReplaceEventRosterInput,
  RespondEventGuestAttendanceInvitationInput,
  SaveEventDetailsInput,
} from './validation'

type JsonRecord = Record<string, unknown>

const DISALLOWED_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const eventId = z.string().uuid()
const safeName = z.string().trim().min(1).max(160)
  .refine((value) => !DISALLOWED_CONTROLS.test(value))
const safeGuestName = z.string().trim().min(1).max(120)
  .refine((value) => !DISALLOWED_CONTROLS.test(value))
const safeAttendeeGuestName = safeGuestName.refine((value) => !value.includes('@'))
const safeAttendeeDisplayName = safeName.refine((value) => !value.includes('@'))
const safeEmail = z.string().trim().email().max(320)
const createdAt = z.string().datetime({ offset: true })
const guestSourceKind = z.enum(['relationship', 'manual_name', 'manual_email'])
const attendanceStatus = z.enum([
  'not_invited',
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
  'left',
  'revoked',
])
const attendanceInvitationKind = z.enum(['access_only', 'identity_and_access'])
const attendanceDeliveryStatus = z.enum(['not_sent', 'reserved', 'sent', 'failed'])
const currencyCode = z.enum(EXPENSE_CURRENCIES)
const previewStatus = z.enum(['none_tagged', 'ready', 'unavailable'])
const expenseActivityStatus = z.enum(['none', 'ready', 'unavailable'])
const expenseActorPositionState = z.enum(['owes', 'owed', 'zero', 'pending'])
const expenseEventVisibility = z.enum(['participants_only', 'all_event'])
const safeExpenseTitle = z.string().trim().min(1).max(200)
  .refine((value) => !DISALLOWED_CONTROLS.test(value))
const eventDateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const eventTimeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/)
const eventMultilineValue = (max: number) => z.string().min(1).max(max)
  .refine((value) => !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))
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

function nullableInteger(row: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key]
    if (raw === null) return null
    const value = typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (Number.isSafeInteger(value)) return value
  }
  throw new Error('event_load_failed')
}

function exactKeys(row: JsonRecord, expected: readonly string[], fallback: string): void {
  const actual = Object.keys(row).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(fallback)
  }
}

function parseMaskedRecipientLabel(value: string): string {
  if (value.length < 8 || value.length > 320 || DISALLOWED_CONTROLS.test(value)) {
    throw new Error('event_load_failed')
  }
  const match = /^([^\s@*])\*{3}@([^\s@*]+)$/.exec(value)
  if (!match) throw new Error('event_load_failed')
  const labelProbe = `${match[1]}@${match[2]}`
  const canonicalProbe = normalizeEmailForAccess(labelProbe)
  if (canonicalProbe !== labelProbe || !safeEmail.safeParse(labelProbe).success) {
    throw new Error('event_load_failed')
  }
  return value
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

function parseAttendeeGuestName(value: string): string {
  const parsed = safeAttendeeGuestName.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseNullableAttendeeGuestName(value: string | null): string | null {
  return value === null ? null : parseAttendeeGuestName(value)
}

function parseAttendeeDisplayName(value: string): string {
  const parsed = safeAttendeeDisplayName.safeParse(value)
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
  if ((sourceKind === 'manual_email') !== (email !== null)) {
    throw new Error('event_load_failed')
  }
  return {
    id: parseEventId(requiredString(guest, 'event_guest_id', 'eventGuestId')),
    displayName: parseGuestName(requiredString(guest, 'display_name', 'displayName')),
    sourceKind,
    email,
    isTeskeidUser,
    attendance: undefined,
    position: requiredInteger(guest, 'position'),
  }
}

function mapGuestAttendance(row: JsonRecord): EventGuestAttendanceView {
  const rawInvitationId = nullableString(row, 'invitation_id')
  const statusResult = attendanceStatus.safeParse(requiredString(row, 'attendance_status'))
  const rawInvitationKind = nullableString(row, 'invitation_kind')
  const rawRecipientLabel = nullableString(row, 'recipient_label')
  const attemptNumber = nullableInteger(row, 'attempt_number')
  const rawDeliveryStatus = nullableString(row, 'delivery_status')
  const rawInvitedAt = nullableString(row, 'invited_at')
  const rawExpiresAt = nullableString(row, 'expires_at')
  const rawAcceptedAt = nullableString(row, 'accepted_at')
  if (!statusResult.success) throw new Error('event_load_failed')

  if (statusResult.data === 'not_invited') {
    if (
      rawInvitationId !== null
      || rawInvitationKind !== null
      || rawRecipientLabel !== null
      || attemptNumber !== null
      || rawDeliveryStatus !== null
      || rawInvitedAt !== null
      || rawExpiresAt !== null
      || rawAcceptedAt !== null
    ) throw new Error('event_load_failed')
    return {
      status: 'not_invited',
      invitationId: null,
      invitationKind: null,
      recipientLabel: null,
      attemptNumber: null,
      deliveryStatus: null,
      invitedAt: null,
      expiresAt: null,
      acceptedAt: null,
    }
  }

  const invitationKindResult = rawInvitationKind === null
    ? null
    : attendanceInvitationKind.safeParse(rawInvitationKind)
  if (
    rawInvitationId === null
    || invitationKindResult === null
    || !invitationKindResult.success
    || rawInvitedAt === null
  ) throw new Error('event_load_failed')

  const common = {
    invitationId: parseEventId(rawInvitationId),
    invitationKind: invitationKindResult.data,
    invitedAt: parseCreatedAt(rawInvitedAt),
  }
  if (statusResult.data === 'pending') {
    const deliveryStatusResult = rawDeliveryStatus === null
      ? null
      : attendanceDeliveryStatus.safeParse(rawDeliveryStatus)
    if (
      rawRecipientLabel === null
      || attemptNumber === null
      || attemptNumber < 0
      || deliveryStatusResult === null
      || !deliveryStatusResult.success
      || rawExpiresAt === null
      || rawAcceptedAt !== null
      || attemptNumber === 0 && deliveryStatusResult.data !== 'not_sent'
      || attemptNumber > 0 && deliveryStatusResult.data === 'not_sent'
    ) throw new Error('event_load_failed')
    return {
      status: 'pending',
      ...common,
      recipientLabel: parseMaskedRecipientLabel(rawRecipientLabel),
      attemptNumber,
      deliveryStatus: deliveryStatusResult.data,
      expiresAt: parseCreatedAt(rawExpiresAt),
      acceptedAt: null,
    }
  }

  if (
    rawRecipientLabel !== null
    || attemptNumber !== null
    || rawDeliveryStatus !== null
    || rawExpiresAt !== null
  ) throw new Error('event_load_failed')

  if (statusResult.data === 'accepted') {
    if (rawAcceptedAt === null) throw new Error('event_load_failed')
    return {
      status: 'accepted',
      ...common,
      recipientLabel: null,
      attemptNumber: null,
      deliveryStatus: null,
      expiresAt: null,
      acceptedAt: parseCreatedAt(rawAcceptedAt),
    }
  }
  if (rawAcceptedAt !== null) throw new Error('event_load_failed')
  return {
    status: statusResult.data,
    ...common,
    recipientLabel: null,
    attemptNumber: null,
    deliveryStatus: null,
    expiresAt: null,
    acceptedAt: null,
  }
}

function mergeGuestAttendanceState(
  detail: EventDetailView,
  value: unknown,
): EventDetailView {
  assertOwnerSafeProjection(value, true)
  const result = resultRecord(value)
  if (!result) throw new Error('event_load_failed')
  exactKeys(result, ['event_id', 'roster_revision', 'guests'], 'event_load_failed')
  if (
    parseEventId(requiredString(result, 'event_id')) !== detail.id
    || requiredInteger(result, 'roster_revision') !== detail.rosterRevision
    || !Array.isArray(result.guests)
    || result.guests.length !== detail.guests.length
  ) throw new Error('event_load_failed')
  const stateByGuestId = new Map<string, EventGuestAttendanceView>()
  for (const row of rows(result.guests)) {
    exactKeys(row, [
      'event_guest_id',
      'attendance_status',
      'invitation_id',
      'invitation_kind',
      'recipient_label',
      'delivery_status',
      'attempt_number',
      'invited_at',
      'expires_at',
      'accepted_at',
    ], 'event_load_failed')
    const guestId = parseEventId(requiredString(row, 'event_guest_id'))
    if (stateByGuestId.has(guestId)) throw new Error('event_load_failed')
    stateByGuestId.set(guestId, mapGuestAttendance(row))
  }
  if (stateByGuestId.size !== detail.guests.length) throw new Error('event_load_failed')

  return {
    ...detail,
    guests: detail.guests.map((guest) => {
      const state = stateByGuestId.get(guest.id)
      if (!state) throw new Error('event_load_failed')
      return { ...guest, attendance: state }
    }),
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

function mapMutationResult(value: unknown, fallback: string): {
  eventId: string
  rosterRevision: number
  invitations: EventCommittedAttendanceInvitation[]
} {
  const result = resultRecord(value)
  if (!result) throw new Error(fallback)
  exactKeys(result, ['event_id', 'roster_revision', 'invitations'], fallback)
  if (!Array.isArray(result.invitations) || result.invitations.length > 49) {
    throw new Error(fallback)
  }
  const invitations = rows(result.invitations).map((invitation) => {
    exactKeys(invitation, [
      'invitation_id',
      'event_guest_id',
      'invitation_kind',
      'recipient_label',
      'invited_at',
      'expires_at',
    ], fallback)
    const kind = attendanceInvitationKind.safeParse(requiredString(invitation, 'invitation_kind'))
    if (!kind.success) throw new Error(fallback)
    return {
      invitationId: parseEventId(requiredString(invitation, 'invitation_id')),
      eventGuestId: parseEventId(requiredString(invitation, 'event_guest_id')),
      invitationKind: kind.data,
      recipientLabel: parseMaskedRecipientLabel(requiredString(invitation, 'recipient_label')),
      invitedAt: parseCreatedAt(requiredString(invitation, 'invited_at')),
      expiresAt: parseCreatedAt(requiredString(invitation, 'expires_at')),
    }
  })
  if (
    invitations.length !== result.invitations.length
    || new Set(invitations.map((invitation) => invitation.invitationId)).size !== invitations.length
    || new Set(invitations.map((invitation) => invitation.eventGuestId)).size !== invitations.length
  ) throw new Error(fallback)
  return {
    eventId: parseEventId(requiredString(result, 'event_id', 'eventId')),
    rosterRevision: parseRosterRevision(result),
    invitations,
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
): Promise<{
  eventId: string
  rosterRevision: number
  invitations: EventCommittedAttendanceInvitation[]
}> {
  const { data, error } = await getAdmin().rpc('teskeid_event_create_with_details_and_attendance_invitations', {
    p_actor_id: actorUserId,
    p_request_id: input.request_id,
    p_name: input.name,
    p_guests: input.guests,
    p_event_date: input.event_date,
    p_event_time: input.event_time,
    p_description: input.description,
    p_agenda: input.agenda,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  return mapMutationResult(data, 'event_save_failed')
}

export async function getEventDetails(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventDetailsView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_details', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  const result = resultRecord(data)
  if (!result) return null
  exactKeys(result, [
    'event_id',
    'event_date',
    'event_time',
    'description',
    'agenda',
  ], 'event_load_failed')
  const parsedId = parseEventId(requiredString(result, 'event_id'))
  if (parsedId !== parsedEventId.data) throw new Error('event_load_failed')
  const rawDate = nullableString(result, 'event_date')
  const rawTime = nullableString(result, 'event_time')
  const rawDescription = nullableString(result, 'description')
  const rawAgenda = nullableString(result, 'agenda')
  const parsedDate = rawDate === null ? null : eventDateValue.safeParse(rawDate)
  const parsedTime = rawTime === null ? null : eventTimeValue.safeParse(rawTime)
  const parsedDescription = rawDescription === null ? null : eventMultilineValue(2000).safeParse(rawDescription)
  const parsedAgenda = rawAgenda === null ? null : eventMultilineValue(4000).safeParse(rawAgenda)
  if (
    (rawDate === null) !== (rawTime === null)
    || parsedDate !== null && !parsedDate.success
    || parsedTime !== null && !parsedTime.success
    || parsedDescription !== null && !parsedDescription.success
    || parsedAgenda !== null && !parsedAgenda.success
  ) throw new Error('event_load_failed')
  return {
    eventId: parsedId,
    eventDate: parsedDate?.data ?? null,
    eventTime: parsedTime?.data.slice(0, 5) ?? null,
    description: parsedDescription?.data ?? null,
    agenda: parsedAgenda?.data ?? null,
  }
}

export async function saveEventDetails(
  actorUserId: string,
  input: SaveEventDetailsInput,
): Promise<{ eventId: string }> {
  const { data, error } = await getAdmin().rpc('teskeid_event_save_details', {
    p_actor_id: actorUserId,
    p_event_id: input.event_id,
    p_request_id: input.request_id,
    p_event_date: input.event_date,
    p_event_time: input.event_time,
    p_description: input.description,
    p_agenda: input.agenda,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, ['event_id'], 'event_save_failed')
  const resultEventId = parseEventId(requiredString(result, 'event_id'))
  if (resultEventId !== input.event_id) throw new Error('event_save_failed')
  return { eventId: resultEventId }
}

export async function replaceEventRoster(
  actorUserId: string,
  input: ReplaceEventRosterInput,
): Promise<{
  eventId: string
  rosterRevision: number
  invitations: EventCommittedAttendanceInvitation[]
}> {
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_replace_roster_with_attendance_invitations',
    {
    p_actor_id: actorUserId,
    p_event_id: input.event_id,
    p_request_id: input.request_id,
    p_expected_roster_revision: input.expected_roster_revision,
    p_guests: input.guests,
    },
  )
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

function mapViewerSummary(
  candidate: unknown,
  expectedRole: 'owner' | 'attendee',
): EventDashboardView['owned'][number] {
  const row = record(candidate)
  if (!row) throw new Error('event_load_failed')
  exactKeys(row, [
    'event_id',
    'name',
    'active_guest_count',
    'roster_revision',
    'viewer_role',
    'created_at',
    'updated_at',
  ], 'event_load_failed')
  if (requiredString(row, 'viewer_role') !== expectedRole) throw new Error('event_load_failed')
  return { ...mapSummary(row), viewerRole: expectedRole }
}

function mapPendingInvitation(candidate: unknown): EventDashboardView['pending'][number] {
  const row = record(candidate)
  if (!row) throw new Error('event_load_failed')
  exactKeys(row, [
    'invitation_id',
    'event_id',
    'name',
    'guest_display_name',
    'inviter_display_name',
    'invitation_kind',
    'status',
    'expires_at',
    'invited_at',
  ], 'event_load_failed')
  const kind = attendanceInvitationKind.safeParse(requiredString(row, 'invitation_kind'))
  const rawInviter = nullableString(row, 'inviter_display_name')
  if (!kind.success || requiredString(row, 'status') !== 'pending') {
    throw new Error('event_load_failed')
  }
  return {
    invitationId: parseEventId(requiredString(row, 'invitation_id')),
    eventId: parseEventId(requiredString(row, 'event_id')),
    name: parseName(requiredString(row, 'name')),
    guestDisplayName: parseNullableAttendeeGuestName(nullableString(row, 'guest_display_name')),
    inviterDisplayName: rawInviter === null ? null : parseAttendeeDisplayName(rawInviter),
    invitationKind: kind.data,
    status: 'pending',
    expiresAt: parseCreatedAt(requiredString(row, 'expires_at')),
    invitedAt: parseCreatedAt(requiredString(row, 'invited_at')),
  }
}

export async function listEventDashboard(actorUserId: string): Promise<EventDashboardView> {
  const { data, error } = await getAdmin().rpc('teskeid_event_list_for_actor', {
    p_actor_id: actorUserId,
  })
  if (error) rpcFailure(error, 'event_load_failed')
  assertOwnerSafeProjection(data, true)
  const result = resultRecord(data)
  if (!result) throw new Error('event_load_failed')
  exactKeys(result, ['owned', 'pending', 'attending'], 'event_load_failed')
  if (
    !Array.isArray(result.owned)
    || !Array.isArray(result.pending)
    || !Array.isArray(result.attending)
    || result.owned.length > 100
    || result.pending.length > 100
    || result.attending.length > 100
  ) throw new Error('event_load_failed')
  const dashboard: EventDashboardView = {
    owned: result.owned.map((row) => mapViewerSummary(row, 'owner')),
    pending: result.pending.map(mapPendingInvitation),
    attending: result.attending.map((row) => mapViewerSummary(row, 'attendee')),
  }
  const visibleEventIds = [...dashboard.owned, ...dashboard.attending].map((event) => event.id)
  if (
    new Set(visibleEventIds).size !== visibleEventIds.length
    || new Set(dashboard.pending.map((invitation) => invitation.invitationId)).size
      !== dashboard.pending.length
  ) throw new Error('event_load_failed')
  return dashboard
}

export async function getEventAttendeeContext(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventAttendeeDetailView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_attendee_view', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  if (data === null || data === undefined || Array.isArray(data) && data.length === 0) return null
  assertOwnerSafeProjection(data, true)
  const result = resultRecord(data)
  if (!result) return null
  exactKeys(result, [
    'event_id',
    'name',
    'roster_revision',
    'viewer_role',
    'owner_display_name',
    'created_at',
    'updated_at',
    'guests',
  ], 'event_load_failed')
  if (
    requiredString(result, 'viewer_role') !== 'attendee'
    || !Array.isArray(result.guests)
    || result.guests.length > 49
  ) throw new Error('event_load_failed')
  const guests = rows(result.guests).map((guest) => {
    exactKeys(guest, [
      'event_guest_id',
      'display_name',
      'position',
      'is_self',
    ], 'event_load_failed')
    return {
      id: parseEventId(requiredString(guest, 'event_guest_id')),
      displayName: parseNullableAttendeeGuestName(nullableString(guest, 'display_name')),
      position: requiredInteger(guest, 'position'),
      isSelf: requiredBoolean(guest, 'is_self'),
    }
  }).sort((left, right) => left.position - right.position)
  if (
    guests.length !== result.guests.length
    || guests.some((guest, index) => guest.position !== index)
    || guests.filter((guest) => guest.isSelf).length !== 1
  ) throw new Error('event_load_failed')
  const rawOwnerDisplayName = nullableString(result, 'owner_display_name')
  const detail: EventAttendeeDetailView = {
    id: parseEventId(requiredString(result, 'event_id')),
    name: parseName(requiredString(result, 'name')),
    rosterRevision: parseRosterRevision(result),
    viewerRole: 'attendee',
    ownerDisplayName: rawOwnerDisplayName === null ? null : parseAttendeeDisplayName(rawOwnerDisplayName),
    createdAt: parseCreatedAt(requiredString(result, 'created_at')),
    updatedAt: parseCreatedAt(requiredString(result, 'updated_at')),
    guests,
  }
  if (detail.id !== parsedEventId.data) throw new Error('event_load_failed')
  return detail
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
  const { data: attendanceData, error: attendanceError } = await getAdmin().rpc(
    'teskeid_event_get_guest_attendance_state',
    {
      p_actor_id: actorUserId,
      p_event_id: parsedEventId.data,
    },
  )
  if (attendanceError) {
    const message = `${attendanceError.message ?? ''} ${attendanceError.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(attendanceError, 'event_load_failed')
  }
  return mergeGuestAttendanceState(detail, attendanceData)
}

function mapExpenseSourceGuest(candidate: unknown) {
  const guest = record(candidate)
  if (!guest) throw new Error('event_load_failed')
  const position = requiredInteger(guest, 'position')
  if (position < 0 || position > 48) throw new Error('event_load_failed')
  const rawParticipantKind = guest.participant_kind ?? guest.participantKind
  const participantKind = rawParticipantKind === undefined
    ? 'guest'
    : rawParticipantKind === 'guest' || rawParticipantKind === 'organizer'
      ? rawParticipantKind
      : null
  if (participantKind === null) throw new Error('event_load_failed')
  return {
    id: parseEventId(requiredString(guest, 'event_guest_id', 'eventGuestId')),
    displayName: parseGuestName(requiredString(guest, 'display_name', 'displayName')),
    sourceKind: parseSourceKind(requiredString(guest, 'source_kind', 'sourceKind')),
    participantKind,
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
  const rawViewerRole = source.viewer_role ?? source.viewerRole
  const viewerRole = rawViewerRole === undefined
    ? undefined
    : rawViewerRole === 'owner' || rawViewerRole === 'attendee'
      ? rawViewerRole
      : null
  if (viewerRole === null) throw new Error('event_load_failed')
  return {
    id: parseEventId(requiredString(source, 'event_id', 'eventId')),
    name: parseName(requiredString(source, 'name')),
    rosterRevision: parseRosterRevision(source),
    ...(viewerRole ? { viewerRole } : {}),
    guests: guestsWithPosition.map((guest) => ({
      id: guest.id,
      displayName: guest.displayName,
      sourceKind: guest.sourceKind,
      ...(guest.participantKind === 'organizer' ? { participantKind: 'organizer' as const } : {}),
    })),
  }
}

export async function getExpenseLinkedEventId(
  actorUserId: string,
  requestedExpenseId: string,
): Promise<string | null> {
  const parsedExpenseId = eventId.safeParse(requestedExpenseId)
  if (!parsedExpenseId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_event_link', {
    p_actor_id: actorUserId,
    p_expense_id: parsedExpenseId.data,
  })
  if (error) rpcFailure(error, 'event_load_failed')
  if (data === null) return null
  const result = resultRecord(data)
  if (!result) throw new Error('event_load_failed')
  exactKeys(result, ['event_id'], 'event_load_failed')
  return parseEventId(requiredString(result, 'event_id'))
}

export async function getExpenseEventLinkManagement(
  actorUserId: string,
  requestedExpenseId: string,
): Promise<ExpenseEventLinkManagementView | null> {
  const parsedExpenseId = eventId.safeParse(requestedExpenseId)
  if (!parsedExpenseId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_link_management', {
    p_actor_id: actorUserId,
    p_expense_id: parsedExpenseId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  const result = resultRecord(data)
  if (!result) return null
  exactKeys(result, ['current_event', 'events'], 'event_load_failed')
  if (!Array.isArray(result.events) || result.events.length > 100) {
    throw new Error('event_load_failed')
  }
  const current = result.current_event === null ? null : record(result.current_event)
  if (result.current_event !== null && !current) throw new Error('event_load_failed')
  const currentEvent = current ? (() => {
    exactKeys(current, ['event_id', 'name', 'can_open'], 'event_load_failed')
    const canOpen = requiredBoolean(current, 'can_open', 'canOpen')
    const rawName = nullableString(current, 'name')
    if (canOpen !== (rawName !== null)) throw new Error('event_load_failed')
    return {
      id: parseEventId(requiredString(current, 'event_id')),
      name: rawName === null ? null : parseName(rawName),
      canOpen,
    }
  })() : null
  const eligibleEvents = result.events.map((candidate) => {
    const event = record(candidate)
    if (!event) throw new Error('event_load_failed')
    exactKeys(event, ['event_id', 'name', 'roster_revision', 'viewer_role'], 'event_load_failed')
    const rawViewerRole = requiredString(event, 'viewer_role')
    if (rawViewerRole !== 'owner' && rawViewerRole !== 'attendee') throw new Error('event_load_failed')
    const viewerRole: 'owner' | 'attendee' = rawViewerRole
    return {
      id: parseEventId(requiredString(event, 'event_id')),
      name: parseName(requiredString(event, 'name')),
      rosterRevision: parseRosterRevision(event),
      viewerRole,
    }
  })
  if (currentEvent && eligibleEvents.length > 0) throw new Error('event_load_failed')
  if (new Set(eligibleEvents.map((event) => event.id)).size !== eligibleEvents.length) {
    throw new Error('event_load_failed')
  }
  return { currentEvent, eligibleEvents }
}

export async function getExpenseEventLinkManagementV2(
  actorUserId: string,
  requestedExpenseId: string,
): Promise<ExpenseEventLinkManagementV2View | null> {
  const parsedExpenseId = eventId.safeParse(requestedExpenseId)
  if (!parsedExpenseId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_link_management_v2', {
    p_actor_id: actorUserId,
    p_expense_id: parsedExpenseId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  assertOwnerSafeProjection(data, true)
  const result = resultRecord(data)
  if (!result) return null
  exactKeys(result, ['current_event', 'events'], 'event_load_failed')
  if (!Array.isArray(result.events) || result.events.length > 100) {
    throw new Error('event_load_failed')
  }
  const current = result.current_event === null ? null : record(result.current_event)
  if (result.current_event !== null && !current) throw new Error('event_load_failed')
  const currentEvent = current ? (() => {
    exactKeys(
      current,
      ['event_id', 'name', 'can_open', 'visibility', 'link_revision'],
      'event_load_failed',
    )
    const canOpen = requiredBoolean(current, 'can_open')
    const rawName = nullableString(current, 'name')
    const visibility = expenseEventVisibility.safeParse(requiredString(current, 'visibility'))
    const linkRevision = requiredInteger(current, 'link_revision')
    if (
      canOpen !== (rawName !== null)
      || !visibility.success
      || linkRevision < 1
    ) throw new Error('event_load_failed')
    return {
      id: parseEventId(requiredString(current, 'event_id')),
      name: rawName === null ? null : parseName(rawName),
      canOpen,
      visibility: visibility.data,
      linkRevision,
    }
  })() : null
  const eligibleEvents = result.events.map((candidate) => {
    const event = record(candidate)
    if (!event) throw new Error('event_load_failed')
    exactKeys(event, ['event_id', 'name', 'roster_revision', 'viewer_role'], 'event_load_failed')
    const rawViewerRole = requiredString(event, 'viewer_role')
    if (rawViewerRole !== 'owner' && rawViewerRole !== 'attendee') {
      throw new Error('event_load_failed')
    }
    const viewerRole: 'owner' | 'attendee' = rawViewerRole
    return {
      id: parseEventId(requiredString(event, 'event_id')),
      name: parseName(requiredString(event, 'name')),
      rosterRevision: parseRosterRevision(event),
      viewerRole,
    }
  })
  if (currentEvent && eligibleEvents.length > 0) throw new Error('event_load_failed')
  if (new Set(eligibleEvents.map((event) => event.id)).size !== eligibleEvents.length) {
    throw new Error('event_load_failed')
  }
  return { currentEvent, eligibleEvents }
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
    displayName: parseNullableAttendeeGuestName(nullableString(party, 'display_name')),
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

function mapEventExpenseActivity(value: unknown): EventExpenseActivityView {
  assertOwnerSafeProjection(value, true)
  const result = resultRecord(value)
  if (!result) throw new Error('event_expense_activity_failed')
  exactKeys(result, ['status', 'expenses', 'positions'], 'event_expense_activity_failed')
  const parsedStatus = expenseActivityStatus.safeParse(requiredString(result, 'status'))
  if (!parsedStatus.success || !Array.isArray(result.expenses) || !Array.isArray(result.positions)) {
    throw new Error('event_expense_activity_failed')
  }
  if (result.expenses.length > 100 || result.positions.length > 100) {
    throw new Error('event_expense_activity_failed')
  }
  const expenses = result.expenses.map((candidate) => {
    const expense = record(candidate)
    if (!expense) throw new Error('event_expense_activity_failed')
    exactKeys(
      expense,
      ['title', 'description', 'total_minor', 'currency', 'payers'],
      'event_expense_activity_failed',
    )
    const parsedTitle = safeExpenseTitle.safeParse(requiredString(expense, 'title'))
    const rawDescription = nullableString(expense, 'description')
    const parsedDescription = rawDescription === null
      ? { success: true as const, data: null }
      : eventMultilineValue(1000).safeParse(rawDescription)
    const parsedCurrency = currencyCode.safeParse(requiredString(expense, 'currency'))
    const totalMinor = requiredInteger(expense, 'total_minor', 'totalMinor')
    if (
      !parsedTitle.success || !parsedDescription.success || !parsedCurrency.success
      || totalMinor < 1 || !Array.isArray(expense.payers)
      || expense.payers.length < 1 || expense.payers.length > 50
    ) throw new Error('event_expense_activity_failed')
    const payers = expense.payers.map((candidatePayer) => {
      const payer = record(candidatePayer)
      if (!payer) throw new Error('event_expense_activity_failed')
      exactKeys(payer, ['display_name', 'amount_minor'], 'event_expense_activity_failed')
      const amountMinor = requiredInteger(payer, 'amount_minor', 'amountMinor')
      if (amountMinor < 1) throw new Error('event_expense_activity_failed')
      return {
        displayName: parseNullableAttendeeGuestName(nullableString(payer, 'display_name')),
        amountMinor,
      }
    })
    let payerTotal = 0
    for (const payer of payers) {
      payerTotal += payer.amountMinor
      if (!Number.isSafeInteger(payerTotal)) throw new Error('event_expense_activity_failed')
    }
    if (payerTotal !== totalMinor) {
      throw new Error('event_expense_activity_failed')
    }
    return {
      title: parsedTitle.data,
      description: parsedDescription.data,
      totalMinor,
      currency: parsedCurrency.data,
      payers,
    }
  })
  const positions = result.positions.map((candidate) => {
    const position = record(candidate)
    if (!position) throw new Error('event_expense_activity_failed')
    exactKeys(position, ['currency', 'state', 'amount_minor'], 'event_expense_activity_failed')
    const parsedCurrency = currencyCode.safeParse(requiredString(position, 'currency'))
    const parsedState = expenseActorPositionState.safeParse(requiredString(position, 'state'))
    const amountMinor = requiredInteger(position, 'amount_minor', 'amountMinor')
    if (
      !parsedCurrency.success || !parsedState.success || amountMinor < 0
      || ((parsedState.data === 'zero' || parsedState.data === 'pending') && amountMinor !== 0)
      || ((parsedState.data === 'owes' || parsedState.data === 'owed') && amountMinor < 1)
    ) throw new Error('event_expense_activity_failed')
    return { currency: parsedCurrency.data, state: parsedState.data, amountMinor }
  })
  const expenseCurrencies = [...new Set(expenses.map((expense) => expense.currency))].sort()
  const positionCurrencies = positions.map((position) => position.currency)
  if (
    new Set(positionCurrencies).size !== positionCurrencies.length
    || JSON.stringify([...positionCurrencies].sort()) !== JSON.stringify(expenseCurrencies)
    || parsedStatus.data === 'ready' && expenses.length === 0
    || parsedStatus.data !== 'ready' && (expenses.length !== 0 || positions.length !== 0)
  ) throw new Error('event_expense_activity_failed')
  return { status: parsedStatus.data, expenses, positions }
}

export async function getEventExpenseActivity(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventExpenseActivityView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_activity', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    throw new Error('event_expense_activity_failed')
  }
  return mapEventExpenseActivity(data)
}

function mapEventExpenseActivityV2(value: unknown): EventExpenseActivityV2View {
  assertOwnerSafeProjection(value, true)
  const result = resultRecord(value)
  if (!result) throw new Error('event_expense_activity_failed')
  exactKeys(result, ['status', 'expenses', 'positions'], 'event_expense_activity_failed')
  const parsedStatus = expenseActivityStatus.safeParse(requiredString(result, 'status'))
  if (!parsedStatus.success || !Array.isArray(result.expenses) || !Array.isArray(result.positions)) {
    throw new Error('event_expense_activity_failed')
  }
  if (result.expenses.length > 100 || result.positions.length > 100) {
    throw new Error('event_expense_activity_failed')
  }
  const expenses = result.expenses.map((candidate) => {
    const expense = record(candidate)
    if (!expense) throw new Error('event_expense_activity_failed')
    exactKeys(expense, ['title', 'total_minor', 'currency'], 'event_expense_activity_failed')
    const parsedTitle = safeExpenseTitle.safeParse(requiredString(expense, 'title'))
    const parsedCurrency = currencyCode.safeParse(requiredString(expense, 'currency'))
    const totalMinor = requiredInteger(expense, 'total_minor')
    if (!parsedTitle.success || !parsedCurrency.success || totalMinor < 1) {
      throw new Error('event_expense_activity_failed')
    }
    return {
      title: parsedTitle.data,
      totalMinor,
      currency: parsedCurrency.data,
    }
  })
  const positions = result.positions.map((candidate) => {
    const position = record(candidate)
    if (!position) throw new Error('event_expense_activity_failed')
    exactKeys(position, ['currency', 'state', 'amount_minor'], 'event_expense_activity_failed')
    const parsedCurrency = currencyCode.safeParse(requiredString(position, 'currency'))
    const parsedState = expenseActorPositionState.safeParse(requiredString(position, 'state'))
    const amountMinor = requiredInteger(position, 'amount_minor')
    if (
      !parsedCurrency.success || !parsedState.success || amountMinor < 0
      || ((parsedState.data === 'zero' || parsedState.data === 'pending') && amountMinor !== 0)
      || ((parsedState.data === 'owes' || parsedState.data === 'owed') && amountMinor < 1)
    ) throw new Error('event_expense_activity_failed')
    return { currency: parsedCurrency.data, state: parsedState.data, amountMinor }
  })
  const visibleCurrencies = new Set(expenses.map((expense) => expense.currency))
  const positionCurrencies = positions.map((position) => position.currency)
  if (
    new Set(positionCurrencies).size !== positionCurrencies.length
    || positionCurrencies.some((currency) => !visibleCurrencies.has(currency))
    || parsedStatus.data === 'ready' && expenses.length === 0
    || parsedStatus.data !== 'ready' && (expenses.length !== 0 || positions.length !== 0)
  ) throw new Error('event_expense_activity_failed')
  return { contractVersion: 2, status: parsedStatus.data, expenses, positions }
}

export async function getEventExpenseActivityV2(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventExpenseActivityV2View | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_activity_v2', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    throw new Error('event_expense_activity_failed')
  }
  return mapEventExpenseActivityV2(data)
}

function mapEventExpenseActivityV3(value: unknown): EventExpenseActivityV3View {
  assertOwnerSafeProjection(value, true)
  const result = record(value)
  if (!result) throw new Error('event_expense_activity_failed')
  exactKeys(result, ['status', 'expenses', 'positions'], 'event_expense_activity_failed')
  const parsedStatus = expenseActivityStatus.safeParse(requiredString(result, 'status'))
  if (!parsedStatus.success || !Array.isArray(result.expenses) || !Array.isArray(result.positions)) {
    throw new Error('event_expense_activity_failed')
  }
  if (result.expenses.length > 100 || result.positions.length > 100) {
    throw new Error('event_expense_activity_failed')
  }
  const expenses = result.expenses.map((candidate) => {
    const expense = record(candidate)
    if (!expense) throw new Error('event_expense_activity_failed')
    exactKeys(
      expense,
      ['title', 'total_minor', 'currency', 'detail_target'],
      'event_expense_activity_failed',
    )
    const parsedTitle = safeExpenseTitle.safeParse(requiredString(expense, 'title'))
    const parsedCurrency = currencyCode.safeParse(requiredString(expense, 'currency'))
    const totalMinor = requiredInteger(expense, 'total_minor')
    let detailHref: string | null = null
    if (expense.detail_target !== null) {
      const target = record(expense.detail_target)
      if (!target) throw new Error('event_expense_activity_failed')
      exactKeys(target, ['expense_id'], 'event_expense_activity_failed')
      const parsedExpenseId = eventId.safeParse(target.expense_id)
      if (!parsedExpenseId.success) throw new Error('event_expense_activity_failed')
      detailHref = expenseDetailHref(parsedExpenseId.data)
    }
    if (!parsedTitle.success || !parsedCurrency.success || totalMinor < 1) {
      throw new Error('event_expense_activity_failed')
    }
    return {
      title: parsedTitle.data,
      totalMinor,
      currency: parsedCurrency.data,
      detailHref,
    }
  })
  const positions = result.positions.map((candidate) => {
    const position = record(candidate)
    if (!position) throw new Error('event_expense_activity_failed')
    exactKeys(position, ['currency', 'state', 'amount_minor'], 'event_expense_activity_failed')
    const parsedCurrency = currencyCode.safeParse(requiredString(position, 'currency'))
    const parsedState = expenseActorPositionState.safeParse(requiredString(position, 'state'))
    const amountMinor = requiredInteger(position, 'amount_minor')
    if (
      !parsedCurrency.success || !parsedState.success || amountMinor < 0
      || ((parsedState.data === 'zero' || parsedState.data === 'pending') && amountMinor !== 0)
      || ((parsedState.data === 'owes' || parsedState.data === 'owed') && amountMinor < 1)
    ) throw new Error('event_expense_activity_failed')
    return { currency: parsedCurrency.data, state: parsedState.data, amountMinor }
  })
  const visibleCurrencies = new Set(expenses.map((expense) => expense.currency))
  const positionCurrencies = positions.map((position) => position.currency)
  if (
    new Set(positionCurrencies).size !== positionCurrencies.length
    || positionCurrencies.some((currency) => !visibleCurrencies.has(currency))
    || parsedStatus.data === 'ready' && expenses.length === 0
    || parsedStatus.data !== 'ready' && (expenses.length !== 0 || positions.length !== 0)
  ) throw new Error('event_expense_activity_failed')
  return { contractVersion: 3, status: parsedStatus.data, expenses, positions }
}

export async function getEventExpenseActivityV3(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventExpenseActivityV3View | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_activity_v3', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    throw new Error('event_expense_activity_failed')
  }
  return mapEventExpenseActivityV3(data)
}

export async function getExpensePayAllEventLabels(
  actorUserId: string,
  requestedGroupIds: readonly string[],
): Promise<Map<string, string>> {
  if (requestedGroupIds.length === 0) return new Map()
  if (requestedGroupIds.length > 100) throw new Error('event_label_load_failed')
  const parsedGroupIds: string[] = []
  for (const groupId of requestedGroupIds) {
    const parsed = eventId.safeParse(groupId)
    if (!parsed.success) throw new Error('event_label_load_failed')
    parsedGroupIds.push(parsed.data)
  }
  const { data, error } = await getAdmin().rpc('teskeid_event_get_expense_context_labels', {
    p_actor_id: actorUserId,
    p_group_ids: parsedGroupIds,
  })
  if (error) throw new Error('event_label_load_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_label_load_failed')
  exactKeys(result, ['labels'], 'event_label_load_failed')
  if (!Array.isArray(result.labels) || result.labels.length > 100) {
    throw new Error('event_label_load_failed')
  }
  const allowedGroupIds = new Set(requestedGroupIds)
  const labels = new Map<string, string>()
  for (const candidate of result.labels) {
    const label = record(candidate)
    if (!label) throw new Error('event_label_load_failed')
    exactKeys(label, ['group_id', 'event_name'], 'event_label_load_failed')
    const groupId = eventId.safeParse(requiredString(label, 'group_id'))
    const eventName = safeName.safeParse(requiredString(label, 'event_name'))
    if (!groupId.success || !eventName.success || !allowedGroupIds.has(groupId.data)) {
      throw new Error('event_label_load_failed')
    }
    if (labels.has(groupId.data)) throw new Error('event_label_load_failed')
    labels.set(groupId.data, eventName.data)
  }
  return labels
}

export interface EventGuestAttendanceInviteResult extends EventCommittedAttendanceInvitation {
  status: 'pending'
  rosterRevision: number
  attemptNumber: 0
  deliveryStatus: 'not_sent'
}

export interface EventGuestAttendanceCancelResult {
  invitationId: string
  eventGuestId: string
  rosterRevision: number
}

export interface EventGuestAttendanceDeliveryPreparation {
  invitationId: string
  eventId: string
  eventGuestId: string
  recipientEmail: string
}

export type EventGuestAttendanceDeliveryReservation =
  | {
      canSend: false
      reason: 'not_found' | 'not_pending' | 'expired' | 'already_sent' | 'already_failed' | 'cooldown' | 'max_sends' | 'rate_limited' | 'key_expired'
      attemptNumber: number
    }
  | {
      canSend: true
      reason: 'ok'
      attemptNumber: number
      recipientEmail: string
      templateVersion: 'event-attendance-v1'
      eventName: string
      guestDisplayName: string | null
      inviterDisplayName: string | null
      invitationKind: EventAttendanceInvitationKind
    }

export async function inviteEventGuestAttendance(
  actorUserId: string,
  input: InviteEventGuestAttendanceInput,
): Promise<EventGuestAttendanceInviteResult> {
  const { data, error } = await getAdmin().rpc('teskeid_event_invite_guest_attendance', {
    p_actor_id: actorUserId,
    p_event_id: input.event_id,
    p_event_guest_id: input.event_guest_id,
    p_expected_roster_revision: input.expected_roster_revision,
    p_request_id: input.request_id,
    p_recipient_email: input.recipient_email,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, [
    'status',
    'invitation_id',
    'event_guest_id',
    'invitation_kind',
    'roster_revision',
    'recipient_label',
    'attempt_number',
    'delivery_status',
    'invited_at',
    'expires_at',
  ], 'event_save_failed')
  const kind = attendanceInvitationKind.safeParse(requiredString(result, 'invitation_kind'))
  if (
    requiredString(result, 'status') !== 'pending'
    || requiredInteger(result, 'attempt_number') !== 0
    || requiredString(result, 'delivery_status') !== 'not_sent'
    || !kind.success
  ) throw new Error('event_save_failed')
  const invitationId = parseEventId(requiredString(result, 'invitation_id'))
  const eventGuestId = parseEventId(requiredString(result, 'event_guest_id'))
  const rosterRevision = requiredInteger(result, 'roster_revision')
  if (
    eventGuestId !== input.event_guest_id
    || rosterRevision !== input.expected_roster_revision
  ) throw new Error('event_save_failed')
  return {
    invitationId,
    eventGuestId,
    invitationKind: kind.data,
    status: 'pending',
    rosterRevision,
    recipientLabel: parseMaskedRecipientLabel(requiredString(result, 'recipient_label')),
    attemptNumber: 0,
    deliveryStatus: 'not_sent',
    invitedAt: parseCreatedAt(requiredString(result, 'invited_at')),
    expiresAt: parseCreatedAt(requiredString(result, 'expires_at')),
  }
}

export async function cancelEventGuestAttendanceInvitation(
  actorUserId: string,
  input: CancelEventGuestAttendanceInvitationInput,
): Promise<EventGuestAttendanceCancelResult> {
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_cancel_guest_attendance_invitation',
    {
      p_actor_id: actorUserId,
      p_event_id: input.event_id,
      p_event_guest_id: input.event_guest_id,
      p_invitation_id: input.invitation_id,
      p_expected_roster_revision: input.expected_roster_revision,
      p_request_id: input.request_id,
    },
  )
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, [
    'status',
    'invitation_id',
    'event_guest_id',
    'roster_revision',
  ], 'event_save_failed')
  if (requiredString(result, 'status') !== 'cancelled') throw new Error('event_save_failed')
  const mapped = {
    invitationId: parseEventId(requiredString(result, 'invitation_id')),
    eventGuestId: parseEventId(requiredString(result, 'event_guest_id')),
    rosterRevision: requiredInteger(result, 'roster_revision'),
  }
  if (
    mapped.invitationId !== input.invitation_id
    || mapped.eventGuestId !== input.event_guest_id
    || mapped.rosterRevision !== input.expected_roster_revision
  ) throw new Error('event_save_failed')
  return mapped
}

const deliveryReasons = new Set([
  'ok',
  'not_found',
  'not_pending',
  'expired',
  'already_sent',
  'already_failed',
  'cooldown',
  'max_sends',
  'rate_limited',
  'key_expired',
])

export async function prepareEventGuestAttendanceDelivery(
  actorUserId: string,
  requestedInvitationId: string,
): Promise<EventGuestAttendanceDeliveryPreparation> {
  const invitationId = parseEventId(requestedInvitationId)
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_prepare_guest_attendance_delivery',
    { p_actor_id: actorUserId, p_invitation_id: invitationId },
  )
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, [
    'invitation_id',
    'event_id',
    'event_guest_id',
    'recipient_email',
  ], 'event_save_failed')
  const recipientEmail = requiredString(result, 'recipient_email')
  const canonicalEmail = normalizeEmailForAccess(recipientEmail)
  const mapped = {
    invitationId: parseEventId(requiredString(result, 'invitation_id')),
    eventId: parseEventId(requiredString(result, 'event_id')),
    eventGuestId: parseEventId(requiredString(result, 'event_guest_id')),
    recipientEmail,
  }
  if (mapped.invitationId !== invitationId || canonicalEmail !== recipientEmail) {
    throw new Error('event_save_failed')
  }
  return mapped
}

export async function reserveEventGuestAttendanceDelivery(
  actorUserId: string,
  invitationId: string,
  deliveryRequestId: string,
  security: {
    recipientHash: string
    actorRecipientRateHash: string
    actorTotalRateHash: string
  },
  windowDate: string,
): Promise<EventGuestAttendanceDeliveryReservation> {
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_reserve_guest_attendance_delivery',
    {
      p_actor_id: actorUserId,
      p_invitation_id: invitationId,
      p_delivery_request_id: deliveryRequestId,
      p_recipient_hash: security.recipientHash,
      p_actor_recipient_rate_hash: security.actorRecipientRateHash,
      p_actor_total_rate_hash: security.actorTotalRateHash,
      p_rate_limit_window_date: windowDate,
    },
  )
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, [
    'attempt_number',
    'can_send',
    'reason',
    'recipient_email',
    'email_template_version',
    'event_name',
    'guest_display_name',
    'inviter_display_name',
    'invitation_kind',
  ], 'event_save_failed')
  const canSend = requiredBoolean(result, 'can_send')
  const reason = requiredString(result, 'reason')
  const attemptNumber = requiredInteger(result, 'attempt_number')
  if (!deliveryReasons.has(reason)) throw new Error('event_save_failed')
  if (!canSend) {
    if (
      reason === 'ok'
      || nullableString(result, 'recipient_email') !== null
      || nullableString(result, 'email_template_version') !== null
      || nullableString(result, 'event_name') !== null
      || nullableString(result, 'guest_display_name') !== null
      || nullableString(result, 'inviter_display_name') !== null
      || nullableString(result, 'invitation_kind') !== null
      || attemptNumber < 0
      || attemptNumber > 3
      || (reason === 'already_sent' || reason === 'already_failed') && attemptNumber < 1
    ) throw new Error('event_save_failed')
    return {
      canSend: false,
      reason: reason as Exclude<EventGuestAttendanceDeliveryReservation, { canSend: true }>['reason'],
      attemptNumber,
    }
  }
  const recipientEmail = requiredString(result, 'recipient_email')
  const canonicalEmail = normalizeEmailForAccess(recipientEmail)
  const kind = attendanceInvitationKind.safeParse(requiredString(result, 'invitation_kind'))
  if (
    reason !== 'ok'
    || attemptNumber < 1
    || attemptNumber > 3
    || canonicalEmail === null
    || canonicalEmail !== recipientEmail
    || requiredString(result, 'email_template_version') !== 'event-attendance-v1'
    || !kind.success
  ) throw new Error('event_save_failed')
  const rawInviterDisplayName = nullableString(result, 'inviter_display_name')
  return {
    canSend: true,
    reason: 'ok',
    attemptNumber,
    recipientEmail,
    templateVersion: 'event-attendance-v1',
    eventName: parseName(requiredString(result, 'event_name')),
    guestDisplayName: parseNullableAttendeeGuestName(nullableString(result, 'guest_display_name')),
    inviterDisplayName: rawInviterDisplayName === null
      ? null
      : parseAttendeeDisplayName(rawInviterDisplayName),
    invitationKind: kind.data,
  }
}

export async function updateEventGuestAttendanceDelivery(
  actorUserId: string,
  invitationId: string,
  attemptNumber: number,
  status: 'sent' | 'failed',
): Promise<'ok' | 'not_found' | 'stale_attempt' | 'invalid_attempt' | 'invalid_status'> {
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_update_guest_attendance_delivery',
    {
      p_actor_id: actorUserId,
      p_invitation_id: invitationId,
      p_attempt_number: attemptNumber,
      p_status: status,
    },
  )
  if (error) rpcFailure(error, 'event_save_failed')
  if (
    data !== 'ok'
    && data !== 'not_found'
    && data !== 'stale_attempt'
    && data !== 'invalid_attempt'
    && data !== 'invalid_status'
  ) throw new Error('event_save_failed')
  return data
}

export async function getEventGuestAttendancePreview(
  actorUserId: string,
  requestedInvitationId: string,
): Promise<EventAttendanceInvitationPreviewView | null> {
  const parsedInvitationId = eventId.safeParse(requestedInvitationId)
  if (!parsedInvitationId.success) return null
  const { data, error } = await getAdmin().rpc(
    'teskeid_event_get_guest_attendance_preview',
    {
      p_actor_id: actorUserId,
      p_invitation_id: parsedInvitationId.data,
    },
  )
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  if (data === null || data === undefined || Array.isArray(data) && data.length === 0) return null
  assertOwnerSafeProjection(data, true)
  if (Array.isArray(data) && data.length !== 1) throw new Error('event_load_failed')
  const result = resultRecord(data)
  if (!result) return null
  exactKeys(result, [
    'invitation_id',
    'event_id',
    'event_name',
    'guest_display_name',
    'inviter_display_name',
    'invitation_kind',
    'status',
    'roster',
    'expires_at',
    'invited_at',
  ], 'event_load_failed')
  const invitationId = parseEventId(requiredString(result, 'invitation_id'))
  const kind = attendanceInvitationKind.safeParse(requiredString(result, 'invitation_kind'))
  const status = requiredString(result, 'status')
  if (
    invitationId !== parsedInvitationId.data
    || status !== 'pending' && status !== 'accepted'
    || !kind.success
  ) throw new Error('event_load_failed')
  const rawInviterDisplayName = nullableString(result, 'inviter_display_name')
  const base = {
    invitationId,
    eventId: parseEventId(requiredString(result, 'event_id')),
    eventName: parseName(requiredString(result, 'event_name')),
    guestDisplayName: parseNullableAttendeeGuestName(nullableString(result, 'guest_display_name')),
    inviterDisplayName: rawInviterDisplayName === null
      ? null
      : parseAttendeeDisplayName(rawInviterDisplayName),
    invitationKind: kind.data,
    invitedAt: parseCreatedAt(requiredString(result, 'invited_at')),
  }
  if (!Array.isArray(result.roster) || result.roster.length !== 0) {
    throw new Error('event_load_failed')
  }
  if (status === 'accepted') {
    if (nullableString(result, 'expires_at') !== null) throw new Error('event_load_failed')
    return { ...base, status: 'accepted', roster: [], expiresAt: null }
  }
  return {
    ...base,
    status: 'pending',
    roster: [],
    expiresAt: parseCreatedAt(requiredString(result, 'expires_at')),
  }
}

export async function respondEventGuestAttendanceInvitation(
  actorUserId: string,
  input: RespondEventGuestAttendanceInvitationInput,
): Promise<'accepted' | 'declined' | 'expired'> {
  const { data, error } = await getAdmin().rpc('teskeid_event_respond_guest_attendance', {
    p_actor_id: actorUserId,
    p_invitation_id: input.invitation_id,
    p_action: input.action,
    p_request_id: input.request_id,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, ['status'], 'event_save_failed')
  const status = requiredString(result, 'status')
  if (status !== 'accepted' && status !== 'declined' && status !== 'expired') {
    throw new Error('event_save_failed')
  }
  if (
    status !== 'expired'
    && (input.action === 'accept' ? status !== 'accepted' : status !== 'declined')
  ) throw new Error('event_save_failed')
  return status
}

export async function leaveEventAttendance(
  actorUserId: string,
  input: LeaveEventAttendanceInput,
): Promise<'left'> {
  const { data, error } = await getAdmin().rpc('teskeid_event_leave_attendance', {
    p_actor_id: actorUserId,
    p_event_id: input.event_id,
    p_request_id: input.request_id,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  exactKeys(result, ['status'], 'event_save_failed')
  if (requiredString(result, 'status') !== 'left') throw new Error('event_save_failed')
  return 'left'
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
