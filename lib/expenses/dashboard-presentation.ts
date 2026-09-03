import type {
  ExpenseConfirmedPresentationState,
  ExpenseDashboardDraftSourceStatus,
  ExpenseIncompleteDraftSummaryView,
} from './contracts'

export function deriveExpenseConfirmedPresentation({
  draftSourceStatus,
  groupId,
  expenseId,
  drafts,
  sharedRevisionExpenseIds = new Set<string>(),
}: {
  draftSourceStatus: ExpenseDashboardDraftSourceStatus
  groupId: string
  expenseId: string
  drafts: readonly ExpenseIncompleteDraftSummaryView[]
  sharedRevisionExpenseIds?: ReadonlySet<string>
}): ExpenseConfirmedPresentationState {
  if (draftSourceStatus === 'unavailable') return { status: 'unavailable' }

  // The repository source is already scoped to the exact actor. Composition
  // below uses only persisted edit/group/Expense identity, never draft content.
  if (!sharedRevisionExpenseIds.has(expenseId)) return { status: 'confirmed' }

  const exactEditDrafts = drafts.filter((draft) => (
    draft.contextType === 'edit'
    && draft.groupId === groupId
    && draft.expenseId === expenseId
  ))
  if (exactEditDrafts.length === 0) return { status: 'editing', draftId: null, expenseId }

  if (exactEditDrafts.length > 1) {
    return { status: 'ambiguous', reason: 'duplicate_same_expense' }
  }

  const draft = exactEditDrafts[0]!
  return { status: 'editing', draftId: draft.id, expenseId }
}

export function deriveExpenseConfirmedPresentations({
  draftSourceStatus,
  groupId,
  expenses,
  drafts,
  sharedRevisionExpenseIds = new Set<string>(),
}: {
  draftSourceStatus: ExpenseDashboardDraftSourceStatus
  groupId: string
  expenses: ReadonlyArray<{ id: string; title: string; status: 'active' | 'cancelled' }>
  drafts: readonly ExpenseIncompleteDraftSummaryView[]
  sharedRevisionExpenseIds?: ReadonlySet<string>
}): import('./contracts').ExpenseConfirmedPresentationView[] {
  return expenses.map((expense) => ({
    expenseId: expense.id,
    title: expense.title,
    expenseStatus: expense.status,
    presentationState: deriveExpenseConfirmedPresentation({
      draftSourceStatus,
      groupId,
      expenseId: expense.id,
      drafts,
      sharedRevisionExpenseIds,
    }),
  }))
}
