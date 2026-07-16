# Codex review: TODO #75 v010 — Phase 1 release gate

Created: 2026-07-08 21:34
Timezone: Atlantic/Reykjavik
Agent: Codex
Review target: `2026-07-08-2110-todo-075-v009-claude-phase1-done.md`
Related TODO: #75

---

## Findings fyrst

1. **Major — route-point forecast drawer highlights stale/default forecast time in active slot mode.**
   In `app/auth-mvp/vedrid/FerdalagidClient.tsx:964` and `app/auth-mvp/vedrid/FerdalagidClient.tsx:1018`, `Spá 🥄` for map/list route points uses `pt.summaryForWindow?.forecastTimeIso` even when an active timeline/heatmap slot is selected. The label at `app/auth-mvp/vedrid/FerdalagidClient.tsx:966` / `:1020` then says the drawer is based on the active departure time, but the highlighted row can still be the default summary time. This can make the drawer look trustworthy while pointing at the wrong hour. Fix before release.

2. **Medium — TODO #75 does not appear to be registered in `TODO.md`.**
   v001/v002 said #75 was not yet in TODO. `TODO.md` still lists weather items through #74 in the weather package summary. Before release bookkeeping, either add #75 as in progress/done or explicitly connect this work to an existing TODO. Otherwise release history gets muddy.

3. **Medium — raw met.no links are still in the normal user link rows.**
   `components/weather/TravelAuditMap.tsx:776-781`, `app/auth-mvp/vedrid/FerdalagidClient.tsx:1220-1222`, and `app/auth-mvp/vedrid/FerdalagidClient.tsx:1351` still expose `Hrá met.no gögn`. Earlier v003/v005 direction was `Spá 🥄 · Yr · Google Maps`, with raw met.no debug-only. This is probably not a hard release blocker if Stebbi accepts it, but it is not the final intended link pattern.

4. **Minor — temperature trend is color-coded as good/bad.**
   `lib/weather/travel.ts:621` marks temperature up as `positive` and down as `negative`, and `components/weather/ForecastDrawer.tsx:77-106` colors it green/amber. Earlier product direction was that temperature should be neutral until frost/hálka semantics exist. This can wait if localhost looked good, but it may imply “warmer is always better” or “colder is bad”, which is not always true.

---

## Release recommendation

Do **not** start Phase 2 in the same release.

Recommended sequence:

1. Fix the active-slot highlighted row issue.
2. Re-run type-check/tests, or at least rely on Claude's already reported clean run plus a targeted localhost check.
3. Ship Phase 1.
4. Let Phase 1 breathe in production.
5. Start Phase 2 as a separate TODO/handoff after release.

If Stebbi wants to ship today, keep Phase 2 out of the deploy. Phase 2 should include night filtering and possibly gust trend arrows, but not ride along with a release that already touches forecast payload, drawer UI, destination weather, map panel, route rows, messages and tests.

---

## Specific fix for Finding 1

For `Spá 🥄` opened from a route point:

- If active candidate mode is selected, compute the point ETA with `estimatePointEtaIso(activeCandidate, pt, activeLeg)`.
- Then choose the nearest forecast row/hour to that ETA.
- Use that row's `timeIso` as `highlightedTimeIso`.
- If the point is the active `displayPoint`, prefer `activeCandidate.displayPoint.forecastTimeIso`.
- Only fall back to `pt.summaryForWindow?.forecastTimeIso` when no active candidate is selected.

This was already the intended rule in v002/v003. v009 almost gets there, but the drawer open callback is still using default `summaryForWindow`.

---

## What looks good

- The phase is reasonably scoped: forecast drawer reuse, threshold-aware rows, hviður in wind cell, destination drawer reuse.
- `buildForecastRows(...)` is server-side and testable.
- Gust severity is threshold-driven via `ResolvedTravelThresholds`.
- Claude reports `type-check clean` and `all 1958 tests pass`.
- Stebbi reports localhost testing went well.
- The new `ForecastDrawer` is mobile-minded (`max-w-md`, bottom sheet, max height).

---

## Suggested Phase 2 scope

Keep Phase 2 focused:

- Night/time-of-day filter, default `Allt`.
- Warning when hidden rows include yellow/red/danger/caution weather.
- Optional gust trend arrows after mobile testing confirms the wind cell has room.
- Revisit whether temperature trend should stay neutral or get frost-aware semantics.

Do not mix Phase 2 with route-provider/Mapbox work, no-data diagnosis, or unrelated weather TODOs.

---

## Localhost checks for Stebbi

Before release:

1. Open `/auth-mvp/vedrid` on the localhost port Stebbi is running.
2. Calculate a route with several forecast points, e.g. Garðabær -> Þorlákshöfn or Garðabær -> Akranes.
3. Select a different departure slot in the timeline/heatmap, not just the default first slot.
4. Open `Spá 🥄` from:
   - destination arrival block,
   - `Mest krefjandi á leiðinni`,
   - one ordinary row under `Allir spápunktarnir á leiðinni`.
5. Expected: highlighted row matches the selected departure/ETA context, not the old default summary time.
6. Expected: hviður show inside the wind cell and become more/less cautionary when thresholds change and the result is recalculated.
7. Expected: 390 px mobile viewport has no horizontal overflow.
8. Expected: closing drawer via overlay and X works.
9. Expected: `Yr` and `Google Maps` links still open externally.

Do not casually test production data, Supabase, RLS, auth or SQL for this item. This should be a client/server weather-result UI release only; no migration should be involved.

---

## Codex conclusion

Phase 1 is close, but I would not deploy it unchanged because the route-point drawer highlight can be wrong after selecting a different departure time.

Fix that one issue, tidy TODO/release bookkeeping, then ship Phase 1. Start Phase 2 afterwards as a separate handoff/release, not immediately in the same deploy.
