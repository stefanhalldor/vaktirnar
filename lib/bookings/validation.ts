import { z } from 'zod'
import {
  BOOKING_MEMBER_ROLES,
  BOOKING_SERVICE_STATES,
} from './contracts'

const uuid = z.string().uuid().transform((value) => value.toLowerCase())
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max)
const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()])
  .transform((value) => value || null)
const email = z.string().trim().email().max(254)

export const businessProfileSlugSchema = z.string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const bookingPublicIdSchema = uuid

export const bookingCapabilitySchema = z.string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/)

export const createBookingRequestSchema = z.object({
  businessProfileSlug: businessProfileSlugSchema,
  requestId: uuid,
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  contactName: boundedText(1, 120),
  contactEmail: email,
  contactPhone: boundedText(1, 40),
  message: boundedText(1, 1_000),
  website: z.string().max(0).optional().default(''),
}).strict()

export const exchangeBookingCapabilitySchema = z.object({
  capability: bookingCapabilitySchema,
}).strict()

export const bookingMessageSchema = z.object({
  body: boundedText(1, 1_000),
  clientMessageId: uuid,
  idempotencyKey: uuid,
}).strict()

export const bookingMessageListQuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  beforeId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine((value) => Boolean(value.before) === Boolean(value.beforeId), {
  message: 'cursor_pair_required',
})

export const bookingActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancel'),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: uuid,
  }).strict(),
  z.object({
    action: z.literal('claim'),
    expectedAccessVersion: z.number().int().positive(),
    // The claimant becomes the first owner, leaving nine additional member
    // slots under the canonical ten-member booking cap.
    additionalEmails: z.array(email).max(9),
    idempotencyKey: uuid,
  }).strict(),
  z.object({
    action: z.literal('addMember'),
    expectedAccessVersion: z.number().int().positive(),
    email,
    role: z.enum(BOOKING_MEMBER_ROLES),
    idempotencyKey: uuid,
  }).strict(),
  z.object({
    action: z.literal('revokeMember'),
    expectedAccessVersion: z.number().int().positive(),
    memberId: uuid,
    idempotencyKey: uuid,
  }).strict(),
])

export const bookingReadSchema = z.object({
  lastReadMessageId: uuid.optional(),
}).strict()

const timezoneSchema = boundedText(1, 64).refine(isValidTimeZone, 'invalid_timezone')
const discountBpsSchema = z.number().int().min(1).max(10_000).nullable()

export const bookingProviderMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsertService'),
    id: uuid.nullable().optional(),
    expectedRevision: z.number().int().positive().nullable().optional(),
    businessProfileId: uuid,
    title: boundedText(1, 120),
    summary: optionalText(500),
    timezone: timezoneSchema,
    signedInDiscountBps: discountBpsSchema,
  }).strict(),
  z.object({
    action: z.literal('transitionService'),
    serviceId: uuid,
    expectedRevision: z.number().int().positive(),
    transition: z.enum(['publish', 'pause']),
    idempotencyKey: uuid,
  }).strict(),
])

export const bookingServiceStateSchema = z.enum(BOOKING_SERVICE_STATES)

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

type LocalDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function formatterParts(date: Date, timeZone: string): LocalDateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const result = {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    }
    return Object.values(result).every(Number.isFinite) ? result : null
  } catch {
    return null
  }
}

function sameParts(left: LocalDateTimeParts | null, right: LocalDateTimeParts): boolean {
  return Boolean(left
    && left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute)
}

/**
 * Converts the provider-local requested time to a UTC ISO instant. Missing
 * local times during a DST jump are rejected instead of silently shifted.
 */
export function resolveRequestedStartUtc(
  requestedDate: string,
  requestedTime: string,
  timeZone: string,
  options?: { now?: Date; maxHorizonDays?: number },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requestedTime)
    || !isValidTimeZone(timeZone)) return null

  const [year, month, day] = requestedDate.split('-').map(Number)
  const [hour, minute] = requestedTime.split(':').map(Number)
  const desired = { year, month, day, hour, minute }
  const calendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day) return null

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  let candidateMs = desiredAsUtc
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = formatterParts(new Date(candidateMs), timeZone)
    if (!observed) return null
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    )
    const adjustment = desiredAsUtc - observedAsUtc
    candidateMs += adjustment
    if (adjustment === 0) break
  }

  const candidate = new Date(candidateMs)
  if (!sameParts(formatterParts(candidate, timeZone), desired)) return null
  const now = options?.now ?? new Date()
  const maxHorizonDays = options?.maxHorizonDays ?? 548
  if (candidate.getTime() <= now.getTime()) return null
  if (candidate.getTime() > now.getTime() + maxHorizonDays * 86_400_000) return null
  return candidate.toISOString()
}
