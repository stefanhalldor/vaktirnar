import { z } from 'zod'
import { KVISS_CODE_PATTERN } from './contracts'

const uuid = z.string().uuid()
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max)
const bcryptPassword = (min: number) => z.string().min(min).max(72).refine(
  value => new TextEncoder().encode(value).length <= 72,
  { message: 'password_too_long' },
)

export const joinCodeSchema = z.string().trim().toUpperCase().regex(KVISS_CODE_PATTERN)

export const hostLiveQuerySchema = z.object({ sessionId: uuid }).strict()

export const publicJoinSchema = z.object({
  code: joinCodeSchema,
  nickname: boundedText(1, 40),
  password: bcryptPassword(0).optional(),
}).strict()

export const publicAnswerSchema = z.object({
  code: joinCodeSchema,
  questionId: uuid,
  selectedOption: z.number().int().min(0).max(3),
  commandId: uuid,
}).strict()

export const publicChatSchema = z.object({
  code: joinCodeSchema,
  body: boundedText(1, 500),
  clientMessageId: uuid,
}).strict()

export const questionInputSchema = z.object({
  id: uuid.nullable().optional(),
  expectedRevision: z.number().int().positive().nullable().optional(),
  text: boundedText(1, 500),
  options: z.array(boundedText(1, 300)).min(2).max(4),
  correctOptionIndices: z.array(z.number().int().min(0).max(3)).min(1).max(4),
  durationSeconds: z.number().int().min(5).max(600),
  pointWeight: z.number().int().min(1).max(100),
  confidenceMode: z.boolean(),
  labels: z.array(boundedText(1, 40)).max(8).default([]),
  sortOrder: z.number().int().min(0),
}).superRefine((value, context) => {
  if (new Set(value.correctOptionIndices).size !== value.correctOptionIndices.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_correct_option' })
  }
  if (value.correctOptionIndices.some(index => index >= value.options.length)) {
    context.addIssue({ code: 'custom', message: 'correct_option_out_of_range' })
  }
})

export const creatorMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upsertQuestion'), question: questionInputSchema }),
  z.object({ action: z.literal('archiveQuestion'), questionId: uuid, expectedRevision: z.number().int().positive() }),
  z.object({
    action: z.literal('saveTemplate'), id: uuid.nullable().optional(),
    expectedRevision: z.number().int().positive().nullable().optional(),
    title: boundedText(1, 160), teamNames: z.array(boundedText(1, 60)).max(20),
    questions: z.array(z.object({ id: uuid, sourceQuestionId: uuid, sourceQuestionRevision: z.number().int().positive() })).min(1).max(200),
  }),
  z.object({
    action: z.literal('createSession'), templateId: uuid,
    password: bcryptPassword(4).nullable(),
  }),
  z.object({
    action: z.literal('hostCommand'), sessionId: uuid,
    expectedRevision: z.number().int().positive(), commandId: uuid,
    commandType: z.enum(['activate_question', 'reveal', 'leaderboard', 'end']),
    questionId: uuid.nullable().optional(),
  }),
])
