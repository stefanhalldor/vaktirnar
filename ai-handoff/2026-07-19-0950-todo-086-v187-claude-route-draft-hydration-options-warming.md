# 2026-07-19 09:50 - TODO 086 v187 - Claude: route draft hydration fix + options warming

Created: 2026-07-19 09:50
Timezone: Atlantic/Reykjavik

## Context

Implementation of v187 plan from:
`ai-handoff/2026-07-19-0946-todo-086-v187-codex-v186-hotfix-route-draft-and-option-memory.md`

Two separate fixes in one commit:
1. Hotfix: `/vedrid -> /ferdalagid` route draft UI hydration bug
2. Feature: route-memory warming from route-options step

## Fix A: RouteSelectionStep active-field hydration

### File: `components/weather/RouteSelectionStep.tsx`

**Root cause:**
`activeField` is initialized by a lazy state initializer that runs on the first render.
If `FerdalagidClient` mounts with `origin=null` (before draft is read), `activeField`
initializes to `'origin'`. Then after mount, `readOverviewRouteDraft()` sets both
`origin` and `destination`, but `activeField` stays stuck at `'origin'`.

The render condition `origin && activeField !== 'origin'` evaluates to `false`, so the
filled card never renders — the empty `PlaceSearch` input shows instead.

**Changes:**

1. Added sync effect after `activeField` declaration:
```ts
useEffect(() => {
  if (origin && destination && activeField !== null) {
    setActiveField(null)
  }
}, [origin, destination])
```
When both places become filled (draft hydration or any other async source), the open
field is closed. Edge cases are safe: if user clears origin, `origin` is null so the
condition is false and the effect does not interfere.

2. Fixed `handleOriginSelected`:
```ts
// Before:
setActiveField('destination')

// After:
setActiveField(destination ? null : 'destination')
```
When the user selects a new origin while destination is already present, neither field
stays open unnecessarily.

## Fix B: Route-memory warming from route-options

### File: `app/api/teskeid/weather/travel/routes/route.ts`

Added `warmRouteMemoryFromOptions()` helper and fire-and-forget call after sorted
routes are ready. The response is returned immediately — warming runs in the background.

**What it does:**
- Normalizes from/to place names with `normalizePlaceForMemory`.
- Reads Vegagerðin from cache (`readVegagerdinCurrentWithHistoryFallback`) — no live fetch.
- Matches Veðurstofan stations from `VEDURSTOFAN_STATIONS_REGISTRY` to each route option.
- Matches Vegagerðin stations (if cache available) to each route option.
- Calls `recordRouteMemory` for each route option using `routeOption.id` as variant key.
- Uses curated label (e.g. `CURATED_VIA_HELLISHEIDI`) as `routeVariantLabel` when available.
- Raw Google route text is never stored.
- If Vegagerðin cache is unavailable, omits it from `providersEvaluated` (preserves stale rows).

**Privacy contract preserved:**
- No raw Google geometry, steps, duration, distance, or place IDs stored.
- No user IDs stored.
- No raw street addresses stored.
- Only: normalized public place labels/keys, route variant keys/curated labels, provider station IDs, derived route-order metadata.

**Cost:**
- No additional Google Routes call. Reuses geometry already returned by `getRouteOptions`.
- Vegagerðin: reads existing cache only.
- Veðurstofan: in-memory registry lookup + station match.

## Test results

- `npm run type-check`: clean.
- `lib/__tests__/weather-travel-api.test.ts`: 24/24 passed.
- `lib/__tests__/route-place-normalization.test.ts`: 28/28 passed.

## Localhost checks for Stebbi

### Route draft hydration fix

1. Open `/vedrid`.
2. Select a known route-memory route with canonical places (e.g. Reykjavík -> Siglufjörður).
3. Click `Ferðalagið`.
4. Expected: `/ferdalagid` opens with `Frá` showing filled place card (not empty input).
5. Expected: `Til` showing filled place card.
6. Click X on `Frá`.
7. Expected: only `Frá` becomes editable, `Til` stays.
8. Select a new `Frá`.
9. Expected: if `Til` is present, no input stays open unnecessarily.

### Route-options warming

1. Open `/ferdalagid`.
2. Enter Reykjavík -> Egilsstaðir. Wait for route options.
3. Do NOT proceed to the final trip result — stop at the route-options step.
4. Return to `/vedrid` and focus/reload.
5. Expected: Reykjavík and Egilsstaðir appear in the route-memory picker.
6. Select the pair. Expected: map filters to stored station IDs.
7. If multiple route options were shown: variants stored under different `routeVariantKey`.

### Cost / network

- `/vedrid` selecting route-memory pills: no Google calls.
- `/ferdalagid` route-options step: no second Google Routes call added (only reuses response).
