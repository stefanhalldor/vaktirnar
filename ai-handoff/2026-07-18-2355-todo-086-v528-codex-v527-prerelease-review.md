# 2026-07-18 23:55 - TODO 086 v528 - Codex: v527 prerelease review

Review target:

- `2026-07-18-2350-todo-086-v527-claude-v525v526-done-prerelease`

Scope:

- Review only. No app code changed.
- One new review/handoff file written: this file.
- No SQL run.
- No commit, push, deploy or production action.

## Findings

1. **High: `/vedrid` bottom CTA appends `?from=...&to=...`, but `/ferdalagid` does not read those params**

   `components/weather/WeatherOverviewClient.tsx:550` says the bottom CTA carries current route context into `/ferdalagid`, and lines `555-559` append `from` and `to`.

   The receiving pages do not pass any `searchParams` into `FerdalagidClient`:

   - `app/vedrid/ferdalagid/page.tsx:18`
   - `app/auth-mvp/vedrid/ferdalagid/page.tsx:12`

   `app/auth-mvp/vedrid/FerdalagidClient.tsx:228` only restores prior full route results from `sessionStorage`; it does not parse `from`/`to` query params. So v527 localhost check #10 is likely false as written: the URL opens with `?from=Reykjavík&to=Akureyri`, but the trip screen will still start on an empty route step unless there is unrelated sessionStorage state from a previous trip.

   Fix before release: implement a real reusable route-draft handoff contract from overview to trip screen, then add a test for it.

2. **Medium: `PlaceSearch` returns rich place data, but v527 immediately throws most of it away**

   `components/weather/OverviewRouteLensPanel.tsx:42-48` resolves route lens with only `{ from: fromPlace.name, to: place.name }`. `components/weather/WeatherOverviewClient.tsx:555-559` also only serializes names.

   That means we lose:

   - `formattedAddress`
   - `lat`
   - `lon`
   - `placeId`

   For the current provisional curated-corridor filter this is enough, but it works against the direction Stebbi is asking for: one `/vedrid` screen that can evolve into actual route context and eventually exact/cached route matching. We should preserve the selected `PlaceSearch` objects as route-draft state, even if the current filter still resolves by name.

   Fix: make the overview route selection state carry both the selected places and the derived route-lens result. Keep the reusable contract provider-neutral and aligned with `IcelandRoadmap.md`.

3. **Medium: "No new Google cost" is too strong**

   v527 line 44 says there is no new Google cost beyond `/ferdalagid`. It is true that v527 adds no Google Routes call. But putting `PlaceSearch` directly on `/vedrid` creates a new Google Places autocomplete surface on the overview page. A user can now trigger Places calls without entering `/ferdalagid`.

   This may be an acceptable tradeoff, but the handoff should say it plainly:

   - No Google Routes calls added.
   - Google Places autocomplete can now be triggered on `/vedrid`.
   - Inputs are debounced and Iceland-restricted.
   - Further cost control should be considered later if traffic grows.

4. **Low: `openTripLabel` is now dead label/interface surface**

   v527 intentionally leaves `openTripLabel` in `OverviewRouteLensPanelLabels`, but `components/weather/OverviewRouteLensPanel.tsx:15` no longer renders it. This is not harmful, but it is stale API surface. Either remove it now, or add a clear TODO that it remains only until message cleanup.

5. **Low/UX: cache miss leaves the whole Iceland map visible**

   This is consistent with `filterStationIdsForRouteLens()` returning `null` on `cache_miss`, and v527 says "no false route filter." That is safe, but make the user-facing copy explicit enough that Stebbi does not read the full map as a filtered result. This matters because the product direction is "Frá/Til filters the map."

## What Looks Good

- Good reuse choice: `OverviewRouteLensPanel` now uses the same `PlaceSearch` component as `/ferdalagid`.
- The route lens remains local and does not call Google Routes.
- `IcelandRoadmap.md` wording is better: "curated corridor route lens" is more honest than "cache-only."
- Provider separation for route-filtered station IDs is good because Vegagerðin and Veðurstofan can have overlapping external station IDs.
- Type-check and targeted tests pass in my verification too.

## Commands I Ran

```bash
git status --short
git diff --stat
npm run type-check
npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel.test.ts
```

Results:

- `npm run type-check` exit `0`
- Targeted tests: `4 passed`, `250 passed`, `5 skipped`
- `git status` emitted permission warnings for `C:\Users\Lenovo/.config/git/ignore`, but the status command completed.

## Route Intelligence Check

- Route/domain area: `/vedrid` route lens, overview-to-trip route handoff, curated corridor filtering.
- The direction is aligned with `WORKFLOW.md` and `IcelandRoadmap.md`: reusable route-domain logic should live under `lib/iceland-routes/`.
- Current implementation is still provisional and corridor-based, not exact geometry.
- No new route data is stored in Supabase.
- Privacy: selected place names are currently placed in URL query params. If we add coordinates/place IDs, decide deliberately whether to use URL params or tab-scoped `sessionStorage`.
- `IcelandRoadmap.md` does not need a new structural section for v527, but it should be updated in the next pass if the route-draft handoff becomes part of the reusable contract.

## Recommended Next Large Step For Claude Code

Please do one focused-but-substantial hardening pass before considering release.

### A. Implement a real overview-to-ferdalagid route-draft contract

Goal: when a user enters `Frá` and `Til` on `/vedrid` and taps `Ferðalagið`, `/vedrid/ferdalagid` or `/auth-mvp/vedrid/ferdalagid` opens with those same places already selected.

Recommended shape:

1. Add a small reusable route-draft helper, preferably in `lib/iceland-routes/routeDraft.ts` or another clearly named shared file.
2. Preserve the full `PlaceSearch` result:
   - name
   - formattedAddress
   - lat
   - lon
   - placeId
3. Use a privacy-aware handoff:
   - Prefer same-tab `sessionStorage` for full draft place data.
   - Keep the URL marker minimal, e.g. `?routeDraft=1`, unless Stebbi explicitly wants shareable URLs with coordinates/place IDs.
4. `WeatherOverviewClient` should store the selected route draft and write it before navigating via the bottom CTA.
5. `FerdalagidClient` should read the route draft on mount before or alongside existing route-result restore:
   - set `origin`
   - set `destination`
   - clear stale `result`, `routeOptions`, `selectedRouteId`, ferry state and errors as needed
   - stay on `step === 'route'` so route options load and the user can choose route as usual
6. Do not auto-submit travel weather yet unless that is explicitly approved. Prefill route first; exact single-screen behavior can come after.

### B. Keep the route-lens filter provider-neutral

The route lens should still filter both providers from one shared result:

- Veðurstofan station IDs from the route lens
- Vegagerðin station IDs from the same route lens

Do not create separate route-selection logic per provider.

### C. Fix wording around cost

Update handoff/docs/comments so they say:

- no Google Routes calls are added on `/vedrid`
- Google Places autocomplete is now available on `/vedrid`
- this is debounced and Iceland-restricted

### D. Clean small stale API surface

Either remove unused `openTripLabel` from `OverviewRouteLensPanelLabels` and messages if it is now truly unused, or mark it explicitly as deferred cleanup. Prefer removing if safe.

### E. Tests To Add Or Update

Add focused tests for:

1. route draft serialization/parsing:
   - preserves name, formattedAddress, lat, lon, placeId
   - rejects invalid/corrupt payload
   - expires/removes stale draft if you add expiry
2. overview CTA URL/helper:
   - idle route returns plain trip href
   - selected route uses the draft marker or expected URL shape
3. `FerdalagidClient` draft restore behavior, if existing test setup can cover it:
   - starts with origin/destination selected when route draft exists
   - does not jump straight to result
   - stale existing route result is not reused for a different draft

## Localhost Checks For Stebbi

After Claude fixes the above, please test:

1. Open `/vedrid` as public.
2. Select `Frá: Reykjavík` and `Til: Akureyri`.
3. Confirm map filters to the expected provisional north route.
4. Click bottom `Ferðalagið`.
5. Expected: `/vedrid/ferdalagid` opens with Reykjavík and Akureyri already selected on the route step.
6. Expected: route options load as they normally do, and no stale previous route result appears.
7. Repeat as logged-in user from `/auth-mvp/vedrid`.
8. Repeat with a route that is a cache miss on `/vedrid`.
9. Refresh `/vedrid` after selecting route fields:
   - current expected behavior may still be reset unless Claude explicitly implements overview state persistence.
10. Confirm mobile:
   - no iOS zoom on PlaceSearch focus
   - no horizontal overflow
   - keyboard/focus does not throw the page into a weird scroll position

No SQL, Supabase, Vercel, env, production, commit, push or deploy action is part of this next pass unless Stebbi explicitly approves it.
