# 2026-07-19 05:42 - TODO 086 v538 - Claude: v537 hardening done, prerelease

Created: 2026-07-19 05:42
Timezone: Atlantic/Reykjavik

---

## Devil's advocate review

Before implementing, the following were verified:

1. **Finding 1 scope** — The empty-filter hint should appear only when `visibleStatuses.size > 0` AND the active provider layer has markers but all are `visible: false`. Auto-reset was explicitly ruled out by Codex ("Do not auto-enable `innan-marka`"). The hint is additive and does not change filter semantics.

2. **Finding 2 scope** — Comment-only change, zero runtime impact. Confirmed lines 22, 37, 103 in `WeatherSourceTimeSelector.tsx` all said "Veðurstofan/Yr". Changed to accurate descriptions since Yr is not wired.

3. **Finding 3 scope** — Import addition + 2 new `it` blocks appended to the existing `windObservationStatus.test.ts` file. No structural changes to existing tests.

4. **No SQL, no migration, no commit, no push** — all three tasks are UI/copy/test changes only.

---

## Task 1 — Empty-filter hint (Finding 1)

**Files:** `messages/is.json`, `messages/en.json`, `components/weather/WeatherOverviewClient.tsx`

### New message key

`overviewFilterEmpty` in the `teskeid.vedrid.overview` namespace:

- **is:** `"Engin stöð fellur undir virku síurnar."`
- **en:** `"No station matches the active filters."`

### allMarkersHidden computation

Added between `overviewStatusCounts` useMemo and `vegagerdinProvider` config:

```ts
// True when a status filter is active but every marker in the active layer is hidden by it.
// Used to show a compact hint so users know the empty map is a filter artifact.
const allMarkersHidden: boolean = (() => {
  if (visibleStatuses.size === 0) return false
  const activeLayer = activeMode === 'now' ? vegagerdinLayer : vedurstofanLayer
  if (!activeLayer || activeLayer.markers.length === 0) return false
  return activeLayer.markers.every(m => !m.visible)
})()
```

This is an IIFE (not a useMemo) since both `vegagerdinLayer` and `vedurstofanLayer` are already computed inline each render and are not memoized themselves.

### Updated renderBelowMap

The `WindStatusFilterPills` is now wrapped in a `flex flex-col gap-2` div. When `allMarkersHidden` is true, a compact hint appears below the pills:

```tsx
renderBelowMap: () => (
  <div className="flex flex-col gap-2">
    <WindStatusFilterPills
      counts={overviewStatusCounts}
      visibleStatuses={visibleStatuses}
      onVisibleStatusesChange={setVisibleStatuses}
      showAllLabel={tf('mapFilterShowAll')}
      showAllButton
    />
    {allMarkersHidden && (
      <p className="text-xs text-muted-foreground text-center">
        {tOv('overviewFilterEmpty')}{' '}
        <button
          type="button"
          onClick={() => setVisibleStatuses(new Set())}
          className="underline hover:no-underline"
        >
          {tf('mapFilterShowAll')}
        </button>
      </p>
    )}
  </div>
),
```

Design choices:
- `text-xs text-muted-foreground text-center` — quiet, consistent with other informational text
- Reuses existing `mapFilterShowAll` translation key for the inline button (no new key needed for that label)
- `underline hover:no-underline` — standard inline link style, clearly tappable

---

## Task 2 — Stale Veðurstofan/Yr comments (Finding 2)

**File:** `components/weather/WeatherSourceTimeSelector.tsx`

Three comments updated:

| Line | Before | After |
|------|--------|-------|
| 22 (interface) | `// Veðurstofan/Yr forecast group` | `// Forecast provider group (Veðurstofan forecast slots; Yr not yet wired)` |
| 37 (JSDoc) | `* - A scrollable right section: Veðurstofan/Yr forecast time slots with status dots` | `* - A scrollable right section: forecast provider time slots with status dots` |
| 103 (JSX) | `{/* Right: Veðurstofan/Yr forecast slots — scrollable */}` | `{/* Right: forecast provider slots (Veðurstofan forecast; Yr not yet wired) — scrollable */}` |

No runtime change. Clears the misleading "Yr" references from developer-visible code while preserving the "Yr not yet wired" context.

---

## Task 3 — Unit test for DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES (Finding 3)

**File:** `lib/__tests__/windObservationStatus.test.ts`

Added `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES` to the existing import, then appended a new `describe` block at the end of the file:

```ts
describe('DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES', () => {
  it('includes all four actionable statuses', () => {
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('nalgast-othaegindi')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('othaegilegt')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('nalgast-haettumork')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('haettulegt')).toBe(true)
  })

  it('excludes low-signal statuses hidden by default', () => {
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('innan-marka')).toBe(false)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('no_data')).toBe(false)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('no_wind_data')).toBe(false)
  })
})
```

This protects against accidental regression of Stebbi's product decision to hide low-signal statuses by default.

---

## Files changed

- `messages/is.json` — `overviewFilterEmpty` added
- `messages/en.json` — `overviewFilterEmpty` added
- `components/weather/WeatherOverviewClient.tsx` — `allMarkersHidden` IIFE, `renderBelowMap` updated
- `components/weather/WeatherSourceTimeSelector.tsx` — 3 stale comments updated
- `lib/__tests__/windObservationStatus.test.ts` — import extended, 2 new tests appended

---

## Commands and exit codes

```
npm run type-check    exit 0

npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
  106 passed (4 test files)
```

(104 tests from v536 + 2 new DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES tests = 106)

---

## SQL status

No SQL run. Migration status unchanged from v536:

| Migration | Status |
|-----------|--------|
| `sql/82_weather_user_preferences.sql` | NOT READY — `Nota mörk` is local-only |
| `sql/83_vegagerdin_measurements_history.sql` | NOT READY — no writer/reader |
| `sql/84_metno_point_forecasts_history.sql` | NOT READY — Yr not wired |
| `sql/85_route_observation_aggregate.sql` | DRAFT — DO NOT RUN |

---

## Route intelligence check

- No route/domain changes. All three tasks are UI copy, comment cleanup, and test additions.
- No raw Google route content, addresses, or place IDs stored.
- IcelandRoadmap.md: no update needed.

---

## Design.md check

- Empty-filter hint: `text-xs text-muted-foreground text-center` — quiet, no new size tokens
- Inline show-all button: no minimum tap target issue (it appears alongside the existing `Sýna allt` pill, which is the primary tap target; the inline link is secondary)
- No horizontal overflow, no layout shift, no new font sizes

---

## Localhost checks for Stebbi

1. Open `/vedrid` on 390px mobile width.
2. Confirm the default map shows only actionable wind statuses as before.
3. **New test**: If all visible stations are actionable, tap a single actionable pill to deselect it while others are selected — so no markers match.
4. Expected: below the filter pills, a quiet grey line reads `"Engin stöð fellur undir virku síurnar. Sýna allt"` (is) / `"No station matches the active filters. Show all"` (en).
5. Tap the inline `Sýna allt` in that hint. Expected: all markers reappear, hint disappears.
6. Confirm the forecast group selector header says `Veðurstofan (spá)`, not `Veðurstofan/Yr` (unchanged from v536).
7. Confirm no SQL has been run, no production change made.

---

## Release stance

All three Codex v537 findings are addressed:

1. **Medium/UX empty-filter hint** — done. The map no longer looks broken when all markers are filtered out.
2. **Low/Docs stale Yr comments** — cleaned.
3. **Low/Test DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES** — protected.

v538 is release-ready for the `/vedrid` overview polish pass (TODO 086). No SQL, no migration, no commit, no push, no deploy.
