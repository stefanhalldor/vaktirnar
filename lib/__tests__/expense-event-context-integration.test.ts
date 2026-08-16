import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

describe('expense-backed event integration', () => {
  it('keeps the fresh one-off chooser outside ExpenseForm and bypasses it for drafts', () => {
    const page = source('app', 'auth-mvp', 'utlagt-og-endurgreitt', 'nytt', 'page.tsx')
    expect(page).toContain("query.context !== 'standalone'")
    expect(page).toContain("'afmaeli-og-vidburdir'")
    expect(page).toContain('!safeDraft')
    expect(page).toContain('<ExpenseEventContextChooser events={events} eventsError={eventsError} />')
    expect(page).not.toContain('listEvents(user.id).catch(() => [])')
    expect(page.indexOf('<ExpenseEventContextChooser')).toBeLessThan(page.indexOf('const actorName'))
  })

  it('classifies only after canonical financial access and fails closed for UI defaults', () => {
    const groupPage = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'hopar', '[groupId]', 'page.tsx',
    )
    const newExpensePage = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'hopar', '[groupId]', 'nytt-utgjald', 'page.tsx',
    )
    for (const page of [groupPage, newExpensePage]) {
      expect(page.indexOf('getExpenseGroupView')).toBeLessThan(page.indexOf('isExpenseEventContext'))
      expect(page).toContain('.catch(() => ({ value: true, reliable: false }))')
      expect(page).toContain('eventClassification.reliable')
    }
    expect(newExpensePage).toContain('included: member.isSelf ? group.defaultIncludeCreator : !isEventContext')
    expect(newExpensePage).toContain('eventContext={isEventContext}')
  })

  it('never renders generic roster mutation or identity-link controls for a marked event', () => {
    const detail = source('components', 'expenses', 'ExpenseGroupDetail.tsx')
    expect(detail).toContain('isEventContext = false')
    expect(detail).toContain('{!isEventContext ? (')
    expect(detail).toContain('<ExpenseMemberManager')

    const groupPage = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'hopar', '[groupId]', 'page.tsx',
    )
    expect(groupPage).toContain('if (!isEventContext && group.kind')
    expect(groupPage).toContain('isEventContext={isEventContext}')

    const itemPage = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'utgjold', '[expenseId]', 'page.tsx',
    )
    const editPage = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'utgjold', '[expenseId]', 'breyta', 'page.tsx',
    )
    const itemDetail = source('components', 'expenses', 'ExpenseItemDetail.tsx')
    expect(itemPage).toContain('isExpenseEventContext(user.id, result.group.id)')
    expect(itemPage).toContain('isEventContext={isEventContext}')
    expect(editPage).toContain('isExpenseEventContext(user.id, group.id).catch(() => true)')
    expect(editPage).toContain('eventContext={isEventContext}')
    expect(itemDetail).toContain('!isEventContext && canLinkExpenseGuest')
  })

  it('keeps private headers and analytics exclusion across both namespaces', () => {
    const nextConfig = source('next.config.js')
    const analytics = source('components', 'teskeid', 'TeskeidAnalytics.tsx')
    for (const namespace of ['vidburdir', 'utlagt-og-endurgreitt']) {
      expect(nextConfig).toContain(`source: '/auth-mvp/${namespace}/:path*'`)
      expect(analytics).toContain(`^\\/auth-mvp\\/${namespace}`)
    }
  })
})
