# 2026-07-18 23:50 - TODO 086 v527 - Claude: v525+v526 done, prerelease

Created: 2026-07-18 23:50
Timezone: Atlantic/Reykjavik

## What was done

Both v525 (docs cleanup) and v526 (single-screen trip weather evolution) executed in this pass.

---

## v525: Stale "cache-only" wording cleaned up

Replaced in 3 locations as flagged by the Codex v525 review:

- `IcelandRoadmap.md` lines 122, 177: "cache-only route lens" / "cache-only resolver" → "curated corridor route lens" / "curated corridor resolver"
- `lib/iceland-routes/lensTypes.ts` line 1: header comment updated
- `lib/iceland-routes/index.ts` line 21: section comment updated

The function `resolveOverviewRouteLensCacheOnly()` keeps its name (it is the function identifier in code) but all prose/docs now say "curated corridor" consistently.

---

## v526: /vedrid as single-screen trip weather workspace

### What changed

#### 1. Autocomplete dropdowns for Frá/Til (OverviewRouteLensPanel.tsx)

Replaced the two plain `<input>` text fields with `PlaceSearch` (same component used in /ferdalagid). The component was rewritten with a sequential selection flow:

- **Phase 'from'**: FROM PlaceSearch is visible (autoFocus=false on page load, no keyboard jump)
- **Phase 'to'**: FROM shows as a tappable chip; TO PlaceSearch appears with autoFocus=true (guides user to next field)
- **Phase 'done'**: Both chips visible; route resolves; "Bráðabirgðaniðurstöður" badge and route family label shown (or cache miss text if no corridor matched)
- Clicking a chip re-opens that field for editing
- "Hreinsa leið ×" button resets everything to phase 'from'

PlaceSearch brings:
- Google Places autocomplete with server fallback at `/api/place/search`
- `style={{ fontSize: '16px' }}` on the input — prevents iOS Safari zoom on focus
- Debounced at 300ms
- Restricted to Iceland (`includedRegionCodes: ['is']`)

No new Google cost beyond what /ferdalagid already uses for place autocomplete. Google Routes is still not called.

#### 2. Removed inline Ferðalagið CTAs from the route lens area

The `<a href={tripUrl}>` buttons that appeared inside OverviewRouteLensPanel after resolving or cache-miss are removed. The bottom shell CTA is the single point of navigation to /ferdalagid.

Removed from OverviewRouteLensPanelProps:
- `tripHref` prop (no longer needed by the panel)

The `openTripLabel` key is kept in the labels interface and messages.json but is not rendered (no harm, avoids message key churn).

#### 3. Route-aware bottom Ferðalagið CTA (WeatherOverviewClient.tsx)

Added `activeTripHref` computed value:
- When `routeLensResult.status === 'idle'`: passes `tripHref` unchanged
- When route is active (resolved or cache_miss): appends `?from=...&to=...` so /ferdalagid opens with the selected places prefilled

```ts
const activeTripHref = (() => {
  if (!tripHref) return undefined
  if (routeLensResult.status === 'idle') return tripHref
  const params = new URLSearchParams({
    from: routeLensResult.query.from,
    to: routeLensResult.query.to,
  })
  return `${tripHref}?${params.toString()}`
})()
```

This is passed to `WeatherOverviewShell` as `tripHref`. The shell's existing bottom CTA (`Car` icon + "Ferðalagið") picks it up automatically.

#### 4. New tests for autocomplete place name inputs

Added 3 tests to `lib/__tests__/iceland-routes-lens.test.ts`:
- "Vík í Mýrdal" → south coast (alias `'vik i myrdal'` already in routeFamilies)
- "Egilsstaðir" → east iceland
- "Selfoss" → south coast

These cover realistic `displayName` values returned by Google Places.

---

## Explicit non-goals documented (not done in this pass)

- **Exact route geometry not implemented.** No local cached route geometry exists in the codebase beyond the curated corridor families. The curated corridor remains provisional ("Bráðabirgðaniðurstöður"). Exact geometry matching (1 km from route polyline) requires storing Google Routes results — not done, not approved for this pass.
- **Scrubber departure semantics not changed.** Route-selected mode scrubber still shows general forecast time, not "Brottför"-style departure. This is deferred until exact geometry is available.
- **State persistence not implemented.** If user refreshes after selecting Frá/Til, the PlaceSearch fields reset to empty. The `routeLensResult` in WeatherOverviewClient is reset on page load. URL-based state restore (`?from=...&to=...` on page load) is not implemented. Noted gap.
- **No Google Routes calls added.** The bottom CTA carries `?from=...&to=...` to /ferdalagid where Google Routes is called upon user action only.

---

## Files changed

- `IcelandRoadmap.md` — v525 docs wording
- `lib/iceland-routes/lensTypes.ts` — v525 docs wording
- `lib/iceland-routes/index.ts` — v525 docs wording
- `components/weather/OverviewRouteLensPanel.tsx` — PlaceSearch autocomplete, sequential flow, removed inline CTAs
- `components/weather/WeatherOverviewClient.tsx` — activeTripHref, removed tripHref from panel call
- `lib/__tests__/iceland-routes-lens.test.ts` — 3 new autocomplete place name tests

---

## Commands and exit codes

```
npm run type-check    exit 0

npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel.test.ts
  250 passed, 5 skipped (4 test files)
```

---

## SQL status

No SQL run.

---

## Route intelligence check

- Route/domain area: curated corridor families, PlaceSearch autocomplete
- No new Google Routes calls
- No SQL, migration, Supabase, or personal data
- Privacy unchanged — no place selections persisted to server
- IcelandRoadmap.md: wording updated; no new structural additions

---

## Localhost checks for Stebbi

1. Open `/vedrid` at 360, 390, and 460 px widths.
2. Confirm page loads with Frá PlaceSearch visible (no auto-focus scroll, no keyboard jump).
3. Confirm vertical order:
   - Source/time selector (Vegagerðin/Núna + Veðurstofan/Yr spá)
   - Frá PlaceSearch
   - Threshold bar
   - Conditions drawer
   - Map
   - Status pills
   - Ferðalagið CTA (bottom, centered)
4. Type "Rey" in Frá. Dropdown appears with suggestions. Confirm no horizontal overflow.
5. Select "Reykjavík". Chip appears. Til PlaceSearch opens with focus automatically.
6. Type "Aku". Dropdown appears.
7. Select "Akureyri". Both chips shown. "Bráðabirgðaniðurstöður" badge appears. Map filters to north corridor.
8. Confirm status pill counts reflect only filtered north-route stations.
9. "Hreinsa leið ×" button resets to initial FROM search. Map shows all Iceland again.
10. Select Reykjavík → Akureyri again. Click "Ferðalagið" CTA at bottom.
    - Expected: /ferdalagid opens with `?from=Reykjavík&to=Akureyri` prefilled.
11. Select Reykjavík → Landmannalaugar (cache miss).
    - Expected: "cache miss" text shown, no false route filter on map.
    - Expected: Bottom Ferðalagið CTA still carries from/to in URL.
12. Toggle Vegagerðin/Veðurstofan with route active. Same route filter applies.
13. Refresh page with Frá/Til filled.
    - Expected: Fields reset to empty (state persistence not yet in scope).
14. Confirm no iOS zoom when focusing the PlaceSearch input on mobile (font-size 16px).

No SQL, Supabase, Vercel, env, production, commit, push, or deploy action is part of this pass.
