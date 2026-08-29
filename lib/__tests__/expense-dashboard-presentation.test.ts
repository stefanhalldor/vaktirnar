import { describe, expect, it } from 'vitest'
import {
  deriveExpenseConfirmedPresentation,
  deriveExpenseConfirmedPresentations,
} from '@/lib/expenses/dashboard-presentation'
import type { ExpenseIncompleteDraftSummaryView } from '@/lib/expenses/contracts'

const GROUP_ID = '30000000-0000-4000-8000-000000000001'
const EXPENSE_A = '40000000-0000-4000-8000-000000000001'
const EXPENSE_B = '40000000-0000-4000-8000-000000000002'

function editDraft(
  id: string,
  expenseId: string,
  overrides: Partial<ExpenseIncompleteDraftSummaryView> = {},
): ExpenseIncompleteDraftSummaryView {
  return {
    id,
    contextType: 'edit',
    groupId: GROUP_ID,
    expenseId,
    title: 'Content is presentation only',
    totalMinor: 10_000,
    currency: 'ISK',
    differenceMinor: null,
    needsAttention: false,
    savedAt: '2026-08-28T08:00:00.000Z',
    ...overrides,
  }
}

describe('single-visible Expense presentation authority', () => {
  it('shows the confirmed representation when no exact edit exists', () => {
    expect(deriveExpenseConfirmedPresentation({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenseId: EXPENSE_A,
      drafts: [],
    })).toEqual({ status: 'confirmed' })
  })

  it('returns one exact canonical continuation without using draft content', () => {
    const draft = editDraft('53000000-0000-4000-8000-000000000001', EXPENSE_A)
    expect(deriveExpenseConfirmedPresentation({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenseId: EXPENSE_A,
      drafts: [draft],
    })).toEqual({ status: 'editing', draftId: draft.id, expenseId: EXPENSE_A })
  })

  it('fails duplicate same-Expense edits closed without choosing by content or time', () => {
    const d1 = editDraft('53000000-0000-4000-8000-000000000011', EXPENSE_A, {
      title: 'Same', savedAt: '2026-08-28T08:00:00.000Z',
    })
    const d2 = editDraft('53000000-0000-4000-8000-000000000012', EXPENSE_A, {
      title: 'Same', savedAt: '2026-08-28T09:00:00.000Z',
    })
    expect(deriveExpenseConfirmedPresentation({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenseId: EXPENSE_A,
      drafts: [d1, d2],
    })).toEqual({ status: 'ambiguous', reason: 'duplicate_same_expense' })
  })

  it('gives different Expenses in the same group independent exact editing presentations', () => {
    expect(deriveExpenseConfirmedPresentations({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenses: [
        { id: EXPENSE_A, title: 'Expense A', status: 'active' },
        { id: EXPENSE_B, title: 'Expense B', status: 'active' },
      ],
      drafts: [
        editDraft('53000000-0000-4000-8000-000000000021', EXPENSE_A),
        editDraft('53000000-0000-4000-8000-000000000022', EXPENSE_B),
      ],
    })).toEqual([
      {
        expenseId: EXPENSE_A,
        title: 'Expense A',
        expenseStatus: 'active',
        presentationState: {
          status: 'editing',
          draftId: '53000000-0000-4000-8000-000000000021',
          expenseId: EXPENSE_A,
        },
      },
      {
        expenseId: EXPENSE_B,
        title: 'Expense B',
        expenseStatus: 'active',
        presentationState: {
          status: 'editing',
          draftId: '53000000-0000-4000-8000-000000000022',
          expenseId: EXPENSE_B,
        },
      },
    ])
  })

  it('keeps duplicate edit identities ambiguous only on their exact Expense', () => {
    const d1 = editDraft('53000000-0000-4000-8000-000000000041', EXPENSE_A)
    const d2 = editDraft('53000000-0000-4000-8000-000000000042', EXPENSE_A)
    expect(deriveExpenseConfirmedPresentations({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenses: [
        { id: EXPENSE_A, title: 'Expense A', status: 'active' },
        { id: EXPENSE_B, title: 'Expense B', status: 'active' },
      ],
      drafts: [d1, d2],
    })).toEqual([
      {
        expenseId: EXPENSE_A,
        title: 'Expense A',
        expenseStatus: 'active',
        presentationState: { status: 'ambiguous', reason: 'duplicate_same_expense' },
      },
      {
        expenseId: EXPENSE_B,
        title: 'Expense B',
        expenseStatus: 'active',
        presentationState: { status: 'confirmed' },
      },
    ])
  })

  it('keeps the confirmed financial representation fail-safe when edit lookup is unavailable', () => {
    expect(deriveExpenseConfirmedPresentation({
      draftSourceStatus: 'unavailable',
      groupId: GROUP_ID,
      expenseId: EXPENSE_A,
      drafts: [],
    })).toEqual({ status: 'unavailable' })
  })

  it('keeps every exact Expense visible when the shared edit source is unavailable', () => {
    expect(deriveExpenseConfirmedPresentations({
      draftSourceStatus: 'unavailable',
      groupId: GROUP_ID,
      expenses: [
        { id: EXPENSE_A, title: 'Expense A', status: 'active' },
        { id: EXPENSE_B, title: 'Expense B', status: 'active' },
      ],
      drafts: [],
    })).toEqual([
      {
        expenseId: EXPENSE_A,
        title: 'Expense A',
        expenseStatus: 'active',
        presentationState: { status: 'unavailable' },
      },
      {
        expenseId: EXPENSE_B,
        title: 'Expense B',
        expenseStatus: 'active',
        presentationState: { status: 'unavailable' },
      },
    ])
  })

  it('ignores creation drafts and drafts outside the exact group/Expense context', () => {
    expect(deriveExpenseConfirmedPresentation({
      draftSourceStatus: 'ready',
      groupId: GROUP_ID,
      expenseId: EXPENSE_A,
      drafts: [
        editDraft('53000000-0000-4000-8000-000000000031', EXPENSE_B),
        editDraft('53000000-0000-4000-8000-000000000032', EXPENSE_A, { groupId: null }),
        editDraft('53000000-0000-4000-8000-000000000033', EXPENSE_A, {
          contextType: 'one_off', groupId: null, expenseId: null,
        }),
      ],
    })).toEqual({ status: 'confirmed' })
  })
})
