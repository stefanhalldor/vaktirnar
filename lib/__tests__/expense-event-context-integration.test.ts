import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

describe('independent event and expense integration', () => {
  it('gates the pluggable event source and lets a saved draft win over the query', () => {
    const page = source('app', 'auth-mvp', 'utlagt-og-endurgreitt', 'nytt', 'page.tsx')
    const form = source('components', 'expenses', 'ExpenseForm.tsx')
    const chooser = source('components', 'events', 'ExpenseEventContextChooser.tsx')

    expect(page).toContain('event?: string | string[]')
    expect(page).toContain('context?: string | string[]')
    expect(page.indexOf('guardExpenseAccess()')).toBeLessThan(page.indexOf('canUseEventExpenses(user)'))
    expect(page).toContain('const hasExplicitEventQuery = query.event !== undefined')
    expect(page).toContain("typeof query.context === 'string'")
    expect(page).toContain("query.context === 'standalone'")
    expect(page).toContain('!hasExplicitEventQuery')
    expect(page).toContain('if (canUseEvents)')
    expect(page).toContain('if (canUseEvents && chooserCandidate)')
    expect(page).toContain('eventSources = await listEventExpenseSources(user.id)')
    expect(page).toContain('eventSources.map(({ id, name }) => ({ id, name }))')
    expect(page).toContain('<ExpenseEventContextChooser events={chooserEvents} />')
    expect(page.indexOf('<ExpenseEventContextChooser')).toBeLessThan(
      page.indexOf('listLegacyExpenseEventSourcesV2(user.id)'),
    )
    expect(page.indexOf('<ExpenseEventContextChooser')).toBeLessThan(
      page.indexOf('getExpenseActorDisplayName(user.id)'),
    )
    expect(page).toContain('if (eventSources === undefined)')
    expect(page).toContain('exactEventSource = await getOwnedEventExpenseSource(user.id, exactEventId)')
    expect(page).toContain('eventSources = [exactEventSource, ...eventSources]')
    expect(page).toContain('const initialEventSource = !safeDraft && requestedEventId')
    expect(page).toContain('hydrateExpenseDraftEventGuestLabels(')
    expect(page).toContain("t('expenseForm.eventGuestUnavailableLabel')")
    expect(page).toContain('draft={displayDraft}')
    expect(page).toContain('eventSelectionWarning={eventSelectionWarning}')
    expect(page).toContain('eventSources={eventSources}')
    expect(page).not.toContain('listEvents(')

    expect(chooser).toContain('<form')
    expect(chooser).toContain('<fieldset')
    expect(chooser).toContain('<legend')
    expect(chooser).toContain('type="radio"')
    expect(chooser).toContain('type="submit"')
    expect(chooser).toContain('navigatingRef.current = true')
    expect(chooser.indexOf('navigatingRef.current = true')).toBeLessThan(
      chooser.indexOf('setIsNavigating(true)'),
    )
    expect(chooser.indexOf('setIsNavigating(true)')).toBeLessThan(chooser.indexOf('router.push'))
    expect(chooser).toContain('encodeURIComponent(selectedEvent.id)')
    expect(chooser).not.toContain('router.replace')
    expect(chooser).not.toContain('/hopar/')

    expect(form).toContain("initialDraftPayload ? initialDraftPayload.eventId ?? '' : initialEventSource?.id ?? ''")
    expect(form).toContain('? initialDraftPayload.eventRosterRevision')
    expect(form).toContain("event_id: mode === 'one_off' && !edit ? eventId || null : null")
    expect(form).toContain('expected_event_roster_revision: mode ===')
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
    expect(itemPage).toMatch(
      /const canUseEventUi = canUseEvents && \(\s*linkedEventId\s*\? canOpenLinkedEvent\s*: eventClassification\.value && eventClassification\.reliable\s*\)/,
    )
    expect(itemPage).not.toContain('(canOpenLinkedEvent || eventClassification.reliable)')
    expect(editPage).toContain('isExpenseEventContext(user.id, group.id).catch(() => true)')
    expect(editPage).toContain('eventContext={isEventContext}')
    expect(itemDetail).toContain('!isEventContext && canLinkExpenseGuest')
  })

  it('keeps the settlement route global and free of an event-filtered mode', () => {
    const page = source(
      'app', 'auth-mvp', 'utlagt-og-endurgreitt', 'gera-upp', 'page.tsx',
    )

    expect(page).toContain('guardExpenseAccess()')
    expect(page).toContain('const view = await getExpensePayAllView(user.id)')
    expect(page).toContain('<ExpensePayAll view={view}')
    expect(page).not.toContain('searchParams')
    expect(page).not.toContain('EventExpensePreview')
    expect(page).not.toContain('getEventExpensePreview')
    expect(page).not.toContain('getOwnedEventExpenseSource')
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
