import { describe, expect, it } from 'vitest'
import { CreateExpenseSchema } from '@/lib/expenses/validation'

const circle = '11111111-1111-4111-8111-111111111111'
const member = '22222222-2222-4222-8222-222222222222'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    request_id: '33333333-3333-4333-8333-333333333333', draft_id: null, group_id: null,
    circle_id: circle, title: 'Kvöldmatur', total: '1000', currency: 'ISK', incurred_on: '2026-08-06',
    category: null, note: null, split_method: 'weighted',
    members: [
      { type: 'self', key: 'self' },
      { type: 'circle_member', key: `circle:${member}`, circle_id: circle, circle_member_id: member },
    ],
    payments: [{ member_key: 'self', amount: '1000' }],
    allocations: [{ member_key: 'self', weight: '1' }, { member_key: `circle:${member}`, weight: '1' }],
    ...overrides,
  }
}

describe('expense circle snapshot validation', () => {
  it('accepts one optional circle for a one-off expense', () => {
    expect(CreateExpenseSchema.safeParse(payload()).success).toBe(true)
  })

  it('rejects circle members whose circle does not match the context', () => {
    const result = CreateExpenseSchema.safeParse(payload({ circle_id: '44444444-4444-4444-8444-444444444444' }))
    expect(result.success).toBe(false)
  })

  it('rejects circle context on a persisted expense group', () => {
    const result = CreateExpenseSchema.safeParse(payload({ group_id: '55555555-5555-4555-8555-555555555555', members: [] }))
    expect(result.success).toBe(false)
  })
})
