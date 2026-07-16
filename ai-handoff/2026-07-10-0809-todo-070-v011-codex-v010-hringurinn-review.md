# Codex review: TODO #70 v010 - Hringurinn + cleanup

Created: 2026-07-10 08:09  
Timezone: Atlantic/Reykjavik

Reviewed handoff:

- `2026-07-10-0805-todo-070-v010-claude-v009-hringurinn-done.md`

## Findings

### Medium - Hringurinn rule is intentionally broad, but Stebbi should explicitly confirm that broadness

File: `lib/weather/google.server.ts`, lines 132-168

The new `long-trip-ring-road` rule matches:

- origin inside `CAPITAL_AREA_BOUNDS`
- destination anywhere inside `ICELAND_BOUNDS`
- fastest Google route distance >= 350 km

This matches Stebbi's latest product direction for long trips from the capital area and should make `Reykjavík/Garðabær -> Akureyri` show `Hringurinn`.

However, it also means long trips from the capital area to places like parts of the Westfjords or other non-ring-road destinations may get a very long southern/eastern/northern route option. That may be acceptable because Stebbi explicitly said this is not UI noise and that people may want to see the ring road for travel/weather reasons. Still, this is the main product decision to confirm on localhost before release.

Recommended decision:

- If Stebbi wants exactly "one extra Hringurinn option for all long capital-area trips", keep this.
- If Stebbi only wants it for north/east destinations, narrow `destination` from `ICELAND_BOUNDS` to a purpose-built north/east bounds set.

### Medium - Via coordinates are still the release gate

File: `lib/weather/google.server.ts`, lines 135-139 and 159-167

Claude correctly flags the via coordinates as pending visual verification. This is the real release risk, not TypeScript.

The rule is only safe if Google snaps these via-points to clean Route 1 geometry without sending users into town streets or weird loops:

- Hellisheiði
- Mýrdalssandur / south coast Route 1
- between Höfn and Djúpivogur
- south of Egilsstaðir

Do not ship this without Stebbi confirming at least:

- `Reykjavík -> Akureyri`
- `Garðabær -> Akureyri`
- `Reykjavík -> Egilsstaðir`
- one long destination that is *not* Akureyri/Egilsstaðir if we keep the broad `ICELAND_BOUNDS` behavior

### Low - Extra Google calls are expected, but worth keeping visible in diagnostics

File: `lib/weather/google.server.ts`, lines 141-168 and 449-455

For some long east/southeast trips, this can create more than one curated request:

- regular Google alternatives request
- `Um Hellisheiði`
- `Hringurinn`

That is consistent with the product goal, but it is direct Google API usage. The current dev diagnostics already show `curatedRules`, which is good. No change required unless usage/cost starts to matter.

## What Looks Good

- Þrengslavegur curated rule was removed as requested.
- `Fljótlegasta leið` -> `Fljótlegasta leiðin` is in `messages/is.json`.
- `CURATED_RING_ROAD` has highest label priority in `RouteSelectionStep.tsx`, so it will display as `Hringurinn`.
- `minFastestRouteDistanceM: 350_000` implements the long-trip gate cleanly.
- Existing route geometry dedupe is reused and `existingIds` is updated between curated route requests.
- The implementation keeps route rules centralized in the curated route registry instead of scattering one-off logic through UI code.

## Verification Run By Codex

Codex ran:

```txt
npm run type-check
```

Result: clean.

Codex ran:

```txt
npm run test:run -- lib/__tests__/weather-google.test.ts
```

Result: 1 test file passed, 78 tests passed.

Codex did not run full `npm run test:run`; Claude's handoff says full suite passed with 1980 tests.

## Localhost checks for Stebbi

Before release, Stebbi should test `/auth-mvp/vedrid`:

1. `Reykjavík -> Þorlákshöfn`
   - Expected: no extra `Um Þrengslaveg` option.
   - Expected: normal Google fastest route should be enough.
   - Expected: no `Hringurinn`.

2. `Garðabær -> Hveragerði` or `Garðabær -> Selfoss`
   - Expected: `Um Hellisheiði` can still appear.
   - Expected: no `Hringurinn` because route is under 350 km.

3. `Reykjavík -> Akureyri`
   - Expected: `Fljótlegasta leiðin` plus `Hringurinn`.
   - Expected: `Hringurinn` should go south/east/north on Route 1, not into odd local detours.
   - Select `Hringurinn` and continue through the weather flow; no `selected_route_unavailable`.

4. `Garðabær -> Akureyri`
   - Same expected behavior as Reykjavík -> Akureyri.

5. `Reykjavík -> Egilsstaðir`
   - Expected: `Um Hellisheiði` and possibly `Hringurinn`, unless geometry dedupe removes one.
   - Labels must be understandable and not duplicate-looking.

6. One long route from capital area that is not Akureyri/Egilsstaðir.
   - This is to confirm whether the broad "all long trips from capital area" rule feels good or too broad.

7. On every Hringurinn option:
   - inspect the map shape before selecting;
   - route should stay on Route 1 / sensible ring road;
   - no loops into towns caused by via-point placement.

No Supabase/auth/RLS/SQL testing is required. Do not run migrations.

## Release Recommendation

Do not commit/push until the via-points are visually confirmed on localhost.

If localhost confirms clean Route 1 geometry, this is okay to release from a code-safety perspective.

If any Hringurinn route has a weird detour, adjust only the via coordinates first and rerun:

```txt
npm run test:run -- lib/__tests__/weather-google.test.ts
```

Then repeat localhost route visual checks.

## Óvissa / þarf að staðfesta

The main uncertainty is not automated-test coverage. It is product scope:

- Should `Hringurinn` appear for all long capital-area trips inside Iceland, including possible Westfjords-style trips?
- Or should it be constrained to north/east destinations for now?

Stebbi's latest message suggests the broad version is intentional. If that is still true after localhost testing, no code change is needed.
