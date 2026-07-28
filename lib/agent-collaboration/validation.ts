import { z } from 'zod'

export const AGENT_MESSAGE_MAX_LENGTH = 4_000
export const AGENT_REPLY_MAX_LENGTH = 12_000
export const AGENT_PAGE_MAX = 100

const uuid = z.string().uuid()
export const agentIdempotencyKeySchema = z.string().trim().min(8).max(120)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const agentMessageSchema = z.object({
  conversationId: uuid,
  body: z.string().trim().min(1).max(AGENT_MESSAGE_MAX_LENGTH),
  clientMessageId: uuid,
  idempotencyKey: agentIdempotencyKeySchema,
}).strict()

export const agentReadSchema = z.object({
  conversationId: uuid,
  lastReadMessageId: uuid,
}).strict()

export const agentPairingSchema = z.object({
  conversationId: uuid.optional(),
  providerKey: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{1,49}$/)
    .default('codex'),
  displayName: z.string().trim().min(1).max(80).default('Codex'),
}).strict()

export const connectorPairSchema = z.object({
  protocolVersion: z.literal(1),
  code: z.string().trim().min(8).max(32),
  provider: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{1,49}$/)
    .default('codex'),
  capabilities: z.array(z.literal('chat.reply.read_only')).length(1),
}).strict()

export const connectorLeaseSchema = z.object({
  protocolVersion: z.literal(1),
  leaseOwnerId: uuid,
}).strict()

export const connectorHeartbeatSchema = z.object({
  protocolVersion: z.literal(1),
  runId: uuid,
  leaseId: uuid,
  leaseOwnerId: uuid,
}).strict()

export const connectorCompleteSchema = z.object({
  protocolVersion: z.literal(1),
  runId: uuid,
  leaseId: uuid,
  leaseOwnerId: uuid,
  body: z.string().trim().min(1).max(AGENT_REPLY_MAX_LENGTH),
  agentSessionId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict()

export const connectorFailSchema = z.object({
  protocolVersion: z.literal(1),
  runId: uuid,
  leaseId: uuid,
  leaseOwnerId: uuid,
  failureCategory: z.enum([
    'provider_unavailable',
    'provider_auth',
    'runner_error',
    'timeout',
    'output_too_large',
    'cancelled',
  ]),
  retryable: z.boolean().default(false),
}).strict()

export function parsePageLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '50', 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), AGENT_PAGE_MAX) : 50
}

export function isUuid(value: string | null): value is string {
  return value !== null && uuid.safeParse(value).success
}

export function isIsoTimestamp(value: string | null): value is string {
  if (value === null) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && /T/.test(value)
}
