import { z } from 'zod'

const uuid = z.string().uuid()
export const publicMenuSchema = z.object({
  venue: z.object({ id: uuid, slug: z.string(), name: z.string(), timezone: z.string() }).strict(),
  menu: z.object({ id: uuid, version: z.number().int().positive(), title: z.string(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
  items: z.array(z.object({
    id: uuid, name: z.string(), description: z.string(), priceMinor: z.number().int().nonnegative(),
    available: z.boolean(), modifiers: z.array(z.unknown()),
  }).strict()),
}).strict()
export type PublicMenu = z.infer<typeof publicMenuSchema>

export const menuSubmitSchema = z.object({
  requestId: uuid, tableSessionId: uuid, splitId: uuid,
  expectedSplitVersion: z.number().int().positive(), menuItemId: uuid,
  quantity: z.number().int().min(1).max(1000), modifiers: z.array(z.unknown()).max(30),
  serviceNote: z.string().trim().max(500),
}).strict()

export const tableBindSchema = z.object({
  requestId: uuid, tableSessionId: uuid, splitId: uuid,
  expectedSessionRevision: z.number().int().positive(),
}).strict()

export const preorderSchema = z.object({
  requestId: uuid, venueId: uuid, splitId: uuid,
  arrivalAt: z.string().datetime(), partySize: z.number().int().min(1).max(100),
}).strict()

export type MenuDraftLine = {
  requestId: string
  expectedSplitVersion?: number
  menuItemId: string
  name: string
  unitPriceMinor: number
  quantity: number
  modifiers: unknown[]
  serviceNote: string
}
