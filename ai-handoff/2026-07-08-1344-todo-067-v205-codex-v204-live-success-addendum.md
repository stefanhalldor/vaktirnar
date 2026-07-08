# TODO-067 v205 - Codex addendum after live v203 success

Created: 2026-07-08 13:44
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Live-result addendum. No app code changed by Codex.

## New Localhost Result

Stebbi tested v203 on localhost with typed Google suggestions:

```txt
[PlaceSearch] selected (google): {
  name: 'Þorlákshöfn',
  placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4'
}

[routes/routes] placeId in request body: {
  origin: 'present (ChIJaTBIxpEM1kgRNmgF)',
  destination: 'present (ChIJU1N290hC1kgRypBJ)'
}

[weather/google] curated Þrengslavegur: distinct route added {
  distanceMeters: 56394,
  description: 'Þrengslavegur/Leið 39'
}

[weather/google] getRouteOptions diagnostics: {
  "originType": "placeId",
  "destType": "placeId",
  "routeCount": 2,
  "curatedAdded": true,
  "routes": [
    {
      "distanceMeters": 56394,
      "durationS": 3426,
      "labels": ["CURATED_VIA_THRENGSLAVEGUR"],
      "description": "Þrengslavegur/Leið 39"
    },
    {
      "distanceMeters": 67435,
      "durationS": 3516,
      "labels": ["DEFAULT_ROUTE"],
      "description": "Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427"
    }
  ]
}
```

## Conclusion

The v203 via-waypoint approach works for the original route-fidelity problem.

It produced a distinct Route 39 / Þrengslavegur route:

- Curated route: 56.394 km, 57 min, `Þrengslavegur/Leið 39`
- Default route: 67.435 km, 58 min, `Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427`

Compared with the default, the curated route is:

- about 11.0 km shorter,
- about 90 seconds faster in this traffic-aware calculation,
- on the expected corridor.

This is materially different from the failed `SHORTER_DISTANCE` result, which only produced another Route 427 variant.

## Findings

### Medium - The main route now works, but the label polish from v204 is confirmed

The route picker screenshot shows the curated Route 39 route as the first card labelled `Fljótlegasta leið`, with description `Þrengslavegur/Leið 39`.

That happens because the route is fastest and the UI checks `idx === 0` before checking `CURATED_VIA_THRENGSLAVEGUR`.

Before release, fix label precedence so the curated route is visibly marked as `Um Þrengslaveg` even when it is also fastest.

Recommended UI:

- Primary label: `Um Þrengslaveg`
- Secondary note/badge if desired: `Fljótlegasta leið`
- Keep description: `Þrengslavegur/Leið 39`

This avoids hiding the curated nature of the route while still making the fastest route obvious.

### Medium - Final submit still needs live confirmation

The route picker API now returns the right route. The next required check is selecting the Route 39/curated option and continuing through the wizard.

Expected:

- no `Valin leið fannst ekki`,
- final result uses the selected 56 km / Route 39-ish geometry,
- weather audit/map points follow the curated route.

If final submit fails, the likely issue is selected route id recomputation. But because v203 implemented the curated option inside `googleProvider.getRouteOptions()`, the structure should be correct.

### Low - Add one final-submit regression test before commit

Provider tests are good and type/test checks were green in v204. Before commit, add or confirm one API-level test for selected curated route survival:

- route picker returns a curated route id,
- final travel POST with that `selectedRouteId` can match it,
- no `selected_route_unavailable`.

This is a confidence test for the exact failure mode we have been guarding against.

## Recommended Next Prompt To Claude Code

```md
TODO-067 v205 result:

Stebbi tested v203 on localhost. The curated via-waypoint works:

- `curatedAdded: true`
- curated route: 56.394 km / 3426 s / `Þrengslavegur/Leið 39`
- default route: 67.435 km / 3516 s / `Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427`
- Place IDs were present end-to-end.

Please do a small polish/safety pass only:

1. Fix route-card label precedence:
   - if `labels` includes `CURATED_VIA_THRENGSLAVEGUR`, show `Um Þrengslaveg` even when it is first/fastest.
   - optionally show `Fljótlegasta leið` as secondary text/badge if it is also fastest.

2. Add/confirm final-submit regression coverage:
   - selected curated route id can be submitted without `selected_route_unavailable`.

3. Keep SHORTER_DISTANCE removed.
4. Do not touch SQL, RLS, Supabase, saved-place schema, deployment config, or unrelated UI.

After that, run `npm run type-check` and `npm run test:run`, then hand off for final Codex review.
```

## Localhost checks for Stebbi

Before commit/release:

1. Select the first Route 39-looking option from the current route picker.
2. Continue through the wizard with `Nóta þessa leið`.
3. Confirm no `Valin leið fannst ekki` error.
4. Confirm the final weather/map result uses the curated Route 39 path.
5. After Claude Code fixes the label, repeat `Garðabær -> Þorlákshöfn` and confirm the first card is visibly labelled `Um Þrengslaveg` or otherwise clearly marked as the Þrengslavegur route.
6. Regression checks:
   - `Þorlákshöfn -> Garðabær`: unchanged.
   - `Garðabær -> Selfoss`: no `Um Þrengslaveg`.
   - `Garðabær -> Akureyri`: no `Um Þrengslaveg`.
   - `Keflavík -> Þorlákshöfn`: no `Um Þrengslaveg`.
   - `Grindavík -> Þorlákshöfn`: no `Um Þrengslaveg`.
   - saved/recent `Garðabær -> Þorlákshöfn`: curated option still appears via coordinate bounds.

Do not test production, run migrations, or modify Supabase data.

## Files changed by Codex

- Added this addendum file only.

## Tests run

- Not run for this addendum. v204 already ran:
  - `npm run type-check` exit 0
  - `npm run test:run` exit 0, 58 files, 1894 passed

## Uncertainty / needs confirmation

The via coordinate is now validated for `Garðabær -> Þorlákshöfn` on localhost. Remaining uncertainty is final-submit behavior and the trigger behavior for the listed regression routes.
