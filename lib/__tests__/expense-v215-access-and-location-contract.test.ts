import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('v215 access and free-drive source contracts', () => {
  it('requires the bounded preview before a member invitation can be accepted and redirects from authoritative outcome', () => {
    const dashboard = readFileSync(join(process.cwd(), 'components/expenses/ExpenseDashboard.tsx'), 'utf8')
    const page = readFileSync(join(process.cwd(), 'app/auth-mvp/utlagt-og-endurgreitt/bod/adili/[invitationId]/page.tsx'), 'utf8')
    const actions = readFileSync(join(process.cwd(), 'components/expenses/ExpenseMemberInvitationActions.tsx'), 'utf8')
    expect(dashboard).not.toContain('ExpenseMemberInvitationActions')
    expect(page).toContain('getExpenseMemberInvitationPreview')
    expect(page).toContain('memberInvitation.claimHint')
    expect(actions).toContain('result.data.expenseId')
    expect(actions).toContain('/auth-mvp/utlagt-og-endurgreitt/utgjold/${result.data.expenseId}')
  })

  it('distinguishes unknown expense ids from a generic access-denied render without leaking record data', () => {
    const repository = readFileSync(join(process.cwd(), 'lib/expenses/repository.server.ts'), 'utf8')
    const page = readFileSync(join(process.cwd(), 'app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page.tsx'), 'utf8')
    expect(repository).toContain("return { status: 'not_found' }")
    expect(repository).toContain("return { status: 'forbidden' }")
    expect(page).toContain("if (result.status === 'not_found') notFound()")
    expect(page).toContain("if (result.status === 'forbidden')")
    expect(page).toContain("t('noAccess.body')")
  })

  it('shows reusable permission help only for permission denial and expands free-drive controls', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain("if (error === 'permission_denied') setIsRouteMapSettingsCollapsed(false)")
    expect(source).toContain("routeLiveLocationError === 'permission_denied' && (")
    expect(source).toContain('<CurrentLocationPermissionHelp />')
  })
})
