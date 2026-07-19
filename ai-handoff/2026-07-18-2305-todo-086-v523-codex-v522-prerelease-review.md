# 2026-07-18 23:05 - v523 Codex review of v522

Review target: `2026-07-18-1853-todo-086-v522-claude-v521-done-prerelease`

## Findings

1. **High / release blocker: `/vedrid` can crash when provider data arrives**

   In `components/weather/WeatherOverviewClient.tsx`, `routeFilterIds` is read before it is initialized.

   - Veðurstofan markers read it at lines 178-198, especially line 186.
   - Vegagerðin markers read it at lines 309-333, especially line 321.
   - `routeFilterIds` is only declared later at lines 337-350.

   This can pass `tsc`, but at runtime it can throw:

   ```text
   ReferenceError: Cannot access 'routeFilterIds' before initialization
   ```

   It may not crash on the very first render while provider data is still `null`, but as soon as `data` or `vegagerdinData` is truthy, the render path evaluates the marker maps before the `const routeFilterIds = ...` line has executed.

   **Fix before release:** move the route-filter computation above both provider layer constructions. The safest shape is:

   - declare provider data state first
   - compute provider-specific route filter sets
   - build Veðurstofan and Vegagerðin layers from those sets

2. **Medium: route filtering is not provider-safe**

   `filterStationIdsForRouteLens()` returns a plain `Set<string>` of raw station IDs in `lib/iceland-routes/lensFilter.ts:32-50`.

   `WeatherOverviewClient.tsx:339-350` combines Veðurstofan and Vegagerðin stations into one array and then both providers check `routeFilterIds.has(s.stationId)`.

   That means a Veðurstofan station and Vegagerðin station with the same raw ID can leak into each other's visibility decision. It might be rare, but both providers have external station IDs and this is exactly the kind of provider-neutral abstraction where collisions should be impossible by construction.

   **Fix:** use provider-qualified keys, for example:

   ```ts
   type RouteLensTargetKey = `${'vedurstofan' | 'vegagerdin'}:${string}`
   ```

   Or compute two separate sets:

   - `vedurstofanRouteFilterIds`
   - `vegagerdinRouteFilterIds`

   Add a unit test where both providers have `stationId = "123"` but only one coordinate is on the route.

3. **Medium: selected station detail can remain visible after route filtering hides its marker**

   Veðurstofan detail visibility only checks status filters in `WeatherOverviewClient.tsx:221-232`.

   Vegagerðin detail visibility only checks status filters in `WeatherOverviewClient.tsx:533-537`.

   Neither checks the new route lens filter. If a user opens a station, then applies a `Frá`/`Til` filter that excludes that station, the marker can disappear while the detail card stays visible. That makes the map and detail disagree.

   **Fix:** use the same route visibility predicate for:

   - marker visibility
   - status counts
   - selected station detail visibility
   - optional selection clearing when route lens changes

4. **Medium: place matching is too permissive and can false-match unrelated destinations**

   `matchesAny()` in `lib/iceland-routes/lensResolver.ts:29-31` accepts `alias.startsWith(normalized)`. This allows very short or broad user input to match a route family.

   Example risk: `routeFamilies.ts:49-62` includes the alias `land` for the south-coast family. With the current matching strategy, inputs around `land`, partial names, or names that start with `land...` can resolve to the south-coast corridor even when the user did not mean that.

   **Fix:** tighten alias matching before expanding this feature:

   - remove broad aliases like `land`
   - avoid `alias.startsWith(normalized)` unless `normalized.length` is safely long and token-based
   - add negative tests, for example Landmannalaugar, Akranes, Reykjanes, and short partial inputs

5. **Low / product accuracy: this is a curated corridor lens, not a real route-cache lookup yet**

   The implementation is directionally good and has no Google cost, but `lensResolver.ts:1-6` and `IcelandRoadmap.md:122-138` describe this as "cache-only". From the code it is really a hand-curated route-family/corridor resolver, not a lookup against stored Google route cache.

   That is fine for this phase, but the wording should be honest:

   - UI: "Bráðabirgðaniðurstöður" is good.
   - Code/docs: prefer "curated corridor" or "local route lens" until real route cache is wired in.

6. **Low / Design.md consistency: label styling uses tracking/uppercase**

   `OverviewRouteLensPanel.tsx:78` and `OverviewRouteLensPanel.tsx:93` use `uppercase tracking-wide`.

   Design guidance says letter spacing should be 0 unless there is a concrete reason. This is small, but since this is a new reusable control on the primary `/vedrid` screen, use the normal Teskeið label style instead of all-caps/tracking.

## What Looks Good

- Good direction: `/vedrid` gets lightweight `Frá`/`Til` filtering without calling Google.
- The new route-domain landing zone in `lib/iceland-routes/` is the right architectural place.
- The feature is provider-neutral in intent: Veðurstofan and Vegagerðin are both filtered by one route concept.
- Tests were added for the lens basics.
- `IcelandRoadmap.md` was updated, which is exactly the workflow we wanted for route-related work.

## Validation I Ran

Commands:

```bash
npm run type-check
npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/vegagerdinFallback.test.ts lib/__tests__/windObservationStatus.test.ts
```

Results:

- `npm run type-check` -> exit 0
- targeted Vitest run -> exit 0, 4 files passed, 75 tests passed

I did not run localhost/browser tests.

## Route Intelligence Check

This touches `/vedrid` overview routing, route families, provider-station matching, and the new IcelandRoadmap direction.

- Route/domain area touched: curated route families for south coast, east, north, and westfjords.
- Correct landing zone: yes, `lib/iceland-routes/`.
- Provider-neutral direction: yes, but provider IDs need to be namespaced so neutrality does not create ID collision bugs.
- Cache/privacy: no new route data is persisted and no Google calls are made, so privacy/cost risk is low.
- Needed next fixtures: provider ID collision, false alias matches, and detail-hidden-when-route-filtered.
- Roadmap state: updated, but should rename "cache-only" to "curated corridor/local route lens" unless real route cache is added.

## Design Check

Relevant `Design.md` points:

- Mobile-first app feel: the inline route lens is okay in spirit, but Stebbi should check that the two inputs and clear button do not create horizontal overflow on narrow mobile widths.
- Text should fit containers: inputs use `text-base`, which helps avoid iOS zoom, good.
- Letter spacing should be 0: remove `tracking-wide` from the new labels.
- Navigation should show feedback: `Ferðalagið` CTA is a normal link, but there is no pending state here. Acceptable for now if it navigates quickly, but if it routes through a loading segment, rely on existing `loading.tsx`.

## Recommended Next Step For Claude Code

Do not expand the feature yet. First harden v522, then take one larger continuation step.

### Step A - Fix v522 hardening blockers

1. Fix the TDZ/runtime crash:
   - Move `routeFilterIds` or its replacement above both map layer constructions.
   - Preserve React hook order.

2. Make route filter provider-safe:
   - Use provider-qualified route target keys or separate provider-specific sets.
   - Add collision regression test.

3. Apply the same route-filter predicate everywhere:
   - marker visibility
   - status counts
   - selected detail visibility
   - clear selected station if route lens changes and selected marker is now outside the route

4. Tighten route alias matching:
   - remove `land`
   - remove duplicate `isafjordur`
   - avoid broad partial matches
   - add positive and negative tests

5. Rename docs/comments from "cache-only" to "curated corridor/local route lens" unless the code truly reads route cache.

6. Remove `tracking-wide`/uppercase label style from `OverviewRouteLensPanel`.

### Step B - Larger continuation after hardening

Once Step A is green, continue in one larger pass:

1. Add route alternatives to the overview lens where route families already know meaningful alternatives:
   - north vs south/east when appropriate
   - Hólmavík route for Westfjords
   - Öxi vs "til að sleppa við Öxi" as a future route-family item, but keep this aligned with the existing deferred Öxi/Höfn/Reynisfjall notes

2. Keep it no-Google-cost:
   - all overview filtering is local/curated for now
   - `Ferðalagið` remains the place to run full Google-backed route calculation

3. Keep feeding `IcelandRoadmap.md`:
   - each new route family should become reusable route-domain data, not a one-off UI condition

## Localhost Checks For Stebbi

After Claude fixes the hardening items:

1. Open `/vedrid` as public user.
2. Confirm the page does not crash after both providers load.
3. Try `Frá: Reykjavík`, `Til: Akureyri`.
   - Expected: map filters to a reasonable north-route corridor.
   - Status pills counts should match visible points only.
   - Opening a station and then changing route should not leave an off-route detail card open.
4. Try `Frá: Reykjavík`, `Til: Vík`.
   - Expected: south-coast corridor only.
5. Try a non-matching or risky input like `Landmannalaugar`.
   - Expected: no false south-coast match unless explicitly supported.
6. Toggle Vegagerðin/Veðurstofan source time selector.
   - Expected: route filter remains consistent and provider markers do not bleed into each other.
7. Click `Ferðalagið`.
   - Expected: `/vedrid/ferdalagid` opens with the same from/to prefilled.

No SQL, Supabase, auth, Vercel, env, production, or migration action is part of these localhost checks.

## Release Recommendation

Not ready to release as-is because of the `routeFilterIds` runtime crash risk. Fix Step A first, then rerun type-check, targeted tests, and a localhost smoke test on `/vedrid`.
