# TODO-067 v204 - Codex review/recommendation for v203 via-waypoint implementation

Created: 2026-07-08 13:42
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Review/recommendation. No app code changed by Codex.

## Recommendation

Codex recommends: **test v203 on localhost now**.

Do not revert to v201 only. v203 is the right next experiment:

- `SHORTER_DISTANCE` is removed from active routing.
- The curated `Um Þrengslaveg` option is generated inside `googleProvider.getRouteOptions()`, so route picker and final submit use the same route set.
- The trigger is narrow enough for testing: destination Þorlákshöfn plus capital-area origin.
- Saved/recent coordinate selections can still trigger it through the Þorlákshöfn bounds, not only Place ID.

But do **not** commit/push/deploy yet. First Stebbi needs to verify whether the via coordinate actually produces the expected Route 39/Þrengslavegur route.

## Findings

### Medium - Curated route label can be hidden if the curated route is fastest

Current label logic checks `idx === 0` before it checks `CURATED_VIA_THRENGSLAVEGUR`:

- `components/weather/RouteSelectionStep.tsx:451-454`

If the curated Þrengslavegur route is fastest, it will show as `Fljótlegasta leið`, not `Um Þrengslaveg`.

That is not a blocker for localhost testing if Stebbi watches the map and terminal labels. But before release, Codex recommends checking curated label first or showing both meanings.

Preferred behavior:

- curated route title: `Um Þrengslaveg`
- optionally secondary/badge: `Fljótlegasta leið` if it is also fastest

This follows `Design.md`: short text, clear meaning, no color-only state, and user text in message files.

### Low - No explicit API-level final-submit test for selected curated route

The provider-level placement is good and should make final submit work because `/api/teskeid/weather/travel/route` recomputes `provider.getRouteOptions()` and matches `selectedRouteId`.

Still, before release it would be useful to add one route API test that selects a curated route id and confirms final submit does not return `selected_route_unavailable`.

This is lower priority than live validation of the via coordinate.

### Low - The via coordinate is intentionally unverified

`THRENGSLAVEGUR_VIA = { lat: 63.9550, lon: -21.4900 }` may or may not sit exactly on the road surface. If localhost shows `curatedAdded: false`, the next move is not to abandon the idea; it is to adjust the via coordinate and retest.

## Verification

Commands run by Codex:

```txt
npm run type-check
exit 0

npm run test:run
exit 0
58 files passed
1894 tests passed, 27 skipped, 8 todo
```

## What Stebbi Should Do Now

1. Run the localhost test for `Garðabær -> Þorlákshöfn`.
2. Use typed Google suggestions first.
3. Check the Next.js terminal for:
   - `curatedAdded: true` or `false`,
   - route labels,
   - distance/duration,
   - description.
4. In the UI, inspect the map path, not only the label.
5. If `curatedAdded: true`, select the curated/Route 39-looking option and continue through the wizard.
6. Confirm no `Valin leið fannst ekki`.

If the route appears and follows Þrengslavegur, then ask Claude Code for one small polish pass:

- fix label precedence so curated route is visibly `Um Þrengslaveg`,
- add final-submit regression test if practical,
- then Codex can do final pre-commit review.

If `curatedAdded: false`, ask Claude Code to adjust only `THRENGSLAVEGUR_VIA` and retest. Keep the rest of v203.

If `curatedAdded: true` but the line still follows Route 427 or makes a strange detour, the via point is wrong; adjust it rather than ship.

## Localhost checks for Stebbi

Primary:

1. `/auth-mvp/vedrid`
2. `Garðabær -> Þorlákshöfn`, typed Google suggestions.
3. Expected if successful: a distinct route option that follows Route 39/Þrengslavegur.
4. Select it and continue through the wizard.
5. Expected: no `selected_route_unavailable`.

Regression:

- `Þorlákshöfn -> Garðabær`: should remain unchanged.
- `Garðabær -> Selfoss`: no `Um Þrengslaveg`.
- `Garðabær -> Akureyri`: no `Um Þrengslaveg`.
- `Keflavík -> Þorlákshöfn`: no `Um Þrengslaveg`.
- `Grindavík -> Þorlákshöfn`: no `Um Þrengslaveg`.
- saved/recent `Garðabær -> Þorlákshöfn`: curated option should still trigger if destination coords are in bounds.

Do not test production, run migrations, or modify Supabase data.

## Files changed by Codex

- Added this review/recommendation file only.

## Tests run

- `npm run type-check`
- `npm run test:run`

## Uncertainty / needs confirmation

The only decisive unknown is live Google behavior for the via coordinate. v203 is structurally the right experiment; localhost will tell us whether the chosen point is good.
