import 'server-only'

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { getAdmin } from '@/lib/supabase/admin'
import {
  EXPENSE_RECEIPT_MAX_BYTES,
  EXPENSE_RECEIPT_MAX_ITEMS,
  EXPENSE_RECEIPT_MIME_TYPES,
  parseExpenseReceiptSplitView,
  type ExpenseReceiptSplitView,
} from './receipt-split'

const extractedLineSchema = z.object({
  kind: z.enum(['item', 'discount', 'tax', 'tip']),
  description: z.string().trim().min(1).max(200),
  explanation: z.string().trim().max(240).optional(),
  explanation_needs_review: z.boolean().optional(),
  quantity_milli: z.number().int().min(1).max(1_000_000),
  total_minor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  confidence_basis_points: z.number().int().min(0).max(10_000),
  needs_review: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.kind === 'item' && value.total_minor < 0)
    || (value.kind !== 'item' && value.quantity_milli !== 1_000)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'expense_receipt_line_invalid' })
  }
})

const extractedReceiptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currency: z.enum(['ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK']),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receipt_total_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  items: z.array(extractedLineSchema).min(1).max(EXPENSE_RECEIPT_MAX_ITEMS),
}).strict()

export type ExtractedExpenseReceipt = z.infer<typeof extractedReceiptSchema>

export function parseExpenseReceiptExtraction(value: unknown): ExtractedExpenseReceipt {
  return extractedReceiptSchema.parse(value)
}

export function parseExpenseReceiptExtractionText(text: string): ExtractedExpenseReceipt {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 100_000) {
    throw new Error('expense_receipt_manual_extraction_invalid')
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const json = fenced?.[1] ?? trimmed
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('expense_receipt_manual_extraction_invalid')
  }
  return parseExpenseReceiptExtraction(value)
}

function detectedImageMime(bytes: Uint8Array): typeof EXPENSE_RECEIPT_MIME_TYPES[number] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d
    && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

export function verifyExpenseReceiptImage(
  bytes: Uint8Array,
  declaredMime: string,
  declaredSize: number,
): { mimeType: typeof EXPENSE_RECEIPT_MIME_TYPES[number]; sizeBytes: number; sha256: string } {
  if (bytes.length < 1 || bytes.length > EXPENSE_RECEIPT_MAX_BYTES
    || bytes.length !== declaredSize) {
    throw new Error('expense_receipt_size_invalid')
  }
  const mimeType = detectedImageMime(bytes)
  if (!mimeType || mimeType !== declaredMime) throw new Error('expense_receipt_mime_invalid')
  return {
    mimeType,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function extractExpenseReceipt(
  bytes: Uint8Array,
  mimeType: typeof EXPENSE_RECEIPT_MIME_TYPES[number],
): Promise<ExtractedExpenseReceipt> {
  if (process.env.EXPENSE_RECEIPT_AI_ENABLED !== 'true'
    || !process.env.ANTHROPIC_API_KEY
    || !process.env.EXPENSE_RECEIPT_MODEL) {
    throw new Error('expense_receipt_ai_unavailable')
  }
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: 90_000,
  })
  const response = await client.messages.create({
    model: process.env.EXPENSE_RECEIPT_MODEL,
    max_tokens: 4096,
    temperature: 0,
    tools: [{
      name: 'record_expense_receipt',
      description: 'Return every monetary receipt line for human review.',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'currency', 'incurred_on', 'receipt_total_minor', 'items'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          currency: { type: 'string', enum: ['ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK'] },
          incurred_on: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          receipt_total_minor: { type: 'integer', minimum: 1 },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: EXPENSE_RECEIPT_MAX_ITEMS,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'kind', 'description', 'quantity_milli', 'total_minor',
                'confidence_basis_points', 'needs_review', 'explanation',
                'explanation_needs_review',
              ],
              properties: {
                kind: { type: 'string', enum: ['item', 'discount', 'tax', 'tip'] },
                description: { type: 'string', maxLength: 200 },
                explanation: {
                  type: 'string',
                  maxLength: 240,
                  description: 'A short plain-language Icelandic explanation of the printed item name.',
                },
                explanation_needs_review: { type: 'boolean' },
                quantity_milli: { type: 'integer', minimum: 1, maximum: 1_000_000 },
                total_minor: {
                  type: 'integer',
                  description: 'Signed line total. Use zero for complimentary items that need review.',
                },
                confidence_basis_points: { type: 'integer', minimum: 0, maximum: 10_000 },
                needs_review: { type: 'boolean' },
              },
            },
          },
        },
      },
    }],
    tool_choice: { type: 'tool', name: 'record_expense_receipt' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: Buffer.from(bytes).toString('base64'),
          },
        },
        {
          type: 'text',
          text: [
            'Read this receipt and return every item, discount, tax, and tip line.',
            'Keep description exactly as printed on the receipt.',
            'For each line, add a clear Icelandic explanation of what the printed name means.',
            'Keep zero-total complimentary items as item lines and mark them for review.',
            'Use integer minor currency units and quantity times 1000.',
            'Never guess hidden text; mark uncertain values for review.',
          ].join(' '),
        },
      ],
    }],
  })
  const tool = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      && block.name === 'record_expense_receipt',
  )
  if (!tool) throw new Error('expense_receipt_ai_invalid')
  return parseExpenseReceiptExtraction(tool.input)
}

export async function getExpenseReceiptSplitForActor(
  actorUserId: string,
  target: { draftId: string; publicationId?: never } | { publicationId: string; draftId?: never },
): Promise<ExpenseReceiptSplitView | null> {
  const { data, error } = await getAdmin().rpc('expense_get_receipt_split_v1', {
    p_actor_id: actorUserId,
    p_draft_id: target.draftId ?? null,
    p_publication_id: target.publicationId ?? null,
  })
  if (error) throw new Error('expense_receipt_query_unavailable')
  return parseExpenseReceiptSplitView(data)
}

export async function getConfirmedExpenseReceiptStateForActor(
  actorUserId: string,
  expenseId: string,
): Promise<{
  draftId: string
  isAuthor: boolean
  imageAvailable: boolean
  deleteScope: 'image' | 'split' | null
} | null> {
  const { data, error } = await getAdmin().rpc('expense_receipt_get_image_target_v1', {
    p_actor_id: actorUserId,
    p_draft_id: null,
    p_publication_id: null,
    p_expense_id: expenseId,
  })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  if ((row.status !== 'ready' && row.status !== 'management')
    || typeof row.draft_id !== 'string' || typeof row.is_author !== 'boolean'
    || typeof row.image_available !== 'boolean'
    || (row.delete_scope !== null
      && row.delete_scope !== 'image' && row.delete_scope !== 'split')
    || (row.status === 'management' && !row.is_author)) return null
  return {
    draftId: row.draft_id,
    isAuthor: row.is_author,
    imageAvailable: row.image_available,
    deleteScope: row.delete_scope,
  }
}
