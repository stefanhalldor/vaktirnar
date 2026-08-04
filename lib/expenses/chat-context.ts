import { EXPENSES_PATH } from './events'

export type ExpenseChatEntityType = 'group' | 'expense' | 'repayment'

/**
 * Allowlised hand-off for a future Teskeið chat integration. Financial
 * amounts, notes, participants, email addresses and payment details are
 * deliberately absent; a future action service must reload and authorize the
 * entity by ID before doing anything.
 */
export interface ExpenseChatContext {
  version: 1
  entityType: ExpenseChatEntityType
  entityId: string
  title: string
  status: string
  href: string
}

function cleanSegment(value: string, max: number): string {
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > max) throw new Error('expense_chat_context_invalid')
  return cleaned
}

export function buildExpenseChatContext(input: {
  entityType: ExpenseChatEntityType
  entityId: string
  title: string
  status: string
}): ExpenseChatContext {
  const entityId = cleanSegment(input.entityId, 80)
  const title = cleanSegment(input.title, 200)
  const status = cleanSegment(input.status, 40)
  const href = input.entityType === 'group'
    ? `${EXPENSES_PATH}/hopar/${entityId}`
    : input.entityType === 'expense'
      ? `${EXPENSES_PATH}/utgjold/${entityId}`
      : `${EXPENSES_PATH}/endurgreidslur/${entityId}`
  return Object.freeze({
    version: 1,
    entityType: input.entityType,
    entityId,
    title,
    status,
    href,
  })
}
