import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('TES-24 runtime contract', () => {
  it('uses dedicated open, discard and reconfirm actions instead of immediate update', () => {
    const actions = read('lib/expenses/actions.ts')
    const form = read('components/expenses/ExpenseForm.tsx')
    const detail = read('components/expenses/ExpenseItemDetail.tsx')
    expect(actions).toContain('export async function openExpenseEditRevision')
    expect(actions).toContain('export async function discardExpenseEditRevision')
    expect(actions).toContain('export async function reconfirmExpenseEditRevision')
    expect(form).toContain('reconfirmExpenseEditRevision')
    expect(form).not.toMatch(/function saveExpenseChanges\(\)[\s\S]*?await updateExpense\(/)
    expect(detail).toContain('ExpenseEditRevisionControls')
  })

  it('renders a server-derived settlement lock while the edit draft replaces confirmed presentation', () => {
    const detail = read('components/expenses/ExpenseItemDetail.tsx')
    const repository = read('lib/expenses/repository.server.ts')
    const dashboardSql = read('sql/170_expense_dashboard_presentations.sql')
    expect(repository).toContain('getExpenseEditRevisionState')
    const load = repository.slice(repository.indexOf('async function loadGroupRows('), repository.indexOf('function buildGroupView('))
    const wrapper = repository.slice(repository.indexOf('export async function getExpenseEditRevisionState('), repository.indexOf('export async function getExpenseSharedDraftManagementTarget('))
    // Protect the scoped read and fail-closed classification, not internal table access.
    expect(load).toMatch(/Promise\.all\(expenses\.map\(async \(expense\) => \(\{/)
    expect(load).toContain('expenseId: expense.id')
    expect(load).toContain('state: await getExpenseEditRevisionState(actorUserId, expense.id)')
    expect(load).toContain("editStates.some(({ state }) => state.status === 'unavailable')")
    expect(load).toContain("throwOnError(new Error('expense_edit_state_unavailable'), 'edit revision state RPC')")
    expect(load.indexOf("state.status === 'unavailable'")).toBeLessThan(load.indexOf('const editingExpenseIds'))
    expect(load).toContain("editStates.filter(({ state }) => state.status === 'open').map(({ expenseId }) => expenseId)")
    expect(wrapper).toMatch(/\.rpc\('expense_get_edit_revision_state_v1',\s*\{\s*p_actor_id: actorUserId,\s*p_expense_id: expenseId,/)
    expect(wrapper).toContain("if (error) return { status: 'unavailable' }")
    expect(wrapper).toContain("if (!source || source.status === 'unavailable') return { status: 'unavailable' }")
    const noneBranch = wrapper.slice(wrapper.indexOf("if (source.status === 'none')"), wrapper.indexOf("if (source.status !== 'open'"))
    expect(noneBranch).toContain("typeof source.can_open !== 'boolean'")
    expect(noneBranch).toContain("!openReasons.has(source.open_reason)")
    expect(noneBranch).toContain("source.can_open !== (source.open_reason === 'clean')")
    expect(noneBranch.indexOf("return { status: 'unavailable' }")).toBeLessThan(noneBranch.indexOf("status: 'none'"))
    expect(wrapper).toContain("typeof source.owned_by_actor !== 'boolean') return { status: 'unavailable' }")
    expect(repository).not.toMatch(/\.from\(['"]expense_edit_revision_bindings['"]\)/)
    expect(repository).toContain('options.includeEditingExpenses || !rows.editingExpenseIds.has(expense.id)')
    expect(repository).toContain('{ ...options, includeEditingExpenses: true }')
    expect(detail).toContain("editRevisionState === 'open'")
    expect(detail).toContain("t('editRevision.settlementLockedTitle')")
    expect(detail).toContain("t('editRevision.settlementLockedBody')")
    expect(detail).toContain('<ExpenseSettlementParticipantList')
    expect(dashboardSql).toMatch(
      /canonical_presentations AS \([\s\S]+?NOT EXISTS \([\s\S]+?expense_edit_revision_bindings AS binding[\s\S]+?binding\.expense_id = expense\.id/,
    )
  })

  it('renders Færa í drög only from the server-derived clean-open decision', () => {
    const contracts = read('lib/expenses/contracts.ts')
    const repository = read('lib/expenses/repository.server.ts')
    const controls = read('components/expenses/ExpenseEditRevisionControls.tsx')
    expect(contracts).toContain("canOpen: boolean")
    expect(contracts).toContain("openReason: 'clean' | 'settlement' | 'lifecycle' | 'unavailable'")
    expect(repository).toContain('source.can_open')
    expect(repository).toContain('source.open_reason')
    expect(controls).toContain('state.canOpen')
    expect(controls).toContain("t('editRevision.cannotOpen')")
  })

  it('uses the SQL168 eligible settlement read model for group detail and pay-all', () => {
    const repository = read('lib/expenses/repository.server.ts')
    expect(repository).toContain("rpc('expense_get_eligible_settlement_context_v1'")
    expect(repository).toContain('eligibleSettlementContext')
    expect(repository).toContain('settlementEligibilityReady')
    expect(repository).not.toMatch(/getExpensePayAllView[\s\S]+?filter\([^)]*editRevision/)
  })

  it('uses a deterministic draft identity for lost-response-safe revision opening', () => {
    const actions = read('lib/expenses/actions.ts')
    expect(actions).toContain('expenseEditRevisionDraftId(')
    expect(actions).toContain('`expense-edit-revision-v1:${expenseId}`')
    expect(actions).toContain('p_draft_id: draftId')
    expect(actions).toContain('persistedDraftId !== draftId')
  })

  it('does not make a freshly shared revision stale immediately before reconfirmation', () => {
    const form = read('components/expenses/ExpenseForm.tsx')
    expect(form).toContain('publicationReady.draftVersion !== draftVersionRef.current')
    expect(form).toMatch(/if \(draftVersionRef\.current !== null\s+&& draftStepRef\.current === step/)
    expect(form).not.toMatch(/if \(!edit\s+&& draftVersionRef\.current !== null/)
  })

  it('does not interrupt terminal mutations with an intermediate draft-route reload', () => {
    const form = read('components/expenses/ExpenseForm.tsx')
    expect(form).toMatch(
      /function saveExpenseChanges\(\)[\s\S]+?persistDraft\(currentStep, \{[\s\S]+?replaceRouteAfterSave: false,[\s\S]+?retainReturnFocus: true,[\s\S]+?\}\)[\s\S]+?reconfirmExpenseEditRevision/,
    )
    expect(form).toMatch(
      /function finalizeDraft\(\)[\s\S]+?persistDraft\(currentStep, \{[\s\S]+?replaceRouteAfterSave: false,[\s\S]+?retainReturnFocus: true,[\s\S]+?\}\)[\s\S]+?finalizeExpenseDraft/,
    )
    expect(form).toMatch(
      /async function advanceStep\(\)[\s\S]+?persistDraft\(nextStep\)/,
    )
  })

  it('maps the open-revision refusal to a bounded semantic error', () => {
    const actions = read('lib/expenses/actions.ts')
    const contracts = read('lib/expenses/contracts.ts')
    expect(actions).toContain("message.includes('expense_edit_revision_open')")
    expect(actions).toContain("'revision_open'")
    expect(contracts).toContain("| 'revision_open'")
    expect(actions).toContain("return { ok: false, error: code }")
  })

  it('keeps unbound legacy edit drafts read-only and separately discardable', () => {
    const actions = read('lib/expenses/actions.ts')
    const repository = read('lib/expenses/repository.server.ts')
    const route = read('app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/breyta/page.tsx')
    const isMessages = read('messages/is.json')
    expect(actions).toContain('export async function discardLegacyExpenseEditDraft')
    expect(actions).toContain("rpc('expense_discard_legacy_edit_draft_v1'")
    expect(actions).toContain("'legacy_edit_draft_unbound'")
    expect(repository).toContain('getLegacyExpenseEditDraftState')
    expect(repository).toContain("rpc('expense_get_legacy_edit_draft_state_v1'")
    expect(route).toContain("legacy.status === 'legacy_unbound'")
    expect(route.indexOf("legacy.status === 'legacy_unbound'")).toBeLessThan(
      route.indexOf('<ExpenseForm'),
    )
    for (const copy of [
      'Þessi drög eru úr eldri útgáfu',
      'Engar upphæðir, greiðslur eða skiptingar breytast við þetta.',
      'Fjarlægja gömlu drögin',
    ]) expect(isMessages).toContain(copy)
  })

  it('preserves one visible logical Expense for private/shared audiences', () => {
    const repository = read('lib/expenses/repository.server.ts')
    const sql177 = read('sql/177_expense_confirmed_to_draft_payments.sql')
    expect(repository).toContain("rpc('expense_list_dashboard_presentations_v1'")
    expect(repository).toContain('classifyExpenseDashboardPresentationResponse(')
    expect(repository).not.toContain('parseVisibleEditRevisionExpenseIds(')
    expect(repository).not.toContain('deriveExpenseConfirmedPresentations(')
    expect(sql177).toContain("'kind', 'edit_draft'")
    expect(sql177).toMatch(
      /visible_candidates AS MATERIALIZED \([\s\S]+?expense_edit_revision_bindings AS edit_binding[\s\S]+?visible_count AS MATERIALIZED/,
    )
  })

  it('keeps repayments visible but disables all payment decisions while any edit binding is open', () => {
    const repository = read('lib/expenses/repository.server.ts')
    const form = read('components/expenses/ExpenseForm.tsx')
    expect(repository).toContain('rows.editingExpenseIds.size > 0')
    expect(repository).toMatch(/canConfirm: rows\.editingExpenseIds\.size === 0/)
    expect(repository).toMatch(/canReject: rows\.editingExpenseIds\.size === 0/)
    expect(repository).toMatch(/canCancel: rows\.editingExpenseIds\.size === 0/)
    expect(form).toContain('ExpenseRepaymentStatusLines')
    expect(form).toContain("'expenseForm.editPaymentContextOneOff'")
    expect(form).toContain("'expenseForm.editPaymentContextGroup'")
  })

  it('provides translated mobile-first choices and safe failure text', () => {
    const component = read('components/expenses/ExpenseEditRevisionControls.tsx')
    const loadingRoute = read('app/auth-mvp/utlagt-og-endurgreitt/loading.tsx')
    const isMessages = read('messages/is.json')
    const enMessages = read('messages/en.json')
    expect(component).toContain("mode: 'private' | 'shared'")
    expect(component).toContain('min-h-11')
    expect(component).toContain('aria-modal="true"')
    expect(component).toContain("isPending ? t('editRevision.opening')")
    expect(loadingRoute).toContain('ExpenseRouteLoading')
    for (const messages of [isMessages, enMessages]) {
      expect(messages).toContain('settlementLockedTitle')
      expect(messages).toContain('privateChoice')
      expect(messages).toContain('sharedChoice')
      expect(messages).toContain('revision_open')
      expect(messages).toContain('cannotOpen')
    }
    expect(component).toMatch(/startTransition\(async \(\) => \{[\s\S]+?try \{[\s\S]+?openExpenseEditRevision[\s\S]+?catch/)
  })

  it('catches rejected discard actions and suppresses cancellation while locked', () => {
    const form = read('components/expenses/ExpenseForm.tsx')
    const detail = read('components/expenses/ExpenseItemDetail.tsx')
    expect(form).toMatch(/function discardRevision\(\)[\s\S]+?startTransition\(async \(\) => \{[\s\S]+?try \{[\s\S]+?discardExpenseEditRevision[\s\S]+?catch \{/)
    expect(detail).toMatch(/const canCancel = expense\.status === 'active'[\s\S]+?&& !settlementLocked/)
  })
})
