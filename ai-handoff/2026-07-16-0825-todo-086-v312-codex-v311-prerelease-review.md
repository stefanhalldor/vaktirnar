# 2026-07-16 08:25 — Codex review of v311 prerelease

Created: 2026-07-16 08:25  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-16-0823-todo-086-v311-claude-v310-done-prerelease`  
Relevant TODO: `todo-086`

## Findings

### High — v311 restore fix can still clear the restored result on the initial effect pass

`app/auth-mvp/vedrid/FerdalagidClient.tsx:221-269` restores route-result state from `sessionStorage` and sets `restoredCoordsRef.current`.

`app/auth-mvp/vedrid/FerdalagidClient.tsx:340-361` then tries to skip the route-clear effect only when current `origin`/`destination` coords match `restoredCoordsRef.current`.

The problem is React effect ordering:

1. Initial render has `origin = null`, `destination = null`, `result = null`.
2. Restore effect runs and schedules `setOrigin(...)`, `setDestination(...)`, `setResult(...)`, and sets `restoredCoordsRef.current`.
3. In the same effect flush, the route-clear effect runs with the initial render closure values: `origin = null`, `destination = null`.
4. The coord match check fails because state has not re-rendered yet.
5. The clear effect runs `restoredCoordsRef.current = null`, `setResult(null)`, and `sessionStorage.removeItem(ROUTE_RESTORE_KEY)`.

So the v310 blocker is very likely still present: refresh/login-return can lose the restored result before the hydration render gets a chance to show it.

Recommended fix:

- Treat `restoredCoordsRef.current !== null` as a hydration-in-progress state.
- If restored coords exist but current coords are not ready yet, return without clearing and keep the ref.
- On the next render, when origin/destination are present:
  - if they match restored coords, clear the ref and return without clearing result;
  - if they do not match, clear the ref and proceed with normal invalidation.

Example logic shape, not exact required code:

```ts
const restored = restoredCoordsRef.current
if (restored) {
  const coordsReady =
    origin?.lat !== undefined &&
    origin?.lon !== undefined &&
    destination?.lat !== undefined &&
    destination?.lon !== undefined

  if (!coordsReady) return

  if (
    origin.lat === restored.originLat &&
    origin.lon === restored.originLon &&
    destination.lat === restored.destLat &&
    destination.lon === restored.destLon
  ) {
    restoredCoordsRef.current = null
    return
  }

  restoredCoordsRef.current = null
}
```

Do not release v311 until this is fixed and manually verified with a real refresh.

### Medium — stale restore storage is still not invalidated for ferry/route-option changes

v311 invalidates session storage when `origin` or `destination` coordinates change. The handoff explicitly says ferry port and route option changes do not invalidate session storage yet.

This is still a meaningful edge case because a restored route result may include ferry selection or selected route context. If the user changes those before recalculating and refreshes, an older result can come back.

Recommended fix:

- Invalidate `ROUTE_RESTORE_KEY` whenever a user action invalidates the current result, not only coordinate changes.
- At minimum include:
  - ferry port changes in `handleFerryPortSelected`;
  - selected route changes if route selection can be changed after a result exists;
  - threshold changes if they clear/dirty the displayed result before recalculation.
- Avoid invalidating during restore hydration.

If Claude Code wants to defer this, make it an explicit accepted limitation in the UI/session restore contract. But it is not quite “allir útreikningar varðveitast” yet.

### Low — old `VedridClient` still has the header back arrow, though it may be unused

`app/auth-mvp/vedrid/page.tsx` now renders `FerdalagidClient`, and v311 correctly removes the header back arrow there.

However `app/auth-mvp/vedrid/VedridClient.tsx:112-126` still has the old `ChevronLeft` header. If `VedridClient` is dead code, this is harmless cleanup debt. If any route still renders it later, the old misleading back arrow can reappear.

Recommended:

- Either confirm `VedridClient` is unused and leave it for cleanup, or align its header too.
- Do not broaden this unless it is quick and clearly safe.

## Confirmed Good

- `FerdalagidClient` no longer imports or renders `ChevronLeft` in the main `/vedrid` and `/auth-mvp/vedrid` trip shell.
- `WeatherResultLoader` now accepts two generic `bullets` instead of three process `steps`.
- Icelandic and English message files now use responsibility/disclaimer text:
  - `messages/is.json:639-641`
  - `messages/en.json:635-637`
- User-facing text remains in translation files, not hardcoded in the loader.
- Public refresh button remains hidden by `!isGuest` in `showVedurstofanRefreshButton`.

## Design.md Alignment

The header simplification aligns with the app-like navigation guidance: one stable menu affordance is clearer than a misleading back arrow.

The loader copy change is also aligned if kept compact. The current two-bullet structure is reasonable and mobile-safe, but Stebbi should check it on narrow mobile width because both lines are longer than the old process steps.

## Commands Run By Codex

Read-only inspection plus this review file only:

- `Get-Content -LiteralPath 'ai-handoff/2026-07-16-0823-todo-086-v311-claude-v310-done-prerelease.md'`
- `Get-Content -LiteralPath 'ai-handoff/README.md'`
- `rg -n "ROUTE_RESTORE|restore|sessionStorage|..." ...`
- Targeted `Get-Content` reads of:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `app/auth-mvp/vedrid/VedridClient.tsx`
  - `components/weather/WeatherResultLoader.tsx`
  - `messages/is.json`
  - `messages/en.json`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Codex did not run tests, type-check, dev server, SQL, Supabase, commit, push or deploy.

## Suggested Next Step For Claude Code

Do a tight v313 patch:

1. Fix the restore hydration guard so the first route-clear effect pass cannot remove restored state before origin/destination have re-rendered.
2. Invalidate restore storage on every user action that invalidates a result, or explicitly scope the restore contract down and document it.
3. Optionally remove the stale back arrow from `VedridClient` if it is still reachable.
4. Run targeted test/type-check.

Keep this scoped. Do not add new provider/pulse behavior in this patch.

## Localhost Checks For Stebbi

After Claude Code fixes v312:

1. Calculate a route on `/vedrid` as public.
   - Expected: loader shows two responsibility bullets, not old “Sæki leið...” steps.
   - Expected: no back arrow next to `Veðrið`.

2. With the result visible, refresh the page.
   - Expected: same route result returns.
   - Expected: map, worst point, selected departure slot, provider filters, Veðurstofan cards and pulse preview remain consistent.

3. From a result, open a station pulse, log in if needed, then go back/return.
   - Expected: route result context survives.

4. After a restored result, change origin or destination and refresh before recalculating.
   - Expected: old result does not reappear.

5. If ferry routes or route alternatives are available, change that selection and refresh before recalculating.
   - Expected: no stale older result reappears.

6. Mobile check at ~360-390px width:
   - Expected: loader bullets wrap cleanly, no horizontal overflow, no manual zoom needed.

No production/Supabase testing is needed for this patch unless Claude Code changes API/auth/storage beyond client-side restore behavior.

## Uncertainty / Needs Confirmation

- I did not browser-test the effect ordering. The high finding is based on React effect semantics and the current code order. It should be confirmed with a manual refresh test after the fix.
- I did not run the test suite; Claude Code reports `npx tsc --noEmit` passed in v311.
