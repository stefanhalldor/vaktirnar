import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeRoot = join(process.cwd(), 'app/auth-mvp/verkefnin')
const componentRoot = join(process.cwd(), 'components/household-chores')

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function source(path: string) {
  return readFileSync(path, 'utf8')
}

function messageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => messageKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

describe('Household Chores loading and mobile source contracts', () => {
  it('keeps Icelandic and English Household Chores message keys in exact parity', () => {
    const isMessages = JSON.parse(source(join(process.cwd(), 'messages/is.json')))
    const enMessages = JSON.parse(source(join(process.cwd(), 'messages/en.json')))
    expect(messageKeys(isMessages.teskeid.householdChores))
      .toEqual(messageKeys(enMessages.teskeid.householdChores))
  })

  it('gives every page segment a canonical route loader', () => {
    const pageFiles = filesUnder(routeRoot)
      .filter((path) => path.endsWith('page.tsx'))
      .sort()

    expect(pageFiles.length).toBeGreaterThanOrEqual(10)
    for (const pageFile of pageFiles) {
      const loadingFile = join(dirname(pageFile), 'loading.tsx')
      expect(
        existsSync(loadingFile),
        `${relative(process.cwd(), pageFile)} must have a sibling loading.tsx`,
      ).toBe(true)
      expect(source(loadingFile)).toContain('HouseholdChoreRouteLoading')
    }

    const sharedLoader = source(join(routeRoot, 'HouseholdChoreRouteLoading.tsx'))
    expect(sharedLoader).toContain("getTranslations('teskeid.householdChores')")
    expect(sharedLoader).toContain("getTranslations('teskeid.loader')")
    expect(sharedLoader).toContain('<TeskeidLoader')
    expect(sharedLoader).toContain('loadingLabel={')
    expect(sharedLoader).toContain('min-h-screen')
  })

  it('starts reusable navigation feedback before links and imperative route changes wait', () => {
    const layout = source(join(routeRoot, 'layout.tsx'))
    const feedback = source(join(
      process.cwd(),
      'components',
      'teskeid',
      'TeskeidNavigationFeedback.tsx',
    ))

    expect(layout).toContain('<TeskeidNavigationFeedbackProvider')
    expect(layout).toContain('pendingFallback={<HouseholdChoreRouteLoading />}')
    expect(feedback).toContain('onClickCapture={handleClickCapture}')
    expect(feedback).toContain("anchor.dataset.teskeidNavigationFeedback === 'off'")
    expect(feedback).toContain('window.requestAnimationFrame(commitNavigation)')
    expect(feedback).toContain('aria-busy={navigationPending || undefined}')
    expect(feedback).toContain('recoveryTimeoutRef.current = window.setTimeout')
    expect(feedback).toContain('navigationPending ? pendingFallback : children')

    const imperativeNavigationFiles = filesUnder(componentRoot)
      .filter((path) => path.endsWith('.tsx'))
      .map((path) => ({ path, contents: source(path) }))
      .filter(({ contents }) => /router\.(?:push|replace)\(/.test(contents))
    expect(imperativeNavigationFiles).toEqual([])
  })

  it('keeps the shared shell bounded, overflow-safe and safe-area aware', () => {
    const shell = source(join(routeRoot, 'HouseholdChoreShell.tsx'))

    expect(shell).toContain('overflow-x-clip')
    expect(shell).toContain('max-w-lg')
    expect(shell).toContain('env(safe-area-inset-top)')
    expect(shell).toContain('env(safe-area-inset-bottom)')
    expect(shell).toContain('break-words')
    expect(shell).toContain('aria-label={backLabel}')
    expect(shell).toContain('<ArrowLeft aria-hidden')
  })

  it('revalidates member-only payloads on tab visibility, persisted restore and route change without app-focus refresh', () => {
    const boundary = source(join(
      routeRoot,
      '(content)',
      'HouseholdChoreAuthorityBoundary.tsx',
    ))

    expect(boundary).not.toContain("window.addEventListener('focus'")
    expect(boundary).not.toContain("window.addEventListener('blur'")
    expect(boundary).toContain("document.addEventListener('visibilitychange'")
    expect(boundary).toContain("window.addEventListener('pageshow'")
    expect(boundary).toContain('if (event.persisted)')
    expect(boundary).toContain('checkedPathRef.current !== pathname')
    expect(boundary).toContain('router.refresh()')
    expect(boundary).toContain('if (isPending || pathChanged)')
    expect(boundary).toContain('<TeskeidLoader')

    const picker = source(join(
      process.cwd(),
      'components',
      'household-chores',
      'HouseholdChorePersonPicker.tsx',
    ))
    expect(picker).not.toContain("window.addEventListener('focus'")
    expect(picker).not.toContain("document.addEventListener('visibilitychange'")
  })

  it('provides a localized bounded not-found state for guarded deep links', () => {
    const notFound = source(join(routeRoot, 'not-found.tsx'))

    expect(notFound).toContain("getTranslations('teskeid.householdChores')")
    expect(notFound).toContain("t('notFoundTitle')")
    expect(notFound).toContain("t('notFoundDescription')")
    expect(notFound).toContain('HOUSEHOLD_CHORES_PATH')
    expect(notFound).toContain('min-h-11')
  })

  it('exposes the shared participant eligibility editor directly on definition details', () => {
    const detailPage = source(join(
      routeRoot,
      '(content)',
      '[circleId]',
      'verk',
      '[definitionId]',
      'page.tsx',
    ))

    expect(detailPage).toContain("import { ParticipantValueEditor }")
    expect(detailPage).toContain('<ParticipantValueEditor')
    expect(detailPage).toContain('definitionVersion={memberDetail.definition.version}')
    expect(detailPage).toContain('values={memberDetail.participantValues}')
    expect(detailPage).not.toContain("t('definitions.notEligible')")
  })

  it('keeps self-service discoverable for both full members and children', () => {
    const dashboard = source(join(componentRoot, 'CircleDashboard.tsx'))
    expect(dashboard.match(/householdChoreSelfServicePath\(circleId\)/g)).toHaveLength(2)
    expect(dashboard.match(/t\('dashboard\.selfAssign'\)/g)).toHaveLength(2)
  })

  it('keeps every text-entry control at a mobile-safe 16px font size', () => {
    const productionFiles = [
      ...filesUnder(componentRoot),
      ...filesUnder(routeRoot),
    ].filter((path) => path.endsWith('.tsx') && !path.includes(`${join('', '__tests__')}`))

    let checked = 0
    for (const file of productionFiles) {
      const tags = source(file).match(
        /<(?:input|select|textarea)\b(?:(?!<(?:input|select|textarea)\b)[\s\S])*?className="[^"]*"/g,
      ) ?? []
      for (const tag of tags) {
        if (/type=["'](?:checkbox|radio|hidden)["']/.test(tag)) continue
        checked += 1
        expect(
          tag,
          `${relative(process.cwd(), file)} has a text-entry control below the mobile-safe font contract`,
        ).toContain('text-base')
      }
    }
    // Manual participant entry moved into the canonical RelationshipPartyPicker,
    // whose text-base input contract is covered by its focused component test.
    expect(checked).toBeGreaterThanOrEqual(9)
  })

  it('preserves visible labels, pending navigation and keyboard-safe destructive confirmation', () => {
    const form = source(join(componentRoot, 'ChoreAssignmentForm.tsx'))
    const actions = source(join(componentRoot, 'ChoreAssignmentActions.tsx'))

    expect(form.match(/<label\b/g)?.length).toBeGreaterThanOrEqual(2)
    expect(form).toContain('useTransition()')
    expect(form).toContain('disabled={isPending}')
    expect(form).toContain("navigate(`${householdChoreAssignPath(circleId)}?")
    expect(actions).toContain('role="alertdialog"')
    expect(actions).toContain('aria-describedby="assignment-cancel-disclosure"')
    expect(actions).toContain("event.key === 'Escape'")
    expect(actions).toContain('cancelConfirmRef.current?.focus()')
    expect(actions).toContain('focus-visible:ring-2')
  })
})
