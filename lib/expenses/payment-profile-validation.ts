import { z } from 'zod'

const uuid = z.string().uuid()

export const SaveExpensePaymentProfileV2Schema = z.object({
  profile_id: uuid.nullable().optional().transform((value) => value ?? null),
  expected_version: z.number().int().positive().nullable().optional().transform((value) => value ?? null),
  request_id: uuid,
  bank: z.string().max(20).optional().default(''),
  ledger: z.string().max(20).optional().default(''),
  account: z.string().max(30).optional().default(''),
  national_id: z.string().max(32).optional().default(''),
  other: z.string().max(1000).optional().default(''),
}).strict()

export const ClearExpensePaymentProfileV2Schema = z.object({
  profile_id: uuid,
  expected_version: z.number().int().positive(),
  request_id: uuid,
}).strict()

export type SaveExpensePaymentProfileV2Input = z.infer<typeof SaveExpensePaymentProfileV2Schema>
