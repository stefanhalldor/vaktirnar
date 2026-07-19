# 2026-07-18 23:17 - v525 Codex review of v524

Review target: `2026-07-18-2314-todo-086-v524-claude-v523-done-prerelease`

## Findings

1. **Low / docs cleanup: a few "cache-only" references remain**

   v524 fixed the most important code comment in `lib/iceland-routes/lensResolver.ts`, but stale wording remains in:

   - `IcelandRoadmap.md:122`
   - `IcelandRoadmap.md:131`
   - `IcelandRoadmap.md:177`
   - `lib/iceland-routes/lensTypes.ts:1`
   - `lib/iceland-routes/index.ts:21`

   This is not a release blocker. The product behavior is clearer now, and the UI already says "Bráðabirgðaniðurstöður". Still, before the next handoff chain drifts, rename these to "curated corridor", "local route lens", or "no-Google route lens" so we do not confuse this with a real persisted route cache.

## What Looks Fixed

- The v523 release blocker is addressed. `routeFilterIds` no longer exists as one late-declared shared value. The route filter sets are computed before map layers in `components/weather/WeatherOverviewClient.tsx:293-313`.
- Provider collision risk is materially reduced. Veðurstofan and Vegagerðin now get separate route filter sets in `WeatherOverviewClient.tsx:297-313`.
- Detail cards now respect route filtering:
  - Veðurstofan: `WeatherOverviewClient.tsx:357-369`
  - Vegagerðin: `WeatherOverviewClient.tsx:531-537`
- Alias matching is safer. `lensResolver.ts:31-35` removed the broad `alias.startsWith(normalized)` behavior.
- Broad south-coast aliases were removed, and duplicate Ísafjörður was removed in `routeFamilies.ts:49-60` and `routeFamilies.ts:154-164`.
- Label styling in `OverviewRouteLensPanel.tsx:78-94` now avoids `uppercase tracking-wide`, matching `Design.md` better.
- Test coverage improved with negative alias tests and provider collision regression tests in `lib/__tests__/iceland-routes-lens.test.ts`.

## Validation I Ran

Commands:

```bash
npm run type-check
npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/vegagerdinFallback.test.ts lib/__tests__/windObservationStatus.test.ts
```

Results:

- `npm run type-check` -> exit 0
- targeted Vitest run -> exit 0, 4 files passed, 80 tests passed

I did not run localhost/browser tests.

## Route Intelligence Check

This is route-related work and still belongs in `IcelandRoadmap.md` / `lib/iceland-routes/`.

- Route/domain area touched: `/vedrid` overview route lens, provider-neutral station filtering, route-family aliases.
- Provider-neutrality: improved. The implementation now avoids raw provider ID collision by using separate provider filter sets.
- Google/cost: no Google Routes calls added.
- Privacy: no route data persisted, no user route history added.
- Roadmap: updated earlier, but stale "cache-only" wording should be cleaned up.
- Next route-domain need: route alternatives and route-family expansion should go into reusable `lib/iceland-routes/`, not one-off `/vedrid` UI logic.

## Design Check

Relevant `Design.md` points checked:

- Mobile-first: new inputs use `text-base`, which avoids iOS focus zoom.
- No letter-spacing: label styling was fixed.
- Text fit / overflow: still needs Stebbi localhost checks at 360, 390, and 460 px because two text inputs plus clear button are tight on mobile.
- Reusable components: route lens is a dedicated component and route logic sits in `lib/iceland-routes/`, which fits the current architecture direction.

## Recommendation

This v524 hardening looks good enough for localhost testing and no longer has the v523 blocker.

I would not spend another micro-pass on this before testing unless Claude wants to do the docs wording cleanup in the same pass. The next meaningful step should be larger and product-facing.

## Suggested Next Large Step

Ask Claude Code to continue with the next large route-lens phase:

1. Clean stale "cache-only" wording:
   - `IcelandRoadmap.md`
   - `lib/iceland-routes/lensTypes.ts`
   - `lib/iceland-routes/index.ts`

2. Add route alternatives into the local route lens model, still with no Google calls:
   - Hólmavík / Vestfirðir route family option
   - north/east/south family distinctions where meaningful
   - leave the deferred Öxi/Höfn/Reynisfjall work explicitly behind the current immediate phases unless Stebbi pulls it forward

3. Make the route lens UI show that route filtering is active without feeling like a final exact route:
   - keep "Bráðabirgðaniðurstöður"
   - show the matched route-family label
   - keep `Ferðalagið` as the exact route calculation CTA

4. Add regression tests for:
   - route lens clear/reset
   - provider-specific filtering with same IDs
   - cache miss keeps all stations visible
   - common valid routes still resolve after alias tightening

5. Keep all route-domain additions in `lib/iceland-routes/` and update `IcelandRoadmap.md` in the same pass.

## Localhost Checks For Stebbi

Before release:

1. Open `/vedrid` as public user at 360, 390, and 460 px widths.
2. Confirm no crash after Vegagerðin and Veðurstofan data load.
3. Confirm no horizontal overflow when focusing `Frá` and `Til`.
4. Try `Reykjavík` -> `Akureyri`.
   - Expected: map filters to north corridor.
   - Status pill counts should reflect only filtered visible points.
5. Open a station detail, then change the route to `Reykjavík` -> `Vík`.
   - Expected: previously selected off-route detail disappears.
6. Try `Reykjavík` -> `Landmannalaugar`.
   - Expected: cache miss message, all stations remain visible.
7. Clear with `×`.
   - Expected: all stations visible again.
8. Toggle Vegagerðin/Veðurstofan source selector while route filter is active.
   - Expected: same route lens applies to both providers without weird bleed-through.
9. Click `Ferðalagið`.
   - Expected: route calculation page opens with from/to prefilled.

No SQL, Supabase, Vercel, env, production, commit, push, or deploy action is part of this review.
