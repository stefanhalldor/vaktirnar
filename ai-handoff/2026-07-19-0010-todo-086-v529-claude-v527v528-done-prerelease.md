# 2026-07-19 00:10 - TODO 086 v529 - Claude: UI reorder + v528 hardening done, prerelease

Created: 2026-07-19 00:10
Timezone: Atlantic/Reykjavik

## What was done

Three things executed in this pass:

1. UI reorder — Stebbi's screenshot annotation was correctly applied
2. v528 Finding 1 (High) — route-draft contract from /vedrid to /ferdalagid
3. v528 Findings 2-5 — PlaceResult preservation, openTripLabel cleanup, tests

---

## UI Reorder

Codex v526 misread Stebbi's screenshot annotation. The numbers 1-7 drawn on the screenshot were DESIRED POSITIONS, not reference labels. The correct desired order is:

1. Conditions drawer (Fréttir af aðstæðum frá notendum Teskeiðarinnar)
2. Map
3. Status pills
4. Source/time selector (Vegagerðin / Veðurstofan)
5. Weather thresholds
6. Frá/Til route inputs
7. Ferðalagið CTA (bottom)

### Changes

**`WeatherOverviewShell.tsx`**:
- Added `renderBelowSelector?: () => React.ReactNode` prop (for thresholds between source selector and Fra/Til)
- Reordered the render tree to match the above desired order:
  - `renderFeedPreMap` (conditions) moved to TOP, before map
  - Map stays in middle
  - `renderBelowMap` (pills) immediately under map
  - `renderPostMap` (station detail cards) after pills
  - `renderProviderSelector` moved BELOW map/pills area
  - `renderBelowSelector` (thresholds) NEW SLOT after source selector
  - `renderRouteLens` (Fra/Til) below thresholds
  - CTA at bottom

**`WeatherOverviewClient.tsx`**:
- Split `vegagerdinProvider.renderFeedPreMap` — now only ConditionsFeedPreview (conditions at top)
- Added `renderBelowSelector` passed to shell, containing WeatherThresholdBar (thresholds below source selector)

---

## v528 Finding 1 (High): Route-draft contract

**Problem**: bottom CTA appended `?from=...&to=...` but FerdalagidClient never read those URL params.

**Fix**: sessionStorage route-draft contract.

### New file: `lib/iceland-routes/routeDraft.ts`

```
writeOverviewRouteDraft(from, to)  — writes RouteDraftPlace pair to sessionStorage
readOverviewRouteDraft()           — reads draft if valid and not expired (5 min TTL)
clearOverviewRouteDraft()          — removes draft
```

Key properties:
- Tab-scoped (sessionStorage), not URL-visible
- 5 minute TTL
- Schema version guard
- Robust validation (rejects corrupt/partial payloads)
- No Google Routes involvement

### `OverviewRouteLensPanel.tsx`

Added `onPlacesChange?: (from: PlaceResult | null, to: PlaceResult | null) => void` prop.
Called on every selection or clear, giving the parent full PlaceResult objects (name, formattedAddress, lat, lon, placeId).

### `WeatherOverviewClient.tsx`

- Tracks `fromPlaceDraft` and `toPlaceDraft` as `RouteDraftPlace | null`
- `useEffect` writes draft to sessionStorage when both are set; clears it when either is cleared
- Passes `onPlacesChange` to OverviewRouteLensPanel
- `activeTripHref` still appends `?from=...&to=...` to the bottom CTA (name-based, for display)

### `FerdalagidClient.tsx`

Modified the mount `useEffect` to handle two cases in priority order:

1. **Existing route result** (`ROUTE_RESTORE_KEY`): restore as before → set step='result', done
2. **Overview route draft** (if no route result): read draft → pre-fill origin + destination → clear draft → stay on step='route' so user selects route options normally

Full place data (name, lat, lon, formattedAddress, placeId) is passed to `setOrigin`/`setDestination`.

---

## v528 Finding 2 (Medium): PlaceResult data preserved

Selected place objects (lat/lon/formattedAddress/placeId) are now preserved in WeatherOverviewClient state and written to the draft. The lens resolver still uses only place names for corridor matching (correct for now). The full coordinates are available for future exact geometry matching without any additional UI work.

---

## v528 Finding 3 (Medium): Google cost clarification

No Google Routes calls are added to /vedrid. Google Places autocomplete is now available on /vedrid (same as /ferdalagid) — debounced 300ms, Iceland-restricted (`includedRegionCodes: ['is']`). Documented here and in this handoff.

---

## v528 Finding 4 (Low): openTripLabel removed

Removed `openTripLabel` from `OverviewRouteLensPanelLabels` interface and from the WeatherOverviewClient labels call. The message keys `routeLensOpenTrip` remain in messages/is.json and messages/en.json (harmless, avoids churn).

---

## v528 Finding 5 (Low/UX): cache miss copy

No change to the copy itself (`routeLensCacheMiss`). The message already says "Þessi leið er ekki í hraðskjánum enn. Notaðu Ferðalagið til að reikna hana nákvæmlega." This is accurate. No action needed.

---

## Files changed

- `components/weather/WeatherOverviewShell.tsx` — renderBelowSelector slot, new render order
- `components/weather/WeatherOverviewClient.tsx` — conditions/thresholds split, draft state + effect, onPlacesChange, openTripLabel removed
- `components/weather/OverviewRouteLensPanel.tsx` — onPlacesChange prop added, openTripLabel removed
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — mount useEffect with draft restore
- `lib/iceland-routes/routeDraft.ts` — NEW: route-draft helpers
- `lib/iceland-routes/index.ts` — export routeDraft types + functions
- `lib/__tests__/overview-route-draft.test.ts` — NEW: 11 tests

---

## Commands and exit codes

```
npm run type-check    exit 0

npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/weather-travel.test.ts
  143 passed, 5 skipped (3 test files)
```

---

## SQL status

No SQL run.

---

## Route intelligence check

- Route/domain area: overview-to-trip route draft handoff, PlaceSearch integration on /vedrid
- No Google Routes calls
- Privacy: full place data (lat/lon/placeId) stored tab-scoped in sessionStorage only, not in URL
- No new route data persisted to Supabase
- IcelandRoadmap.md: no structural update needed (routeDraft is a handoff utility, not a domain model change)

---

## Localhost checks for Stebbi

**UI order:**
1. Open `/vedrid`. Confirm top-to-bottom:
   - Conditions drawer (collapsed, collapsible)
   - Map
   - Status pills
   - Source/time selector (Vegagerðin Núna / Veðurstofan/Yr)
   - Weather threshold controls
   - Frá PlaceSearch input
   - Ferðalagið CTA (bottom center)
2. Confirm at 360, 390, 460 px — no horizontal overflow, no card-in-card.

**Autocomplete and route draft:**
3. Type "Rey" in Frá. Dropdown appears. Select Reykjavík.
4. Til PlaceSearch appears with focus. Type "Aku". Select Akureyri.
5. Map filters to north corridor. "Bráðabirgðaniðurstöður" badge shows.
6. Click bottom Ferðalagið CTA.
7. Expected: /vedrid/ferdalagid opens with Reykjavík and Akureyri already filled in the route step (NOT an empty form).
8. Expected: route options load normally. No stale previous result shown.

**Cache miss:**
9. Select Reykjavík → Landmannalaugar. Cache miss message appears. Map shows all Iceland.
10. Click Ferðalagið. Opens with Reykjavík and Landmannalaugar prefilled (from draft).

**Draft expiry:**
11. Select a route on /vedrid. Wait 5+ minutes without clicking Ferðalagið. Then click.
12. Expected: /ferdalagid opens without draft prefill (draft expired).

**Session restore priority:**
13. Complete a full trip calculation on /ferdalagid. Close tab. Reopen.
14. Expected: previous trip result still restores (session restore takes priority over any stale draft).

No SQL, Supabase, Vercel, env, production, commit, push, or deploy action is part of this pass.
