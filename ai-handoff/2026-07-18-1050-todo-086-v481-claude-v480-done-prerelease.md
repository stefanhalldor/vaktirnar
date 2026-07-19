# 2026-07-18 10:50 - TODO 086 v481 - Claude v480 done, prerelease

Created: 2026-07-18 10:50
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1030-todo-086-v479-codex-v478-review-and-next-pulse-map-polish.md`
- `ai-handoff/2026-07-18-1032-todo-086-v480-codex-v479-localhost-followup.md`

## What was implemented

### 1. FIX: Safnpúls (ConditionsFeedPreview) now always visible on /vedrid

**Root cause:** `ConditionsFeedPreview` was in `vegagerdinProvider.renderPreMap`. The shell only
calls `renderPreMap` for `activeProviders` — providers where `isVisible=true AND !unavailableReason`.
When Vegagerðin cache is empty (`status='unavailable'`), `unavailableReason='empty'` → not in
`activeProviders` → feed not rendered.

**Fix:**

`components/weather/WeatherOverviewShell.tsx`:
- Added `renderFeedPreMap?: (ctx: ProviderContentCtx) => React.ReactNode` to `WeatherOverviewProviderConfig`.
- Renders for every provider where `!p.providerRestricted && !p.loadError`, regardless of `unavailableReason`.
- Placed before the existing `renderPreMap` block (which still only renders for `activeProviders`).

`components/weather/WeatherOverviewClient.tsx`:
- Moved `ConditionsFeedPreview` from `renderPreMap` to `renderFeedPreMap` on `vegagerdinProvider`.
- Feed is now visible even when Vegagerðin cache has no station data.
- Feed is still hidden when Vegagerðin is access-restricted (`providerRestricted=true`) or hit a load error.
- `emptyBehavior="hide"` continues to suppress empty state to public users.

### 2. EXTRACT: Reusable ProviderStationContextMap

`components/weather/ProviderStationContextMap.tsx` (new):
- Provider-neutral component wrapping `IcelandOverviewMap` in read-only mode.
- Accepts `primary: StationContextMarker` (selected station) and `related: StationContextMarker[]`
  (context stations from other providers).
- Groups related markers by `providerId` to build per-provider map layers.
- Renders a compact visible legend below the map: one row per provider, with all station names
  readable without hover (mobile-safe).
- Legend format: `[colored dot] ProviderLabel: Name1 · Name2 · Name3 (18.3 km)`
- `StationContextMarker` type is exported and accepts optional `meta` field for distance or other
  context text.
- Default map height: `h-[160px] sm:h-[200px] w-full` (same as the old local StationContextMap).

`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`:
- Removed local `StationContextMap` component (and its `IcelandOverviewMap` / `ProviderMapLayer`
  imports).
- Now uses `ProviderStationContextMap` from `@/components/weather/ProviderStationContextMap`.
- Primary marker: Vegagerðin selected station (`tone: 'ok'`).
- Related markers: nearby Veðurstofan stations (`tone: 'muted'`, `meta: '18.3 km'`).
- Legend will show distances next to station names.

### 3. VERIFIED: Vegagerðin pill stale-data semantics are correct

Reviewed `vegagerdinUnavailableReason` in `WeatherOverviewClient.tsx`:
- `restricted` — only when `vegagerdinRestricted=true` (401/403 from route).
- `error` — only when `vegagerdinLoadError=true` (5xx/network).
- `empty` — only when `stations.length === 0` (cache unavailable, no data).
- `undefined` — when stations exist, including when `measurementFreshness='stale'`.

**Stale measurements do NOT affect `unavailableReason`.** When the Vegagerðin cache has
`status='ok'` with `measurementFreshness='stale'` and `stations.length > 0`:
- `unavailableReason=undefined`
- `isUnavailable=false`
- `canInteract=true`
- Pill is fully clickable/toggleable.

Markers for stale stations get `tone: 'unavailable'` (grey) via `vegagerdinMarkerTone('stale')`,
which is correct — grey markers on the map, but the pill remains active.

If the cache is empty (`status='unavailable'`), then `unavailableReason='empty'` and the pill is
truly disabled. This is the correct product behavior for "no cached data exists" — the user cannot
interact with a layer that has no markers to show.

No code changes were needed for pill semantics. Visual distinction between
`isUnavailable` (40% opacity, `cursor-default`) and loading (`cursor-default` without opacity
reduction) is already in place.

### 4. FIX: Stale comment in lib/chat/api.server.ts

Updated comments on `WEATHER_PULSE_ALL_TARGET_TYPES` and `WEATHER_PULSE_PRIMARY_TARGET_TYPES`:
- `ALL_TARGET_TYPES` now clearly says: "read, mark-read, and report" (not "write").
- `PRIMARY_TARGET_TYPES` now clearly says: "write / POST messages only; Veðurstofan threads are
  read-only".
- References updated to mention `getThreadProvider` / `getMessageProvider` (not the removed
  `assertThreadScope`).

## SQL 81 / thread creation failure

**SQL 81 has NOT been run.** Vegagerðin thread creation will fail at the DB CHECK constraint
because `target_type='vegagerdin_station'` is not yet a permitted value.

The client correctly shows: "Náði ekki að opna skilaboðaþráðinn. Reyndu aftur."

**Púlsinn getur ekki búið til Vegagerðin thread fyrr en SQL 81 er keyrt.**

This is a DB-side blocker. No code fix is appropriate. When SQL 81 is applied, thread creation
will succeed without any further code change.

## Commands run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 5 test files, 114 tests passed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid`.
2. **Safnpúls (ConditionsFeedPreview):** should now appear even when Vegagerðin cache is empty.
   - If the feed has messages, they show in the collapsible drawer.
   - If no messages exist, nothing is shown (emptyBehavior="hide").
3. **Vegagerðin pill:** if cache has stations (even stale), pill is active/toggleable (filled).
   Toggle off → markers hide. Toggle on → markers reappear.
4. If cache is empty (no stations), pill is disabled (greyed 40% opacity). This is correct.
5. Open a Vegagerðin station pulse:
   - If SQL 81 not applied: "Náði ekki að opna skilaboðaþráðinn. Reyndu aftur." — expected.
   - If SQL 81 applied: chat panel opens normally.
6. Context map below the chat panel: should now show a **compact legend** with station names below
   the map. Example:
   - `[green dot] Vegagerðin: Sandskeið`
   - `[grey dot] Veðurstofan: Selfoss (18.3 km) · Flúðir (24.1 km) · Stórólfshvoll (31.5 km)`
7. On mobile width 390–460 px:
   - No horizontal overflow.
   - Legend names readable without hover.
   - Map controls not obscured.
   - Compose box does not cause zoom or layout jump.

## SQL / Supabase

- No SQL was run.
- SQL 81 is the only remaining blocker for Vegagerðin thread creation.
- Do not run SQL without Stebbi's explicit approval.

## Files changed

- `components/weather/WeatherOverviewShell.tsx` — added `renderFeedPreMap` slot
- `components/weather/WeatherOverviewClient.tsx` — moved ConditionsFeedPreview to `renderFeedPreMap`
- `components/weather/ProviderStationContextMap.tsx` — new reusable component
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx` — use ProviderStationContextMap, remove local StationContextMap
- `lib/chat/api.server.ts` — updated comments on ALL/PRIMARY target type constants
